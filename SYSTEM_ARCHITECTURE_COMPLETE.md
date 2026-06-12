# Valyze Credit Intelligence Platform — Complete System Architecture

> **Last Updated:** June 12, 2026  
> **Purpose:** This document is the single source of truth for the entire Valyze system. Share this with any AI agent to give them full context for refactoring, adding features, or fixing bugs.

---

## TABLE OF CONTENTS
1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Backend (FastAPI)](#3-backend-fastapi)
4. [Frontend (React/Vite)](#4-frontend-reactvite)
5. [Valyze Extractor (AI Extraction SPA)](#5-valyze-extractor-ai-extraction-spa)
6. [Database (Supabase/PostgreSQL)](#6-database-supabasepostgresql)
7. [PDF Generation System](#7-pdf-generation-system)
8. [Data Model & Field Registry](#8-data-model--field-registry)
9. [Authentication System](#9-authentication-system)
10. [API Route Reference](#10-api-route-reference)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Environment Variables](#12-environment-variables)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Known Codebase Issues](#14-known-codebase-issues)

---

## 1. SYSTEM OVERVIEW

Valyze is a **credit report extraction and generation platform** that:

1. **Ingests** company documents (PDFs, images, Word, Excel) uploaded by analysts
2. **Extracts** structured credit data via **Claude AI (Anthropic)** — the extractor is a separate SPA that calls Claude API through a backend proxy
3. **Stores** everything in **Supabase** (PostgreSQL) — reports are stored as JSONB blobs with indexed metadata columns
4. **Edits** reports through a **19-page interactive editor** frontend with per-field confidence tracking
5. **Exports** to PDF (client-side html2pdf.js), JSON, XML, CSV, Excel, Word
6. **No recalculation** — the imported JSON is the **single source of truth**

### Three Runtime Services

| Service | Port | Tech | Purpose |
|---------|------|------|---------|
| **Backend** | 8000 | FastAPI (Python) | API server, CRUD, proxy, export |
| **Frontend** | 1573 | React/Vite | Report editor, dashboard, login |
| **Extractor** | 5173 | React/Vite | AI document extraction SPA |

---

## 2. ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                                │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Frontend     │  │  Extractor   │  │  PDF Preview (in-browser)│  │
│  │  (port 1573)  │  │  (port 5173) │  │  html2pdf.js conversion │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
│         │                  │                                         │
└─────────┼──────────────────┼─────────────────────────────────────────┘
          │                  │
          │ HTTP/REST        │ HTTP/REST
          ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI, port 8000)                     │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Auth API │  │ Report   │  │ Upload   │  │ Proxy (→Claude)  │   │
│  │ /auth    │  │ /report  │  │ /upload  │  │ /proxy           │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ PDF API  │  │ Export   │  │ Search   │  │ Cloud API        │   │
│  │ /pdf     │  │ /export  │  │ /search  │  │ /cloud           │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
│                                                                      │
│  LAYER 2: Services                                                   │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐   │
│  │ supabase_client.py   │  │ pdf_generator.py                  │   │
│  │ (direct HTTP → Supa) │  │ (HTML → client-side PDF)         │   │
│  └──────────────────────┘  └────────────────────────────────────┘   │
│                                                                      │
│  LAYER 3: Data Access                                                │
│  ┌──────────────────────┐  ┌────────────────────────────────────┐   │
│  │ crud.py (async wrap) │  │ models/report_schema.py           │   │
│  └──────────────────────┘  └────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           │ HTTPS (direct HTTP calls)
                           ▼
              ┌──────────────────────────────┐
              │     SUPABASE (PostgreSQL)     │
              │                              │
              │  Table: reports              │
              │  ├─ id (UUID PK)             │
              │  ├─ status (text)            │
              │  ├─ report_json (JSONB)      │
              │  ├─ company_name (indexed)   │
              │  ├─ cr_number (indexed)      │
              │  ├─ country, analyst, etc.   │
              │  └─ created_at, updated_at   │
              │                              │
              │  Table: uploaded_files       │
              │  ├─ id (UUID PK)             │
              │  ├─ report_id (FK → reports) │
              │  └─ filename, path, type...  │
              └──────────────────────────────┘

CLAUDE API (Anthropic):
  ┌──────────────────────────────────────┐
  │  api.anthropic.com/v1/messages       │
  │  Model: claude-sonnet-4-20250514     │
  │  Called via backend proxy at /proxy  │
  └──────────────────────────────────────┘
```

---

## 3. BACKEND (FastAPI)

### 3.1 Entry Point: `backend/main.py`

- **Framework:** FastAPI with async lifespan
- **Startup:** `init_db()` (no-op, Supabase handles schema), creates `uploads/` and `outputs/` directories (skipped in Vercel serverless)
- **CORS:** Allows localhost:1573-1575, localhost:5173-5179, localhost:3000-3001, plus `FRONTEND_URL` and `CORS_EXTRA_ORIGINS` (comma-separated) from env
- **Static mounts:** `/uploads` and `/outputs` (skipped in Vercel)
- **Exception handlers:** `DuplicateReportError` → 409
- **Health:** `GET /health` → `{status: "ok", pdf: "client-side"}`
- **Readiness:** `GET /ready` → checks Supabase connectivity (counts reports)

### 3.2 API Router Structure

All registered in `main.py`:

| Router | Prefix | File | Purpose |
|--------|--------|------|---------|
| `auth_router` | `/api/auth` | `api/auth.py` | JWT login, verify, me |
| `upload_router` | `/api/upload` | `api/upload.py` | Report creation, file upload |
| `report_router` | `/api/report` | `api/report.py` | CRUD, easy-way import |
| `pdf_router` | `/api/pdf` | `api/pdf.py` | HTML preview for client PDF |
| `export_router` | `/api/export` | `api/export.py` | JSON/XML/CSV/Excel/Word export |
| `search_router` | `/api/search` | `api/search.py` | Search, list, paginate reports |
| `cloud_router` | `/api/cloud` | `api/cloud.py` | Supabase save/status/delete |
| `proxy_router` | `/api/proxy` | `api/proxy.py` | Anthropic API proxy |

### 3.3 File Structure (backend/)

```
backend/
├── main.py                    # App factory, lifespan, CORS, routers
├── pdf_generator.py           # HTML template rendering (1571 lines)
├── requirements.txt           # Python dependencies
├── Dockerfile                 # Docker build
├── vercel.json                # Vercel serverless config
├── .env.example               # Environment variables template
├── api/
│   ├── auth.py                # JWT auth (hardcoded users, SHA-256)
│   ├── upload.py              # Report start, file upload, duplicate check
│   ├── report.py              # Get/Patch/Delete report, easy-way import (~1196 lines)
│   ├── pdf.py                 # HTML generation for client-side PDF
│   ├── export.py              # Multi-format export (JSON, XML, CSV, Excel, Word)
│   ├── search.py              # Search, list, paginate reports
│   ├── cloud.py               # Supabase save/status/delete
│   ├── proxy.py               # Anthropic API proxy (gzip support)
│   ├── extract.py             # Legacy AI extraction (852 lines, unused path)
│   ├── extract_backup.py      # Backup extraction code
│   ├── extract_clean.py       # Clean extraction code
│   ├── generate.py            # Legacy generation code
│   └── index.py               # Vercel serverless entry
├── database/
│   ├── __init__.py
│   ├── db.py                  # Stubbed SQLite → no-op (Supabase migration)
│   ├── crud.py                # Async CRUD wrappers (calls supabase_client)
│   └── exceptions.py          # DuplicateReportError exception class
├── services/
│   └── supabase_client.py     # Direct HTTP calls to Supabase REST API (419 lines)
├── models/
│   ├── report_schema.py       # Pydantic models: FullReport, FieldData, arrays
│   └── field_meta.py          # FIELD_REGISTRY and ARRAY_FIELDS (495 lines)
├── engines/                   # Legacy extraction engines (mostly unused/simplified)
│   ├── defaults_engine.py     # Default values and locked field management
│   ├── file_handler.py        # File type detection and processing
│   ├── pattern_engine.py      # Regex pattern extraction
│   ├── table_engine.py        # Financial table parsing
│   ├── rag_engine.py          # RAG/AI extraction orchestration
│   ├── chunker.py             # Document chunking for AI processing
│   ├── ocr_extractor.py       # OCR image text extraction
│   ├── pdf_extractor.py       # PDF text extraction (pypdf/pdfplumber)
│   ├── word_extractor.py      # Word document extraction (python-docx)
│   └── performance_monitor.py # Extraction performance tracking
├── utils/
│   └── visibility.py          # Field emptiness/section visibility detection
├── templates/
│   └── template.html          # PDF HTML template (2878 lines, 19 sections)
└── tests/
    └── test_visibility.py     # Tests for visibility utilities
```

### 3.4 Key Backend Flows

#### Flow 1: Report Creation + Upload
1. `POST /api/upload/start` → Creates UUID, calls `create_report()` → Supabase POST
2. Sets metadata (report_id, report_date, current_year, client_name, etc.)
3. Status set to `"uploading"`
4. `POST /api/upload/files/{report_id}` → Validates extension + size, saves to `uploads/{report_id}/`, records in `uploaded_files` table
5. `POST /api/upload/check-duplicate` → Checks `cr_number` uniqueness via `get_report_by_cr_number()`

#### Flow 2: Easy Way Import (The Core Data Flow)
1. `POST /api/report/{report_id}/easy-way` → Accepts complete JSON payload
2. **CRITICAL RULE:** The JSON is the **final word** — no recalculation, no auto-triggers
3. Parses nested sections: `financial_data`, `swot_analysis`, `company_identity`, `ownership_structure`, `financial_ratios`, `trend_analysis`, `operational_profile`, `industry_analysis`, `credit_risk_assessment`, `credit_recommendations`, `data_quality`
4. Flattens everything into `updates` dict using ALIASES mapping (250+ field names)
5. Strips `%` from numeric percentage fields before storing
6. Auto-detects currency from country name
7. Sets country display flags (`show_egypt_fields`, `show_saudi_fields`, `show_uae_fields`)
8. Auto-detects section visibility (`show_board_of_directors`, `show_related_concerns`)
9. Force-writes critical fields (credit_rating, risk_level, scores, limits, colors) regardless of locks
10. Recalculates extraction stats, sets status to `"ready"`, saves

#### Flow 3: PDF Generation
1. `GET /api/pdf/html/{report_id}` or `POST /api/pdf/generate/{report_id}`
2. Loads FullReport, passes to `PDFGenerator.get_html_preview()`
3. Returns 2878-line HTML template with inline CSS
4. Frontend generates PDF client-side using html2pdf.js
5. No Gotenberg/Playwright/Docker needed

#### Flow 4: Export
1. `POST /api/export/json/{report_id}` → model_dump() → JSON Response
2. `POST /api/export/xml/{report_id}` → XML tree from fields
3. `POST /api/export/csv/{report_id}` → Field:Value CSV
4. `POST /api/export/excel/{report_id}` → openpyxl → base64
5. `POST /api/export/word/{report_id}` → python-docx → base64
6. `GET /api/export/backup/all` → All reports as JSON backup

---

## 4. FRONTEND (React/Vite)

### 4.1 Entry Point: `frontend/src/main.jsx`

Provider chain (outer → inner):
```
StrictMode → ErrorBoundary → BrowserRouter → ReportProvider → App
```

### 4.2 App.jsx Route Structure

| Path | Page Component | Auth Required | Purpose |
|------|---------------|:---:|---------|
| `/login` | `LoginPage` | No | Login form |
| `/` | `HomePage` | Yes | Dashboard with stats |
| `/reports` | `ReportsPage` | Yes | Report list/search |
| `/upload` | `UploadPage` | Yes | Upload documents |
| `/processing/:reportId` | `ProcessingPage` | Yes | Show upload progress |
| `/extractor/:reportId` | `ExtractorPage` | Yes | AI extraction (iframe to valyze-extractor) |
| `/editor/:reportId` | `EditorPage` | Yes | 19-page interactive editor |
| `/generating/:reportId` | `GeneratingPage` | Yes | PDF generation |
| `/done/:reportId` | `DonePage` | Yes | Completion/success |
| `*` | Redirect to `/` | — | Catch-all |

### 4.3 Page Details

**LoginPage:**
- Email/password form → calls `AuthContext.login()`
- POST `/api/auth/login` → receives JWT token + user object
- Token stored in localStorage
- 5 hardcoded users with roles: admin, analyst, reviewer

**HomePage (Dashboard):**
- Fetches reports from `GET /api/search/reports` and `GET /api/search/count`
- Shows: total reports, by status (uploading/ready/done), by country
- Recent reports table, quick action buttons
- Navigate: Upload, Reports, or open existing report

**UploadPage:**
- Step 1: Form (client name, reference, company hint, analyst info)
- Step 2: Drag-and-drop file zone (max 5 files, PDF/Word/Image)
- Calls: `POST /api/upload/start`, `POST /api/upload/files/{report_id}`
- Shows progress bar per file
- On complete → navigates to `/extractor/{reportId}`

**ReportsPage:**
- Lists all reports from `GET /api/search/reports`
- Search bar, filters (status, country)
- Table: company name, CR number, client reference, status, analyst, dates
- Actions: Edit, Extract, Generate PDF, Delete
- Pagination

**ExtractorPage:**
- Embeds `valyze-extractor` in an iframe
- Passes report_id and JWT token as URL params
- Child communicates back via `postMessage`
- Shows extraction progress and completion

**EditorPage (The Main Interface):**
- Loads report via `GET /api/report/{report_id}`
- Left sidebar (SideNav) shows 19 pages with completion status
- Right panel renders the active editor page component
- Top-right: Easy Way Import button (opens modal), Generate PDF button
- Auto-saves fields on change (800ms debounce)
- Each field shows confidence badge (high/medium/missing/calculated)
- Fields can be hidden via eye toggle

**ProcessingPage:**
- Shows upload status via polling `GET /api/upload/status/{report_id}`
- File list with checkmarks when processed
- Auto-navigates to editor when extraction complete

**GeneratingPage:**
- Fetches PDF HTML via `GET /api/pdf/html/{report_id}`
- Renders in iframe, then converts to PDF using html2pdf.js
- Download button, view in new tab
- Navigate to `/done/{reportId}` on success

**DonePage:**
- Success screen with report details
- Options: View Report, Generate New, Go Home

### 4.4 Key Components

**Layout.jsx:**
- Sticky glass nav bar with Valyze branding, dark/light mode toggle, user info/logout
- Animated gradient background

**SideNav.jsx:**
- 19 report page links with icons
- Per-page completion indicator (CheckCircle/Circle/AlertCircle)
- Overall progress bar at bottom

**EasyWayImport.jsx:**
- 4-step modal: Intro → Paste JSON → Preview → Done
- Strips markdown code fences
- Validates JSON structure
- Calls `PATCH /api/report/{report_id}/easy-way`
- Shows section breakdown with field counts

**FieldInput.jsx:**
- Generic form control (text/textarea/select)
- Debounced auto-save (800ms)
- Shows confidence badge
- Hide toggle button
- Respects STATUS and TYPE from FIELD_REGISTRY

**ArrayEditor.jsx:**
- Edits array-type fields (shareholders, branches, banking, etc.)
- Add/remove rows, inline editing
- Renders different layouts per array type

**GenericTableEditor.jsx:**
- Financial data table (3-year columns)
- Edits revenue, COGS, assets, liabilities across year_1/2/3
- Auto-calculates gross profit per row

### 4.5 Context Providers

**AuthContext.jsx:**
- `login(email, password)` → POST `/api/auth/login`
- `logout()` → clears token, redirects to login
- `user` object: { id, email, name, role }
- Token auto-attached to all API requests via `api/client.js` interceptor
- Handles token refresh on 401

**ReportContext.jsx:**
- `currentReport` — FullReport object for the active editor session
- `loadReport(id)` — fetches from `GET /api/report/{id}`
- `updateField(fieldName, value)` — PATCH `/api/report/{id}/field`
- `updateFields(fields)` — PATCH `/api/report/{id}/fields` (bulk)
- `updateArray(arrayName, data)` — PATCH `/api/report/{id}/array`
- `easyWayImport(data)` — POST `/api/report/{id}/easy-way`
- Tracks hidden fields array
- Tracks page-specific field visibility (STATE_FIELDS per page)

### 4.6 API Client (`api/client.js`)

- Axios instance with baseURL from `VITE_API_URL` env var
- Request interceptor: attaches `Authorization: Bearer <token>` from localStorage
- Response interceptor: on 401, clears token and redirects to `/login`
- Exports: `reportsAPI`, `uploadAPI`, `authAPI`, `searchAPI`, `exportAPI`, `pdfAPI`

---

## 5. VALYZE EXTRACTOR (AI Extraction SPA)

### 5.1 Overview

A **separate standalone React SPA** at `valyze-extractor/` that uses **Claude Anthropic API** to automatically extract structured credit data from uploaded documents.

### 5.2 Key Features

**File Upload:**
- Drag-and-drop zone supporting: PDF, Word (.docx), Images (PNG/JPG/TIFF), Excel (.xlsx/.xls), CSV, TXT
- Max 5 files, with progress indicators
- Auto-detects file type and routes to appropriate processor

**PDF Processing Modes:**
- **Text mode:** Extracts text content using pdf.js, sends as text blocks
- **Vision mode:** Renders PDF pages as base64 images, sends to Claude for OCR
- **Smart mode (hybrid):** Text pages → text, sparse/spreadsheet pages → images
- User-selectable in the UI

**Claude API Integration:**
- Model: `claude-sonnet-4-20250514`
- Extensive ~270-line system prompt covering: data integrity rules, currency display, country-specific registration fields (Egypt/UAE/Saudi), strict JSON output format
- Web search enabled for additional company information
- Fields include all 19 report sections

**Architecture:**
```
Extractor SPA (React)
  │
  ├── File Upload (drag & drop)
  ├── PDF Processing (pdf.js text extraction)
  ├── Image Processing (canvas → base64)
  ├── Claude API Client
  │     └── POST /api/proxy (through backend, not directly)
  └── Results Output
        └── JSON formatted for Easy Way Import
```

**Backend Proxy:**
- The extractor sends to `POST /api/proxy` on the backend
- Backend forwards to `api.anthropic.com/v1/messages` with the API key
- Supports gzip-compressed request bodies (Vercel has ~4.5MB body limit)
- 5-minute timeout, size checks on compressed and decompressed payloads

**Mock Data:**
- `valyze-extractor/mock-data.json` — Complete example of the expected JSON output format with all sections populated

### 5.3 Token-Based Auth

- Auth token passed as URL query parameter `?token=...`
- Verified against backend `GET /api/auth/me`
- No login screen — purely receives token from parent window

### 5.4 Communication with Frontend

- Embedded via `<iframe>` in the frontend's ExtractorPage
- Token passed as URL parameter
- After extraction completes, passes JSON result back via `postMessage` or user manually copies it for Easy Way Import

---

## 6. DATABASE (Supabase/PostgreSQL)

### 6.1 Schema (`supabase_setup.sql`)

**Table: `reports`**
```sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status TEXT NOT NULL DEFAULT 'uploading',
    report_json JSONB NOT NULL DEFAULT '{}',
    company_name TEXT,
    legal_name TEXT,
    cr_number TEXT,
    client_reference TEXT,
    country TEXT,
    address TEXT,
    analyst TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Table: `uploaded_files`**
```sql
CREATE TABLE uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    language TEXT,
    pages INTEGER,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Indexes:** `idx_reports_status`, `idx_uploaded_files_report_id`

**RLS:** Both tables have permissive policies (`FOR ALL USING (true)`) — wide open.

### 6.2 Data Access Pattern

- `services/supabase_client.py` — Direct HTTP calls to Supabase REST API
  - `SUPABASE_URL` + `/rest/v1/` prefix
  - Uses `SUPABASE_SERVICE_KEY` (or `SUPABASE_ANON_KEY`) as Bearer token
  - All functions are synchronous, wrapped in `asyncio.to_thread()` in `crud.py`
- `database/crud.py` — Async wrappers with FullReport model validation
  - `create_report()` → POST to Supabase
  - `get_report()` → GET by id, validates JSONB into FullReport via Pydantic
  - `update_report_field()` → Updates single field, saves entire report
  - `save_report_json()` → Validates, PATCH to Supabase
  - `delete_report()` → DELETE
  - `get_all_reports()` → GET all, transforms rows

### 6.3 Report JSON Structure

The `report_json` column stores the complete `FullReport` Pydantic model:

```json
{
  "report_id": "uuid-string",
  "status": "ready",
  "created_at": "ISO datetime",
  "updated_at": "ISO datetime",
  "fields": {
    "company_name": {"value": "ACME Corp", "confidence": "high", "source": "easy_way_import", "locked": false},
    "cr_number": {"value": "123456", "confidence": "high", "source": "easy_way_import", "locked": false},
    "credit_rating": {"value": "A", "confidence": "high", "source": "easy_way_import", "locked": false},
    // ... 450+ fields
  },
  "arrays": {
    "shareholders": [
      {"name": "John Doe", "percentage": "50%", "nationality": "USA", "type": "Individual"}
    ],
    "branches": [],
    "strengths": ["Strong market position", "Experienced management"],
    "weaknesses": ["High debt levels"],
    // ... all array fields
  },
  "files": [],
  "extraction_stats": {
    "total_fields": 450,
    "high_confidence": 400,
    "medium_confidence": 30,
    "missing": 20,
    "calculated": 0
  }
}
```

---

## 7. PDF GENERATION SYSTEM

### 7.1 PDFGenerator Class (`backend/pdf_generator.py`)

- **File:** `backend/pdf_generator.py` (1571 lines)
- **Template:** `backend/templates/template.html` (2878 lines, all inline CSS)
- **Output:** HTML only — PDF conversion happens client-side via html2pdf.js
- **No server-side PDF generation** — no Gotenberg, no Playwright, no wkhtmltopdf

### 7.2 Template Structure (19 Sections)

The template.html contains 19 `<div class="page">` sections, each representing one page of the credit report:

| Page | Section | Key Content |
|:----:|---------|-------------|
| 1 | Cover Page | Logo, company name, report title, confidential notice |
| 2 | Order Summary | Report metadata, analyst info, client reference |
| 3 | Executive Summary | Summary text, key metrics (health score, rating, risk) |
| 4 | Dashboard | Score cards (Viability, Delinquency, Payment, Failure), trends |
| 5 | Company Profile | Identity details, registration info, country-specific fields |
| 6 | Ownership | Shareholders table, ownership structure |
| 7 | Related Concerns | Branches, regional affiliates |
| 8 | Operations | Activities, supply chain (purchasing + sales), physical assets |
| 9 | Banking | Banking relationships, primary bank, facility types |
| 10 | Financial Analysis | 3-year income statement + balance sheet tables, calculated ratios |
| 11 | Financial Ratios | Liquidity, profitability, leverage, efficiency ratios with benchmarks |
| 12 | Risk Assessment | Credit risk scores, viability/delinquency details |
| 13 | Legal Status | Lawsuits, liens, judgments, license/tax status |
| 14 | News & Events | News timeline with sentiment badges |
| 15 | Industry Analysis | Sector overview, market size, growth forecasts |
| 16 | Credit Recommendation | Recommended limits, payment terms, review frequency |
| 17 | Monitoring | Payment delay, credit utilization, next review date |
| 18 | Appendices | Data quality, limitations, methodology notes |
| 19 | Back Cover | Closing page |

### 7.3 Key Methods in PDFGenerator

- `_get(fields, key, default)` — Extract field value from FieldData objects
- `_get_arr(arrays, key)` — Extract array data
- `_boolify(v)` — Convert various truthy/falsy values to boolean (for visibility flags)
- `_iconize(v)` — Map icon names to emoji equivalents
- `_clean_pct(val)` — Remove duplicate `%` signs
- `_hex_to_css_class(color)` — Map hex colors to CSS classes (green/yellow/red)
- `_has_field_data(fields, field_list)` — Check if any field in a list has data
- `get_html_preview(report_dict)` — Main entry: returns fully rendered HTML string

---

## 8. DATA MODEL & FIELD REGISTRY

### 8.1 Pydantic Models (`backend/models/report_schema.py`)

**FieldData:**
```python
class FieldData(BaseModel):
    value: Optional[Any] = None
    confidence: str = "missing"      # "high" | "medium" | "missing" | "calculated"
    source: str = "system"           # "pattern" | "table" | "ai" | "calculated" | "user" | "system"
    locked: bool = False
```

**ReportArrays** — Container for all array-type fields:
- `shareholders: List[Shareholder]` — name, percentage, nationality, type, position
- `branches: List[Branch]` — branch_name, unified_no, cr_no, city, function, status
- `banking_relationships: List[BankingRelationship]` — bank_name, facility_type, usage
- `news_events: List[NewsEvent]` — event_date, title, summary, sentiment
- `recommendations: List[Recommendation]` — area, detail, priority
- `risk_mitigations: List[RiskMitigation]` — title, detail, strategy, outcome
- `monitoring_triggers: List[MonitoringTrigger]` — event, action
- `alerts: List[Alert]` — type, icon, message
- `regional_affiliates: List[RegionalAffiliate]` — affiliate_name
- `legal_details: List[LegalDetail]` — event_type, date, amount, description
- `strengths, weaknesses, opportunities, threats: List[str]` — SWOT items
- `management_team: List[ManagementTeamMember]` — name, title, department, contact
- `phone_numbers: List[PhoneNumber]` — country_code, number, type, contact_person, is_primary
- `board_members: List[Dict]` — flexible key-value
- `extra_reg_fields: List[Dict]` — flexible key-value

**FullReport:**
```python
class FullReport(BaseModel):
    report_id: str
    status: str
    created_at: str
    updated_at: str
    fields: Dict[str, FieldData]      # ~450+ fields
    arrays: ReportArrays
    files: List[FileInfo]
    extraction_stats: ExtractionStats
```

**ExtractionStats:**
```python
class ExtractionStats(BaseModel):
    total_fields: int = 0
    high_confidence: int = 0
    medium_confidence: int = 0
    missing: int = 0
    calculated: int = 0
```

### 8.2 FIELD_REGISTRY (`backend/models/field_meta.py`)

The field registry contains **~450+ field names** organized by source:

| Source Category | Fields Count | Description |
|----------------|:------------:|-------------|
| `Source.PATTERN` | 27 | Registration numbers, dates, contact info |
| `Source.TABLE` | 46 | Financial data (revenue_1, cogs_2, equity_3, etc.) |
| `Source.AI` | ~200 | Company identity, operations, scores (unlocked) |
| `Source.CALCULATED` | 38 | Ratios, scores, ratings, limits (locked=False = editable) |
| `Source.USER` | ~80 | Client info, analyst info, page visibility toggles |
| `Source.SYSTEM` | 10 | Report_id, dates, data sources |

**ARRAY_FIELDS** (20 arrays): shareholders, branches, banking_relationships, news_events, recommendations, risk_mitigations, monitoring_triggers, alerts, regional_affiliates, legal_details, strengths, weaknesses, opportunities, threats, management_team, phone_numbers, board_members, extra_reg_fields, key_competitors, supporting_documents

### 8.3 Easy Way Import Aliases (250+)

The `report.py` file contains an `ALIASES` dict (lines 400-755) mapping variant field names from various JSON sources to canonical field names. For example:
- `"legal_name"` → `"legal_name"`
- `"registration_number"` → `"cr_number"`
- `"legal_entity_type"` → `"company_type"`
- `"suggested_rating"` → `"credit_rating"`
- `"annual_turnover"` → `"annual_turnover"`
- `"tax_registration_number"` → `"tax_registration_number"`
- Plus 200+ more

---

## 9. AUTHENTICATION SYSTEM

### 9.1 Backend (`backend/api/auth.py`)

**Hardcoded Users (5 total):**

| Email | ID | Name | Role |
|-------|:--:|------|:----:|
| waleed@valyze.com | usr_001 | Waleed | admin |
| mohamed@valyze.com | usr_002 | Mohamed | analyst |
| mahmoud@valyze.com | usr_003 | Mahmoud | analyst |
| amani@valyze.com | usr_004 | Amani | analyst |
| sally@valyze.com | usr_005 | Sally | reviewer |

**Password Hashing:** SHA-256 with random salt (no bcrypt — avoids C compilation on Vercel)
- Format: `{salt}:{sha256_hex}`

**JWT:**
- Secret: `JWT_SECRET` env var (default: `"valyze-secret-change-in-production-2026"`)
- Algorithm: HS256
- Expiry: 24 hours
- Payload: `{ sub, email, name, role, exp }`

**Endpoints:**
- `POST /api/auth/login` → Returns `{ token, user }`
- `GET /api/auth/me` → Returns `{ id, email, name, role }` (requires auth)
- `POST /api/auth/verify` → `{ valid: true, user }` (requires auth)

### 9.2 Frontend Auth

- Token stored in `localStorage` key `valyze_auth_token`
- `AuthContext.jsx` manages login/logout state
- Axios interceptor auto-attaches token to all requests
- On 401 response, token cleared and redirected to `/login`
- `ProtectedRoute` wrapper in App.jsx redirects unauthenticated users

---

## 10. API ROUTE REFERENCE

### Complete API Surface

```
METHOD  PATH                                    PURPOSE
──────  ──────────────────────────────────────  ──────────────────────────
POST    /api/auth/login                         Login (email + password)
GET     /api/auth/me                            Current user info
POST    /api/auth/verify                        Verify JWT token

POST    /api/upload/start                       Create new report (returns report_id)
POST    /api/upload/files/{report_id}           Upload files for report
GET     /api/upload/status/{report_id}          Upload status + file list
DELETE  /api/upload/file/{report_id}/{filename} Delete uploaded file
POST    /api/upload/check-duplicate             Check CR number uniqueness

GET     /api/report/                            List all reports
GET     /api/report/{report_id}                 Get full report detail
PATCH   /api/report/{report_id}/field           Update single field
PATCH   /api/report/{report_id}/fields          Bulk update fields
PATCH   /api/report/{report_id}/array           Update array field
POST    /api/report/{report_id}/recalculate     DISABLED (no-op)
GET     /api/report/{report_id}/stats           Extraction stats
POST    /api/report/{report_id}/easy-way        Import complete JSON
PATCH   /api/report/{report_id}/status          Update report status
DELETE  /api/report/{report_id}                 Delete report

GET     /api/pdf/html/{report_id}               Get report as HTML
POST    /api/pdf/generate/{report_id}           Generate HTML for PDF
GET     /api/pdf/preview/{report_id}            Preview HTML
GET     /api/pdf/view/{report_id}               Alias for preview
GET     /api/pdf/status/{report_id}             Check PDF generation status

POST    /api/export/json/{report_id}            Export as JSON download
POST    /api/export/xml/{report_id}             Export as XML download
POST    /api/export/csv/{report_id}             Export as CSV download
POST    /api/export/excel/{report_id}           Export as Excel (base64)
POST    /api/export/word/{report_id}            Export as Word (base64)
GET     /api/export/download/{report_id}/{fmt}  Download generated file
GET     /api/export/status/{report_id}          Export status
GET     /api/export/backup/all                  Export all reports JSON
GET     /api/export/backup/download/all         Download all as JSON

POST    /api/search/                            Search reports (POST)
GET     /api/search/                            Search reports (GET)
GET     /api/search/reports                     Get all with pagination
POST    /api/search/load/{report_id}            Load full report
GET     /api/search/count                       Total report count
GET     /api/search/local                       Get reports with filters
GET     /api/search/local/count                 Local count
DELETE  /api/search/local/{report_id}           Delete local report
GET     /api/search/all                         Combined reports
GET     /api/search/output                      Output files
DELETE  /api/search/output/{report_id}          Delete output files

POST    /api/cloud/save/{report_id}             Save to cloud (verify exists)
GET     /api/cloud/status/{report_id}           Check cloud status
DELETE  /api/cloud/{report_id}                  Delete from cloud

POST    /api/proxy                              Anthropic API proxy

GET     /health                                 Health check
GET     /ready                                  Readiness probe
```

---

## 11. DEPLOYMENT ARCHITECTURE

### 11.1 Local Development

**Start Scripts:**
- `startall.bat` — Starts backend (uvicorn), frontend (vite), and extractor (vite) concurrently
- `startbackend.bat` — Starts only the backend
- `install.bat` — Installs Python dependencies + npm packages for all services

**Docker:**
- `docker-compose.yml` — Defines backend service (not frontend/extractor)
- `backend/Dockerfile` — Multi-stage Python build

**Vercel:**
- `backend/vercel.json` — Serverless deployment config
- `frontend/vercel.json` — Frontend deployment config
- `render.yaml` — Render.com deployment config

### 11.2 Environment Variables

**Backend (`.env`):**
```
SUPABASE_URL=https://xxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=service_role_key
SUPABASE_ANON_KEY=anon_key
JWT_SECRET=your-secret-key
FRONTEND_URL=https://your-frontend.vercel.app
CORS_EXTRA_ORIGINS=https://extra-origin.com
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=100
VERCEL=true                  # If running on Vercel
```

**Frontend (`.env`):**
```
VITE_API_URL=http://localhost:8000        # Backend URL
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon_key
```

**Extractor (`.env`):**
```
VITE_API_URL=http://localhost:8000
VITE_EXTRACTOR_URL=http://localhost:5173
```

---

## 12. KEY DESIGN DECISIONS

### 12.1 "Easy Way Import" as Single Source of Truth

- **No recalculation, ever.** The JSON you import is the final word.
- This is enforced by multiple comments and the `/recalculate` endpoint being a no-op
- Rationale: AI-generated JSON contains pre-calculated values that shouldn't be modified

### 12.2 Client-Side PDF Generation

- HTML templates rendered server-side, but PDF conversion happens client-side via html2pdf.js
- Avoids server dependencies (Gotenberg, Playwright, wkhtmltopdf)
- Works on Vercel serverless (no persistent filesystem needed for generation)

### 12.3 Supabase as Sole Database

- Originally SQLite → migrated entirely to Supabase (PostgreSQL)
- All `db` parameters in functions are `None` (backward compatibility stubs)
- Direct HTTP REST calls to Supabase, no ORM

### 12.4 SHA-256 Instead of bcrypt

- Avoids C-compilation issues on Vercel serverless
- Simple salt:hash format
- Only 5 hardcoded users, not a production auth system

### 12.5 Gzip Support in Proxy

- Vercel serverless has ~4.5 MB body limit
- Large document payloads must be gzip-compressed
- Backend decompresses before forwarding to Anthropic

### 12.6 Page Visibility Toggles

- `show_egypt_fields`, `show_saudi_fields`, `show_uae_fields` — Auto-detected from country
- `show_board_of_directors` — Auto-detected from board_members array data
- `show_related_concerns` — Auto-detected from branches/regional_affiliates data
- `exclude_page_1` through `exclude_page_19` — Manual PDF page exclusion toggles

---

## 13. KNOWN CODEBASE ISSUES

1. **Duplicate `_hex_to_css_class` method** — Defined twice in `pdf_generator.py` (lines 216 and 296), identical implementation
2. **Three extract implementations** — `extract.py`, `extract_backup.py`, `extract_clean.py` — only `extract.py` is active, the others are dead code
3. **Stubbed database** — `database/db.py` is completely no-op but still imported in places
4. **Vercel body limit** — 4.5 MB limit requires gzip for large document extractions
5. **Hardcoded users** — Authentication is not production-ready (no registration, no password reset)
6. **Missing Supabase migrations** — `supabase/migrations/` directory exists but contains no migration files; only the raw `supabase_setup.sql`
7. **Engines directory mostly unused** — All the extraction engines (pattern_engine, table_engine, rag_engine, etc.) are legacy code from the previous architecture; the new flow uses "Easy Way Import" from AI-generated JSON
8. **PDF template is massive** — 2878 lines of inline HTML+CSS, hard to maintain
9. **No WebSocket/SSE** — Polling used for status updates
10. **CORS origins duplication** — Multiple localhost ports listed; could be consolidated to a wildcard pattern for development

---

## 14. FILE SHORTCUT REFERENCE

| Area | Key File | Lines | Purpose |
|------|----------|:-----:|---------|
| Backend | `backend/main.py` | 183 | App factory, routers, CORS, health |
| Backend | `backend/api/auth.py` | 172 | JWT auth with hardcoded users |
| Backend | `backend/api/report.py` | 1196 | Report CRUD + easy-way import |
| Backend | `backend/api/upload.py` | 318 | Report creation + file upload |
| Backend | `backend/api/pdf.py` | 139 | HTML for client-side PDF |
| Backend | `backend/api/export.py` | 276 | Multi-format export |
| Backend | `backend/api/search.py` | 402 | Search + list + paginate |
| Backend | `backend/api/proxy.py` | 172 | Anthropic API proxy |
| Backend | `backend/crud.py` | 269 | Async CRUD wrappers |
| Backend | `backend/services/supabase_client.py` | 419 | Direct Supabase HTTP calls |
| Backend | `backend/models/report_schema.py` | 254 | Pydantic data models |
| Backend | `backend/models/field_meta.py` | 495 | 450+ field registry |
| Backend | `backend/pdf_generator.py` | 1571 | HTML template rendering |
| Backend | `backend/utils/visibility.py` | 171 | Field emptiness detection |
| Backend | `backend/templates/template.html` | 2878 | PDF HTML template |
| Frontend | `frontend/src/App.jsx` | ~200 | Routes + auth guard |
| Frontend | `frontend/src/context/AuthContext.jsx` | ~100 | Auth state management |
| Frontend | `frontend/src/context/ReportContext.jsx` | ~200 | Report state management |
| Frontend | `frontend/src/api/client.js` | ~80 | Axios API client |
| Frontend | `frontend/src/pages/EditorPage.jsx` | ~300 | Main report editor |
| Frontend | `frontend/src/components/EasyWayImport.jsx` | ~200 | JSON import modal |
| Extractor | `valyze-extractor/src/App.jsx` | ~946 | AI extraction SPA |
| Infra | `supabase_setup.sql` | 52 | Database schema |
| Infra | `docker-compose.yml` | ~30 | Container setup |