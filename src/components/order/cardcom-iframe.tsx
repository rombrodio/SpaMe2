"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initiatePaymentAction,
  simulateCardcomWebhookAction,
} from "@/lib/actions/payments";
import { useTranslations, useLocale } from "next-intl";
import { formatIlsFromAgorot } from "@/lib/i18n/format";
import type { Locale } from "@/i18n/config";

interface CardComPaymentFormProps {
  token: string;
  bookingId: string;
  method: "credit_card_full" | "cash_at_reception";
  serviceName: string;
  priceAgorot: number;
  /** Phase 4.6: when true, render a first-party test form instead of
   *  the CardCom iframe. The test form accepts any 16-digit card and
   *  auto-confirms via the same server-action path the real webhook uses. */
  mockMode?: boolean;
}

type FormState = "idle" | "initiating" | "iframe" | "error";

/**
 * Kicks off a CardCom Low-Profile session when the customer confirms,
 * then renders the hosted page inside an iframe scoped to our Hebrew
 * RTL shell. The iframe itself is CardCom-branded and stays outside
 * our PCI scope. On submit inside the iframe, CardCom redirects the
 * top window to /order/[token]/return, which resolves via the webhook
 * pull-through in commit 19/20.
 */
export function CardComPaymentForm({
  token,
  bookingId,
  method,
  serviceName,
  priceAgorot,
  mockMode = false,
}: CardComPaymentFormProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [state, setState] = useState<FormState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVerification = method === "cash_at_reception";

  if (mockMode) {
    return (
      <MockCardComTestForm
        token={token}
        bookingId={bookingId}
        method={method}
        serviceName={serviceName}
        priceAgorot={priceAgorot}
      />
    );
  }

  async function start() {
    setState("initiating");
    setError(null);

    const result = await initiatePaymentAction({
      token,
      booking_id: bookingId,
      method,
      product_name: serviceName,
    });

    if ("error" in result && result.error) {
      const msg =
        Object.values(result.error).flat().filter(Boolean)[0] ??
        t("common.errorGeneric");
      setError(msg);
      setState("error");
      return;
    }
    if (!("data" in result)) {
      setError(t("common.errorGeneric"));
      setState("error");
      return;
    }

    const hostedPage = (result.data as { hostedPage?: { url: string } })
      .hostedPage;
    if (!hostedPage?.url) {
      setError(t("common.errorGeneric"));
      setState("error");
      return;
    }

    setUrl(hostedPage.url);
    setState("iframe");
  }

  if (state === "iframe" && url) {
    return (
      <section className="rounded-md border border-stone-200 bg-white p-3">
        <p className="mb-2 text-xs text-stone-600">
          {t("customer.order.cardcom.waiting")}
        </p>
        <div className="aspect-[3/5] w-full overflow-hidden rounded-md border border-stone-100">
          <iframe
            src={url}
            title="CardCom"
            // CardCom's page includes its own loading UX; we let it
            // render top-level scripts. Same-origin is false because
            // the page is on secure.cardcom.solutions.
            className="h-full w-full border-0"
            sandbox="allow-forms allow-same-origin allow-scripts allow-top-navigation allow-popups"
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <CtaSummary
        isVerification={isVerification}
        priceAgorot={priceAgorot}
      />

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={start}
        disabled={state === "initiating"}
      >
        {state === "initiating"
          ? t("common.loading")
          : isVerification
            ? t("customer.order.methodPicker.cashAtReception.title")
            : `${t("customer.book.stepContact.submitLabel")} ${formatIlsFromAgorot(priceAgorot, locale)}`}
      </Button>

      <p className="mt-3 text-xs text-stone-500">
        {t("customer.order.cardcom.loadingIframe")}
      </p>
    </section>
  );
}

// ============================================================
// Phase 4.6 — First-party test-mode form.
//
// Renders when PAYMENTS_CARDCOM_PROVIDER=mock. Shows cosmetic card-
// number / expiry / CVV inputs with no real validation; pressing
// "Pay" calls the same two server actions the real flow uses:
//   1. initiatePaymentAction → creates the payment row
//   2. simulateCardcomWebhookAction → flips status via confirmFromWebhook
// Then redirects to /order/<token>/success.
// ============================================================

function MockCardComTestForm({
  token,
  bookingId,
  method,
  serviceName,
  priceAgorot,
}: {
  token: string;
  bookingId: string;
  method: "credit_card_full" | "cash_at_reception";
  serviceName: string;
  priceAgorot: number;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [state, setState] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const isVerification = method === "cash_at_reception";
  const disabled =
    cardNumber.replace(/\D/g, "").length < 12 ||
    expiry.replace(/\D/g, "").length < 3 ||
    cvv.replace(/\D/g, "").length < 3 ||
    state === "submitting";

  async function submit() {
    setState("submitting");
    setError(null);

    const initResult = await initiatePaymentAction({
      token,
      booking_id: bookingId,
      method,
      product_name: serviceName,
    });
    if ("error" in initResult && initResult.error) {
      const msg =
        Object.values(initResult.error).flat().filter(Boolean)[0] ??
        t("common.errorGeneric");
      setError(msg);
      setState("error");
      return;
    }

    const simResult = await simulateCardcomWebhookAction({
      token,
      booking_id: bookingId,
      outcome: "succeeded",
    });
    if ("error" in simResult && simResult.error) {
      const msg =
        Object.values(simResult.error).flat().filter(Boolean)[0] ??
        t("common.errorGeneric");
      setError(msg);
      setState("error");
      return;
    }

    setState("done");
    // Small delay so the user sees the "Processing..." state before we
    // navigate. Feels like a real payment flow.
    await new Promise((r) => setTimeout(r, 600));
    window.location.href = `/order/${encodeURIComponent(token)}/success`;
  }

  return (
    <section
      dir="rtl"
      className="space-y-4 rounded-md border border-amber-300 bg-amber-50 p-4"
    >
      <div className="text-sm font-semibold text-amber-900">
        TEST MODE · כל מספר כרטיס יעבוד
      </div>
      <CtaSummary
        isVerification={isVerification}
        priceAgorot={priceAgorot}
      />

      <div className="space-y-3 rounded-md border border-stone-200 bg-white p-4">
        <div className="space-y-1">
          <Label htmlFor="mock-card-number">מספר כרטיס</Label>
          <Input
            id="mock-card-number"
            inputMode="numeric"
            autoComplete="off"
            maxLength={19}
            placeholder="4580 0000 0000 0000"
            value={cardNumber}
            onChange={(e) =>
              setCardNumber(
                e.target.value.replace(/\D/g, "").slice(0, 16)
              )
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mock-expiry">תוקף (MM/YY)</Label>
            <Input
              id="mock-expiry"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              placeholder="12/28"
              value={expiry}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                setExpiry(
                  digits.length > 2
                    ? `${digits.slice(0, 2)}/${digits.slice(2)}`
                    : digits
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mock-cvv">CVV</Label>
            <Input
              id="mock-cvv"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="123"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={disabled}
      >
        {state === "submitting"
          ? t("common.loading")
          : state === "done"
            ? t("customer.order.success.heading")
            : isVerification
              ? t("customer.order.methodPicker.cashAtReception.title")
              : `${t("customer.book.stepContact.submitLabel")} ${formatIlsFromAgorot(priceAgorot, locale)}`}
      </Button>
      <p className="text-xs text-stone-600">
        זהו מצב בדיקה — לא יחויב כסף אמיתי. כל מספר כרטיס בן 12 ספרות
        ומעלה, תוקף ו-CVV כלשהם יאשרו את ההזמנה.
      </p>
    </section>
  );
}

function CtaSummary({
  isVerification,
  priceAgorot,
}: {
  isVerification: boolean;
  priceAgorot: number;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (isVerification) {
    return (
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="font-semibold">
          {t("customer.order.methodPicker.cashAtReception.title")}
        </div>
        <p className="mt-1">
          {t("customer.order.methodPicker.cashAtReception.subtitle")}
        </p>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
      <span className="text-stone-700">
        {t("customer.book.stepService.priceLabel")}
      </span>
      <span className="text-base font-semibold">
        {formatIlsFromAgorot(priceAgorot, locale)}
      </span>
    </div>
  );
}
