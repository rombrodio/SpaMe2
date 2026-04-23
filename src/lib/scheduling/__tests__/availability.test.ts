import { describe, it, expect } from "vitest";
import {
  validateBookingSlot,
  findAvailableSlots,
  getTherapistWindows,
} from "../availability";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type {
  AvailabilityRule,
  TimeOff,
  RoomBlock,
  ExistingBooking,
} from "../types";

// Helpers — all dates created in Jerusalem timezone for consistency
function makeDate(dateStr: string, time: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, TZ);
}

/** Get hours in Jerusalem timezone from a UTC date. */
function getJerusalemHours(date: Date): number {
  return toZonedTime(date, TZ).getHours();
}

function makeRule(overrides: Partial<AvailabilityRule> = {}): AvailabilityRule {
  return {
    id: "rule-1",
    therapist_id: "therapist-1",
    day_of_week: "wednesday", // 2025-01-01 is a Wednesday
    start_time: "09:00",
    end_time: "17:00",
    valid_from: "2025-01-01",
    valid_until: null,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<ExistingBooking> = {}): ExistingBooking {
  return {
    id: "booking-1",
    therapist_id: "therapist-1",
    room_id: "room-1",
    service_id: "service-1",
    start_at: makeDate("2025-01-01", "10:00").toISOString(),
    end_at: makeDate("2025-01-01", "11:00").toISOString(),
    status: "confirmed",
    ...overrides,
  };
}

// ─── getTherapistWindows ───

describe("getTherapistWindows", () => {
  it("returns windows for matching day and valid date range", () => {
    const date = makeDate("2025-01-01", "12:00"); // Wednesday
    const rules = [makeRule()];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });

  it("returns empty for non-matching day", () => {
    const date = makeDate("2025-01-02", "12:00"); // Thursday
    const rules = [makeRule()]; // rule is for Wednesday
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(0);
  });

  it("returns empty if date is before valid_from", () => {
    // 2024-12-31 is a Tuesday
    const date = makeDate("2024-12-31", "12:00");
    const rule = makeRule({ day_of_week: "tuesday", valid_from: "2025-01-01" });
    const windows = getTherapistWindows(date, [rule], []);
    expect(windows).toHaveLength(0);
  });

  it("subtracts time-off periods from windows", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [makeRule()]; // 09:00–17:00
    const timeOffs: TimeOff[] = [
      {
        id: "off-1",
        therapist_id: "therapist-1",
        start_at: makeDate("2025-01-01", "12:00").toISOString(),
        end_at: makeDate("2025-01-01", "14:00").toISOString(),
      },
    ];
    const windows = getTherapistWindows(date, rules, timeOffs);
    expect(windows).toHaveLength(2);
    // First window: 09:00–12:00
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(12);
    // Second window: 14:00–17:00
    expect(getJerusalemHours(windows[1].start)).toBe(14);
    expect(getJerusalemHours(windows[1].end)).toBe(17);
  });

  it("merges overlapping availability rules", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [
      makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
      makeRule({ id: "r2", start_time: "11:00", end_time: "17:00" }),
    ];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });

  it("merges adjacent availability rules", () => {
    const date = makeDate("2025-01-01", "12:00");
    const rules = [
      makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
      makeRule({ id: "r2", start_time: "13:00", end_time: "17:00" }),
    ];
    const windows = getTherapistWindows(date, rules, []);
    expect(windows).toHaveLength(1);
    expect(getJerusalemHours(windows[0].start)).toBe(9);
    expect(getJerusalemHours(windows[0].end)).toBe(17);
  });
});

// ─── validateBookingSlot ───

