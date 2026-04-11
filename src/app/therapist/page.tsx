import { getBookings } from "@/lib/actions/bookings";
import { getCurrentTherapistId } from "@/lib/auth/current-therapist";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordCard } from "@/components/therapist/change-password-card";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";

export default async function TherapistDashboard() {
  const therapistId = await getCurrentTherapistId();
  const now = new Date().toISOString();
  const bookings = await getBookings({
    therapist_id: therapistId,
    from: now,
  });

  const upcoming = bookings
    .filter((b: { status: string }) => b.status !== "cancelled")
    .sort(
      (
        a: { start_at: string },
        b: { start_at: string }
      ) => a.start_at.localeCompare(b.start_at)
    );

  return (
    <div>
      <h1 className="text-2xl font-bold">My Bookings</h1>
      <p className="mt-1 text-muted-foreground">
        Your upcoming appointments.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Upcoming</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming appointments.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Date &amp; Time</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Service</th>
                    <th className="pb-2 font-medium">Room</th>
                    <th className="pb-2 font-medium">Status</th>
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
                        <div>
                          {formatInTimeZone(
                            new Date(booking.start_at),
                            TZ,
                            "MMM d, yyyy"
                          )}
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

      <div className="mt-8">
        <ChangePasswordCard />
      </div>
    </div>
  );
}
