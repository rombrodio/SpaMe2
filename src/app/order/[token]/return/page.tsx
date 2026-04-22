import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyOrderToken } from "@/lib/payments/jwt";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { he } from "@/lib/i18n/he";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ r?: string; pid?: string }>;
}

/**
 * Bridge page between CardCom's hosted-page redirect and our final
 * /success or /<token> error states.
 *
 * The webhook is the authoritative signal — when the iframe completes
 * CardCom POSTs /api/webhooks/cardcom (commit 20) which flips the
 * payment to 'success' / 'authorized' and the booking to 'confirmed'.
 * That POST may arrive a few hundred ms before or after this redirect
 * lands. We resolve via:
 *   1. If `r=cancel` → render the cancel state (customer chose to
 *      back out of the iframe).
 *   2. Else load the booking; if status='confirmed' → redirect to
 *      /success.
 *   3. Else show a "waiting for confirmation" state with a meta
 *      refresh that polls every 2s.
 *
 * No client-side JS needed — meta refresh is enough for V1 and works
 * in restrictive WebViews (in-app browsers, WhatsApp's, etc.).
 */
export default async function ReturnPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { r, pid } = await searchParams;

  const verified = await verifyOrderToken(token);
  if (!verified.ok) {
    return renderShell(
      he.order.holdExpired.heading,
      verified.reason === "expired"
        ? he.order.errors.tokenExpired
        : he.order.errors.tokenInvalid
    );
  }

  if (r === "cancel") {
    return renderShell(
      he.order.errors.paymentFailed,
      he.order.errors.paymentFailed,
      <Link
        href={`/order/${token}`}
        className={cn(buttonVariants({ variant: "default" }))}
      >
        {he.common.tryAgain}
      </Link>
    );
  }

  // Look up booking + (optionally) the specific payment row.
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, status")
    .eq("id", verified.claims.bid)
    .single();

  if (booking?.status === "confirmed" || booking?.status === "completed") {
    redirect(`/order/${token}/success`);
  }

  // If we have a specific payment id, peek at its current status to
  // distinguish "outright failure" from "still processing".
  if (pid) {
    const { data: payment } = await admin
      .from("payments")
      .select("status")
      .eq("id", pid)
      .maybeSingle();
    if (payment?.status === "failed") {
      return renderShell(
        he.order.errors.paymentFailed,
        he.order.errors.paymentFailed,
        <Link
          href={`/order/${token}`}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          {he.common.tryAgain}
        </Link>
      );
    }
    if (payment?.status === "success" || payment?.status === "authorized") {
      // Webhook already landed but the booking-status select above
      // was a millisecond ahead of the booking write. Either way,
      // route to the success page; it'll re-check.
      redirect(`/order/${token}/success`);
    }
  }

  // Still pending — meta refresh until status flips. Avoids needing a
  // client component just for polling.
  return renderShell(
    he.order.cardcom.waiting,
    he.order.cardcom.waiting,
    null,
    {
      autoRefreshSeconds: 2,
    }
  );
}

function renderShell(
  heading: string,
  body: string,
  cta?: React.ReactNode,
  opts?: { autoRefreshSeconds?: number }
) {
  return (
    <div className="space-y-6 text-center">
      <h1 className="text-2xl font-bold">{heading}</h1>
      <p className="text-stone-700">{body}</p>
      {cta && <div className="flex justify-center">{cta}</div>}
      {opts?.autoRefreshSeconds && (
        // Tiny inline script — no client component / hydration cost.
        // Reloads the page every N seconds until the server-side
        // status check redirects to /success or shows a final error.
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){location.reload()}, ${
              opts.autoRefreshSeconds * 1000
            });`,
          }}
        />
      )}
    </div>
  );
}
