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
  `backend/main.py` is for local dev only.
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
- **Auth model** — `backend/api/auth.py`. Users are persisted in Supabase `app_users`
  (seeded from 6 bootstrap accounts on first run; in-memory fallback if DB is down).
  Set `JWT_SECRET` in the deployment env. If it's unset in prod, `auth.py` derives a
  stable secret from the Supabase key (unforgeable, survives cold starts) rather than
  using the public default — but set a real one anyway. Staff passwords are PBKDF2
  (`_verify` still accepts legacy `salt:sha256` hashes for accounts seeded before the upgrade).
- **Router-level auth** is applied in `index.py` to report/upload/search/cloud/companies,
  and to `pdf`/`export` via `get_current_user_flexible` — a header-OR-`?token=` guard,
  because the UI opens those as raw browser URLs (`window.open`, `link.href`) that can't
  send an auth header. The frontend appends `?token=<jwt>` (see `withToken` in `client.js`).
  The `export/backup/all` DB-dump endpoints additionally require an admin role.
- **Company Intelligence** — `services/company_intel.py` + `api/companies.py` give a
  de-duplicated view over all reports + `order_companies` (normalized name/CR matching).
  Read-only, no migration. `GET /api/companies/search` and `/api/companies/lookup`.
- **PostgREST quirks** — list endpoints should `select=` only needed columns (reports'
  `report_json` is huge); use the count header (`Range: 0-0`) instead of fetching all rows.

## Commands
- Frontend: `cd frontend && npm run dev` · build/verify: `npx vite build`
- Backend local: `cd backend && uvicorn main:app --reload`
- Backend syntax check: `python -c "import ast; ast.parse(open('api/<f>.py').read())"`

## Required env vars (Vercel)
- Backend: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `PORTAL_URL`
- Frontend: `VITE_API_BASE_URL` (the backend URL; throws in prod if unset)

## Conventions
- Match surrounding style. Tailwind utility classes; lucide-react icons.
- Supabase rows come back as plain dicts — use `row.get("x")`, never `row.x`.
- When committing, only commit source; the rebuilt `frontend/dist/` is noise.
