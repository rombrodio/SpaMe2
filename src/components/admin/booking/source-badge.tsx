"use client";

import { useTranslations } from "next-intl";
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
  const t = useTranslations();

  if (!source) {
    return <span className="text-muted-foreground">--</span>;
  }

  const config: Record<
    BookingSource,
    {
      labelKey: string;
      titleKey: string;
      variant: "default" | "secondary" | "success" | "muted" | "outline";
    }
  > = {
    customer_web: {
      labelKey: "admin.source.web",
      titleKey: "admin.source.webTitle",
      variant: "secondary",
    },
    admin_manual: {
      labelKey: "admin.source.admin",
      titleKey: "admin.source.adminTitle",
      variant: "muted",
    },
    receptionist_manual: {
      labelKey: "admin.source.reception",
      titleKey: "admin.source.receptionTitle",
      variant: "success",
    },
    chatbot: {
      labelKey: "admin.source.bot",
      titleKey: "admin.source.botTitle",
      variant: "outline",
    },
  };

  const c = config[source];
  return (
    <Badge variant={c.variant} title={t(c.titleKey)}>
      {t(c.labelKey)}
    </Badge>
  );
}
