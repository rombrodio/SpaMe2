"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSpaSettings } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
import { FormErrors } from "@/components/admin/form-message";

interface SettingsFormProps {
  initialName: string;
  initialPhone: string;
}

export function SettingsForm({ initialName, initialPhone }: SettingsFormProps) {
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
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <FormErrors errors={errors} />

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
