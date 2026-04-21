import { describe, it, expect, beforeEach } from "vitest";
import {
  parseIndicator,
  isSuccessfulCapture,
  isSuccessfulTokenVerification,
  redactIndicatorForStorage,
} from "../cardcom";
import {
  buildMockCardComProvider,
  resetCardcomMock,
  simulateCardcomDealCompletion,
} from "../mock";

// Realistic CardCom GetLowProfileIndicator body — adapted from the WSDL
// sample in the CardCom developer docs. Structure matches what
// fast-xml-parser returns when parsing the SOAP response (strings for
// every element since parseTagValue is false in the adapter).
const sampleIndicatorResult = {
  ResponseCode: "0",
  Description: "Success",
  Indicator: {
    Terminal_Number: "123456",
    RowID: "42",
    lowprofilecode: "a1b2c3d4-1111-2222-3333-444444444444",
    Operation: "2",
    ProssesEndOK: "1",
    DealRespone: "0",
    InternalDealNumber: "999888",
    TokenResponse: "0",
    Token: "",
    TokenExDate: "",
    CardValidityYear: "28",
    CardValidityMonth: "11",
    CardOwnerID: "",
    SuspendedDealResponseCode: "0",
    SuspendedDealId: "0",
    SuspendedDealGroup: "0",
    InvoiceResponseCode: "0",
    InvoiceNumber: "0",
    InvoiceType: "0",
    TokenApprovalNumber: "",
    ReturnValue: "11111111-2222-3333-4444-555555555555",
    OperationResponse: "0",
    NumOfPayments: "1",
    IsRevoked: "false",
    IsLowProfileDeal24HRevoked: "false",
    CoinId: "1",
    CardOwnerEmail: "",
    CardOwnerName: "Israel Israeli",
    CardOwnerPhone: "0521234567",
    AccountId: "",
    ForeignAccountNumber: "",
    SiteUniqueId: "",
  },
  ShvaResponce: {
    HaveRecipient: "true",
    Status1: "0",
    CardNumber5: "4580****1234",
    Sulac25: "",
    JParameter29: "",
    Tokef30: "11/28",
    Sum36: "35000",
    SumStars52: "",
    ApprovalNumber71: "1234567",
    FirstPaymentSum78: "",
    ConstPayment86: "",
    NumberOfPayments94: "1",
    AbroadCard119: "",
    CardTypeCode60: "",
    Mutag24: "",
    CardOwnerName: "Israel Israeli",
    CardToken: "",
    CardHolderIdentityNumber: "",
    CardName: "Visa",
    CreditType63: "",
    DealType61: "",
    ChargType66: "",
    SapakMutav: "",
    BinId: "0",
    DealDate: "2026-04-21T10:30:00",
    ExternalPaymentVector: "0",
    ExternalPaymentID: "",
    TerminalNumber: "123456",
    InternalDealNumber: "999888",
    CouponNumber: "",
    CardOwnerPhone: "0521234567",
    FirstCardDigits: "0",
    Uid: "shva-uid-abc",
  },
};

describe("parseIndicator", () => {
  it("parses a successful capture response", () => {
    const ind = parseIndicator(sampleIndicatorResult);
    expect(ind.responseCode).toBe(0);
    expect(ind.indicator.processEndOK).toBe(1);
    expect(ind.indicator.dealResponse).toBe(0);
    expect(ind.indicator.operationResponse).toBe(0);
    expect(ind.indicator.internalDealNumber).toBe(999888);
    expect(ind.indicator.returnValue).toBe(
      "11111111-2222-3333-4444-555555555555"
    );
    expect(ind.indicator.isRevoked).toBe(false);
    expect(ind.shva.sumAgorot).toBe(35000);
    expect(ind.shva.cardLast4).toBe("1234");
    expect(ind.shva.approvalNumber).toBe("1234567");
    expect(ind.shva.internalDealNumber).toBe(999888);
  });

  it("handles missing optional fields gracefully", () => {
    const trimmed = {
      ResponseCode: "0",
      Description: "Success",
      Indicator: { lowprofilecode: "abc", ReturnValue: "pid" },
      ShvaResponce: {},
    };
    const ind = parseIndicator(trimmed);
    expect(ind.shva.sumAgorot).toBe(0);
    expect(ind.shva.cardLast4).toBe("");
    expect(ind.indicator.isRevoked).toBe(false);
  });

  it("parses IsRevoked=true", () => {
    const revoked = JSON.parse(JSON.stringify(sampleIndicatorResult));
    revoked.Indicator.IsRevoked = "true";
    const ind = parseIndicator(revoked);
    expect(ind.indicator.isRevoked).toBe(true);
  });
});

