"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
          setError(msg ?? "Failed to load payments");
          return;
        }
        if ("data" in result) {
          setRows(((result.data as { rows: PaymentRow[] }).rows) ?? []);
        }
      })
      .finally(() => {
        if (activeFetch.current === marker) setLoading(false);
      });
  }, [bookingId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  function handleMarkCash(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const agorot = Math.round(Number(cashAmountIls) * 100);
    if (!Number.isFinite(agorot) || agorot < 0) {
      setError("Invalid cash amount");
      return;
    }
    const fd = new FormData();
    fd.set("booking_id", bookingId);
    fd.set("amount_agorot", String(agorot));
    start(async () => {
      const result = await markCashReceivedAction(fd);
      if ("error" in result && result.error) {
        const msg = Object.values(result.error).flat().filter(Boolean)[0];
        setError(msg ?? "Failed to mark cash received");
        return;
      }
      reload();
    });
  }

  function handleApplyFee() {
    setError(null);
    if (!window.confirm("Charge cancellation fee on the stored card token?")) {
      return;
    }
    const fd = new FormData();
    fd.set("booking_id", bookingId);
    start(async () => {
      const result = await applyCancellationFeeAction(fd);
      if ("error" in result && result.error) {
        const msg = Object.values(result.error).flat().filter(Boolean)[0];
        setError(msg ?? "Failed to apply fee");
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
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
            No payment rows yet for this booking.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-3">Method / Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Amount</th>
                  <th className="py-2 pr-3">Refs</th>
                  <th className="py-2 pr-3">Created</th>
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
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      {(r.amount_ils / 100).toFixed(2)} ILS
                      {r.card_last4 && (
                        <span className="block text-xs text-gray-500">
                          card •••• {r.card_last4}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-gray-600">
                      {r.invoice_number && <div>inv: {r.invoice_number}</div>}
                      {r.provider_tx_id && (
                        <div>tx: {r.provider_tx_id.slice(0, 8)}…</div>
                      )}
                      {r.provider_internal_deal_id && (
                        <div>deal: {r.provider_internal_deal_id}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-600">
                      {formatDate(r.created_at)}
                      {r.paid_at && (
                        <div>paid: {formatDate(r.paid_at)}</div>
                      )}
                      {r.voided_at && (
                        <div>voided: {formatDate(r.voided_at)}</div>
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
                Mark cash received (ILS, {cashDueAgorot > 0 ? "due" : "none due"})
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
                Service price {(servicePriceAgorot / 100).toFixed(2)} ILS.
                Marking cash received will complete the booking.
              </p>
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Mark paid cash"}
            </Button>
          </form>
        )}

        {canApplyFee && (
          <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div className="text-sm">
              <div className="font-medium">Apply cancellation fee</div>
              <p className="text-xs text-muted-foreground">
                Charges the stored card token. Fee is computed from the
                v1 policy (min 5% or 100 ILS; free if cancelled &gt; 24h
                before start).
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              onClick={handleApplyFee}
              disabled={pending}
            >
              {pending ? "Charging…" : "Apply fee"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
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
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
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
