"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";

interface ContactFormProps {
  errors: Record<string, string[]>;
  submitting: boolean;
  onSubmit: (input: {
    full_name: string;
    phone: string;
    email: string;
    notes: string;
  }) => void;
}

export function ContactForm({ errors, submitting, onSubmit }: ContactFormProps) {
  const t = useTranslations();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit({
      full_name: fullName,
      phone,
      email,
      notes,
    });
  }

  const formErr = errors._form?.[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="full_name">
          {t("customer.book.stepContact.nameLabel")}
          <span className="mr-1 text-red-600">*</span>
        </Label>
        <Input
          id="full_name"
          name="full_name"
          type="text"
          required
          autoComplete="name"
          placeholder={t("customer.book.stepContact.namePlaceholder")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1"
        />
        <FieldError msg={errors.full_name?.[0]} />
      </div>

      <div>
        <Label htmlFor="phone">
          {t("customer.book.stepContact.phoneLabel")}
          <span className="mr-1 text-red-600">*</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder={t("customer.book.stepContact.phonePlaceholder")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1"
          dir="ltr"
        />
        <FieldError msg={errors.phone?.[0]} />
      </div>

      <div>
        <Label htmlFor="email">
          {t("customer.book.stepContact.emailLabel")}
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
          dir="ltr"
        />
        <FieldError msg={errors.email?.[0]} />
      </div>

      <div>
        <Label htmlFor="notes">
          {t("customer.book.stepContact.notesLabel")}
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1"
        />
        <FieldError msg={errors.notes?.[0]} />
      </div>

      {formErr && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {formErr}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={submitting}>
        {submitting
          ? t("common.loading")
          : t("customer.book.stepContact.submitLabel")}
      </Button>
    </form>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}
