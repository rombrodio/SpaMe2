"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import {
  confirmAssignmentAction,
  declineAssignmentAction,
  type PendingConfirmation,
} from "@/lib/actions/assignments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormErrors } from "@/components/admin/form-message";

interface Props {
  items: PendingConfirmation[];
  highlightBookingId?: string;
}

export function PendingConfirmationsCard({
  items,
  highlightBookingId,
}: Props) {
  if (items.length === 0) return null;
  return (
    <Card className="border-amber-300 bg-amber-50/60">
      <CardHeader>
        <CardTitle className="text-base text-amber-900">
          Pending confirmations
        </CardTitle>
        <p className="text-sm text-amber-800/80">
          Please accept or decline these new assignments. The manager is
          re-alerted if you don&apos;t respond within 2 hours.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <PendingRow
              key={item.id}
              item={item}
              highlight={item.id === highlightBookingId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PendingRow({
  item,
  highlight,
}: {
  item: PendingConfirmation;
  highlight: boolean;
}) {
  const router = useRouter();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();

  useEffect(() => {
    if (highlight && rowRef.current) {
      rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  function handleConfirm() {
    setErrors(undefined);
    const fd = new FormData();
    fd.set("booking_id", item.id);
    startSubmit(async () => {
      const result = await confirmAssignmentAction(fd);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
        toast.error("Couldn't accept the assignment.");
        return;
      }
      toast.success("Assignment accepted.");
      router.refresh();
    });
  }

  function handleDecline() {
    setErrors(undefined);
    const fd = new FormData();
    fd.set("booking_id", item.id);
    fd.set("reason", reason);
    startSubmit(async () => {
      const result = await declineAssignmentAction(fd);
      if (result && "error" in result) {
        setErrors(result.error as Record<string, string[]>);
        toast.error("Couldn't decline the assignment.");
        return;
      }
      toast.success("Assignment declined.");
      router.refresh();
    });
  }

  return (
    <div
      ref={rowRef}
      className={`rounded-md border bg-white p-3 text-sm ${
        highlight ? "ring-2 ring-amber-500" : "border-amber-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="font-medium">
            {formatInTimeZone(new Date(item.start_at), TZ, "MMM d, yyyy")} at{" "}
            {formatInTimeZone(new Date(item.start_at), TZ, "HH:mm")}
            <span className="ml-1 text-muted-foreground">
              ({item.duration_minutes} min)
            </span>
          </div>
          <div className="text-muted-foreground">
            {item.service_name}
            {item.customer_first_name && ` · for ${item.customer_first_name}`}
            {item.room_name && ` · ${item.room_name}`}
          </div>
        </div>
      </div>

      {mode === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Accepting..." : "Accept"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setMode("declining")}
            disabled={submitting}
          >
            Decline
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={2}
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleDecline}
              disabled={submitting}
            >
              {submitting ? "Declining..." : "Confirm decline"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode("idle")}
              disabled={submitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {errors && (
        <div className="mt-3">
          <FormErrors errors={errors} />
        </div>
      )}
    </div>
  );
}
