"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setTherapistServices } from "@/lib/actions/therapists";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

interface Service {
  id: string;
  name: string;
}

interface Props {
  therapistId: string;
  allServices: Service[];
  assignedServiceIds: string[];
}

export function TherapistServicesSection({
  therapistId,
  allServices,
  assignedServiceIds,
}: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(assignedServiceIds)
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleService(serviceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    setMessage(null);

    const result = await setTherapistServices(
      therapistId,
      Array.from(selected)
    );

    if (result && 'error' in result) {
      const msg =
        (result.error as Record<string, string[]>)._form?.[0] ??
        t("admin.therapists.services.saveError");
      setMessage(msg);
      setSubmitting(false);
      toast.error(msg);
      return;
    }

    setMessage(t("admin.therapists.services.saved"));
    setSubmitting(false);
    toast.success(t("admin.therapists.services.saved"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.therapists.services.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allServices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("admin.therapists.services.empty")}
          </p>
        ) : (
          <div className="space-y-2">
            {allServices.map((service) => (
              <div key={service.id} className="flex items-center gap-2">
                <input
                  id={`svc-${service.id}`}
                  type="checkbox"
                  checked={selected.has(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor={`svc-${service.id}`}>{service.name}</Label>
              </div>
            ))}
          </div>
        )}

        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}

        <Button onClick={handleSave} disabled={submitting || allServices.length === 0}>
          {submitting
            ? t("admin.therapists.services.saving")
            : t("admin.therapists.services.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
