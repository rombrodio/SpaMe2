"use client";

/**
 * Auth callback — handles ALL three Supabase return flows:
 *
 *   1. PKCE code exchange    — `?code=xxx`
 *      Used by resetPasswordForEmail on the *same browser* that initiated
 *      the flow (code_verifier lives in cookies).
 *
 *   2. Implicit hash tokens  — `#access_token=xxx&refresh_token=xxx&type=invite`
 *      Used by inviteUserByEmail and magic-link sign-in. The Supabase
 *      browser client auto-detects and consumes these on page load when
 *      `detectSessionInUrl` is true (the default), and then fires a
 *      SIGNED_IN auth state change.
 *
 *   3. OTP verify            — `?token_hash=xxx&type=recovery|signup|...`
 *      Used by the newer Supabase email template style. We call
 *      verifyOtp explicitly because this flow isn't handled by the
 *      browser client's auto-detect.
 *
 * A server-only Route Handler (the pre-Phase-6 implementation) can't
 * see the URL fragment in case (2), which is why invite emails landed
 * on `/login?error=Reset+link+is+missing+its+verification+token`. This
 * page is the client-side replacement.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Completing sign-in…");

  useEffect(() => {
    const supabase = createClient();
    const nextPath = searchParams.get("next") ?? "/";
    let handled = false;

    function goNext() {
      if (handled) return;
      handled = true;
      // Full-page navigation so middleware sees the new session cookie
      // (router.replace can keep the client's stale cookie cache).
      window.location.href = nextPath;
    }

    function goLoginWithError(message: string) {
      if (handled) return;
      handled = true;
      const url = new URL("/login", window.location.origin);
      url.searchParams.set("error", message);
      window.location.href = url.toString();
    }

    // Case (2): implicit hash tokens. The supabase-js client auto-parses
    // the hash on creation and fires SIGNED_IN when the session is ready.
    // Subscribe before any awaits so we don't miss the event.
    const { data: authSub } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          goNext();
        }
      }
    );

    (async () => {
      // First check for Supabase-style errors in either query OR hash.
      // (Failed invites / expired OTPs arrive with an error_description.)
      const hashString = window.location.hash.replace(/^#/, "");
      const hashParams = new URLSearchParams(hashString);
      const hashError =
        hashParams.get("error_description") ?? hashParams.get("error");
      const queryError =
        searchParams.get("error_description") ?? searchParams.get("error");
      const errorMsg = hashError ?? queryError;
      const hasHashTokens = hashParams.has("access_token");

      if (errorMsg && !hasHashTokens) {
        goLoginWithError(errorMsg.replace(/\+/g, " "));
        return;
      }

      // Case (3): OTP token_hash + type verification.
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (tokenHash && isOtpType(type)) {
        const { error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        });
        if (error) goLoginWithError(error.message);
        else goNext();
        return;
      }

      // Case (1): PKCE code exchange.
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) goLoginWithError(error.message);
        else goNext();
        return;
      }

      // Case (2) continued: if we're here with a hash fragment carrying
      // access_token, the auth-state subscriber above should fire soon.
      // Give it a short window, then check for a session manually before
      // giving up — some older Supabase versions don't re-emit SIGNED_IN
      // for already-active sessions.
      if (hasHashTokens) {
        setStatus("Processing invite…");
        setTimeout(async () => {
          const { data } = await supabase.auth.getSession();
          if (data.session) goNext();
          else
            goLoginWithError(
              "The invite link could not be verified. Please request a new one."
            );
        }, 2000);
        return;
      }

      // Nothing recognisable in the URL.
      goLoginWithError(
        "This auth link is missing its verification token."
      );
    })();

    return () => {
      authSub.subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">SpaMe</CardTitle>
          <CardDescription>{status}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          Loading…
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
