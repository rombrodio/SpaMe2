-- Custom enum types for the application

CREATE TYPE booking_status AS ENUM (
  'pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'success', 'failed', 'refunded'
);

CREATE TYPE day_of_week AS ENUM (
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
);

CREATE TYPE conversation_channel AS ENUM ('whatsapp', 'web');

CREATE TYPE message_role AS ENUM ('customer', 'assistant', 'system', 'staff');

CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'status_change', 'login', 'payment_webhook'
);

CREATE TYPE user_role AS ENUM ('super_admin', 'therapist');
