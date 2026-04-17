"""
Report API routes for Valyze Credit report.

================================================================
SINGLE SOURCE OF TRUTH. NO AUTO-RECALCULATION. EVER.
================================================================
"""

from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import (
    delete_report as crud_delete_report,
    get_all_reports,
    get_report,
    save_report_json,
    update_report_field,
    update_report_fields_bulk,
    update_report_status,
)
from database.db import get_db
from models.field_meta import ARRAY_FIELDS
from models.report_schema import (
    FieldData,
    FullReport,
    UpdateArrayRequest,
    UpdateFieldRequest,
    UpdateFieldsBulkRequest,
)

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


def pick(*args):
    """Return the first non-None, non-empty value from args."""
    for v in args:
        if v is not None and v != "":
            return v
    return None


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------


@router.get("/", response_model=List[dict])
async def list_reports(db: AsyncSession = Depends(get_db)):
    try:
        reports = await get_all_reports(db)
        return reports
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list reports: {e}")


# ---------------------------------------------------------------------------
# GET
# ---------------------------------------------------------------------------


@router.get("/{report_id}")
async def get_report_detail(report_id: str, db: AsyncSession = Depends(get_db)):
    print(f"[DEBUG] Get report detail for {report_id}")
    report = await get_report(db, report_id)
    if report is None:
        print(f"[DEBUG] Report not found: {report_id}")
        raise HTTPException(status_code=404, detail="Report not found")
    print(f"[DEBUG] Returning report: {report_id}, status: {report.status}")
    return report.model_dump()


# ---------------------------------------------------------------------------
# PATCH single field
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/field")
async def update_single_field(
    report_id: str,
    body: UpdateFieldRequest,
    db: AsyncSession = Depends(get_db),
):
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if body.field_name in report.fields and report.fields[body.field_name].locked:
        raise HTTPException(
            status_code=400,
            detail=f"Field '{body.field_name}' is locked",
        )

    updated = await update_report_field(
        db,
        report_id,
        body.field_name,
        body.value,
        confidence="high",
        source=body.source,
    )
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update field")

    return {
        "field_name": body.field_name,
        "value": body.value,
        "source": body.source,
    }


# ---------------------------------------------------------------------------
# PATCH bulk fields
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/fields")
async def update_fields_bulk(
    report_id: str,
    body: UpdateFieldsBulkRequest,
    db: AsyncSession = Depends(get_db),
):
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    updated = await update_report_fields_bulk(db, report_id, body.fields)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to update fields")

    return {
        "updated_count": len(body.fields),
        "fields": list(body.fields.keys()),
    }


# ---------------------------------------------------------------------------
# PATCH array
# ---------------------------------------------------------------------------


@router.patch("/{report_id}/array")
async def update_array(
    report_id: str,
    body: UpdateArrayRequest,
    db: AsyncSession = Depends(get_db),
):
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if body.array_name not in ARRAY_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown array '{body.array_name}'. "
            f"Valid: {', '.join(ARRAY_FIELDS)}",
        )

    try:
        arrays_dict = report.arrays.model_dump()
        arrays_dict[body.array_name] = body.data
        report.arrays = report.arrays.model_validate(arrays_dict)
        await save_report_json(db, report_id, report.model_dump_json())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update array: {e}")

    return {
        "array_name": body.array_name,
        "items_count": len(body.data),
    }


# ---------------------------------------------------------------------------
# RECALCULATE  — intentionally disabled
# ---------------------------------------------------------------------------


