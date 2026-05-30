-- Migration: 003_remove_unique_constraints
-- Purpose: Remove unique constraints to allow duplicate values
-- Created: 2026-05-26

-- Drop unique constraints
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_cr_number_key,
DROP CONSTRAINT IF EXISTS reports_client_reference_key,
DROP CONSTRAINT IF EXISTS reports_company_name_key;

-- Comments
COMMENT ON CONSTRAINT reports_cr_number_key ON reports IS NULL;
COMMENT ON CONSTRAINT reports_client_reference_key ON reports IS NULL;
COMMENT ON CONSTRAINT reports_company_name_key ON reports IS NULL;