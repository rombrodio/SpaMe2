import { describe, it, expect, vi, afterEach } from "vitest";
import { isHoldExpired, holdMinutesRemaining } from "../hold";

afterEach(() => vi.useRealTimers());

describe("isHoldExpired", () => {
  it("returns false for null / undefined / empty", () => {
    expect(isHoldExpired(null)).toBe(false);
    expect(isHoldExpired(undefined)).toBe(false);
    expect(isHoldExpired("")).toBe(false);
  });

  it("returns false when deadline is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));
    expect(isHoldExpired("2026-05-01T10:15:00Z")).toBe(false);
  });

  it("returns true when deadline has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:20:00Z"));
    expect(isHoldExpired("2026-05-01T10:15:00Z")).toBe(true);
  });

  it("returns true at exact boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:15:00Z"));
    expect(isHoldExpired("2026-05-01T10:15:00Z")).toBe(true);
  });

  it("returns false for unparseable input", () => {
    expect(isHoldExpired("not-a-date")).toBe(false);
  });
});

describe("holdMinutesRemaining", () => {
  it("ceils to whole minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));
    // 10:00 → 10:14:30 = 14.5 min; ceils to 15.
    expect(holdMinutesRemaining("2026-05-01T10:14:30Z")).toBe(15);
  });

  it("returns 0 for already-expired deadlines (clamped)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:30:00Z"));
    expect(holdMinutesRemaining("2026-05-01T10:15:00Z")).toBe(0);
  });

  it("returns null for null / empty / invalid inputs", () => {
    expect(holdMinutesRemaining(null)).toBeNull();
    expect(holdMinutesRemaining("")).toBeNull();
    expect(holdMinutesRemaining("xxx")).toBeNull();
  });
});
