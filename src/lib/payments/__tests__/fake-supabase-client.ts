/**
 * Minimal in-memory Supabase client stub used by the engine smoke tests.
 *
 * Covers only the subset of the client API that the payment engine
 * actually calls:
 *
 *   from(table).select(cols).eq(col, val).single()
 *   from(table).select(cols).eq(col, val).maybeSingle()
 *   from(table).select(cols).eq(col, val).in(col, vals).order(col, opts)
 *   from(table).select(cols).eq(col, val).eq(col, val).order(col, opts)
 *   from(table).insert(row).select("*").single()
 *   from(table).insert(row).select("id").single()
 *   from(table).update(patch).eq(col, val).select("*").single()
 *   from(table).update(patch).eq(col, val).is(col, null)
 *   from(table).update(patch).eq(col, val).eq(col, val)
 *   from(table).delete().eq(col, val).eq(col, val).eq(col, val)
 *
 * Deliberately not a general-purpose Supabase fake — scope is just
 * "what the engine needs for the happy paths in e2e.test.ts".
 */

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Table = "bookings" | "customers" | "services" | "payments" | "audit_logs";

interface JoinSpec {
  /** Column to expand, e.g. "customers(id, full_name)". */
  foreignTable: string;
  select: string[];
  /** Source column on the current row holding the FK. */
  fkColumn: string;
}

interface QueryState {
  table: Table;
  selectCols: string[];
  joins: JoinSpec[];
  filters: Array<(row: Row) => boolean>;
  limitN?: number;
  orderCol?: string;
  orderAsc?: boolean;
  expectSingle?: "single" | "maybe";
}

export class FakeSupabase {
  tables: Record<Table, Row[]> = {
    bookings: [],
    customers: [],
    services: [],
    payments: [],
    audit_logs: [],
  };

  seedBooking(row: Row): void {
    this.tables.bookings.push(withDefaults(row, bookingDefaults()));
  }
  seedCustomer(row: Row): void {
    this.tables.customers.push(withDefaults(row, customerDefaults()));
  }
  seedService(row: Row): void {
    this.tables.services.push(withDefaults(row, serviceDefaults()));
  }

  getRow(table: Table, id: string): Row | undefined {
    return this.tables[table].find((r) => r.id === id);
  }

  getRows(table: Table): Row[] {
    return this.tables[table];
  }

  /** Build a shape mimicking `@supabase/supabase-js`'s SupabaseClient. */
  client(): unknown {
    return {
      from: (table: string) => this.buildBuilder(table as Table),
    };
  }

  private buildBuilder(table: Table) {
    const state: QueryState = {
      table,
      selectCols: ["*"],
      joins: [],
      filters: [],
    };
    return createBuilder(this, state);
  }
}

