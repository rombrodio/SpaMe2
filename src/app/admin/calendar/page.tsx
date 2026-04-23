import { CalendarShell } from "@/components/admin/calendar/calendar-shell";
import { getTherapists } from "@/lib/actions/therapists";
import type { CalendarTherapist } from "@/components/admin/calendar/types";

export default async function CalendarPage() {
  // Server-render the therapist list so the filter + resource view render
  // with the full set on first paint.
  const { rows } = await getTherapists({ limit: 200 });
  const therapists: CalendarTherapist[] = rows.map(
    (t: {
      id: string;
      full_name: string;
      color: string | null;
      is_active: boolean;
    }) => ({
      id: t.id,
      full_name: t.full_name,
      color: t.color,
      is_active: t.is_active,
    })
  );

  return <CalendarShell therapists={therapists} />;
}
