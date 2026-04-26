"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { setRoomServices } from "@/lib/actions/rooms";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

interface RoomServicesSectionProps {
  roomId: string;
  allServices: { id: string; name: string }[];
  assignedServiceIds: string[];
}

export function RoomServicesSection({
  roomId,
  allServices,
  assignedServiceIds,
}: RoomServicesSectionProps) {
  const router = useRouter();
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(assignedServiceIds)
  );
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    setMessage(null);

    const result = await setRoomServices(roomId, Array.from(selected));

    if (result && 'error' in result) {
      const msg =
        (result.error as Record<string, string[]>)._form?.[0] ??
        t("admin.rooms.services.saveError");
      setMessage(msg);
      setSaving(false);
      toast.error(msg);
      return;
    }

    setMessage(t("admin.rooms.services.saved"));
    setSaving(false);
    toast.success(t("admin.rooms.services.toastSaved"));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.rooms.services.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allServices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("admin.rooms.services.empty")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {allServices.map((service) => (
              <label
                key={service.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(service.id)}
                  onChange={() => toggleService(service.id)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                {service.name}
              </label>
            ))}
          </div>
        )}

        {message && (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}

        <Button onClick={handleSave} disabled={saving || allServices.length === 0}>
          {saving
            ? t("admin.rooms.services.saving")
            : t("admin.rooms.services.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
