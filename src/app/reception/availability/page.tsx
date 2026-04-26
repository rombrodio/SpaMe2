import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  getMyReceptionistId,
  getReceptionistAvailabilityRules,
} from "@/lib/actions/receptionists";
import { ReceptionistAvailabilitySection } from "@/components/admin/receptionist/availability-section";

export const dynamic = "force-dynamic";

export default async function MyAvailabilityPage() {
  const receptionistId = await getMyReceptionistId();
  const t = await getTranslations("reception.availability");
  const tCommon = await getTranslations("common");

  if (!receptionistId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">{t("notLinkedHeading")}</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {t.rich("notLinkedBody", {
            code: () => (
              <code className="rounded bg-amber-100 px-1">
                profiles.receptionist_id
              </code>
            ),
          })}
        </div>
      </div>
    );
  }

  const rules = await getReceptionistAvailabilityRules(receptionistId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/reception"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {tCommon("backToDashboard")}
      </Link>
      <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("subheading")}</p>

      <ReceptionistAvailabilitySection
        receptionistId={receptionistId}
        rules={rules}
        titleKey="reception.availability.sectionTitle"
        helperKey="reception.availability.sectionHelper"
      />
    </div>
  );
}
