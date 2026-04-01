"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, addWeeks, subDays, subWeeks } from "date-fns";

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
  function goBack() {
    onDateChange(view === "day" ? subDays(date, 1) : subWeeks(date, 1));
  }

  function goForward() {
    onDateChange(view === "day" ? addDays(date, 1) : addWeeks(date, 1));
  }

  function goToday() {
    onDateChange(new Date());
  }

  const title =
    view === "day"
      ? format(date, "EEEE, MMMM d, yyyy")
      : `Week of ${format(date, "MMM d, yyyy")}`;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={goForward}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="ml-2 text-lg font-semibold">{title}</h2>
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
