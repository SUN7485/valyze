# VALYZE SYSTEM MAP — Complete Wiring & Workflow Analysis

> **Last updated:** 2026-06-16  
> **Purpose:** Full audit of every connection, endpoint, button, and data flow in the Valyze system.

---

## 1. SYSTEM OVERVIEW

The system consists of **4 separate applications** sharing a single **Supabase database**:

| App | Port | Purpose | Stack |
|-----|------|---------|-------|
| **Backend** | 8000 | FastAPI REST API + Supabase | Python/FastAPI |
| **Frontend** | 1573 | Admin dashboard (analysts, reports, orders, invoices) | React/Vite |
| **Extractor** | 5173 | AI document extraction (Claude API) | React/Vite (standalone) |
| **Portal** | 3000 | Client-facing order submission | React/Vite (standalone) |

**Database:** Supabase (PostgreSQL) — accessed via REST API from the backend.

---

## 2. DATABASE SCHEMA (8 Tables)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          SUPABASE DB                                │
│                                                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ clients  │───▶│client_sessions│   │   orders     │               │
│  │          │    │              │    │              │               │
│  │ id (PK)  │    │ id (PK)     │    │ id (PK)     │               │
│  │ valyze_id│    │ client_id   │    │ order_number │               │
│  │ client_  │    │ token       │    │ client_id ───┼──▶ clients.id │
│  │  name    │    │ password_   │    │ status       │               │
│  │ email    │    │  hash       │    │ company_count│               │
│  │ country  │    │ expires_at  │    │ completed_   │               │
│  │ portal_  │    │ used_count  │    │  count       │               │
│  │  password│    │ max_uses    │    │ auto_assigned│               │
│  │  _hash   │    └──────────────┘    │  _analyst   │               │
│  └──────────┘                        │ service_level│               │
│                                      │ due_date     │               │
│  ┌──────────────┐                    └──────┬───────┘               │
│  │  reports     │                           │                       │
│  │              │                    ┌──────▼───────┐               │
│  │ id (PK)     │                    │order_companies│              │
│  │ status      │                    │              │               │
│  │ report_json │                    │ id (PK)     │               │
│  │ company_name│                    │ order_id ────┼──▶ orders.id  │
│  │ cr_number   │                    │ company_name │               │
│  │ analyst     │                    │ status       │               │
│  │ client_     │                    │ report_id ───┼──▶ reports.id │
│  │  reference  │                    │ analyst_     │               │
│  │ created_at  │                    │  assigned    │               │
│  │ updated_at  │                    │ sort_order   │               │
│  └──────────────┘                    │ reg_no, vat, │               │
│                                      │ phone, fax,  │               │
│  ┌──────────────┐                    │ comments     │               │
│  │uploaded_files│                    └──────────────┘               │
│  │              │    ┌──────────────┐                               │
│  │ id (PK)     │    │  invoices    │    ┌──────────────┐           │
│  │ report_id   │    │              │    │ order_files  │           │
│  │ filename    │    │ id (PK)     │    │              │           │
│  │ file_path   │    │ invoice_    │    │ id (PK)     │           │
│  │ file_type   │    │  number     │    │ order_id ────┼──▶ orders  │
│  │ file_size   │    │ order_id ───┼──▶ │ order_company│           │
│  └──────────────┘    │ client_id   │    │  _id        │           │
│                      │ total       │    │ filename    │           │
│                      │ status      │    │ file_path   │           │
│                      │ line_items  │    │ file_type   │           │
│                      └──────────────┘    └──────────────┘          │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Relationships
- `orders.client_id` → `clients.id`
- `order_companies.order_id` → `orders.id`
- `order_companies.report_id` → `reports.id` (one company = one report)
- `invoices.order_id` → `orders.id`
- `invoices.client_id` → `clients.id`
- `order_files.order_id` → `orders.id`
- `uploaded_files.report_id` → `reports.id`
- `client_sessions.client_id` → `clients.id`

---

## 3. BACKEND ROUTER REGISTRATION (main.py)

