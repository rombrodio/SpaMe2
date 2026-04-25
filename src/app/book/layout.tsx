import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: `${t("customer.book.pageTitle")} | ${t("common.appName")}`,
    description: t("customer.book.stepService.subheading"),
  };
}

/**
 * Customer-facing booking layout. Direction + lang are set dynamically
 * on `<html>` by the root layout based on the active locale — this
 * wrapper stays locale-agnostic so the same file renders HE / EN / RU.
 */
export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
