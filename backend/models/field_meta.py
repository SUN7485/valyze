"""
Field metadata definitions for the Valyze Credit report system.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    MISSING = "missing"
    CALCULATED = "calculated"


class FieldSource(str, Enum):
    PATTERN = "pattern"
    TABLE = "table"
    AI = "ai"
    CALCULATED = "calculated"
    USER = "user"
    SYSTEM = "system"


class ReportStatus(str, Enum):
    UPLOADING = "uploading"
    EXTRACTING = "extracting"
    READY = "ready"
    EDITING = "editing"
    GENERATING = "generating"
    DONE = "done"


@dataclass
class FieldValue:
    value: Any = None
    confidence: ConfidenceLevel = ConfidenceLevel.MISSING
    source: FieldSource = FieldSource.SYSTEM
    locked: bool = False


FIELD_REGISTRY: dict[str, dict] = {}


def _register(names: list[str], source: FieldSource, locked: bool = False):
    for name in names:
        FIELD_REGISTRY[name] = {"source": source.value, "locked": locked}


# -- PATTERN fields --------------------------------------------------------
_register(
    [
        "cr_number",
        "unified_number",
        "phone",
        "fax",
        "email",
        "website",
        "issue_date",
        "expiry_date",
        "incorporation_date",
        "report_date",
        "license_expiry",
        "registration_number",
        "investment_license_no",
        "other_registration_id",
        # Egypt-specific registration fields
        "tax_registration_number",
        "tax_card_number",
        "social_insurance_number",
        "gafi_registration",
        "industrial_license_number",
        "import_license_number",
        "export_license_number",
        "lei_number",
        # UAE-specific fields
        "trn_vat",
        "vat_registration_number",
        "ded_number",
        "freezone_license",
        # Saudi-specific fields
        "gosi_registration",
        "nitaqat_band",
        "municipality_license",
        "zakat_certificate",
        "zakat_number",
    ],
    FieldSource.PATTERN,
)

# -- TABLE fields ----------------------------------------------------------
_register(
    [
        "revenue_1",
        "revenue_2",
        "revenue_3",
        "cogs_1",
        "cogs_2",
        "cogs_3",
        "gross_profit_1",
        "gross_profit_2",
        "gross_profit_3",
        "opex_1",
        "opex_2",
        "opex_3",
        "ebitda_1",
        "ebitda_2",
        "ebitda_3",
        "ebit_1",
        "ebit_2",
        "ebit_3",
        "interest_expense_1",
        "interest_expense_2",
        "interest_expense_3",
        "tax_expense_1",
        "tax_expense_2",
        "tax_expense_3",
        "net_income_1",
        "net_income_2",
        "net_income_3",
        "cash_1",
        "cash_2",
        "cash_3",
        "accounts_receivable_1",
        "accounts_receivable_2",
        "accounts_receivable_3",
        "inventory_1",
        "inventory_2",
        "inventory_3",
        "total_assets_1",
        "total_assets_2",
        "total_assets_3",
        "current_assets_1",
        "current_assets_2",
        "current_assets_3",
        "fixed_assets_1",
        "fixed_assets_2",
        "fixed_assets_3",
        "current_liabilities_1",
        "current_liabilities_2",
        "current_liabilities_3",
        "total_liabilities_1",
        "total_liabilities_2",
        "total_liabilities_3",
        "accounts_payable_1",
        "accounts_payable_2",
        "accounts_payable_3",
        "short_term_debt_1",
        "short_term_debt_2",
        "short_term_debt_3",
        "long_term_debt_1",
        "long_term_debt_2",
        "long_term_debt_3",
        "share_capital_1",
        "share_capital_2",
        "share_capital_3",
        "retained_earnings_1",
        "retained_earnings_2",
        "retained_earnings_3",
        "shareholders_equity_1",
        "shareholders_equity_2",
        "shareholders_equity_3",
        "equity_1",
        "equity_2",
        "equity_3",
        "capital",
        "year_1",
        "year_2",
        "year_3",
    ],
    FieldSource.TABLE,
)

# -- AI fields (NOT locked - can be overwritten by import) -----------------
_register(
    [
        # Company identity
        "company_name",
        "legal_name",
        "trade_names",
        "country",
        "city",
        "company_address",
        "company_type",
        "company_duration",
        "company_status",
        "incorporation_state",
        "auditor_name",
        "parent_company",
        "subsidiaries",
        "affiliates",
        "affiliated_entities",
        "ultimate_beneficial_owner",
        "industry",
        "sic_codes",
        "nace_codes",
        "hs_codes",
        "nace_description",
        "hs_description",
        "employee_count",
        "employee_location",
        "facilities_count",
        "main_facility_location",
        "markets_count",
        "markets_regions",
        "main_suppliers",
        "key_customers",
        "strategic_customers",
        "supplier_payment_terms",
        "customer_payment_terms",
        "headquarters_address",
        "license_type",
        "license_status",
        "tax_status",
        "unified_number",
        "investment_license_no",
        "incorporation_date",
        "legal_entity_type",
        # Trade license number (used by UAE and Egypt)
        "trade_license_number",
        # Operations fields
        "registration_activities_description",
        "activities_full_description",
        "premises_type",
        "premises_size",
        "premises_owned_rental",
        "vehicles",
        "equipment",
        "brands",
        # Supply chain fields
        "local_purchasing_pct",
        "import_purchasing_pct",
        "local_purchasing_detail",
        "import_countries",
        "import_items",
        "supplier_payment_method",
        "suppliers_number",
        "local_sales_pct",
        "export_sales_pct",
        "local_sales_detail",
        "export_countries",
        "export_items",
        "customer_payment_method",
        "clients_number",
        # Industry analysis extra field
        "sector_country_label",
        # Executive summary
        "executive_summary",
        "executive_summary_text",
        "company_history",
        "company_history_text",
        # Ownership
        "group_hq_name",
        "group_hq_location",
        # Banking
        "primary_bank",
        "group_treasury_support",
        "banking_notes",
        "total_banks",
        # Legal status fields
        "lawsuit_count",
        "lawsuit_amount",
        "lawsuit_last_date",
        "lawsuit_status",
        "lawsuit_badge",
        "lien_count",
        "lien_amount",
        "lien_last_date",
        "lien_status",
        "lien_badge",
        "judgment_count",
        "judgment_amount",
        "judgment_last_date",
        "judgment_status",
        "judgment_badge",
        "license_alert",
        "license_icon",
        "license_expiry",
        "tax_alert",
        "tax_icon",
        # Payment behavior
        "paydex_score",
        "avg_dbt",
        "pct_on_time",
        "highest_past_due",
        "prompt_pct",
        "prompt_amount",
        "slow_30_pct",
        "slow_30_amount",
        "slow_60_pct",
        "slow_60_amount",
        "slow_90plus_pct",
        "slow_90plus_amount",
        # Industry
        "industry_name",
        "market_size",
        "industry_growth_rate",
        "competitive_position",
        "main_competitors",
        "industry_classification",
        # Financial ratios - NOT locked, JSON provides these
        # (moved to CALCULATED section with locked=True)
        # Ratio industry benchmarks & labels
        "current_ratio_industry",
        "current_ratio_status",
        "current_ratio_label",
        "current_ratio_interpretation",
        "current_ratio_industry_avg",
        "quick_ratio_industry",
        "quick_ratio_status",
        "quick_ratio_label",
        "quick_ratio_interpretation",
        "quick_ratio_industry_avg",
        "gross_margin_industry",
        "gross_margin_status",
        "gross_margin_label",
        "gross_margin_interpretation",
        "gross_margin_industry_avg",
        "net_margin_industry",
        "net_margin_status",
        "net_margin_label",
        "net_margin_interpretation",
        "net_margin_industry_avg",
        # Risk scores - NOT locked, JSON provides these
        # (moved to CALCULATED section with locked=True)
        # Ratio industry benchmarks & labels
        "fields_populated",
        "total_fields",
        "confidence_score",
        "primary_data_source",
        "extraction_notes",
        "web_searches_performed",
        # Misc
        "currency",
        "currency_symbol",
        "financial_currency",
        "financial_trend_outlook",
        "guarantees_collateral",
        "security_requirements",
    ],
    FieldSource.AI,
)

# -- CALCULATED fields - Trust the JSON source -----------------------------
# Unlocked so JSON import can overwrite them and they are edible in UI
_register(
    [
        # Financial ratios
        "current_ratio",
        "quick_ratio",
        "debt_to_equity",
        "debt_equity",
        "gross_margin",
        "net_margin",
        "ebit_margin",
        "ebitda_margin",
        "asset_turnover",
        "equity_ratio",
        "interest_coverage",
        "return_on_assets",
        "return_on_equity",
        # Risk scores
        "health_score",
        "credit_rating",
        "risk_level",
        "viability_score",
        "delinquency_score",
        "failure_score",
        "payment_score",
        "paydex_score",
        # Credit recommendation
        "recommended_limit",
        "recommended_credit_limit",
        "max_exposure",
        "maximum_exposure",
        # Company metrics
        "company_size",
        "annual_revenue",
        "annual_turnover",
        "payment_risk",
        "financial_health",
        # Executive summary metrics
        "exec_current_ratio",
        "exec_equity_ratio",
        "exec_profitability",
        # Internal calc version
        "ebit_margin_calc",
    ],
    FieldSource.CALCULATED,
    locked=False,
)

# -- USER INPUT fields ----------------------------------------------------
_register(
    [
        "client_name",
        "client_reference",
        "analyst_name",
        "order_comment",
        "analyst_id",
        "analyst_department",
        "analyst_email",
        "analyst_phone",
        "qa_reviewer_name",
        "qa_review_date",
        "assigned_analyst",
        "escalation_contact",
        "next_review_date",
        "payment_delay_threshold",
        "legal_threshold",
        "internal_report_id",
        "current_year",
        # Country selection flags
        "show_egypt_fields",
        "show_saudi_fields",
        "show_uae_fields",
        "show_zakat",
        # Page visibility toggles
        "show_related_concerns",
        "show_board_of_directors",
        # PDF page exclusion toggles
        "exclude_page_1",
        "exclude_page_2",
        "exclude_page_3",
        "exclude_page_4",
        "exclude_page_5",
        "exclude_page_6",
        "exclude_page_7",
        "exclude_page_8",
        "exclude_page_9",
        "exclude_page_10",
        "exclude_page_11",
        "exclude_page_12",
        "exclude_page_13",
        "exclude_page_14",
        "exclude_page_15",
        "exclude_page_16",
        "exclude_page_17",
        "exclude_page_18",
        "exclude_page_19",
        # Company status & license alert fields (user-selected dropdowns)
        "company_status_badge",
        "license_alert",
        "license_icon",
        "tax_alert",
        "tax_icon",
        "zakat_alert",
        # Zakat fields (Saudi-specific but user input)
        "zakat_status",
        # Additional user input fields
        "company_size_explanation",
        "recommended_payment_terms",
        "final_credit_rating",
        "final_risk_level",
        "credit_opinion_text",
        "review_frequency",
        "viability_meaning",
        "delinquency_meaning",
    ],
    FieldSource.USER,
)

# -- SYSTEM fields --------------------------------------------------------
_register(
    [
        "report_id",
        "report_date",
        "financial_data_source",
        "legal_data_source",
        "trade_data_source",
        "news_data_source",
        "registry_data_source",
    ],
    FieldSource.SYSTEM,
)

# -- ARRAY field names ----------------------------------------------------
ARRAY_FIELDS: list[str] = [
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
    "phone_numbers",
]
