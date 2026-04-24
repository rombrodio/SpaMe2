"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initiatePaymentAction,
  lookupVoucherBalanceAction,
  redeemDtsVoucherAction,
} from "@/lib/actions/payments";
import { he } from "@/lib/i18n/he";

interface DtsVoucherFormProps {
  token: string;
  bookingId: string;
  serviceName: string;
  /** Phase 4.6: when true, renders a TEST MODE banner + demo-card hint. */
  mockMode?: boolean;
}

interface DtsBalanceItem {
  organization_id: string;
  full_bar_code: string;
  pos_barcode: string;
  quantity: number;
  name: string;
  business_name?: string;
}

type Step = "card" | "items" | "redeeming" | "done";

/**
 * Two-step DTS redemption form:
 *   1. Customer enters voucher card number → lookupVoucherBalanceAction
 *      returns the items pre-loaded on the card.
 *   2. Customer picks one item → redeemDtsVoucherAction redeems it
 *      against the booking. On success, redirects to /success.
 *
 * For V1 we redeem exactly one unit. The action accepts an array, so a
 * future iteration can extend this to multi-pick.
 */
export function DtsVoucherForm(props: DtsVoucherFormProps) {
  return (
    <>
      {props.mockMode && (
        <div
          dir="rtl"
          className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <strong>TEST MODE</strong> · כל מספר ברקוד יאשר. לדוגמה:{" "}
          <span className="font-mono">1234567890</span>
        </div>
      )}
      <DtsVoucherFormInner {...props} />
    </>
  );
}

function DtsVoucherFormInner({
  token,
  bookingId,
  serviceName,
}: DtsVoucherFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("card");
  const [cardNumber, setCardNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<DtsBalanceItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  async function ensurePendingPayment(): Promise<boolean> {
    const result = await initiatePaymentAction({
      token,
      booking_id: bookingId,
      method: "voucher_dts",
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
    setBusy(true);
    try {
      const ok = await ensurePendingPayment();
      if (!ok) return;

      const result = await lookupVoucherBalanceAction({
        token,
        booking_id: bookingId,
        provider: "dts",
        card_number: cardNumber.trim(),
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

      const dataItems =
        (result.data as { items?: Array<DtsBalanceItem> }).items ?? [];
      // Mock + real provider return camelCased keys via DtsItem; the
      // action passes them through. Normalize defensively.
      const normalized = dataItems.map(normalizeItem);
      setItems(normalized);
      if (normalized.length === 0) {
        setError(he.order.voucherDts.noItems);
        return;
      }
      setSelectedKey(itemKey(normalized[0]));
      setStep("items");
    } finally {
      setBusy(false);
    }
  }

  async function handleRedeem() {
    if (!selectedKey) return;
    const item = items.find((i) => itemKey(i) === selectedKey);
    if (!item) return;

    setError(null);
    setBusy(true);
    setStep("redeeming");
    try {
      const result = await redeemDtsVoucherAction({
        token,
        booking_id: bookingId,
        card_number: cardNumber.trim(),
        items: [
          {
            organization_id: item.organization_id,
            full_bar_code: item.full_bar_code,
            pos_barcode: item.pos_barcode,
            quantity: 1,
            name: item.name,
          },
        ],
      });

      if ("error" in result && result.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean)[0] ??
          he.common.errorGeneric;
        setError(msg);
        setStep("items");
        return;
      }

      setStep("done");
      router.push(`/order/${token}/success`);
    } finally {
      setBusy(false);
    }
  }

  // ── Render ──────────────────────────────────────────────

  if (step === "card") {
    return (
      <section className="rounded-md border border-stone-200 bg-white p-4 space-y-3">
        <div>
          <Label htmlFor="dts_card">{he.order.voucherDts.cardNumberLabel}</Label>
          <Input
            id="dts_card"
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="1234567890"
            className="mt-1"
            autoFocus
          />
        </div>
        {error && <ErrorBanner message={error} />}
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleLookup}
          disabled={busy || cardNumber.length < 4}
        >
          {busy ? he.common.loading : he.order.voucherDts.lookupCta}
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-stone-200 bg-white p-4 space-y-3">
      <h3 className="text-base font-semibold">
        {he.order.voucherDts.pickItemsHeading}
      </h3>
      <div role="radiogroup" className="space-y-2">
        {items.map((item) => {
          const k = itemKey(item);
          const isSel = k === selectedKey;
          return (
            <label
              key={k}
              className={`block cursor-pointer rounded-md border px-3 py-3 text-sm ${
                isSel
                  ? "border-stone-900 bg-stone-900/5"
                  : "border-stone-200 bg-white hover:border-stone-400"
              }`}
            >
              <input
                type="radio"
                name="dts_item"
                value={k}
                checked={isSel}
                onChange={() => setSelectedKey(k)}
                className="sr-only"
              />
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-stone-500">
                    {item.full_bar_code}
                    {item.business_name ? ` · ${item.business_name}` : ""}
                  </div>
                </div>
                <div className="text-xs text-stone-600">
                  {he.order.voucherDts.qtyLabel}: {item.quantity}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {error && <ErrorBanner message={error} />}
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={handleRedeem}
        disabled={!selectedKey || busy || step === "redeeming"}
      >
        {busy || step === "redeeming"
          ? he.common.loading
          : he.order.voucherDts.redeemCta}
      </Button>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      {message}
    </div>
  );
}

function itemKey(i: DtsBalanceItem): string {
  return `${i.organization_id}::${i.full_bar_code}`;
}

/**
 * Normalize DtsItem (camelCase) → form-friendly snake_case shape.
 * The lookupVoucherBalanceAction returns `{ provider, customer, items }`
 * where items is DtsItem[]; here we accept either snake_case (form)
 * or camelCase (engine) so the form is robust to either path.
 */
function normalizeItem(raw: unknown): DtsBalanceItem {
  const r = raw as Record<string, unknown>;
  return {
    organization_id:
      (r.organization_id as string | undefined) ??
      (r.organizationId as string | undefined) ??
      "",
    full_bar_code:
      (r.full_bar_code as string | undefined) ??
      (r.fullBarCode as string | undefined) ??
      "",
    pos_barcode:
      (r.pos_barcode as string | undefined) ??
      (r.posBarcode as string | undefined) ??
      "",
    quantity: Number((r.quantity as number | string | undefined) ?? 0),
    name: (r.name as string | undefined) ?? "",
    business_name:
      (r.business_name as string | undefined) ??
      (r.businessName as string | undefined),
  };
}
