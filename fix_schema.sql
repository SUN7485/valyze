-- Fix schema to match existing reports table (id is text, not uuid)

-- Drop tables if they exist (CAUTION: this will delete data)
-- Uncomment only if you want to start fresh
-- drop table if exists uploaded_files;
-- drop table if exists reports;

-- Enable UUID extension (for other uses, not for reports.id)
create extension if not exists "uuid-ossp";

-- Reports table (matching existing schema where id is text)
-- Only run this if the table doesn't exist or you want to recreate it
create table if not exists reports (
    id text primary key,
    status text not null default 'uploading',
    report_json jsonb not null default '{}'::jsonb,
    company_name text,
    legal_name text,
    cr_number text,
    client_reference text,
    country text,
    address text,
    analyst text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Uploaded files table (using text for report_id to match reports.id)
create table if not exists uploaded_files (
    id uuid primary key default uuid_generate_v4(),
    report_id text not null references reports(id) on delete cascade,
    filename text not null,
    file_path text not null,
    file_type text not null,
    file_size integer not null,
    language text,
    pages integer,
    processed boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security) - optional but recommended
alter table reports enable row level security;
alter table uploaded_files enable row level security;

-- Create policies for anonymous access (adjust as needed for production)
create policy if not exists "Allow all operations on reports" on reports
    for all using (true) with check (true);

create policy if not exists "Allow all operations on uploaded_files" on uploaded_files
    for all using (true) with check (true);

-- Create indexes for better performance
create index if not exists idx_reports_status on reports(status);
create index if not exists idx_uploaded_files_report_id on uploaded_files(report_id);

-- Comment the tables
comment on table reports is 'Credit reports storage';
comment on table uploaded_files is 'Files uploaded for credit reports';
