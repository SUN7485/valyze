"""
Extract API routes for Valyze Credit Report.

Orchestrates the full extraction pipeline:
  File text extraction → Pattern matching → Table extraction →
  Chunking → System defaults → RAG/AI filling → Calculations →
  DB persistence → Stats calculation.
"""

from __future__ import annotations

import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException

from services.auth import get_current_user

from database.crud import (
    get_report,
    get_uploaded_files,
    save_report_json,
    update_report_status,
)
from engines.chunker import TextChunker
from engines.defaults_engine import DefaultsEngine
from engines.file_handler import FileHandler
from engines.pattern_engine import PatternEngine
from engines.rag_engine import RAGEngine
from engines.table_engine import TableEngine
from calculations.ratios import FinancialRatios
from calculations.scoring import CreditScoring
from calculations.trends import TrendAnalyzer
from models.report_schema import (
    FullReport,
    Shareholder,
    Branch,
    BankingRelationship,
)
from ai.lm_client import LMStudioClient
from ai.field_extractor import AIFieldExtractor
from ai.narratives import NarrativeGenerator

load_dotenv()

router = APIRouter(
    prefix="/api/extract", tags=["extract"], dependencies=[Depends(get_current_user)]
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))

# -- Instantiate engines once (singleton per process) ----------------------
_file_handler = FileHandler()
_pattern_engine = PatternEngine()
_table_engine = TableEngine()
_chunker = TextChunker()
_defaults_engine = DefaultsEngine()
_rag_engine = RAGEngine()
_lm_client = LMStudioClient()
_ai_extractor = AIFieldExtractor(_lm_client)


# ==========================================================================
# Helper utilities
# ==========================================================================


def _safe_float(value) -> float | None:
    """Convert a field value to float, return None on failure."""
    if value is None:
        return None
    try:
        cleaned = str(value).replace(",", "").replace(" ", "").strip()
        if not cleaned:
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _deduplicate_dicts(items: list[dict], key_field: str) -> list[dict]:
    """Remove duplicate dicts from a list based on a key field."""
    seen = set()
    result = []
    for item in items:
        if not isinstance(item, dict):
            continue
        key = str(item.get(key_field, "")).strip().lower()
        if key and key not in seen:
            seen.add(key)
            result.append(item)
        elif not key:
            # Keep items without a key (let user clean up)
            result.append(item)
    return result


def _merge_field(report, field_name: str, value, confidence: str, source: str):
    """
    Safely merge a single field into the report.
    Never overwrites user-edited, calculated, or easy_way_import fields.
    """
    if field_name not in report.fields:
        return
    existing = report.fields[field_name]
    # Never overwrite fields from Easy Way Import
    if existing.source == "easy_way_import":
        return
    # Never overwrite user edits or calculated values
    if existing.confidence in ("user",) or existing.source == "user":
        return
    if existing.confidence == "calculated":
        return
    # Only overwrite if new value is not None
    if value is not None:
        existing.value = value
        existing.confidence = confidence
        existing.source = source


def _count_fields(report) -> dict:
    """Count fields by confidence level."""
    counts = {
        "high": 0,
        "system": 0,
        "medium": 0,
        "calculated": 0,
        "missing": 0,
        "user": 0,
        "total": len(report.fields),
    }
    for f in report.fields.values():
        if f.source == "user":
            counts["user"] += 1
        elif f.source == "system":
            counts["system"] += 1
        elif f.confidence == "high":
            counts["high"] += 1
        elif f.confidence == "medium":
            counts["medium"] += 1
        elif f.confidence == "calculated":
            counts["calculated"] += 1
        else:
            counts["missing"] += 1
    counts["total_filled"] = (
        counts["high"]
        + counts["system"]
        + counts["medium"]
        + counts["calculated"]
        + counts["user"]
    )
    return counts


def _map_ai_field_to_report(ai_key: str) -> str:
    """Map AI-extracted field names to report field names."""
    field_map = {
        "company_name": "company_name",
        "trade_name": "trade_names",
        "cr_number": "cr_number",
        "unified_number": "unified_number",
        "company_type": "company_type",
        "country": "country",
        "city": "city",
        "address": "company_address",
        "phone": "phone",
        "fax": "fax",
        "email": "email",
        "website": "website",
        "issue_date": "issue_date",
        "expiry_date": "expiry_date",
        "capital": "capital",
        "industry": "industry",
        "activities": "core_activities_description",
        "employee_count": "employee_count",
        "auditor": "auditor_name",
        "parent_company": "parent_company",
        "primary_bank": "primary_bank",
        "payment_terms_customers": "customer_payment_terms",
        "payment_terms_suppliers": "supplier_payment_terms",
    }
    return field_map.get(ai_key)


