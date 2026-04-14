"use client";

import { useState, useEffect, useCallback } from "react";
import { CalendarHeader } from "./calendar-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import type { CalendarBooking } from "./types";
import { getBookingsForRange } from "@/lib/actions/bookings";
import {
  startOfWeek,
  startOfDay,
  endOfDay,
  addDays,
} from "date-fns";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface CalendarShellProps {
  initialDate?: string;
  initialView?: "day" | "week";
}

export function CalendarShell({
  initialDate,
  initialView = "week",
}: CalendarShellProps) {
  const [date, setDate] = useState(() =>
    initialDate ? new Date(initialDate) : new Date()
  );
  const [view, setView] = useState<"day" | "week">(initialView);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let from: string, to: string;
      if (view === "day") {
        from = startOfDay(date).toISOString();
        to = endOfDay(date).toISOString();
      } else {
        const ws = startOfWeek(date, { weekStartsOn: 0 });
        from = startOfDay(ws).toISOString();
        to = endOfDay(addDays(ws, 6)).toISOString();
      }
      const data = await getBookingsForRange(from, to);
      setBookings(data as unknown as CalendarBooking[]);
    } finally {
      setLoading(false);
    }
  }, [date, view]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Link
          href="/admin/bookings/new"
          className={cn(buttonVariants(), "gap-1")}
        >
          <Plus className="h-4 w-4" />
          New Booking
        </Link>
      </div>
      <div className="mt-4">
        <CalendarHeader
          date={date}
          view={view}
          onDateChange={setDate}
          onViewChange={setView}
        />
      </div>
      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading...
        </div>
      ) : view === "day" ? (
        <DayView date={date} bookings={bookings} />
      ) : (
        <WeekView date={date} bookings={bookings} />
      )}
    </div>
  );
}
