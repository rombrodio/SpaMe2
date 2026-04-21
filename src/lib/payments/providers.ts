/**
 * Provider registry — returns real or mock clients based on env vars.
 *
 * Env vars:
 *   PAYMENTS_CARDCOM_PROVIDER = "mock" | "real"  (default "mock")
 *   PAYMENTS_DTS_PROVIDER     = "mock" | "real"  (default "mock")
 *   PAYMENTS_VPAY_PROVIDER    = "mock" | "real"  (default "mock")
 *
 * Keep this module tiny — it's the single boundary between configuration
 * and the rest of the payments layer.
 */

import {
  buildMockCardComProvider,
  buildMockDtsProvider,
  buildMockVpayProvider,
} from "./mock";
import type {
  HostedPaymentProvider,
  PosBenefitVoucherProvider,
  PosMoneyVoucherProvider,
} from "./types";
import { buildRealCardComProvider } from "./cardcom";
import { buildRealDtsProvider } from "./dts";
import { buildRealVpayProvider } from "./vpay";

function pickMode(envName: string): "mock" | "real" {
  const raw = process.env[envName];
  return raw === "real" ? "real" : "mock";
}

export function getCardcomProvider(): HostedPaymentProvider {
  return pickMode("PAYMENTS_CARDCOM_PROVIDER") === "real"
    ? buildRealCardComProvider()
    : buildMockCardComProvider();
}

export function getDtsProvider(): PosBenefitVoucherProvider {
  return pickMode("PAYMENTS_DTS_PROVIDER") === "real"
    ? buildRealDtsProvider()
    : buildMockDtsProvider();
}

export function getVpayProvider(): PosMoneyVoucherProvider {
  return pickMode("PAYMENTS_VPAY_PROVIDER") === "real"
    ? buildRealVpayProvider()
    : buildMockVpayProvider();
}
