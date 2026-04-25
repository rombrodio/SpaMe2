import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BookingForm } from "@/components/admin/booking/booking-form";
import {
  getBookingFormData,
  createReceptionistBookingAction,
} from "@/lib/actions/bookings";

export const dynamic = "force-dynamic";

interface Params {
  date?: string;
  start?: string;
  therapist_id?: string;
}

export default async function NewReceptionBookingPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const formData = await getBookingFormData();

  return (
    <div>
      <Link
        href="/reception"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">New booking</h1>
      <p className="mt-1 text-muted-foreground">
        Create a booking on behalf of a customer. Leave the therapist
        unassigned if you don&apos;t have someone specific in mind — the
        manager will assign one after payment.
      </p>
      <div className="mt-6">
        <BookingForm
          formData={formData}
          prefill={{
            date: sp.date,
            start: sp.start,
            therapistId: sp.therapist_id,
          }}
          submitAction={createReceptionistBookingAction}
          successRedirect="/reception"
        />
      </div>
    </div>
  );
}
