import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getTherapists } from "@/lib/actions/therapists";
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
import { ListSearchBar } from "@/components/admin/list-search-bar";
import { Pager } from "@/components/admin/bookings/pager";

const PAGE_SIZE = 25;

interface SearchParams {
  q?: string;
  page?: string;
}

export default async function TherapistsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows: therapists, total } = await getTherapists({
    q: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("admin.therapists.title")}</h1>
        <Link href="/admin/therapists/new" className={cn(buttonVariants())}>
          {t("admin.therapists.newButton")}
        </Link>
      </div>

      <ListSearchBar
        basePath="/admin/therapists"
        placeholder={t("admin.therapists.searchPlaceholder")}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {total === 0
              ? t("admin.therapists.countTitleZero")
              : t("admin.therapists.countTitleSome", { count: total })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {therapists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {sp.q
                ? t("admin.therapists.emptyForSearch")
                : t("admin.therapists.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">
                      {t("admin.therapists.columns.name")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.therapists.columns.phone")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.therapists.columns.color")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.therapists.columns.status")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.therapists.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {therapists.map((therapist) => (
                    <RowLink
                      key={therapist.id}
                      href={`/admin/therapists/${therapist.id}`}
                    >
                      <td className="py-3">{therapist.full_name}</td>
                      <td className="py-3">
                        {therapist.phone || (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        {therapist.color ? (
                          <span
                            className="inline-block h-5 w-5 rounded border"
                            style={{ backgroundColor: therapist.color }}
                            title={therapist.color}
                          />
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={therapist.is_active ? "success" : "muted"}
                        >
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {therapist.is_active
                            ? t("admin.therapists.statuses.active")
                            : t("admin.therapists.statuses.inactive")}
                        </Badge>
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/admin/therapists"
          />
        </CardContent>
      </Card>
    </div>
  );
}
