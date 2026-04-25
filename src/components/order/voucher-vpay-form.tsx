"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initiatePaymentAction,
  lookupVoucherBalanceAction,
  redeemVpayVoucherAction,
} from "@/lib/actions/payments";
import { he, formatIlsFromAgorot } from "@/lib/i18n/he";

interface VpayVoucherFormProps {
  token: string;
  bookingId: string;
  serviceName: string;
  priceAgorot: number;
  /** Phase 4.6: when true, renders a TEST MODE banner + demo-card hint. */
  mockMode?: boolean;
}

type Step = "card" | "amount" | "redeeming";

/**
 * Two-step VPay redemption form:
 *   1. Customer enters card number + CVV → lookupVoucherBalance fetches
 *      the available balance.
 *   2. Customer confirms the amount to charge from the voucher (defaults
 *      to min(balance, servicePrice)). Partial-redemption note appears
 *      when the chosen amount is below the service price.
 */
export function VpayVoucherForm(props: VpayVoucherFormProps) {
  return (
    <>
      {props.mockMode && (
        <div
          dir="rtl"
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <strong>TEST MODE</strong> · כל מספר כרטיס וכל CVV יאשרו.
          לדוגמה: <span className="font-mono">8010019852923235</span> · CVV{" "}
          <span className="font-mono">123</span>
        </div>
      )}
      <VpayVoucherFormInner {...props} />
    </>
  );
}

function VpayVoucherFormInner({
  token,
  bookingId,
  serviceName,
  priceAgorot,
}: VpayVoucherFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardNumber, setCardNumber] = useState("");
  const [cvv, setCvv] = useState("");

  const [balanceAgorot, setBalanceAgorot] = useState(0);
  const [maskedCard, setMaskedCard] = useState("");
  const [amountIls, setAmountIls] = useState(""); // input is in ILS for human-friendly entry

  async function ensurePendingPayment(): Promise<boolean> {
    const result = await initiatePaymentAction({
      token,
      booking_id: bookingId,
      method: "voucher_vpay",
      product_name: serviceName,
    });
    if ("error" in result && result.error) {
      const msg =
        Object.values(result.error).flat().filter(Boolean)[0] ??
        he.common.errorGeneric;
      setError(msg);
      return false;
    }
    if (!("data" in result)) {
      setError(he.common.errorGeneric);
      return false;
    }
    return true;
  }

  async function handleLookup() {
    setError(null);
    if (cvv.length < 3) {
      setError(he.common.errorGeneric);
      return;
    }
    setBusy(true);
    try {
      const ok = await ensurePendingPayment();
      if (!ok) return;

      const result = await lookupVoucherBalanceAction({
        token,
        booking_id: bookingId,
        provider: "vpay",
        card_number: cardNumber.trim(),
        cvv,
      });

      if ("error" in result && result.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean)[0] ??
          he.common.errorGeneric;
        setError(msg);
        return;
      }
      if (!("data" in result)) {
        setError(he.common.errorGeneric);
        return;
      }

      const data = result.data as {
        cardNumberMasked?: string;
        balanceAgorot?: number;
      };
      const masked = data.cardNumberMasked ?? maskCard(cardNumber);
      const balance = data.balanceAgorot ?? 0;
      setMaskedCard(masked);
      setBalanceAgorot(balance);

      // Default the amount to min(balance, servicePrice).
      const defaultAgorot = Math.min(balance, priceAgorot);
      setAmountIls((defaultAgorot / 100).toFixed(2));
      setStep("amount");
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeem() {
    setError(null);
    const amountAgorot = Math.round(Number(amountIls) * 100);
    if (!Number.isFinite(amountAgorot) || amountAgorot <= 0) {
      setError(he.common.errorGeneric);
      return;
    }
    if (amountAgorot > balanceAgorot) {
      setError(he.common.errorGeneric);
      return;
    }

    setBusy(true);
    setStep("redeeming");
    try {
      const result = await redeemVpayVoucherAction({
        token,
        booking_id: bookingId,
        card_number: cardNumber.trim(),
        cvv,
        amount_agorot: amountAgorot,
      });

      if ("error" in result && result.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean)[0] ??
          he.common.errorGeneric;
        setError(msg);
        setStep("amount");
        return;
      }

      router.push(`/order/${token}/success`);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──

  if (step === "card") {
    return (
      <section className="rounded-md border border-stone-200 bg-white p-4 space-y-3">
        <div>
          <Label htmlFor="vpay_card">{he.order.voucherVpay.cardNumberLabel}</Label>
          <Input
            id="vpay_card"
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={cardNumber}
            onChange={(e) =>
              setCardNumber(e.target.value.replace(/\D/g, ""))
            }
            placeholder="8010019852923235"
            className="mt-1"
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="vpay_cvv">{he.order.voucherVpay.cvvLabel}</Label>
          <Input
            id="vpay_cvv"
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={cvv}
            onChange={(e) =>
              setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="123"
            className="mt-1"
            autoComplete="off"
          />
        </div>
        {error && <ErrorBanner message={error} />}
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleLookup}
          disabled={busy || cardNumber.length < 4 || cvv.length < 3}
        >
          {busy ? he.common.loading : he.order.voucherVpay.lookupCta}
        </Button>
      </section>
    );
  }

  // amount / redeeming
  const amountAgorotInput = Math.round(Number(amountIls) * 100);
  const isPartial =
    Number.isFinite(amountAgorotInput) && amountAgorotInput < priceAgorot;
  const remainingAgorot = priceAgorot - amountAgorotInput;

  return (
    <section className="rounded-md border border-stone-200 bg-white p-4 space-y-3">
      <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-stone-600">
            {he.order.voucherVpay.cardNumberLabel}
          </span>
          <span dir="ltr" className="font-medium">
            {maskedCard}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-stone-600">
            {he.order.voucherVpay.balanceLabel}
          </span>
          <span className="font-semibold">
            {formatIlsFromAgorot(balanceAgorot)}
          </span>
        </div>
      </div>

      <div>
        <Label htmlFor="vpay_amount">
          {he.order.voucherVpay.payAmountLabel}
        </Label>
        <Input
          id="vpay_amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          dir="ltr"
          value={amountIls}
          onChange={(e) => setAmountIls(e.target.value)}
          className="mt-1"
        />
      </div>

      {isPartial && remainingAgorot > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {he.order.voucherVpay.remainingNote(
            formatIlsFromAgorot(remainingAgorot)
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleRedeem}
        disabled={busy || step === "redeeming" || amountAgorotInput <= 0}
      >
        {busy || step === "redeeming"
          ? he.common.loading
          : he.order.voucherVpay.redeemCta}
      </Button>
    </section>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      {message}
    </div>
  );
}

function maskCard(raw: string): string {
  if (raw.length <= 4) return raw;
  return raw.slice(0, 4) + "*".repeat(Math.max(0, raw.length - 8)) + raw.slice(-4);
}
