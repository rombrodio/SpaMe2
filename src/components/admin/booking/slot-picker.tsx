"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  findAvailableSlotsAction,
  getServiceConstraints,
} from "@/lib/actions/bookings";

export interface SlotPickerSelection {
  start: string;
  therapist_id: string;
  room_id: string;
}

interface SerializedSlot {
  start: string;
  end: string;
  therapist_id: string;
  therapist_name: string;
  therapist_color: string | null;
  room_id: string;
  room_name: string;
}

interface TherapistOpt {
  id: string;
  full_name: string;
}

interface RoomOpt {
  id: string;
  name: string;
}

export interface SlotPickerProps {
  serviceId: string;
  /** Full list of active therapists — picker filters to those qualified. */
  therapists: TherapistOpt[];
  /** Full list of active rooms — picker filters to those compatible. */
  rooms: RoomOpt[];
  /** Initial therapist/room/date to pre-select. */
  initialTherapistId?: string;
  initialRoomId?: string;
  initialDate?: string;
  /** Exclude a booking from availability (e.g. the one being rescheduled). */
  excludeBookingId?: string;
  /** Fires whenever the user picks a slot + therapist + room. */
  onChange?: (selection: SlotPickerSelection | null) => void;
}

/**
 * Slot-picker used by both the New Booking form (eventually) and the
 * Reschedule dialog. Gates therapist/room dropdowns on serviceId, prevents
 * illegal pairs by re-filtering after each change.
 */
export function SlotPicker({
  serviceId,
  therapists,
  rooms,
  initialTherapistId = "",
  initialRoomId = "",
  initialDate,
  excludeBookingId,
  onChange,
}: SlotPickerProps) {
  const [date, setDate] = useState(
    initialDate ?? format(new Date(), "yyyy-MM-dd")
  );
  const [therapistId, setTherapistId] = useState(initialTherapistId);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [qualifiedTherapistIds, setQualifiedTherapistIds] = useState<string[]>(
    []
  );
  const [compatibleRoomIds, setCompatibleRoomIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<SerializedSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedStart, setSelectedStart] = useState("");

  // Fetch qualified therapists + compatible rooms when service changes.
  useEffect(() => {
    if (!serviceId) {
      setQualifiedTherapistIds([]);
      setCompatibleRoomIds([]);
      return;
    }
    let cancelled = false;
    getServiceConstraints(serviceId).then(({ therapistIds, roomIds }) => {
      if (cancelled) return;
      setQualifiedTherapistIds(therapistIds);
      setCompatibleRoomIds(roomIds);
      setTherapistId((prev) => (therapistIds.includes(prev) ? prev : ""));
      setRoomId((prev) => (roomIds.includes(prev) ? prev : ""));
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  // Re-compute slots when service/date/therapist change.
  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    findAvailableSlotsAction(serviceId, date, therapistId || undefined)
      .then((result) => {
        if (cancelled) return;
        setSlots(
          excludeBookingId
            ? result.filter((s) => s.start !== excludeBookingId)
            : result
        );
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // excludeBookingId intentionally not a dep: id is stable per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, date, therapistId]);

  function emitChange(next: SlotPickerSelection | null) {
    onChange?.(next);
  }

  function handleSlotClick(slot: SerializedSlot) {
    setSelectedStart(slot.start);
    // Auto-fill therapist/room if the user hadn't chosen them explicitly.
    const newTherapistId = therapistId || slot.therapist_id;
    const newRoomId = roomId || slot.room_id;
    if (!therapistId) setTherapistId(slot.therapist_id);
    if (!roomId) setRoomId(slot.room_id);
    emitChange({
      start: slot.start,
      therapist_id: newTherapistId,
      room_id: newRoomId,
    });
  }

  const qualifiedTherapists = therapists.filter((t) =>
    qualifiedTherapistIds.includes(t.id)
  );
  const compatibleRooms = rooms.filter((r) =>
    compatibleRoomIds.includes(r.id)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="slot-picker-date">Date</Label>
          <Input
            id="slot-picker-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedStart("");
              emitChange(null);
            }}
          />
        </div>
        <div>
          <Label htmlFor="slot-picker-therapist">Therapist</Label>
          <Select
            id="slot-picker-therapist"
            value={therapistId}
            onChange={(e) => {
              setTherapistId(e.target.value);
              setSelectedStart("");
              emitChange(null);
            }}
          >
            <option value="">Any qualified therapist</option>
            {qualifiedTherapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="slot-picker-room">Room</Label>
          <Select
            id="slot-picker-room"
            value={roomId}
            onChange={(e) => {
              setRoomId(e.target.value);
              setSelectedStart("");
              emitChange(
                selectedStart
                  ? {
                      start: selectedStart,
                      therapist_id: therapistId,
                      room_id: e.target.value,
                    }
                  : null
              );
            }}
          >
            <option value="">Any compatible room</option>
            {compatibleRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label>Available slots</Label>
        {slotsLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading slots…</p>
        ) : slots.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No available slots on this date.{" "}
            {!therapistId && "Pick a specific therapist to see more."}
          </p>
        ) : (
          <div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {slots.map((slot, i) => {
              const slotLabel = format(new Date(slot.start), "HH:mm");
              const isSelected = selectedStart === slot.start;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSlotClick(slot)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  <div className="font-medium">{slotLabel}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {slot.therapist_name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {slot.room_name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
