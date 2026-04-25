import Link from "next/link";
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
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows: receptionists, total } = await getReceptionists({
    q: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receptionists</h1>
        <Link href="/admin/receptionists/new" className={cn(buttonVariants())}>
          New Receptionist
        </Link>
      </div>

      <ListSearchBar
        basePath="/admin/receptionists"
        placeholder="Name, phone, or email…"
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {total === 0 ? "No receptionists match" : `${total} receptionists`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {receptionists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {sp.q
                ? "No receptionists match this search."
                : "No receptionists yet. Create one to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Status</th>
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
                          {r.is_active ? "Active" : "Inactive"}
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
