/**
 * Availability engine — pure logic for finding open slots and checking conflicts.
 * All date math uses Asia/Jerusalem timezone.
 */

import {
  addMinutes,
  isBefore,
  isAfter,
  isEqual,
  format,
  areIntervalsOverlapping,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { canPlaceAll, type MatcherBooking } from "./matcher";
import type {
  AvailabilityRule,
  TimeOff,
  RoomBlock,
  ExistingBooking,
  ServiceInfo,
  AvailableSlot,
  BookingConflict,
} from "./types";

/**
 * Paid-but-unassigned booking that still needs a therapist. The caller
 * pre-computes eligibility (skill + gender + availability + confirmed-
 * conflict filter) because it has the full data at hand; this module
 * stays a pure scheduling kernel that just consumes the result.
 */
export interface UnassignedBookingForMatcher {
  id: string;
  start_at: string;
  end_at: string;
  eligibleTherapistIds: readonly string[];
}

/**
 * Legacy default — kept only so tests that don't pass `spaSettings`
 * still produce a deterministic grid. Real runtime resolves granularity
 * via spa_settings.slot_granularity_minutes.
 */
const DEFAULT_SLOT_INCREMENT_MINUTES = 15;

/** Runtime-effective spa settings the slot engine reads. */
export interface SpaSettingsForEngine {
  /** HH:MM */
  businessHoursStart: string;
  /** HH:MM */
  businessHoursEnd: string;
  /** 15, 30, or 60 */
  slotGranularityMinutes: number;
}

/**
 * Round a Date up to the next multiple of `mins` minutes. If `date` already
 * sits on a boundary, it is returned unchanged.
 *
 * Israel timezone offsets are whole hours (UTC+2 / UTC+3), so snapping in UTC
 * is equivalent to snapping in Asia/Jerusalem local time.
 */
function ceilToMinuteBoundary(date: Date, mins: number): Date {
  const step = mins * 60 * 1000;
  const ms = date.getTime();
  const remainder = ms % step;
  return remainder === 0 ? date : new Date(ms + (step - remainder));
}

/**
 * Clip each availability window to the business-hours bounds for the same
 * calendar day. Windows fully outside [businessStart, businessEnd] are
 * dropped. Used in `findAvailableSlots` so a therapist rule like 07:00–22:00
 * collapses to the spa-wide 09:00–21:00 window.
 */
function clipWindowsToBusinessHours(
  date: Date,
  windows: Array<{ start: Date; end: Date }>,
  businessHoursStart: string,
  businessHoursEnd: string
): Array<{ start: Date; end: Date }> {
  const bizStart = timeToDate(date, businessHoursStart);
  const bizEnd = timeToDate(date, businessHoursEnd);
  const clipped: Array<{ start: Date; end: Date }> = [];
  for (const w of windows) {
    const start = isAfter(w.start, bizStart) ? w.start : bizStart;
    const endD = isBefore(w.end, bizEnd) ? w.end : bizEnd;
    if (isBefore(start, endD)) {
      clipped.push({ start, end: endD });
    }
  }
  return clipped;
}

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
 *
 * When `unassignedBookingsForMatcher` is supplied, the final check runs
 * the exact matching solver: is there a valid therapist assignment for
 * (every unassigned booking in the day) + (this new booking pinned to
 * `therapistId`)? If not, a `capacity_blocked_unassigned` conflict is
 * surfaced so the admin knows picking this therapist would strand a
 * paid-but-unassigned booking.
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
  unassignedBookingsForMatcher?: readonly UnassignedBookingForMatcher[];
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

  // 7. Capacity gate for paid-but-unassigned bookings.
  //
  // Only run the matcher when there are no other conflicts — the simpler
  // failure modes are more actionable for the caller. And only when the
  // caller actually passed an unassigned pool; omitted = legacy caller.
  if (
    conflicts.length === 0 &&
    params.unassignedBookingsForMatcher &&
    params.unassignedBookingsForMatcher.length > 0
  ) {
    const matcherInput: MatcherBooking[] = [
      ...params.unassignedBookingsForMatcher
        .filter((u) => u.id !== params.excludeBookingId)
        .map((u) => ({
          id: u.id,
          start: new Date(u.start_at),
          end: new Date(u.end_at),
          eligibleTherapistIds: u.eligibleTherapistIds,
        })),
      {
        id: "__validate_new__",
        start: params.start,
        end: params.end,
        eligibleTherapistIds: [params.therapistId],
      },
    ];
    if (!canPlaceAll(matcherInput)) {
      conflicts.push({
        type: "capacity_blocked_unassigned",
        message:
          "Assigning this therapist would leave a paid-but-unassigned booking unfillable. Reassign that booking first or pick a different therapist.",
      });
    }
  }

  return conflicts;
}