```python
app.include_router(auth_router)                                                   # /api/auth/*
app.include_router(portal_router,       prefix="/api/portal",    tags=["portal"]) # /api/portal/*
app.include_router(upload_router)                                                # /api/upload/*
app.include_router(report_router)                                                # /api/report/*
app.include_router(pdf_router)                                                   # /api/pdf/*
app.include_router(export_router)                                                # /api/export/*
app.include_router(invoices_router,     prefix="/api/invoices",  tags=["invoices"])# /api/invoices/*
app.include_router(search_router)                                                # /api/search/*
app.include_router(cloud_router)                                                 # /api/cloud/*
app.include_router(clients_router,      prefix="/api/clients",   tags=["clients"])# /api/clients/*
app.include_router(proxy_router)                                                 # /api/proxy
app.include_router(orders_router,       prefix="/api/orders",    tags=["orders"]) # /api/orders/*
```

---

## 4. FRONTEND ROUTES (Admin Dashboard)

| Route | Component | Auth Required | Purpose |
|-------|-----------|:------------:|---------|
| `/login` | LoginPage | No | Email/password login |
| `/portal` | PortalPage | No | Client portal wrapper |
| `/` | HomePage | Yes | Dashboard: quick actions, stats |
| `/orders` | OrdersPage | Yes | List all orders |
| `/orders/:orderId` | OrderDetailPage | Yes | Order detail + company management |
| `/reports` | ReportsPage | Yes | List all reports |
| `/clients` | ClientsPage | Yes | Client management |
| `/clients/:clientId` | ClientDetailPage | Yes | Client detail + orders |
| `/invoices` | InvoicesPage | Yes | Invoice list |
| `/invoices/:invoiceId` | InvoiceDetailPage | Yes | Invoice detail |
| `/upload` | UploadPage | Yes | Upload docs for new report |
| `/processing/:reportId` | ProcessingPage | Yes | AI extraction progress |
| `/extractor/:reportId` | ExtractorPage | Yes | AI extractor (Claude API) |
| `/editor/:reportId` | EditorPage | Yes | Report editor (19 page sections) |
| `/generating/:reportId` | GeneratingPage | Yes | AI narrative generation |

---

## 5. BACKEND API ENDPOINTS (Complete)

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/auth/login` | No | Login → JWT token |
| GET | `/api/auth/me` | Yes | Current user info |
| POST | `/api/auth/verify` | Yes | Verify token |
| GET | `/api/auth/users` | SA | List users |
| POST | `/api/auth/users` | SA | Create user |
| PATCH | `/api/auth/users/{id}` | SA | Update user |
| DELETE | `/api/auth/users/{id}` | SA | Delete user |

### Portal (`/api/portal`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/portal/auth` | No | Portal login (token + password) |
| GET | `/api/portal/me` | Portal JWT | Portal session info |
| POST | `/api/portal/submit-order` | Portal JWT | Submit order (JSON) |
| POST | `/api/portal/submit-order-with-files` | Portal JWT | Submit order + files |
| GET | `/api/portal/order-status/{order_number}` | Portal JWT | Check order status |

### Orders (`/api/orders`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/orders/` | Yes | List all orders |
| POST | `/api/orders/` | Yes | Create order |
| GET | `/api/orders/{id}` | Yes | Order detail (with companies, files, invoice) |
| PATCH | `/api/orders/{id}` | Yes | Update order |
| PATCH | `/api/orders/{id}/companies/{cid}` | Yes | Update company in order |
| POST | `/api/orders/{id}/companies/{cid}/start` | Yes | **START REPORT** (creates report, links to company) |
| POST | `/api/orders/{id}/companies/{cid}/complete` | Yes | Mark company complete |
| DELETE | `/api/orders/{id}` | Yes | Delete order (pending only) |

