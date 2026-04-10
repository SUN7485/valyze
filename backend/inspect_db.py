import sqlite3
import json

report_id = "28cc32a7-a33b-40ff-b657-ca9cbccd39d6"
conn = sqlite3.connect('valyez.db')
row = conn.execute("SELECT report_json, status FROM reports WHERE id = ?", (report_id,)).fetchone()

if row:
    print(f"Status in DB: {row[1]}")
    data = json.loads(row[0])
    print(f"Report ID: {data.get('report_id')}")
    print(f"Company Name: {data.get('fields', {}).get('company_name', {}).get('value')}")
    print(f"CR Number: {data.get('fields', {}).get('cr_number', {}).get('value')}")
    print(f"Extraction Stats: {data.get('extraction_stats')}")
    # The summary is not in the JSON, it's returned by the API
else:
    print("Report not found")
conn.close()
