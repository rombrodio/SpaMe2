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
