"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  updateTherapist,
  deleteTherapist,
  resendInvite,
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
  gender: "male" | "female" | null;
}

export function TherapistEditForm({
  therapist,
  hasAuthUser,
}: {
  therapist: Therapist;
  hasAuthUser?: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  async function handleResendInvite() {
    setResending(true);
    setResendNotice(null);
    setErrors(undefined);
    const result = await resendInvite(therapist.id);
    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
    } else {
      setResendNotice("Invite sent.");
      router.refresh();
    }
    setResending(false);
  }

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
          {resendNotice && (
            <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              {resendNotice}
            </div>
          )}
          {!hasAuthUser && (
            <div className="flex items-center justify-between rounded-md border border-yellow-300 bg-yellow-50 p-3">
              <div className="text-sm text-yellow-900">
                No login user linked to this therapist.
                {!therapist.email && " Add an email, save, then send invite."}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={resending || !therapist.email}
                onClick={handleResendInvite}
              >
                {resending ? "Sending..." : "Send invite"}
              </Button>
            </div>
          )}

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

          <fieldset className="space-y-2">
            <Label>
              Gender
              {therapist.gender === null && (
                <span className="ms-2 rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-900">
                  not set — please pick one
                </span>
              )}
            </Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender"
                  value="female"
                  defaultChecked={therapist.gender === "female"}
                  className="h-4 w-4"
                />
                Female
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="gender"
                  value="male"
                  defaultChecked={therapist.gender === "male"}
                  className="h-4 w-4"
                />
                Male
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Used to match customer gender preferences at booking time.
              Not displayed to customers.
            </p>
          </fieldset>

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
