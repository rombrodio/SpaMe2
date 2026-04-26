"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  createReceptionistAvailabilityRule,
  deleteReceptionistAvailabilityRule,
} from "@/lib/actions/receptionists";
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
import { availabilityGridOptions } from "@/lib/schemas/receptionist";

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

interface AvailabilityRule {
  id: string;
  receptionist_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
}

interface Props {
  receptionistId: string;
  rules: AvailabilityRule[];
  /**
   * Translation key for the card title. Defaults to the generic
   * "On-duty Availability" from `reception.availabilitySection`.
   * The /reception/availability page overrides this with
   * `reception.availability.sectionTitle` ("My on-duty hours").
   */
  titleKey?: string;
  /**
   * Translation key for the helper copy under the form. Defaults to
   * the section's generic helper. Overridden when the reception page
   * wants to say something specific to the receptionist-editing-self
   * case.
   */
  helperKey?: string;
}

export function ReceptionistAvailabilitySection({
  receptionistId,
  rules,
  titleKey = "reception.availabilitySection.defaultTitle",
  helperKey = "reception.availabilitySection.defaultHelper",
}: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    formData.set("receptionist_id", receptionistId);

    const result = await createReceptionistAvailabilityRule(formData);

    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
      setSubmitting(false);
      toast.error(t("reception.availabilitySection.toasts.addError"));
      return;
    }

    toast.success(t("reception.availabilitySection.toasts.addSuccess"));
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(ruleId: string) {
    const result = await deleteReceptionistAvailabilityRule(
      ruleId,
      receptionistId
    );
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(
        err._form?.join(" ") ??
          t("reception.availabilitySection.toasts.deleteError")
      );
    }
    toast.success(t("reception.availabilitySection.toasts.deleteSuccess"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(titleKey as never)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("reception.availabilitySection.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.day")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.start")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.end")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.validFrom")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.validUntil")}
                  </th>
                  <th className="pb-2 font-medium">
                    {t("reception.availabilitySection.columns.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b last:border-0">
                    <td className="py-3">
                      {t(`common.days.${rule.day_of_week}` as never)}
                    </td>
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
                        title={t(
                          "reception.availabilitySection.deleteConfirm.title"
                        )}
                        description={
                          <p>
                            {t(
                              "reception.availabilitySection.deleteConfirm.body",
                              {
                                day: t(
                                  `common.days.${rule.day_of_week}` as never
                                ),
                                start: rule.start_time,
                                end: rule.end_time,
                              }
                            )}
                          </p>
                        }
                        confirmLabel={t(
                          "reception.availabilitySection.deleteConfirm.cta"
                        )}
                        onConfirm={() => handleDelete(rule.id)}
                      >
                        {t(
                          "reception.availabilitySection.deleteConfirm.actionLabel"
                        )}
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="mb-3 text-sm font-medium">
            {t("reception.availabilitySection.addHeading")}
          </h4>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="day_of_week">
                  {t("reception.availabilitySection.labels.dayOfWeek")}
                </Label>
                <select
                  id="day_of_week"
                  name="day_of_week"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {DAYS.map((day) => (
                    <option key={day} value={day}>
                      {t(`common.days.${day}` as never)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_time">
                  {t("reception.availabilitySection.labels.startTime")}
                </Label>
                <select
                  id="start_time"
                  name="start_time"
                  required
                  defaultValue="09:00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TIME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_time">
                  {t("reception.availabilitySection.labels.endTime")}
                </Label>
                <select
                  id="end_time"
                  name="end_time"
                  required
                  defaultValue="17:00"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {TIME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valid_from">
                  {t("reception.availabilitySection.labels.validFrom")}
                </Label>
                <Input id="valid_from" name="valid_from" type="date" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valid_until">
                  {t("reception.availabilitySection.labels.validUntil")}
                </Label>
                <Input id="valid_until" name="valid_until" type="date" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(helperKey as never)}
            </p>

            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("reception.availabilitySection.addingButton")
                : t("reception.availabilitySection.addButton")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
