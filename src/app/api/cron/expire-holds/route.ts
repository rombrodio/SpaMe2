/**
 * Hold-expiry cron. Sweeps `pending_payment` bookings whose
 * hold_expires_at has passed, cancels them, voids any in-flight
 * payments rows, and best-effort revokes the associated CardCom
 * LowProfile session so the customer can't still pay on a cancelled
 * booking.
 *
 * Scheduled via vercel.json:
 *   { path: '/api/cron/expire-holds', schedule: '*\/2 * * * *' }
 * Vercel Cron delivers a GET request with
 *   Authorization: Bearer $CRON_SECRET
 * when CRON_SECRET is configured on the project.
 *
 * Dev-friendly: in non-production, missing CRON_SECRET allows the
 * endpoint to run so you can hit /api/cron/expire-holds in a browser
 * to debug. Production with no secret set → rejects all requests
 * and logs loudly.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { expireHolds } from "@/lib/payments/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function handler(req: NextRequest): Promise<Response> {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await expireHolds(admin);
    return NextResponse.json({
      ok: true,
      expired: result.expiredBookingIds.length,
      revoked: result.revokedLowProfileCodes.length,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[cron] expire-holds unhandled error", err);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[cron] CRON_SECRET not set; rejecting all /api/cron/* requests"
      );
      return false;
    }
    return true;
  }
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const candidate = match[1].trim();
  if (candidate.length !== expected.length) return false;
  // Constant-time compare.
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
