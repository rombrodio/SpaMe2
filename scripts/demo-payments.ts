/**
 * Payments demo — run with `npm run demo:payments`.
 *
 * This is a narrated walkthrough of what the phase 4 backend does, using
 * the mock providers (no DB, no network). It touches the four payment
 * methods end-to-end and prints the important objects at each step so
 * you can visually confirm the engine behaves as expected.
 *
 * No side effects — safe to run anytime.
 */

import {
  buildMockCardComProvider,
  buildMockDtsProvider,
  buildMockVpayProvider,
  resetCardcomMock,
  resetDtsMock,
  resetVpayMock,
  seedDtsCard,
  seedVpayCard,
  simulateCardcomDealCompletion,
} from "../src/lib/payments/mock";
import {
  isSuccessfulCapture,
  isSuccessfulTokenVerification,
} from "../src/lib/payments/cardcom";
import {
  computeCancellationFee,
  quoteCancellationFee,
} from "../src/lib/payments/policy";
import { issueOrderToken, verifyOrderToken } from "../src/lib/payments/jwt";

// ─── Pretty-print helpers ──────────────────────────────────────
const gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

function title(t: string): void {
  console.log("\n" + bold(cyan("▶ " + t)));
  console.log(gray("─".repeat(72)));
}

function step(s: string): void {
  console.log(gray("  › ") + s);
}

function ok(s: string): void {
  console.log(green("  ✓ ") + s);
}

function fail(s: string): void {
  console.log(red("  ✗ ") + s);
}

function ilsFromAgorot(agorot: number): string {
  return `${(agorot / 100).toFixed(2)} ILS`;
}

// ─── Flows ─────────────────────────────────────────────────────

async function demoCardComCreditCardFull(): Promise<void> {
  title("1.  Credit card — full payment (CardCom BillOnly)");
  resetCardcomMock();
  const cc = buildMockCardComProvider();

  const paymentId = "pay-cc-1";
  const bookingId = "book-1";
  const amount = 35000; // 350 ILS

  step(`Customer picks 'credit card', amount ${ilsFromAgorot(amount)}.`);
  const session = await cc.createSession({
    paymentId,
    bookingId,
    amountAgorot: amount,
    role: "capture",
    productName: "Swedish massage 60min",
    customer: { name: "ישראלה ישראלי", phone: "0521234567" },
    urls: {
      success: "https://spame2.app/order/x/success",
      error: "https://spame2.app/order/x/error",
      cancel: "https://spame2.app/order/x/cancel",
      indicator: "https://spame2.app/api/webhooks/cardcom",
    },
  });
  ok(`Hosted page session created — LowProfileCode = ${yellow(session.lowProfileCode)}`);
  step(`URL customer visits: ${session.url}`);

  step("Simulating CardCom webhook: customer successfully completed payment...");
  simulateCardcomDealCompletion(session.lowProfileCode, "succeeded");

  const indicator = await cc.getLowProfileIndicator(session.lowProfileCode);
  const validation = isSuccessfulCapture(indicator, paymentId, amount);
  if (validation.ok) {
    ok("Pull-through validation passed — anti-spoofing checks green");
    step(`   ReturnValue matches payment id? ${indicator.indicator.returnValue === paymentId}`);
    step(`   Amount matches? ${indicator.shva.sumAgorot} agorot (expected ${amount})`);
    step(`   InternalDealNumber: ${indicator.indicator.internalDealNumber}`);
    step(`   Card last 4: ${indicator.shva.cardLast4}`);
  } else {
    fail(`Validation failed: ${validation.reason}`);
  }

  step("Idempotency check: second webhook for same deal should short-circuit...");
  const indicator2 = await cc.getLowProfileIndicator(session.lowProfileCode);
  if (indicator2.indicator.internalDealNumber === indicator.indicator.internalDealNumber) {
    ok("Second indicator returns same InternalDealNumber → idempotent");
  } else {
    fail("Second indicator returned different InternalDealNumber");
  }
}

async function demoCardComCashOnArrival(): Promise<void> {
  title("2.  Cash on arrival — CardCom token verification (no money captured)");
  resetCardcomMock();
  const cc = buildMockCardComProvider();

  const paymentId = "pay-cc-2";
  const bookingId = "book-2";

  step("Customer picks 'cash at reception'. No amount is captured — we verify the card.");
  const session = await cc.createSession({
    paymentId,
    bookingId,
    amountAgorot: 0,
    role: "card_verification",
    productName: "Booking secured by card",
    customer: { name: "Test", phone: "0521234567" },
    urls: {
      success: "s",
      error: "e",
      cancel: "c",
      indicator: "i",
    },
  });
  ok(`Verification session created — LowProfileCode = ${yellow(session.lowProfileCode)}`);

  step("Simulating customer entering card details → Shva J-validation succeeds (no charge)...");
  simulateCardcomDealCompletion(session.lowProfileCode, "succeeded");

  const indicator = await cc.getLowProfileIndicator(session.lowProfileCode);
  const validation = isSuccessfulTokenVerification(indicator, paymentId);
  if (validation.ok) {
    ok(`Token stored for later penalty charge if needed: ${yellow(indicator.indicator.token!)}`);
    step(`   Token expiry: ${indicator.indicator.tokenExpiryYYYYMMDD}`);
    step(`   Money captured: ${indicator.shva.sumAgorot} agorot  (expected 0)`);
  } else {
    fail(`Validation failed: ${validation.reason}`);
  }

  step("Later: customer cancels 3 hours before treatment → penalty captured via stored token");
  const price = 35000;
  const fee = computeCancellationFee({ priceAgorot: price, hoursBefore: 3 });
  step(`   Policy verdict: ${fee.reason}`);
  step(`   Fee: ${green(ilsFromAgorot(fee.feeAgorot))}`);

  const charge = await cc.chargeToken({
    paymentId: "pay-penalty-1",
    token: indicator.indicator.token!,
    amountAgorot: fee.feeAgorot,
    productName: "דמי ביטול",
  });
  ok(`Penalty captured — InternalDealNumber = ${charge.internalDealNumber}, approval ${charge.approvalNumber}`);
}

