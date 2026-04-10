# Valyze Credit Intelligence Platform - Complete JSON Field Analysis

## Source of Truth: Easy Way Import
The **true source of truth** is the `easy_way_import` endpoint in [`backend/api/report.py`](backend/api/report.py:292). This endpoint handles:
1. **Section mapping** - pulling data from nested JSON sections
2. **Field aliases** - 400+ field name mappings
3. **Critical fields** - special handling for credit rating, risk level, etc.

---

## JSON Sections (Top-Level)

The system expects JSON in these sections:
```
company_identity
ownership_structure
management_team
legal_regulatory / legal_status
financial_data
financial_ratios
trend_analysis
operational_profile / operations / operational_details
industry_analysis
news_and_events
credit_risk_assessment / risk_assessment / risk_analysis
credit_recommendations / credit_recommendation / recommendation
swot_analysis
data_quality
related_concerns
```

---

## Fields ACCEPTED by Easy Way Import

### 1. Report Metadata (15 fields)
```
report_id, report_date, current_year
client_name, client_reference, analyst_name, analyst_id
analyst_department, analyst_email, analyst_phone
qa_reviewer_name, qa_review_date, order_comment
```

### 2. Company Identity (30+ fields)
```
company_name, legal_name, trade_names
cr_number, unified_number, registration_number
license_type, issue_date, expiry_date
capital, company_type, company_duration
company_status, company_status_badge, status_badge
incorporation_date, incorporation_state, cr_date
country, city, company_address, headquarters_address
phone, fax, email, website
auditor_name, sic_codes, industry
employee_count, employee_location
```

### 3. Ownership & Management (10+ fields)
```
parent_company, subsidiaries, affiliates
ultimate_beneficial_owner
shareholders (array), management_team (array)
group_hq_name, group_hq_location
branches (array), regional_affiliates (array)
show_board_of_directors, board_members (array)
show_related_concerns
```

### 4. Legal/Regulatory (20+ fields)
```
lawsuit_count, lawsuit_amount, lawsuit_last_date
lawsuit_status, lawsuit_badge
lien_count, lien_amount, lien_last_date
lien_status, lien_badge
judgment_count, judgment_amount, judgment_last_date
judgment_status, judgment_badge
license_status, license_alert, license_icon, license_expiry
tax_status, tax_alert, tax_icon
show_egypt_fields, tax_registration_number, tax_card_number
trade_license_number, social_insurance_number, gafi_registration
show_saudi_fields, gosi_registration, nitaqat_band
municipality_license, show_uae_fields, trn_vat
ded_number, freezone_license, vat_registration_number
extra_reg_fields (array)
```

### 5. Financial Data (60+ fields)
```
year_1, year_2, year_3
revenue_1/2/3, cogs_1/2/3, gross_profit_1/2/3
opex_1/2/3, ebitda_1/2/3, net_income_1/2/3
cash_1/2/3, ar_1/2/3, ar_trend
inventory_1/2/3, inventory_trend
current_assets_1/2/3, total_assets_1/2/3
fixed_assets_1/2/3
current_liabilities_1/2/3, total_liabilities_1/2/3
ltd_1/2/3, ltd_trend
short_term_debt_1/2/3, accounts_payable_1/2/3
share_capital_1/2/3, retained_earnings_1/2/3
shareholders_equity_1/2/3, equity_1/2/3
fin_currency, fin_unit_scale, fin_statement_type
fin_period_end, fin_scope, fin_ratio_basis, fin_parent_note
```

### 6. Financial Ratios (80+ fields)
```
current_ratio, current_ratio_prev, current_ratio_industry
current_ratio_status, current_ratio_label, current_ratio_interpretation
quick_ratio, quick_ratio_prev, quick_ratio_industry
quick_ratio_status, quick_ratio_label, quick_ratio_interpretation
cash_ratio, cash_ratio_prev, cash_ratio_industry
cash_ratio_status, cash_ratio_label, cash_ratio_interpretation
gross_margin, gross_margin_prev, gross_margin_industry
gross_margin_status, gross_margin_label, gross_margin_interpretation
ebitda_margin, ebitda_margin_prev, ebitda_margin_industry
ebitda_margin_status, ebitda_margin_label, ebitda_margin_interpretation
net_margin, net_margin_prev, net_margin_industry
net_margin_status, net_margin_label, net_margin_interpretation
roa, roa_prev, roa_industry, roa_status, roa_label, roa_interpretation
roe, roe_prev, roe_industry, roe_status, roe_label, roe_interpretation
debt_equity, debt_equity_prev, debt_equity_industry
debt_equity_status, debt_equity_label, debt_equity_interpretation
debt_assets, debt_assets_prev, debt_assets_industry
debt_assets_status, debt_assets_label, debt_assets_interpretation
equity_ratio, equity_ratio_prev, equity_ratio_industry
equity_ratio_status, equity_ratio_label, equity_ratio_interpretation
interest_coverage, interest_coverage_prev, interest_coverage_industry
interest_coverage_status, interest_coverage_label, interest_coverage_interpretation
asset_turnover, asset_turnover_prev, asset_turnover_industry
asset_turnover_status, asset_turnover_label, asset_turnover_interpretation
dio, dio_prev, dio_industry, dio_status, dio_label, dio_interpretation
dso, dso_prev, dso_industry, dso_status, dso_label, dso_interpretation
dpo, dpo_prev, dpo_industry, dpo_status, dpo_label, dpo_interpretation
ccc, ccc_prev, ccc_industry, ccc_status, ccc_label, ccc_interpretation
```

