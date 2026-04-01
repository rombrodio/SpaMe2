export interface AvailabilityRule {
  id: string;
  therapist_id: string;
  day_of_week: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  valid_from: string;
  valid_until: string | null;
}

export interface TimeOff {
  id: string;
  therapist_id: string;
  start_at: string;
  end_at: string;
}

export interface RoomBlock {
  id: string;
  room_id: string;
  start_at: string;
  end_at: string;
}

export interface ExistingBooking {
  id: string;
  therapist_id: string;
  room_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
}

export interface ServiceInfo {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_ils: number;
}

export interface TherapistInfo {
  id: string;
  full_name: string;
  color: string | null;
  is_active: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  is_active: boolean;
}

export interface AvailableSlot {
  start: Date;
  end: Date;
  therapist_id: string;
  therapist_name: string;
  therapist_color: string | null;
  room_id: string;
  room_name: string;
}

export interface BookingConflict {
  type: "therapist_overlap" | "room_overlap" | "therapist_unavailable" | "therapist_time_off" | "room_blocked" | "therapist_not_qualified" | "room_not_compatible";
  message: string;
}
