"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
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
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);
  const [customer, setCustomer] = useState<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    notes: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCustomer(params.id);
        setCustomer(data);
      } catch {
        setErrors({ _form: [t("admin.customers.edit.notFound")] });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id, t]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(undefined);

    const formData = new FormData(e.currentTarget);
    const result = await updateCustomer(params.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.customers.edit.toastSaveError"));
      return;
    }

    toast.success(t("admin.customers.edit.toastSaved"));
    resetDirty();
    router.push("/admin/customers");
  }

  async function handleDelete() {
    const result = await deleteCustomer(params.id);

    if (result && 'error' in result) {
      const err = result.error as Record<string, string[]>;
      const message =
        err._form?.join(" ") ?? t("admin.customers.edit.toastDeleteError");
      throw new Error(message);
    }

    toast.success(t("admin.customers.edit.toastDeleted"));
    router.push("/admin/customers");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">{t("admin.customers.edit.title")}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("admin.customers.edit.loading")}
        </p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">{t("admin.customers.edit.title")}</h1>
        <FormErrors errors={errors} />
        <Link
          href="/admin/customers"
          className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
        >
          {t("admin.customers.edit.backToCustomers")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Breadcrumbs
        items={[
          { label: t("admin.customers.crumb"), href: "/admin/customers" },
          { label: customer.full_name || customer.phone },
        ]}
      />
      <h1 className="mt-2 text-2xl font-bold">
        {customer.full_name || customer.phone}
      </h1>

      <DirtyFormGuard dirty={dirty && !submitting}>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("admin.customers.edit.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="full_name">
                {t("admin.customers.fields.fullName")}
              </Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder={t("admin.customers.fields.fullNamePlaceholder")}
                defaultValue={customer.full_name ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                {t("admin.customers.fields.phone")}{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder={t("admin.customers.fields.phonePlaceholder")}
                defaultValue={customer.phone}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                {t("admin.customers.fields.email")}
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder={t("admin.customers.fields.emailPlaceholder")}
                defaultValue={customer.email ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">
                {t("admin.customers.fields.notes")}
              </Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder={t("admin.customers.fields.notesPlaceholder")}
                rows={3}
                defaultValue={customer.notes ?? ""}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.customers.edit.saving")
                  : t("admin.customers.edit.save")}
              </Button>
              <Link
                href="/admin/customers"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("admin.customers.edit.cancel")}
              </Link>
              <div className="ml-auto">
                <ConfirmButton
                  title={t("admin.customers.edit.deleteTitle")}
                  description={
                    <>
                      <p>
                        {t("admin.customers.edit.deleteDescription", {
                          name: customer.full_name || customer.phone,
                        })}
                      </p>
                      <p>{t("admin.customers.edit.deleteConfirmBody")}</p>
                    </>
                  }
                  confirmText="DELETE"
                  confirmLabel={t("admin.customers.edit.deleteConfirmLabel")}
                  onConfirm={handleDelete}
                >
                  {t("admin.customers.edit.delete")}
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      </DirtyFormGuard>
    </div>
  );
}
