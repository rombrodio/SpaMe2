/**
 * Payment engine — the single orchestration layer between booking state,
 * the `payments` rows, and the three provider adapters (CardCom / DTS /
 * VPay). All business rules for the four payment methods live here.
 *
 * Pattern follows src/lib/scheduling/booking-engine.ts:
 *   - Functions accept a SupabaseClient so callers (server actions and
 *     webhook handlers) can pass the right client (normal or service-role).
 *   - Returns ActionResult on success/validation paths.
 *   - Writes audit_logs on every state change (fire-and-forget).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSuccessfulCapture,
  isSuccessfulTokenVerification,
  redactIndicatorForStorage,
} from "./cardcom";
import {
  getCardcomProvider,
  getDtsProvider,
  getVpayProvider,
} from "./providers";
import type {
  CustomerContact,
  LowProfileIndicator,
  PaymentMethod,
  PaymentRole,
} from "./types";
import {
  CURRENT_POLICY_VERSION,
  quoteCancellationFee,
} from "./policy";
import { writeAuditLog } from "@/lib/audit";
import type { ActionResult } from "@/lib/constants";

// ────────────────────────────────────────────────────────────
// Row shapes
// ────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  customer_id: string;
  // NULL for unassigned bookings (phase 5 deferred-assignment work).
  therapist_id: string | null;
  room_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status:
    | "pending_payment"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "no_show";
  price_ils: number;
  payment_method: PaymentMethod | null;
  hold_expires_at: string | null;
  cash_due_agorot: number;
  cancellation_policy_version: string;
}

interface CustomerRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
}

interface ServiceRow {
  id: string;
  name: string;
  price_ils: number;
}

interface PaymentRow {
  id: string;
  booking_id: string;
  amount_ils: number;
  status: "pending" | "authorized" | "success" | "failed" | "refunded";
  provider: string;
  provider_tx_id: string | null;
  provider_internal_deal_id: string | null;
  provider_cancel_ref: string | null;
  method: PaymentMethod;
  role: PaymentRole;
  invoice_number: string | null;
  card_last4: string | null;
  card_token: string | null;
  card_token_expires_at: string | null;
  payment_page_url: string | null;
  webhook_payload: Record<string, unknown> | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

async function loadBookingWithCustomer(
  supabase: SupabaseClient,
  bookingId: string
): Promise<
  | {
      booking: BookingRow;
      customer: CustomerRow;
      service: ServiceRow;
    }
  | { error: string }
> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, customers(id, full_name, phone, email), services(id, name, price_ils)"
    )
    .eq("id", bookingId)
    .single();
  if (error || !data) return { error: "Booking not found" };
  const row = data as BookingRow & {
    customers: CustomerRow | null;
    services: ServiceRow | null;
  };
  if (!row.customers) return { error: "Booking customer missing" };
  if (!row.services) return { error: "Booking service missing" };
  return { booking: row, customer: row.customers, service: row.services };
}

function contactFromCustomer(c: CustomerRow): CustomerContact {
  return { name: c.full_name, phone: c.phone, email: c.email ?? undefined };
}

function cashMethod(method: PaymentMethod): "capture" | "card_verification" {
  return method === "cash_at_reception" ? "card_verification" : "capture";
}

function isCardComMethod(method: PaymentMethod): boolean {
  return method === "credit_card_full" || method === "cash_at_reception";
}

// ────────────────────────────────────────────────────────────
// initiatePayment — entry point for all four methods
// ────────────────────────────────────────────────────────────

export interface InitiatePaymentInput {
  bookingId: string;
  method: PaymentMethod;
  returnUrlBase: string;       // e.g. https://spame2.app — used to build
                                // success/error/cancel + indicator URLs
  /**
   * The /order/<token> JWT. Embedded in the success/error/cancel URLs
   * so the customer lands on a token-scoped page that can re-verify
   * the booking and render the right state.
   */
  tokenForReturn: string;
  productName: string;
  language?: "he" | "en";
}

export interface InitiatePaymentSuccess {
  paymentId: string;
  method: PaymentMethod;
  role: PaymentRole;
  amountAgorot: number;
  // Set only for CardCom flows; voucher/cash flows take a second step
  // (lookupBalance + redeemVoucher{Dts,Vpay}).
  hostedPage?: {
    lowProfileCode: string;
    url: string;
  };
}