describe("validateBookingSlot", () => {
  const baseParams = {
    therapistId: "therapist-1",
    roomId: "room-1",
    serviceId: "service-1",
    start: makeDate("2025-01-01", "10:00"),
    end: makeDate("2025-01-01", "11:00"),
    availabilityRules: [makeRule()],
    timeOffs: [] as TimeOff[],
    roomBlocks: [] as RoomBlock[],
    existingBookings: [] as ExistingBooking[],
    therapistServiceIds: ["service-1"],
    roomServiceIds: ["service-1"],
  };

  it("returns no conflicts for a valid booking", () => {
    const conflicts = validateBookingSlot(baseParams);
    expect(conflicts).toHaveLength(0);
  });

  it("detects therapist not qualified for service", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      therapistServiceIds: ["service-other"],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("therapist_not_qualified");
  });

  it("detects room not compatible with service", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      roomServiceIds: ["service-other"],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("room_not_compatible");
  });

  it("detects therapist unavailable (outside availability window)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "07:00"),
      end: makeDate("2025-01-01", "08:00"),
    });
    const unavailable = conflicts.find(
      (c) => c.type === "therapist_unavailable"
    );
    expect(unavailable).toBeDefined();
  });

  it("detects therapist time off", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      timeOffs: [
        {
          id: "off-1",
          therapist_id: "therapist-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "12:00").toISOString(),
        },
      ],
    });
    const timeOff = conflicts.find((c) => c.type === "therapist_time_off");
    expect(timeOff).toBeDefined();
  });

  it("detects room blocked", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      roomBlocks: [
        {
          id: "block-1",
          room_id: "room-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "12:00").toISOString(),
        },
      ],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("room_blocked");
  });

  // ─── Double-booking prevention ───

  it("detects therapist double-booking (exact overlap)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking()],
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("detects therapist double-booking (partial overlap - start inside existing)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "10:30"),
      end: makeDate("2025-01-01", "11:30"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("detects therapist double-booking (new booking contains existing)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "09:30"),
      end: makeDate("2025-01-01", "11:30"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeDefined();
  });

  it("allows adjacent bookings (no overlap)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "11:00"),
      end: makeDate("2025-01-01", "12:00"),
      existingBookings: [makeBooking()], // 10:00–11:00
    });
    const overlap = conflicts.find((c) => c.type === "therapist_overlap");
    expect(overlap).toBeUndefined();
  });

  it("detects room double-booking", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [
        makeBooking({ therapist_id: "therapist-other" }), // different therapist, same room
      ],
    });
    const overlap = conflicts.find((c) => c.type === "room_overlap");
    expect(overlap).toBeDefined();
  });

  it("ignores cancelled bookings for overlap checks", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking({ status: "cancelled" })],
    });
    const overlap = conflicts.find(
      (c) => c.type === "therapist_overlap" || c.type === "room_overlap"
    );
    expect(overlap).toBeUndefined();
  });

  it("excludes specified booking from overlap checks (for reschedule)", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      existingBookings: [makeBooking()],
      excludeBookingId: "booking-1",
    });
    const overlap = conflicts.find(
      (c) => c.type === "therapist_overlap" || c.type === "room_overlap"
    );
    expect(overlap).toBeUndefined();
  });

  it("detects multiple conflicts at once", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      therapistServiceIds: ["service-other"],
      roomServiceIds: ["service-other"],
      start: makeDate("2025-01-01", "07:00"),
      end: makeDate("2025-01-01", "08:00"),
    });
    // Should report: therapist_not_qualified, room_not_compatible, therapist_unavailable
    expect(conflicts.length).toBeGreaterThanOrEqual(3);
  });

  it("allows booking spanning merged overlapping windows", () => {
    const conflicts = validateBookingSlot({
      ...baseParams,
      start: makeDate("2025-01-01", "09:00"),
      end: makeDate("2025-01-01", "15:00"),
      availabilityRules: [
        makeRule({ id: "r1", start_time: "09:00", end_time: "13:00" }),
        makeRule({ id: "r2", start_time: "11:00", end_time: "17:00" }),
      ],
    });
    const unavailable = conflicts.find(
      (c) => c.type === "therapist_unavailable"
    );
    expect(unavailable).toBeUndefined();
  });
});

// ─── findAvailableSlots ───

