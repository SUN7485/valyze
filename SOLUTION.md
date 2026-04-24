# Fix for 500 Internal Server Error when importing JSON

## Problem
The backend returns 500 Internal Server Error when trying to create a report because:
1. The Supabase database tables (`reports` and `uploaded_files`) don't exist
2. The application tries to insert data but fails silently (no error shown in console)
3. The frontend shows generic "Internal server error" without details

## Solution
You need to create the required tables in your Supabase database:

### Step 1: Go to your Supabase dashboard
1. Navigate to: https://app.supabase.io
2. Select your project: `dnhtowmzrluqtlivdqqj` (from your .env file)
3. Go to the SQL Editor

### Step 2: Run the setup SQL
Copy and paste the following SQL into the Supabase SQL editor and run it:

```sql
-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Reports table
create table if not exists reports (
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

-- Uploaded files table
create table if not exists uploaded_files (
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

-- Enable RLS (Row Level Security) - optional but recommended
alter table reports enable row level security;
alter table uploaded_files enable row level security;

-- Create policies for anonymous access (adjust as needed for production)
-- Allow all operations for now - in production you'd want stricter policies
create policy "Allow all operations on reports" on reports
    for all using (true) with check (true);

create policy "Allow all operations on uploaded_files" on uploaded_files
    for all using (true) with check (true);

-- Create indexes for better performance
create index if not exists idx_reports_status on reports(status);
create index if not exists idx_uploaded_files_report_id on uploaded_files(report_id);

-- Comment the tables
comment on table reports is 'Credit reports storage';
comment on table uploaded_files is 'Files uploaded for credit reports';
```

### Step 3: Test the fix
1. Restart the backend: `cd D:\valyez final\backend && uvicorn main:app --reload --port 8000`
2. Try the JSON import again in the frontend
3. You should now see successful responses instead of 500 errors

## Verification
After running the SQL, you can verify the tables exist by:
1. Going to Supabase dashboard → Table Editor
2. You should see `reports` and `uploaded_files` tables listed
3. Or run: `select * from reports;` in SQL editor (should return empty set)

## Why this happened
The application uses Supabase as its primary database (not SQLite as noted in comments), but the tables were never created in your Supabase instance. The error was occurring silently in the Supabase client layer, causing 500 responses without helpful logs.