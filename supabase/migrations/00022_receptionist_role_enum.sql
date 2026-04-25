-- 00022_receptionist_role_enum.sql
-- Phase 6 — Receptionist role + portal
--
-- Adds 'receptionist' to the user_role enum. Kept as a standalone
-- migration because Postgres rejects enum values from being USED in
-- the same transaction where they were ADDED (even in PG 15+).
-- The table + RLS work that references 'receptionist'::user_role
-- lives in 00023_receptionist_tables.sql.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'receptionist';
