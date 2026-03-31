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