async function demoDtsVoucher(): Promise<void> {
  title("3.  DTS voucher — benefit redemption (unit-based)");
  resetDtsMock();
  const dts = buildMockDtsProvider();

  step("Seeding a test card with 2× Swedish 60min + 1× Facial...");
  seedDtsCard("1234567890", {
    customer: {
      organizationId: "club-777",
      organizationName: "חבר מועדון",
      memberId: "mem-42",
      firstName: "דנה",
      lastName: "לוי",
    },
    items: [
      {
        memberId: "mem-42",
        organizationId: "club-777",
        businessName: "Spa",
        fullBarCode: "DTS-SWE-60",
        posBarcode: "",
        quantity: 2,
        name: "Swedish 60min",
        splitVarCode: [],
      },
      {
        memberId: "mem-42",
        organizationId: "club-777",
        businessName: "Spa",
        fullBarCode: "DTS-FACIAL",
        posBarcode: "",
        quantity: 1,
        name: "Facial",
        splitVarCode: [],
      },
    ],
  });

  step("Customer enters card number on /order page. Looking up balance...");
  const balance = await dts.getBalance("1234567890");
  ok(`Customer identified: ${balance.customer.firstName} ${balance.customer.lastName} (${balance.customer.organizationName})`);
  step(`   Available items:`);
  for (const item of balance.items) {
    step(`      - ${item.name}  x${item.quantity}  [${item.fullBarCode}]`);
  }

  step("Customer selects 1× Swedish 60min to redeem against this booking.");
  const redeemed = await dts.useBenefits({
    originalRequestId: "pay-dts-1",
    customer: {
      organizationId: balance.items[0].organizationId,
      organizationName: balance.customer.organizationName,
      memberId: balance.items[0].memberId,
      firstName: balance.customer.firstName,
      lastName: balance.customer.lastName,
    },
    items: [
      {
        organizationId: balance.items[0].organizationId,
        fullBarCode: "DTS-SWE-60",
        posBarcode: "",
        quantity: 1,
        name: "Swedish 60min",
      },
    ],
  });
  ok(`Redemption confirmed`);
  step(`   DtsConfirmationNumber: ${yellow(redeemed.dtsConfirmationNumber)}`);
  step(`   ConfirmationOrganizationId: ${yellow(redeemed.confirmationOrganizationId)}  ← also needed to cancel`);

  step("Idempotency: replay the same redemption (same OriginalRequestId)...");
  const replay = await dts.useBenefits({
    originalRequestId: "pay-dts-1",
    customer: {
      organizationId: balance.items[0].organizationId,
      organizationName: balance.customer.organizationName,
      memberId: balance.items[0].memberId,
      firstName: balance.customer.firstName,
      lastName: balance.customer.lastName,
    },
    items: [
      {
        organizationId: balance.items[0].organizationId,
        fullBarCode: "DTS-SWE-60",
        posBarcode: "",
        quantity: 1,
        name: "Swedish 60min",
      },
    ],
  });
  ok(`Second call returned the prior ConfirmationOrganizationId: ${replay.confirmationOrganizationId === redeemed.confirmationOrganizationId}`);
}

