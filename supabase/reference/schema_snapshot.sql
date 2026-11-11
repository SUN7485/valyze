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

-- Helper function to generate the next valyze_id
create or replace function next_valyze_id() returns text as $$
declare
  next_num integer;
begin
  select coalesce(max(cast(substring(valyze_id from 5) as integer)), 0) + 1
  into next_num from clients;
  return 'VLZ-' || lpad(next_num::text, 4, '0');
end;
$$ language plpgsql;

-- Clients table
create table if not exists clients (
    id uuid primary key default uuid_generate_v4(),
    valyze_id text unique not null default next_valyze_id(),
    client_name text not null,
    client_type text check (client_type in ('company', 'bank', 'third_party')),
    contact_person text,
    email text,
    phone text,
    country text,
    address text,
    is_pilot boolean default false,
    monthly_volume_avg integer default 0,
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

create extension if not exists pgcrypto;

-- Client sessions table
create table if not exists client_sessions (
    id uuid primary key default uuid_generate_v4(),
    client_id uuid references clients(id) on delete cascade,
    token text unique not null default encode(gen_random_bytes(16), 'hex'),
    password_hash text not null,
    password_plain_temp text,
    portal_url text,
    expires_at timestamp with time zone default (now() + interval '30 days'),
    used_count integer default 0,
    max_uses integer default 10,
    created_at timestamp with time zone default now()
);

-- Orders table
create table if not exists orders (
    id uuid primary key default uuid_generate_v4(),
    order_number text unique not null,
    client_id uuid references clients(id),
    client_ref text,
    date_received timestamp with time zone default now(),
    service_level text not null check (service_level in ('basic', 'standard', 'express', 'urgent')),
    due_date timestamp with time zone,
    report_type text default 'standard' check (report_type in ('standard', 'full')),
    status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'invoiced')),
    company_count integer default 0,
    completed_count integer default 0,
    auto_assigned_analyst text,
    notes text,
    submitted_via_portal boolean default true,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Order companies table
create table if not exists order_companies (
    id uuid primary key default uuid_generate_v4(),
    order_id uuid references orders(id) on delete cascade,
    report_id uuid references reports(id),
    company_name text not null,
    country text,
    address text,
    registration_no text,
    vat_no text,
    phone text,
    fax text,
    requested_limit text,
    date_assigned timestamp with time zone,
    comments text,
    analyst_assigned text,
    status text default 'pending' check (status in ('pending', 'in_progress', 'completed')),
    sort_order integer default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Order files table
create table if not exists order_files (
    id serial primary key,
    order_id uuid not null references orders(id) on delete cascade,
    order_company_id uuid references order_companies(id) on delete cascade,
    filename text not null,
    file_path text not null,
    file_type text not null,
    file_size integer not null default 0,
    language text,
    pages integer,
    processed boolean default false,
    created_at timestamp with time zone default now()
);

-- Invoices table
create table if not exists invoices (
    id uuid primary key default uuid_generate_v4(),
    invoice_number text unique,
    order_id uuid references orders(id),
    client_id uuid references clients(id),
    service_level text,
    report_type text,
    company_count integer,
    unit_price decimal(10, 2),
    subtotal decimal(10, 2),
    is_pilot boolean default false,
    volume_discount_pct decimal(5, 2) default 0,
    discount_amount decimal(10, 2) default 0,
    total decimal(10, 2),
    currency text default 'USD',
    status text default 'draft' check (status in ('draft', 'sent', 'paid')),
    line_items jsonb,
    notes text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Enable RLS for new tables
alter table clients enable row level security;
alter table client_sessions enable row level security;
alter table orders enable row level security;
alter table order_companies enable row level security;
alter table order_files enable row level security;
alter table invoices enable row level security;

-- Create permissive policies for new tables
create policy "Allow all operations on clients" on clients
    for all using (true) with check (true);

create policy "Allow all operations on client_sessions" on client_sessions
    for all using (true) with check (true);

create policy "Allow all operations on orders" on orders
    for all using (true) with check (true);

create policy "Allow all operations on order_companies" on order_companies
    for all using (true) with check (true);

create policy "Allow all operations on order_files" on order_files
    for all using (true) with check (true);

create policy "Allow all operations on invoices" on invoices
    for all using (true) with check (true);

-- Create indexes for new tables
create index if not exists idx_clients_valyze_id on clients(valyze_id);
create index if not exists idx_orders_client_id on orders(client_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_order_companies_order_id on order_companies(order_id);
create index if not exists idx_order_companies_report_id on order_companies(report_id);
create index if not exists idx_order_files_order_id on order_files(order_id);
create index if not exists idx_order_files_order_company_id on order_files(order_company_id);
create index if not exists idx_invoices_order_id on invoices(order_id);
create index if not exists idx_client_sessions_token on client_sessions(token);
create index if not exists idx_client_sessions_client_id on client_sessions(client_id);

-- Comment the new tables
comment on table clients is 'Companies, banks, or third parties who place orders with Valyze';
comment on table client_sessions is 'One-time or limited-use portal access tokens sent to clients';
comment on table orders is 'Orders submitted by clients containing companies to be researched';
comment on table order_companies is 'Individual companies within an order, each becoming a Valyze report';
comment on table order_files is 'Files uploaded by clients through the portal and attached to orders or order companies.';
comment on table invoices is 'Billing documents generated per completed order';
