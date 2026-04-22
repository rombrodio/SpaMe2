"use client";

import { he, formatIlsFromAgorot } from "@/lib/i18n/he";
import type { BookService } from "./book-flow";

interface ServiceCardProps {
  service: BookService;
  onPick: () => void;
}

export function ServiceCard({ service, onPick }: ServiceCardProps) {
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
            {he.book.stepService.minutes(service.duration_minutes)}
          </p>
        </div>
        <div className="text-start">
          <div className="text-lg font-semibold">
            {formatIlsFromAgorot(service.price_ils)}
          </div>
          <div className="mt-1 text-xs text-stone-500 group-hover:text-stone-700">
            {he.common.continue} ←
          </div>
        </div>
      </div>
    </button>
  );
}
