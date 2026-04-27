"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  getService,
  updateService,
  deleteService,
} from "@/lib/actions/services";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";
import { VoucherMappingsSection } from "@/components/admin/service/voucher-mappings-section";

interface ServiceRecord {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number | null;
  price_ils: number;
  is_active: boolean;
}

export default function EditServicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const t = useTranslations();
  const [service, setService] = useState<ServiceRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);

  useEffect(() => {
    getService(params.id).then((data) => {
      setService(data as ServiceRecord);
      setLoading(false);
    });
  }, [params.id]);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateService(params.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.services.edit.toastSaveError"));
      return;
    }

    toast.success(t("admin.services.edit.toastSaved"));
    resetDirty();
    router.push("/admin/services");
  }

  async function handleDelete() {
    const result = await deleteService(params.id);

    if (result && 'error' in result) {
      const message =
        result.error && "_form" in result.error && Array.isArray(result.error._form)
          ? result.error._form.join(" ")
          : t("admin.services.edit.toastDeleteError");
      throw new Error(message);
    }

    toast.success(t("admin.services.edit.toastDeleted"));
    router.push("/admin/services");
  }

  if (loading) {
    return <p className="text-muted-foreground">{t("admin.services.edit.loading")}</p>;
  }

  if (!service) {
    return <p className="text-destructive">{t("admin.services.edit.notFound")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: t("admin.services.crumb"), href: "/admin/services" },
          { label: service.name },
        ]}
      />
      <h1 className="text-2xl font-bold">{service.name}</h1>

      <DirtyFormGuard dirty={dirty && !submitting}>
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.services.edit.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="name">{t("admin.services.fields.name")}</Label>
              <Input
                id="name"
                name="name"
                defaultValue={service.name}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                {t("admin.services.fields.description")}
              </Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={service.description ?? ""}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration_minutes">
                  {t("admin.services.fields.durationMinutes")}
                </Label>
                <Input
                  id="duration_minutes"
                  name="duration_minutes"
                  type="number"
                  min={1}
                  defaultValue={service.duration_minutes}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="buffer_minutes">
                  {t("admin.services.fields.bufferMinutes")}
                </Label>
                <Input
                  id="buffer_minutes"
                  name="buffer_minutes"
                  type="number"
                  min={0}
                  defaultValue={service.buffer_minutes ?? 0}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_ils">
                {t("admin.services.fields.priceIls")}
              </Label>
              <Input
                id="price_ils"
                name="price_ils"
                type="number"
                min={0}
                step="0.01"
                defaultValue={(service.price_ils / 100).toFixed(2)}
                required
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.services.fields.priceHelper")}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={service.is_active}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active">
                {t("admin.services.fields.active")}
              </Label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.services.edit.saving")
                  : t("admin.services.edit.save")}
              </Button>
              <Link
                href="/admin/services"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("admin.services.edit.cancel")}
              </Link>
              <div className="ml-auto">
                <ConfirmButton
                  title={t("admin.services.edit.deleteTitle")}
                  description={
                    <>
                      <p>
                        {t("admin.services.edit.deleteDescriptionBody", {
                          name: service.name,
                        })}
                      </p>
                      <p>{t("admin.services.edit.deleteConfirmBody")}</p>
                    </>
                  }
                  confirmText="DELETE"
                  confirmLabel={t("admin.services.edit.deleteConfirmLabel")}
                  onConfirm={handleDelete}
                >
                  {t("admin.services.edit.delete")}
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      </DirtyFormGuard>

      <VoucherMappingsSection serviceId={params.id} />
    </div>
  );
}
