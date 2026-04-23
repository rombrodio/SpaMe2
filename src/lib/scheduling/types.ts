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

/**
 * Assignment lifecycle axis — orthogonal to booking status.
 * Mirrors the assignment_status enum in migration 00018.
 */
export type AssignmentStatus =
  | "unassigned"
  | "pending_confirmation"
  | "confirmed"
  | "declined";

export interface ExistingBooking {
  id: string;
  // NULL for bookings that have been paid but not yet assigned to a
  // therapist (see phase 5 — deferred assignment). The availability
  // engine treats NULL rows as "not yet blocking any therapist".
  therapist_id: string | null;
  room_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
  // Optional on this shared shape so existing Supabase queries that
  // don't select the column still type-check. Phase 2 updates the
  // relevant queries + engine logic to consume this field.
  assignment_status?: AssignmentStatus;
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
  type:
    | "therapist_overlap"
    | "room_overlap"
    | "therapist_unavailable"
    | "therapist_time_off"
    | "room_blocked"
    | "therapist_not_qualified"
    | "room_not_compatible"
    /**
     * Raised when the exact matcher proves that pinning this therapist
     * to the new booking leaves at least one paid-but-unassigned
     * booking unfillable (phase 5 deferred-assignment work).
     */
    | "capacity_blocked_unassigned";
  message: string;
}