@router.post("/{report_id}/recalculate")
async def recalculate_report_financials(
    report_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    RECALCULATION IS INTENTIONALLY DISABLED.
    The imported JSON is the SINGLE SOURCE OF TRUTH.
    This endpoint exists for API compatibility but does NOTHING.
    """
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

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
async def get_stats(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.extraction_stats.model_dump()


# ---------------------------------------------------------------------------
# EASY WAY IMPORT
# ---------------------------------------------------------------------------


@router.post("/{report_id}/easy-way")
async def easy_way_import(
    report_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Import complete JSON — JSON is the FINAL WORD.
    No recalculation. No auto-triggers. What comes in is final.
    """
    print(f"[DEBUG] Easy Way Import called for report_id: {report_id}")
    print(f"[DEBUG] Data keys: {list(data.keys()) if data else 'None'}")

    report = await get_report(db, report_id)
    if not report:
        print(f"[DEBUG] Report not found: {report_id}")
        raise HTTPException(404, "Report not found")
    print(f"[DEBUG] Report found: {report_id}, status: {report.status}")

    # -- Top-level sections ------------------------------------------------
    financial_data = data.get("financial_data", {}) or {}
    swot_analysis = data.get("swot_analysis", {}) or {}
    news_and_events = data.get("news_and_events", {}) or {}
    ci = data.get("company_identity", {}) or {}
    os_ = data.get("ownership_structure", {}) or {}
    fr = data.get("financial_ratios", {}) or {}
    ta = data.get("trend_analysis", {}) or {}
    op = (
        data.get("operational_profile")
        or data.get("operations")
        or data.get("operational_details")
        or {}
    ) or {}
    ia = data.get("industry_analysis", {}) or {}
    cr = (
        data.get("credit_risk_assessment")
        or data.get("risk_assessment")
        or data.get("risk_analysis")
        or {}
    ) or {}
    rec = (
        data.get("credit_recommendations")
        or data.get("credit_recommendation")
        or data.get("recommendation")
        or {}
    ) or {}
    dq = data.get("data_quality", {}) or {}

    # -- Initialize updates dict FIRST -------------------------------------
    updates: Dict[str, Any] = {}

    # -- Pull SWOT arrays from swot_analysis -------------------------------
    # The flatten() function only processes arrays at the top level,
    # but SWOT data comes nested inside swot_analysis object.
    # Extract them explicitly.
    # -- Extract SWOT arrays with deduplication ---------------------------
    for swot_key in ["strengths", "weaknesses", "opportunities", "threats"]:
        items = []
        # Check swot_analysis object
        if swot_analysis and swot_key in swot_analysis:
            val = swot_analysis[swot_key]
            if isinstance(val, list):
                items.extend(val)

        # Check top-level
        if swot_key in data:
            val = data[swot_key]
            if isinstance(val, list):
                items.extend(val)

        if items:
            # Deduplicate while preserving order
            seen = set()
            updates[swot_key] = [x for x in items if not (x in seen or seen.add(x))]

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
        "key_competitors",
        "supporting_documents",
        "phone_numbers",
    }

    # Pull arrays from related_concerns if present
    related_concerns = data.get("related_concerns", {}) or {}
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

    # -- Currency detection ------------------------------------------------
    # Priority: explicit fin_currency in JSON > country detection
    country_val = ci.get("country", "") or data.get("country", "") or ""

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
    # APPLY UPDATES -- WRITE EVERYTHING, IGNORE ALL LOCKS
    # =====================================================================

    now_ts = datetime.now(timezone.utc).isoformat()
    fields_updated = 0
    arrays_updated = 0

    for key, value in updates.items():
        if value is None:
            continue

        # Arrays
        if key in ARRAY_KEYS:
            try:
                if hasattr(report.arrays, key):
                    arr = report.arrays.model_dump()
                    arr[key] = value
                    report.arrays = report.arrays.model_validate(arr)
                    arrays_updated += 1
            except Exception as e:
                print(f"[EASY WAY] Array '{key}' error: {e}")
            continue

        # Scalars — write regardless of lock status
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
        fields_updated += 1

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

    forced_count = 0
    for key, value in critical.items():
        if value is None:
            continue
        force_write(report, key, value)
        forced_count += 1
        print(f"[FORCE] {key} = {value}")

    print(
        f"[EASY WAY] forced={forced_count} fields={fields_updated} arrays={arrays_updated}"
    )

    # -- Save --------------------------------------------------------------
    print(f"[DEBUG] Saving report for {report_id}")
    report.updated_at = now_ts
    await save_report_json(db, report_id, report.model_dump_json())
    await update_report_status(db, report_id, "ready")
    print(f"[DEBUG] Report saved successfully")

    return {
        "success": True,
        "fields_updated": fields_updated,
        "arrays_updated": arrays_updated,
        "forced_fields": forced_count,
        "total_updates": fields_updated + arrays_updated,
        "years_imported": [
            (financial_data.get(f"year_{i}") or {}).get("year")
            for i in [1, 2, 3]
            if (financial_data.get(f"year_{i}") or {}).get("year")
        ],
        "swot_imported": bool(swot_analysis.get("strengths")),
        "news_imported": len(news_and_events.get("news_events", [])),
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
    db: AsyncSession = Depends(get_db),
):
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="Status is required")
    await update_report_status(db, report_id, new_status)
    return {"success": True, "status": new_status}


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------


@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    upload_dir = Path("uploads") / report_id
    if upload_dir.exists():
        shutil.rmtree(upload_dir, ignore_errors=True)

    deleted = await crud_delete_report(db, report_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete report")

    return {"deleted": True, "report_id": report_id}
