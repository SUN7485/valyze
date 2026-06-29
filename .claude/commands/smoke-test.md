---
description: Simulate the core Valyze workflows end-to-end and hunt for bugs
---

Act as a real user and trace every critical workflow in this codebase, looking for
broken pipelines, signature mismatches, dict-vs-attribute access bugs, missing auth,
and serverless-incompatible code. Do NOT just read — follow the data across files.

Workflows to simulate (frontend call → backend route → supabase_client → DB):
1. **Login** → `/api/auth/login` → `app_users` lookup. Check JWT issuance + role gating.
2. **Client + portal link** → create client → `generate-portal-link` (forever links:
   no_expiry/disabled honored in `portal.py` auth/submit and `clients.py` validity).
3. **Portal order** → `/api/portal/submit-order-with-files` → order + order_companies +
   files to Supabase Storage (`storage://`). Verify `speed`/report_types validation.
4. **Start work** → `/api/orders/{id}/companies/{cid}/start` → report created, portal
   files linked (storage path, NOT local disk). 
5. **Extractor** → `ExtractorPage` auto-loads files via `/api/upload/portal-files` +
   `/api/upload/download` (both need a Bearer token). Client-side Anthropic via `/api/proxy`.
6. **Editor → generate → PDF → invoice** → `easy-way`, narratives, pdf, `_trigger_invoice_creation`.

For each step verify:
- The supabase_client function signature matches every caller (the reports-list bug was
  a `limit=`/`offset=` mismatch). Grep callers.
- Supabase rows are read with `.get("x")`, never `.x` (dicts, not objects).
- Endpoints consumed via axios/fetch carry auth; raw-URL endpoints (pdf/export download)
  must stay public or use a query token.
- No reliance on local-disk persistence between requests (Vercel is ephemeral).

Then: report findings as a prioritized list (critical → minor). Fix the safe, verified
ones; flag risky/ambiguous ones. Run `python -c "import ast; ..."` on changed backend
files and `npx vite build` on the frontend before committing. See CLAUDE.md for context.
