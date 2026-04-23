"use client";

import { he } from "@/lib/i18n/he";
import type { PaymentMethod } from "@/lib/payments/types";

interface MethodPickerProps {
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
}

interface MethodOption {
  id: PaymentMethod;
  title: string;
  subtitle: string;
}

export function MethodPicker({ selected, onSelect }: MethodPickerProps) {
  const options: MethodOption[] = [
    {
      id: "credit_card_full",
      title: he.order.methodPicker.creditCardFull.title,
      subtitle: he.order.methodPicker.creditCardFull.subtitle,
    },
    {
      id: "cash_at_reception",
      title: he.order.methodPicker.cashAtReception.title,
      subtitle: he.order.methodPicker.cashAtReception.subtitle,
    },
    {
      id: "voucher_dts",
      title: he.order.methodPicker.voucherDts.title,
      subtitle: he.order.methodPicker.voucherDts.subtitle,
    },
    {
      id: "voucher_vpay",
      title: he.order.methodPicker.voucherVpay.title,
      subtitle: he.order.methodPicker.voucherVpay.subtitle,
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        {he.order.methodPicker.heading}
      </h2>
      <div role="radiogroup" className="space-y-2">
        {options.map((opt) => {
          const isSelected = opt.id === selected;
          return (
            <label
              key={opt.id}
              className={`block cursor-pointer rounded-lg border p-4 transition-colors ${
                isSelected
                  ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900"
                  : "border-stone-200 bg-white hover:border-stone-400"
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value={opt.id}
                checked={isSelected}
                onChange={() => onSelect(opt.id)}
                className="sr-only"
              />
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-1 inline-block h-4 w-4 shrink-0 rounded-full border-2 ${
                    isSelected
                      ? "border-stone-900 bg-stone-900"
                      : "border-stone-400 bg-white"
                  }`}
                />
                <div>
                  <div className="font-semibold">{opt.title}</div>
                  <div className="mt-1 text-sm text-stone-600">
                    {opt.subtitle}
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
}
