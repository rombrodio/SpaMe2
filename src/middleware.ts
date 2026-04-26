import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { allowedOrRedirect, portalForRole } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /**
   * Redirect helper that preserves any session cookies Supabase wrote
   * on `supabaseResponse` during `auth.getUser()`. Without this,
   * `NextResponse.redirect(url)` returns a fresh response with no
   * Set-Cookie headers, the browser keeps stale auth cookies, and on
   * the redirected request the session looks invalid — producing a
   * classic /login ↔ portal ping-pong loop that eventually hits
   * ERR_TOO_MANY_REDIRECTS.
   *
   * Per Supabase's official SSR middleware docs, the `cookies` set on
   * `supabaseResponse` MUST be propagated to any response we return,
   * including redirects.
   */
  function redirectWithCookies(url: URL | string): NextResponse {
    const target = typeof url === "string" ? url : url.toString();
    const redirect = NextResponse.redirect(target);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  const pathname = request.nextUrl.pathname;
  const isProtected =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/reception") ||
    pathname.startsWith("/therapist");
  const isGet = request.method === "GET";

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  const authedUser = userError ? null : user;

  if (isProtected && !authedUser) {
    if (!isGet) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirectWithCookies(url);
  }

  if (isProtected && authedUser) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();

    const role = profileError ? null : profile?.role ?? null;
    const verdict = allowedOrRedirect(pathname, role);
    if (!verdict.allowed) {
      if (!isGet) return supabaseResponse;
      // Loop guard: if the redirect target is the same path we're on
      // (which happens when portalForRole returns a path that maps to
      // itself — e.g. an unknown-role user on /login), don't redirect.
      // Browsers otherwise hit ERR_TOO_MANY_REDIRECTS.
      if (verdict.redirectTo === pathname) return supabaseResponse;
      const url = request.nextUrl.clone();
      url.pathname = verdict.redirectTo;
      return redirectWithCookies(url);
    }
  }

  if (pathname === "/set-password" && !authedUser && isGet) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (pathname === "/login" && authedUser && isGet) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authedUser.id)
      .maybeSingle();

    const target = portalForRole(profile?.role ?? null);

    // Loop guard: an authed user on /login whose `profiles.role`
    // lookup returns null (profile row missing, RLS temporarily
    // blocked, etc.) would otherwise be redirected back to /login
    // because portalForRole(null) === "/login". Let them see the
    // login form instead — they can sign out and retry.
    if (target === pathname) return supabaseResponse;

    const url = request.nextUrl.clone();
    url.pathname = target;
    return redirectWithCookies(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/reception/:path*",
    "/therapist/:path*",
    "/login",
    "/set-password",
  ],
};
