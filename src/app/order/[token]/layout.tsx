import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getPaymentsMockState } from "@/lib/payments/providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: `${t("customer.order.pageTitle")} | ${t("common.appName")}`,
  };
}

/**
 * Customer-facing order layout. Direction + lang are set dynamically
 * on `<html>` by the root layout based on the active locale.
 *
 * Phase 4.6: renders a global TEST MODE strip at the top when any
 * payment provider is mocked — covers /order/[token], /return, and
 * /success so testers never lose the signal mid-flow.
 */
export default async function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mock = getPaymentsMockState();
  const t = await getTranslations("customer.order");
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {mock.any && (
        <div className="w-full bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          {t("testMode")}
        </div>
      )}
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
