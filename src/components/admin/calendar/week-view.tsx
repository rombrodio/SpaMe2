"use client";

import { useRouter } from "next/navigation";
import { addDays, startOfWeek, isSameDay } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { BookingCard } from "./booking-card";
import type { CalendarBooking } from "./types";

type Booking = CalendarBooking;

interface WeekViewProps {
  date: Date;
  bookings: Booking[];
}

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 48;
const COL_PAD = 2; // px padding between cards

interface LayoutInfo {
  booking: Booking;
  top: number;
  height: number;
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
}

function layoutOverlappingBookings(
  dayBookings: Booking[]
): LayoutInfo[] {
  const items: LayoutInfo[] = dayBookings.map((booking) => {
    const startZoned = toZonedTime(new Date(booking.start_at), TZ);
    const endZoned = toZonedTime(new Date(booking.end_at), TZ);
    const startMin =
      startZoned.getHours() * 60 + startZoned.getMinutes() - HOUR_START * 60;
    const durationMin = (endZoned.getTime() - startZoned.getTime()) / 60000;
    return {
      booking,
      top: Math.max(0, (startMin / 60) * HOUR_HEIGHT),
      height: Math.max(20, (durationMin / 60) * HOUR_HEIGHT),
      startMin,
      endMin: startMin + durationMin,
      col: 0,
      totalCols: 1,
    };
  });

  items.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clusters: LayoutInfo[][] = [];
  for (const item of items) {
    let placed = false;
    for (const cluster of clusters) {
      if (cluster.some((c) => c.startMin < item.endMin && c.endMin > item.startMin)) {
        cluster.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([item]);
    }
  }

  for (const cluster of clusters) {
    const columns: LayoutInfo[][] = [];
    for (const item of cluster) {
      let placed = false;
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1];
        if (last.endMin <= item.startMin) {
          columns[c].push(item);
          item.col = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.col = columns.length;
        columns.push([item]);
      }
    }
    for (const item of cluster) {
      item.totalCols = columns.length;
    }
  }

  return items;
}

export function WeekView({ date, bookings }: WeekViewProps) {
  const router = useRouter();
  const weekStart = startOfWeek(date, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );
  const today = new Date();

  function openEmpty(day: Date, hour: number, half: 0 | 1) {
    const dateStr = formatInTimeZone(day, TZ, "yyyy-MM-dd");
    const minute = half === 0 ? "00" : "30";
    const start = `${String(hour).padStart(2, "0")}:${minute}`;
    router.push(`/admin/bookings/new?date=${dateStr}&start=${start}`);
  }

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
                {formatInTimeZone(day, TZ, "EEE")}
              </div>
              <div
                className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}
              >
                {formatInTimeZone(day, TZ, "d")}
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
          const dayStr = formatInTimeZone(day, TZ, "yyyy-MM-dd");
          const dayBookings = bookings.filter(
            (b) =>
              formatInTimeZone(new Date(b.start_at), TZ, "yyyy-MM-dd") === dayStr
          );
          const layout = layoutOverlappingBookings(dayBookings);

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

              {/* SPA-032: click empty half-hour cell → New Booking prefilled */}
              {hours.flatMap((hour) => [
                <button
                  type="button"
                  key={`${hour}-0`}
                  onClick={() => openEmpty(day, hour, 0)}
                  aria-label={`Book at ${String(hour).padStart(2, "0")}:00`}
                  className="absolute left-0 right-0 transition-colors hover:bg-muted/40"
                  style={{
                    top: (hour - HOUR_START) * HOUR_HEIGHT,
                    height: HOUR_HEIGHT / 2,
                  }}
                />,
                <button
                  type="button"
                  key={`${hour}-1`}
                  onClick={() => openEmpty(day, hour, 1)}
                  aria-label={`Book at ${String(hour).padStart(2, "0")}:30`}
                  className="absolute left-0 right-0 transition-colors hover:bg-muted/40"
                  style={{
                    top: (hour - HOUR_START) * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                    height: HOUR_HEIGHT / 2,
                  }}
                />,
              ])}

              {/* Bookings */}
              {layout.map(({ booking, top, height, col, totalCols }) => {
                const widthPct = 100 / totalCols;
                const leftPct = col * widthPct;

                return (
                  <div
                    key={booking.id}
                    className="absolute z-10 overflow-hidden"
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + ${COL_PAD}px)`,
                      width: `calc(${widthPct}% - ${COL_PAD * 2}px)`,
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
