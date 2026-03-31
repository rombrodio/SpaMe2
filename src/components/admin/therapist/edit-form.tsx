"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateTherapist,
  deleteTherapist,
} from "@/lib/actions/therapists";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

interface Therapist {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  color: string | null;
  is_active: boolean;
}

export function TherapistEditForm({ therapist }: { therapist: Therapist }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateTherapist(therapist.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      return;
    }

    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this therapist?")) {
      return;
    }

    setDeleting(true);
    const result = await deleteTherapist(therapist.id);

    if (result && 'error' in result) {
      setErrors(result.error as Record<string, string[]>);
      setDeleting(false);
      return;
    }

    router.push("/admin/therapists");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Therapist Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <FormErrors errors={errors} />

          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              name="full_name"
              required
              defaultValue={therapist.full_name}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={therapist.phone ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={therapist.email ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Input
              id="color"
              name="color"
              type="color"
              defaultValue={therapist.color ?? "#6366f1"}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={therapist.is_active}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
            <Link href="/admin/therapists" className={cn(buttonVariants({ variant: "outline" }))}>Back</Link>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
              className="ml-auto"
            >
              {deleting ? "Deleting..." : "Delete Therapist"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
