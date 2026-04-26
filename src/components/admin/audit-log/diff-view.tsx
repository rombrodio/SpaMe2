"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Scalar = string | number | boolean | null;
type JsonValue = Scalar | Scalar[] | Record<string, unknown>;

interface DiffViewProps {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * DEF-023: structural diff view for the audit log.
 *
 * Renders a row per key in the union of `before` + `after` keys:
 *   - keys present only in `after`  → "Added" (green)
 *   - keys present only in `before` → "Removed" (red)
 *   - keys whose value changed      → "Changed" (yellow, shows old → new)
 *   - keys that stayed the same     → hidden by default (toggle reveals them)
 *
 * Arrays/objects are stringified compactly so deep diffs still read
 * as one line per attribute.
 */
export function DiffView({ before, after }: DiffViewProps) {
  const t = useTranslations();
  const [showUnchanged, setShowUnchanged] = useState(false);

  if (!before && !after) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const keys = Array.from(
    new Set([
      ...Object.keys(before ?? {}),
      ...Object.keys(after ?? {}),
    ])
  ).sort();

  const entries = keys.map((key) => {
    const beforeVal = before?.[key];
    const afterVal = after?.[key];
    const hasBefore = before !== null && key in (before ?? {});
    const hasAfter = after !== null && key in (after ?? {});

    let kind: "added" | "removed" | "changed" | "same";
    if (!hasBefore && hasAfter) kind = "added";
    else if (hasBefore && !hasAfter) kind = "removed";
    else if (formatValue(beforeVal) !== formatValue(afterVal)) kind = "changed";
    else kind = "same";

    return { key, beforeVal, afterVal, kind };
  });

  const changedEntries = entries.filter((e) => e.kind !== "same");
  const sameEntries = entries.filter((e) => e.kind === "same");

  if (changedEntries.length === 0 && sameEntries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="space-y-1 text-xs">
      {changedEntries.length === 0 ? (
        <p className="text-muted-foreground">
          {t("admin.auditLog.diff.noneChanged")}
        </p>
      ) : (
        <dl className="grid grid-cols-[min-content_1fr] gap-x-2">
          {changedEntries.map((entry) => (
            <DiffRow key={entry.key} entry={entry} />
          ))}
        </dl>
      )}

      {sameEntries.length > 0 && (
        <button
          type="button"
          onClick={() => setShowUnchanged((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${showUnchanged ? "rotate-90" : ""}`}
          />
          {showUnchanged
            ? t("admin.auditLog.diff.hideUnchanged", {
                count: sameEntries.length,
              })
            : t("admin.auditLog.diff.showUnchanged", {
                count: sameEntries.length,
              })}
        </button>
      )}

      {showUnchanged && (
        <dl className="grid grid-cols-[min-content_1fr] gap-x-2 pt-1 opacity-60">
          {sameEntries.map((entry) => (
            <DiffRow key={entry.key} entry={entry} />
          ))}
        </dl>
      )}
    </div>
  );
}

interface DiffEntry {
  key: string;
  beforeVal: unknown;
  afterVal: unknown;
  kind: "added" | "removed" | "changed" | "same";
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  const { key, beforeVal, afterVal, kind } = entry;
  const badgeClass = {
    added: "bg-emerald-100 text-emerald-900",
    removed: "bg-red-100 text-red-900",
    changed: "bg-amber-100 text-amber-900",
    same: "bg-muted text-muted-foreground",
  }[kind];
  const badgeLabel = {
    added: "+",
    removed: "−",
    changed: "Δ",
    same: "=",
  }[kind];

  return (
    <>
      <dt className="flex items-start gap-1 whitespace-nowrap font-mono">
        <span
          className={`inline-block w-4 shrink-0 rounded text-center text-[10px] font-medium ${badgeClass}`}
          aria-label={kind}
        >
          {badgeLabel}
        </span>
        <span className="text-muted-foreground">{key}</span>
      </dt>
      <dd className="min-w-0 break-words">
        {kind === "added" && (
          <span className="font-mono text-emerald-700">
            {formatValue(afterVal)}
          </span>
        )}
        {kind === "removed" && (
          <span className="font-mono text-red-700 line-through">
            {formatValue(beforeVal)}
          </span>
        )}
        {kind === "changed" && (
          <span className="font-mono">
            <span className="text-red-700 line-through">
              {formatValue(beforeVal)}
            </span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="text-emerald-700">{formatValue(afterVal)}</span>
          </span>
        )}
        {kind === "same" && (
          <span className="font-mono text-muted-foreground">
            {formatValue(afterVal ?? beforeVal)}
          </span>
        )}
      </dd>
    </>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.length > 80 ? value.slice(0, 77) + "…" : value;
    return JSON.stringify(trimmed);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value as JsonValue);
    return json.length > 80 ? json.slice(0, 77) + "…" : json;
  } catch {
    return String(value);
  }
}
