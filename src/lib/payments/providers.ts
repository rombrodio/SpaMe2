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
  seedDtsCard,
  seedVpayCard,
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

// ────────────────────────────────────────────────────────────
// Dev-mode auto-seeding
//
// Mock providers keep per-process in-memory state. Without seeding
// the dev server starts with zero cards and every /order voucher
// lookup returns "Card does not exist". We seed once per process
// on first provider construction so the documented demo cards are
// always ready:
//
//   DTS:   1234567890            → generic benefits
//   VPay:  8010019852923235      CVV 123 → ₪500 balance
//
// Tests call buildMock*Provider() directly, so they're unaffected.
// ────────────────────────────────────────────────────────────

let dtsSeeded = false;
let vpaySeeded = false;

export const DEMO_DTS_CARD_NUMBER = "1234567890";
export const DEMO_VPAY_CARD_NUMBER = "8010019852923235";
export const DEMO_VPAY_CVV = "123";

function ensureDtsDemoSeed(): void {
  if (dtsSeeded) return;
  dtsSeeded = true;
  seedDtsCard(DEMO_DTS_CARD_NUMBER, {
    customer: {
      organizationId: "demo-org",
      organizationName: "Demo Loyalty Club",
      memberId: "demo-member",
      firstName: "Demo",
      lastName: "Customer",
    },
    items: [
      {
        memberId: "demo-member",
        organizationId: "demo-org",
        businessName: "SpaMe Demo",
        fullBarCode: "DEMO-MASSAGE-60",
        posBarcode: "",
        quantity: 3,
        name: "עיסוי 60 דקות",
        splitVarCode: [],
      },
      {
        memberId: "demo-member",
        organizationId: "demo-org",
        businessName: "SpaMe Demo",
        fullBarCode: "DEMO-FACIAL",
        posBarcode: "",
        quantity: 2,
        name: "טיפול פנים",
        splitVarCode: [],
      },
    ],
  });
}

function ensureVpayDemoSeed(): void {
  if (vpaySeeded) return;
  vpaySeeded = true;
  seedVpayCard(DEMO_VPAY_CARD_NUMBER, {
    cvv: DEMO_VPAY_CVV,
    balanceAgorot: 50_000, // 500 ILS
  });
}

export function getCardcomProvider(): HostedPaymentProvider {
  return pickMode("PAYMENTS_CARDCOM_PROVIDER") === "real"
    ? buildRealCardComProvider()
    : buildMockCardComProvider();
}

export function getDtsProvider(): PosBenefitVoucherProvider {
  if (pickMode("PAYMENTS_DTS_PROVIDER") === "real") {
    return buildRealDtsProvider();
  }
  ensureDtsDemoSeed();
  return buildMockDtsProvider();
}

export function getVpayProvider(): PosMoneyVoucherProvider {
  if (pickMode("PAYMENTS_VPAY_PROVIDER") === "real") {
    return buildRealVpayProvider();
  }
  ensureVpayDemoSeed();
  return buildMockVpayProvider();
}
