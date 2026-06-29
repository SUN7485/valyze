-- Migration: 006_performance_indexes
-- Purpose: Add indexes on the foreign keys and filter columns that the app
--          queries on every request. Without these, Postgres does a full table
--          scan for portal auth, order/company lookups, invoices, etc — which
--          degrades badly as data grows.
--
-- Safe & idempotent: each index is only created if the target column actually
-- exists (the orders/clients/invoices tables were created outside the migration
-- files, so we guard against schema drift). Re-running this is a no-op.

do $$
declare
    idx record;
begin
    for idx in
        select * from (values
            -- Orders: filtered by client and status constantly
            ('orders',          'client_id',  'idx_orders_client_id'),
            ('orders',          'status',     'idx_orders_status'),
            -- Order companies: the work queue + every order detail view joins on these
            ('order_companies', 'order_id',   'idx_order_companies_order_id'),
            ('order_companies', 'report_id',  'idx_order_companies_report_id'),
            ('order_companies', 'status',     'idx_order_companies_status'),
            -- Client sessions: portal auth looks up by token on every login (hot path)
            ('client_sessions', 'token',      'idx_client_sessions_token'),
            ('client_sessions', 'client_id',  'idx_client_sessions_client_id'),
            ('client_sessions', 'expires_at', 'idx_client_sessions_expires_at'),
            -- Invoices: listed/filtered by order, client and status
            ('invoices',        'order_id',   'idx_invoices_order_id'),
            ('invoices',        'client_id',  'idx_invoices_client_id'),
            ('invoices',        'status',     'idx_invoices_status')
        ) as t(tbl, col, idxname)
    loop
        if exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = idx.tbl
              and column_name = idx.col
        ) then
            execute format('create index if not exists %I on %I (%I)', idx.idxname, idx.tbl, idx.col);
        end if;
    end loop;
end $$;
