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

  // Fetch the full role + linked-entity ids once per request so we
  // can derive an "effective role" that accounts for broken profile
  // states (role='therapist' but therapist_id=null, etc.). This used
  // to be the source of a /login ↔ /therapist ping-pong: middleware
  // would trust role='therapist' and redirect to /therapist; the
  // page would then call getCurrentTherapistId, find the FK missing,
  // and redirect back to /login. Single SELECT short-circuits that.
  let effectiveRole: string | null = null;
  let brokenLink = false;
  if (authedUser && (isProtected || pathname === "/login")) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, therapist_id, receptionist_id")
      .eq("id", authedUser.id)
      .maybeSingle();

    const rawRole = profileError ? null : profile?.role ?? null;
    if (rawRole === "therapist" && !profile?.therapist_id) {
      brokenLink = true;
    } else if (rawRole === "receptionist" && !profile?.receptionist_id) {
      brokenLink = true;
    } else {
      effectiveRole = rawRole;
    }
  }

  if (isProtected && authedUser) {
    const verdict = allowedOrRedirect(pathname, effectiveRole);
    if (!verdict.allowed) {
      if (!isGet) return supabaseResponse;
      // Loop guard: never redirect to the same path.
      if (verdict.redirectTo === pathname) return supabaseResponse;
      const url = request.nextUrl.clone();
      url.pathname = verdict.redirectTo;
      // Surface the broken-link reason on /login so the operator
      // knows to ask an admin to resend their invite rather than
      // silently bouncing around.
      if (brokenLink && url.pathname === "/login") {
        url.searchParams.set(
          "error",
          "Your profile isn't fully linked. Ask an admin to resend your invite."
        );
      }
      return redirectWithCookies(url);
    }
  }

  if (pathname === "/set-password" && !authedUser && isGet) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithCookies(url);
  }

  if (pathname === "/login" && authedUser && isGet) {
    const target = portalForRole(effectiveRole);

    // Loop guards:
    //   1. target === /login (no role / unknown role): stay put.
    //   2. brokenLink: role looks fine but the FK linking to the
    //      therapist/receptionist record is missing, so the portal
    //      would immediately bounce back. Render login with an
    //      explanatory error instead.
    if (target === pathname || brokenLink) return supabaseResponse;

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
