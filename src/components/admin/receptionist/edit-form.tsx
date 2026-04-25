"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  updateReceptionist,
  deleteReceptionist,
  resendReceptionistInvite,
} from "@/lib/actions/receptionists";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import {
  DirtyFormGuard,
  useFormDirtyOnRef,
} from "@/components/ui/dirty-form-guard";
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

interface Receptionist {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}

export function ReceptionistEditForm({
  receptionist,
  hasAuthUser,
}: {
  receptionist: Receptionist;
  hasAuthUser?: boolean;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [dirty, resetDirty] = useFormDirtyOnRef(formRef);

  async function handleResendInvite() {
    setResending(true);
    setResendNotice(null);
    setErrors(undefined);
    const result = await resendReceptionistInvite(receptionist.id);
    if (result && "error" in result) {
      setErrors(result.error as Record<string, string[]>);
    } else {
      setResendNotice(result?.warning ?? "Invite sent.");
      router.refresh();
    }
    setResending(false);
  }

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setErrors(undefined);

    const result = await updateReceptionist(receptionist.id, formData);

    if (result && "error" in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error("Couldn't save receptionist.");
      return;
    }

    resetDirty();
    toast.success("Receptionist saved.");
    router.refresh();
    setSubmitting(false);
  }

  async function handleDelete() {
    const result = await deleteReceptionist(receptionist.id);
    if (result && "error" in result) {
      const err = result.error as Record<string, string[] | undefined>;
      throw new Error((err._form ?? ["Delete failed"]).join(", "));
    }
    toast.success("Receptionist deleted.");
    router.push("/admin/receptionists");
  }

  return (
    <DirtyFormGuard dirty={dirty}>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />
            {resendNotice && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
                {resendNotice}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                defaultValue={receptionist.full_name}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={receptionist.phone ?? ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={receptionist.email ?? ""}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                name="is_active"
                type="checkbox"
                defaultChecked={receptionist.is_active}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="is_active">Active</Label>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
              <Link
                href="/admin/receptionists"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Back
              </Link>
              {receptionist.email && !hasAuthUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendInvite}
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Send invite"}
                </Button>
              )}
              {receptionist.email && hasAuthUser && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResendInvite}
                  disabled={resending}
                >
                  {resending ? "Sending..." : "Resend invite"}
                </Button>
              )}
              <div className="ml-auto">
                <ConfirmButton
                  title="Delete receptionist"
                  description={
                    <>
                      <p>
                        Deleting <strong>{receptionist.full_name}</strong> is
                        permanent. Their on-duty availability rules will be
                        removed; any bookings they created stay in the
                        database as historical records.
                      </p>
                      <p>
                        Type <strong>DELETE</strong> to confirm.
                      </p>
                    </>
                  }
                  confirmText="DELETE"
                  confirmLabel="Delete receptionist"
                  onConfirm={handleDelete}
                >
                  Delete Receptionist
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </DirtyFormGuard>
  );
}
