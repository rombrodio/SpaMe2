"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
      setMessage((result.error as Record<string, string[]>)._form?.[0] ?? "Failed to save services");
      setSubmitting(false);
      return;
    }

    setMessage("Services updated.");
    setSubmitting(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Services</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allServices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No services exist yet. Create services first.
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
          {submitting ? "Saving..." : "Save Services"}
        </Button>
      </CardContent>
    </Card>
  );
}
