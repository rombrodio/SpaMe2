/**
 * Resolve the public application URL from environment variables.
 *
 * Hard-fails when unset instead of silently falling back to
 * `http://localhost:3000`, because that silent fallback baked
 * localhost into production reset-password emails in the past.
 *
 * Supply `APP_URL=https://your-domain` on the server (Vercel / local
 * `.env.local`) and the same value on `NEXT_PUBLIC_APP_URL` for any
 * client code that also needs it.
 */
export function getAppUrl(): string {
  const url = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!url) {
    throw new Error(
      "APP_URL (or NEXT_PUBLIC_APP_URL) environment variable is required. " +
        "Set it to your deployed origin — e.g. https://spa-me2.vercel.app in " +
        "production, http://localhost:3000 in local dev via .env.local."
    );
  }
  return url.replace(/\/+$/, "");
}
