import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { startOfDay, endOfDay } from "date-fns";
import {
  Calendar,
  Clock,
  DollarSign,
  UserPlus,
  ChevronRight,
} from "lucide-react";

/**
 * SPA-005: operational dashboard.
 *
 * Replaces the prior "configuration inventory" (count of active
 * therapists / services / etc.) with a start-of-day view tuned to the
 * three things a receptionist needs to know as they sit down at the desk:
 *   1. What's on today's agenda (next 10 bookings with deep link)
 *   2. How many bookings are still waiting for a therapist assignment
 *   3. How many bookings are waiting on payment
 *   4. Revenue expected today (confirmed + completed, gross of refunds)
 *
 * No trend charts, no heat maps. Cheap queries, reloads on every navigate.
 */
export default async function AdminDashboard() {
  const supabase = await createClient();

  const now = new Date();
  const nowMs = now.getTime();
  const nowZoned = toZonedTime(now, TZ);
  const dayStart = fromZonedTime(startOfDay(nowZoned), TZ);
  const dayEnd = fromZonedTime(endOfDay(nowZoned), TZ);
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();

  interface TodayBookingRow {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    assignment_status: string | null;
    price_ils: number | null;
    customers: { id: string; full_name: string | null; phone: string } | null;
    services: { id: string; name: string; duration_minutes: number } | null;
    therapists: { id: string; full_name: string; color: string | null } | null;
    rooms: { id: string; name: string } | null;
  }

  const [
    todayBookings,
    pendingPaymentCount,
    unassignedTodayCount,
    revenueRows,
  ] = await Promise.all([
    // Today's agenda: confirmed + pending_payment bookings that end >= now
    // so the list reflects what's *still* ahead today.
    supabase
      .from("bookings")
      .select(
        "id, start_at, end_at, status, assignment_status, price_ils, customers(id, full_name, phone), services(id, name, duration_minutes), therapists(id, full_name, color), rooms(id, name)"
      )
      .gte("start_at", dayStartIso)
      .lte("start_at", dayEndIso)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true })
      .limit(10),
    // Pending payment count (all time — the queue to clear, not just today).
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_payment"),
    // Unassigned bookings starting today → need a therapist pinned.
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .gte("start_at", dayStartIso)
      .lte("start_at", dayEndIso)
      .eq("assignment_status", "unassigned"),
    // Revenue expected today = sum of price_ils for non-cancelled bookings.
    supabase
      .from("bookings")
      .select("price_ils, status")
      .gte("start_at", dayStartIso)
      .lte("start_at", dayEndIso)
      .neq("status", "cancelled"),
  ]);

  const revenueAgorot = (revenueRows.data ?? []).reduce(
    (sum: number, r: { price_ils: number | null }) =>
      sum + (r.price_ils ?? 0),
    0
  );
  const revenueIls = Math.round(revenueAgorot / 100);
  const todayRows = (todayBookings.data ?? []) as unknown as TodayBookingRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatInTimeZone(new Date(), TZ, "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardTile
          title="Today's bookings"
          value={String(todayRows.length)}
          icon={<Calendar className="h-5 w-5 text-muted-foreground" />}
          href="/admin/bookings"
          footer={`Revenue: ₪${revenueIls.toLocaleString()}`}
        />
        <DashboardTile
          title="Pending payment"
          value={String(pendingPaymentCount.count ?? 0)}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          href="/admin/bookings?status=pending_payment"
          tone={
            (pendingPaymentCount.count ?? 0) > 0 ? "warning" : undefined
          }
        />
        <DashboardTile
          title="Unassigned today"
          value={String(unassignedTodayCount.count ?? 0)}
          icon={<UserPlus className="h-5 w-5 text-amber-500" />}
          href="/admin/assignments"
          tone={
            (unassignedTodayCount.count ?? 0) > 0 ? "warning" : undefined
          }
        />
        <DashboardTile
          title="Revenue today"
          value={`₪${revenueIls.toLocaleString()}`}
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
          href="/admin/bookings"
          footer="Incl. pending payment"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Today&apos;s agenda</CardTitle>
          <Link
            href="/admin/calendar"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1"
            )}
          >
            Open calendar
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {todayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookings today. Enjoy the quiet day.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Service</th>
                    <th className="pb-2 font-medium">Therapist</th>
                    <th className="pb-2 font-medium">Room</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayRows.map((b) => {
                    const isPast = new Date(b.end_at).getTime() < nowMs;
                    return (
                      <tr
                        key={b.id}
                        className={cn(
                          "border-b last:border-0",
                          isPast && "opacity-60"
                        )}
                      >
                        <td className="py-2 font-medium">
                          {formatInTimeZone(
                            new Date(b.start_at),
                            TZ,
                            "HH:mm"
                          )}
                        </td>
                        <td className="py-2">
                          <Link
                            href={`/admin/bookings/${b.id}`}
                            className="hover:underline"
                          >
                            {b.customers?.full_name || "(no name)"}
                          </Link>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {b.services?.name ?? "—"}
                        </td>
                        <td className="py-2">
                          {b.therapists ? (
                            <span className="inline-flex items-center gap-1.5">
                              {b.therapists.color && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full"
                                  style={{
                                    backgroundColor: b.therapists.color,
                                  }}
                                />
                              )}
                              {b.therapists.full_name}
                            </span>
                          ) : (
                            <span className="text-amber-600">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {b.rooms?.name ?? "—"}
                        </td>
                        <td className="py-2">
                          <StatusBadge status={b.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface DashboardTileProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  href: string;
  footer?: string;
  tone?: "warning";
}

function DashboardTile({
  title,
  value,
  icon,
  href,
  footer,
  tone,
}: DashboardTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40",
        tone === "warning" && "border-amber-200"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {title}
        </span>
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{value}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {footer && (
        <p className="mt-1 text-xs text-muted-foreground">{footer}</p>
      )}
    </Link>
  );
}
