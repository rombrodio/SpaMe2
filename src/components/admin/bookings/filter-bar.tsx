"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  therapists: Array<{ id: string; full_name: string }>;
}

/**
 * URL-driven filter bar for /admin/bookings. Writing to the query string
 * ensures the filters survive reloads and can be shared via URL.
 */
export function BookingsFilterBar({ therapists }: FilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();

  // Local state so the search box is responsive while the user types.
  const [q, setQ] = useState(sp.get("q") ?? "");

  const apply = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      // Reset pagination whenever filters change.
      if (!("page" in updates)) params.delete("page");
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/admin/bookings?${qs}` : "/admin/bookings");
      });
    },
    [router, sp]
  );

  const clear = () => {
    setQ("");
    startTransition(() => router.replace("/admin/bookings"));
  };

  const hasFilters = useMemo(
    () =>
      ["q", "status", "therapist_id", "from", "to"].some((k) => sp.get(k)),
    [sp]
  );

  return (
    <div className="space-y-3 rounded-md border p-3">
      <form
        className="grid gap-3 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <div className="md:col-span-2">
          <Label htmlFor="q">{t("admin.bookings.filters.searchCustomer")}</Label>
          <Input
            id="q"
            placeholder={t("admin.bookings.filters.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="status">{t("admin.bookings.filters.status")}</Label>
          <Select
            id="status"
            value={sp.get("status") ?? ""}
            onChange={(e) => apply({ status: e.target.value || null })}
          >
            <option value="">{t("admin.bookings.filters.all")}</option>
            <option value="pending_payment">
              {t("admin.status.pending_payment")}
            </option>
            <option value="confirmed">{t("admin.status.confirmed")}</option>
            <option value="completed">{t("admin.status.completed")}</option>
            <option value="cancelled">{t("admin.status.cancelled")}</option>
            <option value="no_show">{t("admin.status.no_show")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="therapist_id">
            {t("admin.bookings.filters.therapist")}
          </Label>
          <Select
            id="therapist_id"
            value={sp.get("therapist_id") ?? ""}
            onChange={(e) => apply({ therapist_id: e.target.value || null })}
          >
            <option value="">{t("admin.bookings.filters.all")}</option>
            {therapists.map((th) => (
              <option key={th.id} value={th.id}>
                {th.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2 md:col-span-5">
          <div>
            <Label htmlFor="from">{t("admin.bookings.filters.from")}</Label>
            <Input
              id="from"
              type="date"
              value={sp.get("from") ?? ""}
              onChange={(e) => apply({ from: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="to">{t("admin.bookings.filters.to")}</Label>
            <Input
              id="to"
              type="date"
              value={sp.get("to") ?? ""}
              onChange={(e) => apply({ to: e.target.value || null })}
            />
          </div>
        </div>
        <div className="flex items-end gap-2 md:col-span-5">
          <Button type="submit" size="sm" disabled={isPending}>
            {t("admin.bookings.filters.apply")}
          </Button>
          {hasFilters && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clear}
              disabled={isPending}
            >
              {t("admin.bookings.filters.clear")}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
