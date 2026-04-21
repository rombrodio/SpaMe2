-- ==========================================================
-- Phase 4 (cont.) — partial unique index covering the
-- 'authorized' payment_status value added in 00015.
--
-- This is a standalone migration because Postgres disallows
-- referencing a just-ADD-ed enum value in the same transaction
-- that added it (unless the type itself was created in that
-- transaction — payment_status was created back in 00002).
--
-- Purpose: prevent two concurrent "in-flight" payment rows for
-- the same booking+role. Covers both:
--   * pending    — hosted-page flow started, not yet resolved
--   * authorized — card token stored (CreateTokenOnly); row
--                  stays in this state until captured (cash or
--                  penalty_capture) or voided.
-- ==========================================================

CREATE UNIQUE INDEX IF NOT EXISTS one_active_payment_per_booking_role
  ON payments (booking_id, role)
  WHERE status IN ('pending', 'authorized');