describe("isSuccessfulCapture", () => {
  it("accepts a well-formed capture", () => {
    const ind = parseIndicator(sampleIndicatorResult);
    const result = isSuccessfulCapture(
      ind,
      "11111111-2222-3333-4444-555555555555",
      35000
    );
    expect(result.ok).toBe(true);
  });

  it("rejects sum mismatch", () => {
    const ind = parseIndicator(sampleIndicatorResult);
    const result = isSuccessfulCapture(
      ind,
      "11111111-2222-3333-4444-555555555555",
      100
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Sum mismatch/);
  });

  it("rejects returnValue mismatch (anti-spoofing)", () => {
    const ind = parseIndicator(sampleIndicatorResult);
    const result = isSuccessfulCapture(ind, "other-payment-id", 35000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ReturnValue mismatch/);
  });

  it("rejects incomplete flow (ProssesEndOK=0)", () => {
    const dup = JSON.parse(JSON.stringify(sampleIndicatorResult));
    dup.Indicator.ProssesEndOK = "0";
    const ind = parseIndicator(dup);
    const result = isSuccessfulCapture(
      ind,
      "11111111-2222-3333-4444-555555555555",
      35000
    );
    expect(result.ok).toBe(false);
  });

  it("rejects revoked deals", () => {
    const dup = JSON.parse(JSON.stringify(sampleIndicatorResult));
    dup.Indicator.IsRevoked = "true";
    const ind = parseIndicator(dup);
    const result = isSuccessfulCapture(
      ind,
      "11111111-2222-3333-4444-555555555555",
      35000
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/IsRevoked/);
  });
});

describe("isSuccessfulTokenVerification", () => {
  it("accepts a verified token", () => {
    const dup = JSON.parse(JSON.stringify(sampleIndicatorResult));
    dup.Indicator.Operation = "3";
    dup.Indicator.Token = "abc-def-123";
    dup.Indicator.TokenExDate = "20281231";
    dup.ShvaResponce.Sum36 = "0";
    const ind = parseIndicator(dup);
    const result = isSuccessfulTokenVerification(
      ind,
      "11111111-2222-3333-4444-555555555555"
    );
    expect(result.ok).toBe(true);
  });

  it("rejects when no token is returned", () => {
    const ind = parseIndicator(sampleIndicatorResult); // token empty
    const result = isSuccessfulTokenVerification(
      ind,
      "11111111-2222-3333-4444-555555555555"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/No token/);
  });
});

describe("redactIndicatorForStorage", () => {
  it("strips PAN-adjacent fields recursively", () => {
    const raw = {
      ShvaResponce: {
        CardNumber5: "4580****1234",
        CardNumber: "4580 0000 0000 1234",
        CVV: "123",
        CardHolderIdentityNumber: "123456789",
        DealDate: "2026-04-21T10:30:00",
      },
      nested: {
        CardNumberFull: "4580 0000 0000 1234",
      },
    };
    const safe = redactIndicatorForStorage(raw) as {
      ShvaResponce: {
        CardNumber5: string;
        CardNumber: string;
        CVV: string;
        CardHolderIdentityNumber: string;
        DealDate: string;
      };
      nested: { CardNumberFull: string };
    };
    expect(safe.ShvaResponce.CardNumber5).toBe("4580****1234");
    expect(safe.ShvaResponce.CardNumber).toBe("[REDACTED]");
    expect(safe.ShvaResponce.CVV).toBe("[REDACTED]");
    expect(safe.ShvaResponce.CardHolderIdentityNumber).toBe("[REDACTED]");
    expect(safe.nested.CardNumberFull).toBe("[REDACTED]");
    expect(safe.ShvaResponce.DealDate).toBe("2026-04-21T10:30:00");
  });
});

