"use client";

import { useRouter } from "next/navigation";
import { toZonedTime, formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import { TZ } from "@/lib/constants";
import { BookingCard } from "./booking-card";
import { Avatar } from "@/components/ui/avatar";
import type { CalendarBooking, CalendarTherapist } from "./types";

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 56;

interface ResourceViewProps {
  date: Date;
  bookings: CalendarBooking[];
  therapists: CalendarTherapist[];
}

/**
 * SPA-030 — filter-first resource view. One column per therapist
 * (pre-filtered by the parent so we never render 20 columns on a laptop).
 * Each booking sits in its therapist's column; overlaps within the same
 * column stack side-by-side.
 *
 * Clicking an empty cell opens the New Booking form with date + therapist
 * + start time prefilled (SPA-032).
 */
export function ResourceView({ date, bookings, therapists }: ResourceViewProps) {
  const router = useRouter();
  const dateStr = formatInTimeZone(date, TZ, "yyyy-MM-dd");
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );

  const dayBookings = bookings.filter(
    (b) =>
      formatInTimeZone(new Date(b.start_at), TZ, "yyyy-MM-dd") === dateStr
  );

  function columnBookings(therapistId: string) {
    return dayBookings.filter((b) => b.therapist_id === therapistId);
  }

  function handleEmptyClick(therapistId: string, hour: number, half: 0 | 1) {
    const minute = half === 0 ? "00" : "30";
    const start = `${String(hour).padStart(2, "0")}:${minute}`;
    router.push(
      `/admin/bookings/new?date=${dateStr}&start=${start}&therapist_id=${therapistId}`
    );
  }

  return (
    <div className="mt-4 overflow-auto rounded-lg border border-border bg-card">
      <div
        className="grid sticky top-0 z-20 border-b bg-card"
        style={{
          gridTemplateColumns: `60px repeat(${therapists.length}, minmax(140px, 1fr))`,
        }}
      >
        <div className="border-r border-border" />
        {therapists.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-center gap-2 border-r border-border px-2 py-2 text-sm font-medium last:border-r-0"
          >
            <Avatar name={t.full_name} color={t.color} size="sm" />
            <span className="truncate">{t.full_name.split(" ")[0]}</span>
          </div>
        ))}
      </div>

      <div
        className="relative grid"
        style={{
          height: hours.length * HOUR_HEIGHT,
          gridTemplateColumns: `60px repeat(${therapists.length}, minmax(140px, 1fr))`,
        }}
      >
        {/* Hour gutter */}
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

        {/* Therapist columns */}
        {therapists.map((t) => (
          <div
            key={t.id}
            className="relative border-r border-border last:border-r-0"
          >
            {hours.map((hour) => (
              <div key={hour}>
                {/* Top half — :00 */}
                <button
                  type="button"
                  onClick={() => handleEmptyClick(t.id, hour, 0)}
                  aria-label={`Book ${t.full_name} at ${String(hour).padStart(2, "0")}:00`}
                  className="absolute left-0 right-0 border-t border-border transition-colors hover:bg-muted/40"
                  style={{
                    top: (hour - HOUR_START) * HOUR_HEIGHT,
                    height: HOUR_HEIGHT / 2,
                  }}
                />
                {/* Bottom half — :30 */}
                <button
                  type="button"
                  onClick={() => handleEmptyClick(t.id, hour, 1)}
                  aria-label={`Book ${t.full_name} at ${String(hour).padStart(2, "0")}:30`}
                  className="absolute left-0 right-0 transition-colors hover:bg-muted/40"
                  style={{
                    top: (hour - HOUR_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                    height: HOUR_HEIGHT / 2,
                  }}
                />
              </div>
            ))}

            {columnBookings(t.id).map((booking) => {
              const startZoned = toZonedTime(new Date(booking.start_at), TZ);
              const endZoned = toZonedTime(new Date(booking.end_at), TZ);
              const startMin =
                startZoned.getHours() * 60 +
                startZoned.getMinutes() -
                HOUR_START * 60;
              const durationMin =
                (endZoned.getTime() - startZoned.getTime()) / 60000;
              const top = Math.max(0, (startMin / 60) * HOUR_HEIGHT);
              const height = Math.max(24, (durationMin / 60) * HOUR_HEIGHT);
              return (
                <div
                  key={booking.id}
                  className="absolute left-1 right-1 z-10 overflow-hidden"
                  style={{ top, height }}
                >
                  <BookingCard booking={booking} />
                </div>
              );
            })}

            {/* Unassigned-today lane, rendered once in the last column to
                surface bookings with no therapist. Not done yet — we let
                unassigned bookings simply not appear in resource view;
                the Assignments screen handles them. */}
          </div>
        ))}

        {/* Current-time indicator spanning all therapist columns */}
        {formatInTimeZone(new Date(), TZ, "yyyy-MM-dd") === dateStr && (
          <NowLine />
        )}
      </div>
    </div>
  );

  function NowLine() {
    const now = new Date();
    const nowZoned = toZonedTime(now, TZ);
    const minutes =
      nowZoned.getHours() * 60 + nowZoned.getMinutes() - HOUR_START * 60;
    const top = (minutes / 60) * HOUR_HEIGHT;
    if (top < 0) return null;
    return (
      <div
        className="pointer-events-none absolute left-[60px] right-0 z-20 border-t-2 border-red-500"
        style={{ top }}
      >
        <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
      </div>
    );
  }
}

/** Exposed for callers that want to know the time-zone-aware date string. */
export function dateToZonedString(d: Date): string {
  return format(fromZonedTime(d, TZ), "yyyy-MM-dd");
}