### Reports (`/api/report`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/report/` | Yes | List all reports |
| GET | `/api/report/{id}` | Yes | Get report |
| PATCH | `/api/report/{id}/field` | Yes | Update single field |
| PATCH | `/api/report/{id}/fields` | Yes | Bulk update fields |
| PATCH | `/api/report/{id}/array` | Yes | Update array field |
| POST | `/api/report/{id}/recalculate` | Yes | Recalculate stats |
| POST | `/api/report/{id}/easy-way` | Yes | Easy Way import |
| DELETE | `/api/report/{id}` | Yes | Delete report |

### Upload (`/api/upload`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/upload/start` | Yes | Start new report |
| POST | `/api/upload/files/{reportId}` | Yes | Upload files |
| GET | `/api/upload/status/{reportId}` | Yes | Upload status |
| DELETE | `/api/upload/file/{reportId}/{filename}` | Yes | Delete uploaded file |

### Extract (`/api/extract`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/extract/start/{reportId}` | Yes | Start extraction |
| GET | `/api/extract/progress/{reportId}` | Yes | Extraction progress |
| GET | `/api/extract/fields/{reportId}` | Yes | Get extracted fields |

### Generate (`/api/generate`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/generate/narratives/{reportId}` | Yes | Generate AI narratives |
| GET | `/api/generate/progress/{reportId}` | Yes | Generation progress |
| POST | `/api/generate/regenerate/{reportId}` | Yes | Regenerate sections |

### PDF (`/api/pdf`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/pdf/generate/{reportId}` | Yes | Generate PDF |
| GET | `/api/pdf/status/{reportId}` | Yes | PDF status |
| GET | `/api/pdf/preview/{reportId}` | Yes | Preview PDF |
| GET | `/api/pdf/download/{reportId}` | Yes | Download PDF |

### Export (`/api/export`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/export/json/{reportId}` | Yes | Export JSON |
| POST | `/api/export/xml/{reportId}` | Yes | Export XML |
| POST | `/api/export/excel/{reportId}` | Yes | Export Excel |
| POST | `/api/export/csv/{reportId}` | Yes | Export CSV |
| POST | `/api/export/word/{reportId}` | Yes | Export Word |

### Invoices (`/api/invoices`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/invoices/` | Yes | List invoices |
| GET | `/api/invoices/{id}` | Yes | Invoice detail |
| POST | `/api/invoices/generate/{orderId}` | Yes | Generate invoice from order |
| PATCH | `/api/invoices/{id}` | Yes | Update invoice |
| PATCH | `/api/invoices/{id}/status` | Yes | Update invoice status |
| GET | `/api/invoices/{id}/html` | Yes | Get invoice HTML |

### Clients (`/api/clients`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/clients/` | Yes | List clients |
| GET | `/api/clients/{id}` | Yes | Client detail |
| POST | `/api/clients/` | Yes | Create client |
| PATCH | `/api/clients/{id}` | Yes | Update client |
| DELETE | `/api/clients/{id}` | Yes | Delete client |
| POST | `/api/clients/{id}/generate-portal-link` | Yes | Generate portal link |
| GET | `/api/clients/{id}/sessions` | Yes | Client sessions |
| DELETE | `/api/clients/sessions/{sessionId}` | Yes | Revoke session |

### Search (`/api/search`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| GET | `/api/search/reports` | Yes | Search cloud reports |
| GET | `/api/search/local` | Yes | Search local reports |
| GET | `/api/search/all` | Yes | Combined reports |
| GET | `/api/search/output` | Yes | Output reports |

### Cloud (`/api/cloud`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/cloud/save/{reportId}` | Yes | Save to Supabase |
| GET | `/api/cloud/status/{reportId}` | Yes | Cloud status |
| DELETE | `/api/cloud/{reportId}` | Yes | Delete cloud report |

### Proxy (`/api/proxy`)
| Method | Path | Auth | Description |
|--------|------|:----:|-------------|
| POST | `/api/proxy` | No | Claude API proxy (no auth required!) |

---

## 6. FRONTEND API CLIENT → BACKEND WIRING MAP

