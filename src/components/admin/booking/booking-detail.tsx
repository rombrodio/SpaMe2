"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
import { SourceBadge } from "@/components/admin/booking/source-badge";
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
    source?:
      | "customer_web"
      | "admin_manual"
      | "receptionist_manual"
      | "chatbot"
      | null;
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
  const t = useTranslations();
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
        toast.error(t("admin.bookings.detail.toastStatusError"));
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
      throw new Error(
        err._form?.join(" ") ?? t("admin.bookings.detail.toastCancelError")
      );
    }
    toast.success(t("admin.bookings.detail.toastCancelled"));
    router.refresh();
  }

  async function handleNoShow() {
    const result = await updateBookingStatusAction(booking.id, "no_show");
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(
        err._form?.join(" ") ?? t("admin.bookings.detail.toastNoShowError")
      );
    }
    toast.success(t("admin.bookings.detail.toastNoShow"));
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
        const message =
          err._form?.join(" ") ?? t("admin.bookings.detail.toastRescheduleError");
        toast.error(message);
        setErrors(err);
      } else {
        toast.success(t("admin.bookings.detail.toastRescheduled"));
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
                handleStatusChange(
                  "confirmed",
                  t("admin.bookings.detail.toastStatusConfirmed")
                )
              }
              disabled={isPending}
            >
              {t("admin.bookings.detail.confirmPaid")}
            </Button>
          )}
          {booking.status === "confirmed" && (
            <Button
              size="sm"
              onClick={() =>
                handleStatusChange(
                  "completed",
                  t("admin.bookings.detail.toastStatusCompleted")
                )
              }
              disabled={isPending}
            >
              {t("admin.bookings.detail.markCompleted")}
            </Button>
          )}
          {booking.status === "confirmed" && (
            <ConfirmButton
              size="sm"
              variant="destructive"
              title={t("admin.bookings.detail.markNoShowTitle")}
              description={
                <p>{t("admin.bookings.detail.markNoShowDescription")}</p>
              }
              confirmLabel={t("admin.bookings.detail.markNoShowConfirmLabel")}
              onConfirm={handleNoShow}
            >
              {t("admin.bookings.detail.markNoShow")}
            </ConfirmButton>
          )}
          {isReschedulable && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRescheduleOpen(true)}
              disabled={isPending}
            >
              {t("admin.bookings.detail.reschedule")}
            </Button>
          )}
          {!isTerminal && (
            <ConfirmButton
              size="sm"
              variant="destructive"
              title={t("admin.bookings.detail.cancelTitle")}
              description={<p>{t("admin.bookings.detail.cancelDescription")}</p>}
              reasonPrompt={t("admin.bookings.detail.cancelReasonPrompt")}
              confirmLabel={t("admin.bookings.detail.cancelConfirmLabel")}
              onConfirm={handleCancel}
            >
              {t("admin.bookings.detail.cancel")}
            </ConfirmButton>
          )}
        </div>
      </div>

      <FormErrors errors={errors} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {t("admin.bookings.detail.bookingInformation")}
            </CardTitle>
            <StatusBadge status={booking.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.customer")}
              </dt>
              <dd className="font-medium">
                {booking.customers?.full_name || "-"}
              </dd>
              <dd className="text-sm text-muted-foreground">
                {booking.customers?.phone}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.service")}
              </dt>
              <dd className="font-medium">{booking.services?.name || "-"}</dd>
              <dd className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.durationMinutes", {
                  minutes: booking.services?.duration_minutes ?? 0,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.therapist")}
              </dt>
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
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.room")}
              </dt>
              <dd className="font-medium">{booking.rooms?.name || "-"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.dateTime")}
              </dt>
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
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.price")}
              </dt>
              <dd className="font-medium">
                {t("admin.bookings.detail.ils", {
                  amount: (booking.price_ils / 100).toFixed(0),
                })}
              </dd>
            </div>
            {booking.notes && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  {t("admin.bookings.detail.notes")}
                </dt>
                <dd>{booking.notes}</dd>
              </div>
            )}
            {booking.cancel_reason && (
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">
                  {t("admin.bookings.detail.cancellationReason")}
                </dt>
                <dd className="text-destructive">{booking.cancel_reason}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">
                {t("admin.bookings.detail.created")}
              </dt>
              <dd className="text-sm">
                {formatInTimeZone(new Date(booking.created_at), TZ, "MMM d, yyyy HH:mm")}
              </dd>
            </div>
            {booking.source && (
              <div>
                <dt className="text-sm text-muted-foreground">
                  {t("admin.bookings.detail.source")}
                </dt>
                <dd className="mt-1">
                  <SourceBadge source={booking.source} />
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* DEF-008: reschedule dialog with full SlotPicker */}
      <AlertDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("admin.bookings.detail.rescheduleTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.bookings.detail.rescheduleDescription")}
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
            <AlertDialogCancel disabled={isPending}>
              {t("admin.bookings.detail.rescheduleBack")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRescheduleConfirm();
              }}
              disabled={!selection || isPending}
            >
              {isPending
                ? t("admin.bookings.detail.rescheduling")
                : t("admin.bookings.detail.rescheduleConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
