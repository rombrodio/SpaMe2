/**
 * Mock provider implementations — used in dev (`PAYMENTS_*_PROVIDER=mock`)
 * and in unit/integration tests.
 *
 * The mocks are deterministic and stateful inside a process lifetime
 * (useful for webhook simulation). Resetting state between tests: call
 * `resetCardcomMock()`, `resetDtsMock()`, `resetVpayMock()`.
 */

import { randomUUID } from "node:crypto";
import type {
  HostedPaymentProvider,
  LowProfileIndicator,
  PosBenefitVoucherProvider,
  PosMoneyVoucherProvider,
  VpayBalance,
  DtsItem,
  DtsCustomer,
} from "./types";

// ───────────────────────────────────────────────────────────────
// CardCom mock
// ───────────────────────────────────────────────────────────────

interface MockDeal {
  lowProfileCode: string;
  paymentId: string;
  role: "capture" | "card_verification";
  amountAgorot: number;
  url: string;
  state: "pending" | "succeeded" | "failed" | "revoked";
  token?: string;
  internalDealNumber?: number;
  revokedAt?: Date;
}

const cardcomDeals = new Map<string, MockDeal>();
let nextInternalDeal = 1_000_000;

export function resetCardcomMock(): void {
  cardcomDeals.clear();
  nextInternalDeal = 1_000_000;
}

/** Test-only: advance a mocked deal as if the customer had completed it. */
export function simulateCardcomDealCompletion(
  lowProfileCode: string,
  outcome: "succeeded" | "failed"
): void {
  const deal = cardcomDeals.get(lowProfileCode);
  if (!deal) throw new Error(`No mocked deal for ${lowProfileCode}`);
  deal.state = outcome;
  if (outcome === "succeeded") {
    deal.internalDealNumber = nextInternalDeal++;
    if (deal.role === "card_verification") {
      deal.token = `MOCK-TOK-${randomUUID()}`;
    }
  }
}

/** Test-only: read the mocked deal so tests can assert fields. */
export function getMockCardcomDeal(
  lowProfileCode: string
): MockDeal | undefined {
  return cardcomDeals.get(lowProfileCode);
}

export function buildMockCardComProvider(): HostedPaymentProvider {
  return {
    id: "mock",

    async createSession(input) {
      const lowProfileCode = randomUUID();
      const deal: MockDeal = {
        lowProfileCode,
        paymentId: input.paymentId,
        role: input.role,
        amountAgorot: input.amountAgorot,
        url: `https://mock.cardcom.local/lp/${lowProfileCode}`,
        state: "pending",
      };
      cardcomDeals.set(lowProfileCode, deal);
      return { lowProfileCode, url: deal.url };
    },

    async getLowProfileIndicator(lowProfileCode): Promise<LowProfileIndicator> {
      const deal = cardcomDeals.get(lowProfileCode);
      if (!deal) {
        // Unknown deal — respond with non-success code.
        return {
          responseCode: 504,
          description: "No action found for the given reference",
          indicator: emptyIndicator(lowProfileCode),
          shva: emptyShva(),
        };
      }
      if (deal.state === "pending" || deal.state === "failed") {
        return {
          responseCode: 0,
          description: deal.state === "pending" ? "Pending" : "Deal failed",
          indicator: {
            ...emptyIndicator(lowProfileCode),
            returnValue: deal.paymentId,
            processEndOK: deal.state === "pending" ? 0 : 1,
            dealResponse: deal.state === "failed" ? 1 : 0,
            operationResponse: deal.state === "failed" ? 1 : 0,
          },
          shva: emptyShva(),
        };
      }
      if (deal.state === "revoked") {
        return {
          responseCode: 0,
          description: "Revoked",
          indicator: {
            ...emptyIndicator(lowProfileCode),
            returnValue: deal.paymentId,
            isRevoked: true,
          },
          shva: emptyShva(),
        };
      }
      // Succeeded — differentiate capture vs card_verification.
      const now = new Date().toISOString();
      return {
        responseCode: 0,
        description: "Success",
        indicator: {
          lowProfileCode,
          operation: deal.role === "card_verification" ? 3 : 2,
          processEndOK: 1,
          dealResponse: 0,
          operationResponse: 0,
          internalDealNumber: deal.internalDealNumber ?? 0,
          returnValue: deal.paymentId,
          token: deal.token,
          tokenExpiryYYYYMMDD:
            deal.role === "card_verification" ? "20281231" : undefined,
          cardValidityYear: "28",
          cardValidityMonth: "12",
          isRevoked: false,
          isLowProfileDeal24HRevoked: false,
          cardOwnerName: "Test Customer",
        },
        shva: {
          sumAgorot: deal.role === "card_verification" ? 0 : deal.amountAgorot,
          cardLast4: "4242",
          approvalNumber: "123456",
          dealDate: now,
          internalDealNumber: deal.internalDealNumber ?? 0,
          uid: `mock-${lowProfileCode}`,
        },
      };
    },

    async revokeLowProfileDeal(lowProfileCode) {
      const deal = cardcomDeals.get(lowProfileCode);
      if (deal && deal.state === "pending") {
        deal.state = "revoked";
        deal.revokedAt = new Date();
      }
      return { revoked: true };
    },

    async chargeToken(input) {
      // Track the synthetic charge against a deterministic internal deal id
      // so the engine can persist it. Any non-empty token is accepted.
      if (!input.token || !input.token.startsWith("MOCK-TOK-")) {
        throw new Error("Mock CardCom: unknown token");
      }
      return {
        internalDealNumber: nextInternalDeal++,
        approvalNumber: "987654",
      };
    },
  };
}