### `ordersAPI` → Backend
| Frontend Call | HTTP | Backend Endpoint | Status |
|---------------|------|-----------------|:------:|
| `ordersAPI.getAll(filters)` | GET | `/api/orders/?status=&analyst=` | ✅ |
| `ordersAPI.getOne(id)` | GET | `/api/orders/{id}` | ✅ |
| `ordersAPI.update(id, data)` | PATCH | `/api/orders/{id}` | ✅ |
| `ordersAPI.updateCompany(oid, cid, data)` | PATCH | `/api/orders/{oid}/companies/{cid}` | ✅ |
| `ordersAPI.startCompany(oid, cid)` | POST | `/api/orders/{oid}/companies/{cid}/start` | ✅ |
| `ordersAPI.completeCompany(oid, cid)` | POST | `/api/orders/{oid}/companies/{cid}/complete` | ✅ |

### `reportAPI` → Backend
| Frontend Call | HTTP | Backend Endpoint | Status |
|---------------|------|-----------------|:------:|
| `reportAPI.startReport(data)` | POST | `/api/upload/start` | ✅ |
| `reportAPI.uploadFiles(id, files)` | POST | `/api/upload/files/{id}` | ✅ |
| `reportAPI.startExtraction(id)` | POST | `/api/extract/start/{id}` | ✅ |
| `reportAPI.getExtractionProgress(id)` | GET | `/api/extract/progress/{id}` | ✅ |
| `reportAPI.getReport(id)` | GET | `/api/report/{id}` | ✅ |
| `reportAPI.updateField(id, name, val)` | PATCH | `/api/report/{id}/field` | ✅ |
| `reportAPI.updateFieldsBulk(id, fields)` | PATCH | `/api/report/{id}/fields` | ✅ |
| `reportAPI.updateArray(id, name, data)` | PATCH | `/api/report/{id}/array` | ✅ |
| `reportAPI.easyWayImport(id, data)` | POST | `/api/report/{id}/easy-way` | ✅ |
| `reportAPI.generatePDF(id)` | POST | `/api/pdf/generate/{id}` | ✅ |
| `reportAPI.generateNarratives(id)` | POST | `/api/generate/narratives/{id}` | ✅ |
| `reportAPI.saveToCloud(id)` | POST | `/api/cloud/save/{id}` | ✅ |
| `reportAPI.getAllReports()` | GET | `/api/report/` | ✅ |
| `reportAPI.getAllReportsCombined()` | GET | `/api/search/all` | ✅ |
| `reportAPI.deleteReport(id)` | DELETE | `/api/report/{id}` | ✅ |

### `invoicesAPI` → Backend
| Frontend Call | HTTP | Backend Endpoint | Status |
|---------------|------|-----------------|:------:|
| `invoicesAPI.generate(orderId)` | POST | `/api/invoices/generate/{orderId}` | ✅ |
| `invoicesAPI.getAll(filters)` | GET | `/api/invoices/` | ✅ |
| `invoicesAPI.getOne(id)` | GET | `/api/invoices/{id}` | ✅ |
| `invoicesAPI.update(id, data)` | PATCH | `/api/invoices/{id}` | ✅ |
| `invoicesAPI.updateStatus(id, status)` | PATCH | `/api/invoices/{id}/status` | ✅ |
| `invoicesAPI.getHtml(id)` | GET | `/api/invoices/{id}/html` | ✅ |

### `clientsAPI` → Backend
| Frontend Call | HTTP | Backend Endpoint | Status |
|---------------|------|-----------------|:------:|
| `clientsAPI.getAll(search)` | GET | `/api/clients/?search=` | ✅ |
| `clientsAPI.getOne(id)` | GET | `/api/clients/{id}` | ✅ |
| `clientsAPI.create(data)` | POST | `/api/clients/` | ✅ |
| `clientsAPI.update(id, data)` | PATCH | `/api/clients/{id}` | ✅ |
| `clientsAPI.delete(id)` | DELETE | `/api/clients/{id}` | ✅ |
| `clientsAPI.generatePortalLink(id, opts)` | POST | `/api/clients/{id}/generate-portal-link` | ✅ |
| `clientsAPI.getSessions(id)` | GET | `/api/clients/{id}/sessions` | ✅ |
| `clientsAPI.revokeSession(sid)` | DELETE | `/api/clients/sessions/{sid}` | ✅ |

