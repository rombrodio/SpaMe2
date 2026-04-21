/**
 * CardCom Low-Profile API adapter.
 *
 * Implements HostedPaymentProvider by speaking SOAP 1.1 over HTTPS to:
 *   * /service.asmx             — CreateLowProfileDeal, GetLowProfileIndicator
 *   * /Interface/BillGoldService.asmx — RevokeLowProfileDeal, LowProfileChargeToken
 *
 * Reference: docs/integrations/API_CardCom.md.
 * Amounts: decimal ILS on the wire ('SumToBill'); internally we carry
 * integer agorot and convert at the boundary.
 *
 * Security notes:
 *   * This file never logs full card data. Only `CardNumber5` (masked) and
 *     Shva approval numbers may be logged for audit.
 *   * `webhook_payload` on payments should store the raw indicator response
 *     after redaction via redactIndicatorForStorage() below.
 */

import { XMLParser } from "fast-xml-parser";
import type {
  HostedPaymentProvider,
  LowProfileIndicator,
  PaymentRole,
  CustomerContact,
} from "./types";

// ── Environment ──────────────────────────────────────────────────────

interface CardComConfig {
  baseUrl: string;
  terminalNumber: number;
  apiUsername: string;
  apiPassword?: string;
  apiLevel?: number;
  timeoutMs?: number;
}

function readConfig(): CardComConfig {
  const baseUrl =
    process.env.CARDCOM_BASE_URL ?? "https://secure.cardcom.solutions";
  const terminalRaw = process.env.CARDCOM_TERMINAL_NUMBER;
  const apiUsername = process.env.CARDCOM_API_USERNAME;

  if (!terminalRaw || !apiUsername) {
    throw new Error(
      "CardCom env missing: CARDCOM_TERMINAL_NUMBER and CARDCOM_API_USERNAME are required"
    );
  }
  const terminalNumber = parseInt(terminalRaw, 10);
  if (!Number.isFinite(terminalNumber) || terminalNumber <= 0) {
    throw new Error("CARDCOM_TERMINAL_NUMBER must be a positive integer");
  }

  return {
    baseUrl,
    terminalNumber,
    apiUsername,
    apiPassword: process.env.CARDCOM_API_PASSWORD,
    apiLevel: 10,
    timeoutMs: 20_000,
  };
}

// ── Errors ───────────────────────────────────────────────────────────

export class CardComError extends Error {
  readonly code: number;
  readonly operation: string;
  constructor(operation: string, code: number, description: string) {
    super(`CardCom ${operation} failed (code=${code}): ${description}`);
    this.name = "CardComError";
    this.code = code;
    this.operation = operation;
  }
}

// ── SOAP helpers ─────────────────────────────────────────────────────

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  parseTagValue: false, // keep everything as strings; we parse numerics ourselves
  processEntities: true,
});

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function emit(tag: string, value: string | number | boolean | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  const v = typeof value === "string" ? xmlEscape(value) : String(value);
  return `<${tag}>${v}</${tag}>`;
}

async function soapCall(
  cfg: CardComConfig,
  path: string,
  soapAction: string,
  innerXml: string
): Promise<Record<string, unknown>> {
  const envelope = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">${
    `<soap:Body>${innerXml}</soap:Body>`
  }</soap:Envelope>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${soapAction}"`,
      },
      body: envelope,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(
      `CardCom HTTP ${res.status} calling ${path} (${soapAction})`
    );
  }
  const text = await res.text();
  return xmlParser.parse(text) as Record<string, unknown>;
}

/**
 * Navigate a parsed SOAP response by path: ["Envelope","Body","FooResponse","FooResult"].
 * Returns undefined if any segment is missing. Uses the fact that
 * fast-xml-parser flattens nested tags into nested objects.
 */
function pick(obj: unknown, path: readonly string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg] ??
      (cur as Record<string, unknown>)[`soap:${seg}`];
  }
  return cur;
}

