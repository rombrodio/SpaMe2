import { getAuditLogs } from "@/lib/actions/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entity_type?: string; action?: string }>;
}) {
  const params = await searchParams;
  const entity_type = params.entity_type || undefined;
  const action = params.action || undefined;

  const logs = await getAuditLogs({ entity_type, action, limit: 200 });

  return (
    <div>
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <p className="mt-1 text-muted-foreground">
        Most recent 200 entries. Use filters to narrow down.
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
            Entries {logs.length === 0 ? "(none)" : `(${logs.length})`}
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
                    <th className="pb-2 font-medium">Entity ID</th>
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
                      <td className="py-3">{row.entity_type}</td>
                      <td className="py-3 font-mono text-xs text-muted-foreground">
                        {row.entity_id ? row.entity_id.slice(0, 8) : "-"}
                      </td>
                      <td className="py-3">
                        {row.old_data || row.new_data ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                              View
                            </summary>
                            <pre className="mt-2 max-w-md overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
                              {JSON.stringify(
                                { old: row.old_data, new: row.new_data },
                                null,
                                2
                              )}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </td>
                    </tr>
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
