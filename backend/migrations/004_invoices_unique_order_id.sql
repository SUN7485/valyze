-- Migration: Add unique constraint on invoices.order_id
-- Purpose: Prevent duplicate invoices for the same order (FIX 4)
-- Run this in Supabase SQL Editor before deploying the backend changes

-- First, check for and remove any duplicate invoices (keep the oldest one per order_id)
DELETE FROM invoices
WHERE id NOT IN (
    SELECT MIN(id)
    FROM invoices
    GROUP BY order_id
);

-- Now add the unique constraint
ALTER TABLE invoices
ADD CONSTRAINT invoices_order_id_unique UNIQUE (order_id);