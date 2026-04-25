/**
 * i18n locale registry. Single source of truth for which locales exist
 * and which render RTL. If you add a locale here:
 *   1. Add a message catalog at `src/i18n/messages/<code>.json`
 *   2. Update the `language_code` Postgres enum (migration)
 *   3. Add it to the LocaleSwitcher options
 */

export const locales = ["he", "en", "ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "he";

export const rtlLocales: readonly Locale[] = ["he"];

export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

/** Human-readable label for the locale switcher UI. */
export const localeLabels: Record<Locale, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
};
