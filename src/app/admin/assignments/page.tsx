import { getAssignmentScreenData } from "@/lib/actions/assignments";
import { AssignmentList } from "@/components/admin/assignments/assignment-list";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    date?: string;
    scope?: "all" | "date";
    bookingId?: string;
  }>;
}

/**
 * Default landing view shows every future unassigned booking so
 * managers see the full pending queue at a glance. A date filter can
 * narrow to one day.
 */
export default async function AssignmentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const scope = sp.scope === "date" ? "date" : "all";
  const data = await getAssignmentScreenData({
    scope,
    date: scope === "date" ? sp.date ?? null : null,
  });

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
          initialScope={data.scope}
          initialDate={data.date}
          initialData={data.bookings}
          highlightBookingId={sp.bookingId}
        />
      </div>
    </div>
  );
}
