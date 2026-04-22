import { describe, it, expect } from "vitest";
import { normalizePhoneIL } from "../twilio";
import { buildBookingConfirmedSms } from "../templates/booking-confirmed-sms";

describe("normalizePhoneIL", () => {
  it("accepts a local 05X form", () => {
    expect(normalizePhoneIL("0521234567")).toBe("+972521234567");
  });

  it("accepts a +972 E.164 form unchanged", () => {
    expect(normalizePhoneIL("+972521234567")).toBe("+972521234567");
  });

  it("adds + to a bare 972 prefix", () => {
    expect(normalizePhoneIL("972521234567")).toBe("+972521234567");
  });

  it("tolerates whitespace / dashes / parentheses", () => {
    expect(normalizePhoneIL("052-123-4567")).toBe("+972521234567");
    expect(normalizePhoneIL("052 123 4567")).toBe("+972521234567");
    expect(normalizePhoneIL("(052) 1234567")).toBe("+972521234567");
  });

  it("rejects clearly malformed input", () => {
    expect(normalizePhoneIL("")).toBeNull();
    expect(normalizePhoneIL("not-a-phone")).toBeNull();
    expect(normalizePhoneIL("052")).toBeNull(); // too short
    expect(normalizePhoneIL("+1-555-123-4567")).toBeNull(); // not Israeli
  });

  it("accepts 8 and 9 digit mobile/landline tails", () => {
    // 9-digit (mobile): 05X-XXX-XXXX after the leading 0
    expect(normalizePhoneIL("0521234567")).toBe("+972521234567");
    // 8-digit (landline): 0X-XXXX-XXXX after the leading 0
    expect(normalizePhoneIL("031234567")).toBe("+97231234567");
  });
});

describe("buildBookingConfirmedSms", () => {
  it("produces a short anonymous Hebrew body with date/time", () => {
    const body = buildBookingConfirmedSms({
      serviceName: "עיסוי שוודי 60 דקות",
      startAt: "2026-05-25T11:00:00Z", // 14:00 Jerusalem (DST)
    });
    expect(body).toContain("אושר");
    expect(body).toContain("עיסוי שוודי 60 דקות");
    expect(body).toContain("25/05");
    expect(body).toContain("14:00");
    expect(body).toContain("ספאמי");
  });

  it("does NOT leak a therapist name (anonymization policy)", () => {
    const body = buildBookingConfirmedSms({
      serviceName: "X",
      startAt: "2026-05-25T11:00:00Z",
    });
    // The template takes no therapistName input at all; the most common
    // legacy value "עם" must not appear in the rendered copy.
    expect(body).not.toMatch(/\bעם\b/);
  });

  it("accepts a Date object", () => {
    const body = buildBookingConfirmedSms({
      serviceName: "Facial",
      startAt: new Date("2026-05-25T11:00:00Z"),
    });
    expect(body).toContain("14:00");
  });

  it("honours a custom business name", () => {
    const body = buildBookingConfirmedSms({
      serviceName: "X",
      startAt: "2026-05-25T11:00:00Z",
      businessName: "Custom Spa",
    });
    expect(body.endsWith("Custom Spa")).toBe(true);
  });

  it("fits under the two-segment UCS-2 threshold with typical input", () => {
    const body = buildBookingConfirmedSms({
      serviceName: "עיסוי רקמות עמוקות 90 דקות",
      startAt: "2026-05-25T11:00:00Z",
    });
    // UCS-2 single segment = 70 chars; we aim to stay under that.
    expect(body.length).toBeLessThanOrEqual(80);
  });
});
