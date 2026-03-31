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
