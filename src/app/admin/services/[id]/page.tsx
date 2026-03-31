"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  getService,
  updateService,
  deleteService,
} from "@/lib/actions/services";
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

export default function EditServicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [service, setService] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getService(params.id).then((data) => {
      setService(data);
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
      return;
    }

    router.push("/admin/services");
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this service?")) return;

    setDeleting(true);
    const result = await deleteService(params.id);

    if (result && 'error' in result) {
      setErrors(result.error as Record<string, string[]>);
      setDeleting(false);
      return;
    }

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
              <Label htmlFor="price_ils">Price (ILS) — in agorot</Label>
              <Input
                id="price_ils"
                name="price_ils"
                type="number"
                min={0}
                defaultValue={service.price_ils}
                required
              />
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
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
                className="ml-auto"
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
