-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- Required for exclusion constraints on uuid + tsrange
-- Custom enum types for the application

CREATE TYPE booking_status AS ENUM (
  'pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'success', 'failed', 'refunded'
);

CREATE TYPE day_of_week AS ENUM (
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
);

CREATE TYPE conversation_channel AS ENUM ('whatsapp', 'web');

CREATE TYPE message_role AS ENUM ('customer', 'assistant', 'system', 'staff');

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'status_change', 'login', 'payment_webhook'
);

CREATE TYPE user_role AS ENUM ('super_admin', 'therapist');
-- Profiles table linking Supabase Auth users to app roles.
-- therapist_id is set when role='therapist' to link the auth user to their therapist record.

CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          user_role NOT NULL DEFAULT 'therapist',
  therapist_id  UUID,  -- FK added after therapists table exists (migration 00004)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, 'therapist');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- Core entity tables

CREATE TABLE customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL UNIQUE,  -- E.164 format, also used as WhatsApp ID
  email        TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE therapists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  color        TEXT,       -- Calendar display color (hex)
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now add the FK from profiles to therapists
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_therapist
  FOREIGN KEY (therapist_id) REFERENCES therapists(id) ON DELETE SET NULL;

CREATE TABLE rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT,
  duration_minutes  INT NOT NULL CHECK (duration_minutes > 0),
  buffer_minutes    INT NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
  price_ils         INT NOT NULL CHECK (price_ils >= 0),  -- stored in agorot (cents)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Junction tables: which therapists can perform which services,
-- and which rooms are suitable for which services.

CREATE TABLE therapist_services (
  therapist_id UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (therapist_id, service_id)
);

CREATE TABLE room_services (
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, service_id)
);
-- Scheduling: availability rules, time-off, room blocks

-- Recurring weekly availability for each therapist
CREATE TABLE therapist_availability_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id  UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  day_of_week   day_of_week NOT NULL,
  start_time    TIME NOT NULL,        -- e.g. '09:00'
  end_time      TIME NOT NULL,        -- e.g. '17:00'
  valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until   DATE,                 -- NULL = indefinite
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX idx_availability_therapist ON therapist_availability_rules(therapist_id);

-- Specific date ranges a therapist is unavailable
CREATE TABLE therapist_time_off (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id  UUID NOT NULL REFERENCES therapists(id) ON DELETE CASCADE,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);
CREATE INDEX idx_timeoff_therapist ON therapist_time_off(therapist_id);

-- Room maintenance / closures
CREATE TABLE room_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);
CREATE INDEX idx_roomblock_room ON room_blocks(room_id);
-- Bookings table with exclusion constraints to prevent double-booking.
-- Composite FKs enforce therapist qualification and room compatibility at DB level.

CREATE TABLE bookings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES customers(id),
  therapist_id   UUID NOT NULL REFERENCES therapists(id),
  room_id        UUID NOT NULL REFERENCES rooms(id),
  service_id     UUID NOT NULL REFERENCES services(id),
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  status         booking_status NOT NULL DEFAULT 'pending_payment',
  price_ils      INT NOT NULL CHECK (price_ils >= 0),
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id),  -- staff who created it, NULL if chatbot/customer
  cancelled_at   TIMESTAMPTZ,
  cancel_reason  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_at < end_at),
  -- Enforce therapist is qualified for this service
  CONSTRAINT fk_therapist_service
    FOREIGN KEY (therapist_id, service_id)
    REFERENCES therapist_services(therapist_id, service_id),
  -- Enforce room is compatible with this service
  CONSTRAINT fk_room_service
    FOREIGN KEY (room_id, service_id)
    REFERENCES room_services(room_id, service_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_bookings_therapist_time ON bookings(therapist_id, start_at, end_at);
CREATE INDEX idx_bookings_room_time ON bookings(room_id, start_at, end_at);
CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_start_at ON bookings(start_at);

-- OVERLAP PREVENTION: A therapist cannot have overlapping non-cancelled bookings
ALTER TABLE bookings ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled'));

-- OVERLAP PREVENTION: A room cannot have overlapping non-cancelled bookings
ALTER TABLE bookings ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  )
  WHERE (status NOT IN ('cancelled'));
