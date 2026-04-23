"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import {
  assignTherapistAction,
  getAssignmentScreenData,
  type EligibleTherapist,
  type UnassignedBookingForAdmin,
} from "@/lib/actions/assignments";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrors } from "@/components/admin/form-message";

interface Row {
  booking: UnassignedBookingForAdmin;
  eligible: EligibleTherapist[];
}

interface AssignmentListProps {
  initialDate: string;
  initialData: Row[];
  highlightBookingId?: string;
}

export function AssignmentList({
  initialDate,
  initialData,
  highlightBookingId,
}: AssignmentListProps) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightBookingId && highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightBookingId]);

  function handleDateChange(newDate: string) {
    setDate(newDate);
    startTransition(async () => {
      const fresh = await getAssignmentScreenData({ date: newDate });
      setData(fresh.bookings);
      // Keep the URL in sync without a full navigation.
      router.replace(`/admin/assignments?date=${newDate}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <Label htmlFor="assignments-date">Date</Label>
          <Input
            id="assignments-date"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        {isPending && (
          <span className="text-sm text-muted-foreground">Loading...</span>
        )}
      </div>

      {data.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No unassigned bookings for this day.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((row) => (
            <AssignmentRow
              key={row.booking.id}
              row={row}
              highlight={row.booking.id === highlightBookingId}
              highlightRef={
                row.booking.id === highlightBookingId ? highlightRef : undefined
              }
              onAssignedAndRefresh={() => handleDateChange(date)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

interface AssignmentRowProps {
  row: Row;
  highlight: boolean;
  highlightRef?: React.RefObject<HTMLDivElement | null>;
  onAssignedAndRefresh: () => void;
}

function AssignmentRow({
  row,
  highlight,
  highlightRef,
  onAssignedAndRefresh,
}: AssignmentRowProps) {
  const { booking, eligible } = row;
  const [therapistId, setTherapistId] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, startSubmit] = useTransition();

  function handleAssign() {
    if (!therapistId) return;
    setErrors(undefined);
    const fd = new FormData();
    fd.set("booking_id", booking.id);
    fd.set("therapist_id", therapistId);
    startSubmit(async () => {
      const result = await assignTherapistAction(fd);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
        return;
      }
      onAssignedAndRefresh();
    });
  }

  const genderLabel =
    booking.therapist_gender_preference === "male"
      ? "Male"
      : booking.therapist_gender_preference === "female"
        ? "Female"
        : "Any";

  return (
    <Card
      ref={highlightRef}
      className={highlight ? "ring-2 ring-primary" : undefined}
    >
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-1 text-sm">
            <div className="font-medium">
              {formatInTimeZone(
                new Date(booking.start_at),
                TZ,
                "MMM d, yyyy — HH:mm"
              )}
              <span className="ml-2 text-muted-foreground">
                ({booking.duration_minutes} min)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Service:</span>{" "}
              {booking.service_name}{" "}
              <span className="ml-2 text-muted-foreground">·</span>
              <span className="ml-2 text-muted-foreground">Gender pref:</span>{" "}
              {genderLabel}
            </div>
            {booking.customer_full_name && (
              <div>
                <span className="text-muted-foreground">Customer:</span>{" "}
                {booking.customer_full_name}
                {booking.customer_phone && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {booking.customer_phone}
                  </span>
                )}
              </div>
            )}
            {booking.room_name && (
              <div>
                <span className="text-muted-foreground">Room:</span>{" "}
                {booking.room_name}
              </div>
            )}
            {booking.notes && (
              <div className="pt-1 text-muted-foreground">{booking.notes}</div>
            )}
          </div>

          <div className="md:min-w-[18rem]">
            <Label htmlFor={`therapist-${booking.id}`}>Assign therapist</Label>
            <Select
              id={`therapist-${booking.id}`}
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              disabled={submitting || eligible.length === 0}
            >
              <option value="">
                {eligible.length === 0
                  ? "No eligible therapists"
                  : "Select therapist..."}
              </option>
              {eligible.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                  {t.gender ? ` (${t.gender})` : ""}
                </option>
              ))}
            </Select>
            <div className="mt-2">
              <Button
                type="button"
                onClick={handleAssign}
                disabled={!therapistId || submitting}
                className="w-full"
              >
                {submitting ? "Assigning..." : "Assign + notify"}
              </Button>
            </div>
          </div>
        </div>
        {errors && (
          <div className="mt-3">
            <FormErrors errors={errors} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
