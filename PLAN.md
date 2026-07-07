# Valyze — Batch of Small Edits (Implementation Plan)

Each task below is small and independent unless a dependency is noted. Follow CLAUDE.md
conventions. **DB migrations are manual** — any SQL in this plan must be pasted into the
Supabase SQL editor by hand; put the statement in a new file under `supabase/migrations/`
AND tell the user to run it.

Key facts for the executor:
- The page the user calls "Orders" is `frontend/src/pages/OrderdsPage.jsx` (route `/orderds`,
  one row per `order_company`). The single-report page is `OrderFocusPage.jsx`
  (route `/orderds/:companyId`). The "Batches" page is `OrdersPage.jsx` (route `/orders`).
- Logged-in user (with `.role`) comes from `useAuth()` (see `frontend/src/components/Layout.jsx:9`).
  JWT payload on the backend already contains `role` (`api/auth.py: create_token`).
- Roles: `super_admin`, `admin`, `analyst`, `reviewer`. Treat "admin" checks as
  `role in ('admin', 'super_admin')`.
- After frontend changes run `cd frontend && npx vite build`; after backend changes run the
  syntax check from CLAUDE.md.

---

## Phase 1 — Roles & permissions

### 1.1 Make only Waleed and Sally admins
- `backend/api/auth.py` `SEED_USERS`: change `mohamed`, `mahmoud`, `amani` to `role: "analyst"`.
  Keep `waleed` and `sally` as `admin`.
- Seeds only apply on first run; existing rows live in Supabase `app_users`. Add migration
  file + tell user to run:
  ```sql
  update app_users set role = 'analyst'
  where email in ('mohamed@valyze.com', 'mahmoud@valyze.com', 'amani@valyze.com');
  ```
- No change needed to assignment logic: `ORDER_ASSIGNABLE_ROLES = {"admin", "analyst"}`
  already includes analysts, so all 5 stay in the auto-assign rotation.

### 1.2 Backend: admin-only for delete + analyst assignment
- Add helper in `backend/api/auth.py`:
  ```python
  def require_admin(user: dict) -> None:
      if user.get("role") not in ("admin", "super_admin"):
          raise HTTPException(status_code=403, detail="Admin permission required")
  ```
