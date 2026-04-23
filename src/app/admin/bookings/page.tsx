import Link from "next/link";
import { getBookings, getBookingFormData } from "@/lib/actions/bookings";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import { BookingsFilterBar } from "@/components/admin/bookings/filter-bar";
import { Pager } from "@/components/admin/bookings/pager";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { Plus } from "lucide-react";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  status?: string;
  therapist_id?: string;
  from?: string;
  to?: string;
  page?: string;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  // Dates arrive as YYYY-MM-DD; expand to full-day ISO bounds.
  const fromIso = sp.from ? `${sp.from}T00:00:00Z` : undefined;
  const toIso = sp.to ? `${sp.to}T23:59:59Z` : undefined;

  const [{ rows: bookings, total }, { therapists }] = await Promise.all([
    getBookings({
      q: sp.q,
      status: sp.status,
      therapist_id: sp.therapist_id,
      from: fromIso,
      to: toIso,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    getBookingFormData(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <Link href="/admin/bookings/new" className={cn(buttonVariants(), "gap-1")}>
          <Plus className="h-4 w-4" />
          New Booking
        </Link>
      </div>

      <div className="mt-6">
        <BookingsFilterBar therapists={therapists} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            {total === 0 ? "No bookings match" : `${total} bookings`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookings match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Date & Time</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Service</th>
                    <th className="pb-2 font-medium">Therapist</th>
                    <th className="pb-2 font-medium">Room</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-b last:border-0">
                      <td className="py-3">
                        <div>
                          {formatInTimeZone(
                            new Date(booking.start_at),
                            TZ,
                            "MMM d, yyyy"
                          )}
                        </div>
                        <div className="text-muted-foreground">
                          {formatInTimeZone(new Date(booking.start_at), TZ, "HH:mm")}–
                          {formatInTimeZone(new Date(booking.end_at), TZ, "HH:mm")}
                        </div>
                      </td>
                      <td className="py-3">
                        {booking.customers?.full_name || "-"}
                      </td>
                      <td className="py-3">{booking.services?.name || "-"}</td>
                      <td className="py-3">
                        {booking.therapists && (
                          <span className="flex items-center gap-1.5">
                            {booking.therapists.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor: booking.therapists.color,
                                }}
                              />
                            )}
                            {booking.therapists.full_name}
                          </span>
                        )}
                      </td>
                      <td className="py-3">{booking.rooms?.name || "-"}</td>
                      <td className="py-3">
                        <StatusBadge status={booking.status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/admin/bookings/${booking.id}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" })
                          )}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} pageSize={PAGE_SIZE} total={total} />
        </CardContent>
      </Card>
    </div>
  );
}