export async function initiatePayment(
  supabase: SupabaseClient,
  input: InitiatePaymentInput
): Promise<ActionResult> {
  const loaded = await loadBookingWithCustomer(supabase, input.bookingId);
  if ("error" in loaded) return { error: { _form: [loaded.error] } };
  const { booking, customer, service } = loaded;

  if (booking.status !== "pending_payment") {
    return {
      error: {
        _form: [
          `Booking is not pending payment (status=${booking.status}).`,
        ],
      },
    };
  }

  if (booking.hold_expires_at) {
    if (new Date(booking.hold_expires_at) < new Date()) {
      return {
        error: {
          _form: ["The reservation hold has expired. Please restart."],
        },
      };
    }
  }

  // Pin the chosen payment method on the booking so downstream UI / cron
  // can render the right state.
  if (booking.payment_method !== input.method) {
    const { error: updErr } = await supabase
      .from("bookings")
      .update({ payment_method: input.method })
      .eq("id", booking.id);
    if (updErr) return { error: { _form: [updErr.message] } };
    booking.payment_method = input.method;
  }

  // If there's already an in-flight payment for this booking+role, reuse
  // it only when the METHOD also matches (keeps idempotency tight with the
  // unique partial index one_active_payment_per_booking_role). When the
  // customer switches methods (e.g. voucher_dts → voucher_vpay, same role=
  // 'capture'), void the stale row so the new insert doesn't collide on
  // the unique index.
  const desiredRole: PaymentRole = cashMethod(input.method);
  const { data: existingRowsRaw } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .in("status", ["pending", "authorized"]);
  const existingRows = (existingRowsRaw as PaymentRow[] | null) ?? [];

  // Void any in-flight row with matching role but different method.
  for (const row of existingRows) {
    if (row.role === desiredRole && row.method !== input.method) {
      await supabase
        .from("payments")
        .update({
          status: "failed",
          voided_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      writeAuditLog({
        userId: null,
        action: "update",
        entityType: "payment",
        entityId: row.id,
        oldData: { method: row.method, status: row.status },
        newData: { status: "failed", reason: "method_switch" },
      });
    }
  }

  const existing = existingRows.find(
    (p) => p.role === desiredRole && p.method === input.method
  );

  const amountAgorot =
    input.method === "cash_at_reception"
      ? 0
      : service.price_ils;

  // Create-or-reuse payment row.
  let payment: PaymentRow;
  if (existing) {
    payment = existing;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from("payments")
      .insert({
        booking_id: booking.id,
        method: input.method,
        role: desiredRole,
        amount_ils: amountAgorot,
        provider: providerIdForMethod(input.method),
        status: "pending",
      })
      .select("*")
      .single();
    if (insertErr || !inserted) {
      return {
        error: { _form: [insertErr?.message ?? "Failed to create payment row"] },
      };
    }
    payment = inserted as PaymentRow;
  }

  // Dispatch on method.
  if (isCardComMethod(input.method)) {
    const cc = getCardcomProvider();
    const session = await cc.createSession({
      paymentId: payment.id,
      bookingId: booking.id,
      amountAgorot,
      role: desiredRole as "capture" | "card_verification",
      productName: input.productName,
      language: input.language ?? "he",
      customer: contactFromCustomer(customer),
      urls: {
        success: `${input.returnUrlBase}/order/${input.tokenForReturn}/return?r=success&pid=${payment.id}`,
        error: `${input.returnUrlBase}/order/${input.tokenForReturn}/return?r=error&pid=${payment.id}`,
        cancel: `${input.returnUrlBase}/order/${input.tokenForReturn}/return?r=cancel&pid=${payment.id}`,
        indicator: `${input.returnUrlBase}/api/webhooks/cardcom`,
      },
    });

    const { error: updErr } = await supabase
      .from("payments")
      .update({
        provider_tx_id: session.lowProfileCode,
        payment_page_url: session.url,
        invoice_number:
          payment.invoice_number ?? `${payment.id}-1`,
      })
      .eq("id", payment.id);
    if (updErr) {
      return { error: { _form: [updErr.message] } };
    }

    writeAuditLog({
      userId: null,
      action: "create",
      entityType: "payment",
      entityId: payment.id,
      newData: {
        method: input.method,
        role: desiredRole,
        amount_ils: amountAgorot,
        provider: "cardcom",
        lowProfileCode: session.lowProfileCode,
      },
    });

    return {
      success: true,
      data: {
        paymentId: payment.id,
        method: input.method,
        role: desiredRole,
        amountAgorot,
        hostedPage: {
          lowProfileCode: session.lowProfileCode,
          url: session.url,
        },
      } satisfies InitiatePaymentSuccess,
    };
  }

  // voucher_* flows: the row is created and the caller moves to the
  // voucher-specific 2-step UI flow.
  writeAuditLog({
    userId: null,
    action: "create",
    entityType: "payment",
    entityId: payment.id,
    newData: {
      method: input.method,
      role: desiredRole,
      amount_ils: amountAgorot,
      provider: providerIdForMethod(input.method),
    },
  });

  return {
    success: true,
    data: {
      paymentId: payment.id,
      method: input.method,
      role: desiredRole,
      amountAgorot,
    } satisfies InitiatePaymentSuccess,
  };
}

function providerIdForMethod(method: PaymentMethod): string {
  switch (method) {
    case "credit_card_full":
    case "cash_at_reception":
      return "cardcom";
    case "voucher_dts":
      return "dts";
    case "voucher_vpay":
      return "vpay";
  }
}

// ────────────────────────────────────────────────────────────
// confirmFromWebhook — CardCom pull-through verification
// ────────────────────────────────────────────────────────────

export interface ConfirmFromWebhookInput {
  lowProfileCode: string;
  /** Optional raw webhook payload for audit trail. */
  rawWebhook?: Record<string, unknown>;
}

export async function confirmFromWebhook(
  supabase: SupabaseClient,
  input: ConfirmFromWebhookInput
): Promise<ActionResult> {
  // Find the payment row by lowProfileCode (stored on provider_tx_id).
  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_tx_id", input.lowProfileCode)
    .eq("provider", "cardcom")
    .single();
  if (payErr || !pay) {
    return {
      error: {
        _form: [`No payment row for LowProfileCode ${input.lowProfileCode}`],
      },
    };
  }
  const payment = pay as PaymentRow;

  // Pull-through: ask CardCom for authoritative state.
  const cc = getCardcomProvider();
  const indicator = await cc.getLowProfileIndicator(input.lowProfileCode);

  // Already-succeeded short-circuit (idempotent webhook).
  if (payment.status === "success" || payment.status === "authorized") {
    writeAuditLog({
      userId: null,
      action: "payment_webhook",
      entityType: "payment",
      entityId: payment.id,
      newData: { note: "duplicate webhook ignored", lowProfileCode: input.lowProfileCode },
    });
    return { success: true, data: { paymentId: payment.id, idempotent: true } };
  }

  const isVerification = payment.role === "card_verification";
  const validation = isVerification
    ? isSuccessfulTokenVerification(indicator, payment.id)
    : isSuccessfulCapture(indicator, payment.id, payment.amount_ils);

  if (!validation.ok) {
    await supabase
      .from("payments")
      .update({
        status: "failed",
        webhook_payload: sanitizedWebhook(indicator, input.rawWebhook),
      })
      .eq("id", payment.id);
    writeAuditLog({
      userId: null,
      action: "payment_webhook",
      entityType: "payment",
      entityId: payment.id,
      newData: {
        status: "failed",
        reason: validation.reason,
        lowProfileCode: input.lowProfileCode,
      },
    });
    return {
      error: { _form: [`Verification failed: ${validation.reason}`] },
    };
  }

  // Success: update payment row and flip booking to confirmed.
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: isVerification ? "authorized" : "success",
    provider_internal_deal_id: String(indicator.indicator.internalDealNumber),
    card_last4: indicator.shva.cardLast4 || null,
    paid_at: nowIso,
    webhook_payload: sanitizedWebhook(indicator, input.rawWebhook),
  };
  if (isVerification) {
    patch.card_token = indicator.indicator.token ?? null;
    patch.card_token_expires_at = tokenExpiryToDate(
      indicator.indicator.tokenExpiryYYYYMMDD
    );
  }

  const { error: updErr } = await supabase
    .from("payments")
    .update(patch)
    .eq("id", payment.id);
  if (updErr) {
    return { error: { _form: [updErr.message] } };
  }

  // Load booking to set cash_due_agorot if this is a cash verification.
  const { data: bookingData } = await supabase
    .from("bookings")
    .select("*, services(price_ils)")
    .eq("id", payment.booking_id)
    .single();
  const booking = bookingData as
    | (BookingRow & { services: { price_ils: number } | null })
    | null;

  const bookingUpdate: Record<string, unknown> = {
    status: "confirmed",
  };
  if (isVerification && booking?.services) {
    bookingUpdate.cash_due_agorot = booking.services.price_ils;
  }

  const { error: bkgErr } = await supabase
    .from("bookings")
    .update(bookingUpdate)
    .eq("id", payment.booking_id);
  if (bkgErr) {
    return { error: { _form: [bkgErr.message] } };
  }

  writeAuditLog({
    userId: null,
    action: "payment_webhook",
    entityType: "payment",
    entityId: payment.id,
    newData: {
      status: patch.status,
      bookingId: payment.booking_id,
      internalDealNumber: indicator.indicator.internalDealNumber,
      lowProfileCode: input.lowProfileCode,
      isVerification,
    },
  });

  return {
    success: true,
    data: {
      paymentId: payment.id,
      bookingId: payment.booking_id,
      status: patch.status,
      isVerification,
    },
  };
}

function sanitizedWebhook(
  indicator: LowProfileIndicator,
  raw?: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = { indicator };
  if (raw) base.raw = redactIndicatorForStorage(raw);
  return base;
}

function tokenExpiryToDate(yyyymmdd?: string): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// ────────────────────────────────────────────────────────────
// DTS voucher redemption — 2-step flow from /order/<token>
// ────────────────────────────────────────────────────────────

export interface LookupDtsBalanceInput {
  cardNumber: string;
}

export async function lookupDtsBalance(input: LookupDtsBalanceInput) {
  const dts = getDtsProvider();
  return await dts.getBalance(input.cardNumber);
}

export interface RedeemDtsVoucherInput {
  bookingId: string;
  cardNumber: string;
  items: Array<{
    organizationId: string;
    fullBarCode: string;
    posBarcode: string;
    quantity: number;
    name: string;
  }>;
}

export async function redeemDtsVoucher(
  supabase: SupabaseClient,
  input: RedeemDtsVoucherInput
): Promise<ActionResult> {
  const loaded = await loadBookingWithCustomer(supabase, input.bookingId);
  if ("error" in loaded) return { error: { _form: [loaded.error] } };
  const { booking } = loaded;

  if (booking.status !== "pending_payment") {
    return {
      error: {
        _form: [`Booking is not pending payment (status=${booking.status}).`],
      },
    };
  }

  // Find the pending voucher_dts payment row.
  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("method", "voucher_dts")
    .eq("role", "capture")
    .eq("status", "pending");
  if (payErr) return { error: { _form: [payErr.message] } };
  const payment = (payments as PaymentRow[])?.[0];
  if (!payment) {
    return {
      error: { _form: ["No pending DTS payment for this booking"] },
    };
  }

  // Fetch latest customer info from DTS (to get MemberId/OrgId fresh — we
  // never persist these between requests).
  const dts = getDtsProvider();
  const balance = await dts.getBalance(input.cardNumber);

  // Verify requested items are actually redeemable on this card.
  for (const it of input.items) {
    const match = balance.items.find(
      (b) => b.fullBarCode === it.fullBarCode && b.organizationId === it.organizationId
    );
    if (!match) {
      return {
        error: {
          _form: [`Voucher ${it.fullBarCode} not found on card`],
        },
      };
    }
    if (match.quantity < it.quantity) {
      return {
        error: {
          _form: [`Voucher ${it.fullBarCode} has insufficient quantity`],
        },
      };
    }
  }

  const originalRequestId = payment.invoice_number ?? `${payment.id}-dts-1`;

  const result = await dts.useBenefits({
    originalRequestId,
    customer: {
      organizationId: input.items[0].organizationId,
      organizationName: balance.customer.organizationName,
      memberId:
        balance.items.find(
          (b) => b.organizationId === input.items[0].organizationId
        )?.memberId ?? balance.customer.memberId,
      firstName: balance.customer.firstName,
      lastName: balance.customer.lastName,
    },
    items: input.items,
  });

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      status: "success",
      provider_tx_id: result.dtsConfirmationNumber,
      provider_cancel_ref: result.confirmationOrganizationId,
      invoice_number: originalRequestId,
      paid_at: new Date().toISOString(),
      webhook_payload: { redeemed: result.redeemed, cardLast4: maskCardLast4(input.cardNumber) },
    })
    .eq("id", payment.id);
  if (updErr) return { error: { _form: [updErr.message] } };

  const { error: bkgErr } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking.id);
  if (bkgErr) return { error: { _form: [bkgErr.message] } };

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "payment",
    entityId: payment.id,
    newData: {
      method: "voucher_dts",
      dtsConfirmationNumber: result.dtsConfirmationNumber,
      confirmationOrganizationId: result.confirmationOrganizationId,
      itemsCount: input.items.length,
    },
  });

  return { success: true, data: { paymentId: payment.id, bookingId: booking.id } };
}

