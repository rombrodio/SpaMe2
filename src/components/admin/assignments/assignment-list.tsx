"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { UserCheck } from "lucide-react";
import { parseISO } from "date-fns";
import { useTranslations } from "next-intl";
import { TZ } from "@/lib/constants";
import {
  assignTherapistAction,
  getAssignmentScreenData,
  type AssignmentScope,
  type EligibleTherapist,
  type UnassignedBookingForAdmin,
} from "@/lib/actions/assignments";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrors } from "@/components/admin/form-message";
import { cn } from "@/lib/utils";

interface Row {
  booking: UnassignedBookingForAdmin;
  eligible: EligibleTherapist[];
}

interface AssignmentListProps {
  initialScope: AssignmentScope;
  initialDate: string | null;
  initialData: Row[];
  highlightBookingId?: string;
}

export function AssignmentList({
  initialScope,
  initialDate,
  initialData,
  highlightBookingId,
}: AssignmentListProps) {
  const router = useRouter();
  const t = useTranslations();
  const [scope, setScope] = useState<AssignmentScope>(initialScope);
  const [date, setDate] = useState(initialDate ?? "");
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

  function refresh(nextScope: AssignmentScope, nextDate: string) {
    startTransition(async () => {
      const fresh = await getAssignmentScreenData({
        scope: nextScope,
        date: nextScope === "date" ? nextDate : null,
      });
      setData(fresh.bookings);
      const qs =
        nextScope === "date" && nextDate
          ? `?scope=date&date=${nextDate}`
          : "";
      router.replace(`/admin/assignments${qs}`);
    });
  }

  function handleShowAll() {
    setScope("all");
    setDate("");
    refresh("all", "");
  }

  function handleDateChange(newDate: string) {
    setScope("date");
    setDate(newDate);
    refresh("date", newDate);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={scope === "all" ? "default" : "outline"}
            size="sm"
            onClick={handleShowAll}
          >
            {t("admin.assignments.allFuture")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("admin.assignments.orFilterBy")}
          </span>
        </div>
        <div>
          <Label htmlFor="assignments-date">
            {t("admin.assignments.date")}
          </Label>
          <Input
            id="assignments-date"
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        {isPending && (
          <span className="text-sm text-muted-foreground">
            {t("admin.assignments.loading")}
          </span>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          {t("admin.assignments.countUnassigned", { count: data.length })}
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState scope={scope} date={date} />
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
              onAssignedAndRefresh={() => refresh(scope, date)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────

function EmptyState({
  scope,
  date,
}: {
  scope: AssignmentScope;
  date: string;
}) {
  const t = useTranslations();
  const parsed = date ? parseISO(date) : null;
  const prettyDate =
    parsed && !isNaN(parsed.getTime())
      ? formatInTimeZone(parsed, TZ, "MMM d, yyyy")
      : date;

  const headline =
    scope === "all"
      ? t("admin.assignments.emptyAll")
      : t("admin.assignments.emptyForDate", { date: prettyDate });

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserCheck className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium">{headline}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t("admin.assignments.emptyBody")}
          </p>
        </div>
        <Link
          href="/admin/bookings/new"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("admin.assignments.createUnassigned")}
        </Link>
      </CardContent>
    </Card>
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
  const t = useTranslations();
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
        toast.error(t("admin.assignments.toastAssignError"));
        return;
      }
      toast.success(t("admin.assignments.toastAssigned"));
      onAssignedAndRefresh();
    });
  }

  const genderLabel =
    booking.therapist_gender_preference === "male"
      ? t("admin.assignments.gender.male")
      : booking.therapist_gender_preference === "female"
        ? t("admin.assignments.gender.female")
        : t("admin.assignments.gender.any");

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
                {t("admin.assignments.durationMinutes", {
                  minutes: booking.duration_minutes,
                })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("admin.assignments.serviceLabel")}
              </span>{" "}
              {booking.service_name}{" "}
              <span className="ml-2 text-muted-foreground">·</span>
              <span className="ml-2 text-muted-foreground">
                {t("admin.assignments.genderPrefLabel")}
              </span>{" "}
              {genderLabel}
            </div>
            {booking.customer_full_name && (
              <div>
                <span className="text-muted-foreground">
                  {t("admin.assignments.customerLabel")}
                </span>{" "}
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
                <span className="text-muted-foreground">
                  {t("admin.assignments.roomLabel")}
                </span>{" "}
                {booking.room_name}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              {t("admin.assignments.bookedAt", {
                date: formatInTimeZone(
                  new Date(booking.created_at),
                  TZ,
                  "MMM d, HH:mm"
                ),
              })}
            </div>
            {booking.notes && (
              <div className="pt-1 text-muted-foreground">{booking.notes}</div>
            )}
          </div>

          <div className="md:min-w-[18rem]">
            <Label htmlFor={`therapist-${booking.id}`}>
              {t("admin.assignments.assignTherapist")}
            </Label>
            <Select
              id={`therapist-${booking.id}`}
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              disabled={submitting || eligible.length === 0}
            >
              <option value="">
                {eligible.length === 0
                  ? t("admin.assignments.noEligibleTherapists")
                  : t("admin.assignments.selectTherapist")}
              </option>
              {eligible.map((th) => (
                <option key={th.id} value={th.id}>
                  {th.full_name}
                  {th.gender ? ` (${th.gender})` : ""}
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
                {submitting
                  ? t("admin.assignments.assigning")
                  : t("admin.assignments.assignNotify")}
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
