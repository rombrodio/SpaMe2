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