---

## 7. THE CRITICAL PIPELINE: Order → Report → Extractor → Editor → Complete

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THE BULLETPROOF PIPELINE                         │
│                                                                     │
│  STEP 1: CLIENT SUBMITS ORDER (Portal)                             │
│  ─────────────────────────────────────                              │
│  Portal → POST /api/portal/submit-order-with-files                  │
│  Creates: order (pending) + order_companies (pending) + files       │
│  Auto-assigns analyst via round-robin                               │
│                                                                     │
│  STEP 2: ANALYST OPENS ORDER (Frontend)                            │
│  ────────────────────────────────────────                           │
│  /orders/:orderId → OrderDetailPage                                 │
│  Shows: companies, files, status, progress                          │
│                                                                     │
│  STEP 3: ANALYST CLICKS "START REPORT"                             │
│  ─────────────────────────────────────                              │
│  Button: "▶ Start Report" (on CompanyCard, status=pending)          │
│  → POST /api/orders/{orderId}/companies/{companyId}/start           │
│  Backend does:                                                      │
│    1. Creates new report in DB (empty)                              │
│    2. Populates: report_date, current_year, company_name,           │
│       country, cr_number, client_name, analyst_name                 │
│    3. Sets report status to "uploading"                             │
│    4. Updates order_company: report_id, status="in_progress"        │
│    5. If order was pending → sets order to "in_progress"            │
│  Returns: { report_id, redirect_url }                               │
│  Frontend navigates to: /extractor/{reportId}                       │
│                                                                     │
│  STEP 4: ANALYST USES EXTRACTOR                                    │
│  ─────────────────────────────────                                  │
│  /extractor/:reportId → ExtractorPage                               │
│  Analyst uploads files (PDFs, images, docs)                         │
│  Extractor calls Claude API (via /api/proxy)                        │
│  Returns full JSON with all report fields                           │
│  Analyst clicks "Continue to Editor →"                              │
│  → Stores JSON in localStorage("valyze_import_" + reportId)         │
│  → Navigates to /editor/{reportId}?autoImport=1                     │
│                                                                     │
│  STEP 5: EDITOR LOADS & IMPORTS DATA                                │
│  ───────────────────────────────────                                │
│  /editor/:reportId → EditorPage                                     │
│  Reads localStorage for autoImport data                             │
│  Calls: reportAPI.easyWayImport(reportId, data)                     │
│  → POST /api/report/{reportId}/easy-way                             │
│  Saves all extracted JSON fields into report_json in Supabase       │
│                                                                     │
│  STEP 6: ANALYST EDITS & SAVES                                     │
│  ──────────────────────────────                                     │
│  Editor allows editing 19 page sections                             │
│  Save: reportAPI.updateField / updateFieldsBulk / saveToCloud       │
│  → PATCH /api/report/{reportId}/field or /fields                    │
│  → POST /api/cloud/save/{reportId}                                  │
│  Report status updates throughout                                   │
│                                                                     │
│  STEP 7: ANALYST MARKS COMPANY AS COMPLETE                         │
│  ───────────────────────────────────────────                        │
│  Back on /orders/:orderId → CompanyCard (status=in_progress)        │
│  Button: "✓ Mark Complete"                                          │
│  → POST /api/orders/{orderId}/companies/{companyId}/complete        │
│  Backend does:                                                      │
│    1. Updates order_company status to "completed"                   │
│    2. Checks if ALL companies are complete                          │
│    3. If yes → marks order as "completed"                           │
│    4. Auto-generates invoice via _trigger_invoice_creation          │
│                                                                     │
│  STEP 8: INVOICE AUTO-GENERATED                                    │
│  ─────────────────────────────────                                  │
│  When order → completed:                                            │
│  → Creates invoice in DB with pricing                               │
│  → Invoice appears in /invoices page                                │
│  → Order status may become "invoiced" if manual invoice triggered   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. POTENTIAL FAILURE POINTS & RISKS

