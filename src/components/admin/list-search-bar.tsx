"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ListSearchBarProps {
  basePath: string;
  placeholder?: string;
  /** Parameter name in the URL. Defaults to "q". */
  paramName?: string;
}

/**
 * Reusable search box for admin list pages. URL is the source of truth:
 * submitting updates `?q=` and resets `?page=`. A client-side input keeps
 * the field responsive while typing.
 *
 * `placeholder` is an optional per-list override; when omitted the
 * default "Search…" is rendered via `admin.common.searchPlaceholder`.
 */
export function ListSearchBar({
  basePath,
  placeholder,
  paramName = "q",
}: ListSearchBarProps) {
  const router = useRouter();
  const t = useTranslations();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(paramName) ?? "");
  const [isPending, startTransition] = useTransition();

  function apply(next: string) {
    const params = new URLSearchParams(sp.toString());
    if (next.trim()) params.set(paramName, next.trim());
    else params.delete(paramName);
    params.delete("page");
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    });
  }

  function clear() {
    setValue("");
    apply("");
  }

  const active = (sp.get(paramName) ?? "").trim().length > 0;

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply(value);
      }}
    >
      <div className="flex-1 min-w-[12rem] space-y-1">
        <Label htmlFor={paramName} className="text-xs font-medium">
          {t("admin.common.searchLabel")}
        </Label>
        <Input
          id={paramName}
          placeholder={placeholder ?? t("admin.common.searchPlaceholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {t("admin.common.apply")}
      </Button>
      {active && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={clear}
        >
          {t("admin.common.clear")}
        </Button>
      )}
    </form>
  );
}
