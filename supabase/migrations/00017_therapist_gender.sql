-- ==========================================================
-- Phase 4 (cont.) — therapist gender + booking preference
--
-- Customers may request a male / female / any therapist at
-- booking time. The spa anonymizes therapist identity on every
-- customer-facing surface (/book, /order, confirmation SMS).
-- Therapist assignment happens server-side at booking submit,
-- picking randomly among eligible therapists that match the
-- requested gender.
--
-- Design notes:
--   * therapist_gender (male / female) — the therapist's own
--     gender. Required on new therapists via the admin form
--     (UI-enforced). Column is nullable here so the migration
--     doesn't fail on pre-existing rows; the admin page shows
--     a "gender not set" warning for those rows until set.
--   * gender_preference (male / female / any) — snapshotted on
--     the booking so later changes to a therapist's gender
--     don't rewrite historic intent.
-- ==========================================================

-- ============================================
-- 1. New enums
-- ============================================

CREATE TYPE therapist_gender AS ENUM ('male', 'female');

CREATE TYPE gender_preference AS ENUM ('male', 'female', 'any');

-- ============================================
-- 2. Therapists gain an (initially-nullable) gender column.
--    Admin UI will enforce it on create + prompt for update
--    on any legacy row where it's still null.
-- ============================================

ALTER TABLE therapists
  ADD COLUMN gender therapist_gender;

-- Supports slot filtering: when a customer requests a specific
-- gender, the scheduling query narrows candidate therapists.
CREATE INDEX idx_therapists_gender
  ON therapists (gender)
  WHERE gender IS NOT NULL;

-- ============================================
-- 3. Bookings carry the customer's preference for audit
-- ============================================

ALTER TABLE bookings
  ADD COLUMN therapist_gender_preference gender_preference NOT NULL
    DEFAULT 'any';
