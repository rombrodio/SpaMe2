import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { getBookings } from "@/lib/actions/bookings";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import { SourceBadge } from "@/components/admin/booking/source-badge";
import { Pager } from "@/components/admin/bookings/pager";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { Plus } from "lucide-react";
import type { Locale } from "@/i18n/config";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

interface SearchParams {
  status?: string;
  assignment_status?: string;
  page?: string;
}

function intlLocale(locale: Locale): string {
  return locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
}

/**
 * Read-only bookings list for the reception portal. Filters are
 * deliberately narrower than /admin/bookings (no therapist filter,
 * no date range) because the receptionist surface is about reacting
 * to the shared queue, not slicing for reporting.
 */
export default async function ReceptionBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const t = await getTranslations("reception.bookings");
  const locale = (await getLocale()) as Locale;

  const { rows: bookings, total } = await getBookings({
    status: sp.status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  // Assignment-status filter isn't supported by getBookings today, so
  // we apply it client-side on the fetched page. Good enough while
  // unassigned volume stays small; Phase 8 will revisit if needed.
  const filtered =
    sp.assignment_status === "unassigned"
      ? bookings.filter(
          (b: { assignment_status: string | null }) =>
            b.assignment_status === "unassigned"
        )
      : bookings;

  // Localised short-date / time so columns read correctly in HE vs EN.
  const fmtDate = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link
          href="/reception/bookings/new"
          className={cn(buttonVariants(), "gap-1")}
        >
          <Plus className="h-4 w-4" />
          {t("newBookingCta")}
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            {total === 0
              ? t("countNone")
              : t("countSome", { count: total })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">{t("columns.dateTime")}</th>
                    <th className="pb-2 font-medium">{t("columns.customer")}</th>
                    <th className="pb-2 font-medium">{t("columns.service")}</th>
                    <th className="pb-2 font-medium">{t("columns.therapist")}</th>
                    <th className="pb-2 font-medium">{t("columns.status")}</th>
                    <th className="pb-2 font-medium">{t("columns.source")}</th>
                    <th className="pb-2 font-medium">{t("columns.created")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((booking) => (
                    <tr key={booking.id} className="border-b last:border-0">
                      <td className="py-3">
                        <div>
                          {fmtDate.format(new Date(booking.start_at))}
                        </div>
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
                      <td className="py-3">
                        {booking.therapists ? (
                          booking.therapists.full_name
                        ) : (
                          <span className="text-muted-foreground">
                            {t("unassigned")}
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="py-3">
                        <SourceBadge source={booking.source} />
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatInTimeZone(
                          new Date(booking.created_at),
                          TZ,
                          "MMM d, HH:mm"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/reception/bookings"
          />
        </CardContent>
      </Card>
    </div>
  );
}
