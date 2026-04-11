/**
 * Availability engine — pure logic for finding open slots and checking conflicts.
 * All date math uses Asia/Jerusalem timezone.
 */

import {
  startOfDay,
  endOfDay,
  addMinutes,
  isBefore,
  isAfter,
  isEqual,
  format,
  areIntervalsOverlapping,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type {
  AvailabilityRule,
  TimeOff,
  RoomBlock,
  ExistingBooking,
  ServiceInfo,
  AvailableSlot,
  BookingConflict,
} from "./types";

const SLOT_INCREMENT_MINUTES = 15;

const DAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Convert a Date to the Asia/Jerusalem weekday name used in our day_of_week enum.
 */
function getJerusalemDayName(date: Date): string {
  const zoned = toZonedTime(date, TZ);
  const day = zoned.getDay();
  return Object.entries(DAY_MAP).find(([, v]) => v === day)![0];
}

/**
 * Build a UTC Date from a date + time string interpreted in Jerusalem timezone.
 * Accepts both HH:MM and HH:MM:SS formats from the database.
 */
function timeToDate(date: Date, timeStr: string): Date {
  const zoned = toZonedTime(date, TZ);
  const dateStr = format(zoned, "yyyy-MM-dd");
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  return fromZonedTime(`${dateStr}T${normalizedTime}`, TZ);
}

/**
 * Merge overlapping or adjacent time windows into a minimal set.
 * Input must be sorted by start or this function sorts it.
 */
function mergeWindows(
  windows: Array<{ start: Date; end: Date }>
): Array<{ start: Date; end: Date }> {
  if (windows.length <= 1) return windows;

  const sorted = [...windows].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  const merged: Array<{ start: Date; end: Date }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    // Overlapping or adjacent: curr.start <= last.end
    if (curr.start.getTime() <= last.end.getTime()) {
      last.end = isAfter(curr.end, last.end) ? curr.end : last.end;
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Get availability windows for a therapist on a given date.
 * Returns merged intervals [start, end] as UTC Dates.
 */
export function getTherapistWindows(
  date: Date,
  rules: AvailabilityRule[],
  timeOffs: TimeOff[]
): Array<{ start: Date; end: Date }> {
  const dayName = getJerusalemDayName(date);
  const dateStr = format(toZonedTime(date, TZ), "yyyy-MM-dd");

  // Filter rules for this day of week and valid date range
  const dayRules = rules.filter((r) => {
    if (r.day_of_week !== dayName) return false;
    if (r.valid_from && dateStr < r.valid_from) return false;
    if (r.valid_until && dateStr > r.valid_until) return false;
    return true;
  });

  // Convert rules to time windows, then merge overlapping
  let windows = mergeWindows(
    dayRules.map((r) => ({
      start: timeToDate(date, r.start_time),
      end: timeToDate(date, r.end_time),
    }))
  );

  // Subtract time-off periods
  for (const off of timeOffs) {
    const offStart = new Date(off.start_at);
    const offEnd = new Date(off.end_at);
    windows = subtractInterval(windows, offStart, offEnd);
  }

  return windows;
}

/**
 * Subtract a single interval from a list of windows.
 */
function subtractInterval(
  windows: Array<{ start: Date; end: Date }>,
  removeStart: Date,
  removeEnd: Date
): Array<{ start: Date; end: Date }> {
  const result: Array<{ start: Date; end: Date }> = [];
  for (const w of windows) {
    if (!areIntervalsOverlapping(
      { start: w.start, end: w.end },
      { start: removeStart, end: removeEnd }
    )) {
      result.push(w);
      continue;
    }
    // Part before the removal
    if (isBefore(w.start, removeStart)) {
      result.push({ start: w.start, end: removeStart });
    }
    // Part after the removal
    if (isAfter(w.end, removeEnd)) {
      result.push({ start: removeEnd, end: w.end });
    }
  }
  return result;
}

/**
 * Check if an interval overlaps with any existing bookings (non-cancelled).
 */
function getOverlappingBookings(
  start: Date,
  end: Date,
  bookings: ExistingBooking[],
  filterField: "therapist_id" | "room_id",
  filterValue: string,
  excludeBookingId?: string
): ExistingBooking[] {
  return bookings.filter((b) => {
    if (b[filterField] !== filterValue) return false;
    if (b.status === "cancelled") return false;
    if (excludeBookingId && b.id === excludeBookingId) return false;
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    return areIntervalsOverlapping(
      { start, end },
      { start: bStart, end: bEnd }
    );
  });
}

/**
 * Check if a room is blocked during an interval.
 */
function getOverlappingRoomBlocks(
  start: Date,
  end: Date,
  roomId: string,
  blocks: RoomBlock[]
): RoomBlock[] {
  return blocks.filter((b) => {
    if (b.room_id !== roomId) return false;
    const bStart = new Date(b.start_at);
    const bEnd = new Date(b.end_at);
    return areIntervalsOverlapping(
      { start, end },
      { start: bStart, end: bEnd }
    );
  });
}

/**
 * Check if a proposed booking slot is fully contained in therapist availability windows.
 */
function isWithinWindows(
  start: Date,
  end: Date,
  windows: Array<{ start: Date; end: Date }>
): boolean {
  return windows.some(
    (w) =>
      (isEqual(start, w.start) || isAfter(start, w.start)) &&
      (isEqual(end, w.end) || isBefore(end, w.end))
  );
}

/**
 * Validate a proposed booking for conflicts.
 * Returns an empty array if the booking is valid.
 */
export function validateBookingSlot(params: {
  therapistId: string;
  roomId: string;
  serviceId: string;
  start: Date;
  end: Date;
  availabilityRules: AvailabilityRule[];
  timeOffs: TimeOff[];
  roomBlocks: RoomBlock[];
  existingBookings: ExistingBooking[];
  therapistServiceIds: string[];
  roomServiceIds: string[];
  excludeBookingId?: string;
}): BookingConflict[] {
  const conflicts: BookingConflict[] = [];

  // 1. Check therapist is qualified for service
  if (!params.therapistServiceIds.includes(params.serviceId)) {
    conflicts.push({
      type: "therapist_not_qualified",
      message: "Therapist is not qualified for this service",
    });
  }

  // 2. Check room is compatible with service
  if (!params.roomServiceIds.includes(params.serviceId)) {
    conflicts.push({
      type: "room_not_compatible",
      message: "Room is not compatible with this service",
    });
  }

  // 3. Check therapist availability windows
  const windows = getTherapistWindows(
    params.start,
    params.availabilityRules,
    params.timeOffs
  );
  if (!isWithinWindows(params.start, params.end, windows)) {
    // Distinguish: is it time-off or just not scheduled?
    const rawWindows = getTherapistWindows(params.start, params.availabilityRules, []);
    if (isWithinWindows(params.start, params.end, rawWindows)) {
      conflicts.push({
        type: "therapist_time_off",
        message: "Therapist has time off during this period",
      });
    } else {
      conflicts.push({
        type: "therapist_unavailable",
        message: "Therapist is not available at this time",
      });
    }
  }

  // 4. Check room blocks
  const roomBlockOverlaps = getOverlappingRoomBlocks(
    params.start,
    params.end,
    params.roomId,
    params.roomBlocks
  );
  if (roomBlockOverlaps.length > 0) {
    conflicts.push({
      type: "room_blocked",
      message: "Room is blocked during this period",
    });
  }

  // 5. Check therapist double-booking
  const therapistOverlaps = getOverlappingBookings(
    params.start,
    params.end,
    params.existingBookings,
    "therapist_id",
    params.therapistId,
    params.excludeBookingId
  );
  if (therapistOverlaps.length > 0) {
    conflicts.push({
      type: "therapist_overlap",
      message: "Therapist already has a booking during this time",
    });
  }

  // 6. Check room double-booking
  const roomOverlaps = getOverlappingBookings(
    params.start,
    params.end,
    params.existingBookings,
    "room_id",
    params.roomId,
    params.excludeBookingId
  );
  if (roomOverlaps.length > 0) {
    conflicts.push({
      type: "room_overlap",
      message: "Room already has a booking during this time",
    });
  }

  return conflicts;
}

/**
 * Find available slots for a service on a given date.
 * Optionally filter by a specific therapist.
 */
export function findAvailableSlots(params: {
  date: Date;
  service: ServiceInfo;
  therapists: Array<{
    id: string;
    full_name: string;
    color: string | null;
    availabilityRules: AvailabilityRule[];
    timeOffs: TimeOff[];
    serviceIds: string[];
  }>;
  rooms: Array<{
    id: string;
    name: string;
    serviceIds: string[];
    blocks: RoomBlock[];
  }>;
  existingBookings: ExistingBooking[];
  filterTherapistId?: string;
}): AvailableSlot[] {
  const { date, service, therapists, rooms, existingBookings, filterTherapistId } = params;
  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const slots: AvailableSlot[] = [];

  // Filter therapists who can perform this service
  const qualifiedTherapists = therapists.filter((t) => {
    if (filterTherapistId && t.id !== filterTherapistId) return false;
    return t.serviceIds.includes(service.id);
  });

  // Filter rooms compatible with this service
  const compatibleRooms = rooms.filter((r) =>
    r.serviceIds.includes(service.id)
  );

  for (const therapist of qualifiedTherapists) {
    const windows = getTherapistWindows(
      date,
      therapist.availabilityRules,
      therapist.timeOffs
    );

    for (const window of windows) {
      let slotStart = window.start;

      while (true) {
        const slotEnd = addMinutes(slotStart, totalMinutes);
        if (isAfter(slotEnd, window.end)) break;

        // Check therapist not double-booked
        const therapistFree =
          getOverlappingBookings(
            slotStart,
            slotEnd,
            existingBookings,
            "therapist_id",
            therapist.id
          ).length === 0;

        if (therapistFree) {
          // Find a compatible room that's free
          for (const room of compatibleRooms) {
            const roomFree =
              getOverlappingBookings(
                slotStart,
                slotEnd,
                existingBookings,
                "room_id",
                room.id
              ).length === 0;

            const roomNotBlocked =
              getOverlappingRoomBlocks(slotStart, slotEnd, room.id, room.blocks)
                .length === 0;

            if (roomFree && roomNotBlocked) {
              slots.push({
                start: slotStart,
                end: addMinutes(slotStart, service.duration_minutes), // end = actual service end (no buffer)
                therapist_id: therapist.id,
                therapist_name: therapist.full_name,
                therapist_color: therapist.color,
                room_id: room.id,
                room_name: room.name,
              });
              break; // One room per therapist/slot combo is enough
            }
          }
        }

        slotStart = addMinutes(slotStart, SLOT_INCREMENT_MINUTES);
      }
    }
  }

  // Sort by start time, then therapist name
  slots.sort((a, b) => {
    const timeDiff = a.start.getTime() - b.start.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.therapist_name.localeCompare(b.therapist_name);
  });

  return slots;
}
