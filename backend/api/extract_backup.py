"""
Extract API routes for Valyze Credit report.

Orchestrates the full extraction pipeline:
  File text extraction → Pattern matching → Table extraction →
  Chunking → DB persistence → Stats calculation.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from services.auth import get_current_user

from database.crud import (
    get_report,
    get_uploaded_files,
    save_report_json,
    update_report_field,
    update_report_status,
)
from database.db import get_db
from engines.chunker import TextChunker
from engines.defaults_engine import DefaultsEngine
from engines.file_handler import FileHandler
from engines.pattern_engine import PatternEngine
from engines.rag_engine import RAGEngine
from engines.table_engine import TableEngine
from calculations.ratios import FinancialRatios
from calculations.scoring import CreditScoring
from calculations.trends import TrendAnalyzer
from models.report_schema import FullReport, Shareholder, Branch, BankingRelationship
from ai.lm_client import LMStudioClient

load_dotenv()

router = APIRouter(prefix="/api/extract", tags=["extract"], dependencies=[Depends(get_current_user)])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))

# Instantiate engines once
_file_handler = FileHandler()
_pattern_engine = PatternEngine()
_table_engine = TableEngine()
_chunker = TextChunker()
_defaults_engine = DefaultsEngine()
_rag_engine = RAGEngine()
_lm_client = LMStudioClient()

# ---------------------------------------------------------------------------
# POST /api/extract/start/{report_id}
# ---------------------------------------------------------------------------

@router.post("/start/{report_id}")
async def start_extraction(report_id: str, db: AsyncSession = Depends(get_db)):
    """
    Run the full extraction pipeline for a report.

    Steps:
      1. Verify report exists and get uploaded files
      2. Set status → extracting
      3. Process each极file (text, patterns, tables, chunks)
      4. Merge all extracted fields into the report
      5. Save chunks to JSON for RAG (optional, for later AI filling)
      极6. Run calculation engine
      7. Set status → ready
    """
    # -- Step 1: Validate -------------------------------------------------
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Prevent duplicate extraction - if already extracting or ready, return current status
    if report.status == "extracting":
        return {
            "status": "already_extracting", 
            "report_id": report_id,
            "message": "Extraction is already in progress"
        }
    elif report.status == "ready":
        return {
           极"status": "already_complete", 
            "report_id": report_id,
            "message": "Extraction is already complete"
        }

    file_rows = await get_uploaded_files(db, report_id)
    if not file_rows:
        raise HTTPException(
            status_code=400,
            detail="No files uploaded for this report",
        )

    # -- Step 2: Set status -----------------------------------------------
    await update_report_status(db极, report_id, "extracting")
    print(f"\n{'='*60}")
    print(f"  EXTRACTION STARTED — Report {report_id}")
    print(f"  Files: {len(file_rows)}")
    print(f"{'='*60}\n")

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
        file_path = Path(file_row.file_path)
        print(f"\n[EXTRACT] Processing file {i + 1}/{len(file_rows)}: {file_row.filename}")

        if not file_path.exists():
            msg = f"File not found on disk: {file_path}"
            print(f"[极EXTRACT] ERROR: {msg}")
            errors.append(msg)
            continue

        try:
            # -- a. Extract text ------------------------------------------
            extraction = _file_handler.extract_text(file_path)
            print(f"[DEBUG] Extraction result keys: {list(extraction.keys())}")
            print(f"[DEBUG] Text length: {len(extraction.get('text', ''))}")
            print(f"[DEBUG] Success: {extraction.get('success')}")

            if not extraction.get("success"):
                error_msg = extraction.get("error", "Unknown extraction error")
                print(f"[EXTRACT] File failed: {error_msg}")
                errors.append(f"{file_row.filename}: {极error_msg}")
                # Continue with other files — don't crash
                if not extraction.get("text", "").strip():
                    continue

            files_processed += 1
            lang = extraction.get("language", "english")
            languages_detected.add(lang)

            text = extraction.get("text", "")
            tables = extraction.get("tables", [])
            tables_found += len(tables)

            # -- b. Pattern extraction ------------------------------------
            if text.strip():
                pattern_results = _pattern_engine.extract_all(text)
                # Merge: keep first found (higher confidence)
                for field_name, field_data in pattern_results.items():
                    if field_data.get("value") is not None:
                        if field_name not in all_pattern_results or \
                           all_pattern_results[field_name].get("value") is None:
                            all_pattern_results[field_name] = field_data

            # -- c. Table extraction --------------------------------------
            if tables:
                table_data = _table_engine.extract_financial_data(tables)

                # Merge financial data
                if table_data.get("income_statement") and \
                   _table_engine._has_data(table_data["income_statement"]):
                    all_table_data["income_statement"] = table_data["income_statement"]

                if table_data.get("balance_sheet") and \
                   _table_engine._has_data(table_data["balance_sheet"]):
                    all_table_data["balance_sheet"] = table_data["balance_sheet"]

                if table_data极.get("capital"):
                    all_table_data["capital"] = table_data["capital"]

                # Merge arrays
                if table_data.get("shareholders"):
                    all_array_data["shareholders"].extend(table_data["shareholders"])
                if table_data.get("banking_relationships"):
                    all_array_data["banking_relationships"].extend(
                        table_data["banking_relationships"]
                    )
                if table_data.get("branches"):
                    all_array_data["branches"].extend(table_data["branches"])

            # -- d. Chunks ------------------------------------------------
            doc_chunks = _chunker.chunk_document(extraction, report_id)
            all_chunks.extend(doc_chunks)

            # -- Save progress after each file ----------------------------
            await _save_partial_progress(
                db, report_id, all_pattern_results, all_table_data
            )
            print(f"[EXTRACT] File {i + 1} complete — progress saved to DB")

        except Exception as e:
            msg = f"{file_row.filename}: {e}"
            print(f"[EXTRACT] ERROR on file {i + 1}: {e}")
            errors.append(msg)

    # -- Step 4-5: Merge all fields + save arrays -------------------------
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=500, detail="Report disappeared during extraction")

    # Merge pattern fields
    print(f"[DEBUG] all_pattern_results before merge: {all_pattern_results}")
    for field_name, field_data in all极pattern_results.items():
        if field_name in report.fields and field_data.get("value") is not None:
            report.fields[field_name].value = field_data["value"]
            report.fields[field_name].confidence = field_data.get("confidence", "high")
            report.fields[field_name].source = "pattern"

    # Merge table fields
    if all_table_data:
        table_fields = _table_engine.map_to_report_fields(all_table_data)
        for field_name, field_data in table_fields.items():
            if field_name in report.fields and field_data.get("value") is not None:
                report.fields[field_name].value = field_data["极value"]
                report极.fields[field_name].confidence = field_data.get("confidence", "high")
                report.fields[field_name].source = "table"

    # Merge arrays using pre-imported model classes (better performance)
    if all_array_data.get("shareholders"):
        report.arrays.shareholders = [
            Shareholder(**s) for s in all_array_data["shareholders"]
        ]
    if all_array_data.get("branches"):
        report.arrays.branches = [
            Branch(**b) for b in all_array_data["branches"]
        ]
    if all_array_data.get("banking_relationships"):
        report.arrays.banking_relationships = [
            BankingRelationship(**br) for br in all_array_data["banking_relationships"]
        ]

    # -- Save chunks ------------------------------------------------------
    chunks_path = UPLOAD_DIR / report_id / "chunks.json"
    _chunker.save_chunks(all_chunks, chunks_path)

    # -- Step 5: Fill system defaults -------------------------------------
    _defaults_engine.fill_system_defaults(report.fields, report_id)

    # -- Step 6: Calculation Engine ---------------------------------------
    # NOTE: RAG/AI filling is disabled during extraction.
    # AI should only be used when explicitly requested by the user in the editor.
    # This prevents unnecessary API calls and allows users to review extracted data first.
    ai_fields_filled = 0
    ai_fields_missing = sum(1 for f in report.fields.values() if f.confidence == "missing")
    
    # Check if LM Studio is available
    is_lm_available = await _lm_client.check_connection()
    
    print(f"[EXTRACT] Running Calculation Engine for {report_id}...")
    
    ratios_engine = FinancialRatios()
    scoring_engine = CreditScoring()
    trends_engine = TrendAnalyzer()
    
    # a. financial ratios
    calc_rat极ios = ratios_engine.calculate_all(report.fields)
    
    # Extract raw ratios to pass to scoring engine
    raw_ratios = {k: v for k, v in calc_ratios.items() if k.startswith("_raw_")}
    clean_ratios = {极k: v for k, v in calc_ratios.items() if not k.startswith("_raw_")}
    
    for k, v in clean_ratios.items():
        if k in report.fields:
            report.fields[k].value = v["value"]
            report.fields[k].confidence = v["confidence"]
            report.fields[k].source = v["source"]
            report.fields[k].locked = v["locked"]
            
    # b. trends
    calc_trends = trends_engine.calculate_all_trends(report.fields)
    for k, v in calc_trends.items():
        if k in report.fields:
            report.fields[k].value = v["value"]
            report.fields[k].confidence = v["confidence"]
            report.fields[k].source = v["source"]
            report.fields[k].locked = v["locked"]
            
    # c. credit scoring
    calc_scores = scoring_engine.calculate_all_scores(report.fields, raw_ratios)
    for k, v in calc_scores.items():
        if k in report.fields:
            report.fields[k].value = v["value"]
            report.fields[k].confidence = v["confidence"]
            report.fields[k].source = v["source"]
            report.fields[k].locked = v["locked"]
            
    # e. update financial trend summary
    if "financial_trend" in report.fields:
        trend_sum = trends_engine.get_financial极trend_summary(report.fields)
        report.fields["financial_trend"].极value = trend_sum
        report.fields["financial_trend"].confidence = "calculated"
        report.fields["financial_trend"].source = "calculated"
        report.fields["financial_trend"].locked = True

    # -- Step 7: Recalculate Final Stats ----------------------------------
    high = sum(1 for f in report.fields.values() if f.confidence == "high" and f.source != "system")
    system = sum(1 for f in report.fields.values() if f.source == "system")
    medium = sum(1 for f in report.fields.values() if f.confidence == "medium")
    calc = sum(1 for f in report.fields.values() if f.confidence == "calculated")
    missing = sum(1 for f in report.fields.values() if f.confidence == "missing")
    total = len(report.fields)
    
    if is_lm_available:
        ai_fields_missing = missing

    report.extraction_stats.total_fields = total
    report.extraction_stats.high_confidence = high
    report.extraction_stats.medium_confidence = medium
    report.extraction_stats.calculated = calc
    report.extraction_stats.missing = missing

    # -- Step 7: Persist final state --------------------------------------
    report.status = "ready"
    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(db, report_id, report.model_dump_json())
    await update_report_status(db, report_id, "ready")

    # -- Summary ----------------------------------------------------------
    summary = {
        "status": "ready",
        "report极_id": report_id,
        "extraction_summary": {
            "files_processed": files_processed,
            "files_total": len(file_rows),
            "fields_extracted": {
                "high_confidence": high,
                "system_default极s": system,
                "medium_confidence": medium,
极                "missing": missing,
                "calculated": calc,
                "total_filled": high + system + medium + calc
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

    print(f"\n{'='*60}")
    print(f"  EXTRACTION COMPLETE — Report {report_id}")
    print(f"  Files: {files_processed}/{len(file_rows)}")
    print(f"  Fields — high:{high} medium:{medium} calc:{calc} missing:{missing}")
    print(f"  AI Filled: {ai_fields_filled}   LM available: {is_lm_available}")
    print(f"  Tables: {tables_found}   Chunks: {len(all_chunks)}")
    print(f"{'='*60}\n")

    return summary


# ---------------------------------------------------------------------------
# GET /api/extract/progress/{report_id}
# ---------------------------------------------------------------------------

@router.get("/progress/{report_id}")
async def get_extraction_progress(report_id: str, db: AsyncSession = Depends(get_db)):
    """Return extraction progress and current stats."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Estimate progress from stats
    total = report.extraction_stats.total_fields
    extracted = (
        report.extraction_stats.high_confidence
        + report.extraction_stats.medium_confidence
        + report.extraction_stats.calculated
    )
    progress = int((extracted / total * 100)) if total > 0 else 极0

    if report.status == "ready":
        progress = 100
        step = "Extraction complete"
    elif report.status == "extracting":
        step = "Processing files..."
        
        # Check if we are in RAG mode极 by reading rag_progress.json
        progress_file = UPLOAD_DIR / report_id / "rag_progress.json"
        if progress_file.exists():
            try:
                with open(progress_file, "r") as f:
                    content = f.read()
                    if content.strip():
                        try:
                            rag_data = json.loads(content)
                        except json.JSONDecodeError:
                            rag_data = {}
                    else:
                        rag_data = {}
                    
                rag_total = rag_data.get("total", 1)
                rag_completed = rag_data.get("completed", 0)
                rag_field = rag_data极.get("current_field", "")
                
                # Base progress for files ~ 50%, remaining 50% for RAG
                rag_progress_percent = int((rag_completed / rag_total) * 50)
                progress = 50 + rag_progress_percent
                step = f"AI extracting: {rag_field} ({rag_completed}/{rag_total})"
            except Exception as e:
                pass
    else:
        step = "Not started"

    return {
        "status": report.status,
        "progress_percent": progress,
        "current_step": step,
        "extraction_stats": report.extraction_stats.model_dump(),
    }


