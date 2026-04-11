-- ==========================================================
-- Regenerate synthetic seed UUIDs as real v4 UUIDs
--
-- The original supabase/seed.sql hardcoded 11 synthetic primary
-- keys (e.g. a1111111-1111-1111-1111-111111111111) that do not
-- satisfy the RFC 4122 variant-bit check. Those IDs live in prod
-- as real data that admins reference via bookings, therapist
-- service assignments, etc. Their presence forced the Zod
-- schemas to fall back to a lenient hex-format regex instead of
-- z.string().uuid().
--
-- This migration rewrites those 11 primary keys to real v4 UUIDs
-- without breaking any FK. After it runs in prod, the Zod
-- schemas can be tightened in a follow-up.
--
-- Safety:
--   * Runs in a single transaction.
--   * Naturally no-ops if the synthetic IDs no longer exist
--     (all JOINs against uuid_map yield zero rows).
--   * Take a PITR/backup snapshot before applying to prod.
--   * Dry-run against a branch DB / local copy first.
-- ==========================================================

BEGIN;

-- ─── 1. Build the old → new ID mapping ───
CREATE TEMP TABLE uuid_map (
  entity  text NOT NULL,
  old_id  uuid NOT NULL,
  new_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (entity, old_id)
) ON COMMIT DROP;

INSERT INTO uuid_map (entity, old_id) VALUES
  ('therapist', 'a1111111-1111-1111-1111-111111111111'::uuid),
  ('therapist', 'a2222222-2222-2222-2222-222222222222'::uuid),
  ('therapist', 'a3333333-3333-3333-3333-333333333333'::uuid),
  ('room',      'b1111111-1111-1111-1111-111111111111'::uuid),
  ('room',      'b2222222-2222-2222-2222-222222222222'::uuid),
  ('room',      'b3333333-3333-3333-3333-333333333333'::uuid),
  ('service',   'c1111111-1111-1111-1111-111111111111'::uuid),
  ('service',   'c2222222-2222-2222-2222-222222222222'::uuid),
  ('service',   'c3333333-3333-3333-3333-333333333333'::uuid),
  ('service',   'c4444444-4444-4444-4444-444444444444'::uuid),
  ('service',   'c5555555-5555-5555-5555-555555555555'::uuid);

-- Prune mapping entries for IDs that don't exist (makes this
-- migration safe to apply on an already-migrated DB).
DELETE FROM uuid_map m
WHERE (m.entity = 'therapist' AND NOT EXISTS (SELECT 1 FROM therapists WHERE id = m.old_id))
   OR (m.entity = 'room'      AND NOT EXISTS (SELECT 1 FROM rooms      WHERE id = m.old_id))
   OR (m.entity = 'service'   AND NOT EXISTS (SELECT 1 FROM services   WHERE id = m.old_id));

-- ─── 2. Duplicate parent rows with new IDs ───
INSERT INTO therapists (id, full_name, phone, email, color, is_active, created_at, updated_at)
SELECT m.new_id, t.full_name, t.phone, t.email, t.color, t.is_active, t.created_at, t.updated_at
FROM therapists t
JOIN uuid_map m ON m.entity = 'therapist' AND m.old_id = t.id;

INSERT INTO rooms (id, name, description, is_active, created_at, updated_at)
SELECT m.new_id, r.name, r.description, r.is_active, r.created_at, r.updated_at
FROM rooms r
JOIN uuid_map m ON m.entity = 'room' AND m.old_id = r.id;

INSERT INTO services (id, name, description, duration_minutes, buffer_minutes, price_ils, is_active, created_at, updated_at)
SELECT m.new_id, s.name, s.description, s.duration_minutes, s.buffer_minutes, s.price_ils, s.is_active, s.created_at, s.updated_at
FROM services s
JOIN uuid_map m ON m.entity = 'service' AND m.old_id = s.id;

