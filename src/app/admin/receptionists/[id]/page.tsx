import { notFound } from "next/navigation";
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

  const [rules, authStatus] = await Promise.all([
    getReceptionistAvailabilityRules(id),
    getReceptionistAuthStatus(id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Receptionists", href: "/admin/receptionists" },
          { label: receptionist.full_name },
        ]}
      />
      <h1 className="text-2xl font-bold">{receptionist.full_name}</h1>

      <ReceptionistEditForm
        receptionist={receptionist}
        hasAuthUser={authStatus.hasAuthUser}
      />

      <ReceptionistAvailabilitySection
        receptionistId={id}
        rules={rules}
        title="On-duty Availability"
        helperText="Single on-duty window covers chat + phone coverage. Receptionist can manage their own from /reception/availability."
      />
    </div>
  );
}
