"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  updateTherapist,
  deleteTherapist,
  resendInvite,
} from "@/lib/actions/therapists";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
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

interface Therapist {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  color: string | null;
  is_active: boolean;
  gender: "male" | "female" | null;
}

export function TherapistEditForm({
  therapist,
  hasAuthUser,
}: {
  therapist: Therapist;
  hasAuthUser?: boolean;
}) {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);

  async function handleResendInvite() {
    setResending(true);
    setResendNotice(null);
    setErrors(undefined);
    const result = await resendInvite(therapist.id);
    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
    } else {
      setResendNotice(t("admin.therapists.edit.inviteSent"));
      router.refresh();
    }
    setResending(false);
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateTherapist(therapist.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.therapists.edit.toastSaveError"));
      return;
    }

    toast.success(t("admin.therapists.edit.toastSaved"));
    resetDirty();
    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    const result = await deleteTherapist(therapist.id);

    if (result && 'error' in result) {
      const err = result.error as Record<string, string[]>;
      const message =
        err._form?.join(" ") ?? t("admin.therapists.edit.toastDeleteError");
      throw new Error(message);
    }

    toast.success(t("admin.therapists.edit.toastDeleted"));
    router.push("/admin/therapists");
  }

  return (
    <DirtyFormGuard dirty={dirty && !submitting}>
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.therapists.edit.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <FormErrors errors={errors} />
          {resendNotice && (
            <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              {resendNotice}
            </div>
          )}
          {!hasAuthUser && (
            <div className="flex items-center justify-between rounded-md border border-yellow-300 bg-yellow-50 p-3">
              <div className="text-sm text-yellow-900">
                {t("admin.therapists.edit.noAuthUserLinked")}
                {!therapist.email && (
                  <> {t("admin.therapists.edit.noAuthUserLinkedAddEmail")}</>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resending || !therapist.email}
                onClick={handleResendInvite}
              >
                {resending
                  ? t("admin.therapists.edit.sending")
                  : t("admin.therapists.edit.sendInvite")}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name">
              {t("admin.therapists.fields.fullName")}
            </Label>
            <Input
              id="full_name"
              name="full_name"
              required
              defaultValue={therapist.full_name}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">
                {t("admin.therapists.fields.phone")}
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={therapist.phone ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                {t("admin.therapists.fields.email")}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={therapist.email ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">
              {t("admin.therapists.fields.color")}
            </Label>
            <Input
              id="color"
              name="color"
              type="color"
              defaultValue={therapist.color ?? "#6366f1"}
            />
          </div>

          <fieldset className="space-y-2">
            <Label>
              {t("admin.therapists.gender.label")}
              {therapist.gender === null && (
                <span className="ms-2 rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-900">
                  {t("admin.therapists.gender.notSet")}
                </span>
              )}
            </Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  defaultChecked={therapist.gender === "female"}
                  className="h-4 w-4"
                />
                {t("admin.therapists.gender.female")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  defaultChecked={therapist.gender === "male"}
                  className="h-4 w-4"
                />
                {t("admin.therapists.gender.male")}
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.therapists.gender.helper")}
            </p>
          </fieldset>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={therapist.is_active}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is_active">
              {t("admin.therapists.fields.active")}
            </Label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("admin.therapists.edit.saving")
                : t("admin.therapists.edit.save")}
            </Button>
            <Link
              href="/admin/therapists"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t("admin.therapists.edit.back")}
            </Link>
            <div className="ml-auto">
              <ConfirmButton
                title={t("admin.therapists.edit.deleteTitle")}
                description={
                  <>
                    <p>
                      {t("admin.therapists.edit.deleteDescription", {
                        name: therapist.full_name,
                      })}
                    </p>
                    <p>{t("admin.therapists.edit.deleteConfirmBody")}</p>
                  </>
                }
                confirmText="DELETE"
                confirmLabel={t("admin.therapists.edit.deleteConfirmLabel")}
                onConfirm={handleDelete}
              >
                {t("admin.therapists.edit.delete")}
              </ConfirmButton>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
    </DirtyFormGuard>
  );
}
