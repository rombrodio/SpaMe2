/**
 * DTS-Knowledge "שווה כסף" benefit-voucher adapter.
 *
 * Transport: POST application/x-www-form-urlencoded to
 * https://dtsposservicesv2.dts.co.il/DtsPosServices.asmx/<Method>
 * with a single form field `Request` whose value is a JSON blob.
 * Response is SOAP-wrapped JSON:
 *   <?xml ...?><string xmlns="http://tempuri.org/">{...JSON...}</string>
 *
 * Reference: docs/integrations/API_DTS.md.
 *
 * Unit-based: 1 voucher = 1 service. No amounts; mapping lives in
 * service_voucher_mappings table (service_id -> FullBarCode).
 *
 * Key gotchas baked into this module:
 *   - MemberId / OrganizationId for UseBenefits must come from
 *     Items[].organizationId in the prior GetBalance response,
 *     NOT from the top-level Customer object.
 *   - All items in one UseBenefits call must share an organizationId
 *     (DTS returns error 105 otherwise).
 *   - Error 108 ("already redeemed") is an idempotent-success signal,
 *     not a hard failure. Same for 109 on cancel ("already cancelled").
 *   - GetHistoryService mis-spells "PosBarcode" as "PostBarCode" in
 *     its response — we normalize to posBarcode.
 */

import type {
  PosBenefitVoucherProvider,
  DtsCustomer,
  DtsItem,
} from "./types";

interface DtsConfig {
  baseUrl: string;
  foreignTerminal: string;
  terminalNumber: string;
  timeoutMs: number;
}

function readConfig(): DtsConfig {
  const baseUrl =
    process.env.DTS_BASE_URL ??
    "https://dtsposservicesv2.dts.co.il/DtsPosServices.asmx";
  const foreignTerminal = process.env.DTS_FOREIGN_TERMINAL;
  if (!foreignTerminal) {
    throw new Error("DTS env missing: DTS_FOREIGN_TERMINAL is required");
  }
  return {
    baseUrl,
    foreignTerminal,
    terminalNumber: "",
    timeoutMs: 15_000,
  };
}

export class DtsError extends Error {
  readonly code: number;
  readonly operation: string;
  readonly friendlyMessage: string;
  constructor(
    operation: string,
    code: number,
    friendlyMessage: string,
    rawMessage?: string
  ) {
    super(`DTS ${operation} failed (code=${code}): ${rawMessage ?? friendlyMessage}`);
    this.name = "DtsError";
    this.code = code;
    this.operation = operation;
    this.friendlyMessage = friendlyMessage;
  }
}

/** Raw JSON shape returned inside the SOAP <string> wrapper. */
interface DtsRawResponse {
  Result: {
    ResultCode: number;
    ResultMessage?: string;
    ResultFriendlyMessage?: string;
  };
  Customer?: {
    OrganizationId: string | null;
    OrganizationName: string | null;
    MemberId: string | null;
    FirstName: string | null;
    LastName: string | null;
  };
  DtsConfirmationNumber?: string | null;
  ConfirmationOrganizationId?: string | null;
  Items?: Array<{
    MemberId?: string | null;
    OrganizationId: string;
    BusinessName?: string;
    FullBarCode: string;
    PosBarcode?: string | null;
    Quantity: number | string;
    Name: string;
    SplitVarCode?: Array<{ ChunkLine: string }>;
  }>;
  RealizationsHistoryItems?: Array<unknown>;
}

async function dtsCall(
  cfg: DtsConfig,
  method:
    | "GetBalance"
    | "GetBalanceSplited"
    | "UseBenefits"
    | "Cancel"
    | "CancelByItems"
    | "GetHistoryService",
  payload: Record<string, unknown>
): Promise<DtsRawResponse> {
  const body = new URLSearchParams({ Request: JSON.stringify(payload) });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/xml",
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`DTS HTTP ${res.status} on ${method}`);
  }
  const text = await res.text();
  return parseSoapJsonEnvelope(text, method);
}

/**
 * DTS wraps JSON inside a SOAP <string> element. Using a regex keeps the
 * dependency surface small; fast-xml-parser would also work but doesn't
 * help since the inner content is JSON.
 */
export function parseSoapJsonEnvelope(
  text: string,
  operation: string
): DtsRawResponse {
  const match = text.match(/<string[^>]*>([\s\S]*?)<\/string>/);
  if (!match) {
    throw new Error(`DTS ${operation}: malformed envelope (no <string>)`);
  }
  const inner = decodeXmlEntities(match[1].trim());
  let json: DtsRawResponse;
  try {
    json = JSON.parse(inner) as DtsRawResponse;
  } catch (err) {
    throw new Error(
      `DTS ${operation}: inner content is not valid JSON — ${(err as Error).message}`
    );
  }
  if (!json.Result || typeof json.Result.ResultCode !== "number") {
    throw new Error(`DTS ${operation}: missing Result.ResultCode`);
  }
  return json;
}

