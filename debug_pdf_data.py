#!/usr/bin/env python3
"""Debug script to inspect report data for PDF generation."""
import json
import sqlite3

def main():
    # Try valyez.db first
    db_path = "backend/valyez.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables:", tables)
    
    # Get reports
    cursor.execute("SELECT id, status FROM reports LIMIT 5")
    reports = cursor.fetchall()
    print("\nReports:", reports)
    
    if reports:
        report_id = reports[0][0]
        print(f"\nFetching report: {report_id}")
        cursor.execute("SELECT report_json FROM reports WHERE id = ?", (report_id,))
        row = cursor.fetchone()
        
        if row and row[0]:
            data = json.loads(row[0])
            print("Top-level keys:", list(data.keys()))
            
            # Check fields
            if 'fields' in data:
                fields = data['fields']
                print("\nFields keys (sample):", list(fields.keys())[:20])
                
                # Check specific fields
                for field_name in ['company_name', 'legal_name', 'credit_rating', 'cr_number']:
                    if field_name in fields:
                        print(f"\n{field_name}:", fields[field_name])
                    else:
                        print(f"\n{field_name}: NOT FOUND")
            else:
                print("No 'fields' key in data!")
                
            # Check arrays
            if 'arrays' in data:
                print("\nArrays keys:", list(data['arrays'].keys()))
        else:
            print("No report_json found!")
    
    conn.close()

if __name__ == "__main__":
    main()
