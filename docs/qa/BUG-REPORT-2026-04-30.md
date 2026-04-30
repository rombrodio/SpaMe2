# Bug Report — Code Analysis 2026-04-30

Branch: `claude/analyze-code-bugs-HkYj0`

This report is the output of a static analysis pass over the SpaMe codebase
(scheduling engine, payments engine, server actions, auth/middleware, audit
log). Every finding below was checked against the file/line cited and against
the SpaMe invariants in `CLAUDE.md` and the actual schema in
`supabase/migrations/`.

Static gates (`npm run typecheck`, `npm run lint`, `npm run test`) all pass on
`main`. Findings are real-runtime / logic / security bugs, not type or lint
issues.

## Summary

| # | Severity | Title |
|---|---|---|
| 1 | HIGH | Mock payment provider silently activates in production when env var is missing or mistyped |
| 2 | MEDIUM | Webhook idempotency race — concurrent CardCom retries can both pass the success short-circuit |
| 3 | MEDIUM | Assignment server actions return `success` when 0 rows are updated |
| 4 | MEDIUM | Israeli phone normalizer accepts ambiguous 9-digit input as a +972 number |
| 5 | LOW | `expire-holds` cron uses a hand-rolled XOR loop instead of `crypto.timingSafeEqual` |
| 6 | LOW | Receptionist availability server actions have no role/ownership check (RLS catches it, but defence-in-depth gap) |
| 7 | LOW | Overlap helper does not gate on `assignment_status`, only `status !== "cancelled"` |

Items below labeled "Reviewed and rejected" were proposed during the analysis
but turned out to be false positives once the schema or runtime semantics were
checked. They are listed so reviewers do not re-flag them.

---

## 1. Mock payment provider silently activates in production — HIGH

**File:** `src/lib/payments/providers.ts:31-34`

```ts
function pickMode(envName: string): "mock" | "real" {
  const raw = process.env[envName];
  return raw === "real" ? "real" : "mock";
}
```

Three env vars (`PAYMENTS_CARDCOM_PROVIDER`, `PAYMENTS_DTS_PROVIDER`,
`PAYMENTS_VPAY_PROVIDER`) feed this picker. If any of them is unset, blank, or
mistyped (`Real`, `prod`, `true`, …) the provider silently falls back to the
in-memory mock.

The mock keeps state in module-scoped `Map`s in `src/lib/payments/mock.ts`
(e.g. `cardcomDeals`, the seeded VPay/DTS cards). On Vercel each lambda cold
start gets a fresh process — any state the mock created is gone the next
request. Customers who go through `/order` and "pay" via a mocked provider
will see a confirmation page; their booking flips to `confirmed`; but the
"deal" never existed at the real PSP.

This violates **Hard invariant 6** in `CLAUDE.md`: "Payment webhook is the
source of truth for payment success." A misconfigured prod deploy bypasses
the real webhook entirely.

**Fix:** when `process.env.NODE_ENV === "production"`, treat anything other
than `"real"` as a fatal misconfiguration — log loudly and refuse to build the
provider. Surface the misconfiguration on `/admin/health` or similar so it's
visible without reading logs.

## 2. Webhook idempotency race — MEDIUM

**File:** `src/lib/payments/engine.ts:393-505` (especially 417-426 and 473-501)

`confirmFromWebhook` reads the `payments` row, checks
`payment.status === "success" || "authorized"` for the idempotency
short-circuit, then later `UPDATE`s the row (`payments` → `bookings`) with no
optimistic-lock predicate.

Two concurrent calls (CardCom retries fired in parallel by their queue, or a
manual retry overlapping a webhook) both see `status="pending"` at line 417,
both call `getLowProfileIndicator`, and both run the success path. The
second `update().eq("id", ...)` succeeds and stomps `paid_at`,
`webhook_payload`, and re-fires the booking flip to `confirmed`. The audit
log gets two `payment_webhook` entries for the same payment, and a downstream
follow-up that depends on first-write semantics (e.g. anti-double-confirm
hooks) sees an inconsistent picture.

There is no DB-level guard — `idx_payments_invoice_number` (migration
`00015_payments_and_holds.sql:84`) is unique on `invoice_number`, but the
update uses the payment id, not invoice_number, so it doesn't help.

