import type { Metadata } from "next";
import { he } from "@/lib/i18n/he";

export const metadata: Metadata = {
  title: `${he.book.pageTitle} | ${he.meta.appName}`,
  description: he.book.stepService.subheading,
};

/**
 * Hebrew RTL layout scoped to /book/**. Admin and therapist portals stay
 * LTR/English via the root layout in src/app/layout.tsx.
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
