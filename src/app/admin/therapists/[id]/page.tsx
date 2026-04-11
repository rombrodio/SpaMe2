import { notFound } from "next/navigation";
import {
  getTherapist,
  getTherapistServices,
  getAvailabilityRules,
  getTimeOffs,
  getTherapistAuthStatus,
} from "@/lib/actions/therapists";
import { getServices } from "@/lib/actions/services";
import { TherapistEditForm } from "@/components/admin/therapist/edit-form";
import { TherapistServicesSection } from "@/components/admin/therapist/services-section";
import { AvailabilitySection } from "@/components/admin/therapist/availability-section";
import { TimeOffSection } from "@/components/admin/therapist/time-off-section";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TherapistDetailPage({ params }: Props) {
  const { id } = await params;

  let therapist;
  try {
    therapist = await getTherapist(id);
  } catch {
    notFound();
  }

  const [therapistServices, allServices, rules, timeOffs, authStatus] =
    await Promise.all([
      getTherapistServices(id),
      getServices(),
      getAvailabilityRules(id),
      getTimeOffs(id),
      getTherapistAuthStatus(id),
    ]);

  const assignedServiceIds = (
    therapistServices as Array<{ service_id: string }>
  ).map((ts) => ts.service_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{therapist.full_name}</h1>

      <TherapistEditForm
        therapist={therapist}
        hasAuthUser={authStatus.hasAuthUser}
      />

      <TherapistServicesSection
        therapistId={id}
        allServices={allServices}
        assignedServiceIds={assignedServiceIds}
      />

      <AvailabilitySection therapistId={id} rules={rules} />

      <TimeOffSection therapistId={id} timeOffs={timeOffs} />
    </div>
  );
}
