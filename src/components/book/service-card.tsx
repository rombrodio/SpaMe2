"use client";

import { useTranslations, useLocale } from "next-intl";
import { formatIlsFromAgorot } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/config";
import type { BookService } from "./book-flow";

interface ServiceCardProps {
  service: BookService;
  onPick: () => void;
}

export function ServiceCard({ service, onPick }: ServiceCardProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <button
      type="button"
      onClick={onPick}
      className="group w-full rounded-lg border border-stone-200 bg-white p-4 text-start transition-colors hover:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{service.name}</h3>
          <p className="text-sm text-stone-600">
            {t("customer.book.stepService.minutes", {
              count: service.duration_minutes,
            })}
          </p>
        </div>
        <div className="text-start">
          <div className="text-lg font-semibold">
            {formatIlsFromAgorot(service.price_ils, locale)}
          </div>
          <div className="mt-1 text-xs text-stone-500 group-hover:text-stone-700">
            {t("common.continue")} ←
          </div>
        </div>
      </div>
    </button>
  );
}
