/**
 * VPay (Verifone "רב-ארנק") money-voucher adapter.
 *
 * VPay's SOAP service requires mTLS or IP-allowlist, neither of which Vercel
 * serverless can satisfy. Per the Phase 4.5 design, the SOAP client lives
 * in a Node/Hono proxy deployed on Fly.io (services/vpay-proxy/).
 *
 * This file is the main-app → proxy client: a thin HMAC-authed HTTP
 * fetcher that exposes the PosMoneyVoucherProvider interface. The SOAP
 * envelope / cert / IP concerns stay in the proxy.
 *
 * Request authenticity:
 *   X-Spame-Timestamp: <ISO-8601 current time>
 *   X-Spame-Signature: hex HMAC-SHA256(secret, `${ts}|${method}|${path}|${body}`)
 * Proxy rejects requests with > 5 min clock skew (replay protection).
 *
 * Reference: docs/integrations/API_VPay.md.
 */

import { createHmac } from "node:crypto";
import type {
  PosMoneyVoucherProvider,
  VpayAccount,
  VpayBalance,
} from "./types";

interface VpayProxyConfig {
  baseUrl: string;
  hmacSecret: string;
  timeoutMs: number;
}

function readConfig(): VpayProxyConfig {
  const baseUrl = process.env.VPAY_PROXY_URL;
  const hmacSecret = process.env.VPAY_PROXY_HMAC_SECRET;
  if (!baseUrl) {
    throw new Error("VPAY_PROXY_URL is required for the VPay adapter");
  }
  if (!hmacSecret || hmacSecret.length < 32) {
    throw new Error(
      "VPAY_PROXY_HMAC_SECRET must be set and >= 32 characters long"
    );
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    hmacSecret,
    timeoutMs: 20_000,
  };
}

export class VpayProxyError extends Error {
  readonly code: number;
  readonly friendlyMessage: string;
  readonly operation: string;
  constructor(
    operation: string,
    code: number,
    friendlyMessage: string,
    rawMessage?: string
  ) {
    super(
      `VPay ${operation} failed (code=${code}): ${rawMessage ?? friendlyMessage}`
    );
    this.name = "VpayProxyError";
    this.code = code;
    this.friendlyMessage = friendlyMessage;
    this.operation = operation;
  }
}

export function signRequest(
  secret: string,
  input: { timestamp: string; method: string; path: string; body: string }
): string {
  const payload = `${input.timestamp}|${input.method.toUpperCase()}|${input.path}|${input.body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function proxyCall<TResponse>(
  cfg: VpayProxyConfig,
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const bodyStr = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const signature = signRequest(cfg.hmacSecret, {
    timestamp,
    method: "POST",
    path,
    body: bodyStr,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Spame-Timestamp": timestamp,
        "X-Spame-Signature": signature,
      },
      body: bodyStr,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed: unknown;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(
        `VPay proxy ${path}: response is not JSON (HTTP ${res.status})`
      );
    }
  }

  if (!res.ok) {
    const errBody = parsed as
      | { code?: number; friendlyMessage?: string; message?: string; vpayCode?: string }
      | undefined;
    throw new VpayProxyError(
      path,
      errBody?.code ?? res.status,
      errBody?.friendlyMessage ?? "Error",
      errBody?.message
    );
  }

  return parsed as TResponse;
}

interface ProxyBalanceResponse {
  cardNumberMasked: string;
  balanceAgorot: number;
  accounts: VpayAccount[];
}

interface ProxyWithdrawResponse {
  actionReference: string;
  balanceAfter: ProxyBalanceResponse;
}

interface ProxyCreateTxResponse {
  transactionId: string;
}

export function buildRealVpayProvider(
  cfgOverride?: Partial<VpayProxyConfig>
): PosMoneyVoucherProvider {
  const cfg: VpayProxyConfig = { ...readConfig(), ...cfgOverride };

  return {
    id: "vpay",

    async createTransaction() {
      return proxyCall<ProxyCreateTxResponse>(cfg, "/v1/create-transaction", {});
    },

    async getBalance({ cardNumber, cvv }): Promise<VpayBalance> {
      return proxyCall<ProxyBalanceResponse>(cfg, "/v1/balance", {
        cardNumber,
        cvv,
      });
    },

    async withdraw(input) {
      const res = await proxyCall<ProxyWithdrawResponse>(cfg, "/v1/withdraw", {
        transactionId: input.transactionId,
        cardNumber: input.cardNumber,
        cvv: input.cvv,
        amountAgorot: input.amountAgorot,
        invoiceNumber: input.invoiceNumber,
        metadata: input.metadata,
      });
      return {
        actionReference: res.actionReference,
        balanceAfter: res.balanceAfter,
      };
    },

    async cancelWithdraw(input) {
      const res = await proxyCall<ProxyWithdrawResponse>(
        cfg,
        "/v1/cancel-withdraw",
        {
          transactionId: input.transactionId,
          cardNumber: input.cardNumber,
          withdrawReference: input.withdrawReference,
          amountAgorot: input.amountAgorot,
          invoiceNumber: input.invoiceNumber,
          reason: input.reason,
        }
      );
      return {
        actionReference: res.actionReference,
        balanceAfter: res.balanceAfter,
      };
    },
  };
}
