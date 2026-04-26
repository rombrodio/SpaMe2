import { getBooking, getBookingFormData } from "@/lib/actions/bookings";
import { BookingDetail } from "@/components/admin/booking/booking-detail";
import { PaymentPanel } from "@/components/admin/booking/payment-panel";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { getTranslations } from "next-intl/server";
import { TZ } from "@/lib/constants";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let booking;
  try {
    booking = await getBooking(id);
  } catch {
    notFound();
  }

  // Therapists + rooms for the reschedule slot picker (DEF-008).
  const { therapists, rooms } = await getBookingFormData();
  const t = await getTranslations();

  // Extract the fields the PaymentPanel needs; leave `booking` untouched
  // so BookingDetail still receives the richer shape it expects.
  const extended = booking as unknown as {
    status: string;
    payment_method: string | null;
    cash_due_agorot: number | null;
    services:
      | { price_ils: number }
      | Array<{ price_ils: number }>
      | null;
  };
  const svc = Array.isArray(extended.services)
    ? extended.services[0]
    : extended.services;
  const servicePriceAgorot = svc?.price_ils ?? 0;

  const crumbLabel = (() => {
    const b = booking as unknown as {
      customers?: { full_name: string | null } | null;
      start_at?: string;
    };
    const name =
      b.customers?.full_name ?? t("admin.bookings.detail.fallbackCrumb");
    if (!b.start_at) return name;
    return `${name} — ${formatInTimeZone(
      new Date(b.start_at),
      TZ,
      "MMM d"
    )}`;
  })();

  return (
    <div>
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: t("admin.bookings.crumb"), href: "/admin/bookings" },
          { label: crumbLabel },
        ]}
      />
      <h1 className="text-2xl font-bold">
        {t("admin.bookings.detail.title")}
      </h1>
      <div className="mt-6 space-y-6">
        <BookingDetail booking={booking} therapists={therapists} rooms={rooms} />
        <PaymentPanel
          bookingId={id}
          bookingStatus={extended.status}
          paymentMethod={extended.payment_method}
          cashDueAgorot={extended.cash_due_agorot ?? 0}
          servicePriceAgorot={servicePriceAgorot}
        />
      </div>
    </div>
  );
}
