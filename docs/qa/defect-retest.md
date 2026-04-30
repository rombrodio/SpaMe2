# Defect retest matrix

Canonical log of every reported defect against SpaMe, with current status.

Retest methodology: for every defect, locate the fix in code (`DEF-*` comment or commit reference), then verify the fix is still in place on `main`. Entries fall into three bands:

- **FIXED** — fix shipped in the listed PR; verification confirmed on current `main`. No action needed.
- **NO-OP** — reported defect was not reproducible at audit time (data hygiene, shipped-but-undocumented, or misreported). No code change made; flagged for future regression watch.
- **DEFERRED** — explicitly scoped out of the sweep; remains on the backlog.

Reopen a defect by adding a `REGRESSED` status row below the original with the date and the PR that regressed it, keeping the original row for history.

Last retested: **2026-04-29** against `main` @ commit `21d5fdf` (post PR #40 — session hook auto-fetch). DEF-033 + DEF-034 added this session.

---

## Original UAT backlog (DEF-001 → DEF-032)

Pasted into the chat at project start. 30 defects + 2 added during triage. Severity scale: **S1** blocker / data-loss, **S2** major / broken flow, **S3** minor functional, **S4** cosmetic / UX nit.

| ID | Sev | Summary | Status | Fix PR | Evidence on current `main` |
|----|-----|---------|--------|--------|----------------------------|
| DEF-001 | S1 | Service price input labeled "agorot"; admins enter whole ILS but DB stores agorot | **FIXED** | #12 | [`src/lib/schemas/service.ts:10-13`](../../src/lib/schemas/service.ts) — Zod transforms input ILS → agorot (`Math.round(v * 100)`). Label `Price (ILS)` + whole-shekel placeholder in [`services/new/page.tsx:100`](../../src/app/admin/services/new/page.tsx) |
| DEF-002 | S1 | Destructive actions (delete therapist/customer/service/room, cancel booking, delete availability) have no confirmation dialog | **FIXED** | #12 | `ConfirmButton` primitive ([`src/components/ui/confirm-button.tsx`](../../src/components/ui/confirm-button.tsx)) used across 10+ components. Tier-1 typed `DELETE` confirm on customer/receptionist/therapist/service deletes; Tier-2 simple confirm on room delete, cancel booking, mark no-show, availability / time-off / room-block deletes |
| DEF-003 | S2 | Inbox sidebar link 404s | **FIXED** | #12 | [`src/lib/nav.ts:88-91`](../../src/lib/nav.ts) — admin Inbox item marked `hidden: true` until Phase 8 ships; same for reception inbox at L193 |
| DEF-004 | S2 | Therapist / Room dropdowns on New Booking are ungated before a service is picked | **FIXED** | #12 | [`src/components/admin/booking/booking-form.tsx:184`](../../src/components/admin/booking/booking-form.tsx) — `filteredTherapists = []`/`filteredRooms = []` until `serviceId` set; `disabled={!serviceId}` on selects |
| DEF-005 | S2 | Facial Treatment shows "No qualified therapists / compatible rooms" | **NO-OP** | — | Root cause was stale seed data; DB reset resolved. Code path is correct (`getServiceConstraints` joins `therapist_services` + `room_services`). Guarded against recurrence via diagnostic message when a service has no qualified therapist. |
| DEF-006 | S2 | Available Slots show non-standard times (e.g. 09:27) when therapist rule starts off-grid | **FIXED** | #12 | [`src/lib/scheduling/availability.ts:543`](../../src/lib/scheduling/availability.ts) snaps first candidate start to 15-min grid. Unit test [`availability.test.ts:402`](../../src/lib/scheduling/__tests__/availability.test.ts) covers `06:34 → 22:45` window |
| DEF-007 | S2 | Availability Rules editor allows nonsense values (end ≤ start, off-grid times, overlapping rules) | **FIXED** | #12 | 15-min grid `<select>` in [`availability-section.tsx`](../../src/components/admin/therapist/availability-section.tsx); Zod enforces `end > start` + min-30-min shift; [`actions/therapists.ts:434`](../../src/lib/actions/therapists.ts) rejects overlapping rules for the same `(therapist, day)` |
| DEF-008 | S2 | Reschedule is a single datetime with no availability / conflict check | **FIXED** | #12 | [`booking-detail.tsx:354`](../../src/components/admin/booking/booking-detail.tsx) — reschedule dialog uses full `SlotPicker`; conflicts surface as toasts |
| DEF-009 | S2 | Bookings list has no search, filters, or pagination | **FIXED** | #12 | [`filter-bar.tsx`](../../src/components/admin/bookings/filter-bar.tsx) (q / status / therapist / date-range) + [`pager.tsx`](../../src/components/admin/bookings/pager.tsx); URL-driven state. `getBookings` returns `{ rows, total }` |
| DEF-010 | S2 | Booking lifecycle actions scattered across four cards; no confirmations; no toasts | **FIXED** | #12 | [`booking-detail.tsx:158`](../../src/components/admin/booking/booking-detail.tsx) sticky action bar; every action is `ConfirmButton`-wrapped; toasts on success / error |
| DEF-011 | S2 | Audit log rows show opaque 8-char hashes, not entity names | **FIXED** | #12 | [`actions/audit.ts:22`](../../src/lib/actions/audit.ts) — batch-enriches rows with `entityLabel` + `entityHref`; audit-log page renders as deep link with short hash as muted subtitle |
| DEF-012 | S3 | Edit links on list tables sometimes require two clicks | **FIXED** | #13 | [`src/components/admin/row-link.tsx`](../../src/components/admin/row-link.tsx) — full-row click handler with `router.prefetch(href)` pre-hint so first click is instant |
| DEF-013 | S3 | Native `datetime-local` renders inconsistently across browsers/OS | **FIXED** | #13 | [`src/components/ui/date-time-picker.tsx`](../../src/components/ui/date-time-picker.tsx) — split date + time pickers, grid-aligned, human-readable preview |
| DEF-014 | S3 | Therapist availability rule delete has no confirmation | **NO-OP** | — | Already absorbed into DEF-002 shared infrastructure. `ConfirmButton` wraps the delete trigger in [`availability-section.tsx`](../../src/components/admin/therapist/availability-section.tsx) |
| DEF-015 | S3 | "Leave unassigned" checkbox on New Booking lacks help text | **NO-OP** | — | Help copy already present at [`booking-form.tsx:316`](../../src/components/admin/booking/booking-form.tsx) via `admin.bookings.form.leaveUnassignedHelp` key |
| DEF-016 | S3 | Assignments page empty state has no icon / explainer / CTA | **NO-OP** | — | Already present at [`assignment-list.tsx:156-180`](../../src/components/admin/assignments/assignment-list.tsx) — UserCheck icon + `emptyAll` / `emptyBody` copy + "Create an unassigned booking" CTA |
| DEF-017 | S3 | New Booking start-time input accepts off-grid times (e.g. 13:29) | **FIXED** | #13 | [`booking-form.tsx:378`](../../src/components/admin/booking/booking-form.tsx) — `step={900}` on time input forces 15-min snap |
| DEF-018 | S3 | Voucher SKU Mappings have no format validation or duplicate check | **FIXED** | #13 | [`voucher-mappings-section.tsx:29`](../../src/components/admin/service/voucher-mappings-section.tsx) — SKU pattern `[A-Z0-9][A-Z0-9_\-./]{0,63}`, uppercase-forcing onChange, client-side duplicate check, ConfirmButton on remove |
| DEF-019 | S3 | Rooms list shows placeholder gibberish in Description column | **NO-OP** | — | Cleared by DB reset at project start |
| DEF-020 | S3 | Customer name in list appears lowercase regardless of stored casing; missing email is invisible | **FIXED** | #13 | [`customers/page.tsx:19`](../../src/app/admin/customers/page.tsx) — `toDisplayName()` Title-Case formatter (display-only, doesn't mutate DB); missing email renders as `+ Add email` link |
| DEF-021 | S3 | Settings page is minimal (only on-call manager) | **DEFERRED** | — | Explicitly out of sweep scope. Spa settings has since grown (business hours + slot granularity in Phase 4.6 migration 00020, language in 7a migration 00025). Further expansion should be requirements-driven, not catch-all. |
| DEF-022 | S3 | Audit log has no pagination | **FIXED** | #13 | [`audit-log/page.tsx:20`](../../src/app/admin/audit-log/page.tsx) — `PAGE_SIZE = 50`, URL-driven `?page=`, Prev/Next controls, `getAuditLogs` returns `{ rows, total }` |
| DEF-023 | S3 | Audit log diffs render as raw JSON strings | **FIXED** | #13 | [`src/components/admin/audit-log/diff-view.tsx`](../../src/components/admin/audit-log/diff-view.tsx) — structural per-key rows, colored added/removed/changed badges, unchanged fields hidden behind ICU-plural toggle |
| DEF-024 | S3 | Calendar blocks truncate important info (customer + service invisible on small blocks) | **FIXED** | #13 | [`calendar/booking-card.tsx:59`](../../src/components/admin/calendar/booking-card.tsx) — native `title` tooltip with full customer + service + time + therapist + room + status on every card |
| DEF-025 | S4 | Avatar circle overlaps the Sign out button in sidebar | **NO-OP** | — | Misreported — no avatar component existed in either sidebar at audit time. PR #16 explicitly reverted an avatar attempt that was introduced then walked back. Current sidebar has no avatar. |
| DEF-026 | S4 | Active / Inactive chips look like buttons | **FIXED** | #13 | [`src/components/ui/badge.tsx:17`](../../src/components/ui/badge.tsx) — new `success` / `muted` variants with colored dot marker; used on therapists / rooms / services / receptionists lists |
| DEF-027 | S4 | Service list contains test data ("asdf"-style entries) | **NO-OP** | — | Cleared by DB reset |
| DEF-028 | S4 | Booking notes contain test strings | **NO-OP** | — | Cleared by DB reset |
| DEF-029 | S4 | No breadcrumbs on detail pages; hard to navigate back | **FIXED** | #13 | [`src/components/admin/breadcrumbs.tsx`](../../src/components/admin/breadcrumbs.tsx) — used on booking detail, therapist / receptionist / customer / service / room detail pages |
| DEF-030 | S4 | Calendar week header is static text; no quick date-jump | **FIXED** | #13 | [`calendar-header.tsx:35`](../../src/components/admin/calendar/calendar-header.tsx) — clickable title button opens hidden native date input via `showPicker()`, falls back to `focus()` on older browsers |
| DEF-031 | S4 | No toast notifications on save / delete / reschedule | **FIXED** | #13 | `sonner` mounted in root layout; `toast.success` / `toast.error` wired into every admin mutation (new/edit pages, edit-forms, availability/time-off/room-block sections, settings-form, assignments-list) |
| DEF-032 | S4 | Booking status chip copy inconsistent ("pending payment" vs "Pending Payment") | **FIXED** | #13 | [`calendar/booking-card.tsx:154`](../../src/components/admin/calendar/booking-card.tsx) — `translateStatus()` helper looks up `admin.status.*` catalog with Title-Case fallback; same `StatusBadge` used across list, detail, calendar, filter dropdown |

**Summary:** 32 items. **23 FIXED** (code evidence), **8 NO-OP** (data hygiene or misreported — not code bugs), **1 DEFERRED** (Settings, scope decision).

---

## Newer user-reports (from 2026-04-25 → 2026-04-27)

Items reported verbally during the post-deploy UAT session, after the original 32-item sweep closed. Not given formal IDs at the time; tracked here by the PR that closed each.

| Report | Sev | Status | Fix PR | Evidence |
|--------|-----|--------|--------|----------|
| "Email link is invalid or has expired" on password reset; redirected to localhost | S1 | **FIXED** | #19 + #21 | PR #19: `getAppUrl()` helper + all 6 silent `http://localhost:3000` fallbacks replaced with a hard-fail. PR #21: `callback/route.ts` → `callback/page.tsx` (client component) to read URL-hash tokens that server routes can't see. Login page surfaces Supabase `?error=...` instead of silent redirect. `autoComplete` attrs present on email/password fields. |
| Delete therapist button grayed out — impossible to type Hebrew full name on IL keyboard | S1 | **FIXED** | #19 | `ConfirmButton` `confirmText` changed from locale-specific name to stable ASCII `"DELETE"` on therapist, receptionist, customer, and service deletes. |
| Treatment duration should display as 45 min (room was booked for full hour; last 15 min is cleaning) | S2 | **FIXED** | #19 | Migration `00021_service_durations_45min.sql` sets every service to `duration_minutes=45, buffer_minutes=15`. Customer UI shows 45 min; scheduler still occupies the hour (45 + 15 buffer). |
| Assignments screen should show all future unassigned, not just today | S2 | **FIXED** | #19 | `getAssignmentScreenData` gained a `scope: 'all' \| 'date'` param (default `'all'`). [`actions/assignments.ts:58`](../../src/lib/actions/assignments.ts). Date filter remains as optional narrowing. |
| Bookings list should show creation time | S3 | **FIXED** | #19 | New `Created` column on `/admin/bookings` with tooltip showing full timestamp; assignments screen also shows each booking's creation time. |
| `/login ↔ /therapist` redirect loop (ERR_TOO_MANY_REDIRECTS) for users with `role='therapist'` but `therapist_id=NULL` | S1 | **FIXED** | #27 | Middleware now computes **effective role** that only trusts `role='therapist'` when `therapist_id` is also set (same for receptionist). Broken-link users stay on `/login` with a visible `?error=...` banner. New `redirectWithCookies` helper propagates Supabase session cookies through every redirect. [`src/middleware.ts:43-94`](../../src/middleware.ts) |

**Summary:** 6 items. **All FIXED.**

---

## Post-Phase-7b user reports (2026-04-29)

Items reported during admin play sessions after Phase 7b closed. New DEF-* IDs assigned starting at DEF-033.

| ID | Sev | Summary | Status | Fix PR | Evidence on current `main` |
|----|-----|---------|--------|--------|----------------------------|
| DEF-033 | S2 | Updating a therapist's (or room's) assigned services fails with Postgres FK error `update or delete on table "therapist_services" violates foreign key constraint "fk_therapist_service" on table "bookings"` whenever any booking references one of the existing pairs — even when the admin is only adding a new service | **FIXED** | #41 | [`setTherapistServices`](../../src/lib/actions/therapists.ts) and [`setRoomServices`](../../src/lib/actions/rooms.ts) rewritten as diff-based: snapshot current junction, compute `toInsert`/`toRemove`, pre-check `bookings` for any `(therapist_id, service_id)` or `(room_id, service_id)` pair in `toRemove`, return translated `admin.therapists.services.cantRemoveHasBookings` / `admin.rooms.services.cantRemoveHasBookings` error listing blocked service names + count. Delete-all anti-pattern replaced; audit log added on every mutation. |
| DEF-034 | S3 | Create Therapist page has no service selector (admin must save first, then navigate to detail page), AND the Create button is easy to double-click, producing two therapists from a single form before the async `submitting` state takes effect | **FIXED** | #43 | New "Assigned Services" checkbox list on [`/admin/therapists/new`](../../src/app/admin/therapists/new/page.tsx), sourced from the live `getServices()` catalog; page now a server component that passes services into [`TherapistCreateForm`](../../src/components/admin/therapist/create-form.tsx). Form wraps `handleSubmit` with a `useRef<boolean>(false)` synchronous guard (Layer 1) — blocks re-entry before React re-renders, resets on every early-return path so admin can retry. `createTherapist` now accepts `service_ids` via `formData.getAll()` and routes through the PR #41 `setTherapistServices` to keep audit + revalidation consistent. Layer 2 (`useFormStatus` refactor across every admin `/new` form) deferred — see MASTER-PLAN Phase 6.x. |

