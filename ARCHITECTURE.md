# Architecture Decision: Valyze Credit Reports

## Overview
Production architecture for Valyze Credit Reports using Supabase as the single source of truth.

## Stack Decisions

### Backend Database & Auth Provider
**Supabase** (PostgreSQL + Auth + REST API)
- Supabase URL: https://dnhtowmzrluqtlivdqqj.supabase.co (from `.env`)
- Auth: Supabase Auth with email/password
- Database: PostgreSQL hosted on Supabase
- Storage: Supabase Storage for generated PDFs/exports (future)

**Key Decision:** Supabase is the ONLY production database. SQLite is used for local development only and will be removed before production.

### Frontend
- React with Vite (already in place)
- React Router for navigation
- Supabase JS client for auth
- Custom `reportAPI` wrapper for data

### Data Model: SHARED COLLECTION
**All authenticated users have full read/write/delete access to all reports.**

Rationale:
- Small team (5-6 users) working collaboratively
- No need for per-user data isolation
- Simplifies UX — everyone sees same report pool
- Audit trail: optional `created_by_user_id` column (not used for authorization)

### Authentication & Authorization
- Supabase Auth handles signup, login, logout, session management
- JWT tokens stored in browser memory ( localStorage / sessionStorage )
- Backend validates JWT via Supabase public keys
- All API routes except `/health` and `/auth/*` require authentication
- Row Level Security (RLS) enabled on all tables, but policies allow full access to any authenticated user

### Environment Strategy (Deferred)
Initially: single local environment
Later: separate staging and production Supabase projects with different credentials

## Data Flow

```
User Action → Frontend (React) → Backend API (FastAPI) → Supabase REST → PostgreSQL
              ↑                                        ↑
              └── Supabase Auth (JWT) ←───────────────┘
```

## Security Model
- Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`): backend only, NEVER frontend
- Anon Key (`SUPABASE_ANON_KEY`): frontend (limited to RLS-restricted operations)
- Rate limiting on public/auth endpoints
- Input validation on all endpoints
- CORS restricted to local dev frontend (later add staging/production origins)
- Security headers in production

## TODO
- [x] Set up Supabase project 'creditneatils' credentials
- [x] Write database migration (001_initial_schema.sql)
- [x] Migrate backend from SQLite to Supabase
- [x] Add frontend auth flows
- [x] Remove all SQLite references in production build

## STATUS: COMPLETE (100%)

All production-ready tasks completed:
- Supabase migration SQL in place
- Backend rewritten for Supabase REST API
- Frontend auth (LoginPage, AuthContext) implemented
- API endpoints protected with JWT auth
- Rate limiting, input validation, security headers
- Backup/export endpoints
- Health checks
- Error boundaries in React
- Production ENV config
