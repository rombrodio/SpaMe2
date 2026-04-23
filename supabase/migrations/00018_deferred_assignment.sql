-- ==========================================================
-- Phase 5 — Deferred therapist assignment
--
-- Historically the /book flow picked a therapist at random at
-- purchase time. This migration decouples that: customers
-- reserve an anonymous slot (room + capacity stays eager) and
-- the spa manager assigns a therapist afterwards via a new
-- admin screen. The therapist must then confirm within 2h.
--
-- Changes:
--   * bookings.therapist_id becomes NULLABLE so a booking can
--     live in "paid but unassigned" state. The no_therapist_overlap
--     exclusion constraint from 00007 ignores NULL by default,
--     so it keeps protecting once a therapist is pinned.
--   * New enum assignment_status and matching columns on
--     bookings to track the assignment lifecycle:
--       unassigned -> pending_confirmation -> confirmed
--                                          \
--                                           -> declined -> unassigned
--   * Backfill: every existing booking with a therapist is
--     treated as already-confirmed.
-- ==========================================================

-- ============================================
-- 1. Relax NOT NULL on therapist_id
--
-- The composite FK fk_therapist_service (therapist_id, service_id)
-- from 00007_bookings.sql uses the default MATCH SIMPLE semantics,
-- which skip FK validation when any column of the composite key
-- is NULL. No change to the FK definition is required.
-- ============================================

ALTER TABLE bookings
  ALTER COLUMN therapist_id DROP NOT NULL;

-- ============================================
-- 2. assignment_status enum
-- ============================================

CREATE TYPE assignment_status AS ENUM (
  'unassigned',
  'pending_confirmation',
  'confirmed',
  'declined'
);

-- ============================================
-- 3. New columns on bookings
--
-- assignment_status defaults to 'confirmed' so:
--   * the backfill below is a no-op for rows already written
--     with a therapist_id (which is all of them — the column
--     was NOT NULL until this migration),
--   * INSERTs that don't explicitly set assignment_status keep
--     the pre-change behaviour (admin-created bookings).
-- Callers that want a deferred booking (e.g. /book flow) must
-- pass assignment_status = 'unassigned' explicitly.
-- ============================================

ALTER TABLE bookings
  ADD COLUMN assignment_status          assignment_status NOT NULL DEFAULT 'confirmed',
  ADD COLUMN assigned_by                UUID REFERENCES profiles(id),
  ADD COLUMN assigned_at                TIMESTAMPTZ,
  ADD COLUMN confirmation_requested_at  TIMESTAMPTZ,
  ADD COLUMN confirmed_at               TIMESTAMPTZ,
  ADD COLUMN declined_at                TIMESTAMPTZ,
  ADD COLUMN decline_reason             TEXT,
  ADD COLUMN manager_alerted_at         TIMESTAMPTZ;

-- ============================================
-- 4. Backfill — existing rows have a therapist pinned, so
--    they are effectively already-confirmed. The DEFAULT above
--    already sets the value; this UPDATE is belt-and-braces in
--    case any pre-existing row slips through with NULL therapist.
-- ============================================

UPDATE bookings
SET assignment_status = 'confirmed'
WHERE therapist_id IS NOT NULL
  AND assignment_status IS DISTINCT FROM 'confirmed';

-- ============================================
-- 5. Partial index for the manager's "unassigned queue"
--
-- The assignment screen fetches unassigned bookings ordered by
-- start_at. A partial index on just those rows keeps the scan
-- narrow even as the bookings table grows.
-- ============================================

CREATE INDEX idx_bookings_unassigned
  ON bookings (start_at)
  WHERE assignment_status = 'unassigned';

-- Also useful for the cron: find pending_confirmation bookings
-- whose SLA has lapsed.
CREATE INDEX idx_bookings_pending_confirmation
  ON bookings (confirmation_requested_at)
  WHERE assignment_status = 'pending_confirmation';