/**
 * Find available slots for a service on a given date.
 * Optionally filter by a specific therapist.
 *
 * When `unassignedBookings` is supplied (phase 5 deferred-assignment),
 * every candidate `(therapist, time)` pair is gated through the exact
 * list-coloring matcher: the pair is emitted only if there's a valid
 * way to assign the hypothetical new booking + every paid-but-
 * unassigned booking already on the day without double-booking anyone.
 * This prevents the engine from offering a slot that a specific
 * therapist can "take" only by stealing them from an unassigned
 * neighbour.
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
  /**
   * Paid-but-unassigned bookings on this day, with eligibility pre-
   * computed by the caller. When omitted or empty the matcher gate is
   * skipped and this function reduces to the pre-phase-5 behaviour.
   */
  unassignedBookings?: readonly UnassignedBookingForMatcher[];
  filterTherapistId?: string;
  /**
   * Earliest Date a slot is allowed to start at. Slots whose start is
   * strictly before `minStart` are skipped. Undefined = no minimum
   * (admin flow preserves the ability to create retro-active bookings).
   * The customer-facing /book flow passes `now + lead-time` here so
   * past and near-future slots don't appear on "today".
   */
  minStart?: Date;
  /**
   * Spa-wide config: the outer business-hours window and the granularity
   * at which slot starts are emitted. When omitted, defaults are used
   * (09:00–21:00, 15 min) so existing tests keep working.
   */
  spaSettings?: SpaSettingsForEngine;
}): AvailableSlot[] {
  const {
    date,
    service,
    therapists,
    rooms,
    existingBookings,
    unassignedBookings,
    filterTherapistId,
    minStart,
    spaSettings,
  } = params;
  const totalMinutes = service.duration_minutes + service.buffer_minutes;
  const slots: AvailableSlot[] = [];
  const slotStepMinutes =
    spaSettings?.slotGranularityMinutes ?? DEFAULT_SLOT_INCREMENT_MINUTES;

  // Filter therapists who can perform this service
  const qualifiedTherapists = therapists.filter((t) => {
    if (filterTherapistId && t.id !== filterTherapistId) return false;
    return t.serviceIds.includes(service.id);
  });

  // Filter rooms compatible with this service
  const compatibleRooms = rooms.filter((r) =>
    r.serviceIds.includes(service.id)
  );

  // Pre-materialise the matcher's "fixed" bookings once per call so we
  // don't rebuild the unassigned-booking MatcherBooking array on every
  // (therapist, time) iteration.
  const matcherFixed: MatcherBooking[] =
    unassignedBookings && unassignedBookings.length > 0
      ? unassignedBookings.map((u) => ({
          id: u.id,
          start: new Date(u.start_at),
          end: new Date(u.end_at),
          eligibleTherapistIds: u.eligibleTherapistIds,
        }))
      : [];

  for (const therapist of qualifiedTherapists) {
    let windows = getTherapistWindows(
      date,
      therapist.availabilityRules,
      therapist.timeOffs
    );

    // Phase 4.6: clip therapist windows to the spa-wide business hours
    // so a rule ending at 22:00 can't emit slots past the spa's closing
    // time. When no spaSettings is supplied we skip the clip to preserve
    // the pre-4.6 test behaviour.
    if (spaSettings) {
      windows = clipWindowsToBusinessHours(
        date,
        windows,
        spaSettings.businessHoursStart,
        spaSettings.businessHoursEnd
      );
    }

    for (const window of windows) {
      // DEF-006 + Phase 4.6: snap the first candidate start up to the
      // configured granularity so a 60-min grid emits 09:00, 10:00, ...
      // and a 15-min grid emits 09:00, 09:15, ... regardless of the
      // raw rule start time.
      let slotStart = ceilToMinuteBoundary(window.start, slotStepMinutes);

      while (true) {
        const slotEnd = addMinutes(slotStart, totalMinutes);
        if (isAfter(slotEnd, window.end)) break;

        // Skip slots that start before the caller-specified minimum.
        // Used by /book to hide past + near-future times on "today".
        if (minStart && isBefore(slotStart, minStart)) {
          slotStart = addMinutes(slotStart, slotStepMinutes);
          continue;
        }

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
              // Matcher gate — only reached when the classic checks pass.
              if (matcherFixed.length > 0) {
                const matcherInput: MatcherBooking[] = [
                  ...matcherFixed,
                  {
                    id: "__candidate_new__",
                    start: slotStart,
                    end: slotEnd,
                    eligibleTherapistIds: [therapist.id],
                  },
                ];
                if (!canPlaceAll(matcherInput)) {
                  // Pinning this therapist here strands an unassigned
                  // booking — don't offer the slot.
                  break;
                }
              }

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

        slotStart = addMinutes(slotStart, slotStepMinutes);
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
