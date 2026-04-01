"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import { StatusBadge } from "@/components/admin/calendar/booking-card";
import {
  cancelBookingAction,
  rescheduleBookingAction,
  updateBookingStatusAction,
} from "@/lib/actions/bookings";
import { format } from "date-fns";

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
}

export function BookingDetail({ booking }: BookingDetailProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [showCancel, setShowCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [newStartAt, setNewStartAt] = useState(
    format(new Date(booking.start_at), "yyyy-MM-dd'T'HH:mm")
  );

  const isCancellable =
    booking.status !== "cancelled" && booking.status !== "completed";
  const isReschedulable =
    booking.status === "pending_payment" || booking.status === "confirmed";

  function handleCancel() {
    const fd = new FormData();
    fd.set("booking_id", booking.id);
    fd.set("cancel_reason", cancelReason);

    startTransition(async () => {
      const result = await cancelBookingAction(fd);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
      } else {
        router.refresh();
        setShowCancel(false);
      }
    });
  }

  function handleReschedule() {
    const fd = new FormData();
    fd.set("booking_id", booking.id);
    fd.set("new_start_at", newStartAt);

    startTransition(async () => {
      const result = await rescheduleBookingAction(fd);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
      } else {
        router.refresh();
        setShowReschedule(false);
      }
    });
  }

  function handleStatusChange(newStatus: string) {
    startTransition(async () => {
      const result = await updateBookingStatusAction(booking.id, newStatus);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
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
                {format(new Date(booking.start_at), "EEEE, MMM d, yyyy")}
              </dd>
              <dd className="text-sm text-muted-foreground">
                {format(new Date(booking.start_at), "HH:mm")}–
                {format(new Date(booking.end_at), "HH:mm")}
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
                {format(new Date(booking.created_at), "MMM d, yyyy HH:mm")}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Status transitions */}
      {booking.status === "pending_payment" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              This booking is awaiting payment. Confirm manually or wait for the
              payment webhook.
            </p>
            <Button
              onClick={() => handleStatusChange("confirmed")}
              disabled={isPending}
            >
              {isPending ? "Confirming..." : "Confirm (Mark Paid)"}
            </Button>
          </CardContent>
        </Card>
      )}

      {booking.status === "confirmed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complete Booking</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              onClick={() => handleStatusChange("completed")}
              disabled={isPending}
            >
              Mark Completed
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleStatusChange("no_show")}
              disabled={isPending}
            >
              Mark No-Show
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reschedule */}
      {isReschedulable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reschedule</CardTitle>
          </CardHeader>
          <CardContent>
            {showReschedule ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="new_start_at">New Date & Time</Label>
                  <Input
                    id="new_start_at"
                    type="datetime-local"
                    value={newStartAt}
                    onChange={(e) => setNewStartAt(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleReschedule} disabled={isPending}>
                    {isPending ? "Rescheduling..." : "Confirm Reschedule"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowReschedule(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => setShowReschedule(true)}
              >
                Reschedule Booking
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cancel */}
      {isCancellable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Cancel Booking
            </CardTitle>
          </CardHeader>
          <CardContent>
            {showCancel ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="cancel_reason">
                    Reason (optional)
                  </Label>
                  <Textarea
                    id="cancel_reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleCancel}
                    disabled={isPending}
                  >
                    {isPending ? "Cancelling..." : "Confirm Cancellation"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCancel(false)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setShowCancel(true)}
              >
                Cancel Booking
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
