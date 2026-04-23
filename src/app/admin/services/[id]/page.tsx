"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  getService,
  updateService,
  deleteService,
} from "@/lib/actions/services";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
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
  const [service, setService] = useState<ServiceRecord | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

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
      toast.error("Couldn't save service.");
      return;
    }

    toast.success("Service saved.");
    router.push("/admin/services");
  }

  async function handleDelete() {
    const result = await deleteService(params.id);

    if (result && 'error' in result) {
      const message =
        result.error && "_form" in result.error && Array.isArray(result.error._form)
          ? result.error._form.join(" ")
          : "Couldn't delete service.";
      throw new Error(message);
    }

    toast.success("Service deleted.");
    router.push("/admin/services");
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (!service) {
    return <p className="text-destructive">Service not found.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Service</h1>

      <Card>
        <CardHeader>
          <CardTitle>Service Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={service.name}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={service.description ?? ""}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Duration (minutes)</Label>
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
                <Label htmlFor="buffer_minutes">Buffer (minutes)</Label>
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
              <Label htmlFor="price_ils">Price (ILS)</Label>
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
                Enter the price in whole shekels (e.g. 280 for ₪280.00). Stored
                internally as agorot (1 ₪ = 100).
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
              <Label htmlFor="is_active">Active</Label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
              <Link href="/admin/services" className={cn(buttonVariants({ variant: "outline" }))}>Cancel</Link>
              <div className="ml-auto">
                <ConfirmButton
                  title="Delete service"
                  description={
                    <>
                      <p>
                        Deleting <strong>{service.name}</strong> is permanent
                        and cannot be undone. Existing bookings that reference
                        this service will keep the cached copy but you won&apos;t
                        be able to book it for new customers.
                      </p>
                      <p>Type the service name to confirm.</p>
                    </>
                  }
                  confirmText={service.name}
                  confirmLabel="Delete service"
                  onConfirm={handleDelete}
                >
                  Delete
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <VoucherMappingsSection serviceId={params.id} />
    </div>
  );
}
