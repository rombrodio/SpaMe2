"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPaymentsForBooking,
  markCashReceivedAction,
  applyCancellationFeeAction,
} from "@/lib/actions/payments";

interface PaymentRow {
  id: string;
  booking_id: string;
  method: string;
  role: string;
  status: string;
  amount_ils: number;
  card_last4: string | null;
  provider: string;
  provider_tx_id: string | null;
  provider_internal_deal_id: string | null;
  provider_cancel_ref: string | null;
  invoice_number: string | null;
  card_token: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
}

interface Props {
  bookingId: string;
  bookingStatus: string;
  paymentMethod: string | null;
  cashDueAgorot: number;
  servicePriceAgorot: number;
}

export function PaymentPanel({
  bookingId,
  bookingStatus,
  paymentMethod,
  cashDueAgorot,
  servicePriceAgorot,
}: Props) {
  const t = useTranslations();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cashAmountIls, setCashAmountIls] = useState(
    (cashDueAgorot / 100).toFixed(2)
  );

  // Fetch on mount + after every mutation. Implementing the fetcher
  // as a useCallback + an internal cancellation ref keeps the effect
  // body a single expression (triggering reload()), which satisfies
  // React 19's stricter set-state-in-effect lint.
  const activeFetch = useRef<symbol | null>(null);
  const reload = useCallback(() => {
    const marker = Symbol("fetch");
    activeFetch.current = marker;
    setError(null);
    setLoading(true);
    getPaymentsForBooking(bookingId)
      .then((result) => {
        if (activeFetch.current !== marker) return;
        if ("error" in result && result.error) {
          const msg = Object.values(result.error).flat().filter(Boolean)[0];
          setError(msg ?? t("admin.bookings.payments.loadError"));
          return;
        }
        if ("data" in result) {
          setRows(((result.data as { rows: PaymentRow[] }).rows) ?? []);
        }
      })
      .finally(() => {
        if (activeFetch.current === marker) setLoading(false);
      });
  }, [bookingId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  function handleMarkCash(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const agorot = Math.round(Number(cashAmountIls) * 100);
    if (!Number.isFinite(agorot) || agorot < 0) {
      setError(t("admin.bookings.payments.invalidCashAmount"));
      return;
    }
    const fd = new FormData();
    fd.set("booking_id", bookingId);
    fd.set("amount_agorot", String(agorot));
    start(async () => {
      const result = await markCashReceivedAction(fd);
      if ("error" in result && result.error) {
        const msg = Object.values(result.error).flat().filter(Boolean)[0];
        setError(msg ?? t("admin.bookings.payments.markCashError"));
        return;
      }
      reload();
    });
  }

  function handleApplyFee() {
    setError(null);
    if (!window.confirm(t("admin.bookings.payments.feeConfirm"))) {
      return;
    }
    const fd = new FormData();
    fd.set("booking_id", bookingId);
    start(async () => {
      const result = await applyCancellationFeeAction(fd);
      if ("error" in result && result.error) {
        const msg = Object.values(result.error).flat().filter(Boolean)[0];
        setError(msg ?? t("admin.bookings.payments.applyFeeError"));
        return;
      }
      reload();
    });
  }

  const hasAuthorizedVerification = rows.some(
    (r) => r.role === "card_verification" && r.status === "authorized"
  );
  const hasPenaltyAlready = rows.some(
    (r) => r.role === "penalty_capture" && r.status === "success"
  );

  const canMarkCash =
    paymentMethod === "cash_at_reception" && bookingStatus === "confirmed";
  const canApplyFee =
    (bookingStatus === "cancelled" || bookingStatus === "no_show") &&
    hasAuthorizedVerification &&
    !hasPenaltyAlready;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("admin.bookings.payments.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">
            {t("admin.bookings.payments.loading")}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
            {t("admin.bookings.payments.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3">
                    {t("admin.bookings.payments.columns.methodRole")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin.bookings.payments.columns.status")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin.bookings.payments.columns.amount")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin.bookings.payments.columns.refs")}
                  </th>
                  <th className="py-2 pr-3">
                    {t("admin.bookings.payments.columns.created")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{r.method}</div>
                      <div className="text-xs text-gray-500">{r.role}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <PaymentStatusBadge status={r.status} />
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {t("admin.bookings.detail.ils", {
                        amount: (r.amount_ils / 100).toFixed(2),
                      })}
                      {r.card_last4 && (
                        <span className="block text-xs text-gray-500">
                          {t("admin.bookings.payments.cardLast4", {
                            last4: r.card_last4,
                          })}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                      {r.invoice_number && (
                        <div>
                          {t("admin.bookings.payments.invoicePrefix", {
                            number: r.invoice_number,
                          })}
                        </div>
                      )}
                      {r.provider_tx_id && (
                        <div>
                          {t("admin.bookings.payments.txPrefix", {
                            id: r.provider_tx_id.slice(0, 8),
                          })}
                        </div>
                      )}
                      {r.provider_internal_deal_id && (
                        <div>
                          {t("admin.bookings.payments.dealPrefix", {
                            id: r.provider_internal_deal_id,
                          })}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {formatDate(r.created_at)}
                      {r.paid_at && (
                        <div>
                          {t("admin.bookings.payments.paidPrefix", {
                            date: formatDate(r.paid_at),
                          })}
                        </div>
                      )}
                      {r.voided_at && (
                        <div>
                          {t("admin.bookings.payments.voidedPrefix", {
                            date: formatDate(r.voided_at),
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canMarkCash && (
          <form
            onSubmit={handleMarkCash}
            className="flex items-end gap-3 border-t border-gray-200 pt-4"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="cash_amount">
                {cashDueAgorot > 0
                  ? t("admin.bookings.payments.cashLabelDue")
                  : t("admin.bookings.payments.cashLabelNone")}
              </Label>
              <Input
                id="cash_amount"
                type="number"
                step="0.01"
                min="0"
                value={cashAmountIls}
                onChange={(e) => setCashAmountIls(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("admin.bookings.payments.cashHelp", {
                  price: (servicePriceAgorot / 100).toFixed(2),
                })}
              </p>
            </div>
            <Button type="submit" disabled={pending}>
              {pending
                ? t("admin.bookings.payments.saving")
                : t("admin.bookings.payments.cashSubmit")}
            </Button>
          </form>
        )}

        {canApplyFee && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div className="text-sm">
              <div className="font-medium">
                {t("admin.bookings.payments.feeTitle")}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.bookings.payments.feeHelp")}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={handleApplyFee}
              disabled={pending}
            >
              {pending
                ? t("admin.bookings.payments.charging")
                : t("admin.bookings.payments.feeSubmit")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  const cls =
    status === "success"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : status === "authorized"
      ? "border-indigo-300 bg-indigo-50 text-indigo-900"
      : status === "pending"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : status === "failed"
      ? "border-red-300 bg-red-50 text-red-900"
      : status === "refunded"
      ? "border-gray-300 bg-gray-50 text-gray-700"
      : "border-gray-300 bg-gray-50";

  // Localise the common statuses; unknown ones fall through to the
  // raw string so debugging is still possible.
  const key = `admin.paymentStatus.${status}`;
  const translated = t(key);
  const label = translated === key ? status : translated;

  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
