"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderToken } from "@/lib/payments/jwt";
import {
  initiatePaymentSchema,
  lookupVoucherBalanceSchema,
  redeemDtsVoucherSchema,
  redeemVpayVoucherSchema,
  markCashReceivedSchema,
  applyCancellationFeeSchema,
  updateOrderDetailsSchema,
} from "@/lib/schemas/payment";
import {
  initiatePayment,
  lookupDtsBalance,
  lookupVpayBalance,
  redeemDtsVoucher,
  redeemVpayVoucher,
  markCashReceived,
  applyCancellationFee,
} from "@/lib/payments/engine";
import { writeAuditLog } from "@/lib/audit";
import { DtsError } from "@/lib/payments/dts";
import { VpayProxyError } from "@/lib/payments/vpay";
import { CardComError } from "@/lib/payments/cardcom";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function returnUrlBase(): string {
  return (
    process.env.CARDCOM_RETURN_URL_BASE ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

/**
 * Verify the order-token attached to a pay-page request, confirm it
 * matches the booking_id in the form body, and return the claims.
 */
async function requireOrderToken(token: string, bookingId: string) {
  const result = await verifyOrderToken(token);
  if (!result.ok) {
    return {
      error: { _form: [`Session token ${result.reason}. Please restart.`] },
    };
  }
  if (result.claims.bid !== bookingId) {
    return { error: { _form: ["Token does not match this booking."] } };
  }
  return { claims: result.claims };
}

/** Pick one side of an ActionResult for a voucher/card-error surfacing. */
function friendlyProviderErrorMessage(err: unknown): string {
  if (err instanceof DtsError || err instanceof VpayProxyError) {
    return err.friendlyMessage || err.message;
  }
  if (err instanceof CardComError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown provider error";
}

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: { _form: ["Not authenticated"] } };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "super_admin") {
    return { error: { _form: ["Not authorized"] } };
  }
  return { user, supabase };
}

// ────────────────────────────────────────────────────────────
// /order/<token> actions — anonymous callers; token-authorized
// ────────────────────────────────────────────────────────────

