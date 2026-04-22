/**
 * End-to-end smoke test for the Phase 4 payment engine.
 *
 * Drives the critical happy paths through the real engine functions
 * with:
 *   - Mock providers (src/lib/payments/mock.ts) for CardCom / DTS / VPay
 *   - An in-memory FakeSupabase for the DB layer
 *   - The audit-log writer stubbed to a no-op (it tries to spin up a
 *     service-role client at module load time and would crash without
 *     real env vars)
 *
 * Assertions target the final DB state: the booking row, the payments
 * rows, and the specific references that flow through from each
 * provider. One test per method — the goal is a fast smoke signal,
 * not exhaustive coverage (the per-adapter unit tests handle that).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub the audit writer — it uses createAdminClient() which requires
// real Supabase env vars we don't set in tests.
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(async () => {}),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  initiatePayment,
  confirmFromWebhook,
  redeemDtsVoucher,
  redeemVpayVoucher,
  markCashReceived,
  applyCancellationFee,
  expireHolds,
} from "../engine";
import {
  simulateCardcomDealCompletion,
  resetCardcomMock,
  resetDtsMock,
  resetVpayMock,
  seedDtsCard,
  seedVpayCard,
} from "../mock";
import { FakeSupabase } from "./fake-supabase-client";

// Stable ids so assertions can reference them directly.
const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_ID = "33333333-3333-4333-8333-333333333333";

function setup(opts?: {
  bookingStatus?: string;
  paymentMethod?: string | null;
  startAtMinutesAhead?: number;
}): {
  db: FakeSupabase;
  supabase: SupabaseClient;
} {
  const db = new FakeSupabase();
  db.seedCustomer({
    id: CUSTOMER_ID,
    full_name: "Test Customer",
    phone: "+972521234567",
    email: "customer@example.com",
  });
  db.seedService({
    id: SERVICE_ID,
    name: "Swedish 60min",
    duration_minutes: 60,
    buffer_minutes: 15,
    price_ils: 35_000,
    is_active: true,
  });
  const startAt = new Date(
    Date.now() + (opts?.startAtMinutesAhead ?? 120) * 60_000
  ).toISOString();
  db.seedBooking({
    id: BOOKING_ID,
    customer_id: CUSTOMER_ID,
    service_id: SERVICE_ID,
    therapist_id: "therapist-1",
    room_id: "room-1",
    start_at: startAt,
    end_at: new Date(Date.parse(startAt) + 75 * 60_000).toISOString(),
    status: opts?.bookingStatus ?? "pending_payment",
    price_ils: 35_000,
    payment_method: opts?.paymentMethod ?? null,
    cash_due_agorot: 0,
    therapist_gender_preference: "any",
    cancellation_policy_version: "v1_5pct_or_100ILS_min",
  });

  return {
    db,
    supabase: db.client() as SupabaseClient,
  };
}

beforeEach(() => {
  resetCardcomMock();
  resetDtsMock();
  resetVpayMock();
});

describe("e2e — credit_card_full", () => {
  it("initiate → webhook → booking confirmed, payment success", async () => {
    const { db, supabase } = setup();

    const initResult = await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "credit_card_full",
      returnUrlBase: "https://test.local",
      tokenForReturn: "test-jwt-token",
      productName: "Swedish 60min",
    });
    expect(initResult).toMatchObject({ success: true });
    if (!("data" in initResult)) throw new Error("no data");

    const hosted = (initResult.data as { hostedPage?: { lowProfileCode: string; url: string } })
      .hostedPage;
    expect(hosted?.lowProfileCode).toBeTypeOf("string");
    expect(hosted?.url).toContain("mock.cardcom.local");

    // Simulate the customer completing the iframe payment.
    simulateCardcomDealCompletion(hosted!.lowProfileCode, "succeeded");

    const confirmResult = await confirmFromWebhook(supabase, {
      lowProfileCode: hosted!.lowProfileCode,
    });
    expect(confirmResult).toMatchObject({ success: true });

    // Final DB state.
    const booking = db.getRow("bookings", BOOKING_ID);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.payment_method).toBe("credit_card_full");

    const payments = db.getRows("payments");
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("success");
    expect(payments[0].method).toBe("credit_card_full");
    expect(payments[0].role).toBe("capture");
    expect(payments[0].amount_ils).toBe(35_000);
    expect(payments[0].provider_tx_id).toBe(hosted!.lowProfileCode);
    expect(payments[0].card_last4).toBe("4242");
  });

  it("idempotent webhook — second confirmFromWebhook no-ops", async () => {
    const { db, supabase } = setup();

    const initResult = await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "credit_card_full",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });
    const hosted = (
      (initResult as unknown as { data: { hostedPage: { lowProfileCode: string } } }).data
        .hostedPage
    );
    simulateCardcomDealCompletion(hosted.lowProfileCode, "succeeded");

    const first = await confirmFromWebhook(supabase, {
      lowProfileCode: hosted.lowProfileCode,
    });
    expect(first).toMatchObject({ success: true });

    const second = await confirmFromWebhook(supabase, {
      lowProfileCode: hosted.lowProfileCode,
    });
    expect(second).toMatchObject({
      success: true,
      data: { idempotent: true },
    });

    // Payment row count still 1.
    expect(db.getRows("payments")).toHaveLength(1);
  });
});

describe("e2e — cash_at_reception", () => {
  it("verify → confirmed with cash_due → mark cash → completed", async () => {
    const { db, supabase } = setup();

    // Customer picks cash — engine runs CreateTokenOnly.
    const init = await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "cash_at_reception",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });
    const hosted = (init as unknown as { data: { hostedPage: { lowProfileCode: string } } }).data
      .hostedPage;

    simulateCardcomDealCompletion(hosted.lowProfileCode, "succeeded");
    await confirmFromWebhook(supabase, {
      lowProfileCode: hosted.lowProfileCode,
    });

    // Verification row authorized; booking is confirmed with cash_due.
    const verification = db
      .getRows("payments")
      .find((p) => p.role === "card_verification");
    expect(verification?.status).toBe("authorized");
    expect(verification?.card_token).toMatch(/^MOCK-TOK-/);

    const booking = db.getRow("bookings", BOOKING_ID);
    expect(booking?.status).toBe("confirmed");
    expect(booking?.cash_due_agorot).toBe(35_000);

    // Staff collects cash at reception.
    const cashResult = await markCashReceived(supabase, {
      bookingId: BOOKING_ID,
      amountAgorot: 35_000,
      userId: null,
    });
    expect(cashResult).toMatchObject({ success: true });

    const afterCash = db.getRow("bookings", BOOKING_ID);
    expect(afterCash?.status).toBe("completed");
    expect(afterCash?.cash_due_agorot).toBe(0);

    const cashRow = db
      .getRows("payments")
      .find((p) => p.role === "cash_remainder");
    expect(cashRow?.amount_ils).toBe(35_000);
    expect(cashRow?.status).toBe("success");
  });
});

describe("e2e — voucher_dts", () => {
  it("initiate → redeem → booking confirmed", async () => {
    const { db, supabase } = setup();
    seedDtsCard("1234567890", {
      customer: {
        organizationId: "club-1",
        organizationName: "Test Club",
        memberId: "member-1",
        firstName: "Dana",
        lastName: "Levi",
      },
      items: [
        {
          memberId: "member-1",
          organizationId: "club-1",
          businessName: "Test Spa",
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 2,
          name: "Swedish 60min",
          splitVarCode: [],
        },
      ],
    });

    await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "voucher_dts",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });

    const redeem = await redeemDtsVoucher(supabase, {
      bookingId: BOOKING_ID,
      cardNumber: "1234567890",
      items: [
        {
          organizationId: "club-1",
          fullBarCode: "DTS-SWEDISH-60",
          posBarcode: "",
          quantity: 1,
          name: "Swedish 60min",
        },
      ],
    });
    expect(redeem).toMatchObject({ success: true });

    const booking = db.getRow("bookings", BOOKING_ID);
    expect(booking?.status).toBe("confirmed");

    const payments = db.getRows("payments");
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("success");
    expect(payments[0].method).toBe("voucher_dts");
    expect(payments[0].provider_tx_id).toBeTypeOf("string");
    expect(payments[0].provider_cancel_ref).toBe("club-1");
  });
});

describe("e2e — voucher_vpay", () => {
  it("initiate → withdraw → booking confirmed", async () => {
    const { db, supabase } = setup();
    seedVpayCard("8010019852923235", { cvv: "123", balanceAgorot: 50_000 });

    await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "voucher_vpay",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });

    const redeem = await redeemVpayVoucher(supabase, {
      bookingId: BOOKING_ID,
      cardNumber: "8010019852923235",
      cvv: "123",
      amountAgorot: 35_000,
    });
    expect(redeem).toMatchObject({ success: true });

    const booking = db.getRow("bookings", BOOKING_ID);
    expect(booking?.status).toBe("confirmed");

    const payments = db.getRows("payments");
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe("success");
    expect(payments[0].method).toBe("voucher_vpay");
    expect(payments[0].amount_ils).toBe(35_000);
    expect(payments[0].card_last4).toBe("3235");
  });
});

describe("e2e — cancellation fee on cash booking", () => {
  it("cancel + apply fee → penalty_capture row created", async () => {
    // Booking 2h before start → fee = min(5%, 100 ILS) = 17.5 ILS.
    const { db, supabase } = setup({ startAtMinutesAhead: 120 });

    const init = await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "cash_at_reception",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });
    const hosted = (init as unknown as { data: { hostedPage: { lowProfileCode: string } } }).data
      .hostedPage;
    simulateCardcomDealCompletion(hosted.lowProfileCode, "succeeded");
    await confirmFromWebhook(supabase, {
      lowProfileCode: hosted.lowProfileCode,
    });

    // Customer cancels (outside our cancel engine — just flip status).
    const booking = db.getRow("bookings", BOOKING_ID)!;
    booking.status = "cancelled";

    const feeResult = await applyCancellationFee(supabase, {
      bookingId: BOOKING_ID,
      userId: null,
    });
    expect(feeResult).toMatchObject({ success: true });
    const feeAgorot = (feeResult as unknown as { data: { feeAgorot: number } }).data.feeAgorot;
    expect(feeAgorot).toBe(1_750); // 5% of 35 000 agorot

    const penalty = db
      .getRows("payments")
      .find((p) => p.role === "penalty_capture");
    expect(penalty?.status).toBe("success");
    expect(penalty?.amount_ils).toBe(1_750);
  });

  it("rejects when no stored token exists", async () => {
    const { db, supabase } = setup();
    db.getRow("bookings", BOOKING_ID)!.status = "cancelled";

    const result = await applyCancellationFee(supabase, {
      bookingId: BOOKING_ID,
      userId: null,
    });
    expect(result).toMatchObject({
      error: expect.objectContaining({
        _form: [expect.stringMatching(/No stored card token/)],
      }),
    });
  });
});

describe("e2e — expireHolds cron", () => {
  it("cancels pending_payment bookings past hold_expires_at and voids pending payments", async () => {
    const { db, supabase } = setup();

    // First: initiate a payment while the booking is still in its fresh
    // hold window (engine rejects if hold has already expired). This
    // creates the pending payment row our assertion wants to see voided.
    const init = await initiatePayment(supabase, {
      bookingId: BOOKING_ID,
      method: "credit_card_full",
      returnUrlBase: "https://test.local",
      tokenForReturn: "t",
      productName: "Swedish 60min",
    });
    expect(init).toMatchObject({ success: true });

    // Now flip the booking's hold into the past, as if 15+ minutes
    // had ticked by without the customer completing the iframe.
    const booking = db.getRow("bookings", BOOKING_ID)!;
    booking.hold_expires_at = new Date(Date.now() - 60_000).toISOString();

    const result = await expireHolds(supabase);
    expect(result.expiredBookingIds).toContain(BOOKING_ID);

    const after = db.getRow("bookings", BOOKING_ID);
    expect(after?.status).toBe("cancelled");
    expect(after?.cancel_reason).toBe("Hold expired");

    const payment = db.getRows("payments")[0];
    expect(payment.status).toBe("failed");
    expect(payment.voided_at).toBeTypeOf("string");
  });
});
