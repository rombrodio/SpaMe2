import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getReceptionists } from "@/lib/actions/receptionists";
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

export default async function ReceptionistsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows: receptionists, total } = await getReceptionists({
    q: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {t("admin.receptionists.title")}
        </h1>
        <Link href="/admin/receptionists/new" className={cn(buttonVariants())}>
          {t("admin.receptionists.newButton")}
        </Link>
      </div>

      <ListSearchBar
        basePath="/admin/receptionists"
        placeholder={t("admin.receptionists.searchPlaceholder")}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {total === 0
              ? t("admin.receptionists.countTitleZero")
              : t("admin.receptionists.countTitleSome", { count: total })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receptionists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {sp.q
                ? t("admin.receptionists.emptyForSearch")
                : t("admin.receptionists.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">
                      {t("admin.receptionists.columns.name")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.receptionists.columns.phone")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.receptionists.columns.email")}
                    </th>
                    <th className="pb-2 font-medium">
                      {t("admin.receptionists.columns.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receptionists.map((r) => (
                    <RowLink
                      key={r.id}
                      href={`/admin/receptionists/${r.id}`}
                    >
                      <td className="py-3">{r.full_name}</td>
                      <td className="py-3">
                        {r.phone || (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        {r.email || (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="py-3">
                        <Badge variant={r.is_active ? "success" : "muted"}>
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {r.is_active
                            ? t("admin.receptionists.statuses.active")
                            : t("admin.receptionists.statuses.inactive")}
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
            basePath="/admin/receptionists"
          />
        </CardContent>
      </Card>
    </div>
  );
}
