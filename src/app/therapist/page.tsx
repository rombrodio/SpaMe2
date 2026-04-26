import { getTranslations, getLocale } from "next-intl/server";
import { getBookings } from "@/lib/actions/bookings";
import { getMyPendingConfirmations } from "@/lib/actions/assignments";
import { getCurrentTherapistId } from "@/lib/auth/current-therapist";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/therapist/change-password-card";
import { PendingConfirmationsCard } from "@/components/therapist/pending-confirmations-card";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type { Locale } from "@/i18n/config";

interface PageProps {
  searchParams: Promise<{ bookingId?: string }>;
}

function intlLocale(locale: Locale): string {
  return locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
}

export default async function TherapistDashboard({ searchParams }: PageProps) {
  const therapistId = await getCurrentTherapistId();
  const sp = await searchParams;
  const now = new Date().toISOString();
  const t = await getTranslations("therapist.dashboard");
  const locale = (await getLocale()) as Locale;

  const [bookingsResult, pending] = await Promise.all([
    getBookings({ therapist_id: therapistId, from: now, limit: 200 }),
    getMyPendingConfirmations(),
  ]);

  const upcoming = bookingsResult.rows
    .filter((b: { status: string }) => b.status !== "cancelled")
    .sort(
      (
        a: { start_at: string },
        b: { start_at: string }
      ) => a.start_at.localeCompare(b.start_at)
    );

  // Localised short-date formatter for the Date & Time column so the
  // month renders in the active locale (Hebrew "אפר׳" vs English "Apr").
  const fmtDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subheading")}</p>
      </div>

      <PendingConfirmationsCard
        items={pending}
        highlightBookingId={sp.bookingId}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("upcoming")}</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t("columns.dateTime")}</th>
                    <th className="pb-2 font-medium">{t("columns.customer")}</th>
                    <th className="pb-2 font-medium">{t("columns.service")}</th>
                    <th className="pb-2 font-medium">{t("columns.room")}</th>
                    <th className="pb-2 font-medium">{t("columns.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((booking: {
                    id: string;
                    start_at: string;
                    end_at: string;
                    status: string;
                    customers: { full_name: string } | null;
                    rooms: { name: string } | null;
                    services: {
                      name: string;
                      duration_minutes: number;
                    } | null;
                  }) => (
                    <tr key={booking.id} className="border-b last:border-0">
                      <td className="py-3">
                        <div>{fmtDate.format(new Date(booking.start_at))}</div>
                        <div className="text-muted-foreground">
                          {formatInTimeZone(
                            new Date(booking.start_at),
                            TZ,
                            "HH:mm"
                          )}
                          –
                          {formatInTimeZone(
                            new Date(booking.end_at),
                            TZ,
                            "HH:mm"
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        {booking.customers?.full_name || "-"}
                      </td>
                      <td className="py-3">
                        {booking.services?.name || "-"}
                      </td>
                      <td className="py-3">{booking.rooms?.name || "-"}</td>
                      <td className="py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}
