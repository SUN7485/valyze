-- Phase 3.3: per-company "Your Reference" captured in the portal.
alter table order_companies add column if not exists client_ref text;