---

## Regression watch after Phase 7b

Phase 7b (PRs #24 / #25 / #26 / #28 / #29 / #30 / #31) touched every user-facing string in the app. Spot-checked that none of the UAT-backlog fixes regressed during the catalog migration:

- **DEF-015** (Leave unassigned help) — help text now behind `admin.bookings.form.leaveUnassignedHelp` key in `en.json` / `he.json`, component still renders it ✓
- **DEF-016** (Assignments empty state) — `emptyAll` / `emptyForDate` / `emptyBody` keys in `en.json` / `he.json`, empty state still rendered correctly ✓
- **DEF-032** (Canonical status labels) — `translateStatus` helper in [`calendar/booking-card.tsx:154`](../../src/components/admin/calendar/booking-card.tsx) reads `admin.status.*` catalog with Title-Case fallback for unknown statuses; centralised enough that it can't drift ✓
- **DEF-023** (DiffView) — ICU-plural diff-toggle copy works in both locales ✓

Known still-English surfaces (documented in [`README.md`](../../README.md#localization) as intentional):

- Server-action error envelopes — Zod errors returned as English strings by design (deferred from Phase 7b scope per operator decision)
- SMS / email templates — Phase 8+ work
- Supabase auth error text at `/login?error=...` — inherits Supabase's locale

---

## Net defect status (as of 2026-04-29)

| Status | Count | Items |
|--------|-------|-------|
| FIXED (code evidence) | **31** | DEF-001, 002, 003, 004, 006, 007, 008, 009, 010, 011, 012, 013, 017, 018, 020, 022, 023, 024, 026, 029, 030, 031, 032, 033, 034 + 6 newer user-reports |
| NO-OP (data hygiene / misreport / absorbed) | **8** | DEF-005, 014, 015, 016, 019, 025, 027, 028 |
| DEFERRED | **1** | DEF-021 (Settings expansion) |
| OPEN | **0** | — |

**No S1 or S2 items are currently open.** Phase 9 can start.
