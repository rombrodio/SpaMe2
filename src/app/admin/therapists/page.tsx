import Link from "next/link";
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
import { Avatar } from "@/components/ui/avatar";
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
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows: therapists, total } = await getTherapists({
    q: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Therapists</h1>
        <Link href="/admin/therapists/new" className={cn(buttonVariants())}>
          New Therapist
        </Link>
      </div>

      <ListSearchBar
        basePath="/admin/therapists"
        placeholder="Name, phone, or email…"
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {total === 0 ? "No therapists match" : `${total} therapists`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {therapists.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {sp.q
                ? "No therapists match this search."
                : "No therapists yet. Create one to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium"></th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Gender</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {therapists.map((therapist) => (
                    <RowLink
                      key={therapist.id}
                      href={`/admin/therapists/${therapist.id}`}
                    >
                      <td className="py-3 w-10">
                        <Avatar
                          name={therapist.full_name}
                          color={therapist.color}
                          size="md"
                        />
                      </td>
                      <td className="py-3 font-medium">
                        {therapist.full_name}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {therapist.phone || "--"}
                      </td>
                      <td className="py-3 capitalize text-muted-foreground">
                        {therapist.gender || "—"}
                      </td>
                      <td className="py-3">
                        <Badge
                          variant={therapist.is_active ? "success" : "muted"}
                        >
                          <span className="dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full" />
                          {therapist.is_active ? "Active" : "Inactive"}
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