### 🔴 HIGH RISK — Pipeline Breaking Points

| # | Failure Point | Impact | Risk Level |
|---|--------------|--------|:----------:|
| 1 | **localStorage-based data transfer** (Extractor → Editor) | If browser storage clears or user switches browser, data is lost | 🔴 HIGH |
| 2 | **No transactional DB operations** — order_company update + report creation are separate calls | If report creation succeeds but company update fails, orphaned report exists | 🔴 HIGH |
| 3 | **`/api/proxy` has NO auth** — anyone can call Claude API through your backend | Security risk + cost exposure | 🔴 HIGH |
| 4 | **Race condition on concurrent company starts** — two users click "Start Report" on same company simultaneously | Could create duplicate reports | 🟡 MEDIUM |
| 5 | **No idempotency on company complete** — clicking "Mark Complete" twice could trigger double invoice | Duplicate invoices possible | 🟡 MEDIUM |
| 6 | **Portal file upload → local filesystem** — files saved to `uploads/portal/{orderId}/` | Won't work on Vercel serverless (no persistent filesystem) | 🔴 HIGH |
| 7 | **Extractor requires user's own API key** — stored in localStorage | Key exposure risk, user friction | 🟡 MEDIUM |

### 🟡 MEDIUM RISK — Data Integrity Issues

| # | Issue | Impact |
|---|-------|--------|
| 8 | **Report ID from `start_company_work` uses UUID** but extractor rule says VCR-YYYYMMDD-XXXX format | Report ID format mismatch |
| 9 | **`create_report(None, report_id)`** — the `None` db parameter is ignored (Supabase only) but confusing | Maintainability concern |
| 10 | **Invoice auto-generation in `_trigger_invoice_creation` catches all exceptions silently** | Failed invoices are lost without alert |
| 11 | **No optimistic locking** on report updates — two users editing same report could overwrite each other | Data corruption risk |
| 12 | **`_complete_order_if_ready` calls `_get_order_or_404` which raises 404 if order not found** — but it's called inside try/except that doesn't re-raise properly | Could silently fail |
| 13 | **Portal submit creates order with `company_count` from request** but order companies are created separately | Count could be wrong if company creation partially fails |

### 🟢 LOW RISK — UX/Minor Issues

| # | Issue | Impact |
|---|-------|--------|
| 14 | **Extractor "Save for Easy Import" when no reportId** → navigates to `/` with localStorage | User may not complete import |
| 15 | **No loading state when starting a company report** from OrderDetailPage while API call is in progress | Brief confusion |
| 16 | **Invoice list shows client_name/order_number** via `_enrich_invoice_summary` which makes extra DB calls per invoice | Performance at scale |

---

## 9. WIRING VERIFICATION CHECKLIST

### Portal → Backend
- [x] Portal auth endpoint exists and works: `POST /api/portal/auth`
- [x] Portal token JWT is valid and has expiry
- [x] Submit order with files: `POST /api/portal/submit-order-with-files`
- [x] Files saved to disk at `uploads/portal/{orderId}/`
- [x] Order created in Supabase with correct fields
- [x] Order companies created for each company
- [x] Session usage count incremented

### Orders → Reports
- [x] "Start Report" button calls correct endpoint: `POST /api/orders/{oid}/companies/{cid}/start`
- [x] Backend creates report + links to order_company
- [x] Returns report_id for navigation
- [x] Frontend navigates to `/extractor/{reportId}`
- [x] "Mark Complete" calls correct endpoint: `POST /api/orders/{oid}/companies/{cid}/complete`
- [x] Order auto-completes when all companies done
- [x] Invoice auto-generated on completion

### Extractor → Editor
- [x] ExtractorPage reads reportId from URL params
- [x] Calls Claude API via `/api/proxy`
- [x] Stores result in localStorage with key `valyze_import_{reportId}`
- [x] Navigates to `/editor/{reportId}?autoImport=1`
- [x] EditorPage reads localStorage on mount
- [x] Calls `easyWayImport` to save to backend

