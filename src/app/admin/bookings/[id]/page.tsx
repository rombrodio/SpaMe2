import { getBooking } from "@/lib/actions/bookings";
import { BookingDetail } from "@/components/admin/booking/booking-detail";
import { PaymentPanel } from "@/components/admin/booking/payment-panel";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";

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

  return (
    <div>
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to bookings
      </Link>
      <h1 className="text-2xl font-bold">Booking Details</h1>
      <div className="mt-6 space-y-6">
        <BookingDetail booking={booking} />
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
