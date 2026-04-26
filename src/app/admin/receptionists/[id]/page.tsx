import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getReceptionist,
  getReceptionistAvailabilityRules,
  getReceptionistAuthStatus,
} from "@/lib/actions/receptionists";
import { ReceptionistEditForm } from "@/components/admin/receptionist/edit-form";
import { ReceptionistAvailabilitySection } from "@/components/admin/receptionist/availability-section";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReceptionistDetailPage({ params }: Props) {
  const { id } = await params;

  let receptionist;
  try {
    receptionist = await getReceptionist(id);
  } catch {
    notFound();
  }

  const [rules, authStatus, t] = await Promise.all([
    getReceptionistAvailabilityRules(id),
    getReceptionistAuthStatus(id),
    getTranslations(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs
        items={[
          { label: t("admin.receptionists.crumb"), href: "/admin/receptionists" },
          { label: receptionist.full_name },
        ]}
      />
      <h1 className="text-2xl font-bold">{receptionist.full_name}</h1>

      <ReceptionistEditForm
        receptionist={receptionist}
        hasAuthUser={authStatus.hasAuthUser}
      />

      {/*
        Uses the section's defaults (reception.availabilitySection.*)
        for title + helper copy. Admin-specific overrides can land
        when the admin portal gets its Phase 7b translation PR.
       */}
      <ReceptionistAvailabilitySection
        receptionistId={id}
        rules={rules}
      />
    </div>
  );
}