function createBuilder(db: FakeSupabase, state: QueryState) {
  // The builder chain must be both awaitable (thenable) AND support
  // further chained calls. We return the same proxy-ish object from
  // every method with updated state.
  const self = {
    select(cols: string) {
      const parsed = parseSelect(cols);
      state.selectCols = parsed.flatCols;
      state.joins = parsed.joins;
      return self;
    },
    eq(col: string, val: unknown) {
      state.filters.push((row) => row[col] === val);
      return self;
    },
    neq(col: string, val: unknown) {
      state.filters.push((row) => row[col] !== val);
      return self;
    },
    in(col: string, vals: unknown[]) {
      const set = new Set(vals);
      state.filters.push((row) => set.has(row[col]));
      return self;
    },
    lt(col: string, val: unknown) {
      state.filters.push(
        (row) =>
          (row[col] as string | number | null) !== null &&
          (row[col] as string | number) < (val as string | number)
      );
      return self;
    },
    lte(col: string, val: unknown) {
      state.filters.push(
        (row) =>
          (row[col] as string | number | null) !== null &&
          (row[col] as string | number) <= (val as string | number)
      );
      return self;
    },
    gt(col: string, val: unknown) {
      state.filters.push(
        (row) =>
          (row[col] as string | number | null) !== null &&
          (row[col] as string | number) > (val as string | number)
      );
      return self;
    },
    gte(col: string, val: unknown) {
      state.filters.push(
        (row) =>
          (row[col] as string | number | null) !== null &&
          (row[col] as string | number) >= (val as string | number)
      );
      return self;
    },
    is(col: string, val: null | boolean) {
      state.filters.push((row) => row[col] === val);
      return self;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      state.orderCol = col;
      state.orderAsc = opts?.ascending ?? true;
      return self;
    },
    limit(n: number) {
      state.limitN = n;
      return self;
    },
    single() {
      state.expectSingle = "single";
      return self;
    },
    maybeSingle() {
      state.expectSingle = "maybe";
      return self;
    },

    // ── mutations ───────────────────────────────────────────────
    insert(row: Row | Row[]) {
      const rows = Array.isArray(row) ? row : [row];
      const inserted = rows.map((r) => {
        const full: Row = { id: r.id ?? randomUUID(), ...r };
        // Auto-timestamps like Postgres defaults.
        if (!("created_at" in full))
          full.created_at = new Date().toISOString();
        if (!("updated_at" in full))
          full.updated_at = new Date().toISOString();
        db.tables[state.table].push(full);
        return full;
      });
      // Return a follow-up builder that resolves to the inserted rows.
      return createMutationBuilder(db, state, "insert", inserted);
    },
    update(patch: Row) {
      return createMutationBuilder(db, state, "update", patch as Row);
    },
    upsert(row: Row | Row[]) {
      const rows = Array.isArray(row) ? row : [row];
      for (const r of rows) {
        const idx = db.tables[state.table].findIndex((x) => x.id === r.id);
        if (idx >= 0) db.tables[state.table][idx] = { ...db.tables[state.table][idx], ...r };
        else db.tables[state.table].push(r);
      }
      return createMutationBuilder(db, state, "upsert", rows);
    },
    delete() {
      return createMutationBuilder(db, state, "delete", null);
    },

    // ── thenable — the actual query execution ──────────────────
    then<TResult1 = unknown, TResult2 = never>(
      onResolved?:
        | ((value: { data: unknown; error: null | { message: string } }) =>
            | TResult1
            | PromiseLike<TResult1>)
        | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      const result = runQuery(db, state);
      return Promise.resolve(result).then(onResolved, onRejected);
    },
  };

  return self;
}

function createMutationBuilder(
  db: FakeSupabase,
  state: QueryState,
  op: "insert" | "update" | "upsert" | "delete",
  payload: unknown
) {
  const mState: QueryState = { ...state, filters: [...state.filters] };
  const self = {
    eq(col: string, val: unknown) {
      mState.filters.push((row) => row[col] === val);
      return self;
    },
    neq(col: string, val: unknown) {
      mState.filters.push((row) => row[col] !== val);
      return self;
    },
    in(col: string, vals: unknown[]) {
      const set = new Set(vals);
      mState.filters.push((row) => set.has(row[col]));
      return self;
    },
    is(col: string, val: null | boolean) {
      mState.filters.push((row) => row[col] === val);
      return self;
    },
    select(cols: string) {
      mState.selectCols = cols.split(",").map((s) => s.trim());
      return self;
    },
    single() {
      mState.expectSingle = "single";
      return self;
    },
    maybeSingle() {
      mState.expectSingle = "maybe";
      return self;
    },
    then<TResult1 = unknown, TResult2 = never>(
      onResolved?:
        | ((value: { data: unknown; error: null | { message: string } }) =>
            | TResult1
            | PromiseLike<TResult1>)
        | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      const result = runMutation(db, mState, op, payload);
      return Promise.resolve(result).then(onResolved, onRejected);
    },
  };
  return self;
}

function runQuery(
  db: FakeSupabase,
  state: QueryState
): { data: unknown; error: null | { message: string } } {
  let rows = db.tables[state.table];
  for (const f of state.filters) rows = rows.filter(f);

  if (state.orderCol) {
    const col = state.orderCol;
    const asc = state.orderAsc ?? true;
    rows = [...rows].sort((a, b) => {
      const av = a[col] as string | number | null;
      const bv = b[col] as string | number | null;
      if (av === bv) return 0;
      if (av === null || av === undefined) return asc ? -1 : 1;
      if (bv === null || bv === undefined) return asc ? 1 : -1;
      return asc ? (av < bv ? -1 : 1) : av < bv ? 1 : -1;
    });
  }
  if (state.limitN !== undefined) rows = rows.slice(0, state.limitN);

  // Expand joins.
  const expanded = rows.map((row) => {
    if (state.joins.length === 0) return row;
    const clone: Row = { ...row };
    for (const j of state.joins) {
      const fkVal = row[j.fkColumn ?? `${j.foreignTable.slice(0, -1)}_id`];
      const joinedRow = db.tables[j.foreignTable as Table]?.find(
        (r) => r.id === fkVal
      );
      clone[j.foreignTable] = joinedRow
        ? pickCols(joinedRow, j.select)
        : null;
    }
    return clone;
  });

  if (state.expectSingle === "single") {
    if (expanded.length === 0) {
      return { data: null, error: { message: "No rows found" } };
    }
    return { data: expanded[0], error: null };
  }
  if (state.expectSingle === "maybe") {
    return { data: expanded[0] ?? null, error: null };
  }
  return { data: expanded, error: null };
}

