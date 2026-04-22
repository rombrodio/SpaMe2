"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookingSummary } from "./booking-summary";
import { MethodPicker } from "./method-picker";
import { CardComPaymentForm } from "./cardcom-iframe";
import { DtsVoucherForm } from "./voucher-dts-form";
import { VpayVoucherForm } from "./voucher-vpay-form";
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
        <MethodForm
          method={selectedMethod}
          token={props.token}
          bookingId={props.booking.id}
          serviceName={props.service.name}
          priceAgorot={props.service.priceAgorot}
        />
      )}

      <CancellationPolicyNote />
    </div>
  );
}

/**
 * Dispatches the chosen payment method to the right per-method form.
 * CardCom handles both credit_card_full (capture) and cash_at_reception
 * (CreateTokenOnly); voucher forms land in commits 17-18.
 */
function MethodForm(props: {
  method: PaymentMethod;
  token: string;
  bookingId: string;
  serviceName: string;
  priceAgorot: number;
}) {
  if (
    props.method === "credit_card_full" ||
    props.method === "cash_at_reception"
  ) {
    return (
      <CardComPaymentForm
        token={props.token}
        bookingId={props.bookingId}
        method={props.method}
        serviceName={props.serviceName}
        priceAgorot={props.priceAgorot}
      />
    );
  }
  if (props.method === "voucher_dts") {
    return (
      <DtsVoucherForm
        token={props.token}
        bookingId={props.bookingId}
        serviceName={props.serviceName}
      />
    );
  }
  if (props.method === "voucher_vpay") {
    return (
      <VpayVoucherForm
        token={props.token}
        bookingId={props.bookingId}
        serviceName={props.serviceName}
        priceAgorot={props.priceAgorot}
      />
    );
  }
  // Exhaustiveness fallback — shouldn't render in practice.
  return null;
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
