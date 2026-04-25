import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handles BOTH flows Supabase can send:
 *
 *   1. `?code=...`           — PKCE code exchange (OAuth + newer recovery).
 *                              Requires a code_verifier cookie that was
 *                              set by the browser that triggered the flow.
 *   2. `?token_hash=...&type=recovery|signup|invite|email_change`
 *                            — OTP verify. Works across devices because
 *                              it doesn't need a browser-local verifier.
 *
 * Supabase's "Email link is invalid or has expired" shows up when:
 *   - the token is stale (user clicked an old email)
 *   - the link was pre-fetched by an email client (single-use, burned
 *     before the human clicked)
 *   - PKCE code_verifier cookie is missing (user clicked the link in
 *     a different browser than the one that called resetPasswordForEmail)
 *
 * We try both flows here and bubble up the real Supabase error to the
 * login page instead of silently redirecting to a generic error.
 */
type OtpType = "signup" | "invite" | "recovery" | "email_change";

const VALID_OTP_TYPES: readonly OtpType[] = [
  "signup",
  "invite",
  "recovery",
  "email_change",
];

function isOtpType(v: string | null): v is OtpType {
  return !!v && (VALID_OTP_TYPES as readonly string[]).includes(v);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/admin";

  // Supabase itself may have redirected back with an error in the query
  // string (most commonly otp_expired). Preserve it for the login page
  // so the user sees what actually happened.
  const errorDescription =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (errorDescription && !code && !tokenHash) {
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", errorDescription);
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  const url = new URL(`${origin}/login`);
  url.searchParams.set(
    "error",
    "Reset link is missing its verification token."
  );
  return NextResponse.redirect(url);
}
