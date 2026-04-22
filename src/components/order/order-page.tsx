"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingSummary } from "./booking-summary";
import { MethodPicker } from "./method-picker";
import { updateOrderDetailsAction } from "@/lib/actions/payments";
import { he } from "@/lib/i18n/he";
import type { PaymentMethod } from "@/lib/payments/types";

export interface OrderPageBooking {
  id: string;
  startAt: string;
  endAt: string;
  priceAgorot: number;
  notes: string;
  holdExpiresAt: string | null;
  paymentMethod: PaymentMethod | null;
  genderPreference: "male" | "female" | "any";
}

export interface OrderPageCustomer {
  fullName: string;
  phone: string;
  email: string;
}

export interface OrderPageService {
  name: string;
  durationMinutes: number;
  priceAgorot: number;
}

interface OrderPageProps {
  token: string;
  booking: OrderPageBooking;
  customer: OrderPageCustomer;
  service: OrderPageService;
}

export function OrderPage(props: OrderPageProps) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [fullName, setFullName] = useState(props.customer.fullName);
  const [email, setEmail] = useState(props.customer.email);
  const [notes, setNotes] = useState(props.booking.notes);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    props.booking.paymentMethod
  );

  function handleEditSave(patch: {
    full_name?: string;
    email?: string;
    notes?: string;
  }) {
    setEditError(null);
    startSave(async () => {
      const result = await updateOrderDetailsAction({
        token: props.token,
        booking_id: props.booking.id,
        ...patch,
      });

      if ("error" in result && result.error) {
        const msgs = Object.values(result.error).flat().filter(Boolean);
        setEditError(msgs[0] ?? he.common.errorGeneric);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold">{he.order.pageTitle}</h1>
      </header>

      <BookingSummary
        booking={props.booking}
        customer={{ fullName, phone: props.customer.phone, email }}
        service={props.service}
        saving={saving}
        editError={editError}
        onNameChange={(v) => {
          setFullName(v);
          handleEditSave({ full_name: v });
        }}
        onEmailChange={(v) => {
          setEmail(v);
          handleEditSave({ email: v });
        }}
        onNotesChange={(v) => {
          setNotes(v);
          handleEditSave({ notes: v });
        }}
        notes={notes}
      />

      <MethodPicker
        selected={selectedMethod}
        onSelect={setSelectedMethod}
      />

      {selectedMethod && (
        <MethodFormPlaceholder method={selectedMethod} />
      )}

      <CancellationPolicyNote />
    </div>
  );
}

/**
 * Placeholder shown once the customer picks a payment method.
 * Commits 16-18 replace this with per-method forms:
 *   - credit_card_full / cash_at_reception → CardCom iframe
 *   - voucher_dts → DTS card-number + item selection
 *   - voucher_vpay → VPay card + CVV + amount
 */
function MethodFormPlaceholder({ method }: { method: PaymentMethod }) {
  const label = he.order.methodPicker[
    camelCaseMethod(method)
  ].title;
  return (
    <div className="rounded-md border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-600">
      {label} — {he.common.loading}
    </div>
  );
}

function camelCaseMethod(
  method: PaymentMethod
): "creditCardFull" | "cashAtReception" | "voucherDts" | "voucherVpay" {
  switch (method) {
    case "credit_card_full":
      return "creditCardFull";
    case "cash_at_reception":
      return "cashAtReception";
    case "voucher_dts":
      return "voucherDts";
    case "voucher_vpay":
      return "voucherVpay";
  }
}

function CancellationPolicyNote() {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4 text-sm">
      <h2 className="font-medium text-stone-900">
        {he.order.cancellationPolicy.heading}
      </h2>
      <p className="mt-1 text-stone-600">
        {he.order.cancellationPolicy.summary}
      </p>
    </section>
  );
}
