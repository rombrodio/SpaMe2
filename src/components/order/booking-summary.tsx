"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  he,
  formatIlsFromAgorot,
  formatDateTimeILFull,
} from "@/lib/i18n/he";
import type {
  OrderPageBooking,
  OrderPageCustomer,
  OrderPageService,
} from "./order-page";

interface BookingSummaryProps {
  booking: OrderPageBooking;
  customer: OrderPageCustomer;
  service: OrderPageService;
  notes: string;
  saving: boolean;
  editError: string | null;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

/**
 * Customer-facing booking summary.
 *
 * Per the phase-4 anonymization policy, the therapist name / id is
 * deliberately not rendered — the customer sees only service, date,
 * time, and (in the gender line) their own preference. First meeting
 * with the assigned therapist happens at the spa.
 */
export function BookingSummary({
  booking,
  customer,
  service,
  notes,
  saving,
  editError,
  onNameChange,
  onEmailChange,
  onNotesChange,
}: BookingSummaryProps) {
  const genderLabel =
    booking.genderPreference === "any"
      ? he.book.stepSlot.gender.any
      : booking.genderPreference === "female"
      ? he.book.stepSlot.gender.female
      : he.book.stepSlot.gender.male;

  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold">
        {he.order.summary.heading}
      </h2>

      <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-y-2 text-sm">
        <dt className="text-stone-600">{he.order.summary.serviceLabel}</dt>
        <dd className="font-medium">
          {service.name}{" "}
          <span className="text-stone-500">
            · {he.book.stepService.minutes(service.durationMinutes)}
          </span>
        </dd>

        <dt className="text-stone-600">{he.order.summary.dateTimeLabel}</dt>
        <dd className="font-medium">{formatDateTimeILFull(booking.startAt)}</dd>

        <dt className="text-stone-600">
          {he.book.stepSlot.gender.heading}
        </dt>
        <dd>{genderLabel}</dd>

        <dt className="text-stone-600 self-center">
          {he.book.stepService.priceLabel}
        </dt>
        <dd className="font-semibold">
          {formatIlsFromAgorot(service.priceAgorot)}
        </dd>
      </dl>

      <hr className="my-4 border-stone-200" />

      <EditableField
        id="full_name"
        label={he.order.summary.customerLabel}
        value={customer.fullName}
        dir="rtl"
        onSave={onNameChange}
        saving={saving}
      />

      <div className="mt-3 text-sm">
        <div className="text-stone-600">{he.order.summary.phoneLabel}</div>
        <div dir="ltr" className="font-medium">
          {customer.phone}
        </div>
      </div>

      <EditableField
        id="email"
        label={he.order.summary.emailLabel}
        value={customer.email}
        dir="ltr"
        type="email"
        onSave={onEmailChange}
        saving={saving}
        emptyLabel="—"
      />

      <EditableNotes
        value={notes}
        onSave={onNotesChange}
        saving={saving}
      />

      {editError && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {editError}
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Inline editing primitives — keep the UI simple: tap edit, see
// an input, tap save/cancel. No modals. No dirty tracking beyond
// the current in-flight save.
// ──────────────────────────────────────────────────────────────

interface EditableFieldProps {
  id: string;
  label: string;
  value: string;
  dir?: "rtl" | "ltr";
  type?: "text" | "email";
  saving: boolean;
  emptyLabel?: string;
  onSave: (v: string) => void;
}

function EditableField({
  id,
  label,
  value,
  dir,
  type,
  saving,
  emptyLabel,
  onSave,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (next !== value) onSave(next);
    setEditing(false);
  }

  return (
    <div className="mt-3 text-sm">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-stone-600">
          {label}
        </label>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {he.common.edit}
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={commit}
              disabled={saving}
            >
              {he.common.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              {he.common.cancel}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <Input
          id={id}
          type={type ?? "text"}
          dir={dir ?? "rtl"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1"
          autoFocus
        />
      ) : (
        <div dir={dir ?? "rtl"} className="mt-1 font-medium">
          {value || emptyLabel || ""}
        </div>
      )}
    </div>
  );
}

function EditableNotes({
  value,
  onSave,
  saving,
}: {
  value: string;
  onSave: (v: string) => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (next !== value) onSave(next);
    setEditing(false);
  }

  return (
    <div className="mt-3 text-sm">
      <div className="flex items-center justify-between">
        <label className="text-stone-600">
          {he.order.summary.notesLabel}
        </label>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {he.common.edit}
          </Button>
        ) : (
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={commit}
              disabled={saving}
            >
              {he.common.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              {he.common.cancel}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className="mt-1"
          autoFocus
        />
      ) : (
        <div className="mt-1 whitespace-pre-wrap font-medium">
          {value || "—"}
        </div>
      )}
    </div>
  );
}
