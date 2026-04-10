import sqlite3
import json
import sys

conn = sqlite3.connect('backend/antigravity.db')
cur = conn.cursor()

# Get latest report
cur.execute('SELECT id, report_json FROM reports ORDER BY created_at DESC LIMIT 1')
row = cur.fetchone()

if not row:
    print("No reports found!")
    sys.exit(0)

data = json.loads(row[1]) if row[1] else {}
fields = data.get('fields', {})
arrays = data.get('arrays', {})

# List of fields that should be imported from test_data.json
expected_fields = [
    'fin_currency', 'fin_unit_scale', 'fin_statement_type', 'fin_period_end', 'fin_scope', 'fin_ratio_basis',
    'ar_1', 'ar_2', 'ar_3', 'ar_trend',
    'ltd_1', 'ltd_2', 'ltd_3', 'ltd_trend',
    'local_purchasing_pct', 'import_purchasing_pct', 'import_items',
    'local_sales_pct', 'export_sales_pct', 'export_items',
    'supplier_payment_method', 'customer_payment_method',
    'viability_level', 'viability_probability', 'viability_meaning',
    'delinquency_level', 'delinquency_probability', 'delinquency_meaning',
    'sector_country_label', 'sector_year', 'sector_market_size', 'sector_market_size_comment',
    'sector_forecast_period', 'sector_growth_forecast', 'sector_growth_comment',
    'sector_local_share', 'sector_local_comment', 'sector_trade_flow', 'sector_trade_comment',
    'sector_risks', 'sector_drivers', 'sector_major_players', 'sector_summary_text',
    'payment_delay_status', 'credit_utilization', 'financial_trend', 'legal_threshold', 'payment_delay_threshold',
    'data_quality_rating', 'data_limitations', 'data_source_analyst_comment',
    'health_score', 'failure_score', 'financial_health'
]

print("=== FIELD CHECK ===")
found = []
missing = []
for f in expected_fields:
    if f in fields:
        val = fields[f].get('value', 'N/A')
        found.append(f)
        print(f"[FOUND] {f}: {val}")
    else:
        missing.append(f)
        print(f"[MISSING] {f}")

print(f"\n=== SUMMARY ===")
print(f"Found: {len(found)}/{len(expected_fields)}")
print(f"Missing: {len(missing)}")
print(f"Missing fields: {missing}")

print("\n=== ARRAYS ===")
for k, v in arrays.items():
    print(f"  {k}: {len(v)} items")

conn.close()
