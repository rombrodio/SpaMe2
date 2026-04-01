"use client";

import { format, addDays, startOfWeek, isSameDay } from "date-fns";
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

interface WeekViewProps {
  date: Date;
  bookings: Booking[];
}

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 48;

export function WeekView({ date, bookings }: WeekViewProps) {
  // Week starts on Sunday for Israel
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );
  const today = new Date();

  return (
    <div className="mt-4 overflow-auto rounded-lg border border-border bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border sticky top-0 bg-card z-20">
        <div className="border-r border-border" />
        {days.map((day) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              className={`border-r border-border px-2 py-2 text-center text-sm last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
            >
              <div className="text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div
        className="relative grid grid-cols-[60px_repeat(7,1fr)]"
        style={{ height: hours.length * HOUR_HEIGHT }}
      >
        {/* Hour labels */}
        <div className="relative border-r border-border">
          {hours.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-t border-border"
              style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
            >
              <span className="absolute -top-2.5 left-1 text-xs text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const dayBookings = bookings.filter(
            (b) => format(new Date(b.start_at), "yyyy-MM-dd") === dayStr
          );

          return (
            <div key={dayStr} className="relative border-r border-border last:border-r-0">
              {/* Hour grid lines */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-t border-border"
                  style={{ top: (hour - HOUR_START) * HOUR_HEIGHT }}
                />
              ))}

              {/* Bookings */}
              {dayBookings.map((booking) => {
                const start = new Date(booking.start_at);
                const end = new Date(booking.end_at);
                const startMinutes =
                  start.getHours() * 60 +
                  start.getMinutes() -
                  HOUR_START * 60;
                const durationMinutes =
                  (end.getTime() - start.getTime()) / 60000;
                const top = (startMinutes / 60) * HOUR_HEIGHT;
                const height = (durationMinutes / 60) * HOUR_HEIGHT;

                return (
                  <div
                    key={booking.id}
                    className="absolute left-0.5 right-0.5"
                    style={{
                      top: Math.max(0, top),
                      height: Math.max(20, height),
                    }}
                  >
                    <BookingCard booking={booking} compact />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
