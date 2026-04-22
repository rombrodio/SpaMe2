/**
 * Twilio SMS wrapper — single call site for all outbound SMS.
 *
 * Design:
 *  - Lazy client init so tests + dev without Twilio env don't crash.
 *  - Phone normalization to E.164 (+972...) — Twilio rejects non-E.164.
 *  - Prefers TWILIO_MESSAGING_SERVICE_SID (best-practice for multi-number
 *    fleets); falls back to TWILIO_SMS_FROM when no MSS is configured.
 *  - sendSms returns a discriminated union so callers don't have to try/catch
 *    for routine failures (unknown phone format, provider error, etc.).
 *
 * Phase 5 will add sendWhatsapp(...) and parseIncomingWhatsappWebhook(...)
 * in a sibling file (src/lib/messaging/whatsapp.ts) that reuses the same
 * Twilio client.
 */

import Twilio, { type Twilio as TwilioClient } from "twilio";

export class TwilioConfigError extends Error {}

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid?: string;
  from?: string;
}

function readConfig(): TwilioConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new TwilioConfigError(
      "Missing Twilio env: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"
    );
  }
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_SMS_FROM;
  if (!messagingServiceSid && !from) {
    throw new TwilioConfigError(
      "Missing sender: set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_SMS_FROM"
    );
  }
  return { accountSid, authToken, messagingServiceSid, from };
}

let cachedClient: TwilioClient | null = null;
function getClient(cfg: TwilioConfig): TwilioClient {
  if (cachedClient) return cachedClient;
  cachedClient = Twilio(cfg.accountSid, cfg.authToken);
  return cachedClient;
}

// For tests: reset the cached client so env changes take effect.
export function _resetTwilioClientForTests(): void {
  cachedClient = null;
}

/**
 * Normalize an Israeli phone number to E.164 (+972...).
 * Accepts:
 *   0521234567  → +972521234567
 *   521234567   → +972521234567  (already without leading 0)
 *   +972521234567, 972521234567  → pass through
 * Returns null when the input is obviously malformed.
 */
export function normalizePhoneIL(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s-()]/g, "");
  if (/^\+972\d{8,9}$/.test(digits)) return digits;
  if (/^972\d{8,9}$/.test(digits)) return `+${digits}`;
  if (/^0\d{8,9}$/.test(digits)) return `+972${digits.slice(1)}`;
  // Raw 8-9 digits without leading 0: assume Israeli mobile typed without 0.
  if (/^\d{8,9}$/.test(digits)) return `+972${digits}`;
  return null;
}

export type SendSmsResult =
  | { ok: true; messageSid: string }
  | { ok: false; reason: "invalid_phone" | "config_error" | "provider_error"; message: string };

export interface SendSmsInput {
  to: string;
  body: string;
}

/**
 * Send a single SMS. Idempotency is the caller's responsibility — we
 * don't dedupe here. See notifyBookingConfirmed() below for the engine-
 * level helper that guards on bookings.sms_sent_at.
 */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  let cfg: TwilioConfig;
  try {
    cfg = readConfig();
  } catch (err) {
    return {
      ok: false,
      reason: "config_error",
      message: (err as Error).message,
    };
  }

  const to = normalizePhoneIL(input.to);
  if (!to) {
    return {
      ok: false,
      reason: "invalid_phone",
      message: `Could not normalize phone "${input.to}" to E.164`,
    };
  }

  if (!input.body || input.body.length === 0) {
    return {
      ok: false,
      reason: "invalid_phone",
      message: "SMS body is empty",
    };
  }

  try {
    const client = getClient(cfg);
    const msg = await client.messages.create({
      to,
      body: input.body,
      ...(cfg.messagingServiceSid
        ? { messagingServiceSid: cfg.messagingServiceSid }
        : { from: cfg.from! }),
    });
    return { ok: true, messageSid: msg.sid };
  } catch (err) {
    const e = err as { message?: string; code?: number };
    return {
      ok: false,
      reason: "provider_error",
      message: `Twilio error${e.code ? ` (${e.code})` : ""}: ${e.message ?? "unknown"}`,
    };
  }
}
