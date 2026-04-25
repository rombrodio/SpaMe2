import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderToken } from "@/lib/payments/jwt";
import { sendSms } from "@/lib/messaging/twilio";
import { buildBookingConfirmedSms } from "@/lib/messaging/templates/booking-confirmed-sms";
import { notifyManagerUnassigned } from "@/lib/messaging/notify";
import { writeAuditLog } from "@/lib/audit";
import { getAppUrl } from "@/lib/app-url";
import {
  he,
  formatDateTimeILFull,
  formatIlsFromAgorot,
} from "@/lib/i18n/he";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Final landing screen. By the time the customer is here:
 *   * The webhook (or voucher redeem action) has already flipped the
 *     payment to success/authorized AND the booking to confirmed.
 *   * We fire the Twilio confirmation SMS exactly once, gated by
 *     bookings.sms_sent_at so a refresh / second visit doesn't
 *     re-send.
 *
 * If the customer somehow lands here while the booking is still
 * pending_payment, we render a generic "almost done" state with a
 * link to the order page.
 */
export default async function OrderSuccessPage({ params }: PageProps) {
  const { token } = await params;

  const verified = await verifyOrderToken(token);
  if (!verified.ok) {
    return shell({
      heading: he.order.holdExpired.heading,
      body:
        verified.reason === "expired"
          ? he.order.errors.tokenExpired
          : he.order.errors.tokenInvalid,
    });
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, start_at, sms_sent_at, assignment_status, manager_alerted_at, therapist_gender_preference, customers(phone), services(name, duration_minutes, price_ils)"
    )
    .eq("id", verified.claims.bid)
    .single();

  if (!booking) {
    return shell({
      heading: he.order.holdExpired.heading,
      body: he.order.errors.bookingNotFound,
    });
  }

  // Narrow the joined shape.
  const row = booking as unknown as {
    id: string;
    status: string;
    start_at: string;
    sms_sent_at: string | null;
    assignment_status: "unassigned" | "pending_confirmation" | "confirmed" | "declined";
    manager_alerted_at: string | null;
    therapist_gender_preference: "male" | "female" | "any";
    customers: { phone: string } | null;
    services: {
      name: string;
      duration_minutes: number;
      price_ils: number;
    } | null;
  };

  if (row.status !== "confirmed" && row.status !== "completed") {
    return shell({
      heading: he.order.cardcom.waiting,
      body: he.order.cardcom.waiting,
      cta: (
        <Link
          href={`/order/${token}/return`}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          {he.common.tryAgain}
        </Link>
      ),
    });
  }

  // Fire the SMS once. We update sms_sent_at BEFORE awaiting the SMS
  // call so a concurrent second render doesn't double-send.
  if (!row.sms_sent_at && row.customers?.phone && row.services) {
    await admin
      .from("bookings")
      .update({ sms_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("sms_sent_at", null);

    const smsResult = await sendSms({
      to: row.customers.phone,
      body: buildBookingConfirmedSms({
        serviceName: row.services.name,
        startAt: row.start_at,
      }),
    });

    writeAuditLog({
      userId: null,
      action: "update",
      entityType: "booking",
      entityId: row.id,
      newData: {
        sms_sent: smsResult.ok,
        smsReason: smsResult.ok ? null : smsResult.reason,
      },
    });
    // SMS failure is non-fatal — staff can resend from admin (commit 23).
  }

  // Notify the on-call manager — paid booking still needs a therapist.
  // Same idempotency pattern as sms_sent_at: stamp the column first so a
  // concurrent render can't double-send. We only ping for rows that are
  // still unassigned at the time this page renders; once the manager
  // picks a therapist the flag stays stamped and nothing refires.
  if (
    row.assignment_status === "unassigned" &&
    !row.manager_alerted_at &&
    row.services
  ) {
    await admin
      .from("bookings")
      .update({ manager_alerted_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("manager_alerted_at", null);

    const appUrl = getAppUrl();
    await notifyManagerUnassigned({
      bookingId: row.id,
      serviceName: row.services.name,
      startAt: row.start_at,
      genderPreference: row.therapist_gender_preference,
      assignUrl: `${appUrl}/admin/assignments?bookingId=${row.id}`,
    });
    // Notification failure is non-fatal and already audit-logged inside
    // notifyManagerUnassigned.
  }

  return shell({
    heading: he.order.success.heading,
    body: he.order.success.body,
    summary: row.services
      ? {
          serviceName: row.services.name,
          durationMinutes: row.services.duration_minutes,
          startAt: row.start_at,
          priceAgorot: row.services.price_ils,
        }
      : null,
  });
}

interface ShellProps {
  heading: string;
  body: string;
  summary?: {
    serviceName: string;
    durationMinutes: number;
    startAt: string;
    priceAgorot: number;
  } | null;
  cta?: React.ReactNode;
}

function shell({ heading, body, summary, cta }: ShellProps) {
  return (
    <div className="space-y-6">
      <header className="text-center">
        <div
          className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          aria-hidden
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            className="h-7 w-7"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-stone-600">{body}</p>
      </header>

      {summary && (
        <section className="rounded-md border border-stone-200 bg-white p-4">
          <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-stone-600">{he.order.summary.serviceLabel}</dt>
            <dd className="font-medium">
              {summary.serviceName}{" "}
              <span className="text-stone-500">
                · {he.book.stepService.minutes(summary.durationMinutes)}
              </span>
            </dd>
            <dt className="text-stone-600">{he.order.summary.dateTimeLabel}</dt>
            <dd className="font-medium">
              {formatDateTimeILFull(summary.startAt)}
            </dd>
            <dt className="text-stone-600">{he.book.stepService.priceLabel}</dt>
            <dd className="font-semibold">
              {formatIlsFromAgorot(summary.priceAgorot)}
            </dd>
          </dl>
        </section>
      )}

      {cta}
    </div>
  );
}
