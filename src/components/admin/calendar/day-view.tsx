"use client";

import { format, parseISO, differenceInMinutes, startOfDay } from "date-fns";
import { BookingCard } from "./booking-card";

interface Booking {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  customers: { full_name: string } | null;
  therapists: { full_name: string; color: string | null } | null;
  rooms: { name: string } | null;
  services: { name: string; duration_minutes: number } | null;
}

interface DayViewProps {
  date: Date;
  bookings: Booking[];
}

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 64; // px per hour

export function DayView({ date, bookings }: DayViewProps) {
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );

  const dayBookings = bookings.filter((b) => {
    const bDate = format(new Date(b.start_at), "yyyy-MM-dd");
    const targetDate = format(date, "yyyy-MM-dd");
    return bDate === targetDate;
  });

  return (
    <div className="relative mt-4 overflow-auto rounded-lg border border-border bg-card">
      <div className="relative" style={{ height: hours.length * HOUR_HEIGHT }}>
        {/* Hour grid lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 border-t border-border"
            style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
          >
            <span className="absolute -top-2.5 left-2 text-xs text-muted-foreground">
              {String(hour).padStart(2, "0")}:00
            </span>
          </div>
        ))}

        {/* Bookings */}
        <div className="absolute left-16 right-2 top-0">
          {dayBookings.map((booking) => {
            const start = new Date(booking.start_at);
            const end = new Date(booking.end_at);
            const startMinutes =
              start.getHours() * 60 +
              start.getMinutes() -
              HOUR_START * 60;
            const durationMinutes = differenceInMinutes(end, start);
            const top = (startMinutes / 60) * HOUR_HEIGHT;
            const height = (durationMinutes / 60) * HOUR_HEIGHT;

            return (
              <div
                key={booking.id}
                className="absolute left-0 right-0"
                style={{
                  top: Math.max(0, top),
                  height: Math.max(24, height),
                }}
              >
                <BookingCard booking={booking} />
              </div>
            );
          })}
        </div>

        {/* Now indicator */}
        <NowIndicator date={date} hourStart={HOUR_START} hourHeight={HOUR_HEIGHT} />
      </div>
    </div>
  );
}

function NowIndicator({
  date,
  hourStart,
  hourHeight,
}: {
  date: Date;
  hourStart: number;
  hourHeight: number;
}) {
  const now = new Date();
  if (format(now, "yyyy-MM-dd") !== format(date, "yyyy-MM-dd")) return null;

  const minutes = now.getHours() * 60 + now.getMinutes() - hourStart * 60;
  const top = (minutes / 60) * hourHeight;

  return (
    <div
      className="absolute left-12 right-0 border-t-2 border-red-500 z-10"
      style={{ top }}
    >
      <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-red-500" />
    </div>
  );
}