describe("mock CardCom provider — full session round-trip", () => {
  beforeEach(() => resetCardcomMock());

  it("createSession → simulateCompletion → getIndicator (success)", async () => {
    const cc = buildMockCardComProvider();
    const session = await cc.createSession({
      paymentId: "pay-1",
      bookingId: "book-1",
      amountAgorot: 35000,
      role: "capture",
      productName: "Swedish 60min",
      customer: { name: "Israel", phone: "0521234567" },
      urls: {
        success: "https://spame2.app/order/x/success",
        error: "https://spame2.app/order/x/error",
        cancel: "https://spame2.app/order/x/cancel",
        indicator: "https://spame2.app/api/webhooks/cardcom",
      },
    });
    expect(session.lowProfileCode).toMatch(
      /^[0-9a-f-]{36}$/i
    );
    expect(session.url).toContain(session.lowProfileCode);

    simulateCardcomDealCompletion(session.lowProfileCode, "succeeded");

    const ind = await cc.getLowProfileIndicator(session.lowProfileCode);
    expect(isSuccessfulCapture(ind, "pay-1", 35000)).toEqual({ ok: true });
  });

  it("CreateTokenOnly mock returns a token on success", async () => {
    const cc = buildMockCardComProvider();
    const session = await cc.createSession({
      paymentId: "pay-2",
      bookingId: "book-2",
      amountAgorot: 0,
      role: "card_verification",
      productName: "Booking card verification",
      customer: { name: "Test", phone: "0521234567" },
      urls: {
        success: "s",
        error: "e",
        cancel: "c",
        indicator: "i",
      },
    });
    simulateCardcomDealCompletion(session.lowProfileCode, "succeeded");
    const ind = await cc.getLowProfileIndicator(session.lowProfileCode);
    expect(isSuccessfulTokenVerification(ind, "pay-2").ok).toBe(true);
    expect(ind.indicator.token).toMatch(/^MOCK-TOK-/);
  });

  it("revoke is idempotent and flips state", async () => {
    const cc = buildMockCardComProvider();
    const session = await cc.createSession({
      paymentId: "pay-3",
      bookingId: "book-3",
      amountAgorot: 10000,
      role: "capture",
      productName: "test",
      customer: { name: "T", phone: "0500000000" },
      urls: { success: "s", error: "e", cancel: "c", indicator: "i" },
    });
    await cc.revokeLowProfileDeal(session.lowProfileCode);
    const ind = await cc.getLowProfileIndicator(session.lowProfileCode);
    expect(ind.indicator.isRevoked).toBe(true);
    // Second revoke returns success, no throw.
    await expect(
      cc.revokeLowProfileDeal(session.lowProfileCode)
    ).resolves.toEqual({ revoked: true });
  });

  it("chargeToken requires a valid MOCK token", async () => {
    const cc = buildMockCardComProvider();
    await expect(
      cc.chargeToken({
        paymentId: "pay-x",
        token: "not-a-mock-token",
        amountAgorot: 5000,
        productName: "Penalty",
      })
    ).rejects.toThrow(/unknown token/);

    // Create a verification session, extract token, charge it.
    const session = await cc.createSession({
      paymentId: "pay-4",
      bookingId: "book-4",
      amountAgorot: 0,
      role: "card_verification",
      productName: "verify",
      customer: { name: "T", phone: "0500000000" },
      urls: { success: "s", error: "e", cancel: "c", indicator: "i" },
    });
    simulateCardcomDealCompletion(session.lowProfileCode, "succeeded");
    const ind = await cc.getLowProfileIndicator(session.lowProfileCode);
    const token = ind.indicator.token!;
    const charged = await cc.chargeToken({
      paymentId: "penalty-1",
      token,
      amountAgorot: 5000,
      productName: "Cancellation fee",
    });
    expect(charged.internalDealNumber).toBeGreaterThan(0);
    expect(charged.approvalNumber).toBeTypeOf("string");
  });
});
