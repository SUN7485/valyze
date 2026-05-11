-- Migration: 003_add_unique_client_ref_company
-- Purpose: Enforce uniqueness on client_reference and company_name to ensure each client/company has exactly one report
-- Created: 2026-05-11

-- Step 0: Backup any existing duplicates before cleanup for client_reference
CREATE TABLE IF NOT EXISTS reports_duplicate_backup_client_ref AS
SELECT r.*
FROM reports r
JOIN (
    SELECT client_reference
    FROM reports
    WHERE client_reference IS NOT NULL AND trim(client_reference) <> ''
    GROUP BY client_reference
    HAVING COUNT(*) > 1
) dup ON r.client_reference = dup.client_reference;

-- Step 1: Delete duplicate reports for client_reference, keeping the most recent per client_reference
WITH ranked_client AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY client_reference
           ORDER BY updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS rn
    FROM reports
   WHERE client_reference IS NOT NULL AND trim(client_reference) <> ''
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked_client WHERE rn > 1);

-- Step 2: Add unique constraint on client_reference
ALTER TABLE reports
ADD CONSTRAINT reports_client_reference_key UNIQUE (client_reference);

COMMENT ON CONSTRAINT reports_client_reference_key ON reports IS 'Ensures each client reference appears at most once across all reports';

-- Step 3: Backup any existing duplicates for company_name
CREATE TABLE IF NOT EXISTS reports_duplicate_backup_company_name AS
SELECT r.*
FROM reports r
JOIN (
    SELECT company_name
    FROM reports
    WHERE company_name IS NOT NULL AND trim(company_name) <> ''
    GROUP BY company_name
    HAVING COUNT(*) > 1
) dup ON r.company_name = dup.company_name;

-- Step 4: Delete duplicate reports for company_name, keeping the most recent per company_name
WITH ranked_company AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_name
           ORDER BY updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS rn
    FROM reports
   WHERE company_name IS NOT NULL AND trim(company_name) <> ''
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked_company WHERE rn > 1);

-- Step 5: Add unique constraint on company_name
ALTER TABLE reports
ADD CONSTRAINT reports_company_name_key UNIQUE (company_name);

COMMENT ON CONSTRAINT reports_company_name_key ON reports IS 'Ensures each company name appears at most once across all reports';
