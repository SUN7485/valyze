import json
import re
import os

def verify_mapping():
    # 1. Load JSON test data
    json_path = r"D:\valyez final\json test.txt"
    if not os.path.exists(json_path):
        print(f"ERROR: JSON file not found at {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 2. Load PDF Template
    template_path = r"D:\valyez final\backend\templates\template.html"
    with open(template_path, 'r', encoding='utf-8') as f:
        html = f.read()

    print(f"--- Verifying Data Mapping for {data.get('company_name', 'Unknown Company')} ---")
    
    # 3. List of critical fields to check
    critical_fields = [
        "company_name", "credit_rating", "risk_level", "recommended_credit_limit",
        "maximum_exposure", "legal_name", "incorporation_date", "cr_number",
        "unified_number", "auditor_name", "ultimate_beneficial_owner",
        "tax_registration_number", "trn_vat", "parent_company", "subsidiaries",
        "affiliates"
    ]

    missing = []
    for field in critical_fields:
        # Check for {{field}} or {{#field}}
        pattern = rf"\{{\{{#?{field}\}}\}}"
        if not re.search(pattern, html):
            missing.append(field)
    
    if missing:
        print(f"❌ Missing critical fields in template: {', '.join(missing)}")
    else:
        print("✅ All critical fields successfully mapped in template.")

    # 4. Check for page breaks (should be minimal)
    page_breaks = html.count("page-break-before: always")
    print(f"📊 Found {page_breaks} explicit page breaks (Reduced from ~15).")
    
    if page_breaks > 5:
        print("⚠️ Warning: High number of page breaks detected. Layout might still have white spaces.")
    else:
        print("✅ Page breaks minimized for continuous flow.")

    # 5. Verify Country Flags in report.py (Indirect check via field existence)
    if "show_egypt_fields" in html and "show_saudi_fields" in html and "show_uae_fields" in html:
        print("✅ Country conditional flags (Egypt, Saudi, UAE) are present in template.")
    else:
        print("❌ Missing country conditional flags in template.")

    # 6. Verify monitoring indicator colors
    indicator_colors = ["payment_delay_color", "utilization_color", "trend_color"]
    missing_colors = [c for c in indicator_colors if f"{{{{{c}}}}}" not in html]
    if missing_colors:
        print(f"❌ Missing indicator color fields: {', '.join(missing_colors)}")
    else:
        print("✅ Monitoring indicator colors are mapped.")

if __name__ == "__main__":
    verify_mapping()
