"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ServiceCard } from "./service-card";
import { SlotGrid } from "./slot-grid";
import { ContactForm } from "./contact-form";
import {
  createBookingFromBookAction,
  getPublicSlots,
  type PublicSlot,
  type GenderPreference,
} from "@/lib/actions/book";
import { useTranslations, useLocale } from "next-intl";
import { formatDateTimeILFull } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";

export interface BookService {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_ils: number;
}

type Step = "service" | "slot" | "contact";

interface BookFlowProps {
  services: BookService[];
}

export function BookFlow({ services }: BookFlowProps) {
  const router = useRouter();
  const t = useTranslations();
  const [step, setStep] = useState<Step>("service");

  const [selectedService, setSelectedService] = useState<BookService | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [genderPreference, setGenderPreference] =
    useState<GenderPreference>("any");
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<PublicSlot | null>(null);

  const [submitting, startSubmit] = useTransition();
  const [formErrors, setFormErrors] = useState<Record<string, string[]>>({});

  // ── Transitions ──
  function pickService(s: BookService) {
    setSelectedService(s);
    setSelectedSlot(null);
    setSlots([]);
    setStep("slot");
    void refreshSlots(s.id, selectedDate, genderPreference);
  }

  async function refreshSlots(
    serviceId: string,
    date: string,
    gender: GenderPreference
  ) {
    setSlotsLoading(true);
    try {
      const fetched = await getPublicSlots({
        service_id: serviceId,
        date,
        gender_preference: gender,
      });
      setSlots(fetched);
    } finally {
      setSlotsLoading(false);
    }
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    if (selectedService) {
      void refreshSlots(selectedService.id, date, genderPreference);
    }
  }

  function handleGenderChange(g: GenderPreference) {
    setGenderPreference(g);
    if (selectedService) {
      void refreshSlots(selectedService.id, selectedDate, g);
    }
  }

  function pickSlot(slot: PublicSlot) {
    setSelectedSlot(slot);
    setStep("contact");
  }

  function handleSubmit(input: {
    full_name: string;
    phone: string;
    email: string;
    notes: string;
  }) {
    if (!selectedService || !selectedSlot) return;

    setFormErrors({});
    startSubmit(async () => {
      const result = await createBookingFromBookAction({
        service_id: selectedService.id,
        start_at: selectedSlot.start,
        gender_preference: genderPreference,
        full_name: input.full_name,
        phone: input.phone,
        email: input.email || undefined,
        notes: input.notes || undefined,
      });

      if ("error" in result && result.error) {
        const clean: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(result.error)) {
          if (v) clean[k] = v;
        }
        setFormErrors(clean);
        return;
      }
      if (!("data" in result)) {
        setFormErrors({ _form: [t("common.errorGeneric")] });
        return;
      }

      router.push(`/order/${result.data.token}`);
    });
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === "service" && (
        <ServicesList services={services} onPick={pickService} />
      )}

      {step === "slot" && selectedService && (
        <>
          <SelectedServiceBanner
            service={selectedService}
            onChange={() => setStep("service")}
          />
          <SlotGrid
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            genderPreference={genderPreference}
            onGenderPreferenceChange={handleGenderChange}
            slots={slots}
            loading={slotsLoading}
            onPick={pickSlot}
          />
        </>
      )}

      {step === "contact" && selectedService && selectedSlot && (
        <>
          <SelectedSummary
            service={selectedService}
            slot={selectedSlot}
            genderPreference={genderPreference}
            onChangeSlot={() => setStep("slot")}
            onChangeService={() => setStep("service")}
          />
          <ContactForm
            errors={formErrors}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </div>
  );
}

// ── Subcomponents in-file for locality ──

function StepIndicator({ step }: { step: Step }) {
  const t = useTranslations("customer.book");
  const steps: Array<{ id: Step; label: string }> = [
    { id: "service", label: t("stepService.heading") },
    { id: "slot", label: t("stepSlot.heading") },
    { id: "contact", label: t("stepContact.heading") },
  ];
  return (
    <ol className="flex justify-between text-xs font-medium text-stone-600">
      {steps.map((s, idx) => {
        const current = s.id === step;
        const done = steps.findIndex((x) => x.id === step) > idx;
        return (
          <li
            key={s.id}
            className={`flex-1 border-b-2 pb-2 text-center ${
              current
                ? "border-stone-900 text-stone-900"
                : done
                ? "border-stone-400 text-stone-500"
                : "border-stone-200"
            }`}
          >
            {idx + 1}. {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function ServicesList({
  services,
  onPick,
}: {
  services: BookService[];
  onPick: (s: BookService) => void;
}) {
  const t = useTranslations("customer.order.errors");
  if (services.length === 0) {
    return (
      <div className="rounded-md border border-stone-200 bg-white p-6 text-center text-stone-600">
        {t("bookingNotFound")}
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {services.map((s) => (
        <ServiceCard key={s.id} service={s} onPick={() => onPick(s)} />
      ))}
    </div>
  );
}

function SelectedServiceBanner({
  service,
  onChange,
}: {
  service: BookService;
  onChange: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <div>
        <div className="font-medium">{service.name}</div>
        <div className="text-stone-600">
          {t("customer.book.stepService.minutes", {
            count: service.duration_minutes,
          })}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        {t("common.edit")}
      </Button>
    </div>
  );
}

function SelectedSummary({
  service,
  slot,
  genderPreference,
  onChangeSlot,
  onChangeService,
}: {
  service: BookService;
  slot: PublicSlot;
  genderPreference: GenderPreference;
  onChangeSlot: () => void;
  onChangeService: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const genderLabel =
    genderPreference === "any"
      ? t("customer.book.stepSlot.gender.any")
      : genderPreference === "female"
        ? t("customer.book.stepSlot.gender.female")
        : t("customer.book.stepSlot.gender.male");

  return (
    <div className="rounded-md border border-stone-200 bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{service.name}</div>
          <div className="text-stone-600">
            {t("customer.book.stepService.minutes", {
              count: service.duration_minutes,
            })}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onChangeService}
        >
          {t("common.edit")}
        </Button>
      </div>
      <hr className="my-3 border-stone-200" />
      <div className="flex items-center justify-between">
        <div>
          <div>{formatDateTimeILFull(slot.start, locale)}</div>
          <div className="text-stone-600">
            {t("customer.book.stepSlot.gender.heading")}: {genderLabel}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeSlot}>
          {t("common.edit")}
        </Button>
      </div>
    </div>
  );
}
