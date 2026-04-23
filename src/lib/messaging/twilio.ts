/**
 * Twilio SMS + WhatsApp wrapper — single call site for outbound messages.
 *
 * Design:
 *  - Lazy client init so tests + dev without Twilio env don't crash.
 *  - Phone normalization to E.164 (+972...) — Twilio rejects non-E.164.
 *  - SMS: prefers TWILIO_MESSAGING_SERVICE_SID; falls back to TWILIO_SMS_FROM.
 *  - WhatsApp: requires TWILIO_WHATSAPP_FROM + a pre-approved Content SID
 *    (Meta-approved template). Session-starting template messages only;
 *    no 24h-window session messages in V1.
 *  - Every send returns a discriminated-union result so callers don't need
 *    to try/catch for routine failures (unknown phone, config missing, etc.).
 */

import Twilio, { type Twilio as TwilioClient } from "twilio";

export class TwilioConfigError extends Error {}

interface TwilioCoreConfig {
  accountSid: string;
  authToken: string;
}

interface TwilioSmsConfig extends TwilioCoreConfig {
  messagingServiceSid?: string;
  from?: string;
}

interface TwilioWhatsAppConfig extends TwilioCoreConfig {
  /** E.164 WhatsApp sender, e.g. "whatsapp:+14155551234". */
  from: string;
}

function readCoreConfig(): TwilioCoreConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new TwilioConfigError(
      "Missing Twilio env: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required"
    );
  }
  return { accountSid, authToken };
}

function readSmsConfig(): TwilioSmsConfig {
  const core = readCoreConfig();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_SMS_FROM;
  if (!messagingServiceSid && !from) {
    throw new TwilioConfigError(
      "Missing sender: set TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_SMS_FROM"
    );
  }
  return { ...core, messagingServiceSid, from };
}

function readWhatsAppConfig(): TwilioWhatsAppConfig {
  const core = readCoreConfig();
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM;
  if (!fromRaw) {
    throw new TwilioConfigError(
      "Missing TWILIO_WHATSAPP_FROM — set to 'whatsapp:+<E.164 number>'"
    );
  }
  const from = fromRaw.startsWith("whatsapp:") ? fromRaw : `whatsapp:${fromRaw}`;
  return { ...core, from };
}

let cachedClient: TwilioClient | null = null;
function getClient(cfg: TwilioCoreConfig): TwilioClient {
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
  let cfg: TwilioSmsConfig;
  try {
    cfg = readSmsConfig();
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

// ─────────────────────────────────────────────────────────────
// WhatsApp (Twilio Business API, template messages only)
// ─────────────────────────────────────────────────────────────

export interface SendWhatsAppInput {
  to: string;
  /**
   * Meta-approved Twilio Content Template SID (starts with HX...).
   * Callers pass NULL/undefined when the template isn't yet configured —
   * sendWhatsApp returns `config_error` in that case so the caller can
   * fall back to SMS without crashing.
   */
  contentSid: string | null | undefined;
  /**
   * Template variable substitutions. Keys are the 1-indexed positional
   * placeholders Meta uses ({{1}}, {{2}}, ...). Values must be strings.
   */
  variables?: Record<string, string>;
}

export type SendWhatsAppResult = SendSmsResult;

/**
 * Send a WhatsApp template message via Twilio. All outbound WhatsApp in
 * this app starts a new session (we don't have the 24h in-bound window)
 * so every call must use a pre-approved Meta template.
 */
export async function sendWhatsApp(
  input: SendWhatsAppInput
): Promise<SendWhatsAppResult> {
  if (!input.contentSid) {
    return {
      ok: false,
      reason: "config_error",
      message:
        "WhatsApp contentSid not configured (TWILIO_WA_TEMPLATE_* env missing)",
    };
  }

  let cfg: TwilioWhatsAppConfig;
  try {
    cfg = readWhatsAppConfig();
  } catch (err) {
    return {
      ok: false,
      reason: "config_error",
      message: (err as Error).message,
    };
  }

  const normalized = normalizePhoneIL(input.to);
  if (!normalized) {
    return {
      ok: false,
      reason: "invalid_phone",
      message: `Could not normalize phone "${input.to}" to E.164`,
    };
  }
  const to = `whatsapp:${normalized}`;

  try {
    const client = getClient(cfg);
    const msg = await client.messages.create({
      from: cfg.from,
      to,
      contentSid: input.contentSid,
      ...(input.variables
        ? { contentVariables: JSON.stringify(input.variables) }
        : {}),
    });
    return { ok: true, messageSid: msg.sid };
  } catch (err) {
    const e = err as { message?: string; code?: number };
    return {
      ok: false,
      reason: "provider_error",
      message: `Twilio WhatsApp error${e.code ? ` (${e.code})` : ""}: ${
        e.message ?? "unknown"
      }`,
    };
  }
}
