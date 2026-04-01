"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setRoomServices } from "@/lib/actions/rooms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
      setMessage((result.error as Record<string, string[]>)._form?.[0] ?? "Failed to save services.");
      setSaving(false);
      return;
    }

    setMessage("Services updated.");
    setSaving(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compatible Services</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allServices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No services exist yet. Create a service first.
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
          {saving ? "Saving..." : "Save Services"}
        </Button>
      </CardContent>
    </Card>
  );
}
