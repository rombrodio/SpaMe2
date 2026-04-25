import { Badge } from "@/components/ui/badge";

export type BookingSource =
  | "customer_web"
  | "admin_manual"
  | "receptionist_manual"
  | "chatbot";

/**
 * Renders a short badge indicating how a booking was created.
 * Used on the /admin/bookings list + the booking detail page.
 *
 * Keeping the copy short ("web" / "admin" / "reception" / "bot")
 * so it reads well in a dense table column.
 */
export function SourceBadge({ source }: { source: BookingSource | null }) {
  if (!source) {
    return <span className="text-muted-foreground">--</span>;
  }

  const config: Record<
    BookingSource,
    {
      label: string;
      variant: "default" | "secondary" | "success" | "muted" | "outline";
      title: string;
    }
  > = {
    customer_web: {
      label: "web",
      variant: "secondary",
      title: "Customer self-booking via /book",
    },
    admin_manual: {
      label: "admin",
      variant: "muted",
      title: "Created by a super admin",
    },
    receptionist_manual: {
      label: "reception",
      variant: "success",
      title: "Created by a receptionist",
    },
    chatbot: {
      label: "bot",
      variant: "outline",
      title: "Created by the AI conversational agent (Phase 8)",
    },
  };

  const c = config[source];
  return (
    <Badge variant={c.variant} title={c.title}>
      {c.label}
    </Badge>
  );
}