function emptyIndicator(lowProfileCode: string): LowProfileIndicator["indicator"] {
  return {
    lowProfileCode,
    operation: 0,
    processEndOK: 0,
    dealResponse: 0,
    operationResponse: 0,
    internalDealNumber: 0,
    returnValue: "",
    isRevoked: false,
    isLowProfileDeal24HRevoked: false,
  };
}

function emptyShva(): LowProfileIndicator["shva"] {
  return {
    sumAgorot: 0,
    cardLast4: "",
    approvalNumber: "",
    dealDate: "",
    internalDealNumber: 0,
    uid: "",
  };
}

// ───────────────────────────────────────────────────────────────
// DTS mock  (filled in commit 6)
// ───────────────────────────────────────────────────────────────

const dtsCards = new Map<
  string,
  {
    customer: DtsCustomer;
    items: DtsItem[];
  }
>();
const dtsRedemptions = new Map<
  string,
  { organizationId: string; items: DtsItem[]; originalRequestId: string }
>();

export function resetDtsMock(): void {
  dtsCards.clear();
  dtsRedemptions.clear();
}

/** True when at least one DTS card is currently seeded. Providers.ts
 *  uses this to skip auto-seeding demo cards when tests have already
 *  seeded their own fixtures. */
export function hasDtsCards(): boolean {
  return dtsCards.size > 0;
}

/** Test helper: seed a DTS card with benefits. */
export function seedDtsCard(
  cardNumber: string,
  input: { customer: DtsCustomer; items: DtsItem[] }
): void {
  dtsCards.set(cardNumber, input);
}

export function buildMockDtsProvider(): PosBenefitVoucherProvider {
  return {
    id: "mock",
    async getBalance(cardNumber) {
      const hit = dtsCards.get(cardNumber);
      if (!hit) {
        throw Object.assign(new Error("Card does not exist"), { code: 42 });
      }
      return { customer: hit.customer, items: hit.items };
    },
    async useBenefits(input) {
      if (dtsRedemptions.has(input.originalRequestId)) {
        // Idempotent 108: already redeemed — return the prior confirmation.
        const prior = dtsRedemptions.get(input.originalRequestId)!;
        return {
          dtsConfirmationNumber: input.originalRequestId,
          confirmationOrganizationId: prior.organizationId,
          redeemed: prior.items,
        };
      }
      const orgId = input.items[0]?.organizationId ?? input.customer.organizationId;
      const allSameOrg = input.items.every((i) => i.organizationId === orgId);
      if (!allSameOrg) {
        throw Object.assign(
          new Error("Cannot redeem from two organizations in one call"),
          { code: 105 }
        );
      }
      const dtsConfirmationNumber = randomUUID();
      const redeemed: DtsItem[] = input.items.map((i) => ({
        memberId: input.customer.memberId,
        organizationId: i.organizationId,
        businessName: "Mock Spa",
        fullBarCode: i.fullBarCode,
        posBarcode: i.posBarcode,
        quantity: i.quantity,
        name: i.name,
        splitVarCode: [],
      }));
      dtsRedemptions.set(input.originalRequestId, {
        organizationId: orgId,
        items: redeemed,
        originalRequestId: input.originalRequestId,
      });
      return {
        dtsConfirmationNumber,
        confirmationOrganizationId: orgId,
        redeemed,
      };
    },
    async cancel(input) {
      return {
        cancelReference: `cancel-${input.dtsConfirmationNumber}`,
      };
    },
  };
}

