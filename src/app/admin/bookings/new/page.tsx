import { BookingForm } from "@/components/admin/booking/booking-form";
import { getBookingFormData } from "@/lib/actions/bookings";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NewBookingPage() {
  const formData = await getBookingFormData();

  return (
    <div>
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to bookings
      </Link>
      <h1 className="text-2xl font-bold">New Booking</h1>
      <p className="mt-1 text-muted-foreground">
        Select a service, then pick from available slots or enter a custom time.
      </p>
      <div className="mt-6">
        <BookingForm formData={formData} />
      </div>
    </div>
  );
}
