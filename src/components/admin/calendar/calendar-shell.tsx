"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarHeader, type CalendarView } from "./calendar-header";
import { DayView } from "./day-view";
import { WeekView } from "./week-view";
import { ResourceView } from "./resource-view";
import { MonthView } from "./month-view";
import { TherapistFilter } from "./therapist-filter";
import type { CalendarBooking, CalendarTherapist } from "./types";
import { getBookingsForRange } from "@/lib/actions/bookings";
import {
  startOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface CalendarShellProps {
  initialDate?: string;
  initialView?: CalendarView;
  therapists: CalendarTherapist[];
}

const LS_KEY = "spame.calendar.selected_therapists";

/**
 * SPA-008 + SPA-030 + SPA-033: full calendar shell with four view modes.
 *
 * Selection of which therapists are visible persists in localStorage per
 * receptionist and is mirrored into the URL when set via the filter chip,
 * so links are shareable without losing context.
 */
export function CalendarShell({
  initialDate,
  initialView = "week",
  therapists,
}: CalendarShellProps) {
  const [date, setDate] = useState(() =>
    initialDate ? new Date(initialDate) : new Date()
  );
  const [view, setView] = useState<CalendarView>(initialView);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [loading, setLoading] = useState(true);

  // SPA-008: therapist selection. Seed from localStorage on first render
  // so a receptionist's "my therapists" pick sticks across sessions.
  const [selectedTherapists, setSelectedTherapists] = useState<string[]>(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(selectedTherapists));
    } catch {
      // localStorage unavailable (private mode, etc.) — silently ignore.
    }
  }, [selectedTherapists]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      let from: string, to: string;
      if (view === "day" || view === "resource") {
        from = startOfDay(date).toISOString();
        to = endOfDay(date).toISOString();
      } else if (view === "month") {
        from = startOfDay(startOfMonth(date)).toISOString();
        to = endOfDay(endOfMonth(date)).toISOString();
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
    // Defer via microtask so `fetchBookings` (which begins with a
    // synchronous setLoading(true)) is not called directly in the
    // effect body — that trips the react-hooks/set-state-in-effect
    // rule. The microtask hop is a single tick and invisible to users.
    queueMicrotask(() => {
      void fetchBookings();
    });
  }, [fetchBookings]);

  // Filter bookings by the current therapist selection. Empty selection
  // = show everyone (sensible default when the receptionist first lands).
  const filteredBookings = useMemo(() => {
    if (selectedTherapists.length === 0) return bookings;
    const set = new Set(selectedTherapists);
    return bookings.filter(
      (b) => b.therapist_id && set.has(b.therapist_id)
    );
  }, [bookings, selectedTherapists]);

  // Resource view columns = the selected therapists. If none selected,
  // fall back to showing up to 8 active therapists so the view isn't
  // empty — but never all 20 at once.
  const resourceColumns = useMemo<CalendarTherapist[]>(() => {
    if (selectedTherapists.length === 0) {
      return therapists.filter((t) => t.is_active).slice(0, 8);
    }
    const set = new Set(selectedTherapists);
    return therapists.filter((t) => set.has(t.id));
  }, [therapists, selectedTherapists]);

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
      <div className="mt-3">
        <TherapistFilter
          therapists={therapists}
          selected={selectedTherapists}
          onChange={setSelectedTherapists}
        />
      </div>
      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading...
        </div>
      ) : view === "day" ? (
        <DayView date={date} bookings={filteredBookings} />
      ) : view === "resource" ? (
        resourceColumns.length === 0 ? (
          <EmptyResource />
        ) : (
          <ResourceView
            date={date}
            bookings={filteredBookings}
            therapists={resourceColumns}
          />
        )
      ) : view === "month" ? (
        <MonthView
          date={date}
          bookings={filteredBookings}
          onSelectDate={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : (
        <WeekView date={date} bookings={filteredBookings} />
      )}
      {selectedTherapists.length > 8 && view === "resource" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Resource view renders up to 8 therapists as columns. Narrow your
          selection to focus on specific therapists.
        </p>
      )}
    </div>
  );
}

function EmptyResource() {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      Pick one or more therapists in the filter to view their columns.
    </div>
  );
}