function maskCardLast4(cardNumber: string): string {
  return cardNumber.slice(-4);
}

// ────────────────────────────────────────────────────────────
// VPay voucher redemption
// ────────────────────────────────────────────────────────────

export interface LookupVpayBalanceInput {
  cardNumber: string;
  cvv: string;
}

export async function lookupVpayBalance(input: LookupVpayBalanceInput) {
  const vp = getVpayProvider();
  return await vp.getBalance(input);
}

export interface RedeemVpayVoucherInput {
  bookingId: string;
  cardNumber: string;
  cvv: string;
  amountAgorot: number;
}

export async function redeemVpayVoucher(
  supabase: SupabaseClient,
  input: RedeemVpayVoucherInput
): Promise<ActionResult> {
  const loaded = await loadBookingWithCustomer(supabase, input.bookingId);
  if ("error" in loaded) return { error: { _form: [loaded.error] } };
  const { booking } = loaded;

  if (booking.status !== "pending_payment") {
    return {
      error: {
        _form: [`Booking is not pending payment (status=${booking.status}).`],
      },
    };
  }

  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("method", "voucher_vpay")
    .eq("role", "capture")
    .eq("status", "pending");
  if (payErr) return { error: { _form: [payErr.message] } };
  const payment = (payments as PaymentRow[])?.[0];
  if (!payment) {
    return {
      error: { _form: ["No pending VPay payment for this booking"] },
    };
  }

  const vp = getVpayProvider();
  const tx = await vp.createTransaction();
  const invoiceNumber = payment.invoice_number ?? `${payment.id}-vpay-1`;

  const result = await vp.withdraw({
    transactionId: tx.transactionId,
    cardNumber: input.cardNumber,
    cvv: input.cvv,
    amountAgorot: input.amountAgorot,
    invoiceNumber,
    metadata: { bookingId: booking.id, paymentId: payment.id },
  });

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      status: "success",
      provider_tx_id: result.actionReference,
      provider_cancel_ref: result.actionReference, // VPay cancels by Withdraw ActionReference
      invoice_number: invoiceNumber,
      amount_ils: input.amountAgorot,
      card_last4: maskCardLast4(input.cardNumber),
      paid_at: new Date().toISOString(),
      webhook_payload: { balanceAfter: result.balanceAfter },
    })
    .eq("id", payment.id);
  if (updErr) return { error: { _form: [updErr.message] } };

  const { error: bkgErr } = await supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking.id);
  if (bkgErr) return { error: { _form: [bkgErr.message] } };

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "payment",
    entityId: payment.id,
    newData: {
      method: "voucher_vpay",
      actionReference: result.actionReference,
      amountAgorot: input.amountAgorot,
    },
  });

  return { success: true, data: { paymentId: payment.id, bookingId: booking.id } };
}

