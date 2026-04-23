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
