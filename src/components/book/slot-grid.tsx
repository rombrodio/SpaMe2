"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { he, formatTimeIL } from "@/lib/i18n/he";
import type { PublicSlot, GenderPreference } from "@/lib/actions/book";

interface SlotGridProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  genderPreference: GenderPreference;
  onGenderPreferenceChange: (g: GenderPreference) => void;
  slots: PublicSlot[];
  loading: boolean;
  onPick: (slot: PublicSlot) => void;
}

export function SlotGrid({
  selectedDate,
  onDateChange,
  genderPreference,
  onGenderPreferenceChange,
  slots,
  loading,
  onPick,
}: SlotGridProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="slot-date" className="text-sm">
          {he.book.stepSlot.dateLabel}
        </Label>
        <Input
          id="slot-date"
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="mt-1"
        />
      </div>

      <GenderToggle value={genderPreference} onChange={onGenderPreferenceChange} />

      {loading && (
        <div className="py-6 text-center text-stone-600">
          {he.common.loading}
        </div>
      )}

      {!loading && slots.length === 0 && (
        <div className="rounded-md border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">
          {he.book.stepSlot.noSlots}
        </div>
      )}

      {!loading && slots.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium text-stone-700">
            {he.book.stepSlot.timesHeading}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <button
                key={s.start}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-md border border-stone-200 bg-white px-2 py-2 text-sm font-medium tabular-nums transition-colors hover:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
              >
                {formatTimeIL(s.start)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GenderToggle({
  value,
  onChange,
}: {
  value: GenderPreference;
  onChange: (g: GenderPreference) => void;
}) {
  const options: Array<{ id: GenderPreference; label: string }> = [
    { id: "any", label: he.book.stepSlot.gender.any },
    { id: "female", label: he.book.stepSlot.gender.female },
    { id: "male", label: he.book.stepSlot.gender.male },
  ];
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-stone-700">
        {he.book.stepSlot.gender.heading}
      </legend>
      <div
        role="radiogroup"
        className="inline-flex overflow-hidden rounded-md border border-stone-200 bg-white"
      >
        {options.map((opt, idx) => (
          <label
            key={opt.id}
            className={`cursor-pointer px-4 py-2 text-sm transition-colors ${
              idx > 0 ? "border-s border-stone-200" : ""
            } ${
              value === opt.id
                ? "bg-stone-900 text-white"
                : "hover:bg-stone-50"
            }`}
          >
            <input
              type="radio"
              name="gender_preference"
              value={opt.id}
              checked={value === opt.id}
              onChange={() => onChange(opt.id)}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
