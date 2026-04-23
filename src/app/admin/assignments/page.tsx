import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";
import { getAssignmentScreenData } from "@/lib/actions/assignments";
import { AssignmentList } from "@/components/admin/assignments/assignment-list";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ date?: string; bookingId?: string }>;
}

/**
 * Default landing view: tomorrow in the spa's timezone. Using
 * formatInTimeZone here (not new Date().toISOString()) avoids UTC-midnight
 * rollover bugs when the server is in a different TZ than the spa.
 */
function defaultDate(): string {
  return formatInTimeZone(addDays(new Date(), 1), TZ, "yyyy-MM-dd");
}

export default async function AssignmentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const date = sp.date || defaultDate();
  const data = await getAssignmentScreenData({ date });

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Therapist Assignments</h1>
          <p className="mt-1 text-muted-foreground">
            Unassigned bookings — pick a therapist and we&apos;ll ping them
            to confirm.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <AssignmentList
          initialDate={date}
          initialData={data.bookings}
          highlightBookingId={sp.bookingId}
        />
      </div>
    </div>
  );
}
