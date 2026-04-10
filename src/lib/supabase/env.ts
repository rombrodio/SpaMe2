/**
 * Resolve the Supabase anon (publishable) key from environment variables.
 *
 * Supabase has two naming conventions in use:
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY              (legacy / current docs)
 *   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (new dashboard default)
 *
 * We accept either so rotating the dashboard setting doesn't break the app.
 */
export function getSupabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!key) {
    throw new Error(
      "Missing Supabase anon key. Set NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
    );
  }

  return key;
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  }

  return url;
}
