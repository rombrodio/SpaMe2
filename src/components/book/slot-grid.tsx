"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  he,
  formatTimeIL,
} from "@/lib/i18n/he";
import type { PublicSlot } from "@/lib/actions/book";

interface SlotGridProps {
  serviceId: string;
  selectedDate: string;
  onDateChange: (date: string) => void;
  slots: PublicSlot[];
  loading: boolean;
  onPick: (slot: PublicSlot) => void;
}

export function SlotGrid({
  selectedDate,
  onDateChange,
  slots,
  loading,
  onPick,
}: SlotGridProps) {
  // Group slots by therapist for a cleaner Hebrew layout.
  const byTherapist = new Map<string, PublicSlot[]>();
  for (const s of slots) {
    const list = byTherapist.get(s.therapist_id) ?? [];
    list.push(s);
    byTherapist.set(s.therapist_id, list);
  }

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
        <div className="space-y-4">
          {[...byTherapist.entries()].map(([tid, tslots]) => {
            const name = tslots[0].therapist_name;
            const color = tslots[0].therapist_color ?? "#888";
            return (
              <div key={tid}>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-stone-700">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {name}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {tslots.map((s) => (
                    <button
                      key={`${s.therapist_id}-${s.start}`}
                      type="button"
                      onClick={() => onPick(s)}
                      className="rounded-md border border-stone-200 bg-white px-2 py-2 text-sm font-medium tabular-nums transition-colors hover:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                    >
                      {formatTimeIL(s.start)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
