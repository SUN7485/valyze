-- Phase 2.7: persist the portal's multi-select report_types on the order.
-- Stored as a comma-separated string (e.g. "credit_report,registration,ubo").
alter table orders add column if not exists report_types text;
