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
    assignment_status?:
      | "unassigned"
      | "pending_confirmation"
      | "confirmed"
      | "declined";
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
  const isUnassigned = booking.assignment_status === "unassigned";
  const isPending = booking.assignment_status === "pending_confirmation";
  // Unassigned bookings use a neutral gray so they stand out in a
  // therapist-colour-coded calendar. Clicking them goes to the
  // assignment screen instead of the generic booking detail.
  const therapistColor = isUnassigned
    ? "#9ca3af"
    : booking.therapists?.color || "#6366f1";

  const startTime = formatInTimeZone(new Date(booking.start_at), TZ, "HH:mm");
  const serviceEndMs =
    new Date(booking.start_at).getTime() +
    (booking.services?.duration_minutes ?? 0) * 60000;
  const endTime = formatInTimeZone(new Date(serviceEndMs), TZ, "HH:mm");
  const timeStr = `${startTime}\u2013${endTime}`;

  const href = isUnassigned
    ? `/admin/assignments?bookingId=${booking.id}`
    : `/admin/bookings/${booking.id}`;

  const borderStyle = isUnassigned ? "border-l-4 border-dashed" : "border-l-4";

  return (
    <Link
      href={href}
      className={`block h-full rounded ${borderStyle} px-1.5 py-0.5 text-xs hover:opacity-80 transition-opacity overflow-hidden`}
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
            {isUnassigned ? "Unassigned" : booking.customers?.full_name}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium">{timeStr}</span>
            {isUnassigned ? (
              <AssignmentBadge label="Unassigned" tone="neutral" />
            ) : isPending ? (
              <AssignmentBadge label="Pending" tone="warning" />
            ) : (
              <StatusBadge status={booking.status} />
            )}
          </div>
          <div className="mt-0.5 font-medium truncate">
            {booking.services?.name}
          </div>
          <div className="truncate text-muted-foreground">
            {booking.customers?.full_name} &middot;{" "}
            {isUnassigned ? (
              <span className="italic">no therapist yet</span>
            ) : (
              booking.therapists?.full_name
            )}
          </div>
          <div className="truncate text-muted-foreground">
            {booking.rooms?.name}
          </div>
        </>
      )}
    </Link>
  );
}

function AssignmentBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "warning";
}) {
  const cls =
    tone === "warning"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {label}
    </span>
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
