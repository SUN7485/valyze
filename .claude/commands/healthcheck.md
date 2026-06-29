---
description: Check Valyze deployment health and required configuration
---

Verify the deployment is healthy and correctly configured.

1. Ask the user for the backend base URL if not known (or read `VITE_API_BASE_URL`).
2. Check these public endpoints and summarize results:
   - `GET /health` — should report supabase_url/supabase_key true, cors origin count.
   - `GET /ready` — should be `connected` (proves Supabase reachable + reports table).
   - `GET /ready/tables` — row counts for reports/clients/orders/invoices.
   - `GET /routes` + the `registered` map — confirm every router shows `OK` (not `FAIL`).
3. Confirm required env vars are set (do NOT print secret values):
   - Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `PORTAL_URL`
   - Frontend: `VITE_API_BASE_URL`
   - Flag if `JWT_SECRET` is unset (auth.py prints a warning when using the default).
4. Confirm pending DB migrations have been applied (currently 005 + 006 + app_users —
   see `supabase/migrations/`). These are applied manually in the Supabase SQL editor.

Report a short green/red checklist. Do not run destructive calls.
