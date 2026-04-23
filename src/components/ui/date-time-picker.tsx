"use client";

import { useMemo, useState } from "react";
import { format, parse } from "date-fns";
import { Input } from "@/components/ui/input";

interface DateTimePickerProps {
  /**
   * Name of the hidden input submitted with the form. The value is the
   * combined `YYYY-MM-DDTHH:MM` string in local (browser) time — matching
   * the output of a native <input type="datetime-local">.
   */
  name: string;
  /** Initial value (same format as `datetime-local`), or undefined. */
  defaultValue?: string;
  /** Passed through to both pickers. */
  required?: boolean;
  /** Additional classes on the outer wrapper. */
  className?: string;
  /** Earliest date allowed (YYYY-MM-DD). */
  minDate?: string;
  /** Granularity of the time picker in minutes. Default 15. */
  stepMinutes?: number;
}

/**
 * DEF-013: replaces native `<input type="datetime-local">` which renders
 * wildly differently across Chrome/Firefox/Safari/iOS. Splits into a date
 * + time pair — both of those individually have consistent UX — and a
 * hidden combined input so form submission is unchanged.
 */
export function DateTimePicker({
  name,
  defaultValue,
  required,
  className,
  minDate,
  stepMinutes = 15,
}: DateTimePickerProps) {
  const parsed = useMemo(() => {
    if (!defaultValue) return { date: "", time: "" };
    const [d, t] = defaultValue.split("T");
    return { date: d ?? "", time: (t ?? "").slice(0, 5) };
  }, [defaultValue]);

  const [date, setDate] = useState(parsed.date);
  const [time, setTime] = useState(parsed.time);

  // Derive the combined value synchronously from the two pickers — avoids
  // the `set-state-in-effect` pitfall and guarantees the hidden input is
  // always in sync on render.
  const combined = useMemo(() => {
    if (!date || !time) return "";
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    let snappedTime = time;
    if (match && stepMinutes > 1) {
      const h = Number(match[1]);
      const m = Number(match[2]);
      const snapped = Math.round(m / stepMinutes) * stepMinutes;
      const carry = snapped === 60 ? 1 : 0;
      snappedTime = `${String((h + carry) % 24).padStart(2, "0")}:${String(
        snapped % 60
      ).padStart(2, "0")}`;
    }
    return `${date}T${snappedTime}`;
  }, [date, time, stepMinutes]);

  // Nice human-readable preview (e.g. "Thu Apr 24, 14:30"). Helps confirm
  // the parsed value on browsers where the native input reads oddly.
  const preview = useMemo(() => {
    if (!combined) return "";
    try {
      const d = parse(combined, "yyyy-MM-dd'T'HH:mm", new Date());
      return format(d, "EEE MMM d, HH:mm");
    } catch {
      return "";
    }
  }, [combined]);

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          min={minDate}
          required={required}
          aria-label={`${name} — date`}
        />
        <Input
          type="time"
          step={stepMinutes * 60}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required={required}
          aria-label={`${name} — time`}
        />
      </div>
      <input type="hidden" name={name} value={combined} />
      {preview && (
        <p className="mt-1 text-xs text-muted-foreground">{preview}</p>
      )}
    </div>
  );
}
