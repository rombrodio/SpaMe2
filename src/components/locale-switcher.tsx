"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/lib/actions/locale";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

interface LocaleSwitcherProps {
  /** Narrow visual variant for dense sidebars. */
  size?: "default" | "compact";
  className?: string;
}

/**
 * Locale switcher — a plain HTML `<select>` wrapped with a globe icon.
 * Intentionally simple so it renders well inside admin / reception
 * sidebars and the customer `/book` header alike.
 *
 * On change:
 *   1. Fires setLocaleAction (writes cookie + profiles.language).
 *   2. router.refresh() to force the server-side layout to re-pick the
 *      locale from the fresh cookie, so the new messages render
 *      without a hard reload.
 */
export function LocaleSwitcher({
  size = "default",
  className,
}: LocaleSwitcherProps) {
  const current = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await setLocaleAction(next);
      if ("success" in result) {
        router.refresh();
      }
    });
  }

  const isCompact = size === "compact";

  return (
    <label
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-input bg-background text-sm",
        isCompact ? "px-2 py-1" : "px-2.5 py-1.5",
        pending && "opacity-60",
        className
      )}
    >
      <Globe className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <select
        aria-label="Language"
        value={current}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        className="bg-transparent outline-none"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeLabels[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
