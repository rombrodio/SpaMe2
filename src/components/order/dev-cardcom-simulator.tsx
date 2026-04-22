"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { simulateCardcomWebhookAction } from "@/lib/actions/payments";

interface Props {
  token: string;
  bookingId: string;
}

/**
 * Dev-only helper — rendered on /order/[token]/return when the mock
 * CardCom provider is active. Lets the developer fake the webhook
 * from CardCom by clicking a button, since the mock iframe URL
 * doesn't actually post anything back.
 *
 * In production this component is never rendered (the page file guards
 * with NODE_ENV + PAYMENTS_CARDCOM_PROVIDER checks before importing).
 */
export function DevCardcomSimulator({ token, bookingId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function fire(outcome: "succeeded" | "failed") {
    setError(null);
    start(async () => {
      const result = await simulateCardcomWebhookAction({
        token,
        booking_id: bookingId,
        outcome,
      });
      if ("error" in result && result.error) {
        const msg = Object.values(result.error).flat().filter(Boolean)[0];
        setError(msg ?? "Simulation failed");
        return;
      }
      // Refresh the server component; it'll redirect to /success when
      // the engine has flipped the booking to confirmed.
      router.refresh();
    });
  }

  return (
    <div className="mt-6 rounded-md border border-dashed border-amber-400 bg-amber-50 p-3 text-start text-xs text-amber-900">
      <div className="mb-2 font-semibold">
        Dev only — simulate CardCom webhook
      </div>
      <p className="mb-3 text-amber-800">
        The mock CardCom iframe doesn&apos;t POST back to our webhook.
        Use the buttons below to drive the flow forward locally.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => fire("succeeded")}
          disabled={pending}
        >
          {pending ? "..." : "Simulate success"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fire("failed")}
          disabled={pending}
        >
          Simulate failure
        </Button>
      </div>
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-900">
          {error}
        </div>
      )}
    </div>
  );
}