function runMutation(
  db: FakeSupabase,
  state: QueryState,
  op: "insert" | "update" | "upsert" | "delete",
  payload: unknown
): { data: unknown; error: null | { message: string } } {
  if (op === "insert" || op === "upsert") {
    const rows = payload as Row[];
    if (state.expectSingle === "single") {
      return { data: rows[0] ?? null, error: null };
    }
    if (state.expectSingle === "maybe") {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }
  if (op === "update") {
    let changed = db.tables[state.table];
    for (const f of state.filters) changed = changed.filter(f);
    for (const row of changed) Object.assign(row, payload as Row);
    if (state.expectSingle === "single")
      return { data: changed[0] ?? null, error: null };
    if (state.expectSingle === "maybe")
      return { data: changed[0] ?? null, error: null };
    return { data: changed, error: null };
  }
  if (op === "delete") {
    const keep: Row[] = [];
    for (const row of db.tables[state.table]) {
      if (state.filters.every((f) => f(row))) continue;
      keep.push(row);
    }
    db.tables[state.table] = keep;
    return { data: null, error: null };
  }
  return { data: null, error: { message: "unknown op" } };
}

/**
 * Paren-aware select parser.
 *
 * Input examples we need to handle:
 *   "*"
 *   "id, status"
 *   "*, customers(id, full_name, phone, email), services(id, name, price_ils)"
 *   "id, provider, provider_tx_id, status"
 *
 * Splits top-level by commas while tracking paren depth so that commas
 * inside a join spec stay together. Join columns (e.g. "customers(...)")
 * produce JoinSpec entries; scalar column names go into flatCols.
 */
function parseSelect(input: string): {
  flatCols: string[];
  joins: JoinSpec[];
} {
  const flatCols: string[] = [];
  const joins: JoinSpec[] = [];
  const tokens: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      tokens.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== "") tokens.push(cur);

  for (const tokRaw of tokens) {
    const tok = tokRaw.trim();
    if (!tok) continue;
    const joinMatch = tok.match(/^([a-z_]+)\(([\s\S]+)\)$/);
    if (joinMatch) {
      joins.push({
        foreignTable: joinMatch[1],
        select: joinMatch[2]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        fkColumn: `${joinMatch[1].slice(0, -1)}_id`, // services → service_id
      });
    } else {
      flatCols.push(tok);
    }
  }
  if (flatCols.length === 0) flatCols.push("*");
  return { flatCols, joins };
}

function pickCols(row: Row, cols: string[]): Row {
  if (cols.length === 1 && cols[0] === "*") return row;
  const out: Row = {};
  for (const c of cols) out[c] = row[c];
  return out;
}

function withDefaults(row: Row, defaults: Row): Row {
  const merged = { ...defaults, ...row };
  if (!merged.id) merged.id = randomUUID();
  if (!merged.created_at) merged.created_at = new Date().toISOString();
  if (!merged.updated_at) merged.updated_at = new Date().toISOString();
  return merged;
}

function bookingDefaults(): Row {
  return {
    status: "pending_payment",
    price_ils: 35000,
    notes: null,
    hold_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    payment_method: null,
    cash_due_agorot: 0,
    cancellation_policy_version: "v1_5pct_or_100ILS_min",
    sms_sent_at: null,
    therapist_gender_preference: "any",
  };
}

function customerDefaults(): Row {
  return { full_name: "Test Customer", phone: "+972521234567", email: null };
}

function serviceDefaults(): Row {
  return {
    name: "Test Service",
    duration_minutes: 60,
    buffer_minutes: 15,
    price_ils: 35000,
    is_active: true,
  };
}
