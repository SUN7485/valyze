-- Migration: 005_add_speed_and_features
-- Purpose: Add speed column, cancelled status, disabled sessions, overdue status

-- Add speed column to orders
alter table orders 
    add column if not exists speed text default '5_days';

-- Update check constraint for orders status to include cancelled and overdue
alter table orders 
    drop constraint if exists orders_status_check;

alter table orders 
    add constraint orders_status_check 
    check (status in ('pending', 'in_progress', 'completed', 'invoiced', 'cancelled', 'overdue'));

-- Update check constraint for order_companies status to include cancelled
alter table order_companies 
    drop constraint if exists order_companies_status_check;

alter table order_companies 
    add constraint order_companies_status_check 
    check (status in ('pending', 'in_progress', 'completed', 'cancelled'));

-- Drop the old service_level check constraint to allow new speed values
-- (but keep service_level as display tier)
alter table orders 
    drop constraint if exists orders_service_level_check;

-- Add priority column to orders
alter table orders 
    add column if not exists priority integer default 0;

-- Add disabled column to client_sessions
alter table client_sessions 
    add column if not exists disabled boolean default false;

-- Add no_expiry column to client_sessions
alter table client_sessions 
    add column if not exists no_expiry boolean default false;

-- Add priority index
create index if not exists idx_orders_priority on orders(priority desc);
create index if not exists idx_orders_due_date on orders(due_date);
create index if not exists idx_orders_speed on orders(speed);

comment on column orders.speed is 'Service speed: 7_days, 5_days, 3_days, 2_days, 1_day, 24_hours';
comment on column orders.priority is 'Priority level for sorting (higher = more urgent)';
comment on column client_sessions.disabled is 'Temporarily disable portal session without deleting';
comment on column client_sessions.no_expiry is 'If true, session never expires';
