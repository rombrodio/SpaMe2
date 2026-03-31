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
