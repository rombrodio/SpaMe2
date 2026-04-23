"use client";

import { useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, addWeeks, subDays, subWeeks, parseISO } from "date-fns";

interface CalendarHeaderProps {
  date: Date;
  view: "day" | "week";
  onDateChange: (date: Date) => void;
  onViewChange: (view: "day" | "week") => void;
}

export function CalendarHeader({
  date,
  view,
  onDateChange,
  onViewChange,
}: CalendarHeaderProps) {
  // DEF-030: hidden native date input + clickable title that opens it.
  // Keeps the compact header layout while giving the user a proper date
  // jump — better than adding yet another button.
  const pickerId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);

  function goBack() {
    onDateChange(view === "day" ? subDays(date, 1) : subWeeks(date, 1));
  }

  function goForward() {
    onDateChange(view === "day" ? addDays(date, 1) : addWeeks(date, 1));
  }

  function goToday() {
    onDateChange(new Date());
  }

  function openPicker() {
    const input = pickerRef.current;
    if (!input) return;
    // showPicker is supported in all evergreen browsers (2023+); fall back
    // to focus() on older ones.
    if (typeof input.showPicker === "function") input.showPicker();
    else input.focus();
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    onDateChange(parseISO(e.target.value));
  }

  const title =
    view === "day"
      ? format(date, "EEEE, MMMM d, yyyy")
      : `Week of ${format(date, "MMM d, yyyy")}`;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goBack} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={goForward} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={openPicker}
          className="ml-2 rounded-md px-2 py-1 text-lg font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Jump to date"
        >
          {title}
        </button>
        <Input
          id={pickerId}
          ref={pickerRef}
          type="date"
          className="sr-only absolute"
          tabIndex={-1}
          value={format(date, "yyyy-MM-dd")}
          onChange={handlePick}
        />
      </div>
      <div className="flex items-center gap-1 rounded-md border border-input p-0.5">
        <Button
          variant={view === "day" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("day")}
        >
          Day
        </Button>
        <Button
          variant={view === "week" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("week")}
        >
          Week
        </Button>
      </div>
    </div>
  );
}
