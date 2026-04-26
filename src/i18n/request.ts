import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import {
  defaultLocale,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from "./config";

/**
 * next-intl request config in **cookie-only** mode — we don't use
 * locale-based routing (no `[locale]` URL segment), so this resolver
 * picks the locale entirely from request state:
 *
 *   1. `NEXT_LOCALE` cookie (set by LocaleSwitcher / middleware bootstrap)
 *   2. Default (`'he'`) — matches the Tel Aviv spa's primary audience.
 *
 * We intentionally don't read `profiles.language` here because this
 * function runs on every RSC render pass and a Supabase query per
 * render is expensive. The server action `setLocaleAction` writes
 * BOTH the cookie and the profile row on locale change, so the cookie
 * is always in sync with the user's stored preference.
 *
 * Message catalogs are loaded dynamically so only the active locale's
 * JSON ships to the client for the current request.
 *
 * Missing-key fallback: Russian is deferred for staff portals (only
 * customer.* is translated to RU in #24). Rather than emit hundreds
 * of "missing message" warnings for a RU user on /admin, we merge the
 * EN catalog underneath the active-locale catalog as a safety net.
 * When a key exists in the active locale it wins; when it's missing,
 * the EN string renders. This is invisible for HE (all translated)
 * and for EN (identical merge). Only affects RU on not-yet-translated
 * staff surfaces.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  const [active, fallback] = await Promise.all([
    import(`./messages/${locale}.json`).then((m) => m.default),
    locale === "en"
      ? Promise.resolve(null)
      : import("./messages/en.json").then((m) => m.default),
  ]);

  const messages = fallback
    ? (deepMerge(fallback, active) as typeof active)
    : active;

  return {
    locale,
    messages,
    timeZone: "Asia/Jerusalem",
    // Minimal formats — we'll add more as individual surfaces need them.
    formats: {
      dateTime: {
        short: {
          day: "numeric",
          month: "short",
          year: "numeric",
        },
        time: {
          hour: "2-digit",
          minute: "2-digit",
        },
      },
    },
  };
});

/**
 * Deep-merge plain-object catalogs: `override` wins on every present
 * leaf, `base` fills in missing keys. Non-object values replace
 * wholesale. Not a full generic deep-merge — scoped to the JSON
 * shape of our message catalogs (strings, numbers, nested objects).
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = base[key];
    if (
      overrideValue !== null &&
      typeof overrideValue === "object" &&
      !Array.isArray(overrideValue) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>
      );
    } else {
      out[key] = overrideValue;
    }
  }
  return out;
}
