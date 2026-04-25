-- 00021_service_durations_45min.sql
-- Operator decision (Phase 4.6 QA): every treatment is 45 minutes,
-- booked into a 60-minute slot so the last 15 minutes are used for
-- room turnover and therapist rest. This keeps the customer-facing
-- duration display honest ("45 min") while the scheduler still
-- occupies the full hour via `buffer_minutes`.
--
-- Applies to existing rows only (idempotent: safe to re-run). Seed
-- file is updated in the same commit so fresh `supabase db reset`
-- runs already reflect this.

UPDATE services
SET
  duration_minutes = 45,
  buffer_minutes   = 15
WHERE duration_minutes <> 45 OR buffer_minutes <> 15;
