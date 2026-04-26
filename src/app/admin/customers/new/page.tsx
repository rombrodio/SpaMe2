"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createCustomer } from "@/lib/actions/customers";
import { Button, buttonVariants } from "@/components/ui/button";
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

export default function NewCustomerPage() {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(undefined);

    const formData = new FormData(e.currentTarget);
    const result = await createCustomer(formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.customers.new.toastCreateError"));
      return;
    }

    toast.success(t("admin.customers.new.toastCreated"));
    router.push("/admin/customers");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">{t("admin.customers.new.title")}</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t("admin.customers.new.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="full_name">
                {t("admin.customers.fields.fullName")}
              </Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder={t("admin.customers.fields.fullNamePlaceholder")}
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
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.customers.new.creating")
                  : t("admin.customers.new.createButton")}
              </Button>
              <Link
                href="/admin/customers"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("admin.customers.new.cancel")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
