"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/**
 * DEF-029: breadcrumb trail above detail-page headings.
 *
 * The final crumb renders as plain text (current page), earlier crumbs
 * render as links. Renders nothing if called with ≤1 item.
 *
 * Labels themselves are passed in by the caller (usually already
 * translated or derived from DB data); only the `aria-label` is
 * localised here.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const t = useTranslations();
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label={t("admin.common.breadcrumb")}
      className={cn("text-sm text-muted-foreground", className)}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={idx} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-foreground hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-foreground" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
