"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/lib/actions/customers";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormErrors } from "@/components/admin/form-message";

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    notes: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCustomer(params.id);
        setCustomer(data);
      } catch {
        setErrors({ _form: ["Customer not found."] });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(undefined);

    const formData = new FormData(e.currentTarget);
    const result = await updateCustomer(params.id, formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      toast.error("Couldn't save customer.");
      return;
    }

    toast.success("Customer saved.");
    router.push("/admin/customers");
  }

  async function handleDelete() {
    const result = await deleteCustomer(params.id);

    if (result && 'error' in result) {
      const err = result.error as Record<string, string[]>;
      const message = err._form?.join(" ") ?? "Couldn't delete customer.";
      throw new Error(message);
    }

    toast.success("Customer deleted.");
    router.push("/admin/customers");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Edit Customer</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Edit Customer</h1>
        <FormErrors errors={errors} />
        <Link href="/admin/customers" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>Back to Customers</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Edit Customer</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                name="full_name"
                placeholder="Full name"
                defaultValue={customer.full_name ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+972-50-000-0000"
                defaultValue={customer.phone}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="email@example.com"
                defaultValue={customer.email ?? ""}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any notes about this customer..."
                rows={3}
                defaultValue={customer.notes ?? ""}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
              <Link href="/admin/customers" className={cn(buttonVariants({ variant: "outline" }))}>Cancel</Link>
              <div className="ml-auto">
                <ConfirmButton
                  title="Delete customer"
                  description={
                    <>
                      <p>
                        Deleting <strong>{customer.full_name || customer.phone}</strong>{" "}
                        is permanent. Their booking history stays on the
                        bookings table as a cached snapshot, but the contact
                        record (phone, email, notes) will be removed.
                      </p>
                      <p>Type the customer name to confirm.</p>
                    </>
                  }
                  confirmText={customer.full_name || customer.phone}
                  confirmLabel="Delete customer"
                  onConfirm={handleDelete}
                >
                  Delete
                </ConfirmButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
