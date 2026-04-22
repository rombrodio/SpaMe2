"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  getVoucherMappings,
  upsertVoucherMapping,
  deleteVoucherMapping,
  type VoucherMappingRow,
} from "@/lib/actions/voucher-mappings";

interface Props {
  serviceId: string;
}

/**
 * Admin-only section on the service-edit page that lets staff map
 * a service to one-or-more DTS or VPay SKUs (FullBarCode values).
 *
 * Phase-4 scope: CRUD only. The scheduling engine doesn't yet consult
 * these mappings — voucher forms accept any SKU that appears on the
 * customer's card. A future follow-up can use these rows to validate
 * that a redeemed voucher matches the expected service.
 */
export function VoucherMappingsSection({ serviceId }: Props) {
  const [rows, setRows] = useState<VoucherMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState<"dts" | "vpay">("dts");
  const [sku, setSku] = useState("");

  useEffect(() => {
    getVoucherMappings(serviceId)
      .then(setRows)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [serviceId]);

  function reload() {
    setError(null);
    getVoucherMappings(serviceId)
      .then(setRows)
      .catch((e) => setError((e as Error).message));
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = sku.trim();
    if (!trimmed) {
      setError("SKU is required");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("service_id", serviceId);
    fd.set("provider", provider);
    fd.set("provider_sku", trimmed);
    start(async () => {
      const result = await upsertVoucherMapping(fd);
      if ("error" in result && result.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean)[0] ??
          "Failed to add mapping";
        setError(msg);
        return;
      }
      setSku("");
      reload();
    });
  }

  function handleDelete(row: VoucherMappingRow) {
    setError(null);
    if (
      !window.confirm(
        `Remove mapping ${row.provider.toUpperCase()} / ${row.provider_sku}?`
      )
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("service_id", row.service_id);
    fd.set("provider", row.provider);
    fd.set("provider_sku", row.provider_sku);
    start(async () => {
      const result = await deleteVoucherMapping(fd);
      if ("error" in result && result.error) {
        const msg =
          Object.values(result.error).flat().filter(Boolean)[0] ??
          "Failed to remove mapping";
        setError(msg);
        return;
      }
      reload();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher SKU Mappings</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Map this service to one or more voucher SKUs so providers (DTS
          benefit vouchers, VPay stored-value cards) know this service
          can be redeemed under those codes. Not required for credit-card
          payments.
        </p>

        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
            No mappings configured. Customers can still redeem any voucher
            on the booking; mappings only gate which SKUs the engine
            considers canonical for this service.
          </p>
        ) : (
          <ul className="mb-4 divide-y divide-gray-200 rounded-md border border-gray-200">
            {rows.map((row) => (
              <li
                key={`${row.provider}-${row.provider_sku}`}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div>
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 font-mono text-xs uppercase">
                    {row.provider}
                  </span>
                  <span className="ml-2 font-mono">{row.provider_sku}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(row)}
                  disabled={pending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[9rem_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="vm_provider">Provider</Label>
            <Select
              id="vm_provider"
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as "dts" | "vpay")
              }
            >
              <option value="dts">DTS</option>
              <option value="vpay">VPay</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="vm_sku">SKU / FullBarCode</Label>
            <Input
              id="vm_sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="DTS-SWEDISH-60 or VPay SKU"
              maxLength={64}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? "…" : "Add"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
