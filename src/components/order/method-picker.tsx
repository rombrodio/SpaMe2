"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations("customer.order.methodPicker");
  const options: MethodOption[] = [
    {
      id: "credit_card_full",
      title: t("creditCardFull.title"),
      subtitle: t("creditCardFull.subtitle"),
    },
    {
      id: "cash_at_reception",
      title: t("cashAtReception.title"),
      subtitle: t("cashAtReception.subtitle"),
    },
    {
      id: "voucher_dts",
      title: t("voucherDts.title"),
      subtitle: t("voucherDts.subtitle"),
    },
    {
      id: "voucher_vpay",
      title: t("voucherVpay.title"),
      subtitle: t("voucherVpay.subtitle"),
    },
  ];

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t("heading")}</h2>
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
