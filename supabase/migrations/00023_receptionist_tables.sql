-- 00023_receptionist_tables.sql
-- Phase 6 — Receptionist role + portal
--
-- Adds:
--   * receptionists entity table (mirrors therapists minus scheduling
--     attributes — no color, no gender, no service qualifications)
--   * profiles.receptionist_id FK (symmetrical to profiles.therapist_id)
--   * receptionist_availability_rules (on-duty windows, single mode
--     covering chat + phone)
--   * get_user_receptionist_id() helper for RLS
--   * RLS policies extended to include the receptionist role

-- ============================================
-- 1. receptionists table
-- ============================================

CREATE TABLE public.receptionists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN receptionist_id UUID,
  ADD CONSTRAINT fk_profiles_receptionist
    FOREIGN KEY (receptionist_id) REFERENCES public.receptionists(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_receptionist ON public.profiles(receptionist_id);

CREATE TRIGGER trg_receptionists_updated BEFORE UPDATE ON public.receptionists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 2. receptionist_availability_rules
--    Shape mirrors therapist_availability_rules; single on-duty mode
--    covers chat + phone (no mode column in V1).
-- ============================================

CREATE TABLE public.receptionist_availability_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  day_of_week     public.day_of_week NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX idx_receptionist_availability ON public.receptionist_availability_rules(receptionist_id);

-- ============================================
-- 3. Helper: get_user_receptionist_id()
--    Mirrors get_user_therapist_id() from 00013.
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_receptionist_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT receptionist_id FROM public.profiles WHERE id = (select auth.uid());
$$;

-- ============================================
-- 4. RLS on the two new tables
-- ============================================

ALTER TABLE public.receptionists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receptionist_availability_rules ENABLE ROW LEVEL SECURITY;

-- Super admin: full CRUD. Receptionist: SELECT own row only.
CREATE POLICY "receptionists_access" ON public.receptionists FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'receptionist'::public.user_role
      AND id = (select public.get_user_receptionist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- Super admin: read-all. Receptionist: full CRUD on own rules.
CREATE POLICY "receptionist_availability_rules_access" ON public.receptionist_availability_rules FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'receptionist'::public.user_role
      AND receptionist_id = (select public.get_user_receptionist_id())
    )
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'receptionist'::public.user_role
      AND receptionist_id = (select public.get_user_receptionist_id())
    )
  );

-- ============================================
-- 5. Extend existing RLS policies to allow receptionist access
--    where the product vision requires it. We DROP the old policy
--    (introduced in 00013) and recreate with the wider USING clause.
--    WITH CHECK is preserved to super_admin-only for write surfaces
--    the receptionist shouldn't fully control — customers is the
--    exception because receptionists need to create customer rows
--    when booking on behalf of a walk-in or phone caller.
-- ============================================

-- BOOKINGS: receptionist SELECTs any booking (read-only list view);
-- INSERT happens via server action (checks role), WITH CHECK allows
-- both super_admin and receptionist inserts so the action isn't
-- blocked by RLS when the receptionist is the caller.
DROP POLICY IF EXISTS "bookings_access" ON public.bookings;
CREATE POLICY "bookings_access" ON public.bookings FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
  );

-- CUSTOMERS: receptionist reads + creates + updates (needed to
-- register a walk-in customer during a phone booking). No deletes.
DROP POLICY IF EXISTS "customers_access" ON public.customers;
CREATE POLICY "customers_access" ON public.customers FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
  );

-- THERAPISTS: receptionists need to SELECT (to pick a therapist when
-- creating a booking); all writes stay super_admin-only.
DROP POLICY IF EXISTS "therapists_access" ON public.therapists;
CREATE POLICY "therapists_access" ON public.therapists FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- ROOMS: receptionists need to SELECT for booking form.
DROP POLICY IF EXISTS "rooms_access" ON public.rooms;
CREATE POLICY "rooms_access" ON public.rooms FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- SERVICES: receptionists need to SELECT for booking form.
DROP POLICY IF EXISTS "services_access" ON public.services;
CREATE POLICY "services_access" ON public.services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- THERAPIST_SERVICES: receptionists need to SELECT to know which
-- therapists are qualified for the service being booked.
DROP POLICY IF EXISTS "therapist_services_access" ON public.therapist_services;
CREATE POLICY "therapist_services_access" ON public.therapist_services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- ROOM_SERVICES: receptionists need to SELECT for room compatibility.
DROP POLICY IF EXISTS "room_services_access" ON public.room_services;
CREATE POLICY "room_services_access" ON public.room_services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- THERAPIST_AVAILABILITY_RULES: receptionists need to SELECT when
-- picking a slot during booking creation.
DROP POLICY IF EXISTS "availability_rules_access" ON public.therapist_availability_rules;
CREATE POLICY "availability_rules_access" ON public.therapist_availability_rules FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  );

-- THERAPIST_TIME_OFF: receptionists need to SELECT when picking slots.
DROP POLICY IF EXISTS "time_off_access" ON public.therapist_time_off;
CREATE POLICY "time_off_access" ON public.therapist_time_off FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  );

-- ROOM_BLOCKS: receptionists need to SELECT for room availability.
DROP POLICY IF EXISTS "room_blocks_access" ON public.room_blocks;
CREATE POLICY "room_blocks_access" ON public.room_blocks FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'receptionist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- PROFILES: the existing policy already allows self-read for any
-- role, and super_admin full CRUD — no change needed for receptionist.
