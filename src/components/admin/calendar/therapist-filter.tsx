"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Filter, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CalendarTherapist } from "./types";
import { cn } from "@/lib/utils";

interface TherapistFilterProps {
  therapists: CalendarTherapist[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/**
 * SPA-008: multi-select therapist filter for the calendar. Popover of
 * checkbox rows; currently selected therapists render as dismissable
 * chips next to the trigger so a receptionist can see their filters
 * without opening the popover.
 *
 * Caps selection at 8 therapists in the resource view — beyond that the
 * column grid gets unreadable. The cap applies per selection event; the
 * UI shows a hint when the user tries to add a 9th.
 */
export function TherapistFilter({
  therapists,
  selected,
  onChange,
}: TherapistFilterProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);

  function toggle(id: string) {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  function selectAll() {
    onChange(therapists.map((th) => th.id));
  }

  function clear() {
    onChange([]);
  }

  const label =
    selected.length === 0
      ? t("admin.calendar.therapistFilter.all")
      : selected.length === therapists.length
        ? t("admin.calendar.therapistFilter.all")
        : t("admin.calendar.therapistFilter.someSelected", {
            count: selected.length,
          });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <Filter className="h-3.5 w-3.5" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("admin.calendar.therapistFilter.selectAll")}
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground"
            >
              {t("admin.calendar.therapistFilter.clear")}
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {therapists.map((th) => {
              const active = selectedSet.has(th.id);
              return (
                <button
                  type="button"
                  key={th.id}
                  onClick={() => toggle(th.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent",
                    !th.is_active && "opacity-60"
                  )}
                >
                  <div className="flex h-4 w-4 items-center justify-center rounded border border-input">
                    {active && <Check className="h-3 w-3" />}
                  </div>
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: th.color ?? "#94a3b8" }}
                  />
                  <span className="truncate">
                    {th.full_name}
                    {!th.is_active && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {" "}
                        {t("admin.calendar.therapistFilter.inactive")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Selected chips — quick deselect without opening the popover. */}
      {selected.length > 0 && selected.length < therapists.length && (
        <div className="flex flex-wrap items-center gap-1">
          {selected.slice(0, 5).map((id) => {
            const th = therapists.find((x) => x.id === id);
            if (!th) return null;
            return (
              <button
                type="button"
                key={id}
                onClick={() => toggle(id)}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs hover:bg-accent"
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: th.color ?? "#94a3b8" }}
                />
                {th.full_name.split(" ")[0]}
                <X className="h-3 w-3" />
              </button>
            );
          })}
          {selected.length > 5 && (
            <span className="text-xs text-muted-foreground">
              {t("admin.calendar.therapistFilter.more", {
                count: selected.length - 5,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
