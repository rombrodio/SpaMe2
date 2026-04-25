import Link from "next/link";
import { startOfDay, endOfDay, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import {
  getMyReceptionistId,
  getReceptionistAvailabilityRules,
} from "@/lib/actions/receptionists";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, UserCheck, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { TZ } from "@/lib/constants";

export const dynamic = "force-dynamic";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export default async function ReceptionDashboardPage() {
  const supabase = await createClient();

  // Use the spa's timezone for "today" bounds so a booking whose
  // start_at falls on the Tel Aviv calendar day lands here even when
  // the server clock is UTC.
  const now = toZonedTime(new Date(), TZ);
  const dayStartIso = startOfDay(now).toISOString();
  const dayEndIso = endOfDay(now).toISOString();
  const weekEndIso = endOfDay(addDays(now, 7)).toISOString();

  const myReceptionistId = await getMyReceptionistId();

  const [pendingPaymentCount, unassignedUpcomingCount, todayCount, rules] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_payment"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .gte("start_at", now.toISOString())
        .lte("start_at", weekEndIso)
        .eq("assignment_status", "unassigned")
        .neq("status", "cancelled"),
      supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .gte("start_at", dayStartIso)
        .lte("start_at", dayEndIso)
        .neq("status", "cancelled"),
      myReceptionistId
        ? getReceptionistAvailabilityRules(myReceptionistId)
        : Promise.resolve([]),
    ]);

  const sortedRules = [...(rules as Array<{
    id: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
  }>)].sort((a, b) => {
    const da = DAY_ORDER.indexOf(
      a.day_of_week as (typeof DAY_ORDER)[number]
    );
    const db = DAY_ORDER.indexOf(
      b.day_of_week as (typeof DAY_ORDER)[number]
    );
    if (da !== db) return da - db;
    return a.start_time.localeCompare(b.start_time);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reception</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatInTimeZone(new Date(), TZ, "EEEE, MMMM d, yyyy")}
          </p>
        </div>
        <Link
          href="/reception/bookings/new"
          className={cn(buttonVariants(), "gap-1")}
        >
          <CalendarPlus className="h-4 w-4" />
          New booking
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile
          title="Today's bookings"
          value={String(todayCount.count ?? 0)}
          icon={<CalendarPlus className="h-5 w-5 text-muted-foreground" />}
          href="/reception/bookings"
        />
        <Tile
          title="Pending payment"
          value={String(pendingPaymentCount.count ?? 0)}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          href="/reception/bookings?status=pending_payment"
          tone={
            (pendingPaymentCount.count ?? 0) > 0 ? "warning" : undefined
          }
        />
        <Tile
          title="Unassigned (next 7d)"
          value={String(unassignedUpcomingCount.count ?? 0)}
          icon={<UserCheck className="h-5 w-5 text-muted-foreground" />}
          href="/reception/bookings?assignment_status=unassigned"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My on-duty hours</CardTitle>
        </CardHeader>
        <CardContent>
          {!myReceptionistId ? (
            <p className="text-sm text-muted-foreground">
              Your profile isn&apos;t linked to a receptionist record yet —
              ask the admin to run the invite flow or set
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                profiles.receptionist_id
              </code>
              for your user.
            </p>
          ) : sortedRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No on-duty windows defined yet.{" "}
              <Link
                href="/reception/availability"
                className="text-primary underline"
              >
                Add your first one
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sortedRules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 border-b py-2 last:border-0"
                >
                  <span className="w-24 font-medium">
                    {capitalize(r.day_of_week)}
                  </span>
                  <span className="text-muted-foreground">
                    {r.start_time}–{r.end_time}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href="/reception/availability"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Manage on-duty hours
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  title,
  value,
  icon,
  href,
  tone,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  href: string;
  tone?: "warning";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg border bg-card p-4 transition-colors hover:bg-accent",
        tone === "warning" && "border-amber-300"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{title}</div>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </Link>
  );
}