**Fix:** make the success update optimistic on the prior status:

```ts
const { data, error } = await supabase
  .from("payments")
  .update(patch)
  .eq("id", payment.id)
  .in("status", ["pending"])
  .select("id");
if (!data || data.length === 0) {
  // someone else already confirmed; treat as idempotent
  return { success: true, data: { paymentId: payment.id, idempotent: true } };
}
```

Same pattern should apply to the `failed` branch at line 434-440.

## 3. Assignment server actions return `success` when 0 rows are updated — MEDIUM

**Files:**
- `src/lib/actions/assignments.ts:568-590` (`assignTherapist`-type flow)
- `src/lib/actions/assignments.ts:697-712` (`confirmAssignment`)
- `src/lib/actions/assignments.ts:775-790` (`declineAssignment`)

Each of these uses Supabase's `update().eq(..., ...).eq("assignment_status",
"<expected>")` as an optimistic concurrency guard. The pattern is correct in
spirit, but the response is never inspected for "0 rows affected". Supabase
does not raise an error when the predicate matches no rows — `updErr` is null
and the action returns `{ success: true }`.

Concrete repro for the assign action: two managers open
`/admin/assignments`. Manager A clicks "Assign Tara" on booking X. Manager B
clicks "Assign Roni" on the same booking ~50ms later. A's update wins (still
`unassigned`); B's update silently matches 0 rows because the row is now
`pending_confirmation`. B's UI shows "Assigned"; the row is actually with
Tara. B then sees stale data and can fire wrong follow-ups.

Same logic applies to confirm/decline — a therapist confirming after
expiration (or after a manager already reassigned the booking) sees
"Confirmed" while the booking is in a different state.

**Fix:** chain `.select("id")` onto each update and check
`data?.length === 0`. Return a "stale" or "already-claimed" error envelope to
the caller. The therapist-decline path at line 790 has the same bug and the
same fix.

## 4. Israeli phone normalizer accepts ambiguous 9-digit input — MEDIUM

**File:** `src/lib/phone.ts:36-39`

```ts
if (digits.length === 9 && /^[2-9]/.test(digits)) {
  return `+972${digits}`;
}
```

A user who typed `512345678` (9 digits, no leading `0`, starting with `5`)
gets normalized to `+972512345678`. That's a syntactically-valid Israeli
mobile number — but it's almost certainly not what the user typed; Israeli
phone numbers in the wild include the leading `0` (`0512345678`). The branch
is meant to repair an input that already had its leading `0` stripped; in
practice it silently accepts inputs that never had a `0` to begin with.

Phone is the customer's primary identity (CLAUDE.md: "phone-identified
(E.164), no login"). Mis-normalization here means SMS confirmations go to a
different person.

**Fix:** require the customer-facing form to either start with `0` or with
`+972`/`972`; reject the bare-9-digits branch. The repair path is rarely
needed and the current heuristic produces silent corruption when it triggers
on the wrong input.

## 5. `expire-holds` cron uses a hand-rolled XOR loop instead of `crypto.timingSafeEqual` — LOW

**File:** `src/app/api/cron/expire-holds/route.ts:65-72`

```ts
let diff = 0;
for (let i = 0; i < candidate.length; i++) {
  diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
}
return diff === 0;
```

The CardCom webhook route (`src/app/api/webhooks/cardcom/[secret]/route.ts:33,
107-110`) uses Node's `timingSafeEqual` correctly. The cron has the same
import available but rolls its own loop. JavaScript's `String.charCodeAt` and
the resulting JIT branches are not guaranteed constant-time — practical
network-side attacks are unlikely (V8 deopts dominate any per-character
timing signal), but consistency with the webhook is cheap.

**Fix:** swap the loop for `timingSafeEqual(Buffer.from(candidate),
Buffer.from(expected))` after the length check.

## 6. Receptionist availability server actions miss role/ownership check — LOW

**File:** `src/lib/actions/receptionists.ts:364-426`
(`createReceptionistAvailabilityRule`, `deleteReceptionistAvailabilityRule`)

Neither action verifies the caller is the receptionist whose rule they're
mutating, nor that the caller is a super_admin. They forward the
`receptionist_id` from the form straight into the insert, and accept any rule
id for delete.

In production this is gated by RLS: migration
`00023_receptionist_tables.sql:90-104` enforces both `USING` and `WITH CHECK`
clauses scoped to `get_user_receptionist_id()`. So a malicious receptionist's
write fails at the database, not at the action — the user gets a raw RLS
"new row violates row-level security policy" message instead of a clean
"not authorized" envelope.

The server-action pattern elsewhere (e.g. therapist-availability flows) does
its own role check before calling Supabase. This is a defence-in-depth /
error-message-quality gap, not an exploitable IDOR. Worth aligning so
`/reception/availability` and `/admin/receptionists/<id>/availability` show a
consistent error UX and don't depend on raw RLS strings.

## 7. Overlap helper does not gate on `assignment_status` — LOW

**File:** `src/lib/scheduling/availability.ts:223-242`
(`getOverlappingBookings`); also `src/lib/scheduling/booking-engine.ts:332-334`
and `:595-597`.

The helper currently skips a booking only when `b.status === "cancelled"` and
otherwise treats it as a capacity-blocking conflict. The engine's day-fetch
helpers filter "is this booking already-assigned?" by
`r.assignment_status !== "unassigned"`.

Per migration `00018_deferred_assignment.sql:40-45`, the enum is
`unassigned | pending_confirmation | confirmed | declined`. In practice no
row persists in `declined`: `declineAssignment`
(`src/lib/actions/assignments.ts:775-790`) writes the row back to
`assignment_status='unassigned'` and `therapist_id=null` in the same
transaction. So `declined` is a transient label captured only in the
`declined_at` timestamp.

The bug is therefore latent rather than active — but it's a foot-gun: any
future code path or migration that does leave a row in `declined` (for an
audit window, a UI flag, etc.) would silently make that row block the
therapist's capacity, and the matcher would mark the therapist "busy" for the
booking.

**Fix:** explicitly filter on `r.assignment_status in ('pending_confirmation',
'confirmed')` for capacity-holding queries, and explicitly skip `declined` in
`getOverlappingBookings`. This makes the lifecycle-vs-capacity contract
visible in the code rather than implied by a side-effect of the decline
action.

---

## Reviewed and rejected (false positives)

These were flagged during the pass but verified non-bugs against the schema
and runtime intent. Listed for future reviewers.

- **"`price_ils` column stores ILS, but engine treats it as agorot."**
  False. `supabase/migrations/00004_core_tables.sql:45` defines
  `price_ils INT NOT NULL CHECK (price_ils >= 0)` with the comment
  `-- stored in agorot (cents)`. Seed values (`supabase/seed.sql:25-30`)
  confirm: `35000` for a ₪350 service. Every code path that consumes
  `service.price_ils` as agorot is correct, despite the misleading column
  name. (Renaming is a separate cleanup.)
- **"`writeAuditLog` is fire-and-forget — callers should `await`."** False.
  `src/lib/audit.ts:11-14` documents the contract: "errors are logged but do
  not block the caller". `audit_logs` writes that fail are observability
  noise, not a correctness boundary; treating them as blocking would mean a
  flaky audit insert breaks the user's main action.
- **"`isE164` regex `^\+[1-9]\d{7,14}$` is too permissive."** False. ITU-T
  E.164 specifies a max of 15 digits including the country code; the
  effective minimum in practice is ~8 digits. The regex matches that range
  exactly.
- **"Decline path persists `assignment_status='declined'`, blocking
  capacity."** False — see finding #7. The decline server action atomically
  resets the row to `unassigned` and nulls the therapist; `declined` is only
  a transient label captured in `declined_at`.

---

## How to consume

The fixes for findings 1, 2, 3 and 4 are short and self-contained. 5 and 6
are documentation/UX-quality follow-ups. 7 is a latent-bug hardening that's
worth doing alongside any future changes to the assignment lifecycle (Phase
7c will rewrite the enum anyway and should pick up the explicit-states
treatment for free).

No code changes have been committed — this branch contains only the report.
