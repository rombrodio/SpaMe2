"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCustomer } from "@/lib/actions/customers";
import { Button, buttonVariants } from "@/components/ui/button";
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

export default function NewCustomerPage() {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string[]> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrors(undefined);

    const formData = new FormData(e.currentTarget);
    const result = await createCustomer(formData);

    if (result && 'error' in result) {
      setErrors(result.error);
      setSubmitting(false);
      return;
    }

    router.push("/admin/customers");
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">New Customer</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Customer Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormErrors errors={errors} />

            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input id="full_name" name="full_name" placeholder="Full name" />
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
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any notes about this customer..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Customer"}
              </Button>
              <Link href="/admin/customers" className={cn(buttonVariants({ variant: "outline" }))}>Cancel</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
