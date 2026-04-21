/**
 * Shared types for the payments layer.
 *
 * Three provider shapes sit behind a unified abstraction in
 * src/lib/payments/engine.ts:
 *   - CardCom → HostedPaymentProvider (async, webhook-driven, hosted page)
 *   - VPay    → PosMoneyVoucherProvider (sync, money-wallet cards)
 *   - DTS     → PosBenefitVoucherProvider (sync, unit-based benefit cards)
 *
 * Amounts inside our system are always INTEGER AGOROT (ILS / 100).
 * Conversion to provider-specific decimals happens inside each adapter.
 */

// ── Enum literal unions (match 00015_payments_and_holds.sql) ──

export const PAYMENT_METHODS = [
  "credit_card_full",
  "cash_at_reception",
  "voucher_dts",
  "voucher_vpay",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_ROLES = [
  "capture",
  "card_verification",
  "cash_remainder",
  "penalty_capture",
  "refund",
] as const;
export type PaymentRole = (typeof PAYMENT_ROLES)[number];

export const PAYMENT_STATUSES = [
  "pending",
  "authorized",
  "success",
  "failed",
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const VOUCHER_PROVIDERS = ["dts", "vpay"] as const;
export type VoucherProvider = (typeof VOUCHER_PROVIDERS)[number];

// ── Shared data shapes ──

export interface CustomerContact {
  name: string;
  phone: string;
  email?: string;
}

export interface MoneyAgorot {
  amountAgorot: number;
}

// ── CardCom (hosted page + token reuse) ──

export interface HostedPaymentProvider {
  id: "cardcom" | "mock";

  /**
   * Create a Low-Profile hosted-page session.
   * Operation semantics:
   *   - "capture"           → Operation=BillOnly (money is charged when customer submits)
   *   - "card_verification" → Operation=CreateTokenOnly with Shva J-validation
   *                            (card verified, token stored, no money moved)
   */
  createSession(input: {
    paymentId: string;            // our payments.id (also sent as ReturnValue)
    bookingId: string;
    amountAgorot: number;         // pass 0 for card_verification (ignored server-side)
    role: Extract<PaymentRole, "capture" | "card_verification">;
    productName: string;
    customer: CustomerContact;
    urls: {
      success: string;
      error: string;
      cancel: string;
      indicator: string;          // webhook
    };
    language?: "he" | "en";
  }): Promise<{
    lowProfileCode: string;       // GUID; persisted on payments.provider_tx_id
    url: string;                  // hosted page URL (we IFRAME this)
  }>;

  /**
   * Pull-through verification: fetch the authoritative state of a LowProfile
   * deal. Called from the webhook handler.
   */
  getLowProfileIndicator(lowProfileCode: string): Promise<LowProfileIndicator>;

  /** Cancel an unused / unfinished hosted-page session. */
  revokeLowProfileDeal(lowProfileCode: string): Promise<{ revoked: true }>;

  /**
   * Charge an existing stored card token (used for penalty capture after
   * no-show / late cancellation on cash_at_reception bookings).
   */
  chargeToken(input: {
    paymentId: string;
    token: string;
    amountAgorot: number;
    productName: string;
  }): Promise<{
    internalDealNumber: number;
    approvalNumber: string;
  }>;
}

export interface LowProfileIndicator {
  responseCode: number;
  description: string;
  indicator: {
    lowProfileCode: string;
    operation: number;
    processEndOK: 0 | 1;
    dealResponse: number;
    operationResponse: number;
    internalDealNumber: number;
    returnValue: string;          // our payments.id
    token?: string;
    tokenExpiryYYYYMMDD?: string; // e.g. "20281130"
    cardValidityYear?: string;
    cardValidityMonth?: string;
    isRevoked: boolean;
    isLowProfileDeal24HRevoked: boolean;
    cardOwnerName?: string;
    cardOwnerEmail?: string;
    cardOwnerPhone?: string;
  };
  shva: {
    sumAgorot: number;            // Sum36 from Shva
    cardLast4: string;            // derived from CardNumber5
    approvalNumber: string;
    dealDate: string;             // ISO-8601
    internalDealNumber: number;
    uid: string;
  };
}

// ── VPay (money-wallet vouchers; sync) ──

export interface VpayAccount {
  id: string;
  name: string;
  definitionId: number;
  balanceAgorot: number;
  currencyCode: 376;
  validFrom: string;
  validThru: string;
  state: string;
}

export interface VpayBalance {
  cardNumberMasked: string;
  balanceAgorot: number;
  accounts: VpayAccount[];
}

export interface PosMoneyVoucherProvider {
  id: "vpay" | "mock";
  createTransaction(): Promise<{ transactionId: string }>;
  getBalance(input: {
    cardNumber: string;
    cvv: string;
  }): Promise<VpayBalance>;
  withdraw(input: {
    transactionId: string;
    cardNumber: string;
    cvv: string;
    amountAgorot: number;
    invoiceNumber: string;
    metadata: { bookingId: string; paymentId: string };
  }): Promise<{
    actionReference: string;      // persisted on payments.provider_tx_id
    balanceAfter: VpayBalance;
  }>;
  cancelWithdraw(input: {
    transactionId: string;
    cardNumber: string;
    withdrawReference: string;
    amountAgorot: number;
    invoiceNumber: string;
    reason: "Compensation" | "CustomerRequest" | "Other";
  }): Promise<{ actionReference: string; balanceAfter: VpayBalance }>;
}

// ── DTS (benefit vouchers; unit-based; sync) ──

export interface DtsCustomer {
  organizationId: string;
  organizationName: string;
  memberId: string;
  firstName: string;
  lastName: string;
}

export interface DtsItem {
  memberId: string;
  organizationId: string;
  businessName: string;
  fullBarCode: string;
  posBarcode: string;
  quantity: number;
  name: string;
  splitVarCode: string[];
}

export interface PosBenefitVoucherProvider {
  id: "dts" | "mock";
  getBalance(cardNumber: string): Promise<{
    customer: DtsCustomer;
    items: DtsItem[];
  }>;
  useBenefits(input: {
    originalRequestId: string;
    customer: Pick<
      DtsCustomer,
      "organizationId" | "organizationName" | "memberId" | "firstName" | "lastName"
    >;
    items: Array<{
      organizationId: string;
      fullBarCode: string;
      posBarcode: string;
      quantity: number;
      name: string;
    }>;
  }): Promise<{
    dtsConfirmationNumber: string;        // persisted on payments.provider_tx_id
    confirmationOrganizationId: string;   // persisted on payments.provider_cancel_ref
    redeemed: DtsItem[];
  }>;
  cancel(input: {
    dtsConfirmationNumber: string;
    confirmationOrganizationId: string;
  }): Promise<{ cancelReference: string }>;
}

// ── Penalty policy snapshot carried on each booking ──

export const CANCELLATION_POLICY_VERSIONS = [
  "v1_5pct_or_100ILS_min",
] as const;
export type CancellationPolicyVersion =
  (typeof CANCELLATION_POLICY_VERSIONS)[number];

export interface CancellationFeeQuote {
  policyVersion: CancellationPolicyVersion;
  hoursBefore: number;
  shouldCharge: boolean;
  feeAgorot: number;
  reason: string;
}
