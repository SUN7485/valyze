# Valyze — Security Audit Findings

_Audit date: 2026-07-12 · Scope: backend (FastAPI), frontend (React), Supabase access, migrations, git-tracked secrets._

Severity legend: **CRITICAL** (fix now / rotate) · **HIGH** (fix this sprint) · **MEDIUM** (planned) · **LOW/NOTE** (hardening).

> **Update 2026-07-13 — fixed in code this pass:**
> - **C4 (unauth data export) — FIXED.** `pdf` + `export` routers are now auth-gated at the router level via a header-OR-`?token=` guard (`get_current_user_flexible`), the frontend appends the JWT with a `withToken()` helper for raw-browser opens, and the two `backup/*` full-DB dumps are now **admin-only** (`require_admin`).
> - **C3 (forgeable JWT) — MITIGATED.** `_resolve_jwt_secret()` no longer falls back to the public default in prod; it derives an unforgeable key from the Supabase key (or a per-process random key). ⚠️ This derivation is only safe **once C1 is done** (the anchor key is currently committed). Setting an explicit `JWT_SECRET` is still recommended.
> - **Fail-open cascade — FIXED.** If the auth dependency ever fails to import, protected routers now register with a hard-deny 503 dependency instead of silently opening (`index.py`).
>
> Still open: **C1 (rotate + purge the committed Supabase key), C2 (seed passwords), H1/H2 (hashing + portal RNG), M1–M4, L1–L4.**

---

## CRITICAL

### C1 — Supabase **service-role key committed to git** and pushed to GitHub
- **Where:** `backend/.env`, `backend/services/.env` (both tracked in git; remote `origin = github.com/SUN7485/valyze.git`). First committed in `84767fd1`. `.gitignore` lists `.env` but these were committed *before* the rule, so they remain tracked.
- **What:** `SUPABASE_SERVICE_KEY` is the real service-role JWT. It **bypasses all Row-Level Security** — full read/write/delete on every table (clients, orders, reports, invoices, app_users password hashes, client_sessions).
- **Impact:** Anyone with repo access (or anyone if the repo is ever public/leaked) owns the entire database. The key is in git **history**, so deleting the file is not enough.
- **Fix:**
  1. **Rotate the Supabase service key now** (Supabase dashboard → API → roll `service_role`). Assume the current one is burned.
  2. `git rm --cached backend/.env backend/services/.env frontend/.env` and commit; confirm `.gitignore` covers them (it does).
  3. Purge from history (`git filter-repo` or BFG) and force-push, or treat the repo as compromised and rebuild it.
  4. Set secrets only in Vercel env vars going forward. Keep only `.env.example` (placeholders) in the repo.
  5. Check if the GitHub repo is public — if so, treat as an active breach (rotate everything, review DB audit logs).

### C2 — Hardcoded seed passwords in source
- **Where:** `backend/api/auth.py:72` (`SEED_USERS`) — `Superadmin@123`, `Waleed@123`, … one per account.
- **What:** Real bootstrap credentials committed in plaintext. Predictable pattern (`Name@123`).
- **Impact:** With C1 (public repo) or just source access, the super-admin login is known. Even without, the pattern is guessable and there's no forced rotation on first login.
- **Fix:** Move seed passwords to env vars (random, per-deploy), or generate random passwords on first seed and print once to the deploy log. Force a password change on first login. Rotate all six now.

### C3 — Default JWT secret fallback (tokens forgeable if env unset)
- **Where:** `backend/api/auth.py:25-38`. `JWT_SECRET = os.getenv("JWT_SECRET", "valyze-secret-change-in-production-2026")`. Same secret also signs **portal** tokens (`backend/api/portal.py:24`). On a missing env it only **prints a warning** — it never refuses to start.
- **What:** If `JWT_SECRET` is not set in the deployment, the signing key is the public default from source.
- **Impact:** Anyone can mint a valid `super_admin` JWT (`{"role":"super_admin", ...}` signed with the known secret) and take over. Note: `backend/.env` has **no** `JWT_SECRET`, so local/dev is already on the default — verify prod (Vercel) actually sets it.
- **Fix:** Fail hard (raise on startup) when `JWT_SECRET` is unset in production instead of warning. Generate a strong 32+ byte secret. Rotate it (invalidates existing tokens — acceptable).

