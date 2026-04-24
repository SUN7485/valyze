-- First, let's check what tables exist and their structure
-- Drop existing tables if they exist to start fresh
drop table if exists uploaded_files;
drop table if exists reports;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create reports table with proper UUID
create table reports (
    id uuid primary key default uuid_generate_v4(),
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

-- Create uploaded_files table with proper UUID
create table uploaded_files (
    id uuid primary key default uuid_generate_v4(),
    report_id uuid not null references reports(id) on delete cascade,
    filename text not null,
    file_path text not null,
    file_type text not null,
    file_size integer not null,
    language text,
    pages integer,
    processed boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table reports enable row level security;
alter table uploaded_files enable row level security;

-- Create permissive policies for development
create policy "Allow all operations on reports" on reports
    for all using (true) with check (true);

create policy "Allow all operations on uploaded_files" on uploaded_files
    for all using (true) with check (true);

-- Create indexes
create index if not exists idx_reports_status on reports(status);
create index if not exists idx_uploaded_files_report_id on uploaded_files(report_id);

-- Comment tables
comment on table reports is 'Credit reports storage';
comment on table uploaded_files is 'Files uploaded for credit reports';