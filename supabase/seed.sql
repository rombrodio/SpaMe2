-- Seed data for local development
-- Note: Auth users must be created via Supabase Auth (dashboard or API).
-- This seeds the application tables only.
--
-- All UUIDs below are real RFC 4122 v4 UUIDs (generated via crypto.randomUUID).
-- Do NOT replace with synthetic / pattern-based UUIDs — schema validation
-- uses z.string().uuid() which enforces the variant-bit check.

-- Therapists
INSERT INTO therapists (id, full_name, phone, email, color, gender) VALUES
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'Dana Cohen',    '+972501234501', 'dana@example.com',  '#3B82F6', 'female'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'Yael Levy',     '+972501234502', 'yael@example.com',  '#10B981', 'female'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'Noam Shapira',  '+972501234503', 'noam@example.com',  '#F59E0B', 'male');

-- Rooms
INSERT INTO rooms (id, name, description) VALUES
  ('eb7dd619-0ca6-4458-a48a-910619f05bf9', 'Lotus Room',   'Ground floor, couples massage'),
  ('465f6f8c-5cb0-4ef5-9acd-dcf99570be8d', 'Zen Room',     'Second floor, single treatments'),
  ('2d857b13-fdf1-4124-8dbe-8212795ba38e', 'Ocean Room',   'Ground floor, facial & body');

-- Services
INSERT INTO services (id, name, description, duration_minutes, buffer_minutes, price_ils) VALUES
  ('ca9bb45d-b798-44cb-af7f-8b2290adc3ec', 'Swedish Massage',       'Full body relaxation massage',    60, 15, 35000),
  ('e9817346-f660-4b6f-86d4-391760fde377', 'Deep Tissue Massage',   'Focused pressure therapy',        60, 15, 40000),
  ('8d00225a-a59b-4627-9909-3c92a7fd06fc', 'Facial Treatment',      'Cleansing and rejuvenation',      45, 10, 28000),
  ('456128c0-e656-40e8-be6b-52951cdfbab3', 'Hot Stone Massage',     'Heated basalt stones therapy',    90, 20, 50000),
  ('037e3a4e-4df8-448c-8e2f-b754ba762cec', 'Couples Massage',       'Side by side relaxation',         60, 15, 65000);

-- Therapist qualifications
INSERT INTO therapist_services (therapist_id, service_id) VALUES
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'e9817346-f660-4b6f-86d4-391760fde377'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', '456128c0-e656-40e8-be6b-52951cdfbab3'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', '8d00225a-a59b-4627-9909-3c92a7fd06fc'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', '037e3a4e-4df8-448c-8e2f-b754ba762cec'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'e9817346-f660-4b6f-86d4-391760fde377'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', '8d00225a-a59b-4627-9909-3c92a7fd06fc');

-- Room compatibility
INSERT INTO room_services (room_id, service_id) VALUES
  ('eb7dd619-0ca6-4458-a48a-910619f05bf9', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('eb7dd619-0ca6-4458-a48a-910619f05bf9', 'e9817346-f660-4b6f-86d4-391760fde377'),
  ('eb7dd619-0ca6-4458-a48a-910619f05bf9', '456128c0-e656-40e8-be6b-52951cdfbab3'),
  ('eb7dd619-0ca6-4458-a48a-910619f05bf9', '037e3a4e-4df8-448c-8e2f-b754ba762cec'),
  ('465f6f8c-5cb0-4ef5-9acd-dcf99570be8d', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('465f6f8c-5cb0-4ef5-9acd-dcf99570be8d', 'e9817346-f660-4b6f-86d4-391760fde377'),
  ('2d857b13-fdf1-4124-8dbe-8212795ba38e', 'ca9bb45d-b798-44cb-af7f-8b2290adc3ec'),
  ('2d857b13-fdf1-4124-8dbe-8212795ba38e', '8d00225a-a59b-4627-9909-3c92a7fd06fc');

-- Therapist availability (Sun-Thu working hours, typical Israeli schedule)
INSERT INTO therapist_availability_rules (therapist_id, day_of_week, start_time, end_time) VALUES
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'sunday',    '09:00', '17:00'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'monday',    '09:00', '17:00'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'tuesday',   '09:00', '17:00'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'wednesday', '09:00', '17:00'),
  ('838c1ccb-9a92-4990-9cd4-1c0a80d48859', 'thursday',  '09:00', '17:00'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'sunday',    '10:00', '18:00'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'monday',    '10:00', '18:00'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'tuesday',   '10:00', '18:00'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'wednesday', '10:00', '18:00'),
  ('48301779-5394-48c1-a82a-83de9b2e2126', 'thursday',  '10:00', '18:00'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'sunday',    '08:00', '14:00'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'monday',    '08:00', '14:00'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'tuesday',   '14:00', '20:00'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'wednesday', '14:00', '20:00'),
  ('62936e33-3b8c-44dd-a969-833b87b97378', 'thursday',  '08:00', '14:00');

-- Customers
INSERT INTO customers (full_name, phone, email) VALUES
  ('Amit Rosenberg',  '+972521111111', 'amit@example.com'),
  ('Shira Goldberg',  '+972522222222', 'shira@example.com'),
  ('Oren Mizrachi',   '+972523333333', NULL);
