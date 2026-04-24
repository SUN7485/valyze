# HOW TO FIX THE 500 INTERNAL SERVER ERROR

## The Problem
Your Supabase database is missing the required tables. The application needs:
1. `reports` table 
2. `uploaded_files` table

But they don't exist in your Supabase instance, causing 500 errors when the backend tries to create reports.

## The Solution

### Step 1: Access Supabase SQL Editor
1. Go to: https://app.supabase.io
2. Login and select your project: `dnhtowmzrluqtlivdqqj`
3. In the left sidebar, click "SQL Editor"

### Step 2: Execute the SQL
Copy and paste the ENTIRE content below into the SQL Editor and click "RUN":

```sql
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
```

### Step 3: Verify Tables Exist
After running the SQL, in the SQL Editor try:
```sql
select * from reports limit 1;
select * from uploaded_files limit 1;
```
Both should return empty results (no error).

### Step 4: Restart Backend
In your terminal:
```bash
cd D:\valyez final\backend
uvicorn main:app --reload --port 8000
```

### Step 5: Test
Try the JSON import in your frontend again - it should now work instead of showing 500 errors.

## Why This Fix Works
The error you saw: "foreign key constraint "uploaded_files_report_id_fkey" cannot be implemented. Key columns "report_id" and "id" are of incompatible types: uuid and text."
Means your existing `reports.id` column was TEXT type, not UUID. The SQL above drops and recreates both tables with proper UUID types to match.

The tables are now properly configured for the application to store reports and uploaded files.