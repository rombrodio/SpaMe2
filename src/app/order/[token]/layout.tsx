import type { Metadata } from "next";
import { he } from "@/lib/i18n/he";
import { getPaymentsMockState } from "@/lib/payments/providers";

export const metadata: Metadata = {
  title: `${he.order.pageTitle} | ${he.meta.appName}`,
};

/**
 * Customer-facing order layout.
 *
 * Phase 7a transitional: keeps `dir="rtl"` + `lang="he"` hardcoded —
 * the page contents still import Hebrew strings from `src/lib/i18n/he.ts`.
 * Phase 7b migration drops these and lets the root layout's dynamic
 * attributes drive direction from the active locale.
 *
 * Phase 4.6: renders a global TEST MODE strip at the top when any
 * payment provider is mocked — covers /order/[token], /return, and
 * /success so testers never lose the signal mid-flow.
 */
export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mock = getPaymentsMockState();
  return (
    <div dir="rtl" lang="he" className="min-h-screen bg-stone-50 text-stone-900">
      {mock.any && (
        <div className="w-full bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
          TEST MODE · כל התשלומים במצב בדיקה. כל מספר כרטיס / ברקוד יאשר
          את ההזמנה אוטומטית.
        </div>
      )}
      <main className="mx-auto max-w-xl px-4 py-8">{children}</main>
    </div>
  );
}
