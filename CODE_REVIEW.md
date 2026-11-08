# Valyze — Full Code Review

_Date: 2026-11-08 · Scope: whole repo (backend FastAPI, frontend React, valyze-portal, Supabase SQL, deploy config, repo hygiene) · Read-only review, nothing changed in code._

Each finding was checked against the code. The ones marked **[verified]** were also reproduced by running code. Anything that depends on the live database or deployment, which I couldn't see, is marked **[verify in prod]**. Prior audit: `SECURITY_FINDINGS.md` (2026-07). Its open items C1, C2, H2 and M1–M4 still apply and are repeated here only where something has changed.

---

## TL;DR — fix these first

| # | Severity | Issue | Where |
|---|---|---|---|
| 1 | **Critical** | A client's **portal token is accepted as a staff login**. Any external client can read, edit and delete every report and order. | `api/auth.py:330` `get_current_user` |
| 2 | **Critical** [verify in prod] | **Allow-all RLS policies for every role**, combined with an anon key that is committed to git. If `supabase_setup.sql` was ever run, anyone can read or write every table directly, skipping the backend. | `supabase_setup.sql:40-44,188-204`, `frontend/.env`, `test_supabase.ps1` |
| 3 | **Critical** [verify in prod] | **`render.yaml` deploys `main.py`, which has no auth on any router**, and serves `/uploads` and `/outputs` as public static files. | `render.yaml`, `backend/Dockerfile:61`, `backend/main.py:146-157` |
| 4 | High | **Seed passwords in source** (`Superadmin@123`, …). The in-memory fallback uses them whenever the DB is unreachable. | `api/auth.py:110-117,162` |
| 5 | High | **No role checks on invoices or clients.** Any analyst or reviewer can rewrite invoice totals, mark invoices paid, delete clients, and generate or reset portal passwords. | `api/invoices.py:276,343,367`; `api/clients.py:215-410` |
| 6 | High | **Delivery email says the report is "attached" but attaches nothing**, then marks the report delivered. | `api/delivery.py:552-564` |
| 7 | High | **Field edits get lost or show as saved when they failed.** The backend does read-modify-write with no lock, the frontend never sends `last_known_updated_at`, and `ReportContext` swallows save errors. | `ReportContext.jsx:197-203`, `crud.py:101-115` |
| 8 | High | **Several UI features hit routes that don't exist**: PDF download, Reports-page export, generate, extract, Save Locally, and array edits for three fields. | see §3 |

---

## 1. Critical

