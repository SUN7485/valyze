import sqlite3
import json
import sys

def dump_report(report_id):
    try:
        conn = sqlite3.connect('backend/valyez.db')
        cursor = conn.cursor()
        
        cursor.execute("SELECT fields, arrays, extraction_stats, status FROM reports WHERE report_id = ?", (report_id,))
        row = cursor.fetchone()
        
        if not row:
            print(f"Report {report_id} not found")
            return
            
        fields = json.loads(row[0]) if row[0] else None
        arrays = json.loads(row[1]) if row[1] else None
        stats = json.loads(row[2]) if row[2] else None
        status = row[3]
        
        print(f"Status: {status}")
        print("Fields keys:", list(fields.keys()) if fields else "None")
        print("Arrays keys:", list(arrays.keys()) if arrays else "None")
        print("Stats:", stats)
        
        # Check for specific keys that might be problematic
        if fields:
             print("Company Name:", fields.get('company_name'))
             
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        dump_report(sys.argv[1])
    else:
        print("Usage: python dump_report.py <report_id>")
