import { describe, it, expect } from "vitest";
import {
  computeCancellationFee,
  quoteCancellationFee,
  CURRENT_POLICY_VERSION,
} from "../policy";

describe("computeCancellationFee — v1_5pct_or_100ILS_min", () => {
  it("returns no fee when cancelled more than 24h before start", () => {
    const quote = computeCancellationFee({
      priceAgorot: 35_000, // 350 ILS
      hoursBefore: 48,
    });
    expect(quote.shouldCharge).toBe(false);
    expect(quote.feeAgorot).toBe(0);
    expect(quote.policyVersion).toBe(CURRENT_POLICY_VERSION);
  });

  it("returns no fee exactly at the 24h boundary + epsilon", () => {
    const quote = computeCancellationFee({
      priceAgorot: 35_000,
      hoursBefore: 24.01,
    });
    expect(quote.shouldCharge).toBe(false);
  });

  it("applies 5% fee just inside the 24h window", () => {
    const quote = computeCancellationFee({
      priceAgorot: 20_000, // 200 ILS
      hoursBefore: 23.5,
    });
    // 5% of 200 ILS = 10 ILS = 1000 agorot
    expect(quote.shouldCharge).toBe(true);
    expect(quote.feeAgorot).toBe(1_000);
  });

  it("applies the 100 ILS cap on large prices", () => {
    const quote = computeCancellationFee({
      priceAgorot: 300_000, // 3000 ILS → 5% = 150 ILS → cap at 100
      hoursBefore: 2,
    });
    expect(quote.shouldCharge).toBe(true);
    expect(quote.feeAgorot).toBe(10_000);
  });

  it("charges on no-show (negative hoursBefore)", () => {
    const quote = computeCancellationFee({
      priceAgorot: 35_000,
      hoursBefore: -1, // started an hour ago, customer never arrived
    });
    expect(quote.shouldCharge).toBe(true);
    expect(quote.feeAgorot).toBe(1_750); // 5% of 350 ILS = 17.5 ILS
    expect(quote.reason).toMatch(/No-show/);
  });

  it("returns zero for non-positive prices", () => {
    const quote = computeCancellationFee({
      priceAgorot: 0,
      hoursBefore: 1,
    });
    expect(quote.shouldCharge).toBe(false);
    expect(quote.feeAgorot).toBe(0);
  });

  it("rounds the 5% computation to whole agorot", () => {
    // 333 agorot × 5% = 16.65 agorot → rounds to 17
    const quote = computeCancellationFee({
      priceAgorot: 333,
      hoursBefore: 5,
    });
    expect(quote.feeAgorot).toBe(17);
  });

  it("caps exactly at 100 ILS when the percentage lands just above", () => {
    // 5% of 200_001 = 10_000.05 → rounds to 10_000 → cap hit
    const quote = computeCancellationFee({
      priceAgorot: 200_020,
      hoursBefore: 5,
    });
    expect(quote.feeAgorot).toBe(10_000);
  });

  it("treats an unknown policy version as a no-op", () => {
    const quote = computeCancellationFee({
      priceAgorot: 35_000,
      hoursBefore: 5,
      // @ts-expect-error — unknown version for test
      policyVersion: "v2_future",
    });
    expect(quote.shouldCharge).toBe(false);
    expect(quote.feeAgorot).toBe(0);
    expect(quote.reason).toMatch(/Unknown policy version/);
  });
});

describe("quoteCancellationFee — timestamp wrapper", () => {
  it("computes hoursBefore from ISO strings", () => {
    const start = "2026-05-01T14:00:00Z";
    const cancel = "2026-05-01T12:00:00Z"; // 2h before
    const quote = quoteCancellationFee({
      priceAgorot: 20_000,
      bookingStartAt: start,
      cancelledAt: cancel,
    });
    expect(quote.shouldCharge).toBe(true);
    expect(quote.feeAgorot).toBe(1_000);
    expect(quote.hoursBefore).toBeCloseTo(2, 3);
  });

  it("accepts Date objects", () => {
    const start = new Date("2026-05-01T14:00:00Z");
    const cancel = new Date("2026-04-30T13:00:00Z"); // 25h before
    const quote = quoteCancellationFee({
      priceAgorot: 20_000,
      bookingStartAt: start,
      cancelledAt: cancel,
    });
    expect(quote.shouldCharge).toBe(false);
  });

  it("produces negative hoursBefore for post-start cancellation (no-show)", () => {
    const start = "2026-05-01T14:00:00Z";
    const cancel = "2026-05-01T15:30:00Z"; // 1.5h after start
    const quote = quoteCancellationFee({
      priceAgorot: 20_000,
      bookingStartAt: start,
      cancelledAt: cancel,
    });
    expect(quote.hoursBefore).toBeCloseTo(-1.5, 3);
    expect(quote.shouldCharge).toBe(true);
  });
});
