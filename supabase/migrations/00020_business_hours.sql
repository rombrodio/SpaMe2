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
