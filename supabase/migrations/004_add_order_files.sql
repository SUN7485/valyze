-- Migration: 004_add_order_files
-- Purpose: Store files attached by clients through the portal order submission flow.

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

create index if not exists idx_order_files_order_id on order_files(order_id);
create index if not exists idx_order_files_order_company_id on order_files(order_company_id);

alter table order_files enable row level security;

drop policy if exists "Allow all operations on order_files" on order_files;

create policy "Allow all operations on order_files" on order_files
    for all using (true) with check (true);

comment on table order_files is 'Files uploaded by clients through the portal and attached to orders or order companies.';
