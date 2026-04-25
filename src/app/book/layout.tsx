import type { Metadata } from "next";
import { he } from "@/lib/i18n/he";

export const metadata: Metadata = {
  title: `${he.book.pageTitle} | ${he.meta.appName}`,
  description: he.book.stepService.subheading,
};

/**
 * Customer-facing booking layout.
 *
 * Phase 7a transitional: keeps `dir="rtl"` + `lang="he"` hardcoded
 * because the page contents still import Hebrew strings directly from
 * `src/lib/i18n/he.ts`. Once Phase 7b migrates the customer
 * components to `useTranslations()`, drop this wrapper's dir/lang
 * so the root layout's dynamic attributes take over per-locale.
 */
export default function BookLayout({
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