// ────────────────────────────────────────────────────────────
// markCashReceived — staff action at reception
// ────────────────────────────────────────────────────────────

export interface MarkCashReceivedInput {
  bookingId: string;
  amountAgorot: number;
  userId?: string | null;
}

export async function markCashReceived(
  supabase: SupabaseClient,
  input: MarkCashReceivedInput
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", input.bookingId)
    .single();
  if (error || !data) return { error: { _form: ["Booking not found"] } };
  const booking = data as BookingRow;

  if (booking.payment_method !== "cash_at_reception") {
    return {
      error: {
        _form: [
          `Booking payment method is ${booking.payment_method}, not cash_at_reception`,
        ],
      },
    };
  }
  if (booking.status !== "confirmed") {
    return {
      error: {
        _form: [
          `Booking status is ${booking.status}, expected confirmed`,
        ],
      },
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("payments")
    .insert({
      booking_id: booking.id,
      method: "cash_at_reception",
      role: "cash_remainder",
      amount_ils: input.amountAgorot,
      provider: "cash",
      status: "success",
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) return { error: { _form: [insertErr.message] } };

  const newCashDue = Math.max(
    0,
    booking.cash_due_agorot - input.amountAgorot
  );
  const { error: bkgErr } = await supabase
    .from("bookings")
    .update({
      status: "completed",
      cash_due_agorot: newCashDue,
    })
    .eq("id", booking.id);
  if (bkgErr) return { error: { _form: [bkgErr.message] } };

  writeAuditLog({
    userId: input.userId ?? null,
    action: "status_change",
    entityType: "booking",
    entityId: booking.id,
    oldData: { status: "confirmed", cash_due_agorot: booking.cash_due_agorot },
    newData: {
      status: "completed",
      cash_due_agorot: newCashDue,
      cashPaymentId: (inserted as { id: string })?.id,
    },
  });

  return {
    success: true,
    data: { bookingId: booking.id, newCashDueAgorot: newCashDue },
  };
}

// ────────────────────────────────────────────────────────────
// applyCancellationFee — admin-triggered penalty via stored token
// ────────────────────────────────────────────────────────────

export interface ApplyCancellationFeeInput {
  bookingId: string;
  /** Staff override; leave undefined to use the policy calculator. */
  overrideFeeAgorot?: number;
  userId?: string | null;
}

export async function applyCancellationFee(
  supabase: SupabaseClient,
  input: ApplyCancellationFeeInput
): Promise<ActionResult> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", input.bookingId)
    .single();
  if (error || !data) return { error: { _form: ["Booking not found"] } };
  const booking = data as BookingRow;

  if (booking.status !== "cancelled" && booking.status !== "no_show") {
    return {
      error: {
        _form: [
          `Booking status is ${booking.status}; cancellation fees apply only to cancelled or no_show bookings.`,
        ],
      },
    };
  }

  // Locate the verification payment with a card_token we can charge.
  const { data: pays, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", booking.id)
    .eq("role", "card_verification")
    .eq("status", "authorized");
  if (payErr) return { error: { _form: [payErr.message] } };
  const verification = (pays as PaymentRow[])?.[0];
  if (!verification || !verification.card_token) {
    return {
      error: {
        _form: ["No stored card token found; cannot charge a cancellation fee"],
      },
    };
  }

  // Compute the fee (unless overridden).
  const quote = quoteCancellationFee({
    priceAgorot: booking.price_ils,
    bookingStartAt: booking.start_at,
    cancelledAt: new Date(),
    policyVersion: CURRENT_POLICY_VERSION,
  });
  const feeAgorot = input.overrideFeeAgorot ?? quote.feeAgorot;

  if (feeAgorot <= 0) {
    return {
      success: true,
      data: {
        bookingId: booking.id,
        feeAgorot: 0,
        note: "No fee applies under current policy.",
        policyVersion: quote.policyVersion,
      },
    };
  }

  // Check whether we've already captured a penalty on this verification —
  // the unique index on (booking_id, role) doesn't cover this, so we do
  // an explicit existence query.
  const { data: priorPenalty } = await supabase
    .from("payments")
    .select("id, status")
    .eq("booking_id", booking.id)
    .eq("role", "penalty_capture")
    .eq("status", "success")
    .maybeSingle();
  if (priorPenalty) {
    return {
      error: { _form: ["A cancellation fee has already been captured."] },
    };
  }

  // Charge via CardCom stored token.
  const cc = getCardcomProvider();
  const productName = "דמי ביטול - Cancellation fee";
  const pendingId = crypto.randomUUID();
  const charge = await cc.chargeToken({
    paymentId: pendingId,
    token: verification.card_token,
    amountAgorot: feeAgorot,
    productName,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("payments")
    .insert({
      id: pendingId,
      booking_id: booking.id,
      method: "cash_at_reception",
      role: "penalty_capture",
      amount_ils: feeAgorot,
      provider: "cardcom",
      status: "success",
      provider_tx_id: String(charge.internalDealNumber),
      provider_internal_deal_id: String(charge.internalDealNumber),
      card_last4: verification.card_last4,
      paid_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insertErr) return { error: { _form: [insertErr.message] } };

  writeAuditLog({
    userId: input.userId ?? null,
    action: "create",
    entityType: "payment",
    entityId: (inserted as { id: string })?.id,
    newData: {
      role: "penalty_capture",
      feeAgorot,
      policyVersion: quote.policyVersion,
      internalDealNumber: charge.internalDealNumber,
      overridden: input.overrideFeeAgorot !== undefined,
    },
  });

  return {
    success: true,
    data: {
      bookingId: booking.id,
      feeAgorot,
      internalDealNumber: charge.internalDealNumber,
      policyVersion: quote.policyVersion,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Hold expiry sweeper — called by Vercel Cron (commit 21)
// ────────────────────────────────────────────────────────────

export interface ExpireHoldsResult {
  expiredBookingIds: string[];
  revokedLowProfileCodes: string[];
  errors: Array<{ bookingId: string; message: string }>;
}

export async function expireHolds(
  supabase: SupabaseClient,
  opts: { now?: Date } = {}
): Promise<ExpireHoldsResult> {
  const nowIso = (opts.now ?? new Date()).toISOString();
  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "pending_payment")
    .lt("hold_expires_at", nowIso)
    .limit(500);

  if (error) {
    return {
      expiredBookingIds: [],
      revokedLowProfileCodes: [],
      errors: [{ bookingId: "*", message: error.message }],
    };
  }

  const result: ExpireHoldsResult = {
    expiredBookingIds: [],
    revokedLowProfileCodes: [],
    errors: [],
  };

  for (const row of (rows ?? []) as Array<{ id: string }>) {
    try {
      // Revoke any open CardCom session first (best-effort).
      const { data: pays } = await supabase
        .from("payments")
        .select("id, provider, provider_tx_id, status")
        .eq("booking_id", row.id)
        .eq("status", "pending")
        .eq("provider", "cardcom");
      const cc = getCardcomProvider();
      for (const p of (pays ?? []) as Array<{
        id: string;
        provider_tx_id: string | null;
      }>) {
        if (p.provider_tx_id) {
          try {
            await cc.revokeLowProfileDeal(p.provider_tx_id);
            result.revokedLowProfileCodes.push(p.provider_tx_id);
          } catch (err) {
            // Non-fatal — proceed to cancel the booking anyway.
            console.warn(
              `[expireHolds] revoke failed for ${p.provider_tx_id}:`,
              (err as Error).message
            );
          }
        }
      }

      const { error: bkgErr } = await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Hold expired",
        })
        .eq("id", row.id)
        .eq("status", "pending_payment"); // guard against races
      if (bkgErr) {
        result.errors.push({ bookingId: row.id, message: bkgErr.message });
        continue;
      }

      // Void any payments rows still pending for this booking.
      await supabase
        .from("payments")
        .update({ status: "failed", voided_at: new Date().toISOString() })
        .eq("booking_id", row.id)
        .in("status", ["pending", "authorized"]);

      writeAuditLog({
        userId: null,
        action: "status_change",
        entityType: "booking",
        entityId: row.id,
        oldData: { status: "pending_payment" },
        newData: { status: "cancelled", cancel_reason: "Hold expired" },
      });

      result.expiredBookingIds.push(row.id);
    } catch (err) {
      result.errors.push({
        bookingId: row.id,
        message: (err as Error).message,
      });
    }
  }

  return result;
}
