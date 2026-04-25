"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function parseHashError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const params = new URLSearchParams(hash.replace("#", ""));
  const desc = params.get("error_description");
  if (desc) return desc.replace(/\+/g, " ");
  return params.get("error") || null;
}

/**
 * When an invite / magic-link / reset OTP has already been consumed
 * or timed out, Supabase puts error_description="Email link is
 * invalid or has expired" in the URL hash. Show a recovery hint
 * below the raw error so the user knows what to do next.
 */
function isExpiredOtpError(msg: string | null): boolean {
  if (!msg) return false;
  const s = msg.toLowerCase();
  return (
    s.includes("email link is invalid") ||
    s.includes("otp_expired") ||
    s.includes("has expired")
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Prefer the Supabase-provided error from the URL hash (e.g.
  // "Email link is invalid or has expired" for an expired OTP) over
  // our own query-string fallback — hash errors always tell the user
  // WHY the token failed, whereas our fallbacks usually just say it's
  // missing, which is less actionable.
  const [error, setError] = useState<string | null>(
    () => parseHashError() ?? searchParams.get("error")
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location.href = next;
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();
    // Prefer the deterministic prod URL so the email always opens the live
    // site — `window.location.origin` would bake `localhost:3000` into the
    // email forever if the user triggered reset from a dev session.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${baseUrl}/callback?next=/set-password` }
    );

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage("Check your email for a password reset link.");
  }

  if (mode === "reset") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Reset Password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to set a new
            password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="space-y-1">
                <p className="text-sm text-destructive">{error}</p>
                {isExpiredOtpError(error) && (
                  <p className="text-xs text-muted-foreground">
                    Reset links and invites expire after 1 hour and can only
                    be used once. Enter your email above and click{" "}
                    <strong>Send Reset Link</strong> to get a fresh one.
                  </p>
                )}
              </div>
            )}
            {message && <p className="text-sm text-green-600">{message}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setMessage(null);
              }}
              className="w-full text-sm text-muted-foreground hover:underline"
            >
              Back to sign in
            </button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">SpaMe</CardTitle>
        <CardDescription>Sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="space-y-1">
              <p className="text-sm text-destructive">{error}</p>
              {isExpiredOtpError(error) && (
                <p className="text-xs text-muted-foreground">
                  That email link is expired or already used. Ask an admin
                  to resend your invite, or click{" "}
                  <strong>Forgot password?</strong> below to request a new
                  link for yourself.
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("reset");
              setError(null);
            }}
            className="w-full text-sm text-muted-foreground hover:underline"
          >
            Forgot password?
          </button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense fallback={
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">SpaMe</CardTitle>
            <CardDescription>Loading...</CardDescription>
          </CardHeader>
        </Card>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
