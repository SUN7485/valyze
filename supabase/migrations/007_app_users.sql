-- Migration: 007_app_users
-- Purpose: Persist user accounts in the database instead of an in-memory dict
--          (the old store was ephemeral on serverless — created/edited users
--          vanished on cold start). auth.py seeds the bootstrap accounts on
--          first run and is the source of truth thereafter.

create table if not exists app_users (
    id            text primary key,
    email         text unique not null,
    name          text not null,
    role          text not null default 'analyst',
    password_hash text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- RLS enabled with no policies → only the service-role key (the backend) can
-- read/write this table. It holds password hashes, so keep it locked down.
alter table app_users enable row level security;

comment on table app_users is 'Persisted application user accounts (admins/analysts). Managed by backend/api/auth.py via the service-role key.';
