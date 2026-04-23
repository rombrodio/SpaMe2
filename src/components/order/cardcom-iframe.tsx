"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { initiatePaymentAction } from "@/lib/actions/payments";
import { he, formatIlsFromAgorot } from "@/lib/i18n/he";

interface CardComPaymentFormProps {
  token: string;
  bookingId: string;
  method: "credit_card_full" | "cash_at_reception";
  serviceName: string;
  priceAgorot: number;
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
}: CardComPaymentFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isVerification = method === "cash_at_reception";

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
        he.common.errorGeneric;
      setError(msg);
      setState("error");
      return;
    }
    if (!("data" in result)) {
      setError(he.common.errorGeneric);
      setState("error");
      return;
    }

    const hostedPage = (result.data as { hostedPage?: { url: string } })
      .hostedPage;
    if (!hostedPage?.url) {
      setError(he.common.errorGeneric);
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
          {he.order.cardcom.waiting}
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
          ? he.common.loading
          : isVerification
          ? he.order.methodPicker.cashAtReception.title
          : `${he.book.stepContact.submitLabel} ${formatIlsFromAgorot(priceAgorot)}`}
      </Button>

      <p className="mt-3 text-xs text-stone-500">
        {he.order.cardcom.loadingIframe}
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
  if (isVerification) {
    return (
      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="font-semibold">
          {he.order.methodPicker.cashAtReception.title}
        </div>
        <p className="mt-1">
          {he.order.methodPicker.cashAtReception.subtitle}
        </p>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
      <span className="text-stone-700">
        {he.book.stepService.priceLabel}
      </span>
      <span className="text-base font-semibold">
        {formatIlsFromAgorot(priceAgorot)}
      </span>
    </div>
  );
}
