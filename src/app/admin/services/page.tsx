import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getServices } from "@/lib/actions/services";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RowLink } from "@/components/admin/row-link";

export default async function ServicesListPage() {
  const [services, t] = await Promise.all([getServices(), getTranslations()]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.services.title")}</h1>
        <Link href="/admin/services/new" className={cn(buttonVariants())}>
          {t("admin.services.newButton")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.services.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("admin.services.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">
                      {t("admin.services.columns.name")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.services.columns.duration")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.services.columns.price")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.services.columns.status")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.services.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <RowLink
                      key={service.id}
                      href={`/admin/services/${service.id}`}
                    >
                      <td className="py-3">{service.name}</td>
                      <td className="py-3">
                        {t("admin.services.durationMin", {
                          minutes: service.duration_minutes,
                        })}
                      </td>
                      <td className="py-3">
                        ₪{(service.price_ils / 100).toFixed(2)}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={service.is_active ? "success" : "muted"}
                        >
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {service.is_active
                            ? t("admin.services.statuses.active")
                            : t("admin.services.statuses.inactive")}
                        </Badge>
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
