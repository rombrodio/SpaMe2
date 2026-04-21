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