### 7. Trend Analysis (15+ fields)
```
revenue_trend, cogs_trend, gross_profit_trend
opex_trend, ebitda_trend, net_income_trend
cash_trend, current_assets_trend, total_assets_trend
current_liabilities_trend, total_liabilities_trend, equity_trend
```

### 8. Operations (20+ fields)
```
activities_full_description, registration_activities_description
nace_codes, nace_description, hs_codes, hs_description
facilities_count, main_facility_location
markets_count, markets_regions
local_purchasing_pct, local_purchasing_detail
import_purchasing_pct, import_countries, import_items
supplier_payment_method, supplier_payment_terms
local_sales_pct, local_sales_detail
export_sales_pct, export_countries, export_items
customer_payment_method, customer_payment_terms
main_suppliers, key_customers
```

### 9. Banking (10+ fields)
```
banking_relationships (array), total_banks
primary_bank, group_treasury_support, banking_notes
```

### 10. Risk Scores (30+ fields)
```
health_score, viability_score, viability_level
viability_color, viability_badge, viability_probability, viability_meaning
delinquency_score, delinquency_level
delinquency_color, delinquency_badge, delinquency_probability, delinquency_meaning
failure_score, failure_level
failure_color, payment_score, payment_level
payment_color, credit_rating, rating_color
risk_level, risk_color, final_risk_level, final_risk_color
```

### 11. Payment Behavior (12+ fields)
```
paydex_score, avg_dbt, pct_on_time, highest_past_due
prompt_pct, prompt_amount
slow_30_pct, slow_30_amount
slow_60_pct, slow_60_amount
slow_90plus_pct, slow_90plus_amount
```

### 12. Credit Recommendation (8+ fields)
```
recommended_credit_limit, maximum_exposure
recommended_payment_terms, review_frequency
credit_opinion_text, suggested_rating, suggested_risk_level
suggested_credit_limit
```

### 13. Industry Analysis (20+ fields)
```
industry_name, market_size, industry_growth_rate
sector_country_label, sector_year
sector_market_size, sector_market_size_comment
sector_forecast_period, sector_growth_forecast, sector_growth_comment
sector_local_share, sector_local_comment
sector_trade_flow, sector_trade_comment
sector_risks, sector_drivers, sector_major_players, sector_summary_text
```

### 14. SWOT Analysis (4 arrays)
```
strengths (array), weaknesses (array)
opportunities (array), threats (array)
```

### 15. News & Events (1 array)
```
news_events (array)
```

### 16. Monitoring & Alerts (3 arrays + 5 fields)
```
recommendations (array), risk_mitigations (array)
monitoring_triggers (array), alerts (array)
payment_delay_status, credit_utilization, financial_trend
legal_threshold, payment_delay_threshold
next_review_date, assigned_analyst, escalation_contact
```

### 17. Data Quality (3 fields)
```
data_quality_rating, data_limitations
data_source_analyst_comment
```

### 18. Company Metrics (3 fields)
```
company_size, annual_revenue, payment_risk
```

---

## TOTAL: ~400+ Fields Supported

The system supports **~400+ fields** through the Easy Way Import.

---

## Summary

| Aspect | Count |
|--------|-------|
| Top-level JSON sections | 15 |
| Total scalar fields | ~380 |
| Array fields | 15 |
| Field aliases | 400+ |

---

## What Your JSON Needs

Your JSON input has **228 fields**, which is a **SUBSET** of what the system supports. All your fields ARE used - nothing is wasted.

The system was designed to accept comprehensive credit reports with all possible fields for different countries (UAE, Saudi, Egypt) and different data sources.
