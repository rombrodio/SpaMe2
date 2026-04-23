"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTimeOff, deleteTimeOff } from "@/lib/actions/therapists";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

interface TimeOff {
  id: string;
  therapist_id: string;
  start_at: string;
  end_at: string;
  reason: string | null;
  created_at: string;
}

interface Props {
  therapistId: string;
  timeOffs: TimeOff[];
}

export function TimeOffSection({ therapistId, timeOffs }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    formData.set("therapist_id", therapistId);

    const result = await createTimeOff(formData);

    if (result && 'error' in result) {
      setErrors(result.error as Record<string, string[]>);
      setSubmitting(false);
      toast.error("Couldn't add time-off.");
      return;
    }

    toast.success("Time-off added.");
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(timeOffId: string) {
    const result = await deleteTimeOff(timeOffId, therapistId);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? "Couldn't delete time-off.");
    }
    toast.success("Time-off removed.");
    router.refresh();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString("en-IL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time Off</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {timeOffs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No time-off entries.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Start</th>
                  <th className="pb-2 font-medium">End</th>
                  <th className="pb-2 font-medium">Reason</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {timeOffs.map((to) => (
                  <tr key={to.id} className="border-b last:border-0">
                    <td className="py-3">{formatDateTime(to.start_at)}</td>
                    <td className="py-3">{formatDateTime(to.end_at)}</td>
                    <td className="py-3">
                      {to.reason || (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="py-3">
                      <ConfirmButton
                        size="sm"
                        title="Delete time-off"
                        description={
                          <p>
                            Remove this time-off block (
                            {formatDateTime(to.start_at)} – {formatDateTime(to.end_at)}
                            )? The therapist becomes bookable again in this
                            window.
                          </p>
                        }
                        confirmLabel="Delete"
                        onConfirm={() => handleDelete(to.id)}
                      >
                        Delete
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="mb-3 text-sm font-medium">Add Time Off</h4>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <DateTimePicker name="start_at" required />
              </div>

              <div className="space-y-2">
                <Label>End</Label>
                <DateTimePicker name="end_at" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" name="reason" />
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Time Off"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
