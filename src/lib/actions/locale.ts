"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/i18n/config";

/**
 * Set the viewer's active locale.
 *
 * Writes both the NEXT_LOCALE cookie (used by `i18n/request.ts` on every
 * subsequent request) AND, for authenticated staff, the
 * `profiles.language` column so the preference survives sign-out /
 * sign-in on a different device.
 *
 * Anonymous customers (/book, /order) only update the cookie — their
 * `customers` row either doesn't exist yet or isn't tied to this session.
 * Phase 8 will auto-detect language from the first inbound WhatsApp
 * message and write it to `customers.language` server-side.
 */
export async function setLocaleAction(
  raw: string
): Promise<
  | { success: true; locale: Locale }
  | { error: string }
> {
  if (!isLocale(raw)) {
    return { error: "Unknown locale" };
  }
  const locale: Locale = raw;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    // Not HttpOnly: LocaleSwitcher reads useLocale() for the current value
    // which comes from the server, but if we ever want client-side read
    // of the cookie for optimistic UI, leaving it readable keeps options
    // open. The value isn't security-sensitive.
    httpOnly: false,
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({ language: locale })
      .eq("id", user.id);
  }

  // Revalidate every route so server components pick up the new locale.
  revalidatePath("/", "layout");

  return { success: true, locale };
}