describe("findAvailableSlots", () => {
  const service = {
    id: "service-1",
    name: "Massage",
    duration_minutes: 60,
    buffer_minutes: 15,
    price_ils: 30000,
  };

  const therapist = {
    id: "therapist-1",
    full_name: "Alice",
    color: "#ff0000",
    availabilityRules: [makeRule()],
    timeOffs: [] as TimeOff[],
    serviceIds: ["service-1"],
  };

  const room = {
    id: "room-1",
    name: "Room A",
    serviceIds: ["service-1"],
    blocks: [] as RoomBlock[],
  };

  it("returns slots for a day with availability", () => {
    const date = makeDate("2025-01-01", "12:00"); // Wednesday
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots.length).toBeGreaterThan(0);
    // Slots should be within 09:00–17:00 Jerusalem time
    for (const slot of slots) {
      const h = getJerusalemHours(slot.start);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(17);
    }
  });

  it("minStart hides past + near-future slots", () => {
    // The availability rule window is 09:00–17:00 Jerusalem time.
    // Setting minStart to 13:00 should hide every 09:00–12:45 grid
    // slot and leave the 13:00+ slots intact.
    const date = makeDate("2025-01-01", "12:00");
    const minStart = makeDate("2025-01-01", "13:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
      minStart,
    });
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThanOrEqual(
        minStart.getTime()
      );
    }
    // Sanity: without minStart we would have gotten slots starting
    // at 09:00. With the filter, none do.
    const earliest = slots.reduce(
      (min, s) => (s.start < min ? s.start : min),
      slots[0].start
    );
    expect(getJerusalemHours(earliest)).toBeGreaterThanOrEqual(13);
  });

  it("minStart of a day's end returns zero slots", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
      minStart: makeDate("2025-01-01", "23:59"),
    });
    expect(slots).toHaveLength(0);
  });

  it("skips slots that overlap with existing bookings", () => {
    const date = makeDate("2025-01-01", "12:00");
    const existingBookings: ExistingBooking[] = [
      makeBooking({
        start_at: makeDate("2025-01-01", "10:00").toISOString(),
        end_at: makeDate("2025-01-01", "11:15").toISOString(),
      }),
    ];
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings,
    });
    // No slot should overlap with the 10:00–11:15 booking
    for (const slot of slots) {
      const zoned = toZonedTime(slot.start, TZ);
      const totalMin = zoned.getHours() * 60 + zoned.getMinutes();
      // Slot at 10:00 would occupy 10:00–11:15, overlapping the existing booking
      if (totalMin >= 600 && totalMin < 675) {
        throw new Error(`Unexpected slot at ${zoned.getHours()}:${zoned.getMinutes()}`);
      }
    }
  });

  it("returns empty when no availability rules match", () => {
    const date = makeDate("2025-01-02", "12:00"); // Thursday, no rules
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("returns empty when no therapist is qualified", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [{ ...therapist, serviceIds: ["other-service"] }],
      rooms: [room],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("returns empty when no room is compatible", () => {
    const date = makeDate("2025-01-01", "12:00");
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [{ ...room, serviceIds: ["other-service"] }],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("filters by specific therapist when requested", () => {
    const date = makeDate("2025-01-01", "12:00");
    const therapist2 = {
      ...therapist,
      id: "therapist-2",
      full_name: "Bob",
      availabilityRules: [makeRule({ therapist_id: "therapist-2" })],
    };
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist, therapist2],
      rooms: [room],
      existingBookings: [],
      filterTherapistId: "therapist-2",
    });
    for (const slot of slots) {
      expect(slot.therapist_id).toBe("therapist-2");
    }
  });

  it("skips blocked rooms", () => {
    const date = makeDate("2025-01-01", "12:00");
    const blockedRoom = {
      ...room,
      blocks: [
        {
          id: "block-1",
          room_id: "room-1",
          start_at: makeDate("2025-01-01", "09:00").toISOString(),
          end_at: makeDate("2025-01-01", "17:00").toISOString(),
        },
      ],
    };
    const slots = findAvailableSlots({
      date,
      service,
      therapists: [therapist],
      rooms: [blockedRoom],
      existingBookings: [],
    });
    expect(slots).toHaveLength(0);
  });
});

// ─── Phase 5 matcher gate (deferred therapist assignment) ───
//
// End-to-end tests that wire paid-but-unassigned bookings into
// findAvailableSlots via the `unassignedBookings` param. The matcher
// gate must hide slots whose assignment would strand an unassigned
// booking, and surface slots a naive greedy approach would miss.

