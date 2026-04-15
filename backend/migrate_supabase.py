"""
Supabase Database Migration Script.

Run this to create the reports table in Supabase.

SQL to run in Supabase SQL Editor:
"""

SQL_MIGRATION = """
-- Create reports table for Valyze Credit Reports
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'uploading',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_json JSONB,
    
    -- Searchable fields (extracted for efficient searching)
    company_name TEXT,
    legal_name TEXT,
    cr_number TEXT,
    client_reference TEXT,
    country TEXT,
    address TEXT,
    analyst TEXT
);

-- Create index for fast searches
CREATE INDEX IF NOT EXISTS idx_reports_company_name ON reports(company_name);
CREATE INDEX IF NOT EXISTS idx_reports_legal_name ON reports(legal_name);
CREATE INDEX IF NOT EXISTS idx_reports_cr_number ON reports(cr_number);
CREATE INDEX IF NOT EXISTS idx_reports_client_reference ON reports(client_reference);
CREATE INDEX IF NOT EXISTS idx_reports_country ON reports(country);
CREATE INDEX IF NOT EXISTS idx_reports_analyst ON reports(analyst);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Enable FULL TEXT SEARCH on text columns
CREATE INDEX IF NOT EXISTS idx_reports_search ON reports USING gin(
    to_tsvector('english', 
        COALESCE(id, '') || ' ' || 
        COALESCE(company_name, '') || ' ' || 
        COALESCE(legal_name, '') || ' ' || 
        COALESCE(cr_number, '') || ' ' || 
        COALESCE(client_reference, '') || ' ' || 
        COALESCE(country, '') || ' ' || 
        COALESCE(address, '') || ' ' || 
        COALESCE(analyst, '')
    )
);
"""

print("=" * 60)
print("SUPABASE DATABASE MIGRATION")
print("=" * 60)
print()
print("Run this SQL in your Supabase SQL Editor:")
print("https://dnhtowmzrluqtlivdqqj.supabase.co/dashboard/editor")
print()
print(SQL_MIGRATION)
print("=" * 60)
