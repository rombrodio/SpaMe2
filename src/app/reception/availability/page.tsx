import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getMyReceptionistId,
  getReceptionistAvailabilityRules,
} from "@/lib/actions/receptionists";
import { ReceptionistAvailabilitySection } from "@/components/admin/receptionist/availability-section";

export const dynamic = "force-dynamic";

export default async function MyAvailabilityPage() {
  const receptionistId = await getMyReceptionistId();

  if (!receptionistId) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold">On-duty hours</h1>
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Your profile isn&apos;t linked to a receptionist record yet. Ask
          an admin to run the invite flow for your email (or set{" "}
          <code className="rounded bg-amber-100 px-1">
            profiles.receptionist_id
          </code>
          ). Once linked, refresh this page.
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
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">My on-duty hours</h1>
      <p className="text-sm text-muted-foreground">
        The hours you&apos;re available to cover customer chat + phone.
        The AI conversation layer (Phase 8) will route inbound messages
        to whichever receptionist is on duty.
      </p>

      <ReceptionistAvailabilitySection
        receptionistId={receptionistId}
        rules={rules}
        title="My on-duty hours"
        helperText="Submit weekly recurring windows. Each window covers chat + phone together — V1 is one mode."
      />
    </div>
  );
}
