/** Shape of a booking row used by the calendar views. */
export interface CalendarBooking {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  customers: { full_name: string } | null;
  therapists: { full_name: string; color: string | null } | null;
  rooms: { name: string } | null;
  services: { name: string; duration_minutes: number } | null;
}
