import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderToken } from "@/lib/payments/jwt";
import { isHoldExpired } from "@/lib/payments/hold";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";
import { OrderPage } from "@/components/order/order-page";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Server-side loader for /order/[token]. Does three jobs:
 *   1. Verify the JWT signature + expiry.
 *   2. Load booking + customer + service joined in one round-trip
 *      via the service-role client (pay page is anonymous — RLS
 *      does not permit anon reads of bookings).
 *   3. Check the booking is still pending_payment and the hold has
 *      not expired. If either is off, render the "session expired"
 *      state instead of the order UI.
 */
export default async function OrderTokenPage({ params }: PageProps) {
  const { token } = await params;

  const verified = await verifyOrderToken(token);
  if (!verified.ok) {
    return renderExpired(
      verified.reason === "expired"
        ? he.order.errors.tokenExpired
        : he.order.errors.tokenInvalid
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, start_at, end_at, price_ils, notes, hold_expires_at, payment_method, therapist_gender_preference, customers(id, full_name, phone, email), services(id, name, duration_minutes, price_ils)"
    )
    .eq("id", verified.claims.bid)
    .single();

  if (error || !data) {
    return renderExpired(he.order.errors.bookingNotFound);
  }

  // Narrow the joined shape. Supabase typing defaults to array-of-joined
  // but the runtime always returns a single object for these FKs.
  const booking = data as unknown as {
    id: string;
    status: string;
    start_at: string;
    end_at: string;
    price_ils: number;
    notes: string | null;
    hold_expires_at: string | null;
    payment_method:
      | "credit_card_full"
      | "cash_at_reception"
      | "voucher_dts"
      | "voucher_vpay"
      | null;
    therapist_gender_preference: "male" | "female" | "any";
    customers: {
      id: string;
      full_name: string;
      phone: string;
      email: string | null;
    } | null;
    services: {
      id: string;
      name: string;
      duration_minutes: number;
      price_ils: number;
    } | null;
  };

  if (!booking.customers || !booking.services) {
    return renderExpired(he.common.errorGeneric);
  }

  // Status / hold guards. Keep the message generic to avoid leaking
  // booking-lifecycle details to anonymous callers.
  if (booking.status !== "pending_payment") {
    return renderExpired(he.order.holdExpired.body);
  }
  if (isHoldExpired(booking.hold_expires_at)) {
    return renderExpired(he.order.holdExpired.body);
  }

  return (
    <OrderPage
      token={token}
      booking={{
        id: booking.id,
        startAt: booking.start_at,
        endAt: booking.end_at,
        priceAgorot: booking.price_ils,
        notes: booking.notes ?? "",
        holdExpiresAt: booking.hold_expires_at,
        paymentMethod: booking.payment_method,
        genderPreference: booking.therapist_gender_preference,
      }}
      customer={{
        fullName: booking.customers.full_name,
        phone: booking.customers.phone,
        email: booking.customers.email ?? "",
      }}
      service={{
        name: booking.services.name,
        durationMinutes: booking.services.duration_minutes,
        priceAgorot: booking.services.price_ils,
      }}
    />
  );
}

function renderExpired(message: string) {
  return (
    <div className="space-y-6 text-center">
      <h1 className="text-2xl font-bold">{he.order.holdExpired.heading}</h1>
      <p className="text-stone-700">{message}</p>
      <Link
        href="/book"
        className={cn(buttonVariants({ variant: "default" }), "inline-flex")}
      >
        {he.order.holdExpired.ctaRestart}
      </Link>
    </div>
  );
}
