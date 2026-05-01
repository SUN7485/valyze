-- Migration: 002_add_unique_constraints
-- Purpose: Prevent duplicate reports for the same company by enforcing unique cr_number, client_reference, and company_name
-- Created: 2026-05-01

-- Step 0: Backup any existing duplicates before cleanup
CREATE TABLE IF NOT EXISTS reports_duplicate_backup AS
SELECT r.*
FROM reports r
WHERE r.cr_number IN (
    SELECT cr_number FROM reports WHERE cr_number IS NOT NULL GROUP BY cr_number HAVING COUNT(*) > 1
)
   OR r.client_reference IN (
    SELECT client_reference FROM reports WHERE client_reference IS NOT NULL GROUP BY client_reference HAVING COUNT(*) > 1
)
   OR r.company_name IN (
    SELECT company_name FROM reports WHERE company_name IS NOT NULL GROUP BY company_name HAVING COUNT(*) > 1
);

-- Step 1: Normalize empty values to NULL
UPDATE reports
SET cr_number = NULL
WHERE cr_number IS NOT NULL AND trim(cr_number) = '';

UPDATE reports
SET client_reference = NULL
WHERE client_reference IS NOT NULL AND trim(client_reference) = '';

UPDATE reports
SET company_name = NULL
WHERE company_name IS NOT NULL AND trim(company_name) = '';

-- Step 2: Delete duplicate reports (keep most recent per CR)
WITH ranked_cr AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY cr_number
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM reports
  WHERE cr_number IS NOT NULL
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked_cr WHERE rn > 1);

-- Step 3: Delete duplicate reports (keep most recent per client_reference)
WITH ranked_client AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY client_reference
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM reports
  WHERE client_reference IS NOT NULL
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked_client WHERE rn > 1);

-- Step 4: Delete duplicate reports (keep most recent per company_name)
WITH ranked_company AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_name
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM reports
  WHERE company_name IS NOT NULL
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked_company WHERE rn > 1);

-- Step 5: Add unique constraint on cr_number (NULLs allowed)
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_cr_number_key;

ALTER TABLE reports
ADD CONSTRAINT reports_cr_number_key UNIQUE (cr_number);

-- Step 6: Add unique constraint on client_reference (NULLs allowed)
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_client_reference_key;

ALTER TABLE reports
ADD CONSTRAINT reports_client_reference_key UNIQUE (client_reference);

-- Step 7: Add unique constraint on company_name (NULLs allowed)
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_company_name_key;

ALTER TABLE reports
ADD CONSTRAINT reports_company_name_key UNIQUE (company_name);

-- Comments
COMMENT ON CONSTRAINT reports_cr_number_key ON reports IS 'Ensures each Commercial Registration (CR) number appears at most once';
COMMENT ON CONSTRAINT reports_client_reference_key ON reports IS 'Ensures each client reference appears at most once';
COMMENT ON CONSTRAINT reports_company_name_key ON reports IS 'Ensures each company name appears at most once';