-- Payments table. No raw card data stored — only references to provider transactions.

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id),
  amount_ils        INT NOT NULL CHECK (amount_ils > 0),  -- in agorot
  status            payment_status NOT NULL DEFAULT 'pending',
  provider          TEXT NOT NULL,           -- 'cardcom', 'mock', etc.
  provider_tx_id    TEXT,                    -- Transaction ID from provider
  payment_page_url  TEXT,                    -- Hosted page URL sent to customer
  webhook_payload   JSONB,                   -- Raw webhook body for audit
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_provider_tx ON payments(provider_tx_id);
-- Conversation threads and messages for WhatsApp + web chat

CREATE TABLE conversation_threads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  channel       conversation_channel NOT NULL,
  external_id   TEXT,                    -- WhatsApp phone or web session ID
  is_open       BOOLEAN NOT NULL DEFAULT true,
  assigned_to   UUID REFERENCES profiles(id),  -- Staff user for escalation
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_threads_customer ON conversation_threads(customer_id);
CREATE INDEX idx_threads_open ON conversation_threads(is_open) WHERE is_open = true;

CREATE TABLE conversation_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
  role        message_role NOT NULL,
  content     TEXT NOT NULL,
  metadata    JSONB,                     -- Tool calls, AI context, etc.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_thread ON conversation_messages(thread_id, created_at);
-- Audit log: immutable record of all significant actions

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,                      -- Supabase Auth user, NULL for system/webhook
  action      audit_action NOT NULL,
  entity_type TEXT NOT NULL,             -- 'booking', 'payment', 'therapist', etc.
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
-- Auto-update updated_at timestamp on row modification

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_therapists_updated BEFORE UPDATE ON therapists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_threads_updated BEFORE UPDATE ON conversation_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Row Level Security policies
-- super_admin: full access to everything
-- therapist: own availability rules, own time-off, own bookings (read-only)
-- anon: denied everywhere

-- Helper: check current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get current user's linked therapist_id
CREATE OR REPLACE FUNCTION get_user_therapist_id()
RETURNS UUID AS $$
  SELECT therapist_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ========== PROFILES ==========
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on profiles"
  ON profiles FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- ========== CUSTOMERS ==========
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on customers"
  ON customers FOR ALL
  USING (get_user_role() = 'super_admin');

-- ========== THERAPISTS ==========
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on therapists"
  ON therapists FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read own record"
  ON therapists FOR SELECT
  USING (id = get_user_therapist_id());

-- ========== ROOMS ==========
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on rooms"
  ON rooms FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read rooms"
  ON rooms FOR SELECT
  USING (get_user_role() = 'therapist');

-- ========== SERVICES ==========
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on services"
  ON services FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read services"
  ON services FOR SELECT
  USING (get_user_role() = 'therapist');

-- ========== THERAPIST_SERVICES ==========
ALTER TABLE therapist_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on therapist_services"
  ON therapist_services FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read own service assignments"
  ON therapist_services FOR SELECT
  USING (therapist_id = get_user_therapist_id());

-- ========== ROOM_SERVICES ==========
ALTER TABLE room_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on room_services"
  ON room_services FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read room_services"
  ON room_services FOR SELECT
  USING (get_user_role() = 'therapist');

-- ========== THERAPIST_AVAILABILITY_RULES ==========
ALTER TABLE therapist_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on availability rules"
  ON therapist_availability_rules FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can manage own availability"
  ON therapist_availability_rules FOR ALL
  USING (therapist_id = get_user_therapist_id());

-- ========== THERAPIST_TIME_OFF ==========
ALTER TABLE therapist_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on time_off"
  ON therapist_time_off FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can manage own time off"
  ON therapist_time_off FOR ALL
  USING (therapist_id = get_user_therapist_id());

-- ========== ROOM_BLOCKS ==========
ALTER TABLE room_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on room_blocks"
  ON room_blocks FOR ALL
  USING (get_user_role() = 'super_admin');

-- ========== BOOKINGS ==========
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on bookings"
  ON bookings FOR ALL
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Therapists can read own bookings"
  ON bookings FOR SELECT
  USING (therapist_id = get_user_therapist_id());

-- ========== PAYMENTS ==========
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read payments"
  ON payments FOR SELECT
  USING (get_user_role() = 'super_admin');

CREATE POLICY "Super admins can insert payments"
  ON payments FOR INSERT
  WITH CHECK (get_user_role() = 'super_admin');

-- UPDATE on payments is only via service_role (webhook handler)

-- ========== CONVERSATION_THREADS ==========
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on threads"
  ON conversation_threads FOR ALL
  USING (get_user_role() = 'super_admin');

