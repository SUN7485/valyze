-- Migration: 002_add_unique_cr_number
-- Purpose: Prevent duplicate reports for the same company by enforcing cr_number uniqueness
-- Created: 2026-05-01

-- Step 0: Backup any existing duplicates before cleanup
-- This creates a snapshot of all reports that share a CR number with another report
CREATE TABLE IF NOT EXISTS reports_duplicate_backup AS
SELECT r.*
FROM reports r
JOIN (
    SELECT cr_number
    FROM reports
    WHERE cr_number IS NOT NULL
    GROUP BY cr_number
    HAVING COUNT(*) > 1
) dup ON r.cr_number = dup.cr_number;

-- Step 1: Normalize empty CR numbers to NULL
-- Treat empty or whitespace-only strings as missing values
UPDATE reports
SET cr_number = NULL
WHERE cr_number IS NOT NULL
  AND trim(cr_number) = '';

-- Step 2: Delete duplicate reports, keeping the most recent per CR number
-- We define "most recent" by updated_at DESC, then created_at DESC, then id DESC
-- This preserves the latest version of each company's data
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY cr_number
           ORDER BY updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id DESC
         ) AS rn
  FROM reports
  WHERE cr_number IS NOT NULL
)
DELETE FROM reports
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 3: Add unique constraint on cr_number
-- PostgreSQL allows multiple NULLs in a unique column, so this only enforces uniqueness for non-NULL values
ALTER TABLE reports
ADD CONSTRAINT reports_cr_number_key UNIQUE (cr_number);

-- Optional: add a comment explaining the constraint
COMMENT ON CONSTRAINT reports_cr_number_key ON reports IS 'Ensures each Commercial Registration (CR) number appears at most once across all reports';

  