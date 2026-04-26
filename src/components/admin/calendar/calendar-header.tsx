"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  parseISO,
} from "date-fns";

export type CalendarView = "day" | "week" | "resource" | "month";

interface CalendarHeaderProps {
  date: Date;
  view: CalendarView;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
}

export function CalendarHeader({
  date,
  view,
  onDateChange,
  onViewChange,
}: CalendarHeaderProps) {
  const t = useTranslations();
  // DEF-030: hidden native date input + clickable title that opens it.
  // Keeps the compact header layout while giving the user a proper date
  // jump — better than adding yet another button.
  const pickerId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);

  function goBack() {
    if (view === "day" || view === "resource") {
      onDateChange(subDays(date, 1));
    } else if (view === "month") {
      onDateChange(subMonths(date, 1));
    } else {
      onDateChange(subWeeks(date, 1));
    }
  }

  function goForward() {
    if (view === "day" || view === "resource") {
      onDateChange(addDays(date, 1));
    } else if (view === "month") {
      onDateChange(addMonths(date, 1));
    } else {
      onDateChange(addWeeks(date, 1));
    }
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
    view === "day" || view === "resource"
      ? format(date, "EEEE, MMMM d, yyyy")
      : view === "month"
        ? format(date, "MMMM yyyy")
        : t("admin.calendar.nav.weekOf", { date: format(date, "MMM d, yyyy") });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={goBack}
          aria-label={t("admin.calendar.nav.previous")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday}>
          {t("admin.calendar.nav.today")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={goForward}
          aria-label={t("admin.calendar.nav.next")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={openPicker}
          className="ml-2 rounded-md px-2 py-1 text-lg font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("admin.calendar.nav.jumpToDate")}
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
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-input p-0.5">
        <Button
          variant={view === "day" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("day")}
        >
          {t("admin.calendar.views.day")}
        </Button>
        <Button
          variant={view === "week" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("week")}
        >
          {t("admin.calendar.views.week")}
        </Button>
        <Button
          variant={view === "resource" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("resource")}
        >
          {t("admin.calendar.views.resource")}
        </Button>
        <Button
          variant={view === "month" ? "default" : "ghost"}
          size="sm"
          onClick={() => onViewChange("month")}
        >
          {t("admin.calendar.views.month")}
        </Button>
      </div>
    </div>
  );
}
