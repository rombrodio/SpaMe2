import { redirect } from "next/navigation";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Supabase's "Site URL" is used as the default redirect target when an
 * email template falls back to `{{ .SiteURL }}`. If that's set to `/`
 * (or something else that isn't our `/callback` route), the auth token
 * lands here and the query params would be stripped by a plain
 * `redirect("/login")`.
 *
 * This handler forwards any of the known auth params — `code` (PKCE),
 * `token_hash` + `type` (OTP), `error` / `error_description` — to the
 * real callback route so password reset / invite / magic-link emails
 * work even when the Site URL hasn't been aligned with our callback.
 */
export default async function Home({ searchParams }: HomeProps) {
  const sp = await searchParams;
  const authKeys = [
    "code",
    "token_hash",
    "type",
    "error",
    "error_description",
    "error_code",
  ] as const;

  const hasAuthParam = authKeys.some((k) => typeof sp[k] === "string");
  if (hasAuthParam) {
    const params = new URLSearchParams();
    for (const key of authKeys) {
      const v = sp[key];
      if (typeof v === "string") params.set(key, v);
    }
    if (!params.has("next")) params.set("next", "/set-password");
    redirect(`/callback?${params.toString()}`);
  }

  redirect("/login");
}
