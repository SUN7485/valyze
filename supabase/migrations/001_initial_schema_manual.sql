-- Migration: 001_initial_schema
-- Run this in Supabase Dashboard -> SQL Editor
-- Project: creditneatils (https://dnhtowmzrluqtlivdqqj.supabase.co)
-- Safe to run multiple times — creates tables if missing, adds columns, indexes, policies.

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Reports table (shared collection, no user_id)
-- ---------------------------------------------------------------------------
create table if not exists reports (
    id uuid primary key default uuid_generate_v4(),
    status text not null default 'uploading',
    report_json jsonb not null default '{}',
    extraction_stats_json jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    company_name text,
    legal_name text,
    cr_number text,
    client_reference text,
    country text,
    address text,
    analyst text
);

-- Add missing columns if table already existed without them
alter table reports
    add column if not exists company_name text,
    add column if not exists legal_name text,
    add column if not exists cr_number text,
    add column if not exists client_reference text,
    add column if not exists country text,
    add column if not exists address text,
    add column if not exists analyst text;

-- Indexes (create if not exists)
create index if not exists idx_reports_created_at on reports (created_at desc);
create index if not exists idx_reports_updated_at on reports (updated_at desc);
create index if not exists idx_reports_status on reports (status);
create index if not exists idx_reports_company_name on reports (company_name);
create index if not exists idx_reports_cr_number on reports (cr_number);
create index if not exists idx_reports_country on reports (country);
create index if not exists idx_reports_analyst on reports (analyst);

-- ---------------------------------------------------------------------------
-- Uploaded files table (tracks files linked to reports)
-- ---------------------------------------------------------------------------
create table if not exists uploaded_files (
    id serial primary key,
    report_id uuid not null references reports(id) on delete cascade,
    filename text not null,
    file_path text not null,
    file_type text not null,
    file_size integer not null default 0,
    language text,
    pages integer,
    processed boolean default false,
    created_at timestamptz default now()
);

create index if not exists idx_uploaded_files_report_id on uploaded_files(report_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS) — shared model: any authenticated user has full access
-- ---------------------------------------------------------------------------
alter table reports enable row level security;
alter table uploaded_files enable row level security;

-- Drop existing policies to allow re-run idempotently
drop policy if exists "reports authenticated read" on reports;
drop policy if exists "reports authenticated insert" on reports;
drop policy if exists "reports authenticated update" on reports;
drop policy if exists "reports authenticated delete" on reports;
drop policy if exists "uploaded_files authenticated read" on uploaded_files;
drop policy if exists "uploaded_files authenticated insert" on uploaded_files;
drop policy if exists "uploaded_files authenticated update" on uploaded_files;
drop policy if exists "uploaded_files authenticated delete" on uploaded_files;

-- Create fresh policies (full CRUD for any authenticated user)
create policy "reports authenticated read"
    on reports for select
    to authenticated
    using (auth.role() = 'authenticated');

create policy "reports authenticated insert"
    on reports for insert
    to authenticated
    with check (auth.role() = 'authenticated');

create policy "reports authenticated update"
    on reports for update
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

create policy "reports authenticated delete"
    on reports for delete
    to authenticated
    using (auth.role() = 'authenticated');

create policy "uploaded_files authenticated read"
    on uploaded_files for select
    to authenticated
    using (auth.role() = 'authenticated');

create policy "uploaded_files authenticated insert"
    on uploaded_files for insert
    to authenticated
    with check (auth.role() = 'authenticated');

create policy "uploaded_files authenticated update"
    on uploaded_files for update
    to authenticated
    using (auth.role() = 'authenticated')
    with check (auth.role() = 'authenticated');

create policy "uploaded_files authenticated delete"
    on uploaded_files for delete
    to authenticated
    using (auth.role() = 'authenticated');

-- Comments
comment on table reports is 'Shared report collection — all authenticated users have full CRUD access. No per-user isolation.';
comment on table uploaded_files is 'Tracks files for reports. Shared among all authenticated users.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists update_reports_updated_at on reports;
create trigger update_reports_updated_at
    before update on reports
    for each row
    execute function update_updated_at_column();


