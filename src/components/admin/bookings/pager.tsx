"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
}

/** Renders a simple prev/next pager preserving every other search param. */
export function Pager({ page, pageSize, total }: PagerProps) {
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(nextPage: number) {
    const params = new URLSearchParams(sp.toString());
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/bookings?${qs}` : "/admin/bookings";
  }

  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div className="flex items-center justify-between pt-3 text-sm">
      <p className="text-muted-foreground">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <Link
          href={hrefFor(prevPage)}
          aria-disabled={isFirst}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            isFirst && "pointer-events-none opacity-50"
          )}
        >
          Previous
        </Link>
        <Link
          href={hrefFor(nextPage)}
          aria-disabled={isLast}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            isLast && "pointer-events-none opacity-50"
          )}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
