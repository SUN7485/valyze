-- Migration: 001_initial_schema
-- Purpose: Initial schema for Valyze Credit Reports on Supabase
-- Model: Shared data — all authenticated users can access all reports
-- Created by: Production Readiness Plan

-- Enable UUID extension if not already
create extension if not exists "uuid-ossp";

-- Drop existing table if we need to reset (careful in prod!)
-- drop table if exists reports cascade;

-- Reports table (shared collection, no user_id)
create table if not exists reports (
    id uuid primary key default uuid_generate_v4(),
    status text not null default 'uploading',
    report_json jsonb not null default '{}',
    extraction_stats_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_reports_created_at on reports (created_at desc);
create index if not exists idx_reports_updated_at on reports (updated_at desc);
create index if not exists idx_reports_status on reports (status);

-- Row Level Security (RLS)
-- All authenticated users can read/write/delete any report (shared model)
alter table reports enable row level security;

-- Policy: Authenticated users can SELECT (read) all reports
create policy "authenticated read access"
    on reports for select
    to authenticated
    using (auth.role() = 'authenticated');

-- Policy: Authenticated users can INSERT (create) reports
create policy "authenticated insert access"
    on reports for insert
    to authenticated
    with check (auth.role() = 'authenticated');

-- Policy: Authenticated users can UPDATE any report
create policy "authenticated update access"
    on reports for update
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

-- Policy: Authenticated users can DELETE any report
create policy "authenticated delete access"
    on reports for delete
    to authenticated
    using (auth.role() = 'authenticated');

-- Comment explaining shared data model
comment on table reports is 'Shared report collection — all authenticated users have full CRUD access. No per-user isolation.';

-- Function to update updated_at on row change
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger update_reports_updated_at
    before update on reports
    for each row
    execute function update_updated_at_column();
