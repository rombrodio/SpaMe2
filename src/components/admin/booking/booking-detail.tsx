"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import {
  SlotPicker,
  type SlotPickerSelection,
} from "@/components/admin/booking/slot-picker";
import {
  cancelBookingAction,
  rescheduleBookingAction,
  updateBookingStatusAction,
} from "@/lib/actions/bookings";
import { addMinutes, format } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";

interface BookingDetailProps {
  booking: {
    id: string;
    start_at: string;
    end_at: string;
    status: string;
    price_ils: number;
    notes: string | null;
    cancel_reason: string | null;
    cancelled_at: string | null;
    created_at: string;
    customers: { id: string; full_name: string; phone: string } | null;
    therapists: { id: string; full_name: string; color: string | null } | null;
    rooms: { id: string; name: string } | null;
    services: {
      id: string;
      name: string;
      duration_minutes: number;
      buffer_minutes: number;
      price_ils: number;
    } | null;
  };
  therapists: Array<{ id: string; full_name: string; color: string | null }>;
  rooms: Array<{ id: string; name: string }>;
}

export function BookingDetail({
  booking,
  therapists,
  rooms,
}: BookingDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selection, setSelection] = useState<SlotPickerSelection | null>(null);

  const isTerminal =
    booking.status === "cancelled" ||
    booking.status === "completed" ||
    booking.status === "no_show";
  const isReschedulable =
    booking.status === "pending_payment" || booking.status === "confirmed";

  function handleStatusChange(newStatus: string, successLabel: string) {
    startTransition(async () => {
      const result = await updateBookingStatusAction(booking.id, newStatus);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
        toast.error("Couldn't update booking status.");
      } else {
        toast.success(successLabel);
        router.refresh();
      }
    });
  }

  async function handleCancel(reason: string) {
    const fd = new FormData();
    fd.set("booking_id", booking.id);
    fd.set("cancel_reason", reason);

    const result = await cancelBookingAction(fd);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? "Couldn't cancel booking.");
    }
    toast.success("Booking cancelled.");
    router.refresh();
  }

  async function handleNoShow() {
    const result = await updateBookingStatusAction(booking.id, "no_show");
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? "Couldn't mark no-show.");
    }
    toast.success("Marked as no-show.");
    router.refresh();
  }

  function handleRescheduleConfirm() {
    if (!selection) return;
    const fd = new FormData();
    fd.set("booking_id", booking.id);
    fd.set("new_start_at", selection.start);
    if (selection.therapist_id) fd.set("new_therapist_id", selection.therapist_id);
    if (selection.room_id) fd.set("new_room_id", selection.room_id);

    startTransition(async () => {
      const result = await rescheduleBookingAction(fd);
      if (result && "error" in result) {
        const err = result.error as Record<string, string[]>;
        const message = err._form?.join(" ") ?? "Couldn't reschedule booking.";
        toast.error(message);
        setErrors(err);
      } else {
        toast.success("Booking rescheduled.");
        setRescheduleOpen(false);
        setSelection(null);
        router.refresh();
      }
    });
  }

  const startZoned = toZonedTime(new Date(booking.start_at), TZ);
  const currentDateStr = format(startZoned, "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      {/* DEF-010: sticky action bar replaces the four scattered cards. */}
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
        <div className="flex items-center gap-2">
          <StatusBadge status={booking.status} />
          <span className="text-sm text-muted-foreground">
            {formatInTimeZone(new Date(booking.start_at), TZ, "EEE MMM d, HH:mm")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {booking.status === "pending_payment" && (
            <Button
              size="sm"
              onClick={() =>
                handleStatusChange("confirmed", "Marked as paid & confirmed.")
              }
              disabled={isPending}
            >
              Confirm (Mark Paid)
            </Button>
          )}
          {booking.status === "confirmed" && (
            <Button
              size="sm"
              onClick={() =>
                handleStatusChange("completed", "Booking marked completed.")
              }
              disabled={isPending}
            >
              Mark Completed
            </Button>
          )}
          {booking.status === "confirmed" && (
            <ConfirmButton
              size="sm"
              variant="destructive"
              title="Mark as no-show"
              description={
                <p>
                  The customer will be flagged as a no-show. This removes the
                  booking from active lists and is logged in the audit trail.
                </p>
              }
              confirmLabel="Mark no-show"
              onConfirm={handleNoShow}
            >
              Mark No-Show
            </ConfirmButton>
          )}
          {isReschedulable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
              disabled={isPending}
            >
              Reschedule
            </Button>
          )}
          {!isTerminal && (
            <ConfirmButton
              size="sm"
              variant="destructive"
              title="Cancel booking"
              description={
                <p>
                  Cancel this booking? The customer keeps the record but it
                  drops off the calendar and will not appear in upcoming
                  bookings.
                </p>
              }
              reasonPrompt="Reason (optional)"
              confirmLabel="Cancel booking"
              onConfirm={handleCancel}
            >
              Cancel Booking
            </ConfirmButton>
          )}
        </div>
      </div>

      <FormErrors errors={errors} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Booking Information</CardTitle>
            <StatusBadge status={booking.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Customer</dt>
              <dd className="font-medium">
                {booking.customers?.full_name || "-"}
              </dd>
              <dd className="text-sm text-muted-foreground">
                {booking.customers?.phone}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Service</dt>
              <dd className="font-medium">{booking.services?.name || "-"}</dd>
              <dd className="text-sm text-muted-foreground">
                {booking.services?.duration_minutes} min
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Therapist</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                {booking.therapists?.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: booking.therapists.color }}
                  />
                )}
                {booking.therapists?.full_name || "-"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Room</dt>
              <dd className="font-medium">{booking.rooms?.name || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date & Time</dt>
              <dd className="font-medium">
                {formatInTimeZone(new Date(booking.start_at), TZ, "EEEE, MMM d, yyyy")}
              </dd>
              <dd className="text-sm text-muted-foreground">
                {formatInTimeZone(new Date(booking.start_at), TZ, "HH:mm")}–
                {formatInTimeZone(
                  addMinutes(new Date(booking.start_at), booking.services?.duration_minutes ?? 0),
                  TZ,
                  "HH:mm"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Price</dt>
              <dd className="font-medium">
                {(booking.price_ils / 100).toFixed(0)} ILS
              </dd>
            </div>
            {booking.notes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">Notes</dt>
                <dd>{booking.notes}</dd>
              </div>
            )}
            {booking.cancel_reason && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  Cancellation Reason
                </dt>
                <dd className="text-destructive">{booking.cancel_reason}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="text-sm">
                {formatInTimeZone(new Date(booking.created_at), TZ, "MMM d, yyyy HH:mm")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* DEF-008: reschedule dialog with full SlotPicker */}
      <AlertDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Reschedule booking</AlertDialogTitle>
            <AlertDialogDescription>
              Pick a new date, therapist, room, and slot. Availability already
              excludes this booking, so you&apos;ll only see conflict-free
              options.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {booking.services && (
            <SlotPicker
              serviceId={booking.services.id}
              therapists={therapists}
              rooms={rooms}
              initialDate={currentDateStr}
              initialTherapistId={booking.therapists?.id}
              initialRoomId={booking.rooms?.id}
              excludeBookingId={booking.id}
              onChange={setSelection}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRescheduleConfirm();
              }}
              disabled={!selection || isPending}
            >
              {isPending ? "Rescheduling…" : "Confirm reschedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
