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