# ==========================================================================
# POST /api/extract/start/{report_id}
# ==========================================================================


@router.post("/start/{report_id}")
async def start_extraction(
    report_id: str,
):
    """
    Run the full extraction pipeline for a report.

    Pipeline Steps:
      1. Validate report + uploaded files
      2. Set status → extracting
      3. Process each file (text → patterns → tables → chunks)
      4. Merge extracted fields + arrays into report
      5. Fill system defaults
      6. RAG / AI fill empty fields (if LM Studio available)
      7. Run calculation engine (ratios → trends → scoring)
      8. Persist final state, set status → ready
      9. Return extraction summary
    """

    # -- Step 1: Validate -------------------------------------------------
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.status == "extracting":
        # Check if extraction started recently (within last 5 seconds) to prevent rapid duplicate calls
        if hasattr(report, "updated_at") and report.updated_at:
            import time

            last_update = report.updated_at
            if isinstance(last_update, str):
                last_update = datetime.fromisoformat(last_update.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - last_update).total_seconds() < 5:
                return {
                    "status": "already_extracting",
                    "report_id": report_id,
                    "message": "Extraction is already in progress (recently started)",
                }
        return {
            "status": "already_extracting",
            "report_id": report_id,
            "message": "Extraction is already in progress",
        }

    file_rows = await get_uploaded_files(None, report_id)
    if not file_rows:
        raise HTTPException(
            status_code=400,
            detail="No files uploaded for this report",
        )

    # -- Step 2: Set status -----------------------------------------------
    await update_report_status(None, report_id, "extracting")
    print(f"\n{'=' * 60}")
    print(f"  EXTRACTION STARTED — Report {report_id}")
    print(f"  Files: {len(file_rows)}")
    print(f"{'=' * 60}\n")

    # -- Step 3: Process each file ----------------------------------------
    all_pattern_results: dict = {}
    all_table_data: dict = {}
    all_array_data: dict = {
        "shareholders": [],
        "branches": [],
        "banking_relationships": [],
    }
    all_chunks: list[dict] = []
    tables_found = 0
    files_processed = 0
    languages_detected: set[str] = set()
    errors: list[str] = []

    for i, file_row in enumerate(file_rows):
        file_path = Path(file_row.get("file_path", ""))
        fname = file_row.get("filename", "")
        print(f"\n[EXTRACT] Processing file {i + 1}/{len(file_rows)}: {fname}")

        if not file_path.exists():
            msg = f"File not found on disk: {file_path}"
            print(f"[EXTRACT] ERROR: {msg}")
            errors.append(msg)
            continue

        try:
            # -- 3a. Extract text -----------------------------------------
            extraction = _file_handler.extract_text(file_path)
            text = extraction.get("text", "")
            tables = extraction.get("tables", [])
            success = extraction.get("success", False)

            print(
                f"[EXTRACT] Text: {len(text)} chars | "
                f"Tables: {len(tables)} | Success: {success}"
            )

            if not success:
                error_msg = extraction.get("error", "Unknown extraction error")
                print(f"[EXTRACT] File failed: {error_msg}")
                errors.append(f"{fname}: {error_msg}")
                if not text.strip():
                    continue  # Skip — no usable content

            files_processed += 1
            lang = extraction.get("language", "english")
            languages_detected.add(lang)
            tables_found += len(tables)

            # -- 3b. AI Field Extraction ----------------------------------
            ai_fields = {}
            try:
                print("[AI EXTRACT] Starting AI field extraction...")
                # Extract just the text content from chunks for the optimized extractor
                chunk_texts = [chunk["text"] for chunk in all_chunks]
                ai_fields = await _ai_extractor.extract_all_fields_optimized(
                    text, chunk_texts
                )

                # Save AI-extracted fields to report
                if ai_fields:
                    print(
                        f"[AI EXTRACT] {len([k for k, v in ai_fields.items() if v])} non-null fields extracted"
                    )
                    # Apply AI fields to pattern results
                    for ai_key, ai_value in ai_fields.items():
                        if ai_value is not None and ai_value != [] and ai_value != {}:
                            # Map AI financial data to table data
                            if ai_key == "_financial" and isinstance(ai_value, dict):
                                print(
                                    f"[AI FINANCIAL] Processing financial data from AI"
                                )
                                _merge_ai_financial_data(all_table_data, ai_value)
                                continue

                            # Map regular AI fields to report field names
                            field_name = _map_ai_field_to_report(ai_key)
                            if field_name and field_name not in all_pattern_results:
                                all_pattern_results[field_name] = {
                                    "value": ai_value,
                                    "confidence": "high",
                                    "source": "ai",
                                }
                                print(
                                    f"[AI MAP] {ai_key} → {field_name}: {str(ai_value)[:50]}"
                                )
            except Exception as e:
                print(f"[AI EXTRACT] Failed: {e}, continuing without AI extraction")
                ai_fields = {}

            # -- 3c. Pattern extraction -----------------------------------
            if text.strip():
                pattern_results = _pattern_engine.extract_all(text)
                for field_name, field_data in pattern_results.items():
                    if field_data.get("value") is not None:
                        # Keep first found value (higher confidence)
                        if (
                            field_name not in all_pattern_results
                            or all_pattern_results[field_name].get("value") is None
                        ):
                            all_pattern_results[field_name] = field_data
                            print(
                                f"[PATTERN] {field_name} = "
                                f"{str(field_data.get('value', ''))[:50]}"
                            )

            # -- 3c. Table extraction -------------------------------------
            if tables:
                table_data = _table_engine.extract_financial_data(tables)

                # Income statement
                inc = table_data.get("income_statement")
                if inc and _table_engine._has_data(inc):
                    all_table_data["income_statement"] = inc
                    print("[TABLE] Income statement extracted")

                # Balance sheet
                bs = table_data.get("balance_sheet")
                if bs and _table_engine._has_data(bs):
                    all_table_data["balance_sheet"] = bs
                    print("[TABLE] Balance sheet extracted")

                # Capital
                if table_data.get("capital"):
                    all_table_data["capital"] = table_data["capital"]
                    print(f"[TABLE] Capital: {table_data['capital']}")

                # Arrays from tables
                for arr_key in ("shareholders", "banking_relationships", "branches"):
                    arr_items = table_data.get(arr_key, [])
                    if arr_items:
                        all_array_data[arr_key] = arr_items
                        print(f"[TABLE] {arr_key}: {len(arr_items)} items")

                # Apply questionnaire fields if detected
                if "_questionnaire" in table_data:
                    from backend.engines.table_engine import apply_questionnaire_fields

                    questionnaire_data = table_data["_questionnaire"]
                    print(
                        f"[TABLE] Applying {len(questionnaire_data)} questionnaire fields"
                    )
                    all_array_data = apply_questionnaire_fields(
                        all_array_data, questionnaire_data
                    )

            # -- 3d. Create text chunks -----------------------------------
            doc_chunks = _chunker.chunk_document(extraction, report_id)
            all_chunks.extend(doc_chunks)
            print(f"[CHUNKS] {len(doc_chunks)} chunks from this file")

            # -- 3e. Save progress after each file -----------------------
            await _save_partial_progress(report_id, all_pattern_results, all_table_data)
            print(f"[EXTRACT] File {i + 1} done — progress saved")

        except Exception as exc:
            msg = f"{fname}: {exc}"
            print(f"[EXTRACT] ERROR on file {i + 1}: {exc}")
            traceback.print_exc()
            errors.append(msg)

    # -- Step 4: Final merge of all fields + arrays -----------------------
    print(f"\n[EXTRACT] Merging all extracted data...")
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(
            status_code=500,
            detail="Report disappeared during extraction",
        )

    # 4a. Merge pattern fields
    for field_name, field_data in all_pattern_results.items():
        val = field_data.get("value")
        conf = field_data.get("confidence", "high")
        _merge_field(report, field_name, val, conf, "pattern")

    # 4b. Merge table fields
    if all_table_data:
        table_fields = _table_engine.map_to_report_fields(all_table_data)
        for field_name, field_data in table_fields.items():
            val = field_data.get("value")
            conf = field_data.get("confidence", "high")
            _merge_field(report, field_name, val, conf, "table")

    # 4c. Merge arrays (deduplicated)
    if all_array_data.get("shareholders"):
        deduped = _deduplicate_dicts(all_array_data["shareholders"], "name")
        report.arrays.shareholders = [Shareholder(**s) for s in deduped]
        print(f"[MERGE] Shareholders: {len(report.arrays.shareholders)}")

    if all_array_data.get("branches"):
        deduped = _deduplicate_dicts(all_array_data["branches"], "branch_name")
        report.arrays.branches = [Branch(**b) for b in deduped]
        print(f"[MERGE] Branches: {len(report.arrays.branches)}")

    if all_array_data.get("banking_relationships"):
        deduped = _deduplicate_dicts(
            all_array_data["banking_relationships"], "bank_name"
        )
        report.arrays.banking_relationships = [
            BankingRelationship(**br) for br in deduped
        ]
        print(f"[MERGE] Banking: {len(report.arrays.banking_relationships)}")

    # -- Save chunks.json for RAG -----------------------------------------
    chunks_path = UPLOAD_DIR / report_id / "chunks.json"
    chunks_path.parent.mkdir(parents=True, exist_ok=True)
    _chunker.save_chunks(all_chunks, chunks_path)
    print(f"[CHUNKS] Saved {len(all_chunks)} total chunks → {chunks_path}")

    # -- Step 5: Fill system defaults -------------------------------------
    print(f"[DEFAULTS] Filling system defaults...")
    _defaults_engine.fill_system_defaults(report.fields, report_id)

    # Save checkpoint before AI step
    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(None, report_id, report.model_dump_json())

    # -- Step 6: RAG / AI fill empty fields -------------------------------
    print(f"[RAG] Checking LM Studio connection...")
    is_lm_available = await _lm_client.check_connection()
    ai_fields_filled = 0

    if is_lm_available:
        print(f"[RAG] LM Studio available — starting AI field filling")
        try:
            # 6a. Setup BM25 index from chunks
            rag_ready = await _rag_engine.setup_collection(report_id)

            if rag_ready:
                # 6b. Fill empty scalar fields
                updated_fields = await _rag_engine.fill_empty_fields(
                    report_id, report.fields
                )
                for field_name, field_data in updated_fields.items():
                    if field_name in report.fields:
                        val = None
                        conf = "missing"
                        src = "ai"

                        # Handle both dict and FieldData-like objects
                        if isinstance(field_data, dict):
                            val = field_data.get("value")
                            conf = field_data.get("confidence", "missing")
                            src = field_data.get("source", "ai")
                        elif hasattr(field_data, "value"):
                            val = field_data.value
                            conf = field_data.confidence
                            src = field_data.source

                        if val is not None and conf == "medium":
                            # Check if field came from Easy Way Import - don't overwrite
                            existing = report.fields.get(field_name)
                            if existing and existing.source == "easy_way_import":
                                print(
                                    f"[AI FILL] Skipping {field_name} - from Easy Way Import"
                                )
                            else:
                                report.fields[field_name].value = val
                                report.fields[field_name].confidence = "medium"
                                report.fields[field_name].source = "ai"
                                ai_fields_filled += 1

                # 6c. Fill empty array fields
                current_arrays = report.arrays.model_dump()
                updated_arrays = await _rag_engine.fill_array_fields(
                    report_id, current_arrays
                )
                if updated_arrays:
                    _merge_ai_arrays(report, updated_arrays)

                print(f"[RAG] AI filled {ai_fields_filled} fields")
            else:
                print("[RAG] BM25 index setup failed — skipping AI filling")

        except Exception as exc:
            print(f"[RAG] AI filling error (non-fatal): {exc}")
            traceback.print_exc()
    else:
        print("[RAG] LM Studio NOT available — skipping AI filling")

    # Save checkpoint after AI step
    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(None, report_id, report.model_dump_json())

    # -- Step 7: Calculation Engine (Bypassed) ----------------------------
    print(f"[CALC] Calculation engine bypassed (JSON-Only Architecture active)")
    # We skip ratios, scoring, and trends to trust the source JSON/AI extraction

    # -- Step 8: Final stats + persist ------------------------------------
    counts = _count_fields(report)

    report.extraction_stats.total_fields = counts["total"]
    report.extraction_stats.high_confidence = counts["high"]
    report.extraction_stats.medium_confidence = counts["medium"]
    report.extraction_stats.calculated = counts["calculated"]
    report.extraction_stats.missing = counts["missing"]

    report.status = "ready"
    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(None, report_id, report.model_dump_json())
    await update_report_status(None, report_id, "ready")

    # -- Step 9: Build response summary -----------------------------------
    summary = {
        "status": "ready",
        "report_id": report_id,
        "extraction_summary": {
            "files_processed": files_processed,
            "files_total": len(file_rows),
            "fields_extracted": {
                "high_confidence": counts["high"],
                "system_defaults": counts["system"],
                "medium_confidence": counts["medium"],
                "calculated": counts["calculated"],
                "missing": counts["missing"],
                "user": counts["user"],
                "total_filled": counts["total_filled"],
            },
            "tables_found": tables_found,
            "text_chunks": len(all_chunks),
            "languages_detected": sorted(languages_detected),
            "ai_filling": {
                "lm_studio_available": is_lm_available,
                "fields_filled_by_ai": ai_fields_filled,
                "fields_still_missing": ai_fields_missing,
            },
            "errors": errors,
        },
    }

    print(f"\n{'=' * 60}")
    print(f"  EXTRACTION COMPLETE — Report {report_id}")
    print(f"  Files: {files_processed}/{len(file_rows)}")
    print(
        f"  High: {counts['high']}  Medium: {counts['medium']}  "
        f"Calc: {counts['calculated']}  Missing: {counts['missing']}"
    )
    print(f"  System: {counts['system']}  User: {counts['user']}")
    print(f"  AI Filled: {ai_fields_filled}  LM Studio: {is_lm_available}")
    print(f"  Tables: {tables_found}  Chunks: {len(all_chunks)}")
    if errors:
        print(f"  Errors: {len(errors)}")
        for err in errors:
            print(f"    - {err[:80]}")
    print(f"{'=' * 60}\n")

    return summary


