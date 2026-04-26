import { getTranslations } from "next-intl/server";
import { getAvailabilityRules } from "@/lib/actions/therapists";
import { getCurrentTherapistId } from "@/lib/auth/current-therapist";
import { AvailabilitySection } from "@/components/admin/therapist/availability-section";

export default async function TherapistAvailabilityPage() {
  const therapistId = await getCurrentTherapistId();
  const rules = await getAvailabilityRules(therapistId);
  const t = await getTranslations("therapist.availability");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subheading")}</p>
      </div>

      <AvailabilitySection therapistId={therapistId} rules={rules} />
    </div>
  );
}
