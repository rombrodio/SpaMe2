import Link from "next/link";
import { getCustomers } from "@/lib/actions/customers";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RowLink } from "@/components/admin/row-link";
import { ListSearchBar } from "@/components/admin/list-search-bar";
import { Pager } from "@/components/admin/bookings/pager";

const PAGE_SIZE = 25;

/**
 * DEF-020: normalise names for display without mutating stored data.
 * Title-cases each whitespace-separated token.
 */
function toDisplayName(raw: string | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .split(/\s+/)
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

interface SearchParams {
  q?: string;
  page?: string;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows: customers, total } = await getCustomers({
    q: sp.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link href="/admin/customers/new" className={cn(buttonVariants())}>
          New Customer
        </Link>
      </div>

      <div className="mt-6">
        <ListSearchBar
          basePath="/admin/customers"
          placeholder="Name, phone, or email…"
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            {total === 0 ? "No customers match" : `${total} customers`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {sp.q
                ? "No customers match this search."
                : "No customers yet. Create one to get started."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Phone</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <RowLink
                      key={customer.id}
                      href={`/admin/customers/${customer.id}`}
                    >
                      <td className="py-3">
                        {toDisplayName(customer.full_name) || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3">{customer.phone}</td>
                      <td className="py-3">
                        {customer.email || (
                          <Link
                            href={`/admin/customers/${customer.id}`}
                            className="text-xs text-primary underline-offset-2 hover:underline"
                          >
                            + Add email
                          </Link>
                        )}
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
            basePath="/admin/customers"
          />
        </CardContent>
      </Card>
    </div>
  );
}