-- ========== CONVERSATION_MESSAGES ==========
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can do everything on messages"
  ON conversation_messages FOR ALL
  USING (get_user_role() = 'super_admin');

-- ========== AUDIT_LOGS ==========
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read audit logs"
  ON audit_logs FOR SELECT
  USING (get_user_role() = 'super_admin');

-- INSERT on audit_logs happens via service_role or directly from server actions
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
-- ==========================================================
-- Phase 4 — Payments, soft holds, voucher mappings
--
-- Adds:
--   * payment_method enum (credit_card_full, cash_at_reception,
--     voucher_dts, voucher_vpay)
--   * payment_role enum (capture, card_verification,
--     cash_remainder, penalty_capture, refund)
--   * 'authorized' value on the existing payment_status enum
--     (for CardCom CreateTokenOnly verification rows — token
--     stored, no money moved)
--   * columns on payments: method, role, provider_internal_deal_id,
--     provider_cancel_ref, invoice_number, card_last4, card_token,
--     card_token_expires_at, voided_at
--   * columns on bookings: hold_expires_at, payment_method,
--     cash_due_agorot, cancellation_policy_version, sms_sent_at
--   * service_voucher_mappings table (service.id <-> DTS/VPay SKU)
--
-- Cash-on-arrival implementation note:
--   Cash bookings are secured by a CardCom token
--   (Operation = CreateTokenOnly with Shva J-validation), not by
--   a symbolic 1 NIS capture. The token is stored on the
--   payment row (role = card_verification, status = authorized)
--   and can later be charged via LowProfileChargeToken if the
--   cancellation / no-show policy applies.
-- ==========================================================

-- ============================================
-- 1. New enums
-- ============================================

CREATE TYPE payment_method AS ENUM (
  'credit_card_full',
  'cash_at_reception',
  'voucher_dts',
  'voucher_vpay'
);

CREATE TYPE payment_role AS ENUM (
  'capture',            -- actual money capture (credit_card_full, vouchers)
  'card_verification',  -- CreateTokenOnly; no money moved
  'cash_remainder',     -- informational; cash collected at reception
  'penalty_capture',    -- charged via stored token post-cancellation
  'refund'
);

-- ============================================
-- 2. Extend existing payment_status enum
--    Safe inside a migration because payment_status was
--    created in 00002 (pre-existing before this transaction).
-- ============================================

ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'authorized';

-- ============================================
-- 3. Extend payments table
-- ============================================

ALTER TABLE payments
  ADD COLUMN method                    payment_method,
  ADD COLUMN role                      payment_role NOT NULL DEFAULT 'capture',
  ADD COLUMN provider_internal_deal_id TEXT,
  ADD COLUMN provider_cancel_ref       TEXT,
  ADD COLUMN invoice_number            TEXT,
  ADD COLUMN card_last4                TEXT,
  ADD COLUMN card_token                TEXT,
  ADD COLUMN card_token_expires_at     DATE,
  ADD COLUMN voided_at                 TIMESTAMPTZ;

-- Backfill any pre-existing rows (there shouldn't be any in prod yet;
-- this keeps the NOT NULL step below safe in every environment).
UPDATE payments SET method = 'credit_card_full' WHERE method IS NULL;

ALTER TABLE payments ALTER COLUMN method SET NOT NULL;

-- Relax amount check so card_verification rows can carry amount_ils = 0.
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_amount_ils_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_ils_check CHECK (amount_ils >= 0);

-- Idempotency: each outgoing provider call carries a unique invoice_number.
CREATE UNIQUE INDEX idx_payments_invoice_number
  ON payments (invoice_number)
  WHERE invoice_number IS NOT NULL;

-- NOTE on uniqueness across (booking_id, role):
-- Postgres disallows using a newly-ADD-ed enum value in the same transaction
-- that added it (here, 'authorized' on payment_status). The partial unique
-- index that covers status IN ('pending','authorized') is therefore created
-- in a follow-up migration (00016_payment_status_authorized_index.sql)
-- once the new enum value is committed.

-- ============================================
-- 4. Extend bookings table
-- ============================================

ALTER TABLE bookings
  ADD COLUMN hold_expires_at             TIMESTAMPTZ,
  ADD COLUMN payment_method              payment_method,
  ADD COLUMN cash_due_agorot             INTEGER NOT NULL DEFAULT 0
    CHECK (cash_due_agorot >= 0),
  ADD COLUMN cancellation_policy_version TEXT NOT NULL
    DEFAULT 'v1_5pct_or_100ILS_min',
  ADD COLUMN sms_sent_at                 TIMESTAMPTZ;