function intOrZero(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function stringOrEmpty(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function boolOrFalse(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

// ── HostedPaymentProvider implementation ─────────────────────────────

export function buildRealCardComProvider(
  cfgOverride?: Partial<CardComConfig>
): HostedPaymentProvider {
  const cfg: CardComConfig = { ...readConfig(), ...cfgOverride };

  return {
    id: "cardcom",

    async createSession(input) {
      const operation =
        input.role === "card_verification" ? "CreateTokenOnly" : "BillOnly";
      const sumToBill =
        input.role === "card_verification"
          ? "0"
          : (input.amountAgorot / 100).toFixed(2);

      const innerParams = [
        emit("Operation", operation),
        emit("ReturnValue", input.paymentId),
        emit("SumToBill", sumToBill),
        emit("CoinISOName", "ILS"),
        emit("Language", input.language ?? "he"),
        emit("SuccessRedirectUrl", input.urls.success),
        emit("ErrorRedirectUrl", input.urls.error),
        emit("CancelUrl", input.urls.cancel),
        emit("IndicatorUrl", input.urls.indicator),
        emit("ProductName", input.productName),
        emit("MinNumOfPayments", 1),
        emit("MaxNumOfPayments", 1),
        emit("DefaultNumOfPayments", 1),
        emit("ThreeDSecureState", "Auto"),
        emit("APILevel", cfg.apiLevel ?? 10),
        emit("CardOwnerName", input.customer.name),
        emit("CardOwnerPhone", input.customer.phone),
        emit("CardOwnerEmail", input.customer.email ?? ""),
        emit("IsCreateInvoice", false),
        // Shva J-type validation for verification-only tokens. '5' is the
        // industry-standard "no amount check" code. Ignored for BillOnly.
        input.role === "card_verification"
          ? emit("CreateTokenJValidateType", 5)
          : "",
      ].join("");

      const inner = `<CreateLowProfileDeal xmlns="http://cardcom.co.il/">${
        emit("terminalnumber", cfg.terminalNumber)
      }${emit("username", cfg.apiUsername)}<lowprofileParams>${innerParams}</lowprofileParams></CreateLowProfileDeal>`;

      const parsed = await soapCall(
        cfg,
        "/service.asmx",
        "http://cardcom.co.il/CreateLowProfileDeal",
        inner
      );

      const result = pick(parsed, [
        "Envelope",
        "Body",
        "CreateLowProfileDealResponse",
        "CreateLowProfileDealResult",
      ]) as Record<string, unknown> | undefined;

      if (!result) {
        throw new Error("CardCom: malformed CreateLowProfileDeal response");
      }

      const code = intOrZero(result.ResponseCode);
      if (code !== 0) {
        throw new CardComError(
          "CreateLowProfileDeal",
          code,
          stringOrEmpty(result.Description) || "Unknown error"
        );
      }

      return {
        lowProfileCode: stringOrEmpty(result.LowProfileCode),
        url: stringOrEmpty(result.url),
      };
    },

    async getLowProfileIndicator(lowProfileCode) {
      const inner = `<GetLowProfileIndicator xmlns="http://cardcom.co.il/">${
        emit("terminalnumber", cfg.terminalNumber)
      }${emit("username", cfg.apiUsername)}${
        emit("LowProfileCode", lowProfileCode)
      }</GetLowProfileIndicator>`;

      const parsed = await soapCall(
        cfg,
        "/service.asmx",
        "http://cardcom.co.il/GetLowProfileIndicator",
        inner
      );

      const result = pick(parsed, [
        "Envelope",
        "Body",
        "GetLowProfileIndicatorResponse",
        "GetLowProfileIndicatorResult",
      ]) as Record<string, unknown> | undefined;
      if (!result) {
        throw new Error("CardCom: malformed GetLowProfileIndicator response");
      }
      return parseIndicator(result);
    },

    async revokeLowProfileDeal(lowProfileCode) {
      if (!cfg.apiPassword) {
        throw new Error("CardCom: CARDCOM_API_PASSWORD required for Revoke");
      }
      const inner = `<RevokeLowProfileDeal xmlns="BillGoldService">${
        emit("TerminalNumber", cfg.terminalNumber)
      }${emit("UserName", cfg.apiUsername)}${
        emit("UserPassword", cfg.apiPassword)
      }${emit("LowProfileCode", lowProfileCode)}</RevokeLowProfileDeal>`;
      const parsed = await soapCall(
        cfg,
        "/Interface/BillGoldService.asmx",
        "BillGoldService/RevokeLowProfileDeal",
        inner
      );
      const result = pick(parsed, [
        "Envelope",
        "Body",
        "RevokeLowProfileDealResponse",
        "RevokeLowProfileDealResult",
      ]) as Record<string, unknown> | undefined;
      const code = intOrZero(result?.ResponseCode);
      // Treat 'not found' / 'already revoked' as success — idempotent.
      if (code === 0 || code === 504 || code === 505) {
        return { revoked: true };
      }
      throw new CardComError(
        "RevokeLowProfileDeal",
        code,
        stringOrEmpty(result?.Description) || "Unknown error"
      );
    },

    async chargeToken(input) {
      if (!cfg.apiPassword) {
        throw new Error(
          "CardCom: CARDCOM_API_PASSWORD required for LowProfileChargeToken"
        );
      }
      // Build a minimal OperationInfo payload; the WSDL has many optional
      // fields but Token + Sum + NumOfPayments is sufficient for a real
      // charge against a stored card.
      const sum = (input.amountAgorot / 100).toFixed(2);
      const inner = `<LowProfileChargeToken xmlns="BillGoldService">${
        emit("TerminalNumber", cfg.terminalNumber)
      }${emit("UserName", cfg.apiUsername)}${
        emit("UserPassword", cfg.apiPassword)
      }<OperationInfo>${emit("Token", input.token)}${emit("Sum", sum)}${
        emit("CoinISOName", "ILS")
      }${emit("NumOfPayments", 1)}${
        emit("ProductName", input.productName)
      }${emit("ReturnValue", input.paymentId)}</OperationInfo></LowProfileChargeToken>`;

      const parsed = await soapCall(
        cfg,
        "/Interface/BillGoldService.asmx",
        "BillGoldService/LowProfileChargeToken",
        inner
      );
      const result = pick(parsed, [
        "Envelope",
        "Body",
        "LowProfileChargeTokenResponse",
        "LowProfileChargeTokenResult",
      ]) as Record<string, unknown> | undefined;
      const code = intOrZero(result?.ResponseCode);
      if (code !== 0) {
        throw new CardComError(
          "LowProfileChargeToken",
          code,
          stringOrEmpty(result?.Description) || "Unknown error"
        );
      }
      return {
        internalDealNumber: intOrZero(result?.InternalDealNumber),
        approvalNumber: stringOrEmpty(result?.ApprovalNumber),
      };
    },
  };
}

// ── Indicator parsing (shared between adapter + webhook pull-through) ─

export function parseIndicator(
  result: Record<string, unknown>
): LowProfileIndicator {
  const ind = (result.Indicator ?? {}) as Record<string, unknown>;
  const shva = (result.ShvaResponce ?? {}) as Record<string, unknown>;
  const cardMasked = stringOrEmpty(shva.CardNumber5);
  const cardLast4 = cardMasked.slice(-4).replace(/[^0-9]/g, "");

  return {
    responseCode: intOrZero(result.ResponseCode),
    description: stringOrEmpty(result.Description),
    indicator: {
      lowProfileCode: stringOrEmpty(ind.lowprofilecode),
      operation: intOrZero(ind.Operation),
      processEndOK: intOrZero(ind.ProssesEndOK) === 1 ? 1 : 0,
      dealResponse: intOrZero(ind.DealRespone),
      operationResponse: intOrZero(ind.OperationResponse),
      internalDealNumber: intOrZero(ind.InternalDealNumber),
      returnValue: stringOrEmpty(ind.ReturnValue),
      token: stringOrEmpty(ind.Token) || undefined,
      tokenExpiryYYYYMMDD: stringOrEmpty(ind.TokenExDate) || undefined,
      cardValidityYear: stringOrEmpty(ind.CardValidityYear) || undefined,
      cardValidityMonth: stringOrEmpty(ind.CardValidityMonth) || undefined,
      isRevoked: boolOrFalse(ind.IsRevoked),
      isLowProfileDeal24HRevoked: boolOrFalse(ind.IsLowProfileDeal24HRevoked),
      cardOwnerName: stringOrEmpty(ind.CardOwnerName) || undefined,
      cardOwnerEmail: stringOrEmpty(ind.CardOwnerEmail) || undefined,
      cardOwnerPhone: stringOrEmpty(ind.CardOwnerPhone) || undefined,
    },
    shva: {
      sumAgorot: intOrZero(shva.Sum36),
      cardLast4,
      approvalNumber: stringOrEmpty(shva.ApprovalNumber71),
      dealDate: stringOrEmpty(shva.DealDate),
      internalDealNumber: intOrZero(shva.InternalDealNumber),
      uid: stringOrEmpty(shva.Uid),
    },
  };
}

/** Drop any PAN-adjacent data before persisting the webhook payload. */
export function redactIndicatorForStorage(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const safe = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  stripFields(safe, [
    "CardNumber",
    "CardNumberFull",
    "CVV",
    "CardHolderIdentityNumber",
  ]);
  return safe;
}

function stripFields(obj: unknown, fields: string[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) stripFields(item, fields);
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (fields.includes(key)) {
      record[key] = "[REDACTED]";
    } else {
      stripFields(record[key], fields);
    }
  }
}

/**
 * Build a "valid payment" predicate from an indicator — same rule
 * documented in docs/integrations/API_CardCom.md §6. Used both in the
 * webhook handler and in tests.
 */
export function isSuccessfulCapture(
  ind: LowProfileIndicator,
  expectedPaymentId: string,
  expectedAmountAgorot: number
): { ok: true } | { ok: false; reason: string } {
  if (ind.responseCode !== 0)
    return { ok: false, reason: `ResponseCode=${ind.responseCode}` };
  if (ind.indicator.processEndOK !== 1)
    return { ok: false, reason: "ProssesEndOK != 1" };
  if (ind.indicator.dealResponse !== 0)
    return { ok: false, reason: `DealRespone=${ind.indicator.dealResponse}` };
  if (ind.indicator.operationResponse !== 0)
    return {
      ok: false,
      reason: `OperationResponse=${ind.indicator.operationResponse}`,
    };
  if (ind.indicator.returnValue !== expectedPaymentId)
    return { ok: false, reason: "ReturnValue mismatch" };
  if (ind.shva.sumAgorot !== expectedAmountAgorot)
    return {
      ok: false,
      reason: `Sum mismatch: expected ${expectedAmountAgorot}, got ${ind.shva.sumAgorot}`,
    };
  if (ind.indicator.isRevoked)
    return { ok: false, reason: "IsRevoked=true" };
  if (ind.indicator.isLowProfileDeal24HRevoked)
    return { ok: false, reason: "IsLowProfileDeal24HRevoked=true" };
  return { ok: true };
}

/**
 * A token-only (CreateTokenOnly) success check. Looser than capture —
 * no Shva sum, but we still want a valid token back.
 */
export function isSuccessfulTokenVerification(
  ind: LowProfileIndicator,
  expectedPaymentId: string
): { ok: true } | { ok: false; reason: string } {
  if (ind.responseCode !== 0)
    return { ok: false, reason: `ResponseCode=${ind.responseCode}` };
  if (ind.indicator.processEndOK !== 1)
    return { ok: false, reason: "ProssesEndOK != 1" };
  if (ind.indicator.returnValue !== expectedPaymentId)
    return { ok: false, reason: "ReturnValue mismatch" };
  if (!ind.indicator.token)
    return { ok: false, reason: "No token returned" };
  if (ind.indicator.isRevoked)
    return { ok: false, reason: "IsRevoked=true" };
  return { ok: true };
}

// Used by src/lib/payments/index.ts and mock.ts to pick the right client.
export type { HostedPaymentProvider, CustomerContact, PaymentRole };