-- ─── 3. Create bridge junction rows ───
-- The composite FKs in bookings check (therapist_id, service_id)
-- and (room_id, service_id) against junction tables. When we
-- update bookings one column at a time, the (new_therapist,
-- old_service) and (old_therapist, new_service) combinations
-- must exist. Pre-populate all required bridges.

-- therapist_services bridges
INSERT INTO therapist_services (therapist_id, service_id)
SELECT DISTINCT tm.new_id, ts.service_id
FROM therapist_services ts
JOIN uuid_map tm ON tm.entity = 'therapist' AND tm.old_id = ts.therapist_id
ON CONFLICT DO NOTHING;

INSERT INTO therapist_services (therapist_id, service_id)
SELECT DISTINCT ts.therapist_id, sm.new_id
FROM therapist_services ts
JOIN uuid_map sm ON sm.entity = 'service' AND sm.old_id = ts.service_id
ON CONFLICT DO NOTHING;

INSERT INTO therapist_services (therapist_id, service_id)
SELECT DISTINCT tm.new_id, sm.new_id
FROM therapist_services ts
JOIN uuid_map tm ON tm.entity = 'therapist' AND tm.old_id = ts.therapist_id
JOIN uuid_map sm ON sm.entity = 'service'   AND sm.old_id = ts.service_id
ON CONFLICT DO NOTHING;

-- room_services bridges
INSERT INTO room_services (room_id, service_id)
SELECT DISTINCT rm.new_id, rs.service_id
FROM room_services rs
JOIN uuid_map rm ON rm.entity = 'room' AND rm.old_id = rs.room_id
ON CONFLICT DO NOTHING;

INSERT INTO room_services (room_id, service_id)
SELECT DISTINCT rs.room_id, sm.new_id
FROM room_services rs
JOIN uuid_map sm ON sm.entity = 'service' AND sm.old_id = rs.service_id
ON CONFLICT DO NOTHING;

INSERT INTO room_services (room_id, service_id)
SELECT DISTINCT rm.new_id, sm.new_id
FROM room_services rs
JOIN uuid_map rm ON rm.entity = 'room'    AND rm.old_id = rs.room_id
JOIN uuid_map sm ON sm.entity = 'service' AND sm.old_id = rs.service_id
ON CONFLICT DO NOTHING;

-- ─── 4. Repoint leaf (single-FK) children ───
UPDATE therapist_availability_rules r
SET therapist_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'therapist' AND m.old_id = r.therapist_id;

UPDATE therapist_time_off o
SET therapist_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'therapist' AND m.old_id = o.therapist_id;

UPDATE room_blocks rb
SET room_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'room' AND m.old_id = rb.room_id;

UPDATE profiles p
SET therapist_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'therapist' AND m.old_id = p.therapist_id;

-- ─── 5. Repoint bookings column-by-column ───
-- Each UPDATE satisfies the composite FK because bridge junction
-- rows from step 3 cover every (new, old) and (new, new) pair.

UPDATE bookings b
SET therapist_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'therapist' AND m.old_id = b.therapist_id;

UPDATE bookings b
SET service_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'service' AND m.old_id = b.service_id;

UPDATE bookings b
SET room_id = m.new_id
FROM uuid_map m
WHERE m.entity = 'room' AND m.old_id = b.room_id;

-- ─── 6. Delete old junction rows then old parent rows ───
DELETE FROM therapist_services
WHERE therapist_id IN (SELECT old_id FROM uuid_map WHERE entity = 'therapist')
   OR service_id   IN (SELECT old_id FROM uuid_map WHERE entity = 'service');

DELETE FROM room_services
WHERE room_id    IN (SELECT old_id FROM uuid_map WHERE entity = 'room')
   OR service_id IN (SELECT old_id FROM uuid_map WHERE entity = 'service');

DELETE FROM therapists
WHERE id IN (SELECT old_id FROM uuid_map WHERE entity = 'therapist');

DELETE FROM rooms
WHERE id IN (SELECT old_id FROM uuid_map WHERE entity = 'room');

DELETE FROM services
WHERE id IN (SELECT old_id FROM uuid_map WHERE entity = 'service');

COMMIT;