// ───────────────────────────────────────────────────────────────
// VPay mock (filled in commit 7)
// ───────────────────────────────────────────────────────────────

const vpayCards = new Map<
  string,
  { cvv: string; balanceAgorot: number; masked: string }
>();
const vpayWithdraws = new Map<
  string,
  { cardNumber: string; amountAgorot: number; invoiceNumber: string }
>();

export function resetVpayMock(): void {
  vpayCards.clear();
  vpayWithdraws.clear();
}

/** True when at least one VPay card is currently seeded. Same purpose
 *  as hasDtsCards — prevents auto-seed from overwriting test fixtures. */
export function hasVpayCards(): boolean {
  return vpayCards.size > 0;
}

/** Test helper: seed a VPay card with a balance. */
export function seedVpayCard(
  cardNumber: string,
  input: { cvv: string; balanceAgorot: number }
): void {
  vpayCards.set(cardNumber, {
    cvv: input.cvv,
    balanceAgorot: input.balanceAgorot,
    masked:
      cardNumber.slice(0, 8) +
      "*".repeat(Math.max(0, cardNumber.length - 12)) +
      cardNumber.slice(-4),
  });
}

export function buildMockVpayProvider(): PosMoneyVoucherProvider {
  return {
    id: "mock",
    async createTransaction() {
      return { transactionId: randomUUID() };
    },
    async getBalance({ cardNumber, cvv }) {
      const card = vpayCards.get(cardNumber);
      if (!card) {
        throw Object.assign(new Error("Card does not exist"), { code: 801 });
      }
      if (card.cvv !== cvv) {
        throw Object.assign(new Error("CVV mismatch"), { code: 402 });
      }
      return balanceOf(card);
    },
    async withdraw(input) {
      const card = vpayCards.get(input.cardNumber);
      if (!card) {
        throw Object.assign(new Error("Card does not exist"), { code: 801 });
      }
      if (card.cvv !== input.cvv) {
        throw Object.assign(new Error("CVV mismatch"), { code: 402 });
      }
      if (vpayWithdraws.has(input.invoiceNumber)) {
        // VPay "816 — already performed": idempotent success. We don't
        // re-debit or mutate anything; the caller gets back the same
        // actionReference they'd have received the first time.
        return {
          actionReference: input.invoiceNumber,
          balanceAfter: balanceOf(card),
        };
      }
      if (card.balanceAgorot < input.amountAgorot) {
        throw Object.assign(new Error("Balance too low"), { code: 805 });
      }
      card.balanceAgorot -= input.amountAgorot;
      vpayWithdraws.set(input.invoiceNumber, {
        cardNumber: input.cardNumber,
        amountAgorot: input.amountAgorot,
        invoiceNumber: input.invoiceNumber,
      });
      return {
        actionReference: input.invoiceNumber,
        balanceAfter: balanceOf(card),
      };
    },
    async cancelWithdraw(input) {
      const prior = vpayWithdraws.get(input.withdrawReference);
      const card = vpayCards.get(input.cardNumber);
      if (!prior || !card) {
        throw Object.assign(new Error("No withdraw to cancel"), { code: 504 });
      }
      if (input.amountAgorot > prior.amountAgorot) {
        throw Object.assign(new Error("Cancel amount exceeds withdraw"), {
          code: 812,
        });
      }
      card.balanceAgorot += input.amountAgorot;
      prior.amountAgorot -= input.amountAgorot;
      if (prior.amountAgorot === 0) {
        vpayWithdraws.delete(input.withdrawReference);
      }
      return {
        actionReference: input.invoiceNumber,
        balanceAfter: balanceOf(card),
      };
    },
  };
}

function balanceOf(card: {
  balanceAgorot: number;
  masked: string;
}): VpayBalance {
  return {
    cardNumberMasked: card.masked,
    balanceAgorot: card.balanceAgorot,
    accounts: [
      {
        id: "mock-account",
        name: "Mock Wallet",
        definitionId: 1,
        balanceAgorot: card.balanceAgorot,
        currencyCode: 376,
        validFrom: "2025-01-01T00:00:00Z",
        validThru: "2030-12-31T23:59:59Z",
        state: "Active",
      },
    ],
  };
}