### C-1 Portal (client) JWT passes staff auth **[verified]**
- `portal.py:create_portal_token` signs `{session_id, client_id, type:"portal"}` with the **same** `JWT_SECRET` as staff tokens.
- `auth.py:decode_token` / `get_current_user` / `get_current_user_flexible` never check `type`, `sub` or `role`.
- Reproduced: `get_current_user(<portal token>)` returns the payload instead of 401.
- **Impact:** an external client logs into the portal, takes `portal_token` from localStorage, and calls staff endpoints:
  - `GET /api/reports/` (every client's credit reports), `DELETE /api/reports/{id}`, search, cloud, pdf, export, upload.
  - The orders, invoices, clients and delivery endpoints that only use `get_current_user`.
  - `/api/proxy` too, which spends the company Anthropic key if `ANTHROPIC_API_KEY` is set.
  - Only `require_admin`/`require_super_admin` routes stop them, and only because the token has no `role`.
- **Fix:**
  - Have staff `decode_token` reject any token that has a `type` claim or lacks `sub`/`role`: `if payload.get("type") == "portal" or "role" not in payload: raise 401`.
  - Better: use a separate secret, or a separate `aud` claim, for portal tokens.
  - Also re-load the user on each request so deleted or demoted users lose access before the 24-hour token expiry.

### C-2 World-open RLS policies + committed anon key **[verify in prod]**
- `supabase_setup.sql` turns RLS on and then adds `for all using (true) with check (true)` with **no `to` clause** on `reports`, `uploaded_files`, `clients`, `client_sessions`, `orders`, `order_companies`, `order_files` and `invoices`. Migration `004` does the same for `order_files`.
- The anon key is committed (`frontend/.env`, `test_supabase.ps1`) and is public by design anyway.
- **Impact if applied:** anyone can run `curl $SUPABASE_URL/rest/v1/client_sessions?select=*` with the anon key and get portal tokens, password hashes and `password_plain_temp`. The same works for all reports and invoices, and the tables can be written to and deleted from.
- **Fix:** in the Supabase dashboard, check the policies on every table. The backend uses the service-role key (which bypasses RLS) and the frontend never calls Supabase directly (`frontend/src/supabase/client.js` is imported nowhere), so it is safe to `drop policy "Allow all operations on …"` everywhere. Leave RLS on with no anon policies.
- Also from the old audit, still open: the **service-role key is still in git history** (commit `7373665` untracked it but didn't purge it). Rotate it if that hasn't been done.

### C-3 Unauthenticated `main.py` is a deploy target **[verify in prod]**
- `render.yaml` (with `autoDeploy`) → `backend/Dockerfile` → `uvicorn main:app`.
- `main.py` mounts `upload/report/pdf/export/search/cloud` **without** the auth dependencies that `index.py` adds, exposes `/routes`, and serves `/uploads` and `/outputs` statically.
- **Fix:** if Render isn't used, delete `render.yaml` and the Dockerfile `CMD`. Otherwise make `main.py` simply `from api.index import app`.

---

## 2. Security — High / Medium

| Sev | Finding | Where | Fix |
|---|---|---|---|
| High | Seed passwords in source (C2 in the old audit, still open). In-memory seeds are used whenever `app_users` can't be read, so a DB outage makes `superadmin@valyze.com / Superadmin@123` valid. | `auth.py:110-117,155-163` | Seed from env or random values, force a password change, and don't fall back to seeds in prod (fail closed). |
| High | No role checks on invoice PATCH, mark-paid or generate. Negative amounts are accepted and totals are never recomputed from line items. | `invoices.py:39-43,276,343,367` | `require_admin`, `ge=0`, compute totals on the server. |
| High | No role checks on client create/delete or portal link/password/reset/enable/no-expiry. The routes return plaintext portal passwords to any staff role. | `clients.py:215,265,286,349,360,386,410` | `require_admin`. |
| Medium | Any role can set any order status and counters. Setting `completed` creates an invoice even when companies are unfinished. The company PATCH can set `status`, `analyst_assigned` and `report_id`, bypassing the workflow and the admin check. | `orders.py:801-879` | Allowed-transition table; drop those fields from `UpdateCompanyRequest`. |
| Medium | Any logged-in user can delete any report, through three separate endpoints. | `report.py:1231`, `cloud.py:183`, `search.py:222` | Admin-only, and keep one endpoint. |
| Medium | Any user, including the report's author, can mark a report's QA as "pass", and that verdict is the only gate before it is sent to the client. | `delivery.py:101-128` | Record who verified it; require reviewer/admin and not the author. |
| Medium | The full 24-hour staff JWT goes into URLs (`?token=`) for PDF and export, so it lands in Vercel logs, browser history, and copied preview links. | `client.js:25-29` | Short-lived token scoped to one report and one action. |
| Medium | PDF fallback renderers don't escape HTML (`_render_mustache`, `_emergency_html`). Colour and score fields go unvalidated into `style=""`, allowing CSS injection (e.g. `url(//attacker)`). The preview opens on the API origin with `?token=` in the URL. | `pdf_generator.py:1094-1098,1233-1341,1452-1479`; `template.html:2628-2642` | `html.escape`; whitelist colours and coerce scores to numbers. |
| Medium | Server HTML is written into same-origin `about:blank` windows and iframes without a sandbox. Escaping is fine today, but there is no second line of defence. | `EditorPage.jsx:170`, `OrderDetailPage.jsx:828`, `Invoice*.jsx` | `<iframe sandbox srcdoc>` or a Blob URL. |
| Medium | No rate limiting on `/api/auth/login` or `/api/portal/auth` (M4 in the old audit). | — | Throttle per IP and per account. |
| Medium | Plaintext portal passwords are kept in `client_sessions.password_plain_temp` (H2 in the old audit). | `clients.py` | Show once, never store. |
| Medium | `/ready/tables` is unauthenticated. It pulls `select=*` from clients, orders and invoices plus 1,000 reports just to call `len()`, which is cheap to abuse for load and reveals business volume. It and `/ready` also return `str(e)`. | `index.py:131-168` | Admin-only, count headers, generic errors. |
| Medium | The Anthropic key, `valyze_pending_import` and `current_report_id` survive logout in localStorage, which matters on shared workstations. | `AuthContext.jsx:49-52` | Clear them on logout. |
| Low | Report and other ids go unencoded into PostgREST URLs (`?id=eq.{id}`). Filters are ANDed, so I found no way to widen a query, but these are malformed requests waiting to happen. | `supabase_client.py:166,651,698,750…` | `quote(id, safe='')` + `REPORT_ID_PATTERN`. |
| Low | Staff `/portal` page (`PortalPage.jsx`) duplicates `valyze-portal`. `clients.py:59` falls back to `FRONTEND_URL` when `PORTAL_URL` is unset, which puts clients on the origin that holds staff tokens. | — | Keep one portal; make `PORTAL_URL` required. |

---

## 3. Broken features (things users can click that don't work)

1. **Array edits for `board_members`, `extra_reg_fields` and `hidden_fields` always 400.** They are missing from `ARRAY_FIELDS` (`models/field_meta.py:479`), and `ReportContext` silently reloads. The "hide field" eye toggle never reaches the PDF (`hidden_fields` is also missing from `ReportArrays`).
2. **PDF download.** `/api/pdf/download/{id}` doesn't exist, so DonePage and the Reports-page PDF export get 404. DonePage also checks `pdf_exists`, but the backend returns `can_generate`.
3. **Reports-page export** throws away the file the `exportX()` call returns, then opens `/api/export/download/...`, which reads `/tmp/outputs`. Nothing writes there, so it always 404s. EditorPage's `handleExport` already does this correctly.
4. **`generate.py` and `extract.py`** import modules that don't exist (`services.auth`, `ai.*`, `calculations.*`) and aren't registered in `index.py`. GeneratingPage, the editor "regenerate" buttons (P03/P04/P16) and UploadPage→ProcessingPage all 404.
5. **"Save Locally"** calls `reportAPI.loadFromCloud`, which doesn't exist (`EditorPage.jsx:369`). **"Save to cloud"** (`cloud.py:155-169`) saves nothing and returns success.
6. **Delivery email has no attachment** (see TL;DR #6). The invoice it builds is priced wrongly: no `invoice_count`, so pilot clients always get $25, and the lines read "Company 1..N" (`delivery.py:486`).
7. **Search with Arabic text or spaces returns nothing.** Values are `quote()`d and then re-escaped by `requests` (`%` → `%25`). This affects report search, client search and the Company Intel duplicate check. `supabase_client.py:251,264-267,392-396`; `company_intel.py:101,110`. Fix: pass values via `params=`, use the `*` wildcard, and double-quote values inside `or=()`.
8. **Downloads of files with Arabic names → 500 [verified].** `Content-Disposition: filename="تقرير.pdf"` raises `UnicodeEncodeError` (latin-1). Portal filenames keep Unicode and are copied into `uploaded_files`, so the Extractor can't load them. The same happens in CSV/XML export for Arabic company names (`export.py:82,104,123`). Fix: RFC 5987 `filename*=UTF-8''…` with an ASCII fallback.
9. **Analyst load balancing never happens.** The workload query (`count:id.count`, `group=`) isn't valid PostgREST, and the error comes back as `[]`, so assignment is plain round-robin (`supabase_client.py:1300-1307`).
10. **KPI "completed" count is always 0.** It checks `"completed"`, but reports use `"complete"` (`delivery.py:373`).
11. **Home dashboard numbers are wrong:**
    - "My orders" reads `o.analyst`, but the field is `auto_assigned_analyst`.
    - The invoiced amount sums `amount`, but the field is `total`.
    - It filters on status `'unpaid'`, which doesn't exist.
    - `totalReports` is capped at 10.

    (`HomePage.jsx:311-316`)
12. **The 403 "forbidden" screens never render.** The axios interceptor replaces errors with `new Error(msg)`, which drops `.response` (`client.js:58`). Every `e.response?.…` read in the app is dead.
13. **Order never reaches `invoiced`.** Auto-invoice on completion leaves the order `completed`, and `/invoices/generate` then 409s. So the `invoiced` delete/cancel guards never fire, and billed orders can be deleted, leaving their invoices orphaned.
14. **Import 500s:**
    - `country` sent as `{"value":…}` → `.lower()` on a dict (`report.py:887`).
    - SWOT items that are objects → `unhashable type: 'dict'` (`report.py:403`).
15. **The post-import order-status check never runs.** `get_order_companies(order_id)` is called with a report id (`report.py:1176`), and `"..." + exc` at `:1185` would raise.
16. **The UI doesn't learn the order completed.** `complete_company_work` doesn't return the `order_status` that `OrderDetailPage.jsx:362` reads.
17. **"Unassigned" in the analyst dropdowns always 400s**, and the analyst list is hardcoded (5 emails), so new users never appear (`OrderFocusPage.jsx:18`, `OrderDetailPage.jsx:15`).

---

## 4. Data integrity / correctness

- **Lost updates.**
  - Field saves (800 ms debounce, one request per field) read the whole report and write it back, so two quick edits overwrite each other.
  - The optimistic-lock check is read-compare-write with no condition on the write.
  - `update_array` doesn't bump `updated_at`.
  - Fix: `PATCH …&updated_at=eq.<old>` and treat 0 rows as 409; have the frontend send `last_known_updated_at` (`crud.py:101-125`, `report.py:158-265`).
- **Errors swallowed so failures look like success:**
  - `ReportContext.updateField/deleteField/deletePage/updateArray`. QA "applied" ticks are false.
  - Unknown field names are silently dropped but return 200 (`crud.py:105-115`).
  - `cloud.py` delete ignores the result.
  - Deletes that match 0 rows report success (`supabase_client.py:467,633-641,968`).
  - `reset-password` returns a new password even if saving it failed (`clients.py:374,400,424`).
  - The status endpoint accepts any string (`report.py:1214`).
- **Reports with invalid JSON look like 404s** (`crud.py:76-89`), so they can't be opened or deleted.
- **Wrong report shown or written:**
  - Editor A→B shows A's data under B's URL.
  - QA can review A and save the verdict to B (`QAPage.jsx:180`).
  - Extractor state isn't reset on `reportId` change.
  - CompaniesPage and OrderdsPage can apply out-of-order responses.
- **Workflow:**
  - Cancelled or invoiced companies can be started or completed, and `_complete_order_if_ready` then reopens the order and creates an invoice (`orders.py:468-476,883,1029`).
  - `send_report` doesn't check `delivered_at`, so a double click emails twice.
  - A CR/LF in `company_name` causes `ValueError` → 500 at send time.
  - A pricing failure silently creates a $0 draft invoice (`orders.py:387-417`).
- **Races:**
  - Invoice number is max+1 with no retry, and a collision is treated as "already invoiced", so the invoice is silently dropped (`orders.py:442-454`).
  - Portal `used_count` is read-modify-write, so `max_uses` can be exceeded.
  - `start_company_work` has a check-then-act race.
- **Company intel:**
  - The normaliser drops "trading", "holding" and "group", so "X Trading" and "X Holding" merge into one company.
  - The lookup prefilters with the raw name, so spelling variants never match (`company_intel.py:29-35,186-199`).
- **Extractor:**
  - The Patch tab bypasses `runToCompletion` (against CLAUDE.md), uses the greedy `/\{[\s\S]*\}/` parser, and hardcodes `max_tokens:16000`, so patches on large reports truncate (`ExtractorPage.jsx:785-840`).
  - Cancel shows "timed out".
  - There is no abort on unmount, so the paid request keeps running.

---

## 5. Performance / scale limits (Vercel: 4.5 MB body, sync handlers)

- **Reports past 1,000 vanish.** `/search/local` and `/search/all` load at most 1,000 rows and filter in Python. The frontend asks for 500, without paging (`search.py:178,259`; `ReportsPage.jsx:171`).
- **The order ZIP download is built in memory.** Orders with several PDFs exceed Vercel's ~4.5 MB response limit (`orders.py:715-770`). Use signed Storage URLs instead.
- **`/orders/companies`** fetches every `order_companies` row with embedded `orders(*)` and filters in Python (`supabase_client.py:1387-1478`).
- **The delivery queue** fetches `limit=500` with no `order=`, so new completions can drop out (`delivery.py:173`).
- **N+1 calls.** The invoice list calls `get_client` and `get_order` per row (`invoices.py:116-130`).
- **`select=*` including `report_json`** just to check existence or status (`delivery.py:111,442,479,527`; `cloud.py:173`; `pdf.py:112`).
- **Blocking I/O in async handlers.** Synchronous `requests` calls and template rendering run inside `async def` in cloud/search/pdf/report and stall the worker. Use `asyncio.to_thread` or plain `def`.
- **Frontend:**
  - HomePage fetches every order, client and invoice to count them.
  - `ReportContext` logs the whole report to the console on each load.
  - The context value isn't memoised.
  - Continuations re-send the full document with no `cache_control`, at up to 5× the input cost.

---

## 6. Repo hygiene / dead code

- **Committed things that shouldn't be in git:**
  - `.kilo/node_modules/` (~3,400 files).
  - `backend/antigravity.db`, `backend/backend.db` (`.gitignore` already lists `*.db`; they were committed before).
  - `backend/outputs/*.pdf|json` (real report output?).
  - `backend/real_test.pdf`, `fixed_import_data.json`, `frontend/.env`, `test_supabase.ps1` (anon key).
  - `git_report*.py`, `vibeskills.txt`.
- **Dead backend modules:**
  - `api/extract.py`, `api/extract_clean.py`, `api/extract_backup.py`, `api/generate.py`, `main_fixed.py`.
  - `services/export_service.py`, all of `engines/*` (only the dead extract files import them).
  - Most of `database/db.py`, `get_id.py`.
  - The `/tmp/outputs` readers in `export.py`/`search.py`, and `pdf_generator.generate_pdf` (Playwright, never called).
  - A duplicated `_hex_to_css_class`.
- **Dead frontend:**
  - `supabase/client.js`, `App.css`.
  - The upload → processing → generating flow.
  - The direct-to-Anthropic branch in the Extractor.
  - The "Generated Files" tab.
  - `reportUpdatedAt`/`conflictModal` in context.
  - The "Claude Sonnet 4" label in the Extractor header.
- **Duplication:**
  - `OrdersPage` ("Batch") vs `OrderdsPage` (typo route `/orderds`) duplicate helpers.
  - Two portals (`PortalPage.jsx` and `valyze-portal`).
  - Three delete-report endpoints.
- **Docs drift.** `SYSTEM_ARCHITECTURE_COMPLETE.md`, `SYSTEM_MAP.md`, `PLAN.md`, `DEPLOYMENT.md` and `INTEGRATION_TEST_RESULTS.md` overlap and describe removed flows. Keep `CLAUDE.md` plus one deploy doc.
- **No backend tests and no CI.** The only automated test is `claudeTurns.test.mjs` (10/10 pass). The `frontend` build wasn't verified because `node_modules` isn't installed.

---

## 7. What's in decent shape

- Auth is fail-closed if the dependency can't load. Passwords use PBKDF2. Uploads are safe against path traversal (filenames are sanitized and validated against DB rows). The portal's errors don't leak internals. The proxy checks gzip-bomb size after decompressing.
- `claudeTurns.js` handles `max_tokens` and `pause_turn` resumption and is tested.
- `order_documents.py`/`invoices.py` HTML is escaped, and chevron escapes the main template.
- There is no `dangerouslySetInnerHTML`/`innerHTML` in either React app.

## Suggested order of work
1. C-1 (a few-line fix in `decode_token`), then check C-2 and C-3 in the Supabase and Render dashboards. Rotate the service key and seed passwords.
2. Role checks on invoices, clients, order status and report delete.
3. Fix the silent-failure plumbing (re-throw in `ReportContext`, keep `.response` in the interceptor) and the lost-update lock. Most of the "it saved but didn't" class of bugs disappears with these.
4. The broken features in §3 (attachment, ARRAY_FIELDS, downloads, Arabic filenames and search encoding).
5. Delete the dead code and committed artifacts, and add a minimal pytest suite for auth and the order workflow.
