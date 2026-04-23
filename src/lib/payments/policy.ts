/**
 * Cancellation policy — v1: min(5% of price, 100 ILS).
 *
 * Pure function. Given a service price in agorot and how many hours before
 * the booking start time the cancellation occurred (or how many hours past
 * start for a no-show), returns whether a fee is chargeable and the amount.
 *
 * Policy v1 rules:
 *   * hoursBefore > 24           → free cancellation (fee = 0)
 *   * 0 <= hoursBefore <= 24     → charge min(5% of price, 100 ILS)
 *   * hoursBefore < 0 (no-show)  → charge min(5% of price, 100 ILS)
 *
 * Persisted on bookings.cancellation_policy_version so future policy
 * changes don't retroactively affect existing bookings.
 */

import type {
  CancellationFeeQuote,
  CancellationPolicyVersion,
} from "./types";

export const CURRENT_POLICY_VERSION: CancellationPolicyVersion =
  "v1_5pct_or_100ILS_min";

const FREE_CANCEL_WINDOW_HOURS = 24;
const FEE_PCT = 0.05; // 5%
const FEE_CAP_AGOROT = 10_000; // 100 ILS

export function computeCancellationFee(input: {
  priceAgorot: number;
  hoursBefore: number;
  policyVersion?: CancellationPolicyVersion;
}): CancellationFeeQuote {
  const policyVersion = input.policyVersion ?? CURRENT_POLICY_VERSION;

  if (policyVersion !== "v1_5pct_or_100ILS_min") {
    // Defensive: future versions dispatch here. For now only v1 exists.
    return {
      policyVersion,
      hoursBefore: input.hoursBefore,
      shouldCharge: false,
      feeAgorot: 0,
      reason: `Unknown policy version: ${policyVersion}`,
    };
  }

  if (input.priceAgorot <= 0) {
    return {
      policyVersion,
      hoursBefore: input.hoursBefore,
      shouldCharge: false,
      feeAgorot: 0,
      reason: "Non-positive price; nothing to charge.",
    };
  }

  if (input.hoursBefore > FREE_CANCEL_WINDOW_HOURS) {
    return {
      policyVersion,
      hoursBefore: input.hoursBefore,
      shouldCharge: false,
      feeAgorot: 0,
      reason: `Cancelled more than ${FREE_CANCEL_WINDOW_HOURS}h before start; free window.`,
    };
  }

  const pctAgorot = Math.round(input.priceAgorot * FEE_PCT);
  const feeAgorot = Math.min(pctAgorot, FEE_CAP_AGOROT);

  const reason =
    input.hoursBefore < 0
      ? `No-show (${Math.abs(input.hoursBefore).toFixed(1)}h after start); policy v1.`
      : `Late cancel (${input.hoursBefore.toFixed(1)}h before start); policy v1.`;

  return {
    policyVersion,
    hoursBefore: input.hoursBefore,
    shouldCharge: feeAgorot > 0,
    feeAgorot,
    reason,
  };
}

/**
 * Convenience wrapper: given two ISO timestamps, computes hoursBefore
 * and delegates to computeCancellationFee. Negative return = past start
 * (no-show territory).
 */
export function quoteCancellationFee(input: {
  priceAgorot: number;
  bookingStartAt: Date | string;
  cancelledAt: Date | string;
  policyVersion?: CancellationPolicyVersion;
}): CancellationFeeQuote {
  const start =
    input.bookingStartAt instanceof Date
      ? input.bookingStartAt
      : new Date(input.bookingStartAt);
  const cancel =
    input.cancelledAt instanceof Date
      ? input.cancelledAt
      : new Date(input.cancelledAt);

  const hoursBefore = (start.getTime() - cancel.getTime()) / (1000 * 60 * 60);

  return computeCancellationFee({
    priceAgorot: input.priceAgorot,
    hoursBefore,
    policyVersion: input.policyVersion,
  });
}