- In `backend/api/orders.py`, call `require_admin(user)` at the top of:
  - `delete_order` (`DELETE /{order_id}`)
  - `delete_company_focus` (`DELETE /companies/{company_id}`)
  - `reassign_order` (`POST /{order_id}/reassign`)
  - `reassign_company` (`POST /{order_id}/reassign-company/{company_id}`)
  - In `update_order` (PATCH): require admin **only when** `auto_assigned_analyst` or
    `service_level` is in the updates (don't block analysts from other edits).

### 1.3 Frontend: hide admin-only actions
- `frontend/src/pages/OrderFocusPage.jsx`: import `useAuth`, compute
  `isAdmin = ['admin','super_admin'].includes(user?.role)`.
  - Render the "Assigned Researcher" (reassign) card only for admins.
  - Render the "Delete Report" button only for admins.
  - Non-admins still see Start / Continue / Mark Complete / Download.

---

## Phase 2 — Orders workspace (`OrderdsPage.jsx` + `OrderFocusPage.jsx`)

### 2.1 Add "Unassigned" to analyst filters
- `OrderdsPage.jsx` `ANALYST_FILTERS` and `OrdersPage.jsx` `ANALYST_FILTERS`: add
  `{ value: 'unassigned', label: 'Unassigned' }`.
- `OrderdsPage` filters client-side (`filteredOrders`): when `researcherFilter === 'unassigned'`,
  match rows where **both** `analyst_assigned` and `auto_assigned_analyst` are empty.
- `OrdersPage` passes `analyst` to the backend. In `backend/services/supabase_client.py`
  `get_all_orders`, when `analyst == 'unassigned'` filter with
  `auto_assigned_analyst=is.null` instead of `eq.`.

### 2.2 Filter/search everything on the Orders page
- The search box on `OrderdsPage` sends `search` to `GET /api/orders/companies/`.
  In `backend/services/supabase_client.py` `get_all_order_companies`, verify what the
  `search` param matches and extend it to cover (case-insensitive `ilike`):
  `company_name`, `registration_no`, `report_id`, `order.order_number`,
  `order.client_ref`, per-company `client_ref` (added in 4.3), and client name.
  If the flattened rows are built in Python, it's fine to filter in Python.
- Bug fix: the "Client Ref" column at `OrderdsPage.jsx:190-194` renders `order.client_id`
  (a UUID). Render the actual reference instead: per-company `client_ref`, falling back to
  the order-level `client_ref`. Ensure the flattened rows from
  `get_all_order_companies` include both.
- The page already has status/country/client/researcher/report-type/due-date filters —
  add one more dropdown for **Speed / service level** (values from `SPEED_LEVELS` keys,
  matching `order.speed` or `service_level`), client-side like the others.

### 2.3 Delete order (whole batch) — admin only
- Backend `DELETE /api/orders/{order_id}` currently rejects anything not `pending`.
  Relax to: deletable unless status is `invoiced`. On delete, also delete the order's
  `order_companies` and any linked `reports` rows (loop companies, reuse the cleanup
  logic from `delete_company_focus`). Keep `require_admin` from 1.2.
- Frontend: in `OrderDetailPage.jsx` (batch detail) add an admin-only "Delete Order"
  button with a confirm step (copy the Keep/Confirm-Delete pattern from
  `OrderFocusPage.jsx:298-313`), navigating to `/orders` on success.

### 2.4 Admin can change service level of an order
- Backend already supports it (`PATCH /api/orders/{order_id}` with `service_level`);
  1.2 adds the admin gate.
- Frontend `OrderFocusPage.jsx`: make the "Service Level" fact admin-editable — for admins
  render a small select (`basic/standard/express/urgent`) instead of static text, calling
  `ordersAPI.updateOrder(data.order_id, { service_level })` then `fetchData()`.
  Check `frontend/src/api/client.js` for the existing `ordersAPI.updateOrder` (add it if missing:
  `PATCH /api/orders/{id}`).

### 2.5 "Previous reports" check on the single-report page
- Goal: when an analyst opens `/orderds/:companyId`, they can see whether this company
  already has an old report in the database.
- Use the existing search API: `GET /api/search/?company_name=<name>` (also try
  `cr_number=<registration_no>` when present). Add a `searchAPI` entry in
  `frontend/src/api/client.js` if not already there.
- In `OrderFocusPage.jsx` add a "Previous Reports" card (below the Facts grid): on load,
  query by company name; list matches with report date, status, analyst, and a link to
  `/editor/{report_id}`. Exclude the report linked to this very company
  (`data.report_id`). Show "No previous reports found" when empty.
  Keep it lightweight — fire the search after the main fetch succeeds.

### 2.6 Enrich the single-report page with the order summary data
- Keep the existing header block (back link + flag/company/status/order-number/client +
  Download/primary action) exactly as is.
- `backend/api/orders.py` `_build_company_focus` already returns `order.notes`,
  `submitted_via_portal`, `address`, `phone`, `fax`, `comments`. Add to the `order` dict:
  `client_ref`, `speed`, `report_types` (see 2.7).
- `OrderFocusPage.jsx`: extend the Facts grid with: Client Ref, Address, Phone,
  Speed (`order.speed`), Report Types (`order.report_types`, comma-split into small badges
  like `ReportTypeBadge` in `OrderdsPage.jsx`), and "Submitted via portal" (Yes/No).
  Add an "Order Notes" card (same style as the existing "Client Comments" card,
  `OrderFocusPage.jsx:233-238`) rendering `order.notes` when present.
  The per-company "Client Comments" card already exists — keep it.

### 2.7 Persist the portal's report_types selection
- Today the portal collects `report_types` (credit_report, registration, owners, ubo,
  legal, analysis_financial) but `_submit_order_payload` in `backend/api/portal.py`
  **does not store them** — only a derived `report_type` (standard/full). `OrderdsPage`
  already tries to read `order.report_types`.
- First verify whether `orders.report_types` column exists (query Supabase or check a
  live row). If missing, migration file + manual SQL:
  ```sql
  alter table orders add column if not exists report_types text;
  ```
- In `_submit_order_payload`, add `"report_types": ",".join(resolved_report_types)` to
  `order_payload`. Include `report_types` in `_build_company_focus`'s order dict and in
  the flattened rows of `get_all_order_companies`.

### 2.8 Auto-assignment actually reaching the reports
- Auto-assign already runs at order creation (`assign_analyst()`), but the per-company
  `analyst_assigned` stays null, which is why reports show "Unassigned".
- In `backend/api/portal.py` `_create_order_company`, add
  `"analyst_assigned": <the order's auto_assigned_analyst>` (pass the analyst into the
  helper from `_submit_order_payload`).
- Old rows: no backfill required; the UI fallback to `order.auto_assigned_analyst`
  already handles display.

---

## Phase 3 — Portal UX (`frontend/src/pages/PortalPage.jsx`)

### 3.1 Fix light/dark mode (page is forced black)
- Every screen uses a hardcoded inline dark gradient
  (`style={{ background: 'linear-gradient(135deg, #08111c ...' }}`) plus white-on-dark
  utility classes — light-mode users get a black page regardless of theme.
- Rework the portal to be theme-aware: remove the inline gradients; use a shared wrapper
  class with Tailwind light + `dark:` variants (light: soft slate/white gradient, dark:
  the current navy gradient). Update the shared `FIELD_CLS` and the card classes
  (`bg-white/5 border-white/10 text-white...`) to have light-mode equivalents
  (`bg-white border-slate-200 text-slate-800 dark:...`). Respect the same dark-mode
  mechanism the main app uses (check how `dark` class is toggled in `index.html` /
  `Layout.jsx`; if the portal renders outside `Layout`, honor
  `window.matchMedia('(prefers-color-scheme: dark)')`).
- Touch every portal screen: LoginScreen, OrderTypeScreen, OrderForm (all 4 steps),
  SuccessScreen, the no-token error card, and the new OrderSummary screen (3.6).

### 3.2 Disclosure hint on the comments field
- In the per-company Comments input (`PortalPage.jsx:413-416`), change the placeholder to
  light guidance text recommending disclosure, e.g.:
  `placeholder="Recommended: state whether we may disclose your company's name as the party requesting this report"`
- Placeholder styling is already light (`placeholder-white/30`) — keep it subtle in both
  themes.

### 3.3 Per-company reference instead of order-level "Your Reference"
- Remove the order-level "Your Reference" card at the top of Step 1
  (`PortalPage.jsx:361-364`) and the `clientRef` state.
- Add an optional `client_ref` field to `EMPTY_COMPANY` and render it as the **first**
  input inside each company card, above Company Name:
  label `Your Reference` with `· optional`, placeholder e.g. `e.g., PO-12345`.
- Show it in the Review step next to each company name, and count it in
  `companyCompleteness`.
- Backend: add `client_ref: Optional[str] = None` to `OrderCompanyRequest` and include it
  in `_create_order_company`'s payload (`backend/api/portal.py`). Also add `client_ref`
  to `UpdateCompanyRequest` and `_public_company` in `backend/api/orders.py`.
- Migration file + manual SQL:
  ```sql
  alter table order_companies add column if not exists client_ref text;
  ```
- With 3.5 (one order per company), also copy each company's `client_ref` onto its
  order's `client_ref` so existing order-level displays keep working.

### 3.4 Fix portal file upload
Two concrete problems, fix both:
1. **Wrong FastAPI parameter type**: in `backend/api/portal.py:752`,
   `file_company_indexes: Optional[List[int]] = File(default=None)` — these are plain
   form string values, not files. Change to `Form(default=None)`. This is the most likely
   reason uploads 422/fail outright.
2. **Vercel ~4.5 MB body limit vs 100 MB client cap**: the frontend allows 100 MB per
   file (`MAX_FILE_SIZE_MB = 100` in `PortalPage.jsx`) but any multipart body over
   ~4.5 MB will 413 on Vercel before reaching FastAPI. Minimum fix: lower the client cap
   to 4 MB per file AND validate the **combined** size of all files + fields stays under
   ~4 MB, with a clear error message ("Total attachments must stay under 4 MB — you can
   also submit without files and email larger documents"). Surface 413 responses as that
   friendly message too (the current `portalRequest` throws `Request failed with status 413`).
- Optional follow-up (bigger, do last, skip if time-boxed): direct-to-Supabase-Storage
  uploads via signed upload URLs (new portal endpoint that returns a signed upload URL
  per file; browser PUTs the file straight to storage; then submit order with the storage
  paths). This restores large-file support. Design it, but don't block the batch on it.

### 3.5 One order (own order ID) per company
- Requirement: submitting 2 companies must produce 2 orders, each with its own
  `ORD-YYYY-NNNN`.
- In `backend/api/portal.py` `_submit_order_payload`: loop over `body.companies`; for
  each company create one order (own `generate_order_number()`, `company_count: 1`,
  its own `assign_analyst()` call so workload balancing spreads the batch across
  analysts) + one `order_company` + that company's files. Due date: keep computing per
  company from its own country.
- Session usage: increment `used_count` **once per submission**, not per order.
- Response shape: return `orders: [{order_id, order_number, company_name}, ...]` plus keep
  `order_number` set to the first one for backward compatibility. Update `SuccessScreen`
  to list all created order numbers.
- Note: invoices are generated **per order** on completion, so a 5-company batch now
  yields 5 invoices instead of 1. This matches the direction (clients don't see batch
  invoices), but say so in the PR description so the user is aware.
- The internal "Batches" page (`/orders`) will now show 1-company batches for portal
  submissions — acceptable; no change needed there.

### 3.6 "View Order" shows a portal summary, not the internal app
- `SuccessScreen` currently navigates to `/orders/{order_id}` — the internal app (clients
  just hit the login wall). Replace with a portal-native summary screen:
  - New `OrderSummaryScreen` component inside `PortalPage.jsx`, fetching
    `GET /api/portal/order-status/{order_number}` with the portal token (endpoint already
    exists at `backend/api/portal.py:763`).
  - Show: order number, status, due date, companies with their statuses, attached files.
    With 3.5, if multiple orders were created show a small selector or stacked summaries.
  - Add a `Back` button returning to the success screen and a "Submit Another Order" button.
- This also satisfies "clients must not see batches/invoices/internal pages": the portal
  never links into the internal app anymore (those routes are auth-protected anyway).

### 3.7 "Submit Another" without re-entering the password
- `SuccessScreen`'s "Submit Another" currently does `window.location.reload()`, which
  drops the in-memory `portalToken` and forces a new password entry.
- Pass a callback from `PortalPage` that resets state to `'type-select'` (keeping
  `portalToken` + `clientName`) and clears `lastResult`. Portal tokens live 4 h, so this
  is safe; if a subsequent API call returns 401, drop back to the login screen with a
  "session expired" message.

---

## Suggested execution order
1. Phase 1 (roles) — small, unblocks the admin gating used everywhere else.
2. 3.4 (file upload fix) — it's a live bug.
3. 3.5 + 3.6 + 3.7 together (they all touch the portal submit/success flow).
4. 2.7 + 2.8 (backend data completeness) before 2.6 (UI that displays it).
5. Everything else in any order.

## Manual SQL checklist (paste into Supabase SQL editor)
```sql
-- 1.1 demote three users
update app_users set role = 'analyst'
where email in ('mohamed@valyze.com', 'mahmoud@valyze.com', 'amani@valyze.com');

-- 2.7 (only if column missing)
alter table orders add column if not exists report_types text;

-- 3.3
alter table order_companies add column if not exists client_ref text;
```
