-- 015_report_qa_checked_by.sql
--
-- Record WHO recorded a report's QA verdict (the reviewer's email), next to the
-- verdict columns added in 011. The delivery API refuses a verdict from the
-- report's own analyst; this column keeps the audit trail of who signed off.
--
-- The backend works without it (it retries the write without the column).
--
-- THIS PROJECT HAS NO MIGRATION RUNNER. Paste this into the Supabase SQL editor
-- and run it by hand (after 011).

alter table reports
    add column if not exists qa_checked_by text;

comment on column reports.qa_checked_by is
    'Email of the reviewer/admin who recorded the last QA verdict.';
