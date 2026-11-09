-- Migration: 012_lockdown_rls
-- Purpose: Close direct database access through the public anon key.
--
-- supabase_setup.sql (and 004_add_order_files.sql) created
-- `for all using (true) with check (true)` policies with no `to` clause, so the
-- anon key — which is public by design — could read and write every table,
-- including client_sessions (portal tokens, password hashes). 001 granted full
-- CRUD on reports to any Supabase-Auth `authenticated` user as well.
--
-- Nothing legitimate depends on those policies: the backend talks to PostgREST
-- with the service_role key, which bypasses RLS, and no frontend calls Supabase
-- directly. So: RLS ON for every application table, NO policies, and no table
-- privileges for anon/authenticated. Safe to run more than once.

-- 1. Drop the known permissive policies by name.
drop policy if exists "Allow all operations on reports"         on reports;
drop policy if exists "Allow all operations on uploaded_files"  on uploaded_files;

drop policy if exists "authenticated read access"   on reports;
drop policy if exists "authenticated insert access" on reports;
drop policy if exists "authenticated update access" on reports;
drop policy if exists "authenticated delete access" on reports;

drop policy if exists "reports authenticated read"   on reports;
drop policy if exists "reports authenticated insert" on reports;
drop policy if exists "reports authenticated update" on reports;
drop policy if exists "reports authenticated delete" on reports;
drop policy if exists "uploaded_files authenticated read"   on uploaded_files;
drop policy if exists "uploaded_files authenticated insert" on uploaded_files;
drop policy if exists "uploaded_files authenticated update" on uploaded_files;
drop policy if exists "uploaded_files authenticated delete" on uploaded_files;

-- Tables below were created outside the migration files, so guard each one.
do $$
declare
    t text;
    pol record;
begin
    foreach t in array array[
        'reports', 'uploaded_files', 'clients', 'client_sessions', 'orders',
        'order_companies', 'order_files', 'invoices', 'app_users',
        'reports_duplicate_backup'
    ]
    loop
        if to_regclass('public.' || t) is null then
            raise notice 'lockdown: table public.% does not exist, skipping', t;
            continue;
        end if;

        -- 2. Drop EVERY remaining policy on the table (including the
        --    "Allow all operations on …" ones and anything added in the dashboard).
        for pol in
            select policyname from pg_policies
            where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy if exists %I on public.%I', pol.policyname, t);
        end loop;

        -- 3. RLS on, with no policies: only service_role (the backend) gets in.
        execute format('alter table public.%I enable row level security', t);

        -- 4. Belt and braces: no table privileges for the public API roles.
        execute format('revoke all on table public.%I from anon, authenticated', t);
    end loop;
end
$$;

-- 5. Portal passwords are shown once and never stored (see api/clients.py).
--    Clear any plaintext left over from before that change.
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'client_sessions'
          and column_name = 'password_plain_temp'
    ) then
        update public.client_sessions
           set password_plain_temp = null
         where password_plain_temp is not null;
    end if;
end
$$;

-- Verify (should return no rows for these tables):
--   select tablename, policyname, roles from pg_policies
--   where schemaname = 'public'
--     and tablename in ('reports','uploaded_files','clients','client_sessions','orders',
--                       'order_companies','order_files','invoices','app_users');