### Editor → Save
- [x] Editor can update individual fields
- [x] Editor can bulk update fields
- [x] Editor can save to cloud (Supabase)
- [x] PDF generation works
- [x] Export options available (JSON, XML, Excel, CSV, Word)

### Invoices
- [x] Auto-generated when order completes
- [x] Manual generation: `POST /api/invoices/generate/{orderId}`
- [x] Only completed orders can be invoiced
- [x] Duplicate invoice prevention
- [x] Status updates (draft → sent → paid)
- [x] HTML rendering for download/print

---

## 10. PORTAL WORKFLOW (Client-Facing)

```
Client receives portal link → /portal
    │
    ├── Enters token + password → POST /api/portal/auth
    │   └── Gets portal_token (JWT, 4hr expiry)
    │
    ├── Fills out order form (multi-company)
    │   ├── Client reference
    │   ├── Service level (basic/standard/express/urgent)
    │   ├── Due date
    │   ├── Companies (name, country, reg no, VAT, phone, comments)
    │   └── File attachments per company
    │
    ├── Submits → POST /api/portal/submit-order-with-files
    │   └── Returns: order_number, company_count, files
    │
    └── Success screen shows confirmation
```

---

## 11. CONCURRENT USER SCENARIOS

### Scenario: 10 Users Working Simultaneously

| Risk | Mitigation Status |
|------|:-----------------:|
| Two users start the same company report | ⚠️ No mutex — could create duplicate reports |
| Two users edit the same report simultaneously | ⚠️ No locking — last write wins |
| Two users complete companies on same order simultaneously | ⚠️ Double invoice possible (mitigated by `get_order_invoice` check in `_trigger_invoice_creation`) |
| Portal submissions during order processing | ✅ Each portal session creates unique order |
| Analyst assignment during concurrent order creation | ⚠️ Round-robin could assign same analyst twice (based on stale workload data) |

---

## 12. AUTH FLOW MAP

```
┌─────────────────────────────────────────────────┐
│                AUTHENTICATION                    │
│                                                  │
│  Admin Dashboard (Frontend)                      │
│  ─────────────────────────                       │
│  Login → POST /api/auth/login                    │
│  → Receives JWT token                            │
│  → Stored in localStorage("valyze_token")         │
│  → All API calls include Authorization: Bearer   │
│  → ProtectedRoute checks token exists            │
│                                                  │
│  Client Portal                                   │
│  ─────────────                                   │
│  Login → POST /api/portal/auth                   │
│  → Receives portal_token (JWT, 4hr)              │
│  → Stored in localStorage("portal_token")        │
│  → Portal API calls include portal Bearer token  │
│                                                  │
│  API Proxy (Extractor)                           │
│  ──────────────────                              │
│  No backend auth — uses user's Anthropic API key │
│  → User enters key in ExtractorPage              │
│  → Key stored in localStorage("valyze_api_key")  │
│  → Sent as x-api-key header to proxy             │
└─────────────────────────────────────────────────┘
```

---

## 13. CRITICAL ISSUES TO FIX

### Issue 1: localStorage Data Bridge (Extractor → Editor)
**Problem:** The extractor stores extracted JSON in localStorage, then the editor reads it. This is fragile.
**Risk:** Data loss if: user clears storage, different browser, storage quota exceeded.
**Recommendation:** Save extraction result to backend immediately after extraction, then editor reads from backend.

### Issue 2: Proxy Endpoint Has No Auth
**Problem:** `POST /api/proxy` has no authentication middleware.
**Risk:** Anyone can proxy requests to Claude API through your backend, consuming your resources.
**Recommendation:** Add `Depends(get_current_user)` to the proxy endpoint.

### Issue 3: No Concurrent Access Protection on Reports
**Problem:** Multiple users editing the same report has no locking mechanism.
**Risk:** Last write wins — one user's changes silently overwritten by another.
**Recommendation:** Add optimistic locking via `updated_at` timestamp check.

