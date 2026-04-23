"use client";

import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type { CalendarBooking } from "./types";
import { cn } from "@/lib/utils";

interface MonthViewProps {
  date: Date;
  bookings: CalendarBooking[];
  onSelectDate: (d: Date) => void;
}

/**
 * SPA-033 — month grid with per-day booking counts. Clicking a day
 * jumps to that day's detail view via the `onSelectDate` callback.
 * Days outside the current month render dimmed; today is highlighted.
 */
export function MonthView({ date, bookings, onSelectDate }: MonthViewProps) {
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(date);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  // Pre-bucket bookings by day string for O(1) lookup.
  const buckets = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    const key = formatInTimeZone(new Date(b.start_at), TZ, "yyyy-MM-dd");
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    formatInTimeZone(addDays(gridStart, i), TZ, "EEE")
  );

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
        {weekdayLabels.map((w) => (
          <div key={w} className="px-2 py-2 text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = formatInTimeZone(day, TZ, "yyyy-MM-dd");
          const count = buckets.get(key) ?? 0;
          const outsideMonth = !isSameMonth(day, monthStart);
          const isToday = isSameDay(day, today);
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={cn(
                "aspect-square min-h-[72px] border-b border-r p-2 text-left transition-colors last:border-r-0 hover:bg-muted/40",
                outsideMonth && "bg-muted/20 text-muted-foreground",
                isToday && "bg-primary/5"
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-sm font-medium",
                    isToday && "text-primary"
                  )}
                >
                  {formatInTimeZone(day, TZ, "d")}
                </span>
                {count > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Helper: shift date by one month in either direction. */
export function shiftMonth(date: Date, direction: 1 | -1): Date {
  return addMonths(date, direction);
}
