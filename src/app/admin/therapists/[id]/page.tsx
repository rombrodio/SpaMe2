import { notFound } from "next/navigation";
import {
  getTherapist,
  getTherapistServices,
  getAvailabilityRules,
  getTimeOffs,
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

  const [therapistServices, allServices, rules, timeOffs] = await Promise.all([
    getTherapistServices(id),
    getServices(),
    getAvailabilityRules(id),
    getTimeOffs(id),
  ]);

  const assignedServiceIds = therapistServices.map(
    (ts: any) => ts.service_id as string
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">{therapist.full_name}</h1>

      <TherapistEditForm therapist={therapist} />

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
