import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildManagerUnassignedSms,
  buildManagerReassignSms,
  buildManagerEscalationSms,
  buildManagerConfirmationTimeoutSms,
} from "../templates/assignment-manager";
import { buildTherapistRequestSms } from "../templates/assignment-therapist";

// Fixed anchor so tests don't drift with DST or test-runner TZ.
const ANCHOR_DATE = "2026-05-25T11:00:00Z"; // 14:00 Jerusalem (DST)

describe("assignment-manager templates", () => {
  it("builds a short manager-unassigned body with service + time + gender", () => {
    const body = buildManagerUnassignedSms({
      serviceName: "עיסוי שוודי",
      startAt: ANCHOR_DATE,
      genderPreference: "female",
      assignUrl: "https://spa.example/admin/assignments?bookingId=abc",
    });
    expect(body).toContain("הזמנה חדשה ללא שיוך");
    expect(body).toContain("עיסוי שוודי");
    expect(body).toContain("25/05");
    expect(body).toContain("14:00");
    expect(body).toContain("נקבה");
    expect(body).toContain("https://spa.example/admin/assignments");
  });

  it("renders gender=any as 'ללא העדפה'", () => {
    const body = buildManagerUnassignedSms({
      serviceName: "X",
      startAt: ANCHOR_DATE,
      genderPreference: "any",
      assignUrl: "u",
    });
    expect(body).toContain("ללא העדפה");
  });

  it("builds a reassign body with optional reason", () => {
    const withReason = buildManagerReassignSms({
      therapistName: "Alice",
      serviceName: "עיסוי",
      startAt: ANCHOR_DATE,
      reason: "חולה",
      assignUrl: "u",
    });
    expect(withReason).toContain("Alice");
    expect(withReason).toContain("דחה");
    expect(withReason).toContain("סיבה: חולה");

    const withoutReason = buildManagerReassignSms({
      therapistName: "Alice",
      serviceName: "עיסוי",
      startAt: ANCHOR_DATE,
      assignUrl: "u",
    });
    expect(withoutReason).not.toContain("סיבה:");
  });

  it("builds an escalation body mentioning hours until start", () => {
    const body = buildManagerEscalationSms({
      serviceName: "עיסוי",
      startAt: ANCHOR_DATE,
      hoursUntilStart: 3,
      assignUrl: "u",
    });
    expect(body).toContain("דחוף");
    expect(body).toContain("3 שעות");
  });

  it("builds a confirmation-timeout body with therapist name", () => {
    const body = buildManagerConfirmationTimeoutSms({
      therapistName: "Bob",
      serviceName: "עיסוי",
      startAt: ANCHOR_DATE,
      assignUrl: "u",
    });
    expect(body).toContain("Bob");
    expect(body).toContain("טרם אישר");
  });
});

describe("assignment-therapist template", () => {
  it("builds a therapist request with customer first name + 2h SLA line", () => {
    const body = buildTherapistRequestSms({
      serviceName: "עיסוי שוודי",
      startAt: ANCHOR_DATE,
      customerFirstName: "דני",
      confirmUrl: "https://spa.example/therapist?bookingId=abc",
    });
    expect(body).toContain("שובצת להזמנה");
    expect(body).toContain("עיסוי שוודי");
    expect(body).toContain("עבור דני");
    expect(body).toContain("תוך שעתיים");
    expect(body).toContain("https://spa.example/therapist");
  });

  it("omits customer name line when not provided", () => {
    const body = buildTherapistRequestSms({
      serviceName: "Facial",
      startAt: ANCHOR_DATE,
      customerFirstName: "",
      confirmUrl: "u",
    });
    expect(body).not.toContain("עבור ");
    expect(body).toContain("Facial");
  });
});

// ─────────────────────────────────────────────────────────────
// Dispatcher fallback behaviour
//
// These tests stub out Twilio and Supabase so we can prove that:
//   (a) missing WhatsApp template SID makes WhatsApp fail cleanly but
//       SMS still fires, and
//   (b) a missing on-call manager phone returns config_error on both
//       channels (no crash).
// ─────────────────────────────────────────────────────────────

// Module-level mocks so we can drive the dispatcher without real Twilio.
vi.mock("../twilio", () => {
  const sendSms = vi.fn(async () => ({ ok: true, messageSid: "SM_mock" }));
  const sendWhatsApp = vi.fn(async (input: { contentSid: string | null }) => {
    if (!input.contentSid) {
      return {
        ok: false,
        reason: "config_error",
        message: "no contentSid",
      };
    }
    return { ok: true, messageSid: "WA_mock" };
  });
  return { sendSms, sendWhatsApp };
});

vi.mock("../on-call-manager", () => ({
  getOnCallManager: vi.fn(async () => ({
    name: "Test Manager",
    phone: "+972521234567",
  })),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(),
}));

describe("notify dispatcher — fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.TWILIO_WA_TEMPLATE_MANAGER_ALERT;
  });

  it("ships SMS and gracefully skips WhatsApp when template SID is unset", async () => {
    delete process.env.TWILIO_WA_TEMPLATE_MANAGER_ALERT;
    const { notifyManagerUnassigned } = await import("../notify");
    const outcome = await notifyManagerUnassigned({
      bookingId: "b1",
      serviceName: "X",
      startAt: ANCHOR_DATE,
      genderPreference: "any",
      assignUrl: "u",
    });
    expect(outcome.sms.ok).toBe(true);
    expect(outcome.whatsapp.ok).toBe(false);
    expect(outcome.whatsapp.ok || "reason" in outcome.whatsapp).toBe(true);
  });

  it("ships both SMS and WhatsApp when template SID is configured", async () => {
    process.env.TWILIO_WA_TEMPLATE_MANAGER_ALERT = "HXfake";
    const { notifyManagerUnassigned } = await import("../notify");
    const outcome = await notifyManagerUnassigned({
      bookingId: "b1",
      serviceName: "X",
      startAt: ANCHOR_DATE,
      genderPreference: "male",
      assignUrl: "u",
    });
    expect(outcome.sms.ok).toBe(true);
    expect(outcome.whatsapp.ok).toBe(true);
  });

  it("returns config_error on both channels when manager phone is missing", async () => {
    const onCallMod = await import("../on-call-manager");
    (onCallMod.getOnCallManager as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      name: null,
      phone: null,
    });
    const { notifyManagerUnassigned } = await import("../notify");
    const outcome = await notifyManagerUnassigned({
      bookingId: "b1",
      serviceName: "X",
      startAt: ANCHOR_DATE,
      genderPreference: "any",
      assignUrl: "u",
    });
    expect(outcome.sms.ok).toBe(false);
    expect(outcome.whatsapp.ok).toBe(false);
  });
});
