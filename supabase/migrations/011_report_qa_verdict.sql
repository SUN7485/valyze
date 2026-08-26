-- 011_report_qa_verdict.sql
--
-- Persist the QA verdict on the report so it survives across users and sessions.
--
-- Until this runs, the QA page still works (it caches its result in the browser's
-- sessionStorage), but the admin delivery page cannot see another analyst's QA run
-- and will show every report as "Not checked".
--
-- THIS PROJECT HAS NO MIGRATION RUNNER. Paste this into the Supabase SQL editor
-- and run it by hand.

alter table reports
    add column if not exists qa_verdict text,
    add column if not exists qa_checked_at timestamp with time zone,
    add column if not exists qa_finding_count integer,
    add column if not exists qa_critical_count integer,
    add column if not exists qa_major_count integer,
    add column if not exists qa_minor_count integer,
    add column if not exists qa_findings jsonb,
    add column if not exists delivered_at timestamp with time zone;

comment on column reports.qa_verdict is
    'Last AI QA verdict: pass | fail. NULL means never checked — three distinct states, never collapse NULL into pass.';
comment on column reports.qa_checked_at is
    'When the last QA check ran.';
comment on column reports.qa_finding_count is
    'How many findings the last QA check produced.';
comment on column reports.qa_critical_count is
    'Findings at severity=critical in the last QA run. Drives the team KPI page.';
comment on column reports.qa_major_count is
    'Findings at severity=major in the last QA run.';
comment on column reports.qa_minor_count is
    'Findings at severity=minor in the last QA run.';
comment on column reports.qa_findings is
    'Full findings array from the last QA run, so an admin can read the actual mistakes before sending — not just the counts.';
comment on column reports.delivered_at is
    'When the report was sent to the client. NULL means not yet delivered.';

-- The KPI page groups by analyst over a rolling window.
create index if not exists idx_reports_analyst_qa
    on reports (analyst, qa_checked_at);

-- The admin delivery page filters on "completed and not yet delivered".
create index if not exists idx_reports_delivery
    on reports (status, delivered_at);
