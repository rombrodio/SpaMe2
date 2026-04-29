import { getTranslations } from "next-intl/server";
import { getServices } from "@/lib/actions/services";
import { TherapistCreateForm } from "@/components/admin/therapist/create-form";

export default async function NewTherapistPage() {
  const [services, t] = await Promise.all([
    getServices(),
    getTranslations(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("admin.therapists.new.title")}</h1>
      <TherapistCreateForm services={services} />
    </div>
  );
}
