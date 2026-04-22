import type { Metadata } from "next";
import { he } from "@/lib/i18n/he";

export const metadata: Metadata = {
  title: `${he.order.pageTitle} | ${he.meta.appName}`,
};

/**
 * Hebrew RTL layout scoped to /order/[token]/**. Matches the /book
 * layout so a customer walking through /book → /order feels
 * continuous.
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-stone-50 text-stone-900">
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
