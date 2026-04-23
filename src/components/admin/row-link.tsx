"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

interface RowLinkProps {
  href: string;
  children: React.ReactNode;
  /**
   * When true (default), renders a trailing `Edit →` action button in the
   * last cell. Set false if the parent row already provides its own actions.
   */
  editButton?: boolean;
  className?: string;
}

/**
 * Full-row link for admin list tables (DEF-012).
 *
 * Renders a `<tr>` whose entire surface is clickable — clicking anywhere on
 * the row navigates to `href`. Keyboard focus + screen-reader users still
 * get the explicit `Edit` anchor at the end of the row. Prefetch is on so
 * Next.js primes the destination, which should avoid the occasional "first
 * click does nothing" regression we saw on ghost-variant `<Link>` cells.
 */
export function RowLink({
  href,
  children,
  editButton = true,
  className,
}: RowLinkProps) {
  const router = useRouter();

  // Pre-hint the route so the first click is instant.
  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  function handleRowClick(e: React.MouseEvent<HTMLTableRowElement>) {
    // Let clicks inside interactive children (buttons, selects, links)
    // bubble naturally — don't double-navigate.
    const target = e.target as HTMLElement;
    if (
      target.closest("a, button, input, select, textarea, [role='button']")
    ) {
      return;
    }
    router.push(href);
  }

  return (
    <tr
      onClick={handleRowClick}
      className={cn(
        "cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40",
        className
      )}
    >
      {children}
      {editButton && (
        <td className="py-3 text-right">
          <Link
            href={href}
            prefetch
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1"
            )}
          >
            Edit
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </td>
      )}
    </tr>
  );
}
