import Link from "next/link";
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
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { Plus } from "lucide-react";

export default async function BookingsPage() {
  const bookings = await getBookings();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookings</h1>
        <Link href="/admin/bookings/new" className={cn(buttonVariants(), "gap-1")}>
          <Plus className="h-4 w-4" />
          New Booking
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookings yet. Create one to get started.
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
                        <div>{formatInTimeZone(new Date(booking.start_at), TZ, "MMM d, yyyy")}</div>
                        <div className="text-muted-foreground">
                          {formatInTimeZone(new Date(booking.start_at), TZ, "HH:mm")}–
                          {formatInTimeZone(new Date(booking.end_at), TZ, "HH:mm")}
                        </div>
                      </td>
                      <td className="py-3">{booking.customers?.full_name || "-"}</td>
                      <td className="py-3">{booking.services?.name || "-"}</td>
                      <td className="py-3">
                        {booking.therapists && (
                          <span className="flex items-center gap-1.5">
                            {booking.therapists.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: booking.therapists.color }}
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
        </CardContent>
      </Card>
    </div>
  );
}
