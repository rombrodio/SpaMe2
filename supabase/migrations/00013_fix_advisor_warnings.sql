-- ==========================================================
-- Fix Supabase advisor warnings (security + performance)
--
-- 1. Security: move btree_gist from public to extensions schema
-- 2. Security: SET search_path = '' on all SECURITY DEFINER /
--    plpgsql functions to prevent schema-resolution attacks
-- 3. Performance: consolidate multiple-permissive RLS policies
--    into one policy per table (fewer policies to evaluate)
-- 4. Performance: wrap auth.uid() and helper-function calls in
--    (select ...) subqueries so Postgres initplan caches the
--    result once per query instead of once per row
--
-- This migration is idempotent: functions use CREATE OR
-- REPLACE, policies use DROP POLICY IF EXISTS.
-- ==========================================================

-- ============================================
-- 1. Move btree_gist to the extensions schema
--    Must drop dependent exclusion constraints
--    first, then recreate them.
-- ============================================

CREATE SCHEMA IF NOT EXISTS extensions;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_therapist_overlap;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS no_room_overlap;

DROP EXTENSION IF EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS btree_gist SCHEMA extensions;

ALTER TABLE bookings ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled'));

ALTER TABLE bookings ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled'));

-- ============================================
-- 2. Harden all functions with SET search_path
--    and schema-qualified type references.
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'therapist'::public.user_role);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = (select auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_user_therapist_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT therapist_id FROM public.profiles WHERE id = (select auth.uid());
$$;

-- ============================================
-- 3. Consolidate RLS policies.
--    Each table gets ONE policy per role-set
--    and all role/uid calls are wrapped in
--    (select ...) for initplan optimization.
-- ============================================

-- PROFILES
DROP POLICY IF EXISTS "Super admins can do everything on profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;

CREATE POLICY "profiles_access" ON profiles FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR id = (select auth.uid())
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "Super admins can do everything on customers" ON customers;

CREATE POLICY "customers_access" ON customers FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- THERAPISTS
DROP POLICY IF EXISTS "Super admins can do everything on therapists" ON therapists;
DROP POLICY IF EXISTS "Therapists can read own record" ON therapists;

CREATE POLICY "therapists_access" ON therapists FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- ROOMS
DROP POLICY IF EXISTS "Super admins can do everything on rooms" ON rooms;
DROP POLICY IF EXISTS "Therapists can read rooms" ON rooms;

CREATE POLICY "rooms_access" ON rooms FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- SERVICES
DROP POLICY IF EXISTS "Super admins can do everything on services" ON services;
DROP POLICY IF EXISTS "Therapists can read services" ON services;

CREATE POLICY "services_access" ON services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- THERAPIST_SERVICES
DROP POLICY IF EXISTS "Super admins can do everything on therapist_services" ON therapist_services;
DROP POLICY IF EXISTS "Therapists can read own service assignments" ON therapist_services;

CREATE POLICY "therapist_services_access" ON therapist_services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- ROOM_SERVICES
DROP POLICY IF EXISTS "Super admins can do everything on room_services" ON room_services;
DROP POLICY IF EXISTS "Therapists can read room_services" ON room_services;

CREATE POLICY "room_services_access" ON room_services FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (select public.get_user_role()) = 'therapist'::public.user_role
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- THERAPIST_AVAILABILITY_RULES
DROP POLICY IF EXISTS "Super admins can do everything on availability rules" ON therapist_availability_rules;
DROP POLICY IF EXISTS "Therapists can manage own availability" ON therapist_availability_rules;

CREATE POLICY "availability_rules_access" ON therapist_availability_rules FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
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

-- THERAPIST_TIME_OFF
DROP POLICY IF EXISTS "Super admins can do everything on time_off" ON therapist_time_off;
DROP POLICY IF EXISTS "Therapists can manage own time off" ON therapist_time_off;

CREATE POLICY "time_off_access" ON therapist_time_off FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
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

-- ROOM_BLOCKS
DROP POLICY IF EXISTS "Super admins can do everything on room_blocks" ON room_blocks;

CREATE POLICY "room_blocks_access" ON room_blocks FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- BOOKINGS
DROP POLICY IF EXISTS "Super admins can do everything on bookings" ON bookings;
DROP POLICY IF EXISTS "Therapists can read own bookings" ON bookings;

CREATE POLICY "bookings_access" ON bookings FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR (
      (select public.get_user_role()) = 'therapist'::public.user_role
      AND therapist_id = (select public.get_user_therapist_id())
    )
  )
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- PAYMENTS
-- UPDATE on payments is only via service_role (webhook handler);
-- the consolidated policy still only allows super_admin for USING / WITH CHECK,
-- which leaves UPDATE paths to bypass via service_role. Phase 4 may revisit this.
DROP POLICY IF EXISTS "Super admins can read payments" ON payments;
DROP POLICY IF EXISTS "Super admins can insert payments" ON payments;

CREATE POLICY "payments_access" ON payments FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- CONVERSATION_THREADS
DROP POLICY IF EXISTS "Super admins can do everything on threads" ON conversation_threads;

CREATE POLICY "threads_access" ON conversation_threads FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- CONVERSATION_MESSAGES
DROP POLICY IF EXISTS "Super admins can do everything on messages" ON conversation_messages;

CREATE POLICY "messages_access" ON conversation_messages FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);

-- AUDIT_LOGS
-- INSERT on audit_logs happens via service_role or directly from server actions;
-- consolidated policy only governs SELECT for super_admins.
DROP POLICY IF EXISTS "Super admins can read audit logs" ON audit_logs;

CREATE POLICY "audit_logs_select" ON audit_logs FOR SELECT
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role);
