"""
Report API routes for Valyze Credit report.

================================================================
SINGLE SOURCE OF TRUTH. NO AUTO-RECALCULATION. EVER.
================================================================
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Path as PathParam

from api.auth import get_current_user, require_admin
from database.crud import (
    delete_report as crud_delete_report,
    get_all_reports,
    get_report,
    mutate_report,
    update_report_array,
    update_report_field,
    update_report_fields_bulk,
)
from database.exceptions import (
    FieldLockedError,
    InvalidArrayDataError,
    InvalidReportDataError,
    ReportConflictError,
    UnknownFieldError,
)
from models.field_meta import ARRAY_FIELDS, is_known_field
from models.report_schema import (
    FieldData,
    FullReport,
    UpdateArrayRequest,
    UpdateFieldRequest,
    UpdateFieldsBulkRequest,
)
from services.report_queries import (
    REPORT_ID_PATTERN,
    ReportLinkedError,
    get_order_companies_for_report,
)

# All endpoints require authentication
router = APIRouter(prefix="/api/report", tags=["report"])


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------


def get_currency(country: str) -> tuple[str, str]:
    currency_map = {
        "United Arab Emirates": ("AED", "AED"),
        "UAE": ("AED", "AED"),
        "Saudi Arabia": ("SAR", "SAR"),
        "KSA": ("SAR", "SAR"),
        "Kuwait": ("KWD", "KWD"),
        "Qatar": ("QAR", "QAR"),
        "Bahrain": ("BHD", "BHD"),
        "Oman": ("OMR", "OMR"),
        "Egypt": ("EGP", "EGP"),
        "Jordan": ("JOD", "JOD"),
    }
    for key, (code, symbol) in currency_map.items():
        if key.lower() in country.lower():
            return code, symbol
    return "USD", "USD"


def force_write(report: FullReport, key: str, value: Any):
    """
    Force-write a value to a report field, unconditionally.
    Bypasses any locked status. Sets source=easy_way_import.
    """
    if value is None:
        return

    existing = report.fields.get(key)
    if existing is not None:
        if hasattr(existing, "value"):
            existing.value = value
            existing.confidence = "high"
            existing.source = "easy_way_import"
            existing.locked = False
        elif isinstance(existing, dict):
            existing["value"] = value
            existing["confidence"] = "high"
            existing["source"] = "easy_way_import"
            existing["locked"] = False
    else:
        report.fields[key] = FieldData(
            value=value,
            confidence="high",
            source="easy_way_import",
            locked=False,
        )


def _as_dict(value: Any) -> Dict[str, Any]:
    """An import section, or {} when it is missing or not an object."""
    return value if isinstance(value, dict) else {}


def _scalar_text(value: Any) -> str:
    """Text of a scalar or FieldData-style {"value": ...} import value."""
    if isinstance(value, dict):
        value = value.get("value")
    if value is None or isinstance(value, (dict, list)):
        return ""
    return str(value).strip()


def _swot_text(item: Any) -> str:
    """A SWOT entry as text. Object items ({"point": ..., "detail": ...})
    are reduced to their main text instead of crashing the de-duplication."""
    if isinstance(item, dict):
        for key in ("text", "point", "title", "item", "description", "value", "detail"):
            if isinstance(item.get(key), str) and item[key].strip():
                return item[key].strip()
        parts = [str(v).strip() for v in item.values() if isinstance(v, (str, int, float))]
        return " - ".join(p for p in parts if p)
    if item is None or isinstance(item, list):
        return ""
    return str(item).strip()


def pick(*args):
    """Return the first non-None, non-empty value from args."""
    for v in args:
        if v is not None and v != "":
            return v
    return None


# Report statuses the app writes or reads (backend + frontend). The status
# endpoint only accepts these, so a typo can't strand a report in a state no
# list, KPI or workflow step recognises.
REPORT_STATUSES = frozenset(
    {
        "uploading",
        "extracting",
        "ready",
        "editing",
        "in_progress",
        "generating",
        "done",
        "complete",
        "completed",
        "delivered",
    }
)


def _require_valid_id(report_id: str) -> None:
    if not REPORT_ID_PATTERN.match(report_id or ""):
        raise HTTPException(status_code=400, detail="Invalid report_id format")


def _conflict(current_updated_at) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={
            "error": "conflict",
            "message": "Report was modified by another user. Please reload and reapply your changes.",
            "current_updated_at": current_updated_at,
        },
    )


def _invalid_data() -> HTTPException:
    return HTTPException(
        status_code=422,
        detail="Report data is empty or invalid and cannot be opened. It can still be deleted.",
    )


async def _load_report(report_id: str) -> FullReport:
    """Validated read for API handlers: 400 bad id, 404 missing, 422 invalid JSON."""
    _require_valid_id(report_id)
    try:
        report = await get_report(None, report_id, strict=True)
    except InvalidReportDataError:
        raise _invalid_data()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


async def _run_edit(coro):
    """Await a crud edit and map its domain errors onto HTTP responses."""
    try:
        updated = await coro
    except ReportConflictError as e:
        raise _conflict(e.current_updated_at)
    except UnknownFieldError as e:
        raise HTTPException(
            status_code=400, detail=f"Unknown field(s): {', '.join(e.names)}"
        )
    except FieldLockedError as e:
        raise HTTPException(status_code=400, detail=f"Field '{e.name}' is locked")
    except InvalidArrayDataError as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid items for array '{e.args[0]}'"
        )
    except InvalidReportDataError:
        raise _invalid_data()
    except Exception as e:
        print(f"[REPORT] Edit failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save the report")
    if updated is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return updated


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------


@router.get("/", response_model=List[dict])
async def list_reports():
    try:
        reports = await get_all_reports(None)
        return reports
    except Exception as e:
        print(f"[REPORT] Failed to list reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to list reports")


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------


@router.get("/{report_id}")
async def get_report_detail(
    report_id: str = PathParam(..., description="Report unique identifier"),
):
    report = await _load_report(report_id)
    return report.model_dump()


# ---------------------------------------------------------------------------
# PATCH single field
# ---------------------------------------------------------------------------
# Every edit is an atomic compare-and-set on report_json.updated_at. When the
# client sends last_known_updated_at and the report has moved on (before or
# during the write), the edit is refused with 409. Every success returns the
# new top-level updated_at for the client's next edit.


@router.patch("/{report_id}/field")
async def update_single_field(
    report_id: str,
    body: UpdateFieldRequest,
):
    _require_valid_id(report_id)
    updated = await _run_edit(
        update_report_field(
            None,
            report_id,
            body.field_name,
            body.value,
            confidence="high",
            source=body.source,
            expected_updated_at=body.last_known_updated_at,
            respect_lock=True,
        )
    )
    return {
        "field_name": body.field_name,
        "value": body.value,
        "source": body.source,
        "updated_at": updated.updated_at,
    }


# ---------------------------------------------------------------------------
# PATCH bulk fields
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/fields")
async def update_fields_bulk(
    report_id: str,
    body: UpdateFieldsBulkRequest,
):
    _require_valid_id(report_id)
    # All-or-nothing: an unknown name rejects the whole request (400), so every
    # key reported back below was actually applied.
    updated = await _run_edit(
        update_report_fields_bulk(
            None,
            report_id,
            body.fields,
            expected_updated_at=body.last_known_updated_at,
        )
    )
    applied = [k for k in body.fields if k in updated.fields]
    return {
        "updated_count": len(applied),
        "fields": applied,
        "updated_at": updated.updated_at,
    }


# ---------------------------------------------------------------------------
# PATCH array
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/array")
async def update_array(
    report_id: str,
    body: UpdateArrayRequest,
):
    _require_valid_id(report_id)
    if body.array_name not in ARRAY_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown array '{body.array_name}'. "
            f"Valid: {', '.join(ARRAY_FIELDS)}",
        )

    updated = await _run_edit(
        update_report_array(
            None,
            report_id,
            body.array_name,
            body.data,
            expected_updated_at=body.last_known_updated_at,
        )
    )
    return {
        "array_name": body.array_name,
        "items_count": len(body.data),
        "updated_at": updated.updated_at,
    }


# ---------------------------------------------------------------------------
# RECALCULATE  — intentionally disabled
# ---------------------------------------------------------------------------


@router.post("/{report_id}/recalculate")
async def recalculate_report_financials(
    report_id: str,
):
    """
    RECALCULATION IS INTENTIONALLY DISABLED.
    The imported JSON is the SINGLE SOURCE OF TRUTH.
    This endpoint exists for API compatibility but does NOTHING.
    """
    report = await _load_report(report_id)

    def gfv(name):
        f = report.fields.get(name)
        return getattr(f, "value", None) if f else None

    return {
        "success": True,
        "message": "Recalculation is disabled. JSON values are preserved.",
        "recalculated": False,
        "fields_updated": 0,
        "key_metrics": {
            "credit_rating": gfv("credit_rating"),
            "health_score": gfv("health_score"),
            "risk_level": gfv("risk_level"),
            "current_ratio": gfv("current_ratio"),
            "net_margin": gfv("net_margin"),
            "recommended_limit": gfv("recommended_limit"),
        },
    }


# ---------------------------------------------------------------------------
# STATS
# ---------------------------------------------------------------------------


@router.get("/{report_id}/stats")
async def get_stats(report_id: str):
    report = await _load_report(report_id)
    return report.extraction_stats.model_dump()


# ---------------------------------------------------------------------------
# EASY WAY IMPORT
# ---------------------------------------------------------------------------


@router.post("/{report_id}/easy-way")
async def easy_way_import(
    report_id: str,
    data: dict,
):
    """
    Import complete JSON — JSON is the FINAL WORD.
    No recalculation. No auto-triggers. What comes in is final.
    """
    _require_valid_id(report_id)
    print(f"[EASY WAY] Import for {report_id}: {len(data or {})} top-level keys")

    # -- Top-level sections ------------------------------------------------
    financial_data = _as_dict(data.get("financial_data"))
    swot_analysis = _as_dict(data.get("swot_analysis"))
    news_and_events = _as_dict(data.get("news_and_events"))
    ci = _as_dict(data.get("company_identity"))
    os_ = _as_dict(data.get("ownership_structure"))
    fr = _as_dict(data.get("financial_ratios"))
    ta = _as_dict(data.get("trend_analysis"))
    op = _as_dict(
        data.get("operational_profile")
        or data.get("operations")
        or data.get("operational_details")
    )
    ia = _as_dict(data.get("industry_analysis"))
    cr = _as_dict(
        data.get("credit_risk_assessment")
        or data.get("risk_assessment")
        or data.get("risk_analysis")
    )
    rec = _as_dict(
        data.get("credit_recommendations")
        or data.get("credit_recommendation")
        or data.get("recommendation")
    )
    dq = _as_dict(data.get("data_quality"))

    # -- Initialize updates dict FIRST -------------------------------------
    updates: Dict[str, Any] = {}

    # -- Array keys --------------------------------------------------------
    ARRAY_KEYS = {
        "shareholders",
        "branches",
        "banking_relationships",
        "news_events",
        "recommendations",
        "risk_mitigations",
        "monitoring_triggers",
        "alerts",
        "regional_affiliates",
        "legal_details",
        "strengths",
        "weaknesses",
        "opportunities",
        "threats",
        "management_team",
        "extra_reg_fields",
        "board_members",
        "phone_numbers",
    }
    # key_competitors / supporting_documents are deliberately NOT imported: the
    # report schema, editor and PDF have no place for them, so they were always
    # dropped silently. They are now reported back under "ignored_keys".
    IGNORED_ARRAY_KEYS = {"key_competitors", "supporting_documents"}
    ignored_keys: List[str] = []

    # Pull arrays from related_concerns if present
    related_concerns = _as_dict(data.get("related_concerns"))
    if related_concerns.get("branches"):
        updates["branches"] = related_concerns["branches"]
    if related_concerns.get("regional_affiliates"):
        updates["regional_affiliates"] = related_concerns["regional_affiliates"]

    # -- Field aliases -----------------------------------------------------
    ALIASES: Dict[str, str] = {
        # Company identity
        "legal_name": "legal_name",
        "registration_number": "cr_number",
        "legal_entity_type": "company_type",
        "cr_date": "incorporation_date",
        # Narratives
        "executive_summary_text": "executive_summary_text",
        "company_history_text": "company_history_text",
        "credit_opinion_text": "credit_opinion_text",
        "executive_summary": "executive_summary_text",
        "company_history": "company_history_text",
        "credit_opinion": "credit_opinion_text",
        # Suggested values
        "suggested_rating": "credit_rating",
        "suggested_risk_level": "risk_level",
        "suggested_credit_limit": "recommended_credit_limit",
        # Financial statement meta
        "fin_currency": "fin_currency",
        "fin_unit_scale": "fin_unit_scale",
        "fin_statement_type": "fin_statement_type",
        "fin_period_end": "fin_period_end",
        "fin_scope": "fin_scope",
        "fin_ratio_basis": "fin_ratio_basis",
        "fin_parent_note": "fin_parent_note",
        # Balance sheet short names
        "ar_1": "ar_1",
        "ar_2": "ar_2",
        "ar_3": "ar_3",
        "ar_trend": "ar_trend",
        "ltd_1": "ltd_1",
        "ltd_2": "ltd_2",
        "ltd_3": "ltd_3",
        "ltd_trend": "ltd_trend",
        # Operations / supply chain
        "local_purchasing_pct": "local_purchasing_pct",
        "local_purchasing_detail": "local_purchasing_detail",
        "import_purchasing_pct": "import_purchasing_pct",
        "import_countries": "import_countries",
        "import_items": "import_items",
        "supplier_payment_method": "supplier_payment_method",
        "local_sales_pct": "local_sales_pct",
        "local_sales_detail": "local_sales_detail",
        "export_sales_pct": "export_sales_pct",
        "export_countries": "export_countries",
        "export_items": "export_items",
        "customer_payment_method": "customer_payment_method",
        "supplier_payment_terms": "supplier_payment_terms",
        "customer_payment_terms": "customer_payment_terms",
        "main_suppliers": "main_suppliers",
        "key_customers": "key_customers",
        "employee_location": "employee_location",
        "facilities_count": "facilities_count",
        "main_facility_location": "main_facility_location",
        "markets_count": "markets_count",
        "markets_regions": "markets_regions",
        # Risk scores — detail fields
        "viability_level": "viability_level",
        "viability_probability": "viability_probability",
        "viability_meaning": "viability_meaning",
        "delinquency_level": "delinquency_level",
        "delinquency_probability": "delinquency_probability",
        "delinquency_meaning": "delinquency_meaning",
        "health_score": "health_score",
        "failure_score": "failure_score",
        "financial_health": "financial_health",
        "failure_level": "failure_level",
        "failure_probability": "failure_probability",
        "failure_meaning": "failure_meaning",
        "payment_score": "payment_score",
        "payment_level": "payment_level",
        "payment_probability": "payment_probability",
        "payment_meaning": "payment_meaning",
        "viability_score": "viability_score",
        "delinquency_score": "delinquency_score",
        "paydex_score": "paydex_score",
        "viability_color": "viability_color",
        "viability_badge": "viability_badge",
        "delinquency_color": "delinquency_color",
        "delinquency_badge": "delinquency_badge",
        "failure_color": "failure_color",
        "payment_color": "payment_color",
        "rating_color": "rating_color",
        "risk_color": "risk_color",
        "final_risk_color": "final_risk_color",
        "payment_delay_color": "payment_delay_color",
        "utilization_color": "utilization_color",
        "trend_color": "trend_color",
        # Industry / sector
        "sector_country_label": "sector_country_label",
        "sector_year": "sector_year",
        "sector_market_size": "sector_market_size",
        "sector_market_size_comment": "sector_market_size_comment",
        "sector_forecast_period": "sector_forecast_period",
        "sector_growth_forecast": "sector_growth_forecast",
        "sector_growth_comment": "sector_growth_comment",
        "sector_local_share": "sector_local_share",
        "sector_local_comment": "sector_local_comment",
        "sector_trade_flow": "sector_trade_flow",
        "sector_trade_comment": "sector_trade_comment",
        "sector_risks": "sector_risks",
        "sector_drivers": "sector_drivers",
        "sector_major_players": "sector_major_players",
        "sector_summary_text": "sector_summary_text",
        # Monitoring
        "payment_delay_status": "payment_delay_status",
        "credit_utilization": "credit_utilization",
        "financial_trend": "financial_trend",
        "legal_threshold": "legal_threshold",
        "payment_delay_threshold": "payment_delay_threshold",
        "next_review_date": "next_review_date",
        "assigned_analyst": "assigned_analyst",
        "escalation_contact": "escalation_contact",
        # Appendices / data quality
        "data_quality_rating": "data_quality_rating",
        "data_limitations": "data_limitations",
        "data_source_analyst_comment": "data_source_analyst_comment",
        # Credit recommendation aliases
        "recommended_credit_limit": "recommended_credit_limit",
        "maximum_exposure": "maximum_exposure",
        "recommended_payment_terms": "recommended_payment_terms",
        "review_frequency": "review_frequency",
        # Company metrics
        "company_size": "company_size",
        "annual_revenue": "annual_revenue",
        "annual_turnover": "annual_turnover",
        "payment_risk": "payment_risk",
        # Legal status
        "lawsuit_count": "lawsuit_count",
        "lawsuit_amount": "lawsuit_amount",
        "lawsuit_last_date": "lawsuit_last_date",
        "lawsuit_status": "lawsuit_status",
        "lawsuit_badge": "lawsuit_badge",
        "lien_count": "lien_count",
        "lien_amount": "lien_amount",
        "lien_last_date": "lien_last_date",
        "lien_status": "lien_status",
        "lien_badge": "lien_badge",
        "judgment_count": "judgment_count",
        "judgment_amount": "judgment_amount",
        "judgment_last_date": "judgment_last_date",
        "judgment_status": "judgment_status",
        "judgment_badge": "judgment_badge",
        "license_status": "license_status",
        "license_alert": "license_alert",
        "license_icon": "license_icon",
        "license_expiry": "license_expiry",
        "tax_status": "tax_status",
        "tax_alert": "tax_alert",
        "tax_icon": "tax_icon",
        # Payment behavior
        "avg_dbt": "avg_dbt",
        "pct_on_time": "pct_on_time",
        "highest_past_due": "highest_past_due",
        "prompt_pct": "prompt_pct",
        "prompt_amount": "prompt_amount",
        "slow_30_pct": "slow_30_pct",
        "slow_30_amount": "slow_30_amount",
        "slow_60_pct": "slow_60_pct",
        "slow_60_amount": "slow_60_amount",
        "slow_90plus_pct": "slow_90plus_pct",
        "slow_90plus_amount": "slow_90plus_amount",
        # Financial ratios
        "current_ratio": "current_ratio",
        "current_ratio_prev": "current_ratio_prev",
        "current_ratio_industry": "current_ratio_industry",
        "current_ratio_status": "current_ratio_status",
        "current_ratio_label": "current_ratio_label",
        "current_ratio_interpretation": "current_ratio_interpretation",
        "quick_ratio": "quick_ratio",
        "quick_ratio_prev": "quick_ratio_prev",
        "quick_ratio_industry": "quick_ratio_industry",
        "quick_ratio_status": "quick_ratio_status",
        "quick_ratio_label": "quick_ratio_label",
        "quick_ratio_interpretation": "quick_ratio_interpretation",
        "cash_ratio": "cash_ratio",
        "cash_ratio_prev": "cash_ratio_prev",
        "cash_ratio_industry": "cash_ratio_industry",
        "cash_ratio_status": "cash_ratio_status",
        "cash_ratio_label": "cash_ratio_label",
        "cash_ratio_interpretation": "cash_ratio_interpretation",
        "gross_margin": "gross_margin",
        "gross_margin_prev": "gross_margin_prev",
        "gross_margin_industry": "gross_margin_industry",
        "gross_margin_status": "gross_margin_status",
        "gross_margin_label": "gross_margin_label",
        "gross_margin_interpretation": "gross_margin_interpretation",
        "ebitda_margin": "ebitda_margin",
        "ebitda_margin_prev": "ebitda_margin_prev",
        "ebitda_margin_industry": "ebitda_margin_industry",
        "ebitda_margin_status": "ebitda_margin_status",
        "ebitda_margin_label": "ebitda_margin_label",
        "ebitda_margin_interpretation": "ebitda_margin_interpretation",
        "net_margin": "net_margin",
        "net_margin_prev": "net_margin_prev",
        "net_margin_industry": "net_margin_industry",
        "net_margin_status": "net_margin_status",
        "net_margin_label": "net_margin_label",
        "net_margin_interpretation": "net_margin_interpretation",
        "roa": "roa",
        "roa_prev": "roa_prev",
        "roa_industry": "roa_industry",
        "roa_status": "roa_status",
        "roa_label": "roa_label",
        "roa_interpretation": "roa_interpretation",
        "roe": "roe",
        "roe_prev": "roe_prev",
        "roe_industry": "roe_industry",
        "roe_status": "roe_status",
        "roe_label": "roe_label",
        "roe_interpretation": "roe_interpretation",
        "debt_equity": "debt_equity",
        "debt_equity_prev": "debt_equity_prev",
        "debt_equity_industry": "debt_equity_industry",
        "debt_equity_status": "debt_equity_status",
        "debt_equity_label": "debt_equity_label",
        "debt_equity_interpretation": "debt_equity_interpretation",
        "debt_assets": "debt_assets",
        "debt_assets_prev": "debt_assets_prev",
        "debt_assets_industry": "debt_assets_industry",
        "debt_assets_status": "debt_assets_status",
        "debt_assets_label": "debt_assets_label",
        "debt_assets_interpretation": "debt_assets_interpretation",
        "equity_ratio": "equity_ratio",
        "equity_ratio_prev": "equity_ratio_prev",
        "equity_ratio_industry": "equity_ratio_industry",
        "equity_ratio_status": "equity_ratio_status",
        "equity_ratio_label": "equity_ratio_label",
        "equity_ratio_interpretation": "equity_ratio_interpretation",
        "interest_coverage": "interest_coverage",
        "interest_coverage_prev": "interest_coverage_prev",
        "interest_coverage_industry": "interest_coverage_industry",
        "interest_coverage_status": "interest_coverage_status",
        "interest_coverage_label": "interest_coverage_label",
        "interest_coverage_interpretation": "interest_coverage_interpretation",
        "asset_turnover": "asset_turnover",
        "asset_turnover_prev": "asset_turnover_prev",
        "asset_turnover_industry": "asset_turnover_industry",
        "asset_turnover_status": "asset_turnover_status",
        "asset_turnover_label": "asset_turnover_label",
        "asset_turnover_interpretation": "asset_turnover_interpretation",
        "dio": "dio",
        "dio_prev": "dio_prev",
        "dio_industry": "dio_industry",
        "dio_status": "dio_status",
        "dio_label": "dio_label",
        "dio_interpretation": "dio_interpretation",
        "dso": "dso",
        "dso_prev": "dso_prev",
        "dso_industry": "dso_industry",
        "dso_status": "dso_status",
        "dso_label": "dso_label",
        "dso_interpretation": "dso_interpretation",
        "dpo": "dpo",
        "dpo_prev": "dpo_prev",
        "dpo_industry": "dpo_industry",
        "dpo_status": "dpo_status",
        "dpo_label": "dpo_label",
        "dpo_interpretation": "dpo_interpretation",
        "ccc": "ccc",
        "ccc_prev": "ccc_prev",
        "ccc_industry": "ccc_industry",
        "ccc_status": "ccc_status",
        "ccc_label": "ccc_label",
        "ccc_interpretation": "ccc_interpretation",
        "ebit_margin": "ebit_margin",
        # Show flags
        "show_egypt_fields": "show_egypt_fields",
        "show_saudi_fields": "show_saudi_fields",
        "show_uae_fields": "show_uae_fields",
        "show_board_of_directors": "show_board_of_directors",
        "show_related_concerns": "show_related_concerns",
        # Ownership
        "parent_company": "parent_company",
        "subsidiaries": "subsidiaries",
        "affiliates": "affiliates",
        "ultimate_beneficial_owner": "ultimate_beneficial_owner",
        "group_hq_name": "group_hq_name",
        "group_hq_location": "group_hq_location",
        # Banking
        "primary_bank": "primary_bank",
        "total_banks": "total_banks",
        "group_treasury_support": "group_treasury_support",
        "banking_notes": "banking_notes",
        # Company identity extras
        "trade_names": "trade_names",
        "cr_number": "cr_number",
        "unified_number": "unified_number",
        "investment_license_no": "investment_license_no",
        "other_registration_id": "other_registration_id",
        "other_registration_number": "other_registration_id",
        "other_reg_id": "other_registration_id",
        "additional_registration_id": "other_registration_id",
        "license_type": "license_type",
        "issue_date": "issue_date",
        "expiry_date": "expiry_date",
        "capital": "capital",
        "company_type": "company_type",
        "company_duration": "company_duration",
        "company_status": "company_status",
        "company_status_badge": "company_status_badge",
        "status_badge": "status_badge",
        "incorporation_date": "incorporation_date",
        "incorporation_state": "incorporation_state",
        "country": "country",
        "city": "city",
        "company_address": "company_address",
        "headquarters_address": "headquarters_address",
        "phone": "phone",
        "phone_numbers": "phone_numbers",
        "fax": "fax",
        "email": "email",
        "website": "website",
        "auditor_name": "auditor_name",
        "sic_codes": "sic_codes",
        "industry": "industry",
        "employee_count": "employee_count",
        "nace_codes": "nace_codes",
        "nace_description": "nace_description",
        "hs_codes": "hs_codes",
        "hs_description": "hs_description",
        "registration_activities_description": "registration_activities_description",
        "activities_full_description": "activities_full_description",
        # Registration details (UAE/KSA/Egypt)
        "tax_registration_number": "tax_registration_number",
        "tax_card_number": "tax_card_number",
        "trade_license_number": "trade_license_number",
        "social_insurance_number": "social_insurance_number",
        "gafi_registration": "gafi_registration",
        "zakat_certificate": "zakat_certificate",
        "vat_registration_number": "vat_registration_number",
        "gosi_registration": "gosi_registration",
        "nitaqat_band": "nitaqat_band",
        "municipality_license": "municipality_license",
        "trn_vat": "trn_vat",
        "ded_number": "ded_number",
        "freezone_license": "freezone_license",
        # Egypt new registration fields
        "industrial_license_number": "industrial_license_number",
        "import_license_number": "import_license_number",
        "export_license_number": "export_license_number",
        "lei_number": "lei_number",
        "zakat_number": "zakat_number",
        "zakat_status": "zakat_status",
        # Industry analysis
        "industry_name": "industry_name",
        "market_size": "market_size",
        "industry_growth_rate": "industry_growth_rate",
        # Analyst info
        "analyst_name": "analyst_name",
        "analyst_id": "analyst_id",
        "analyst_department": "analyst_department",
        "analyst_email": "analyst_email",
        "analyst_phone": "analyst_phone",
        "qa_reviewer_name": "qa_reviewer_name",
        "qa_review_date": "qa_review_date",
        "order_comment": "order_comment",
        "client_name": "client_name",
        "client_reference": "client_reference",
    }

    # -- Percentage fields that should be stored WITHOUT % sign ------------
    PERCENTAGE_FIELDS = {
        "local_purchasing_pct",
        "import_purchasing_pct",
        "local_sales_pct",
        "export_sales_pct",
        "viability_probability",
        "delinquency_probability",
        "pct_on_time",
        "prompt_pct",
        "slow_30_pct",
        "slow_60_pct",
        "slow_90plus_pct",
        # NOTE: credit_utilization is NOT here — it may be text
    }

    # -- Flatten entire JSON into updates dict -----------------------------
    def flatten(d: dict, parent_key: str = ""):
        if not isinstance(d, dict):
            return
        for k, v in d.items():
            # Financial year sub-objects
            if parent_key == "financial_data" and k.startswith("year_"):
                yr = k.split("_")[-1]
                if isinstance(v, dict):
                    yr_aliases = {
                        "cost_of_sales": "cogs",
                        "operating_expenses": "opex",
                        "shareholders_equity": "equity",
                        "accounts_receivable": "ar",
                        "long_term_debt": "ltd",
                    }
                    for subk, subv in v.items():
                        dst = yr_aliases.get(subk, subk)
                        updates[f"{dst}_{yr}"] = subv
                continue

            # Lists → only keep if it's a known array key
            if isinstance(v, list):
                if k in ARRAY_KEYS:
                    updates[k] = v
                elif k in IGNORED_ARRAY_KEYS and k not in ignored_keys:
                    ignored_keys.append(k)
                continue

            # Dicts
            if isinstance(v, dict):
                # Looks like a FieldData object {value: ..., confidence: ...}
                if "value" in v and len(v) <= 4:
                    final_k = ALIASES.get(k, k)
                    updates[final_k] = v.get("value")
                else:
                    flatten(v, k)
                continue

            # Scalars
            final_k = ALIASES.get(k, k)

            # Strip % from numeric percentage fields only
            if isinstance(v, str) and final_k in PERCENTAGE_FIELDS:
                stripped = v.strip().replace("%", "").strip()
                try:
                    float(stripped)
                    v = stripped  # was a number → strip %
                except ValueError:
                    pass  # was text → leave as-is

            updates[final_k] = v

    flatten(data)

    # -- SWOT arrays (after flatten, which would otherwise overwrite them) --
    # SWOT data may sit inside swot_analysis and/or at the top level; merge
    # both, turn object items ({"point": ...}) into text, de-duplicate.
    for swot_key in ["strengths", "weaknesses", "opportunities", "threats"]:
        items = []
        for source in (swot_analysis, data):
            val = source.get(swot_key) if isinstance(source, dict) else None
            if isinstance(val, list):
                items.extend(val)
        if items:
            seen = set()
            texts = []
            for item in items:
                text = _swot_text(item)
                if text and text not in seen:
                    seen.add(text)
                    texts.append(text)
            updates[swot_key] = texts

    # -- Currency detection ------------------------------------------------
    # Priority: explicit fin_currency in JSON > country detection.
    # country may arrive as a FieldData-style {"value": ...} object.
    country_val = _scalar_text(ci.get("country")) or _scalar_text(data.get("country"))

    has_currency = "fin_currency" in updates or "currency" in updates

    if country_val and not has_currency:
        try:
            code, symbol = get_currency(country_val)
            updates["currency"] = code
            updates["currency_symbol"] = symbol
            updates["fin_currency"] = code
        except Exception:
            pass
    elif "fin_currency" in updates and "currency" not in updates:
        updates["currency"] = updates["fin_currency"]
    elif "currency" in updates and "fin_currency" not in updates:
        updates["fin_currency"] = updates["currency"]

    # -- Country display flags ---------------------------------------------
    cl = country_val.lower() if country_val else ""
    updates["show_egypt_fields"] = "egypt" in cl
    updates["show_saudi_fields"] = any(x in cl for x in ["saudi", "ksa"])
    updates["show_uae_fields"] = any(x in cl for x in ["uae", "emirates"])

    # -- Auto-detect section visibility ------------------------------------
    if "board_members" in updates and updates["board_members"]:
        updates["show_board_of_directors"] = True

    if any(updates.get(k) for k in ["branches", "regional_affiliates"]):
        updates["show_related_concerns"] = True

    # -- Field Syncing -----------------------------------------------------
    # Sync activity descriptions
    reg_act = updates.get("registration_activities_description")
    full_act = updates.get("activities_full_description")
    if reg_act and not full_act:
        updates["activities_full_description"] = reg_act
    elif full_act and not reg_act:
        updates["registration_activities_description"] = full_act

    # Sync addresses
    comp_addr = updates.get("company_address")
    hq_addr = updates.get("headquarters_address")
    if comp_addr and not hq_addr:
        updates["headquarters_address"] = comp_addr
    elif hq_addr and not comp_addr:
        updates["company_address"] = hq_addr

    # =====================================================================
    # FORCE OVERRIDE CRITICAL FIELDS
    # =====================================================================
    # Search multiple paths in the JSON for each critical field.
    # Force-write regardless of any pre-lock status.
    # ════════════════════════════════════════════════════════════════

    critical: Dict[str, Any] = {
        # -- Credit Rating -------------------------------------------------
        "credit_rating": pick(
            cr.get("credit_rating"),
            cr.get("final_credit_rating"),
            cr.get("suggested_rating"),
            rec.get("final_credit_rating"),
            rec.get("credit_rating"),
            data.get("credit_rating"),
        ),
        "final_credit_rating": pick(
            rec.get("final_credit_rating"),
            cr.get("final_credit_rating"),
            cr.get("credit_rating"),
            data.get("final_credit_rating"),
            data.get("credit_rating"),
        ),
        # -- Risk Level ----------------------------------------------------
        "risk_level": pick(
            cr.get("risk_level"),
            cr.get("final_risk_level"),
            rec.get("final_risk_level"),
            rec.get("risk_level"),
            data.get("risk_level"),
        ),
        "final_risk_level": pick(
            rec.get("final_risk_level"),
            cr.get("final_risk_level"),
            cr.get("risk_level"),
            data.get("final_risk_level"),
            data.get("risk_level"),
        ),
        # -- Scores --------------------------------------------------------
        "health_score": pick(
            cr.get("health_score"),
            data.get("health_score"),
        ),
        "viability_score": pick(
            cr.get("viability_score"),
            data.get("viability_score"),
        ),
        "paydex_score": pick(
            cr.get("paydex_score"),
            data.get("paydex_score"),
        ),
        "payment_score": pick(
            cr.get("payment_score"),
            data.get("payment_score"),
        ),
        "delinquency_score": pick(
            cr.get("delinquency_score"),
            data.get("delinquency_score"),
        ),
        "failure_score": pick(
            cr.get("failure_score"),
            data.get("failure_score"),
        ),
        # -- Credit Limits -------------------------------------------------
        "recommended_limit": pick(
            rec.get("recommended_credit_limit"),
            rec.get("recommended_limit"),
            cr.get("recommended_credit_limit"),
            cr.get("recommended_limit"),
            data.get("recommended_limit"),
            data.get("recommended_credit_limit"),
        ),
        "recommended_credit_limit": pick(
            rec.get("recommended_credit_limit"),
            rec.get("recommended_limit"),
            data.get("recommended_credit_limit"),
            data.get("recommended_limit"),
        ),
        "max_exposure": pick(
            rec.get("maximum_exposure"),
            rec.get("max_exposure"),
            cr.get("maximum_exposure"),
            data.get("max_exposure"),
            data.get("maximum_exposure"),
        ),
        "maximum_exposure": pick(
            rec.get("maximum_exposure"),
            rec.get("max_exposure"),
            data.get("maximum_exposure"),
            data.get("max_exposure"),
        ),
        # -- Labels --------------------------------------------------------
        "financial_health": pick(
            cr.get("financial_health"),
            data.get("financial_health"),
        ),
        "payment_risk": pick(
            cr.get("payment_risk"),
            data.get("payment_risk"),
        ),
        "company_size": pick(
            cr.get("company_size"),
            data.get("company_size"),
        ),
        "annual_revenue": pick(
            cr.get("annual_revenue"),
            data.get("annual_revenue"),
        ),
        # -- Colors --------------------------------------------------------
        "rating_color": pick(
            cr.get("rating_color"),
            data.get("rating_color"),
        ),
        "risk_color": pick(
            cr.get("risk_color"),
            data.get("risk_color"),
        ),
        "final_risk_color": pick(
            rec.get("final_risk_color"),
            cr.get("risk_color"),
            data.get("final_risk_color"),
            data.get("risk_color"),
        ),
        "payment_delay_color": pick(
            cr.get("payment_delay_color"),
            data.get("payment_delay_color"),
            "#e67e22",  # default orange
        ),
        "utilization_color": pick(
            cr.get("utilization_color"),
            data.get("utilization_color"),
            "#27ae60",  # default green
        ),
        "trend_color": pick(
            cr.get("trend_color"),
            data.get("trend_color"),
            "#27ae60",  # default green
        ),
        # -- Score detail fields --------------------------------------------
        "viability_level": pick(
            cr.get("viability_level"),
            data.get("viability_level"),
        ),
        "viability_probability": pick(
            cr.get("viability_probability"),
            data.get("viability_probability"),
        ),
        "viability_meaning": pick(
            cr.get("viability_meaning"),
            data.get("viability_meaning"),
        ),
        "delinquency_level": pick(
            cr.get("delinquency_level"),
            data.get("delinquency_level"),
        ),
        "delinquency_probability": pick(
            cr.get("delinquency_probability"),
            data.get("delinquency_probability"),
        ),
        "delinquency_meaning": pick(
            cr.get("delinquency_meaning"),
            data.get("delinquency_meaning"),
        ),
        # -- Currency ------------------------------------------------------
        "fin_currency": pick(
            data.get("fin_currency"),
            updates.get("fin_currency"),
            updates.get("currency"),
        ),
        "currency": pick(
            data.get("fin_currency"),
            data.get("currency"),
            updates.get("currency"),
        ),
    }

    # -- Status, decided BEFORE the single save ------------------------------
    # A report linked to order companies stays "in_progress" until one of them
    # is completed; otherwise an import makes it "ready".
    new_status = "ready"
    try:
        linked = await asyncio.to_thread(get_order_companies_for_report, report_id)
        if linked and not any(oc.get("status") == "completed" for oc in linked):
            new_status = "in_progress"
    except Exception as exc:
        print(f"[EASY WAY] order_companies check failed: {exc}")

    counts: Dict[str, int] = {}

    # =====================================================================
    # APPLY UPDATES -- WRITE EVERYTHING, IGNORE ALL LOCKS
    # =====================================================================
    # Runs inside an atomic read-modify-write; on a concurrent edit it is
    # re-applied to the fresh copy, so it must only depend on its argument.
    def apply(report: FullReport) -> None:
        fields_updated = 0
        arrays_updated = 0
        skipped: List[str] = []

        for key, value in updates.items():
            if value is None:
                continue

            # Arrays
            if key in ARRAY_KEYS:
                try:
                    arr = report.arrays.model_dump()
                    arr[key] = value
                    report.arrays = report.arrays.model_validate(arr)
                    arrays_updated += 1
                except Exception as e:
                    print(f"[EASY WAY] Array '{key}' rejected: {e}")
                    skipped.append(key)
                continue

            # Scalars: only names the app knows (registered, used by the editor
            # or PDF, or already on this report). Everything else is reported
            # back instead of being stored where nothing reads it.
            if key not in report.fields and not is_known_field(key):
                skipped.append(key)
                continue
            force_write(report, key, value)
            fields_updated += 1

        forced_count = 0
        for key, value in critical.items():
            if value is None:
                continue
            force_write(report, key, value)
            forced_count += 1

        # -- Recalculate extraction stats -----------------------------------
        total = len(report.fields)
        high = sum(1 for f in report.fields.values() if f.confidence == "high")
        medium = sum(1 for f in report.fields.values() if f.confidence == "medium")
        calc = sum(1 for f in report.fields.values() if f.confidence == "calculated")
        report.extraction_stats.total_fields = total
        report.extraction_stats.high_confidence = high
        report.extraction_stats.medium_confidence = medium
        report.extraction_stats.calculated = calc
        report.extraction_stats.missing = total - high - medium - calc

        report.status = new_status
        counts.update(
            fields_updated=fields_updated,
            arrays_updated=arrays_updated,
            forced_count=forced_count,
        )
        counts["skipped"] = skipped  # type: ignore[assignment]

    updated = await _run_edit(mutate_report(report_id, apply))
    fields_updated = counts.get("fields_updated", 0)
    arrays_updated = counts.get("arrays_updated", 0)
    forced_count = counts.get("forced_count", 0)
    ignored = sorted(set(ignored_keys) | set(counts.get("skipped") or []))
    print(
        f"[EASY WAY] {report_id}: forced={forced_count} fields={fields_updated} "
        f"arrays={arrays_updated} ignored={len(ignored)} status={new_status}"
    )

    news_events = news_and_events.get("news_events")
    return {
        "success": True,
        "fields_updated": fields_updated,
        "arrays_updated": arrays_updated,
        "forced_fields": forced_count,
        "total_updates": fields_updated + arrays_updated,
        "ignored_keys": ignored,
        "status": new_status,
        "updated_at": updated.updated_at,
        "years_imported": [
            _as_dict(financial_data.get(f"year_{i}")).get("year")
            for i in [1, 2, 3]
            if _as_dict(financial_data.get(f"year_{i}")).get("year")
        ],
        "swot_imported": bool(swot_analysis.get("strengths")),
        "news_imported": len(news_events) if isinstance(news_events, list) else 0,
        "message": (
            f"Easy Way: {fields_updated} fields + "
            f"{arrays_updated} arrays + "
            f"{forced_count} forced. No recalculation."
        ),
    }


# ---------------------------------------------------------------------------
# STATUS
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/status")
async def update_status(
    report_id: str,
    body: dict,
):
    _require_valid_id(report_id)
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required")
    if not isinstance(new_status, str) or new_status not in REPORT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid: {', '.join(sorted(REPORT_STATUSES))}",
        )
    updated = await _run_edit(
        mutate_report(report_id, lambda report: setattr(report, "status", new_status))
    )
    return {"success": True, "status": new_status, "updated_at": updated.updated_at}


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


async def delete_report_or_raise(report_id: str, user: dict) -> None:
    """Shared by every report-delete endpoint: admin only, valid id, deletes
    the row and its uploaded_files rows without reading report_json first (so
    reports with broken JSON can still be removed); 404 when nothing matched."""
    require_admin(user)
    _require_valid_id(report_id)
    try:
        deleted = await crud_delete_report(None, report_id)
    except ReportLinkedError:
        raise HTTPException(
            status_code=409,
            detail="Report is linked to an order company; unlink it from the order first.",
        )
    except Exception as e:
        print(f"[REPORT] Failed to delete report {report_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete report")
    if not deleted:
        raise HTTPException(status_code=404, detail="Report not found")


@router.delete("/{report_id}")
async def delete_report(
    report_id: str = PathParam(..., description="Report unique identifier"),
    user: dict = Depends(get_current_user),
):
    await delete_report_or_raise(report_id, user)
    return {"deleted": True, "report_id": report_id}