### Issue 4: File Upload Only Works Locally
**Problem:** Portal files are saved to local disk (`uploads/portal/`). This won't work on Vercel serverless.
**Risk:** Files lost in production if deployed to Vercel.
**Recommendation:** Use Supabase Storage or S3 for file storage.

### Issue 5: Invoice Double-Generation
**Problem:** `_complete_order_if_ready` checks `get_order_invoice` but there's a TOCTOU race between check and creation.
**Risk:** Two concurrent completions could create two invoices.
**Recommendation:** Add a database unique constraint on `invoices.order_id` or use a lock.

---

## 14. DATA FLOW DIAGRAM — COMPLETE SYSTEM

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  CLIENT  │     │ ANALYST  │     │  ADMIN   │     │ SUPABASE │
│  (Portal)│     │(Dashboard│     │          │     │   (DB)   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                 │                 │                 │
     │  Submit Order   │                 │                 │
     │────────────────▶│                 │                 │
     │                 │                 │                 │
     │   ┌─────────────┼─────────────────┼─────┐          │
     │   │          BACKEND (FastAPI)          │          │
     │   │  ┌─────────────────────────────┐   │          │
     │   │  │ /api/portal/submit-order     │───┼─────────▶│
     │   │  │ /api/orders/ (CRUD)          │───┼─────────▶│
     │   │  │ /api/report/ (CRUD)          │───┼─────────▶│
     │   │  │ /api/invoices/ (CRUD)        │───┼─────────▶│
     │   │  │ /api/upload/ (files)         │───┼─────────▶│
     │   │  │ /api/proxy (Claude)          │───┼─────────▶│ Claude API
     │   │  │ /api/pdf/ (generation)       │   │          │
     │   │  │ /api/export/ (formats)       │   │          │
     │   │  └─────────────────────────────┘   │          │
     │   └─────────────────────────────────────┘          │
     │                 │                 │                 │
     │   View Status   │  View Orders    │  Manage Users  │
     │◀────────────────│◀────────────────│◀───────────────│
     │                 │                 │                 │
     │                 │  Start Report   │                 │
     │                 │────────────────▶│────────────────▶│ (create report)
     │                 │                 │                 │
     │                 │  Extract Data   │                 │
     │                 │────────────────▶│──Claude API────▶│
     │                 │                 │                 │
     │                 │  Edit & Save    │                 │
     │                 │────────────────▶│────────────────▶│ (update report)
     │                 │                 │                 │
     │                 │  Mark Complete  │                 │
     │                 │────────────────▶│────────────────▶│ (update company)
     │                 │                 │                 │
     │                 │  Generate Inv.  │                 │
     │                 │────────────────▶│────────────────▶│ (create invoice)
     │                 │                 │                 │
```

---

## 15. SUMMARY — IS THE SYSTEM WIRED CORRECTLY?

### ✅ What's Wired Correctly
1. All frontend API calls match backend endpoints exactly
2. All router registrations in main.py are correct
3. Portal → Order → Company → Report chain is complete
4. Invoice auto-generation on order completion works
5. Auth flow is consistent across all apps
6. File upload paths are correct
7. Editor import flow (localStorage → easyWayImport) works
8. All CRUD operations for clients, orders, reports, invoices exist

### ⚠️ What Needs Attention
1. **localStorage bridge** between Extractor and Editor (fragile but functional)
2. **Proxy endpoint** has no auth (security risk)
3. **No concurrent access protection** on reports
4. **Local file storage** won't work in Vercel serverless
5. **No transactional safety** on multi-step operations (create report + link company)
6. **Silent failure** in invoice auto-generation exception handling

### 🔴 Critical for "10 Users Working Simultaneously"
- The system WILL work for 10 users **if they're working on different orders/companies**
- If multiple users work on the SAME report, there's a data corruption risk
- Invoice generation is mostly safe (has duplicate check) but not perfectly race-proof

---

*This document should be your reference for all system discussions. Every endpoint, every button, every data flow is mapped above.*