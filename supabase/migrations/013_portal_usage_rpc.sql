-- Migration: 013_portal_usage_rpc
-- Purpose: Consume one use of a portal link atomically.
--
-- api/portal.py used to read used_count, add one in Python and write it back,
-- so concurrent submissions could exceed max_uses. This does the check and the
-- increment in a single UPDATE (the row lock serialises concurrent callers and
-- the WHERE clause is re-checked after the lock is acquired).
--
-- Returns true when a use was consumed, false when the session doesn't exist
-- or has reached max_uses (null max_uses = unlimited).
-- portal.py calls it via POST /rest/v1/rpc/increment_portal_session_use and falls
-- back to the old read-modify-write if this function isn't installed yet.

create or replace function public.increment_portal_session_use(p_session_id uuid)
returns boolean
language sql
volatile
set search_path = public
as $$
    with consumed as (
        update public.client_sessions
           set used_count = coalesce(used_count, 0) + 1
         where id = p_session_id
           and (max_uses is null or coalesce(used_count, 0) < max_uses)
        returning 1
    )
    select exists (select 1 from consumed);
$$;

-- Only the backend (service_role) may call it.
revoke all on function public.increment_portal_session_use(uuid) from public, anon, authenticated;
grant execute on function public.increment_portal_session_use(uuid) to service_role;

-- Make PostgREST pick up the new function without waiting for a reload.
notify pgrst, 'reload schema';
