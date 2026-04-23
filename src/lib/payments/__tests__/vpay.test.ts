import { describe, it, expect, beforeEach } from "vitest";
import { signRequest } from "../vpay";
import {
  buildMockVpayProvider,
  resetVpayMock,
  seedVpayCard,
} from "../mock";

describe("HMAC signRequest", () => {
  const secret = "test-shared-secret-at-least-32-characters-aaaaa";

  it("produces deterministic signatures", () => {
    const ts = "2026-05-01T12:00:00.000Z";
    const sig1 = signRequest(secret, {
      timestamp: ts,
      method: "POST",
      path: "/v1/withdraw",
      body: '{"a":1}',
    });
    const sig2 = signRequest(secret, {
      timestamp: ts,
      method: "POST",
      path: "/v1/withdraw",
      body: '{"a":1}',
    });
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different body → different signature", () => {
    const ts = "2026-05-01T12:00:00.000Z";
    const a = signRequest(secret, {
      timestamp: ts,
      method: "POST",
      path: "/v1/withdraw",
      body: '{"a":1}',
    });
    const b = signRequest(secret, {
      timestamp: ts,
      method: "POST",
      path: "/v1/withdraw",
      body: '{"a":2}',
    });
    expect(a).not.toBe(b);
  });

  it("different timestamp → different signature (replay protection)", () => {
    const body = '{"a":1}';
    const a = signRequest(secret, {
      timestamp: "2026-05-01T12:00:00.000Z",
      method: "POST",
      path: "/v1/withdraw",
      body,
    });
    const b = signRequest(secret, {
      timestamp: "2026-05-01T12:00:01.000Z",
      method: "POST",
      path: "/v1/withdraw",
      body,
    });
    expect(a).not.toBe(b);
  });

  it("different path → different signature", () => {
    const a = signRequest(secret, {
      timestamp: "2026-05-01T12:00:00.000Z",
      method: "POST",
      path: "/v1/withdraw",
      body: "{}",
    });
    const b = signRequest(secret, {
      timestamp: "2026-05-01T12:00:00.000Z",
      method: "POST",
      path: "/v1/balance",
      body: "{}",
    });
    expect(a).not.toBe(b);
  });

  it("case-insensitive method canonicalization", () => {
    const a = signRequest(secret, {
      timestamp: "x",
      method: "post",
      path: "/p",
      body: "",
    });
    const b = signRequest(secret, {
      timestamp: "x",
      method: "POST",
      path: "/p",
      body: "",
    });
    expect(a).toBe(b);
  });
});

describe("Mock VPay provider", () => {
  const card = "8010019852923235";
  const cvv = "123";

  beforeEach(() => {
    resetVpayMock();
    seedVpayCard(card, { cvv, balanceAgorot: 20000 }); // 200 ILS
  });

  it("createTransaction returns an id", async () => {
    const vp = buildMockVpayProvider();
    const { transactionId } = await vp.createTransaction();
    expect(transactionId).toBeTypeOf("string");
    expect(transactionId.length).toBeGreaterThan(0);
  });

  it("getBalance returns seeded balance with masked card + account", async () => {
    const vp = buildMockVpayProvider();
    const bal = await vp.getBalance({ cardNumber: card, cvv });
    expect(bal.balanceAgorot).toBe(20000);
    expect(bal.cardNumberMasked).toMatch(/\*/);
    expect(bal.accounts).toHaveLength(1);
    expect(bal.accounts[0].currencyCode).toBe(376);
  });

  it("getBalance rejects wrong CVV (simulated error 402)", async () => {
    const vp = buildMockVpayProvider();
    await expect(
      vp.getBalance({ cardNumber: card, cvv: "000" })
    ).rejects.toMatchObject({ code: 402 });
  });

  it("getBalance rejects unknown card (simulated error 801)", async () => {
    const vp = buildMockVpayProvider();
    await expect(
      vp.getBalance({ cardNumber: "0000000000", cvv })
    ).rejects.toMatchObject({ code: 801 });
  });

  it("withdraw deducts and returns a reference", async () => {
    const vp = buildMockVpayProvider();
    const tx = await vp.createTransaction();
    const res = await vp.withdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      cvv,
      amountAgorot: 5000,
      invoiceNumber: "inv-1",
      metadata: { bookingId: "b1", paymentId: "p1" },
    });
    expect(res.actionReference).toBe("inv-1");
    expect(res.balanceAfter.balanceAgorot).toBe(15000);
  });

  it("withdraw is idempotent on same invoiceNumber (simulated 816)", async () => {
    const vp = buildMockVpayProvider();
    const tx = await vp.createTransaction();
    await vp.withdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      cvv,
      amountAgorot: 5000,
      invoiceNumber: "inv-dup",
      metadata: { bookingId: "b1", paymentId: "p1" },
    });
    const res2 = await vp.withdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      cvv,
      amountAgorot: 5000,
      invoiceNumber: "inv-dup",
      metadata: { bookingId: "b1", paymentId: "p1" },
    });
    expect(res2.balanceAfter.balanceAgorot).toBe(15000); // only deducted once
  });

  it("withdraw rejects when balance is too low (simulated 805)", async () => {
    const vp = buildMockVpayProvider();
    const tx = await vp.createTransaction();
    await expect(
      vp.withdraw({
        transactionId: tx.transactionId,
        cardNumber: card,
        cvv,
        amountAgorot: 99999,
        invoiceNumber: "inv-big",
        metadata: { bookingId: "b1", paymentId: "p1" },
      })
    ).rejects.toMatchObject({ code: 805 });
  });

  it("cancelWithdraw restores balance", async () => {
    const vp = buildMockVpayProvider();
    const tx = await vp.createTransaction();
    await vp.withdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      cvv,
      amountAgorot: 5000,
      invoiceNumber: "inv-c",
      metadata: { bookingId: "b1", paymentId: "p1" },
    });
    const res = await vp.cancelWithdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      withdrawReference: "inv-c",
      amountAgorot: 5000,
      invoiceNumber: "cancel-c",
      reason: "Compensation",
    });
    expect(res.balanceAfter.balanceAgorot).toBe(20000);
  });

  it("cancelWithdraw rejects when cancel > original (simulated 812)", async () => {
    const vp = buildMockVpayProvider();
    const tx = await vp.createTransaction();
    await vp.withdraw({
      transactionId: tx.transactionId,
      cardNumber: card,
      cvv,
      amountAgorot: 5000,
      invoiceNumber: "inv-over",
      metadata: { bookingId: "b1", paymentId: "p1" },
    });
    await expect(
      vp.cancelWithdraw({
        transactionId: tx.transactionId,
        cardNumber: card,
        withdrawReference: "inv-over",
        amountAgorot: 9999,
        invoiceNumber: "cancel-over",
        reason: "Other",
      })
    ).rejects.toMatchObject({ code: 812 });
  });
});
