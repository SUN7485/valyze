# Valyze Credit Intelligence

Credit-report platform. Clients submit orders through the **portal**; analysts pick up
per-company work from the **Work Queue** (`/queue`), run the **Extractor** (client-side AI
extraction), edit in the **Editor**, generate the PDF, and bill through **Invoices**.

Read [`CLAUDE.md`](CLAUDE.md) before changing anything. It lists the constraints that
aren't obvious from the code: manual migrations, ephemeral serverless disk, the 4.5 MB body
limit, and where model ids live.

## Layout

| Path | What |
|---|---|
| `frontend/` | React 19 + Vite + Tailwind. The staff app, plus the client portal at `/portal?token=…`. |
| `backend/` | FastAPI. `api/index.py` is the Vercel entry point; `main.py` is for local dev only. |
| `backend/api/` | One router per area (auth, orders, portal, report, pdf, export, …). |
| `backend/services/` | Supabase REST client, mailer, pricing, company de-duplication. |
| `supabase/migrations/` | SQL migrations. Applied by hand in the Supabase SQL editor, in order. |
| `supabase/reference/` | Snapshot of tables created outside the migrations (orders, clients, invoices, …). Reference only. |
| `docs/` | Security audit and other long-form notes. |

## Local development

```bash
# backend (http://localhost:8000, docs at /docs)
cd backend
cp .env.example .env          # fill in SUPABASE_URL / SUPABASE_SERVICE_KEY
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# frontend (http://localhost:1573, client portal at /portal?token=…)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Shortcuts: `./install.sh` then `./startall.sh` (Windows: `install.bat`, `startall.bat`, `stop-all.bat`).

## Checks

These run in CI on every push and PR (`.github/workflows/ci.yml`):

```bash
cd frontend && npm run lint && npm test && npx vite build
cd backend  && python -m pytest -q
```

## Deploying

Two Vercel projects pointing at the same repo:

| Vercel project | Root directory | Env vars |
|---|---|---|
| backend | `backend` | see `backend/.env.example` (at minimum `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `PORTAL_URL`) |
| frontend | `frontend` | `VITE_API_BASE_URL`: backend URL, no trailing slash |

Client portal links are `{PORTAL_URL}/portal?token=…`. Leave `PORTAL_URL` unset (it falls
back to `FRONTEND_URL`) or set it to the frontend's URL.

After a deploy, `GET /health` on the backend should return `{"status": "ok"}` and `/ready`
should report the Supabase connection.

Schema changes: paste the new `supabase/migrations/NNN_*.sql` into the Supabase SQL editor
**before** deploying code that depends on it.
