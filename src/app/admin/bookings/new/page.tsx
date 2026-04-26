import { BookingForm } from "@/components/admin/booking/booking-form";
import { getBookingFormData } from "@/lib/actions/bookings";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

interface Params {
  date?: string;
  start?: string;
  therapist_id?: string;
}

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sp = await searchParams;
  const formData = await getBookingFormData();
  const t = await getTranslations();

  return (
    <div>
      <Link
        href="/admin/bookings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("admin.bookings.newPage.back")}
      </Link>
      <h1 className="text-2xl font-bold">
        {t("admin.bookings.newPage.title")}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {t("admin.bookings.newPage.subtitle")}
      </p>
      <div className="mt-6">
        <BookingForm
          formData={formData}
          prefill={{
            date: sp.date,
            start: sp.start,
            therapistId: sp.therapist_id,
          }}
        />
      </div>
    </div>
  );
}
