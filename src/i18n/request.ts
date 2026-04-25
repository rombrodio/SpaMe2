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
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  const messages = (await import(`./messages/${locale}.json`)).default;

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
