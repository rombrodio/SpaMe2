"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { createService } from "@/lib/actions/services";
import { Button, buttonVariants } from "@/components/ui/button";
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

export default function NewServicePage() {
  const router = useRouter();
  const t = useTranslations();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await createService(formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error(t("admin.services.new.toastCreateError"));
      return;
    }

    toast.success(t("admin.services.new.toastCreated"));
    router.push("/admin/services");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.services.new.title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.services.new.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="name">
                {t("admin.services.fields.name")}
              </Label>
              <Input id="name" name="name" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                {t("admin.services.fields.description")}
              </Label>
              <Textarea id="description" name="description" rows={3} />
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
                  defaultValue={0}
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
                placeholder={t("admin.services.fields.pricePlaceholder")}
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
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active">
                {t("admin.services.fields.active")}
              </Label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting
                  ? t("admin.services.new.creating")
                  : t("admin.services.new.createButton")}
              </Button>
              <Link
                href="/admin/services"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                {t("admin.services.new.cancel")}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
