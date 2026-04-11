import { getTimeOffs } from "@/lib/actions/therapists";
import { getCurrentTherapistId } from "@/lib/auth/current-therapist";
import { TimeOffSection } from "@/components/admin/therapist/time-off-section";

export default async function TherapistTimeOffPage() {
  const therapistId = await getCurrentTherapistId();
  const timeOffs = await getTimeOffs(therapistId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Time Off</h1>
        <p className="mt-1 text-muted-foreground">
          Add days or hours you&apos;re unavailable.
        </p>
      </div>

      <TimeOffSection therapistId={therapistId} timeOffs={timeOffs} />
    </div>
  );
}
