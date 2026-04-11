import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Supabase Realtime's SocketAdapter reads window.sessionStorage in its
 * constructor, which throws a SecurityError in restricted browser contexts
 * (strict privacy mode, some post-redirect states, embedded iframes, etc.).
 * Installing a no-op shim when the real API is blocked prevents the crash
 * while keeping auth and data queries working normally.
 */
function ensureSessionStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage;
  } catch {
    Object.defineProperty(window, "sessionStorage", {
      value: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
      writable: true,
      configurable: true,
    });
  }
}

export function createClient() {
  ensureSessionStorage();
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
