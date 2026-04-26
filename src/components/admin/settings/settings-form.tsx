"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updateSpaSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
import { FormErrors } from "@/components/admin/form-message";

interface SettingsFormProps {
  initialName: string;
  initialPhone: string;
  initialBusinessHoursStart: string;
  initialBusinessHoursEnd: string;
  initialSlotGranularityMinutes: number;
}

/**
 * Build an HH:MM option list at the configured granularity — e.g. at
 * 30-min granularity the list is 00:00, 00:30, 01:00, ... 23:30. Used
 * for both opening- and closing-time pickers.
 */
function buildTimeOptions(step: number): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(
      `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
    );
  }
  return out;
}

const HOUR_STEP = 30; // the granularity of the open/close dropdowns themselves
const HOUR_OPTIONS = buildTimeOptions(HOUR_STEP);

export function SettingsForm({
  initialName,
  initialPhone,
  initialBusinessHoursStart,
  initialBusinessHoursEnd,
  initialSlotGranularityMinutes,
}: SettingsFormProps) {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);

  async function handleSubmit(formData: FormData) {
    setErrors(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSpaSettings(formData);
      if (result && "error" in result) {
        setErrors(result.error);
        toast.error(t("admin.settings.toastSaveError"));
        return;
      }
      setSaved(true);
      toast.success(t("admin.settings.toastSaved"));
      resetDirty();
      router.refresh();
    });
  }

  return (
    <DirtyFormGuard dirty={dirty && !isPending}>
    <form ref={formRef} action={handleSubmit} className="space-y-6">
      <FormErrors errors={errors} />

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.settings.onCallSection")}
        </h3>

        <div className="space-y-2">
          <Label htmlFor="on_call_manager_name">
            {t("admin.settings.managerName")}
          </Label>
          <Input
            id="on_call_manager_name"
            name="on_call_manager_name"
            defaultValue={initialName}
            placeholder={t("admin.settings.managerNamePlaceholder")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="on_call_manager_phone">
            {t("admin.settings.managerPhone")}
          </Label>
          <Input
            id="on_call_manager_phone"
            name="on_call_manager_phone"
            defaultValue={initialPhone}
            placeholder={t("admin.settings.managerPhonePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("admin.settings.managerPhoneHelper")}
          </p>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("admin.settings.hoursSection")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("admin.settings.hoursIntro")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="business_hours_start">
              {t("admin.settings.opensAt")}
            </Label>
            <Select
              id="business_hours_start"
              name="business_hours_start"
              defaultValue={initialBusinessHoursStart}
            >
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_hours_end">
              {t("admin.settings.closesAt")}
            </Label>
            <Select
              id="business_hours_end"
              name="business_hours_end"
              defaultValue={initialBusinessHoursEnd}
            >
              {HOUR_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slot_granularity_minutes">
            {t("admin.settings.slotGranularity")}
          </Label>
          <Select
            id="slot_granularity_minutes"
            name="slot_granularity_minutes"
            defaultValue={String(initialSlotGranularityMinutes)}
          >
            <option value="60">
              {t("admin.settings.slotGranularity60")}
            </option>
            <option value="30">
              {t("admin.settings.slotGranularity30")}
            </option>
            <option value="15">
              {t("admin.settings.slotGranularity15")}
            </option>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("admin.settings.slotGranularityHelper")}
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("admin.settings.saving") : t("admin.settings.save")}
        </Button>
        {saved && !isPending && (
          <span className="text-sm text-green-600">
            {t("admin.settings.saved")}
          </span>
        )}
      </div>
    </form>
    </DirtyFormGuard>
  );
}