function decodeXmlEntities(s: string): string {
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function toCustomer(r: DtsRawResponse): DtsCustomer {
  const c = r.Customer;
  return {
    organizationId: c?.OrganizationId ?? "",
    organizationName: c?.OrganizationName ?? "",
    memberId: c?.MemberId ?? "",
    firstName: c?.FirstName ?? "",
    lastName: c?.LastName ?? "",
  };
}

function toItem(i: NonNullable<DtsRawResponse["Items"]>[number]): DtsItem {
  const qty =
    typeof i.Quantity === "number" ? i.Quantity : parseInt(String(i.Quantity), 10) || 0;
  return {
    memberId: i.MemberId ?? "",
    organizationId: i.OrganizationId,
    businessName: i.BusinessName ?? "",
    fullBarCode: i.FullBarCode,
    posBarcode: i.PosBarcode ?? "",
    quantity: qty,
    name: i.Name,
    splitVarCode: (i.SplitVarCode ?? []).map((x) => x.ChunkLine),
  };
}

/**
 * DTS error codes that should be treated as idempotent success rather
 * than hard failures. See docs/integrations/API_DTS.md §6.
 */
const IDEMPOTENT_CODES = new Set<number>([
  108, // UseBenefits: already redeemed
  109, // Cancel: already cancelled
]);

export function buildRealDtsProvider(
  cfgOverride?: Partial<DtsConfig>
): PosBenefitVoucherProvider {
  const cfg: DtsConfig = { ...readConfig(), ...cfgOverride };

  return {
    id: "dts",

    async getBalance(cardNumber) {
      const raw = await dtsCall(cfg, "GetBalance", {
        Request: {
          ForeignTerminal: cfg.foreignTerminal,
          SearchString: cardNumber,
        },
      });

      if (raw.Result.ResultCode !== 0) {
        throw new DtsError(
          "GetBalance",
          raw.Result.ResultCode,
          raw.Result.ResultFriendlyMessage ?? "Error",
          raw.Result.ResultMessage
        );
      }
      return {
        customer: toCustomer(raw),
        items: (raw.Items ?? []).map(toItem),
      };
    },

    async useBenefits(input) {
      // Enforce single-organization rule up front so we give a clear error
      // instead of bouncing off the server (error 105).
      const orgIds = new Set(input.items.map((i) => i.organizationId));
      if (orgIds.size > 1) {
        throw new DtsError(
          "UseBenefits",
          105,
          "Cannot redeem vouchers from more than one organization in one transaction"
        );
      }
      if (input.items.length === 0) {
        throw new DtsError("UseBenefits", 104, "No items to redeem");
      }

      const payload = {
        Request: {
          ForeignTerminal: cfg.foreignTerminal,
          TerminalNumber: cfg.terminalNumber,
          OriginalRequestId: input.originalRequestId,
        },
        Customer: {
          OrganizationId: input.customer.organizationId,
          OrganizationName: input.customer.organizationName,
          MemberId: input.customer.memberId,
          FirstName: input.customer.firstName,
          LastName: input.customer.lastName,
        },
        DtsConfirmationNumber: null,
        ConfirmationOrganizationId: null,
        Items: input.items.map((i) => ({
          OrganizationId: i.organizationId,
          FullBarCode: i.fullBarCode,
          PosBarcode: i.posBarcode,
          Quantity: i.quantity,
          Name: i.name,
        })),
      };

      const raw = await dtsCall(cfg, "UseBenefits", payload);
      if (raw.Result.ResultCode !== 0 && !IDEMPOTENT_CODES.has(raw.Result.ResultCode)) {
        throw new DtsError(
          "UseBenefits",
          raw.Result.ResultCode,
          raw.Result.ResultFriendlyMessage ?? "Error",
          raw.Result.ResultMessage
        );
      }

      const confNumber = raw.DtsConfirmationNumber ?? input.originalRequestId;
      const confOrg =
        raw.ConfirmationOrganizationId ?? [...orgIds][0] ?? "";

      return {
        dtsConfirmationNumber: confNumber,
        confirmationOrganizationId: confOrg,
        redeemed: (raw.Items ?? []).map(toItem),
      };
    },

    async cancel(input) {
      const raw = await dtsCall(cfg, "Cancel", {
        Request: {
          ForeignTerminal: cfg.foreignTerminal,
          TerminalNumber: cfg.terminalNumber,
        },
        DtsConfirmationNumber: input.dtsConfirmationNumber,
        ConfirmationOrganizationId: input.confirmationOrganizationId,
      });

      if (
        raw.Result.ResultCode !== 0 &&
        !IDEMPOTENT_CODES.has(raw.Result.ResultCode)
      ) {
        throw new DtsError(
          "Cancel",
          raw.Result.ResultCode,
          raw.Result.ResultFriendlyMessage ?? "Error",
          raw.Result.ResultMessage
        );
      }

      return {
        cancelReference:
          raw.DtsConfirmationNumber ?? input.dtsConfirmationNumber,
      };
    },
  };
}
