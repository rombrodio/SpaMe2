import Link from "next/link";
import { getAuditLogs } from "@/lib/actions/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DiffView } from "@/components/admin/audit-log/diff-view";
import { formatInTimeZone } from "date-fns-tz";
import { TZ } from "@/lib/constants";

const ENTITY_TYPES = [
  "therapist",
  "room",
  "service",
  "customer",
  "booking",
  "payment",
];
const ACTIONS = ["create", "update", "delete", "status_change", "payment_webhook"];
const PAGE_SIZE = 50;

type SearchParams = {
  entity_type?: string;
  action?: string;
  page?: string;
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const entity_type = params.entity_type || undefined;
  const action = params.action || undefined;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const { rows: logs, total } = await getAuditLogs({
    entity_type,
    action,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function hrefFor(nextPage: number) {
    const q = new URLSearchParams();
    if (entity_type) q.set("entity_type", entity_type);
    if (action) q.set("action", action);
    if (nextPage > 1) q.set("page", String(nextPage));
    const qs = q.toString();
    return qs ? `/admin/audit-log?${qs}` : "/admin/audit-log";
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <p className="mt-1 text-muted-foreground">
        {total} total entries. Showing page {page} of {totalPages}.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div>
              <label
                htmlFor="entity_type"
                className="block text-xs font-medium text-muted-foreground"
              >
                Entity type
              </label>
              <select
                id="entity_type"
                name="entity_type"
                defaultValue={entity_type ?? ""}
                className="mt-1 flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="action"
                className="block text-xs font-medium text-muted-foreground"
              >
                Action
              </label>
              <select
                id="action"
                name="action"
                defaultValue={action ?? ""}
                className="mt-1 flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">All</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Apply
            </button>
            <a
              href="/admin/audit-log"
              className="h-9 rounded-md border border-border px-3 py-2 text-sm"
            >
              Clear
            </a>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            Entries {logs.length === 0 ? "(none on this page)" : `(${logs.length} of ${total})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit entries match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 font-medium">User</th>
                    <th className="pb-2 font-medium">Action</th>
                    <th className="pb-2 font-medium">Entity</th>
                    <th className="pb-2 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b align-top last:border-0"
                    >
                      <td className="py-3 whitespace-nowrap">
                        {formatInTimeZone(
                          new Date(row.created_at),
                          TZ,
                          "MMM d, yyyy HH:mm:ss"
                        )}
                      </td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {row.user_id
                          ? row.user_id.slice(0, 8)
                          : "system"}
                      </td>
                      <td className="py-3">{row.action}</td>
                      <td className="py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {row.entity_type}
                          </span>
                          {row.entityHref ? (
                            <Link
                              href={row.entityHref}
                              className="font-medium hover:underline"
                            >
                              {row.entityLabel ??
                                (row.entity_id
                                  ? row.entity_id.slice(0, 8)
                                  : "—")}
                            </Link>
                          ) : (
                            <span>
                              {row.entityLabel ??
                                (row.entity_id ? (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {row.entity_id.slice(0, 8)}
                                  </span>
                                ) : (
                                  "—"
                                ))}
                            </span>
                          )}
                          {row.entity_id && row.entityLabel && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {row.entity_id.slice(0, 8)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <DiffView before={row.old_data} after={row.new_data} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <p className="text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Link
                  href={hrefFor(Math.max(1, page - 1))}
                  aria-disabled={page <= 1}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page <= 1 && "pointer-events-none opacity-50"
                  )}
                >
                  Previous
                </Link>
                <Link
                  href={hrefFor(Math.min(totalPages, page + 1))}
                  aria-disabled={page >= totalPages}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    page >= totalPages && "pointer-events-none opacity-50"
                  )}
                >
                  Next
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
