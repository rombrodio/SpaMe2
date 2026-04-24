"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
        toast.error("Couldn't save settings.");
        return;
      }
      setSaved(true);
      toast.success("Settings saved.");
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
          On-call manager
        </h3>

        <div className="space-y-2">
          <Label htmlFor="on_call_manager_name">Manager name</Label>
          <Input
            id="on_call_manager_name"
            name="on_call_manager_name"
            defaultValue={initialName}
            placeholder="Optional — shown in audit logs"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="on_call_manager_phone">Manager phone</Label>
          <Input
            id="on_call_manager_phone"
            name="on_call_manager_phone"
            defaultValue={initialPhone}
            placeholder="e.g. 0521234567"
          />
          <p className="text-xs text-muted-foreground">
            Accepts local (05X) or E.164 (+972) format. Stored as E.164.
          </p>
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Operating hours
        </h3>
        <p className="text-sm text-muted-foreground">
          The outer window the spa is open. Therapist availability rules
          are clipped to this window when finding bookable slots.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="business_hours_start">Opens at</Label>
            <Select
              id="business_hours_start"
              name="business_hours_start"
              defaultValue={initialBusinessHoursStart}
            >
              {HOUR_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_hours_end">Closes at</Label>
            <Select
              id="business_hours_end"
              name="business_hours_end"
              defaultValue={initialBusinessHoursEnd}
            >
              {HOUR_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="slot_granularity_minutes">
            Booking slot granularity
          </Label>
          <Select
            id="slot_granularity_minutes"
            name="slot_granularity_minutes"
            defaultValue={String(initialSlotGranularityMinutes)}
          >
            <option value="60">60 minutes (on the hour only)</option>
            <option value="30">30 minutes</option>
            <option value="15">15 minutes</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls the grid customers can pick from and what the admin
            can set as availability rule start/end times. The spa&apos;s
            V2 rule is &quot;all treatments start on the hour&quot; — so
            default is 60.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
        {saved && !isPending && (
          <span className="text-sm text-green-600">Saved.</span>
        )}
      </div>
    </form>
    </DirtyFormGuard>
  );
}
