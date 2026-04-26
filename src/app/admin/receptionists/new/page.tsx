"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createReceptionist } from "@/lib/actions/receptionists";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

export default function NewReceptionistPage() {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [warning, setWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sendInvite, setSendInvite] = useState(true);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);
    setWarning(null);

    const result = await createReceptionist(formData);

    if (result && "error" in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.receptionists.new.toastCreateError"));
      return;
    }

    if (result?.warning) {
      setWarning(result.warning);
      setSubmitting(false);
      toast.warning(t("admin.receptionists.new.toastCreatedWithWarning"));
      return;
    }

    toast.success(t("admin.receptionists.new.toastCreated"));
    router.push("/admin/receptionists");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">
        {t("admin.receptionists.new.title")}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.receptionists.new.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />
            {warning && (
              <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                {warning}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">
                {t("admin.receptionists.fields.fullName")}
              </Label>
              <Input id="full_name" name="full_name" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">
                  {t("admin.receptionists.fields.phone")}
                </Label>
                <Input id="phone" name="phone" type="tel" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  {t("admin.receptionists.fields.email")}{" "}
                  {sendInvite && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required={sendInvite}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active">
                {t("admin.receptionists.fields.active")}
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="send_invite"
                name="send_invite"
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="send_invite">
                {t("admin.receptionists.fields.sendInvite")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.receptionists.new.emailHelper")}
            </p>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.receptionists.new.creating")
                  : t("admin.receptionists.new.createButton")}
              </Button>
              <Link
                href="/admin/receptionists"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("common.cancel")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
