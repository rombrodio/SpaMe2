"use client";

import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import Link from "next/link";

interface BookingCardProps {
  booking: {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    customers: { full_name: string } | null;
    therapists: { full_name: string; color: string | null } | null;
    rooms: { name: string } | null;
    services: { name: string; duration_minutes: number } | null;
  };
  compact?: boolean;
}

const statusColors: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800 border-yellow-300",
  confirmed: "bg-green-100 text-green-800 border-green-300",
  completed: "bg-blue-100 text-blue-800 border-blue-300",
  no_show: "bg-red-100 text-red-800 border-red-300",
  cancelled: "bg-gray-100 text-gray-500 border-gray-300",
};

export function BookingCard({ booking, compact }: BookingCardProps) {
  const therapistColor = booking.therapists?.color || "#6366f1";
  const startTime = formatInTimeZone(new Date(booking.start_at), TZ, "HH:mm");
  // Display service end time (start + duration), not the DB end_at which includes buffer
  const serviceEndMs =
    new Date(booking.start_at).getTime() +
    (booking.services?.duration_minutes ?? 0) * 60000;
  const endTime = formatInTimeZone(new Date(serviceEndMs), TZ, "HH:mm");
  const timeStr = `${startTime}\u2013${endTime}`;

  return (
    <Link
      href={`/admin/bookings/${booking.id}`}
      className="block h-full rounded border-l-4 px-1.5 py-0.5 text-xs hover:opacity-80 transition-opacity overflow-hidden"
      style={{
        borderLeftColor: therapistColor,
        backgroundColor: `${therapistColor}15`,
      }}
    >
      {compact ? (
        <>
          <div className="font-medium truncate">
            {timeStr} {booking.services?.name}
          </div>
          <div className="truncate text-muted-foreground">
            {booking.customers?.full_name}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium">{timeStr}</span>
            <StatusBadge status={booking.status} />
          </div>
          <div className="mt-0.5 font-medium truncate">
            {booking.services?.name}
          </div>
          <div className="truncate text-muted-foreground">
            {booking.customers?.full_name} &middot;{" "}
            {booking.therapists?.full_name}
          </div>
          <div className="truncate text-muted-foreground">
            {booking.rooms?.name}
          </div>
        </>
      )}
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace("_", " ");
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusColors[status] || ""}`}
    >
      {label}
    </span>
  );
}
