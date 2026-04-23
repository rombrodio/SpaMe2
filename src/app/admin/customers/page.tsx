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

/**
 * DEF-020: normalise names for display without mutating stored data.
 * Title-cases each whitespace-separated token. "donald trump" → "Donald Trump",
 * "MARY ANN" → "Mary Ann". Non-Latin scripts (e.g. Hebrew) round-trip
 * unchanged because `toUpperCase`/`toLowerCase` are idempotent on letters
 * without case.
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

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Link href="/admin/customers/new" className={cn(buttonVariants())}>New Customer</Link>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No customers yet. Create one to get started.
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
        </CardContent>
      </Card>
    </div>
  );
}