### C4 — Unauthenticated full-database export
- **Where:** `backend/api/export.py:243` `GET /api/export/backup/all` and `:258` `GET /api/export/backup/download/all` — registered with **no auth** (`index.py:217` `_safe_register("export", "api.export")`). No ID required; returns **every report** in full.
- **What:** The whole `pdf` and `export` routers are intentionally open (documented for `window.open` per-report downloads), but the **backup/all** endpoints dump the entire report DB with no parameter and no auth. Per-report `export/*` (POST) and `pdf/preview|view|html` (GET) are also open — IDOR by report UUID.
- **Impact:** `curl https://<backend>/api/export/backup/download/all` → complete credit-intelligence dataset for every client. Highest-value data in the product, zero auth.
- **Fix:** Require auth on `export/backup/*` immediately (they're never opened via `window.open`, so no header limitation applies). For the genuinely browser-opened GET endpoints (`pdf/preview`, `export/download`), adopt the query-token scheme CLAUDE.md already notes as the follow-up. Move the POST `export/*` endpoints behind the same `_PROTECTED` dependency as `report`.

---

## HIGH

### H1 — Weak password hashing (single-round SHA-256)
- **Where:** `backend/api/auth.py:49-62` (`_hash`/`_verify`) and `backend/api/clients.py:126` / `backend/api/portal.py:160` (portal). Salted but **one round** of SHA-256.
- **Impact:** SHA-256 is a fast hash — a leaked `app_users` / `client_sessions` table is brute-forceable at billions/sec on a GPU. Salt stops rainbow tables but not cracking.
- **Fix:** Use `hashlib.pbkdf2_hmac('sha256', pw, salt, 200_000)` (pure stdlib, no C build — solves the bcrypt-on-Vercel constraint from CLAUDE.md), or `argon2-cffi` if a wheel is available. Rehash on next login.

### H2 — Predictable portal passwords + plaintext persistence
- **Where:** `backend/api/clients.py:132` `_generate_password_plain()` uses `random.choice` (Mersenne Twister — **not** cryptographic) over 8 alphanumerics. The plaintext is stored in `client_sessions.password_plain_temp` (`clients.py:311`, cleared only after first successful portal auth).
- **Impact:** Portal passwords are guessable given enough samples; plaintext passwords sit in the DB (and are exposed to the service key / any table-level leak).
- **Fix:** Use `secrets.choice` (or `secrets.token_urlsafe`) and ≥12 chars. Don't persist plaintext — show it once in the API response and never store it; store only the hash.

---

## MEDIUM

### M1 — JWT stored in `localStorage`
- **Where:** `frontend/src/api/client.js:33`, `frontend/src/context/AuthContext.jsx:12,44`.
- **Impact:** Any XSS (e.g. via the CDN script in M3) can exfiltrate the token; 24h expiry widens the window.
- **Fix:** Prefer httpOnly + Secure + SameSite cookie set by the backend. If staying with localStorage, add a strict CSP and shorten token lifetime + refresh.

### M2 — `order_files` table is world-open to the anon key; other manual tables' RLS unverified
- **Where:** `supabase/migrations/004_add_order_files.sql:25` — `create policy … for all using (true) with check (true)` with no `to` clause (applies to `public`/`anon`). The `VITE_SUPABASE_ANON_KEY` ships in the browser bundle.
- **Impact:** Anyone with the (public) anon key can read/write `order_files` directly via PostgREST. Tables created outside migrations (`clients`, `client_sessions` — holds password hashes **and** `password_plain_temp`, `orders`, `order_companies`, `invoices`) have **unknown** RLS; if any lack RLS, the anon key reads them too. The React app doesn't call `supabase.from()` directly, so tightening RLS won't break the UI.
- **Fix:** Verify RLS is enabled on every table in the Supabase dashboard. Restrict `order_files` policy to the authenticated/service context (or `using(false)` for anon). Confirm `client_sessions` and `app_users` deny anon.

### M3 — Extractor loads pdf.js from a remote CDN with no SRI/CSP
- **Where:** `frontend/src/pages/ExtractorPage.jsx:6-17` injects `<script src="https://cdnjs.cloudflare.com/…/pdf.min.js">` at runtime; the worker too. No `integrity`/SRI, no Content-Security-Policy on the app.
- **Impact:** Supply-chain risk — a compromised/again-poisoned CDN asset runs in a page that holds the user's Anthropic API key and JWT. This is the realistic XSS vector for M1.
- **Fix:** Bundle `pdfjs-dist` via npm (pinned) instead of CDN, or add SRI hashes + a CSP that whitelists only required origins.

### M4 — No rate limiting on auth endpoints
- **Where:** `POST /api/auth/login` (`auth.py:319`), `POST /api/portal/auth` (`portal.py:725`).
- **Impact:** Online brute-force of passwords / portal tokens is unthrottled. Combined with H1/H2 (weak/guessable secrets) this is exploitable.
- **Fix:** Add IP + account rate limiting / lockout (e.g. slowapi, or an upstream WAF/Vercel rule). Add small constant delay on failure.

---

## LOW / NOTE

- **L1 — Verbose error leakage:** many handlers return `str(exc)` to the client (e.g. `orders.py`, `export.py`, `proxy.py`) and `print`/`traceback.print_exc()` throughout. Leaks internal detail. Return generic messages; log detail server-side only.
- **L2 — Recon endpoints:** `GET /routes` (`index.py:164`) lists every route + which routers loaded; `/health` reveals env presence. Gate `/routes` behind auth or remove in prod.
- **L3 — CORS breadth:** `allow_methods=["*"]`, `allow_headers=["*"]`, plus arbitrary `CORS_EXTRA_ORIGINS`. Fine today (credentials disabled only when `*`), but tighten headers/methods to what's used.
- **L4 — Proxy relays any api key:** `POST /api/proxy` (auth-gated, good) forwards a caller-supplied `x-api-key` to a fixed Anthropic URL. SSRF is limited by the hardcoded URL — acceptable, just noting the trust model (an authed user can burn any key they paste).

---

## Fix priority (do in this order)
1. **Rotate the Supabase service key** (C1) — everything else is moot if this key is loose.
2. Rotate the 6 seed passwords + force change on login (C2); make `JWT_SECRET` mandatory in prod (C3).
3. Auth-gate `export/backup/*` and the POST `export/*` endpoints (C4).
4. Purge `.env` files from git history (C1).
5. PBKDF2 password hashing (H1); `secrets`-based portal passwords, stop storing plaintext (H2).
6. Verify RLS on all tables; lock down `order_files` (M2).
7. Bundle pdf.js locally + add CSP (M3); move JWT off localStorage (M1); rate-limit auth (M4).
