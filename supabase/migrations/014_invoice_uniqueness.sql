-- 014_invoice_uniqueness.sql
--
-- Make the two invoice invariants the backend relies on enforceable:
--   1. invoice_number is unique   — two concurrent invoice creations that read
--      the same max number now collide (23505) and the backend retries with the
--      next number, instead of silently writing a duplicate number.
--   2. one invoice per order      — a second concurrent creation for the same
--      order fails, and the backend returns the invoice that won.
--
-- The backend works WITHOUT this migration (it re-checks for an existing
-- invoice and retries number collisions it can detect); this closes the races.
--
-- Safe & idempotent. Each index is skipped, with a NOTICE, when existing rows
-- already violate it — resolve those duplicates by hand, then re-run.
--
-- THIS PROJECT HAS NO MIGRATION RUNNER. Paste this into the Supabase SQL editor
-- and run it by hand.

do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'invoice_number'
    ) then
        if exists (
            select invoice_number from invoices
            where invoice_number is not null
            group by invoice_number having count(*) > 1
        ) then
            raise notice 'invoices.invoice_number has duplicates — unique index NOT created. Fix them and re-run.';
        else
            create unique index if not exists invoices_invoice_number_uidx on invoices (invoice_number);
        end if;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'invoices' and column_name = 'order_id'
    ) then
        if exists (
            select order_id from invoices
            where order_id is not null
            group by order_id having count(*) > 1
        ) then
            raise notice 'Some orders have more than one invoice — unique index on invoices.order_id NOT created. Fix them and re-run.';
        else
            create unique index if not exists invoices_order_id_uidx on invoices (order_id);
        end if;
    end if;
end $$;
