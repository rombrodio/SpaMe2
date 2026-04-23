/**
 * Exact list-coloring / bipartite-matching solver for deferred therapist
 * assignment.
 *
 * Problem statement: given a set of bookings, each with a list of eligible
 * therapists and a time window, is there an assignment f: booking -> therapist
 * such that:
 *   1. f(b) is in eligibleTherapistIds(b) for every b, and
 *   2. for every two overlapping bookings b1 and b2, f(b1) != f(b2)?
 *
 * This is interval graph coloring with restricted lists. At spa scale (tens
 * of bookings, single-digit therapists), a depth-first search with most-
 * constrained-first ordering runs in microseconds in practice.
 *
 * Correctness is what matters here: a wrong "yes" oversells capacity and a
 * wrong "no" loses revenue. Both happen with heuristic approaches like pure
 * greedy. This is the exact solver — property-based tests cross-check it
 * against brute-force enumeration in matcher.test.ts.
 */

export interface MatcherBooking {
  id: string;
  start: Date;
  end: Date;
  /**
   * Pre-computed by the caller. Represents every therapist who could
   * cover this booking in isolation: qualified for the service, gender
   * preference satisfied, availability window covers the slot, and not
   * consumed by a confirmed booking during that window.
   */
  eligibleTherapistIds: readonly string[];
}

function overlaps(a: MatcherBooking, b: MatcherBooking): boolean {
  return (
    a.start.getTime() < b.end.getTime() && a.end.getTime() > b.start.getTime()
  );
}

/**
 * Does a valid assignment exist?
 *
 * Short-circuits:
 *   - Any booking with an empty eligibility list is a trivial "no".
 *   - Bookings are processed most-constrained-first, so the search tree
 *     prunes aggressively.
 */
export function canPlaceAll(bookings: readonly MatcherBooking[]): boolean {
  if (bookings.length === 0) return true;
  for (const b of bookings) {
    if (b.eligibleTherapistIds.length === 0) return false;
  }

  // Most-constrained-first ordering. Bookings with the fewest options go
  // first, so we don't waste search effort on flexible bookings only to
  // hit a dead end on a strict one.
  const order = [...bookings].sort(
    (a, b) => a.eligibleTherapistIds.length - b.eligibleTherapistIds.length
  );

  // Map: bookingId -> therapistId. Maintained mutably across recursion
  // frames; entries are added before recursing and removed on backtrack.
  const assignment = new Map<string, string>();
  const byId = new Map<string, MatcherBooking>();
  for (const b of order) byId.set(b.id, b);

  function tryNext(i: number): boolean {
    if (i === order.length) return true;
    const b = order[i];
    for (const tid of b.eligibleTherapistIds) {
      let conflict = false;
      for (const [otherId, otherT] of assignment) {
        if (otherT !== tid) continue;
        const other = byId.get(otherId)!;
        if (overlaps(b, other)) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;
      assignment.set(b.id, tid);
      if (tryNext(i + 1)) return true;
      assignment.delete(b.id);
    }
    return false;
  }

  return tryNext(0);
}

/**
 * Convenience variant: runs canPlaceAll and returns the assignment map
 * when one exists. Used by the admin "reveal suggested therapist" flow
 * on the assignment screen.
 */
export function findValidAssignment(
  bookings: readonly MatcherBooking[]
): Map<string, string> | null {
  if (bookings.length === 0) return new Map();
  for (const b of bookings) {
    if (b.eligibleTherapistIds.length === 0) return null;
  }

  const order = [...bookings].sort(
    (a, b) => a.eligibleTherapistIds.length - b.eligibleTherapistIds.length
  );

  const assignment = new Map<string, string>();
  const byId = new Map<string, MatcherBooking>();
  for (const b of order) byId.set(b.id, b);

  function tryNext(i: number): boolean {
    if (i === order.length) return true;
    const b = order[i];
    for (const tid of b.eligibleTherapistIds) {
      let conflict = false;
      for (const [otherId, otherT] of assignment) {
        if (otherT !== tid) continue;
        const other = byId.get(otherId)!;
        if (overlaps(b, other)) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;
      assignment.set(b.id, tid);
      if (tryNext(i + 1)) return true;
      assignment.delete(b.id);
    }
    return false;
  }

  return tryNext(0) ? new Map(assignment) : null;
}
