/**
 * Locale-aware formatters for customer-facing + admin surfaces.
 *
 * Used outside of next-intl's `useFormatter` / `useTranslations` hooks
 * — typically in server actions, email / SMS template rendering, and
 * anywhere we need a deterministic string regardless of render context.
 *
 * Timezone is pinned to Asia/Jerusalem because the spa operates in a
 * single physical location. If the product ever goes multi-venue, this
 * becomes venue-dependent rather than process-dependent.
 */

import { format as dfFormat } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import type { Locale } from "@/i18n/config";

/**
 * "₪350" — ILS is the only currency the spa charges in; agorot is
 * stored in `price_ils` columns. Output strings use the locale's
 * native currency glyph (Hebrew shekel, RU ILS with "₪").
 */
export function formatIlsFromAgorot(
  agorot: number,
  locale: Locale = "he"
): string {
  const intlLocale =
    locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
  return new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(agorot / 100);
}

/**
 * "25/05/2026" in Israel TZ, zero-padded. Same ordering across locales
 * (DD/MM/YYYY) because that's what every Israeli booking email / SMS
 * has historically used — swapping to MM/DD would mis-cue long-term
 * customers.
 */
export function formatDateIL(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return dfFormat(toZonedTime(d, TZ), "dd/MM/yyyy");
}

/** "14:00" in Israel TZ. */
export function formatTimeIL(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return dfFormat(toZonedTime(d, TZ), "HH:mm");
}

/**
 * "יום ראשון, 25/05/2026 14:00" / "Sunday, 25/05/2026 14:00" /
 * "воскресенье, 25/05/2026 14:00" — weekday in the active locale,
 * numeric date + time in IL convention.
 */
export function formatDateTimeILFull(
  date: Date | string,
  locale: Locale = "he"
): string {
  const d = date instanceof Date ? date : new Date(date);
  const intlLocale =
    locale === "he" ? "he-IL" : locale === "ru" ? "ru-IL" : "en-IL";
  const weekday = new Intl.DateTimeFormat(intlLocale, {
    weekday: "long",
    timeZone: TZ,
  }).format(d);
  return `${weekday}, ${formatDateIL(d)} ${formatTimeIL(d)}`;
}
