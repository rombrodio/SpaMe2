"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
} from "@/lib/actions/therapists";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import { availabilityGridOptions } from "@/lib/schemas/therapist";

const TIME_OPTIONS = availabilityGridOptions(6, 23);

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface AvailabilityRule {
  id: string;
  therapist_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

interface Props {
  therapistId: string;
  rules: AvailabilityRule[];
}

export function AvailabilitySection({ therapistId, rules }: Props) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    formData.set("therapist_id", therapistId);

    const result = await createAvailabilityRule(formData);

    if (result && 'error' in result) {
      setErrors(result.error as Record<string, string[]>);
      setSubmitting(false);
      toast.error("Couldn't add availability rule.");
      return;
    }

    toast.success("Availability rule added.");
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(ruleId: string) {
    const result = await deleteAvailabilityRule(ruleId, therapistId);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? "Couldn't delete rule.");
    }
    toast.success("Rule deleted.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Availability Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No availability rules defined.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Day</th>
                  <th className="pb-2 font-medium">Start</th>
                  <th className="pb-2 font-medium">End</th>
                  <th className="pb-2 font-medium">Valid From</th>
                  <th className="pb-2 font-medium">Valid Until</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0">
                    <td className="py-3">{capitalize(rule.day_of_week)}</td>
                    <td className="py-3">{rule.start_time}</td>
                    <td className="py-3">{rule.end_time}</td>
                    <td className="py-3">
                      {rule.valid_from || (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="py-3">
                      {rule.valid_until || (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="py-3">
                      <ConfirmButton
                        size="sm"
                        title="Delete availability rule"
                        description={
                          <p>
                            Remove the <strong>{capitalize(rule.day_of_week)}</strong>{" "}
                            rule ({rule.start_time}–{rule.end_time})? New bookings
                            for this therapist on that day will stop showing
                            slots from this window.
                          </p>
                        }
                        confirmLabel="Delete rule"
                        onConfirm={() => handleDelete(rule.id)}
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
          <h4 className="mb-3 text-sm font-medium">Add Rule</h4>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="day_of_week">Day of Week</Label>
                <select
                  id="day_of_week"
                  name="day_of_week"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {capitalize(day)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_time">Start Time</Label>
                <select
                  id="start_time"
                  name="start_time"
                  required
                  defaultValue="09:00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time">End Time</Label>
                <select
                  id="end_time"
                  name="end_time"
                  required
                  defaultValue="17:00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valid_from">Valid From</Label>
                <Input id="valid_from" name="valid_from" type="date" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valid_until">Valid Until</Label>
                <Input id="valid_until" name="valid_until" type="date" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Start/end times are locked to the 15-minute grid. Rules must be
              at least 30 minutes long and may not overlap with another rule
              on the same day.
            </p>

            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Rule"}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
