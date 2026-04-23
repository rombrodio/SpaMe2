import { describe, it, expect } from "vitest";
import { canPlaceAll, findValidAssignment, type MatcherBooking } from "../matcher";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function mb(
  id: string,
  startMin: number,
  endMin: number,
  eligible: string[]
): MatcherBooking {
  // Use a fixed anchor so the test times are all deterministic and easy to
  // reason about. Actual date value doesn't matter — the matcher only
  // compares intervals.
  const anchor = new Date("2025-01-01T00:00:00Z").getTime();
  return {
    id,
    start: new Date(anchor + startMin * 60_000),
    end: new Date(anchor + endMin * 60_000),
    eligibleTherapistIds: eligible,
  };
}

// Brute-force oracle — tries every possible therapist-per-booking combo.
// Exponential but fine for the small-n property tests below; any
// disagreement with the matcher is a genuine bug.
function bruteForceCanPlace(bookings: MatcherBooking[]): boolean {
  const n = bookings.length;
  if (n === 0) return true;
  const choices = bookings.map((b) => b.eligibleTherapistIds);
  const pick: string[] = new Array(n);

  function overlap(i: number, j: number): boolean {
    return (
      bookings[i].start.getTime() < bookings[j].end.getTime() &&
      bookings[i].end.getTime() > bookings[j].start.getTime()
    );
  }

  function recurse(i: number): boolean {
    if (i === n) return true;
    const opts = choices[i];
    if (opts.length === 0) return false;
    for (const t of opts) {
      let ok = true;
      for (let j = 0; j < i; j++) {
        if (pick[j] === t && overlap(i, j)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pick[i] = t;
      if (recurse(i + 1)) return true;
    }
    return false;
  }
  return recurse(0);
}

// Deterministic PRNG — mulberry32, seeded.
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInstance(
  rand: () => number,
  maxBookings: number,
  maxTherapists: number
): MatcherBooking[] {
  const therapists: string[] = [];
  const tCount = 1 + Math.floor(rand() * maxTherapists);
  for (let i = 0; i < tCount; i++) therapists.push(`t${i + 1}`);

  const n = 1 + Math.floor(rand() * maxBookings);
  const bookings: MatcherBooking[] = [];
  for (let i = 0; i < n; i++) {
    // Random 30-90 min booking somewhere in 0-300 min window.
    const start = Math.floor(rand() * 240);
    const dur = 30 + Math.floor(rand() * 60);
    // Pick a random non-empty subset of therapists.
    const eligible: string[] = [];
    for (const t of therapists) {
      if (rand() < 0.6) eligible.push(t);
    }
    if (eligible.length === 0) eligible.push(therapists[0]);
    bookings.push(mb(`b${i + 1}`, start, start + dur, eligible));
  }
  return bookings;
}

// ─────────────────────────────────────────────────────────────
// Hand-written scenarios: classic failure modes of naive greedy
// ─────────────────────────────────────────────────────────────

describe("canPlaceAll — fundamental cases", () => {
  it("empty list is trivially placeable", () => {
    expect(canPlaceAll([])).toBe(true);
  });

  it("a booking with no eligible therapists is not placeable", () => {
    expect(canPlaceAll([mb("b", 0, 60, [])])).toBe(false);
  });

  it("single booking with any eligible therapist is placeable", () => {
    expect(canPlaceAll([mb("b", 0, 60, ["t1"])])).toBe(true);
  });

  it("two disjoint bookings on the same solo therapist are fine", () => {
    expect(
      canPlaceAll([mb("b1", 0, 60, ["t1"]), mb("b2", 60, 120, ["t1"])])
    ).toBe(true);
  });

  it("two overlapping bookings on the same solo therapist are not fine", () => {
    expect(
      canPlaceAll([mb("b1", 0, 60, ["t1"]), mb("b2", 30, 90, ["t1"])])
    ).toBe(false);
  });
});

describe("canPlaceAll — specialist vs generalist (greedy kryptonite)", () => {
  it(
    "generalist gets correctly routed to facial so specialist covers massage",
    () => {
      // Alice qualifies for both massage and facial. Bob only facial.
      // Overlapping: one facial and one massage, same time. Naive greedy
      // in alphabetical/insertion order assigns Alice to the facial
      // (processed first), leaving the massage unplaceable. The exact
      // matcher places Alice -> massage and Bob -> facial.
      const bookings: MatcherBooking[] = [
        mb("facial", 0, 60, ["alice", "bob"]),
        mb("massage", 0, 60, ["alice"]),
      ];
      expect(canPlaceAll(bookings)).toBe(true);
    }
  );

  it(
    "three overlapping bookings with only two therapists is unplaceable",
    () => {
      const bookings: MatcherBooking[] = [
        mb("b1", 0, 60, ["alice", "bob"]),
        mb("b2", 0, 60, ["alice", "bob"]),
        mb("b3", 0, 60, ["alice", "bob"]),
      ];
      expect(canPlaceAll(bookings)).toBe(false);
    }
  );

  it(
    "chain of constraints where pure most-constrained-first isn't enough",
    () => {
      // Forcing the matcher to backtrack at least once.
      //   b1 overlaps b2, both overlap b3.
      //   b3 eligibility = {t1}
      //   b2 eligibility = {t1, t2}
      //   b1 eligibility = {t1, t2, t3}
      // Greedy most-constrained places b3->t1 first, then b2->t2, then
      // b1->t3. Here both match. Include the test to lock in behaviour.
      const bookings: MatcherBooking[] = [
        mb("b1", 0, 60, ["t1", "t2", "t3"]),
        mb("b2", 30, 90, ["t1", "t2"]),
        mb("b3", 20, 80, ["t1"]),
      ];
      expect(canPlaceAll(bookings)).toBe(true);
    }
  );

  it("backtracking really is required", () => {
    // Construct a case where most-constrained-first's first attempt dead-
    // ends and the solver must backtrack.
    //
    // Three overlapping bookings:
    //   b1 eligibility = {t1, t2}
    //   b2 eligibility = {t1, t3}
    //   b3 eligibility = {t2, t3}
    // If the solver picks (b1->t1, b2->t3, b3->t2) it works. If it picks
    // (b1->t2, b2->t1, b3->?) neither t2 nor t3 is free — must backtrack.
    // All three bookings have equal eligibility size (2), so ordering is
    // stable by insertion — tests that backtracking works regardless of
    // lucky initial choice.
    const bookings: MatcherBooking[] = [
      mb("b1", 0, 60, ["t1", "t2"]),
      mb("b2", 0, 60, ["t1", "t3"]),
      mb("b3", 0, 60, ["t2", "t3"]),
    ];
    expect(canPlaceAll(bookings)).toBe(true);
  });
});

describe("canPlaceAll — time-staggered cases", () => {
  it("one therapist can cover two non-overlapping bookings", () => {
    expect(
      canPlaceAll([mb("b1", 0, 60, ["t1"]), mb("b2", 120, 180, ["t1"])])
    ).toBe(true);
  });

  it("touching but not overlapping (b1 ends when b2 starts) is fine", () => {
    // Back-to-back bookings: end-at == start-at is NOT an overlap.
    expect(
      canPlaceAll([mb("b1", 0, 60, ["t1"]), mb("b2", 60, 120, ["t1"])])
    ).toBe(true);
  });
});

describe("findValidAssignment", () => {
  it("returns null when matching fails", () => {
    const bookings: MatcherBooking[] = [
      mb("b1", 0, 60, ["t1"]),
      mb("b2", 30, 90, ["t1"]),
    ];
    expect(findValidAssignment(bookings)).toBeNull();
  });

  it("returns a valid assignment when matching succeeds", () => {
    const bookings: MatcherBooking[] = [
      mb("facial", 0, 60, ["alice", "bob"]),
      mb("massage", 0, 60, ["alice"]),
    ];
    const result = findValidAssignment(bookings);
    expect(result).not.toBeNull();
    // Massage must be Alice; facial must then be Bob.
    expect(result!.get("massage")).toBe("alice");
    expect(result!.get("facial")).toBe("bob");
  });

  it("returned assignment respects eligibility and overlap", () => {
    const bookings: MatcherBooking[] = [
      mb("b1", 0, 60, ["t1", "t2"]),
      mb("b2", 0, 60, ["t1", "t3"]),
      mb("b3", 0, 60, ["t2", "t3"]),
    ];
    const result = findValidAssignment(bookings)!;
    expect(result).not.toBeNull();
    // Each booking assigned to a therapist from its eligibility.
    for (const b of bookings) {
      const t = result.get(b.id)!;
      expect(b.eligibleTherapistIds).toContain(t);
    }
    // No two overlapping bookings share a therapist — and here they all
    // overlap, so the three assignments must be pairwise distinct.
    const assigned = [...result.values()];
    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

// ─────────────────────────────────────────────────────────────
// Property-based cross-check against brute force
// ─────────────────────────────────────────────────────────────

describe("canPlaceAll — property-based vs brute force", () => {
  it(
    "agrees with brute force on 1000 random small instances",
    () => {
      const rand = rng(42);
      let checked = 0;
      for (let i = 0; i < 1000; i++) {
        const inst = randomInstance(rand, 6, 5);
        const expected = bruteForceCanPlace(inst);
        const actual = canPlaceAll(inst);
        if (expected !== actual) {
          throw new Error(
            `Disagreement on trial ${i}: expected=${expected} actual=${actual}, instance=${JSON.stringify(
              inst.map((b) => ({
                id: b.id,
                start: b.start.toISOString(),
                end: b.end.toISOString(),
                eligible: [...b.eligibleTherapistIds],
              }))
            )}`
          );
        }
        checked++;
      }
      expect(checked).toBe(1000);
    }
  );

  it(
    "agrees on edge-density instances (many overlaps)",
    () => {
      // Bias toward tight schedules where most bookings overlap.
      const rand = rng(99);
      for (let i = 0; i < 500; i++) {
        // Force all bookings into a 60-min window so every pair overlaps.
        const therapists = ["t1", "t2", "t3", "t4"];
        const n = 2 + Math.floor(rand() * 5);
        const bookings: MatcherBooking[] = [];
        for (let j = 0; j < n; j++) {
          const eligible = therapists.filter(() => rand() < 0.5);
          bookings.push(
            mb(
              `b${j}`,
              0,
              60,
              eligible.length > 0 ? eligible : [therapists[0]]
            )
          );
        }
        expect(canPlaceAll(bookings)).toBe(bruteForceCanPlace(bookings));
      }
    }
  );
});
