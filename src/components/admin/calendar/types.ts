/** Shape of a booking row used by the calendar views. */
export interface CalendarBooking {
  id: string;
  therapist_id: string | null;
  room_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
  assignment_status?:
    | "unassigned"
    | "pending_confirmation"
    | "confirmed"
    | "declined";
  customers: { full_name: string } | null;
  therapists: { id?: string; full_name: string; color: string | null } | null;
  rooms: { name: string } | null;
  services: { name: string; duration_minutes: number } | null;
}

export interface CalendarTherapist {
  id: string;
  full_name: string;
  color: string | null;
  is_active: boolean;
}
