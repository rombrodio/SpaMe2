/**
 * CardCom LowProfile indicator webhook.
 *
 * Endpoint: POST /api/webhooks/cardcom/<secret>
 *
 * Authenticity:
 *   Shared secret in the URL path. Compared with timingSafeEqual
 *   against CARDCOM_WEBHOOK_SHARED_SECRET. Mismatch → 404 (don't
 *   hint that the endpoint exists). Per docs/integrations/API_CardCom.md
 *   §7, this is the simplest defence given CardCom doesn't publish
 *   an HMAC signature mechanism for LowProfile indicators.
 *
 *   Even with the shared-secret path, we do NOT trust the POST body
 *   on its own. The engine's confirmFromWebhook pulls the authoritative
 *   state via GetLowProfileIndicator before writing anything — an
 *   attacker who knows the URL still can't forge a LowProfileCode
 *   tied to our terminal.
 *
 * Payload:
 *   Content-Type: application/x-www-form-urlencoded (classic ASP.NET).
 *   Fields we care about: `lowprofilecode` (GUID) and `ReturnValue`
 *   (our payments.id, for the engine's anti-spoofing check).
 *
 * Idempotency:
 *   engine.confirmFromWebhook short-circuits on second-call for rows
 *   already in status=success/authorized, so CardCom retries on
 *   5xx are safe. We always return 200 on a handled POST so CardCom's
 *   retry loop terminates even when the deal ultimately failed
 *   (failure is recorded on the payment row).
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmFromWebhook } from "@/lib/payments/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
): Promise<Response> {
  const { secret } = await params;

  if (!verifySecret(secret)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // CardCom POSTs application/x-www-form-urlencoded by default; some
  // setups use application/json. Handle both.
  const bodyRaw = await req.text();
  const fields = parseBody(bodyRaw, req.headers.get("content-type") ?? "");

  const lowProfileCode =
    fields.lowprofilecode ??
    fields.LowProfileCode ??
    fields.lowProfileCode;

  if (!lowProfileCode) {
    console.warn("[cardcom-webhook] missing lowprofilecode", fields);
    // Still return 200 — nothing we can do without the identifier.
    return NextResponse.json({ ok: false, reason: "missing_lowprofilecode" });
  }

  try {
    const admin = createAdminClient();
    const result = await confirmFromWebhook(admin, {
      lowProfileCode,
      rawWebhook: fields,
    });
    if ("error" in result) {
      console.warn(
        "[cardcom-webhook] confirm failed",
        lowProfileCode,
        result.error
      );
      // Return 200 so CardCom doesn't keep retrying; the engine has
      // already marked the payment as failed.
      return NextResponse.json({ ok: false, handled: true });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cardcom-webhook] unhandled error", err);
    // 500 invites retries; that's OK for transient DB / network blips.
    return new NextResponse("Internal error", { status: 500 });
  }
}

function verifySecret(candidate: string): boolean {
  const expected = process.env.CARDCOM_WEBHOOK_SHARED_SECRET;
  if (!expected) {
    // In dev: permit any value so /api/webhooks/cardcom/foo works
    // without setting up the env. In prod we want the guard — surface
    // a warning in logs so this doesn't stay silent.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[cardcom-webhook] CARDCOM_WEBHOOK_SHARED_SECRET not set; rejecting all requests"
      );
      return false;
    }
    return true;
  }
  if (!candidate) return false;
  // Equal-length buffers required by timingSafeEqual.
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseBody(raw: string, contentType: string): Record<string, string> {
  if (!raw) return {};
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        // Stringify any nested values so the record is a flat string-map
        // consistent with the urlencoded branch below.
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          out[k] = v == null ? "" : String(v);
        }
        return out;
      }
    } catch {
      // fall through to urlencoded parsing
    }
  }
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}