describe("findAvailableSlots — matcher gate", () => {
  const service = {
    id: "service-facial",
    name: "Facial",
    duration_minutes: 60,
    buffer_minutes: 0,
    price_ils: 30000,
  };

  const aliceRules = makeRule({
    therapist_id: "alice",
    start_time: "09:00",
    end_time: "17:00",
  });
  const bobRules = makeRule({
    therapist_id: "bob",
    start_time: "09:00",
    end_time: "17:00",
  });

  const room = {
    id: "room-1",
    name: "Room A",
    serviceIds: ["service-facial", "service-massage"],
    blocks: [] as RoomBlock[],
  };

  const alice = {
    id: "alice",
    full_name: "Alice",
    color: "#ff0000",
    availabilityRules: [aliceRules],
    timeOffs: [] as TimeOff[],
    serviceIds: ["service-facial", "service-massage"],
  };
  const bob = {
    id: "bob",
    full_name: "Bob",
    color: "#00ff00",
    availabilityRules: [bobRules],
    timeOffs: [] as TimeOff[],
    serviceIds: ["service-facial"],
  };

  it(
    "blocks the 3rd overlap when only 2 eligible therapists exist",
    () => {
      // Two paid-but-unassigned facials at 10:00, both eligible for Alice
      // and Bob. A 3rd customer asking for a facial at 10:00 must see no
      // slot — we have 2 therapists and they are already earmarked.
      const date = makeDate("2025-01-01", "12:00");
      const slotStart = makeDate("2025-01-01", "10:00");
      const slotEnd = makeDate("2025-01-01", "11:00");
      const unassignedBookings = [
        {
          id: "pending-1",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["alice", "bob"],
        },
        {
          id: "pending-2",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["alice", "bob"],
        },
      ];

      const slots = findAvailableSlots({
        date,
        service,
        therapists: [alice, bob],
        rooms: [room],
        existingBookings: [],
        unassignedBookings,
      });

      // No slot that starts exactly at 10:00 should be emitted.
      const tenAmSlots = slots.filter(
        (s) => s.start.getTime() === slotStart.getTime()
      );
      expect(tenAmSlots).toHaveLength(0);

      // But slots outside the pressure window (e.g. 14:00) still exist.
      const afternoonSlots = slots.filter(
        (s) => getJerusalemHours(s.start) >= 14
      );
      expect(afternoonSlots.length).toBeGreaterThan(0);
    }
  );

  it(
    "reveals specialist-vs-generalist slot that pure greedy would hide",
    () => {
      // Alice can do massage AND facial. Bob only facial. A massage
      // customer wants 10:00 while one unassigned facial at 10:00 is on
      // the books. Naive greedy virtually assigns Alice to the existing
      // facial first and then says the customer's massage has no
      // therapist — but the correct answer is "yes", with the facial
      // going to Bob and the massage to Alice.
      const massageService = {
        id: "service-massage",
        name: "Massage",
        duration_minutes: 60,
        buffer_minutes: 0,
        price_ils: 30000,
      };
      const massageRoom = {
        id: "room-m",
        name: "Room M",
        serviceIds: ["service-massage"],
        blocks: [] as RoomBlock[],
      };

      const date = makeDate("2025-01-01", "12:00");
      const slotStart = makeDate("2025-01-01", "10:00");
      const slotEnd = makeDate("2025-01-01", "11:00");
      const unassignedBookings = [
        {
          id: "pending-facial",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["alice", "bob"],
        },
      ];

      const slots = findAvailableSlots({
        date,
        service: massageService,
        therapists: [alice], // bob isn't qualified for massage
        rooms: [massageRoom],
        existingBookings: [],
        unassignedBookings,
      });

      const tenAmMassage = slots.find(
        (s) =>
          s.start.getTime() === slotStart.getTime() &&
          s.therapist_id === "alice"
      );
      expect(tenAmMassage).toBeDefined();
    }
  );

  it(
    "gender-narrowed capacity: 2 male facial therapists can't cover 3 male facials",
    () => {
      // Carl and Dave are both male and facial-qualified. Emma is female
      // and facial-qualified. Gender-filtered pool for "male" = {Carl,
      // Dave}. Two paid-but-unassigned male facials at 10:00 already
      // exhaust the pool. A 3rd male-preference facial at 10:00 must be
      // hidden.
      const carl = {
        id: "carl",
        full_name: "Carl",
        color: null as string | null,
        availabilityRules: [makeRule({ therapist_id: "carl" })],
        timeOffs: [] as TimeOff[],
        serviceIds: ["service-facial"],
      };
      const dave = {
        id: "dave",
        full_name: "Dave",
        color: null as string | null,
        availabilityRules: [makeRule({ therapist_id: "dave" })],
        timeOffs: [] as TimeOff[],
        serviceIds: ["service-facial"],
      };

      const date = makeDate("2025-01-01", "12:00");
      const slotStart = makeDate("2025-01-01", "10:00");
      const slotEnd = makeDate("2025-01-01", "11:00");

      // Eligibility pre-computed for the unassigned: only Carl and Dave
      // (because "male" preference). That is exactly what the caller
      // would compute when the unassigned booking has gender_preference
      // = 'male'.
      const unassignedBookings = [
        {
          id: "u1",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["carl", "dave"],
        },
        {
          id: "u2",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["carl", "dave"],
        },
      ];

      // The therapists list passed in is the NEW booking's candidate
      // pool — already gender-filtered to male (matches what
      // booking-engine findSlots does upstream).
      const slots = findAvailableSlots({
        date,
        service,
        therapists: [carl, dave],
        rooms: [room],
        existingBookings: [],
        unassignedBookings,
      });
      const tenAmSlots = slots.filter(
        (s) => s.start.getTime() === slotStart.getTime()
      );
      expect(tenAmSlots).toHaveLength(0);
    }
  );

  it(
    "confirmed bookings consume a therapist's time; matcher still honours capacity",
    () => {
      // Alice is confirmed-booked at 10-11 (real conflict, not just an
      // unassigned). Bob has an unassigned facial at 10-11 eligible for
      // {Alice, Bob} (Alice was eligible before the confirmed took her).
      // A new facial request at 10:00 must see no slot — Alice is out,
      // Bob is needed by the unassigned pending-facial.
      const date = makeDate("2025-01-01", "12:00");
      const slotStart = makeDate("2025-01-01", "10:00");
      const slotEnd = makeDate("2025-01-01", "11:00");
      const existingBookings: ExistingBooking[] = [
        makeBooking({
          id: "confirmed-alice",
          therapist_id: "alice",
          service_id: "service-facial",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          status: "confirmed",
        }),
      ];
      // The caller computes eligibility with the confirmed booking
      // already consuming Alice — so the unassigned's eligibility is
      // just {Bob}.
      const unassignedBookings = [
        {
          id: "pending-facial",
          start_at: slotStart.toISOString(),
          end_at: slotEnd.toISOString(),
          eligibleTherapistIds: ["bob"],
        },
      ];

      const slots = findAvailableSlots({
        date,
        service,
        therapists: [alice, bob],
        rooms: [room],
        existingBookings,
        unassignedBookings,
      });
      const tenAmSlots = slots.filter(
        (s) => s.start.getTime() === slotStart.getTime()
      );
      // Alice is confirmed-blocked, Bob is reserved for the unassigned:
      // the customer sees no slot at 10:00.
      expect(tenAmSlots).toHaveLength(0);
    }
  );

  it(
    "omitting unassignedBookings preserves pre-phase-5 behaviour",
    () => {
      // Regression guard: when the matcher param is omitted, slots come
      // back exactly as they did before this feature shipped.
      const date = makeDate("2025-01-01", "12:00");
      const slots = findAvailableSlots({
        date,
        service,
        therapists: [alice, bob],
        rooms: [room],
        existingBookings: [],
      });
      // 09:00 through 16:00 = 8 hours, 4 slots per hour, 2 therapists
      // per slot when both are qualified and no overlap — exact count
      // depends on 60-min duration + 0 buffer and 15-min grid.
      expect(slots.length).toBeGreaterThan(0);
      // Every slot must carry a concrete therapist (not null) so admin
      // callers can still round-trip.
      for (const s of slots) {
        expect(s.therapist_id).toBeTruthy();
      }
    }
  );
});

// ─── Zod schema validation ───

describe("booking schema validation", () => {
  // Use crypto.randomUUID() for valid v4 UUIDs
  const uuid1 = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
  const uuid2 = "b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6";
  const uuid3 = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";
  const uuid4 = "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f7a";

  it("rejects invalid datetime format for start_at", async () => {
    const { createBookingSchema } = await import("@/lib/schemas/booking");
    const result = createBookingSchema.safeParse({
      customer_id: uuid1,
      therapist_id: uuid2,
      room_id: uuid3,
      service_id: uuid4,
      start_at: "banana",
      status: "confirmed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid datetime format for start_at", async () => {
    const { createBookingSchema } = await import("@/lib/schemas/booking");
    const result = createBookingSchema.safeParse({
      customer_id: uuid1,
      therapist_id: uuid2,
      room_id: uuid3,
      service_id: uuid4,
      start_at: "2025-01-01T10:00",
      status: "confirmed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status in updateBookingStatusSchema", async () => {
    const { updateBookingStatusSchema } = await import("@/lib/schemas/booking");
    const result = updateBookingStatusSchema.safeParse({
      booking_id: uuid1,
      new_status: "invalid_status",
    });
    expect(result.success).toBe(false);
  });
});