CREATE INDEX idx_bookings_hold_expiry
  ON bookings (hold_expires_at)
  WHERE status = 'pending_payment';

-- ============================================
-- 5. service_voucher_mappings
--    Maps a service to one or more DTS/VPay SKUs.
-- ============================================

CREATE TABLE service_voucher_mappings (
  service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('dts', 'vpay')),
  provider_sku TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, provider, provider_sku)
);

CREATE INDEX idx_service_voucher_mappings_service
  ON service_voucher_mappings (service_id);
CREATE INDEX idx_service_voucher_mappings_provider_sku
  ON service_voucher_mappings (provider, provider_sku);

-- RLS: super_admin writes; pay page reads are performed via service-role
-- (server-side). No authenticated-therapist access needed for V1.
ALTER TABLE service_voucher_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_voucher_mappings_access" ON service_voucher_mappings FOR ALL
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);
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
-- ==========================================================
-- Phase 5 — Spa settings (single-row config table)
--
-- Holds operational settings that need to be editable without
-- a redeploy. The only V1 setting is the on-call manager phone
-- number used to send SMS + WhatsApp notifications for:
--   * new unassigned bookings
--   * therapist declines
--   * T-3h escalations for still-unassigned bookings
--   * 2h therapist confirmation timeouts
--
-- Design: a single-row table with CHECK (id = 1) so we can't
-- accidentally end up with two rows or zero rows. Read + write
-- by super_admin only. Notification helpers read the phone via
-- the service-role client because they fire from webhooks and
-- crons (no authed user in context).
-- ==========================================================

CREATE TABLE spa_settings (
  id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  on_call_manager_name    TEXT,
  on_call_manager_phone   TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single row. Fields stay NULL until the admin opens
-- /admin/settings and fills them in; the notification dispatcher
-- tolerates NULL (logs a warning and silently skips).
INSERT INTO spa_settings (id) VALUES (1);

-- Updated_at trigger — reuses the function from 00011_triggers.sql.
CREATE TRIGGER trg_spa_settings_updated BEFORE UPDATE ON spa_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS — super_admin reads and updates only.
-- No INSERT / DELETE policy: the single row is seeded here and
-- must never be removed or duplicated.
-- ============================================

ALTER TABLE spa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read spa settings"
  ON spa_settings FOR SELECT
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role);

CREATE POLICY "Super admins can update spa settings"
  ON spa_settings FOR UPDATE
  USING ((select public.get_user_role()) = 'super_admin'::public.user_role)
  WITH CHECK ((select public.get_user_role()) = 'super_admin'::public.user_role);
-- ==========================================================
-- Phase 4.6 — Business hours + slot granularity (SpaMeV2)
--
-- Adds three configurable spa-wide knobs to spa_settings:
--   * business_hours_start / business_hours_end — the outer
--     window the spa is open. Therapist availability rules are
--     clipped to this window at slot-generation time.
--   * slot_granularity_minutes — how bookings are aligned on
--     the time grid. The spa's V2 rule is "all treatments start
--     on the hour", so the default is 60; 15 and 30 are kept
--     available for future flexibility.
--
-- Defaults match the current spa's operating rules. No
-- existing code reads these columns yet — the slot engine +
-- availability-rule validator consume them in the same PR.
-- ==========================================================

ALTER TABLE spa_settings
  ADD COLUMN business_hours_start     TIME NOT NULL DEFAULT '09:00',
  ADD COLUMN business_hours_end       TIME NOT NULL DEFAULT '21:00',
  ADD COLUMN slot_granularity_minutes INT  NOT NULL DEFAULT 60
    CHECK (slot_granularity_minutes IN (15, 30, 60));

-- Enforce start < end at the DB level so a bad row can't sneak in.
ALTER TABLE spa_settings
  ADD CONSTRAINT spa_settings_business_hours_order
    CHECK (business_hours_start < business_hours_end);
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
-- 00022_receptionist_role_enum.sql
-- Phase 6 — Receptionist role + portal
--
-- Adds 'receptionist' to the user_role enum. Kept as a standalone
-- migration because Postgres rejects enum values from being USED in
-- the same transaction where they were ADDED (even in PG 15+).
-- The table + RLS work that references 'receptionist'::user_role
-- lives in 00023_receptionist_tables.sql.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'receptionist';
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