# ==========================================================================
# GET /api/extract/progress/{report_id}
# ==========================================================================


@router.get("/progress/{report_id}")
async def get_extraction_progress(
    report_id: str,
):
    """Return extraction progress for polling by the frontend."""
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if report.status == "ready":
        return {
            "status": "ready",
            "progress_percent": 100,
            "current_step": "Extraction complete",
            "extraction_stats": report.extraction_stats.model_dump(),
        }

    if report.status != "extracting":
        return {
            "status": report.status,
            "progress_percent": 0,
            "current_step": "Not started",
            "extraction_stats": report.extraction_stats.model_dump(),
        }

    # -- Estimate progress ------------------------------------------------
    # Base progress from field counts
    total = report.extraction_stats.total_fields or 1
    filled = (
        report.extraction_stats.high_confidence
        + report.extraction_stats.medium_confidence
        + report.extraction_stats.calculated
    )
    base_progress = int((filled / total) * 80)  # Cap at 80% for field counting
    step = "Processing files..."

    # Check for RAG progress file (written by rag_engine during AI filling)
    rag_progress_file = UPLOAD_DIR / report_id / "rag_progress.json"
    if rag_progress_file.exists():
        try:
            with open(rag_progress_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
            if content:
                rag_data = json.loads(content)
                rag_total = max(rag_data.get("total", 1), 1)
                rag_completed = rag_data.get("completed", 0)
                rag_field = rag_data.get("current_field", "")
                rag_status = rag_data.get("status", "running")

                # Files processing = 0-50%, RAG = 50-90%, Calculations = 90-100%
                rag_pct = int((rag_completed / rag_total) * 40)  # 40% of total
                base_progress = 50 + rag_pct
                step = f"AI filling: {rag_field} ({rag_completed}/{rag_total})"

                if rag_status == "complete":
                    base_progress = 90
                    step = "Running calculations..."
        except (json.JSONDecodeError, OSError, KeyError):
            pass  # Silently ignore malformed progress file

    progress = min(99, max(0, base_progress))  # Never show 100% while extracting

    return {
        "status": "extracting",
        "progress_percent": progress,
        "current_step": step,
        "extraction_stats": report.extraction_stats.model_dump(),
    }


# ==========================================================================
# GET /api/extract/fields/{report_id}
# ==========================================================================


@router.get("/fields/{report_id}")
async def get_extracted_fields(
    report_id: str,
):
    """
    Return all extracted fields grouped by confidence level.

    Useful for the frontend to show field breakdown before editing.
    """
    report = await get_report(None, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    high: dict = {}
    system: dict = {}
    medium: dict = {}
    user: dict = {}
    calculated: list[str] = []
    missing: list[str] = []

    for field_name, fd in report.fields.items():
        if fd.source == "user":
            user[field_name] = fd.value
        elif fd.source == "system":
            system[field_name] = fd.value
        elif fd.confidence == "calculated":
            calculated.append(field_name)
        elif fd.confidence == "high":
            high[field_name] = fd.value
        elif fd.confidence == "medium":
            medium[field_name] = fd.value
        else:
            missing.append(field_name)

    return {
        "user": user,
        "system": system,
        "high": high,
        "medium": medium,
        "calculated": sorted(calculated),
        "missing": sorted(missing),
        "summary": {
            "user_count": len(user),
            "system_count": len(system),
            "high_count": len(high),
            "medium_count": len(medium),
            "calculated_count": len(calculated),
            "missing_count": len(missing),
            "total": len(report.fields),
        },
    }


# ==========================================================================
# Internal helpers
# ==========================================================================


def _merge_ai_financial_data(all_table_data: dict, ai_financial: dict) -> None:
    """
    Merge AI-extracted financial data into table data structure.
    Only fills missing financial data.
    """
    try:
        # Income statement
        if "income_statement" in ai_financial and not all_table_data.get(
            "income_statement"
        ):
            all_table_data["income_statement"] = ai_financial["income_statement"]
            print(f"[AI FINANCIAL] Added income statement data")

        # Balance sheet
        if "balance_sheet" in ai_financial and not all_table_data.get("balance_sheet"):
            all_table_data["balance_sheet"] = ai_financial["balance_sheet"]
            print(f"[AI FINANCIAL] Added balance sheet data")

        # Individual financial fields
        for key in ["revenue", "net_profit", "total_assets", "equity"]:
            if key in ai_financial and not all_table_data.get(key):
                all_table_data[key] = ai_financial[key]
                print(f"[AI FINANCIAL] Added {key}: {ai_financial[key]}")

    except Exception as exc:
        print(f"[AI FINANCIAL] Merge error: {exc}")


def _merge_ai_arrays(report, updated_arrays: dict) -> None:
    """
    Merge AI-generated array data into the report.
    Only fills arrays that are currently empty.
    """
    try:
        # Shareholders
        if updated_arrays.get("shareholders") and not report.arrays.shareholders:
            items = updated_arrays["shareholders"]
            if isinstance(items, list) and len(items) > 0:
                report.arrays.shareholders = [
                    Shareholder(**s) if isinstance(s, dict) else s for s in items
                ]
                print(f"[RAG] Filled shareholders: {len(items)} items")

        # Branches
        if updated_arrays.get("branches") and not report.arrays.branches:
            items = updated_arrays["branches"]
            if isinstance(items, list) and len(items) > 0:
                report.arrays.branches = [
                    Branch(**b) if isinstance(b, dict) else b for b in items
                ]
                print(f"[RAG] Filled branches: {len(items)} items")

        # Banking relationships
        if (
            updated_arrays.get("banking_relationships")
            and not report.arrays.banking_relationships
        ):
            items = updated_arrays["banking_relationships"]
            if isinstance(items, list) and len(items) > 0:
                report.arrays.banking_relationships = [
                    BankingRelationship(**br) if isinstance(br, dict) else br
                    for br in items
                ]
                print(f"[RAG] Filled banking: {len(items)} items")

        # Regional affiliates (simple list)
        if (
            updated_arrays.get("regional_affiliates")
            and not report.arrays.regional_affiliates
        ):
            items = updated_arrays["regional_affiliates"]
            if isinstance(items, list):
                report.arrays.regional_affiliates = items
                print(f"[RAG] Filled affiliates: {len(items)} items")

    except Exception as exc:
        print(f"[RAG] Array merge error (non-fatal): {exc}")


async def _save_partial_progress(
    report_id: str,
    pattern_results: dict,
    table_data: dict,
) -> None:
    """
    Persist current extraction progress to the database after each file.
    This ensures no work is lost if a later file crashes.
    """
    try:
        report = await get_report(None, report_id)
        if report is None:
            return

        # Merge pattern results (respect existing higher-confidence values)
        for field_name, field_data in pattern_results.items():
            val = field_data.get("value")
            conf = field_data.get("confidence", "high")
            _merge_field(report, field_name, val, conf, "pattern")

        # Merge table fields
        if table_data:
            table_fields = _table_engine.map_to_report_fields(table_data)
            for field_name, field_data in table_fields.items():
                val = field_data.get("value")
                conf = field_data.get("confidence", "high")
                _merge_field(report, field_name, val, conf, "table")

        # Update timestamp and save
        report.updated_at = datetime.now(timezone.utc).isoformat()
        await save_report_json(None, report_id, report.model_dump_json())

    except Exception as exc:
        print(f"[EXTRACT] Partial save failed for {report_id}: {exc}")
