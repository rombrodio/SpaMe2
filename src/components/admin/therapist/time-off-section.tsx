"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations, useLocale } from "next-intl";
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
import type { Locale } from "@/i18n/config";

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

function intlLocale(locale: Locale): string {
  return locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
}

export function TimeOffSection({ therapistId, timeOffs }: Props) {
  const router = useRouter();
  const t = useTranslations("therapist.timeOff");
  const locale = useLocale() as Locale;
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    formData.set("therapist_id", therapistId);

    const result = await createTimeOff(formData);

    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
      setSubmitting(false);
      toast.error(t("toasts.addError"));
      return;
    }

    toast.success(t("toasts.addSuccess"));
    setSubmitting(false);
    router.refresh();
  }

  async function handleDelete(timeOffId: string) {
    const result = await deleteTimeOff(timeOffId, therapistId);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[]>;
      throw new Error(err._form?.join(" ") ?? t("toasts.deleteError"));
    }
    toast.success(t("toasts.deleteSuccess"));
    router.refresh();
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString(intlLocale(locale), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jerusalem",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sectionTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {timeOffs.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">{t("columns.start")}</th>
                  <th className="pb-2 font-medium">{t("columns.end")}</th>
                  <th className="pb-2 font-medium">{t("columns.reason")}</th>
                  <th className="pb-2 font-medium">{t("columns.actions")}</th>
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
                        title={t("deleteConfirm.title")}
                        description={
                          <p>
                            {t("deleteConfirm.body", {
                              start: formatDateTime(to.start_at),
                              end: formatDateTime(to.end_at),
                            })}
                          </p>
                        }
                        confirmLabel={t("deleteConfirm.cta")}
                        onConfirm={() => handleDelete(to.id)}
                      >
                        {t("deleteConfirm.actionLabel")}
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
          <h4 className="mb-3 text-sm font-medium">{t("addHeading")}</h4>
          <form action={handleAdd} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("labels.start")}</Label>
                <DateTimePicker name="start_at" required />
              </div>

              <div className="space-y-2">
                <Label>{t("labels.end")}</Label>
                <DateTimePicker name="end_at" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">{t("labels.reason")}</Label>
                <Input id="reason" name="reason" />
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? t("addingButton") : t("addButton")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
