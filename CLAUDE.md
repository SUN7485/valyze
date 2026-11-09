# CLAUDE.md — Valyze Credit Intelligence

Guidance for working in this repo. Keep it accurate; update it when these facts change.

## What this is
A credit-report platform. Clients submit orders through a public **portal**; analysts
pick up per-company work from the **Work Queue**, run the **Extractor** (client-side AI
extraction), edit in the **Editor**, generate narratives/PDF, and bill via **Invoices**.

## Architecture
- **Frontend** — React 19 + Vite + Tailwind, in `frontend/`. Deployed on Vercel.
  API access goes through `frontend/src/api/client.js` (axios instance that auto-attaches
  the `valyze_token` JWT to every request). Pages are lazy-loaded in `App.jsx`.
- **Backend** — FastAPI in `backend/`. Vercel serverless entry is **`backend/api/index.py`**
  (registers each router with `_safe_register` so one bad import can't take down the app).
  `backend/main.py` just re-exports that app (`from api.index import app`) for local dev
  and the Docker/Render image — never register routers there.
- **Data** — Supabase, accessed via the **PostgREST REST API** (no SDK), all in
  `backend/services/supabase_client.py`. Direct HTTP with the service-role key.

## Hard constraints / gotchas (read before changing things)
- **DB migrations are manual.** No runner. Paste `supabase/migrations/*.sql` into the
  Supabase SQL editor by hand. The orders/clients/order_companies/invoices tables were
  created outside the migration files, so their full schema isn't in the repo.
- **Serverless = ephemeral filesystem.** Anything written to local disk in one request is
  gone in the next. Portal files live in Supabase Storage (`storage://bucket/path`); the
  Extractor loads them via `/api/upload/download/...`. Don't rely on `UPLOAD_DIR` persisting.
- **Extraction is client-side.** `ExtractorPage.jsx` calls Anthropic in the browser
  (via `/api/proxy`) using the user's own API key. `backend/api/extract.py` is legacy.
- **Vercel body limit ~4.5 MB.** Large payloads 413. The proxy path gzips requests.
- **Model ids live only in `frontend/src/config/ai.js`.** Changing one is not a config
  tweak: Opus 5 thinks by default and `max_tokens` caps thinking *plus* the answer, and
  newer tokenizers count the same text as up to 1.35× more tokens. The swap from Sonnet 4
  silently truncated extractions mid-JSON. Re-check `max_tokens`/`effort` on every swap.
- **Every Claude call from the browser goes through `frontend/src/lib/claudeTurns.js`**
  (`runToCompletion` + `parseJsonResult`). It resumes `max_tokens` cut-offs and web-search
  `pause_turn`s and never returns a nested fragment as the answer. Do not re-inline that loop.
- **Auth model** — `backend/api/auth.py`. Users are persisted in Supabase `app_users`.
  First-run seeding takes passwords from `SEED_PASSWORD_<ID>` / `VALYZE_SEED_PASSWORDS`
  or generates random ones (logged once) — no passwords in source. In production an
  unreadable `app_users` fails closed (503); the in-memory fallback is dev-only.
  Set `JWT_SECRET`. Passwords are PBKDF2 (`_verify` still accepts legacy `salt:sha256`).
  Login and portal auth are throttled in-process (per instance — not a global limit).
- **Three token types, never interchangeable:** staff login token (header only; no
  `type`/`aud`), portal token (`type:"portal"`, `aud:"portal"`, portal routes only),
  and a 120 s **link token** (`POST /api/auth/link-token`, `type:"link"`) — the ONLY
  token allowed in a `?token=` query string. Staff guards re-read the user per request
  (30 s cache), so deleted/demoted users lose access immediately.
- **Router-level auth** is applied in `index.py` to report/upload/search/cloud, and to
  `pdf`/`export` via `get_current_user_flexible` (header OR link-token query, because
  the UI opens those as raw browser URLs). The frontend uses `openAuthenticatedUrl` /
  `linkUrl` in `client.js`. Other routers guard each endpoint themselves. Admin-only:
  report delete, invoice generate/edit/status, order status changes + cancel, client
  delete + portal credential management, backups. QA verdicts: reviewer/admin, never
  the report's own analyst.
- **Report edits use optimistic locking** — every edit sends `last_known_updated_at`
  (the `updated_at` from GET) and adopts the `updated_at` in the response; mismatch → 409.
  The compare-and-set is atomic on `report_json->>updated_at` (`services/report_queries.py`).
  `ReportContext` serializes edits per report and re-throws save errors — keep it that way.
- **RLS:** after migration 012 no anon/authenticated access exists; the backend's
  service-role key is the only way in. Never add `using (true)` policies.
- **Company Intelligence** — `services/company_intel.py` + `api/companies.py` give a
  de-duplicated view over all reports + `order_companies` (normalized name/CR matching;
  only legal-form suffixes are stripped — "X Trading" ≠ "X Holding").
  Read-only, no migration. `GET /api/companies/search` and `/api/companies/lookup`.
- **PostgREST quirks** — list endpoints should `select=` only needed columns (reports'
  `report_json` is huge); use the count header (`Range: 0-0`) instead of fetching all rows.
  Build query strings with `encode_query()` from `supabase_client.py` and use the `*`
  ilike wildcard — hand-built `%{quote(v)}%` gets re-escaped by `requests` and silently
  breaks Arabic/multi-word searches. Quote values inside `or=()` with `quote_or_value`.
- **Download filenames** — use `api/_http.content_disposition()`; a raw non-ASCII
  `filename="..."` header raises and 500s.
- **PDF rendering** — `template.html` has an unclosed section that chevron rejects, so the
  escaping fallback `_render_mustache` in `pdf_generator.py` is the live renderer. Keep it
  escaping; never insert raw HTML into the context.
- **Orders** move to `invoiced` when their invoice is created. Delivery emails attach the
  report as HTML (or an admin-uploaded PDF) and only mark delivered after a successful send.

## Commands
- Frontend: `cd frontend && npm run dev` · build/verify: `npx vite build`
- Claude-call tests (no API key needed): `cd frontend && node --test src/lib/claudeTurns.test.mjs`
- Backend local: `cd backend && uvicorn main:app --reload`
- Backend tests (no network): `cd backend && python -m pytest -q`
- Backend syntax check: `python -c "import ast; ast.parse(open('api/<f>.py').read())"`

## Required env vars (Vercel)
- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `PORTAL_URL`
- Frontend: `VITE_API_BASE_URL` (the backend URL; throws in prod if unset)

## Conventions
- Match surrounding style. Tailwind utility classes; lucide-react icons.
- Supabase rows come back as plain dicts — use `row.get("x")`, never `row.x`.
- When committing, only commit source; the rebuilt `frontend/dist/` is noise.