export async function initiatePaymentAction(input: {
  token: string;
  booking_id: string;
  method: "credit_card_full" | "cash_at_reception" | "voucher_dts" | "voucher_vpay";
  product_name: string;
}) {
  const parsed = initiatePaymentSchema.safeParse({
    booking_id: input.booking_id,
    method: input.method,
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const auth = await requireOrderToken(input.token, parsed.data.booking_id);
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  const result = await initiatePayment(admin, {
    bookingId: parsed.data.booking_id,
    method: parsed.data.method,
    returnUrlBase: returnUrlBase(),
    tokenForReturn: input.token,
    productName: input.product_name,
    language: "he",
  });
  return result;
}

export async function lookupVoucherBalanceAction(input: {
  token: string;
  booking_id: string;
  provider: "dts" | "vpay";
  card_number: string;
  cvv?: string;
}) {
  const parsed = lookupVoucherBalanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const auth = await requireOrderToken(input.token, parsed.data.booking_id);
  if ("error" in auth) return auth;

  try {
    if (parsed.data.provider === "dts") {
      const balance = await lookupDtsBalance({
        cardNumber: parsed.data.card_number,
      });
      return {
        success: true,
        data: { provider: "dts", ...balance },
      };
    }
    if (!parsed.data.cvv) {
      return { error: { cvv: ["CVV is required for VPay"] } };
    }
    const balance = await lookupVpayBalance({
      cardNumber: parsed.data.card_number,
      cvv: parsed.data.cvv,
    });
    return {
      success: true,
      data: { provider: "vpay", ...balance },
    };
  } catch (err) {
    return { error: { _form: [friendlyProviderErrorMessage(err)] } };
  }
}

export async function redeemDtsVoucherAction(input: {
  token: string;
  booking_id: string;
  card_number: string;
  items: Array<{
    organization_id: string;
    full_bar_code: string;
    pos_barcode: string;
    quantity: number;
    name: string;
  }>;
}) {
  const parsed = redeemDtsVoucherSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const auth = await requireOrderToken(input.token, parsed.data.booking_id);
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  try {
    const res = await redeemDtsVoucher(admin, {
      bookingId: parsed.data.booking_id,
      cardNumber: parsed.data.card_number,
      items: parsed.data.items.map((i) => ({
        organizationId: i.organization_id,
        fullBarCode: i.full_bar_code,
        posBarcode: i.pos_barcode,
        quantity: i.quantity,
        name: i.name,
      })),
    });
    if ("success" in res && res.success) {
      revalidatePath(`/order/${input.token}`);
    }
    return res;
  } catch (err) {
    return { error: { _form: [friendlyProviderErrorMessage(err)] } };
  }
}

export async function redeemVpayVoucherAction(input: {
  token: string;
  booking_id: string;
  card_number: string;
  cvv: string;
  amount_agorot: number;
}) {
  const parsed = redeemVpayVoucherSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const auth = await requireOrderToken(input.token, parsed.data.booking_id);
  if ("error" in auth) return auth;

  const admin = createAdminClient();
  try {
    const res = await redeemVpayVoucher(admin, {
      bookingId: parsed.data.booking_id,
      cardNumber: parsed.data.card_number,
      cvv: parsed.data.cvv,
      amountAgorot: parsed.data.amount_agorot,
    });
    if ("success" in res && res.success) {
      revalidatePath(`/order/${input.token}`);
    }
    return res;
  } catch (err) {
    return { error: { _form: [friendlyProviderErrorMessage(err)] } };
  }
}

export async function updateOrderDetailsAction(input: {
  token: string;
  booking_id: string;
  full_name?: string;
  email?: string;
  notes?: string;
}) {
  const parsed = updateOrderDetailsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const auth = await requireOrderToken(input.token, parsed.data.booking_id);
  if ("error" in auth) return auth;

  const admin = createAdminClient();

  // Load the booking to find customer_id for the name/email update.
  const { data: booking, error: bkgErr } = await admin
    .from("bookings")
    .select("id, customer_id, notes, status")
    .eq("id", parsed.data.booking_id)
    .single();
  if (bkgErr || !booking) {
    return { error: { _form: ["Booking not found"] } };
  }
  if (booking.status !== "pending_payment") {
    return {
      error: {
        _form: ["Booking is no longer editable from this page."],
      },
    };
  }

  const customerPatch: Record<string, unknown> = {};
  if (parsed.data.full_name) customerPatch.full_name = parsed.data.full_name;
  if (parsed.data.email !== undefined && parsed.data.email !== "") {
    customerPatch.email = parsed.data.email;
  }

  if (Object.keys(customerPatch).length > 0) {
    const { error: custErr } = await admin
      .from("customers")
      .update(customerPatch)
      .eq("id", booking.customer_id);
    if (custErr) return { error: { _form: [custErr.message] } };
  }

  if (parsed.data.notes !== undefined) {
    const { error: notesErr } = await admin
      .from("bookings")
      .update({ notes: parsed.data.notes === "" ? null : parsed.data.notes })
      .eq("id", booking.id);
    if (notesErr) return { error: { _form: [notesErr.message] } };
  }

  writeAuditLog({
    userId: null,
    action: "update",
    entityType: "booking",
    entityId: booking.id,
    newData: { source: "pay_page_inline_edit", ...customerPatch, notes: parsed.data.notes },
  });

  return { success: true, data: { bookingId: booking.id } };
}

// ────────────────────────────────────────────────────────────
// Admin-only actions (staff / super_admin)
// ────────────────────────────────────────────────────────────

export async function markCashReceivedAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = markCashReceivedSchema.safeParse({
    booking_id: raw.booking_id,
    amount_agorot: raw.amount_agorot
      ? Number.parseInt(String(raw.amount_agorot), 10)
      : undefined,
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard;

  const result = await markCashReceived(guard.supabase, {
    bookingId: parsed.data.booking_id,
    amountAgorot: parsed.data.amount_agorot,
    userId: guard.user.id,
  });

  if ("success" in result && result.success) {
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/calendar");
  }
  return result;
}

export async function applyCancellationFeeAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = applyCancellationFeeSchema.safeParse({
    booking_id: raw.booking_id,
    override_fee_agorot: raw.override_fee_agorot
      ? Number.parseInt(String(raw.override_fee_agorot), 10)
      : undefined,
  });
  if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };

  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard;

  try {
    const result = await applyCancellationFee(guard.supabase, {
      bookingId: parsed.data.booking_id,
      overrideFeeAgorot: parsed.data.override_fee_agorot,
      userId: guard.user.id,
    });
    if ("success" in result && result.success) {
      revalidatePath("/admin/bookings");
    }
    return result;
  } catch (err) {
    return { error: { _form: [friendlyProviderErrorMessage(err)] } };
  }
}

// ────────────────────────────────────────────────────────────
// Admin read: payment rows + cancellation fee preview
// ────────────────────────────────────────────────────────────

export async function getPaymentsForBooking(bookingId: string) {
  const guard = await requireSuperAdmin();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });
  if (error) return { error: { _form: [error.message] } };
  return { success: true, data: { rows: data ?? [] } };
}