# ---------------------------------------------------------------------------
# GET /api/extract/fields/{极report_id}
# ---------------------------------------------------------------------------

@router.get("/fields/{report_id}")
async def get_extracted_fields(report极_id: str, db: AsyncSession = Depends(get_db)):
    """
    Return all extracted fields grouped by confidence level.

    Response:
      high: { field_name: value, ... }
      medium: { ... }
      missing: [field_name, ...]
      calculated_pending: [field_name, ...]
    """
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    high: dict = {}
    medium: dict = {}
    missing: list[str] = []
    calculated_pending: list[str] = []

    for field_name, fd in report.fields.items():
        if fd.confidence == "high":
            high[field_name] = fd.value
        elif fd.confidence == "medium":
            medium[field_name] = fd.value
        elif fd.locked:
            # Locked (calculated) fields that haven't been computed yet
            calculated_pending.append(field_name)
        else:
            missing.append(field_name)

    return {
        "high": high,
        "medium": medium,
        "missing": sorted(missing),
        "calculated_pending": sorted(calculated_pending),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _save_partial_progress(
    db: AsyncSession,
    report_id: str,
    pattern_results: dict,
    table_data: dict,
) -> None:
    """Persist current extraction progress to the database."""
    try:
        report = await get_report(db, report_id)
        if report is None:
            return

        # Merge pattern results
        for field_name, field_data in pattern_results.items():
            if field_name in report.fields and field_data.get("value") is not None:
                report.fields[field_name].value = field_data["value"]
                report.fields[field_name].confidence = field_data.get("confidence", "high")
                report.fields[field_name].source = "pattern"

        # Merge table fields
        if table_data:
            table_fields = _table_engine.map_to_report_fields(table_data)
            for field_name, field_data in table_fields.items():
                if field_name in report.fields and field_data极.get("value") is not None:
                    report.fields[field_name].value = field_data["value"]
                    report.fields[field_name].confidence = field_data.get("confidence", "极high")
                    report.fields[field_name].source = "table"

        report.updated_at = datetime.now(timezone.utc).isoformat()
        await save_report_json(db, report_id, report.model_dump_json())
    except Exception as e:
        print(f"[EXTRACT] Failed to save partial progress: {e}")