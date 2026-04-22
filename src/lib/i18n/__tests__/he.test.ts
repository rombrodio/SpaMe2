import { describe, it, expect } from "vitest";
import {
  he,
  formatIlsFromAgorot,
  formatDateIL,
  formatTimeIL,
  formatDateTimeILFull,
} from "../he";

describe("he strings", () => {
  it("has stable top-level sections", () => {
    expect(he.meta.appName).toBe("ספאמי");
    expect(he.meta.direction).toBe("rtl");
    expect(he.book.pageTitle.length).toBeGreaterThan(0);
    expect(he.order.pageTitle.length).toBeGreaterThan(0);
  });

  it("exposes 4 payment method labels", () => {
    const keys = Object.keys(he.order.methodPicker) as Array<
      keyof typeof he.order.methodPicker
    >;
    expect(keys).toEqual(
      expect.arrayContaining([
        "heading",
        "creditCardFull",
        "cashAtReception",
        "voucherDts",
        "voucherVpay",
      ])
    );
  });

  it("supports function-based messages", () => {
    expect(he.book.slotHeld(15)).toContain("15");
    expect(he.book.stepService.minutes(60)).toBe("60 דקות");
  });
});

describe("formatIlsFromAgorot", () => {
  it("formats 35000 agorot as ₪350", () => {
    const out = formatIlsFromAgorot(35000);
    expect(out).toContain("350");
    expect(out).toContain("₪");
  });

  it("formats 0 agorot", () => {
    expect(formatIlsFromAgorot(0)).toContain("0");
  });
});

describe("formatDateIL / formatTimeIL", () => {
  it("renders date in Israel TZ", () => {
    // 2026-05-25 11:00 UTC = 14:00 Israel (DST).
    expect(formatDateIL("2026-05-25T11:00:00Z")).toBe("25/05/2026");
    expect(formatTimeIL("2026-05-25T11:00:00Z")).toBe("14:00");
  });

  it("accepts Date objects", () => {
    const d = new Date("2026-01-15T12:00:00Z"); // no DST in Jerusalem → 14:00
    expect(formatDateIL(d)).toBe("15/01/2026");
    expect(formatTimeIL(d)).toBe("14:00");
  });
});

describe("formatDateTimeILFull", () => {
  it("includes weekday in Hebrew", () => {
    // 2026-05-25 is a Monday → "יום שני"
    const out = formatDateTimeILFull("2026-05-25T11:00:00Z");
    expect(out).toContain("יום שני");
    expect(out).toContain("25/05/2026");
    expect(out).toContain("14:00");
  });
});
