import { getBooking } from "@/lib/actions/bookings";
import { BookingDetail } from "@/components/admin/booking/booking-detail";
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
      <div className="mt-6">
        <BookingDetail booking={booking} />
      </div>
    </div>
  );
}
