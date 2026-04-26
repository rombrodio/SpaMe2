"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  updateReceptionist,
  deleteReceptionist,
  resendReceptionistInvite,
} from "@/lib/actions/receptionists";
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

interface Receptionist {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export function ReceptionistEditForm({
  receptionist,
  hasAuthUser,
}: {
  receptionist: Receptionist;
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
    const result = await resendReceptionistInvite(receptionist.id);
    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
    } else {
      setResendNotice(
        result?.warning ?? t("admin.receptionists.edit.inviteSent")
      );
      router.refresh();
    }
    setResending(false);
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateReceptionist(receptionist.id, formData);

    if (result && "error" in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.receptionists.edit.toastSaveError"));
      return;
    }

    resetDirty();
    toast.success(t("admin.receptionists.edit.toastSaved"));
    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    const result = await deleteReceptionist(receptionist.id);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[] | undefined>;
      throw new Error(
        (err._form ?? [t("admin.receptionists.edit.toastDeleteError")]).join(
          ", "
        )
      );
    }
    toast.success(t("admin.receptionists.edit.toastDeleted"));
    router.push("/admin/receptionists");
  }

  return (
    <DirtyFormGuard dirty={dirty}>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.receptionists.edit.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />
            {resendNotice && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                {resendNotice}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">
                {t("admin.receptionists.fields.fullName")}
              </Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={receptionist.full_name}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">
                  {t("admin.receptionists.fields.phone")}
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={receptionist.phone ?? ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  {t("admin.receptionists.fields.email")}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={receptionist.email ?? ""}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={receptionist.is_active}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active">
                {t("admin.receptionists.fields.active")}
              </Label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.receptionists.edit.saving")
                  : t("admin.receptionists.edit.save")}
              </Button>
              <Link
                href="/admin/receptionists"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("admin.receptionists.edit.back")}
              </Link>
              {receptionist.email && !hasAuthUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendInvite}
                  disabled={resending}
                >
                  {resending
                    ? t("admin.receptionists.edit.sending")
                    : t("admin.receptionists.edit.sendInvite")}
                </Button>
              )}
              {receptionist.email && hasAuthUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendInvite}
                  disabled={resending}
                >
                  {resending
                    ? t("admin.receptionists.edit.sending")
                    : t("admin.receptionists.edit.resendInvite")}
                </Button>
              )}
              <div className="ml-auto">
                <ConfirmButton
                  title={t("admin.receptionists.edit.deleteTitle")}
                  description={
                    <>
                      <p>
                        {t("admin.receptionists.edit.deleteDescription", {
                          name: receptionist.full_name,
                        })}
                      </p>
                      <p>{t("admin.receptionists.edit.deleteConfirmBody")}</p>
                    </>
                  }
                  confirmText="DELETE"
                  confirmLabel={t(
                    "admin.receptionists.edit.deleteConfirmLabel"
                  )}
                  onConfirm={handleDelete}
                >
                  {t("admin.receptionists.edit.delete")}
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </DirtyFormGuard>
  );
}
