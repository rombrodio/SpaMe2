"use client";

import { differenceInMinutes } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { BookingCard } from "./booking-card";
import type { CalendarBooking } from "./types";

type Booking = CalendarBooking;

interface DayViewProps {
  date: Date;
  bookings: Booking[];
}

const HOUR_START = 7;
const HOUR_END = 22;
const HOUR_HEIGHT = 64; // px per hour
const COL_PAD = 2;

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
    const durationMin = differenceInMinutes(endZoned, startZoned);
    return {
      booking,
      top: Math.max(0, (startMin / 60) * HOUR_HEIGHT),
      height: Math.max(24, (durationMin / 60) * HOUR_HEIGHT),
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

export function DayView({ date, bookings }: DayViewProps) {
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i
  );

  const targetDate = formatInTimeZone(date, TZ, "yyyy-MM-dd");
  const dayBookings = bookings.filter(
    (b) => formatInTimeZone(new Date(b.start_at), TZ, "yyyy-MM-dd") === targetDate
  );
  const layout = layoutOverlappingBookings(dayBookings);

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
          {layout.map(({ booking, top, height, col, totalCols }) => {
            const widthPct = 100 / totalCols;
            const leftPct = col * widthPct;

            return (
              <div
                key={booking.id}
                className="absolute overflow-hidden"
                style={{
                  top,
                  height,
                  left: `calc(${leftPct}% + ${COL_PAD}px)`,
                  width: `calc(${widthPct}% - ${COL_PAD * 2}px)`,
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
  const nowZoned = toZonedTime(now, TZ);
  if (
    formatInTimeZone(now, TZ, "yyyy-MM-dd") !==
    formatInTimeZone(date, TZ, "yyyy-MM-dd")
  )
    return null;

  const minutes = nowZoned.getHours() * 60 + nowZoned.getMinutes() - hourStart * 60;
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
