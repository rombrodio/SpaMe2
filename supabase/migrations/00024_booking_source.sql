-- 00024_booking_source.sql
-- Phase 6 — Booking provenance
--
-- Adds a booking_source enum + bookings.source column so every row
-- records how the booking arrived:
--   * customer_web       — from /book (anon, phone-only)
--   * admin_manual       — a super_admin created it via /admin/bookings/new
--   * receptionist_manual — a receptionist created it via /reception/bookings/new
--   * chatbot            — reserved for Phase 8 AI conversational flow
--
-- bookings.created_by (profiles.id, nullable) stays as-is and
-- identifies *which* staff member created the booking. source +
-- created_by together answer "who booked this and how".

CREATE TYPE public.booking_source AS ENUM (
  'customer_web',
  'admin_manual',
  'receptionist_manual',
  'chatbot'
);

-- Default is 'admin_manual' because every pre-existing row that
-- carries a created_by came from the admin portal. Rows with NULL
-- created_by came from /book (the only non-authenticated creation
-- path that shipped before this migration).
ALTER TABLE public.bookings
  ADD COLUMN source public.booking_source NOT NULL DEFAULT 'admin_manual';

UPDATE public.bookings
SET source = 'customer_web'
WHERE created_by IS NULL;

CREATE INDEX idx_bookings_source ON public.bookings(source);