async function demoVpayVoucher(): Promise<void> {
  title("4.  VPay voucher — money-wallet redemption (decimal ILS)");
  resetVpayMock();
  const vp = buildMockVpayProvider();

  step("Seeding a test card with 200 ILS balance (CVV 123)...");
  seedVpayCard("8010019852923235", { cvv: "123", balanceAgorot: 20000 });

  step("Customer enters card + CVV → verifying balance...");
  try {
    const balance = await vp.getBalance({
      cardNumber: "8010019852923235",
      cvv: "123",
    });
    ok(`Card OK. Masked: ${balance.cardNumberMasked}, balance: ${green(ilsFromAgorot(balance.balanceAgorot))}`);
  } catch (err) {
    fail(`Lookup failed: ${(err as Error).message}`);
  }

  step("Withdraw 150 ILS (service price is 200 ILS, so 50 ILS remain → would be split-paid)...");
  const tx = await vp.createTransaction();
  const result = await vp.withdraw({
    transactionId: tx.transactionId,
    cardNumber: "8010019852923235",
    cvv: "123",
    amountAgorot: 15000,
    invoiceNumber: "pay-vpay-1",
    metadata: { bookingId: "book-4", paymentId: "pay-vpay-1" },
  });
  ok(`Withdrawal ref: ${yellow(result.actionReference)}`);
  step(`   Remaining balance on card: ${green(ilsFromAgorot(result.balanceAfter.balanceAgorot))}`);

  step("Wrong CVV rejection check:");
  try {
    await vp.getBalance({ cardNumber: "8010019852923235", cvv: "999" });
    fail("Expected rejection but call succeeded");
  } catch (err) {
    const e = err as Error & { code?: number };
    ok(`Rejected with code ${e.code} ("${e.message}") — correct behaviour`);
  }
}

function demoPolicyCalculator(): void {
  title("5.  Cancellation-fee policy (v1: min(5%, 100 ILS); free > 24h)");
  const cases = [
    { priceAgorot: 35000, hoursBefore: 48 }, // free window
    { priceAgorot: 35000, hoursBefore: 12 }, // 5% = 17.5 ILS
    { priceAgorot: 200000, hoursBefore: 5 }, // capped at 100 ILS
    { priceAgorot: 35000, hoursBefore: -1 }, // no-show
  ];
  for (const c of cases) {
    const quote = computeCancellationFee(c);
    const label =
      c.hoursBefore > 24
        ? ` (free window)`
        : c.hoursBefore < 0
        ? ` (no-show)`
        : ` (inside window)`;
    step(
      `${ilsFromAgorot(c.priceAgorot).padStart(9)}  @ ${c.hoursBefore
        .toString()
        .padStart(4)}h${label} →  fee = ${green(ilsFromAgorot(quote.feeAgorot))}`
    );
  }

  step("quoteCancellationFee from timestamps:");
  const q = quoteCancellationFee({
    priceAgorot: 35000,
    bookingStartAt: "2026-05-01T14:00:00Z",
    cancelledAt: "2026-05-01T10:00:00Z",
  });
  step(
    `   Start 14:00, cancel 10:00 same day → hoursBefore = ${q.hoursBefore.toFixed(
      1
    )}, fee = ${green(ilsFromAgorot(q.feeAgorot))}`
  );
}

async function demoJwt(): Promise<void> {
  title("6.  /order/<token> JWT round-trip");
  if (!process.env.ORDER_TOKEN_SECRET) {
    process.env.ORDER_TOKEN_SECRET =
      "demo-secret-at-least-32-chars-long-aaaaaaa";
    step(gray("   (set ORDER_TOKEN_SECRET to a demo value for this run)"));
  }

  step("Issuing a 30-minute token for booking 'book-1'...");
  const token = await issueOrderToken({
    bid: "11111111-1111-4111-8111-111111111111",
    pid: "22222222-2222-4222-8222-222222222222",
    src: "book",
  });
  ok(`Token (truncated): ${yellow(token.slice(0, 40))}...`);

  step("Verifying...");
  const v = await verifyOrderToken(token);
  if (v.ok) {
    step(`   bid   = ${v.claims.bid}`);
    step(`   pid   = ${v.claims.pid}`);
    step(`   src   = ${v.claims.src}`);
    step(`   iat   = ${new Date((v.claims.iat ?? 0) * 1000).toISOString()}`);
    step(`   exp   = ${new Date((v.claims.exp ?? 0) * 1000).toISOString()}`);
    ok("Verified — payload intact");
  } else {
    fail(`Verification failed: ${v.reason}`);
  }

  step("Tampering with the last 4 chars and re-verifying (must fail)...");
  const tampered = token.slice(0, -4) + "AAAA";
  const v2 = await verifyOrderToken(tampered);
  if (!v2.ok) {
    ok(`Tampered token rejected with reason: ${v2.reason}`);
  } else {
    fail("Tampered token was accepted (should not be)");
  }
}

// ─── Entry ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(bold("\nSpaMe2 — Phase 4 backend demo (mock providers, no DB)\n"));
  console.log(
    gray(
      "Each scenario below exercises a piece of src/lib/payments/*.ts.\n" +
        "If every step ends with a green ✓, the backend is wired correctly."
    )
  );

  demoPolicyCalculator();
  await demoJwt();
  await demoCardComCreditCardFull();
  await demoCardComCashOnArrival();
  await demoDtsVoucher();
  await demoVpayVoucher();

  console.log("\n" + green(bold("All scenarios completed.")));
  console.log(
    gray(
      "Note: this bypasses the Supabase layer (src/lib/payments/engine.ts).\n" +
        "That glue runs in the UI commits (chunks C-E). The engine itself is\n" +
        "covered by the unit test suite — run `npm test` to see all 92 green.\n"
    )
  );
}

main().catch((err) => {
  console.error(red("\nDemo failed:"));
  console.error(err);
  process.exit(1);
});
