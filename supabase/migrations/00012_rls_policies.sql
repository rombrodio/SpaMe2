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
