# SpaMe2 — Comprehensive Implementation Plan

## Context

We are building a spa management web app for a Tel Aviv spa to replace Biz-Online. The repo is greenfield (only README.md and CLAUDE.md exist). This plan covers architecture, database schema, folder structure, phased implementation, risks, and assumptions — all scoped to V1 only.

### Confirmed Decisions

- **Payment:** Optional for super admin (can confirm bookings directly without payment); required for customer self-booking and chatbot
- **Buffer time:** Configurable per service (`buffer_minutes` column on `services` table)
- **UI language:** English for admin; customer-facing Hebrew deferred
- **Payment provider:** CardCom (hosted page + webhooks)

---

## 1. Architecture Plan

### System Overview

Next.js App Router monolith on Vercel, backed by Supabase (Postgres + Auth). Three surfaces, two external integrations.

### Auth & Roles

Two authenticated user types via Supabase Auth, distinguished by a `role` column in a `profiles` table:

1. **Super Admin** — can invite/remove therapists, manage rooms/services/customers, edit the calendar, manage bookings, view audit logs, access staff inbox. Full CRUD.
2. **Therapist** — logs in to submit/edit their own availability rules and time-off. Can view their own bookings (read-only). Cannot edit other therapists, rooms, services, customers, or calendar.

Customers are NOT Supabase Auth users — identified by phone number only.

### Surfaces

1. **Admin Dashboard** (`/admin/*`) — Super Admin: full access. Therapist: redirected to `/therapist/*` portal.
2. **Therapist Portal** (`/therapist/*`) — Behind Supabase Auth. Therapists manage their own availability, view their bookings.
3. **Customer Booking Flow** (`/book/*`) — Public pages. Service selection → slot picker → customer details → redirect to hosted payment page → confirmation.
4. **Web Chat** (`/chat/*`) — Embeddable chat widget mirroring the WhatsApp conversational flow.

### API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/webhooks/payment` | Receive payment provider callback, verify signature, update booking+payment |
| `GET/POST /api/webhooks/whatsapp` | WhatsApp Cloud API webhook (verify + receive messages) |
| `POST /api/whatsapp/send` | Outbound WhatsApp messages (internal use) |
| `POST /api/chat` | Web chat AI endpoint |
| `GET /api/cron/reminders` | Vercel Cron — send appointment reminders |

### Server Actions (`src/lib/actions/`)

All mutations go through Server Actions. These are the only write path — the AI chatbot calls the same actions.

### External Integrations

1. **Payment Provider** (CardCom recommended — mature hosted page, ILS-native, webhook support). Flow: create payment page URL → redirect customer → receive webhook → update booking.
2. **WhatsApp Business Cloud API** (Meta). Receive inbound messages via webhook, send outbound via REST.

### AI Chatbot Engine

- Receives messages from WhatsApp webhook or web chat endpoint
- Calls Claude API with system prompt constraining to 6 approved tools only
- Each tool maps to a validated server action — AI never writes to DB directly
- Tools: `find_available_slots`, `create_tentative_booking`, `create_payment_link`, `reschedule_booking`, `cancel_booking`, `handoff_to_staff`

### Key Data Flows

**Admin booking (with payment):** Select service/therapist/room/time → Server Action validates overlaps (Postgres exclusion constraint) → Booking(pending_payment) → payment link generated → customer pays → webhook → Booking(confirmed)

**Admin booking (skip payment):** Same flow but super admin clicks "Confirm without payment" → Booking(confirmed) directly. Only super admins can do this (not therapists). Audit log records which admin bypassed payment.

**Chatbot booking:** Customer message → webhook → conversation engine → AI calls `find_available_slots` → presents options → customer picks → `create_tentative_booking` → `create_payment_link` → sends link → customer pays → webhook → Booking(confirmed)

---

## 2. Database / Schema Plan

All tables use UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` timestamps. `updated_at` maintained by trigger.

### Auth Tables

**profiles** — `id` (UUID, FK to `auth.users`), `role` ('super_admin' | 'therapist'), `therapist_id` (UUID nullable, FK to `therapists` — set when role='therapist' to link Supabase Auth user to therapist record), `created_at`, `updated_at`. Created via trigger on `auth.users` insert.

This allows: super admin invites therapist via Supabase Auth → profile created with role='therapist' + linked `therapist_id` → therapist logs in and manages their own availability.

### Extensions & Enums

```sql
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- Required for exclusion constraints

CREATE TYPE booking_status AS ENUM ('pending_payment','confirmed','cancelled','completed','no_show');
CREATE TYPE payment_status AS ENUM ('pending','success','failed','refunded');
CREATE TYPE day_of_week AS ENUM ('sunday','monday','tuesday','wednesday','thursday','friday','saturday');
CREATE TYPE conversation_channel AS ENUM ('whatsapp','web');
CREATE TYPE message_role AS ENUM ('customer','assistant','system','staff');
CREATE TYPE audit_action AS ENUM ('create','update','delete','status_change','login','payment_webhook');
```

### Tables

**customers** — `id`, `full_name`, `phone` (UNIQUE, E.164), `email`, `notes`, `created_at`, `updated_at`

**therapists** — `id`, `full_name`, `phone`, `email`, `color` (calendar display), `is_active`, `created_at`, `updated_at`

**rooms** — `id`, `name`, `description`, `is_active`, `created_at`, `updated_at`

**services** — `id`, `name`, `description`, `duration_minutes` (CHECK > 0), `buffer_minutes` (INT DEFAULT 0, cleanup/turnover time appended to booking slot for availability calc), `price_ils` (integer, in agorot), `is_active`, `created_at`, `updated_at`

**therapist_services** — `(therapist_id, service_id)` composite PK, FKs with CASCADE

**room_services** — `(room_id, service_id)` composite PK, FKs with CASCADE

**therapist_availability_rules** — `id`, `therapist_id`, `day_of_week`, `start_time` (TIME), `end_time` (TIME), `valid_from` (DATE), `valid_until` (DATE nullable), `created_at`. CHECK(start_time < end_time).

**therapist_time_off** — `id`, `therapist_id`, `start_at` (TIMESTAMPTZ), `end_at`, `reason`, `created_at`. CHECK(start_at < end_at).

**room_blocks** — `id`, `room_id`, `start_at`, `end_at`, `reason`, `created_at`. CHECK(start_at < end_at).

**bookings** — `id`, `customer_id`, `therapist_id`, `room_id`, `service_id`, `start_at`, `end_at`, `status`, `price_ils`, `notes`, `created_by` (nullable), `cancelled_at`, `cancel_reason`, `created_at`, `updated_at`. CHECK(start_at < end_at).
- **Composite FK** `(therapist_id, service_id) REFERENCES therapist_services` — enforces therapist qualification at DB level
- **Composite FK** `(room_id, service_id) REFERENCES room_services` — enforces room compatibility at DB level

**payments** — `id`, `booking_id`, `amount_ils`, `status`, `provider`, `provider_tx_id`, `payment_page_url`, `webhook_payload` (JSONB), `paid_at`, `created_at`, `updated_at`

**conversation_threads** — `id`, `customer_id`, `channel`, `external_id`, `is_open`, `assigned_to` (nullable), `created_at`, `updated_at`

**conversation_messages** — `id`, `thread_id`, `role`, `content`, `metadata` (JSONB), `created_at`

**audit_logs** — `id`, `user_id` (nullable), `action`, `entity_type`, `entity_id`, `old_data` (JSONB), `new_data` (JSONB), `ip_address` (INET), `created_at`

### Overlap Prevention (Critical)

Postgres exclusion constraints using `btree_gist`:

```sql
ALTER TABLE bookings ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status NOT IN ('cancelled'));

ALTER TABLE bookings ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status NOT IN ('cancelled'));
```

Application layer does a pre-check for better error messages. The exclusion constraint is the safety net for concurrent inserts.

### RLS Policies

- All tables: deny `anon` by default
- `super_admin` role (checked via `profiles.role`): full CRUD on all tables
- `therapist` role: SELECT/UPDATE on own `therapist_availability_rules` and `therapist_time_off` (WHERE `therapist_id` matches their linked profile). SELECT on own `bookings`.
- `audit_logs`: SELECT only (no manual edits)
- `payments`: UPDATE only via `service_role` (webhook handler)
- Webhook/chatbot routes use `service_role` key (bypasses RLS)

### Migration Files

```
supabase/migrations/
├── 00001_extensions.sql
├── 00002_enums.sql
├── 00003_profiles.sql                       (profiles table + trigger on auth.users insert)
├── 00004_core_tables.sql                    (customers, therapists, rooms, services w/ buffer_minutes)
├── 00005_junction_tables.sql                (therapist_services, room_services)
├── 00006_scheduling_tables.sql              (availability_rules, time_off, room_blocks)
├── 00007_bookings.sql                       (bookings + exclusion constraints)
├── 00008_payments.sql
├── 00009_conversations.sql
├── 00010_audit_log.sql
├── 00011_triggers.sql                       (updated_at trigger applied to all tables)
├── 00012_rls_policies.sql                   (role-based: super_admin full, therapist own-data)
├── 00013_fix_advisor_warnings.sql           (Supabase advisor fixes: security_invoker, search_path)
├── 00014_regenerate_seed_uuids.sql          (deterministic seed UUIDs for reproducible tests)
├── 00015_payments_and_holds.sql             (payment_method/role enums, authorized status, voucher SKUs)
├── 00016_payment_status_authorized_index.sql (partial unique index — one in-flight payment per role)
├── 00017_therapist_gender.sql               (therapist gender + booking gender preference)
├── 00018_deferred_assignment.sql            (unassigned-booking queue, manager alerts, therapist SLA)
├── 00019_spa_settings.sql                   (single-row spa_settings: on-call manager name + phone)
└── 00020_business_hours.sql                 (spa-wide business hours + slot granularity)
```

---

## 3. Folder / Module Structure

```
src/
├── app/
│   ├── layout.tsx                          # Root layout
│   ├── page.tsx                            # Landing / redirect
│   ├── globals.css
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── callback/route.ts
│   ├── admin/
│   │   ├── layout.tsx                      # Sidebar + auth guard
│   │   ├── page.tsx                        # Dashboard
│   │   ├── calendar/page.tsx
│   │   ├── bookings/
│   │   │   ├── page.tsx                    # List
│   │   │   ├── [id]/page.tsx              # Detail
│   │   │   └── new/page.tsx               # Create
│   │   ├── therapists/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── rooms/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── services/
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── new/page.tsx
│   │   ├── customers/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── inbox/
│   │   │   ├── page.tsx
│   │   │   └── [threadId]/page.tsx
│   │   └── audit-log/page.tsx
│   ├── therapist/
│   │   ├── layout.tsx                      # Therapist portal layout + auth guard (role=therapist)
│   │   ├── page.tsx                        # Dashboard (my upcoming bookings)
│   │   ├── availability/page.tsx           # Manage own availability rules
│   │   └── time-off/page.tsx               # Manage own time-off
│   ├── book/
│   │   ├── layout.tsx                      # Customer-facing layout
│   │   ├── page.tsx                        # Service selection
│   │   ├── slots/page.tsx
│   │   ├── confirm/page.tsx
│   │   └── payment-return/page.tsx
│   ├── chat/page.tsx
│   └── api/
│       ├── webhooks/
│       │   ├── payment/route.ts
│       │   └── whatsapp/route.ts
│       ├── whatsapp/send/route.ts
│       ├── chat/route.ts
│       └── cron/reminders/route.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts                       # Browser client
│   │   ├── server.ts                       # Server client (cookies)
│   │   └── admin.ts                        # Service-role client
│   ├── schemas/                            # Zod schemas
│   │   ├── customer.ts
│   │   ├── therapist.ts
│   │   ├── room.ts
│   │   ├── service.ts
│   │   ├── booking.ts
│   │   ├── payment.ts
│   │   └── common.ts
│   ├── actions/                            # Server Actions
│   │   ├── customers.ts
│   │   ├── therapists.ts
│   │   ├── rooms.ts
│   │   ├── services.ts
│   │   ├── bookings.ts
│   │   ├── payments.ts
│   │   └── audit.ts
│   ├── services/                           # Business logic
│   │   ├── scheduling.ts                   # Availability + slot finding
│   │   ├── booking-service.ts              # Create/cancel/reschedule
│   │   ├── payment-service.ts              # Payment link + webhook processing
│   │   └── notification-service.ts         # WhatsApp reminders
│   ├── chatbot/
│   │   ├── engine.ts                       # Conversation orchestration
│   │   ├── tools.ts                        # 6 approved tool definitions
│   │   ├── prompts.ts                      # System prompts
│   │   └── whatsapp-adapter.ts
│   ├── payments/
│   │   ├── provider.ts                     # Interface
│   │   ├── cardcom.ts                      # CardCom adapter
│   │   └── mock.ts
│   ├── whatsapp/
│   │   ├── client.ts
│   │   └── mock.ts
│   ├── utils/
│   │   ├── dates.ts                        # Asia/Jerusalem helpers
│   │   ├── errors.ts                       # AppError class
│   │   └── audit.ts                        # Audit log helper
│   └── types/index.ts
├── components/
│   ├── ui/                                 # shadcn/ui (auto-generated)
│   ├── admin/
│   │   ├── sidebar.tsx
│   │   ├── calendar-view.tsx
│   │   ├── booking-form.tsx
│   │   └── data-table.tsx
│   ├── booking/
│   │   ├── service-picker.tsx
│   │   ├── slot-picker.tsx
│   │   └── customer-form.tsx
│   └── chat/chat-widget.tsx
├── middleware.ts                            # Auth guard: /admin (super_admin only), /therapist (therapist only)

supabase/
├── config.toml
├── migrations/                             # (11 files as listed above)
└── seed.sql

.env.local.example
next.config.ts
tailwind.config.ts
tsconfig.json
components.json
package.json
```

### Key Environment Variables

See [`.env.local.example`](../../.env.local.example) — canonical list, kept current. Minimum to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ORDER_TOKEN_SECRET`. Production also needs `CRON_SECRET`. Real payment credentials only required when flipping `PAYMENTS_*_PROVIDER` off `mock`.

---

## 4. Phased Implementation Plan

### Phase 1: Foundations (~25 files) ✅ COMPLETE
**Goal:** Bootable app, Supabase connected, auth working, admin shell rendered.

- [x] `npx create-next-app@latest` with TypeScript, Tailwind, App Router, src dir
- [x] Install deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `date-fns`, `date-fns-tz`
- [x] `npx shadcn@latest init` + core components (button, input, card, table, dialog, select, calendar, toast)
- [x] `supabase init` + write all 12 migration files
- [x] Run migrations, verify schema (pushed to live Supabase project)
- [x] `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`
- [x] `src/middleware.ts` — redirect unauthenticated from `/admin/*` and `/therapist/*` to `/login`; enforce role checks (super_admin for /admin, therapist for /therapist)
- [x] `src/app/(auth)/login/page.tsx` — email/password login, post-login redirect based on role
- [x] `src/app/(auth)/callback/route.ts`
- [x] `src/app/admin/layout.tsx` — sidebar shell (super admin)
- [x] `src/app/admin/page.tsx` — placeholder dashboard
- [x] `src/app/therapist/layout.tsx` — therapist portal shell
- [x] `src/app/therapist/page.tsx` — placeholder "my bookings" dashboard
- [x] `.env.local.example`, `seed.sql`, update `README.md`
- [x] Super admin login → /admin verified
- [x] Therapist login → /therapist verified

**Depends on:** Nothing

### Phase 2: Admin CRUD (~30 files) ✅ COMPLETE
**Goal:** Full CRUD for therapists, rooms, services, customers with data tables.

- [x] Zod schemas: `therapist.ts`, `room.ts`, `service.ts`, `customer.ts`, `common.ts`
- [x] TypeScript types: `src/lib/types/index.ts`
- [x] Server actions: `therapists.ts`, `rooms.ts`, `services.ts`, `customers.ts`
- [x] `src/components/admin/data-table.tsx` — generic sortable/filterable table
- [x] Therapist pages (list, detail/edit, create) with availability rules + service assignment
- [x] Room pages with service assignment
- [x] Service pages
- [x] Customer pages (list, detail)
- [x] Therapist portal: `src/app/therapist/availability/page.tsx` — manage own weekly rules
- [x] Therapist portal: `src/app/therapist/time-off/page.tsx` — manage own time-off
- [x] Admin: invite therapist flow (create Supabase Auth user + profile with role=therapist + link to therapist record)
- [x] Admin: remove therapist (deactivate auth user + therapist record)
- [x] `src/lib/audit.ts` + wire audit logging into all actions (shipped at `src/lib/audit.ts`, not `src/lib/utils/audit.ts`; wired into therapists/rooms/services/customers/bookings actions)
- [x] `src/app/admin/audit-log/page.tsx` — filterable log viewer (entity type + action)

**Depends on:** Phase 1

### Phase 3: Scheduling Core (~15 files) ✅ COMPLETE
**Goal:** Availability engine, slot finding, booking CRUD, calendar view.

- [x] `src/lib/scheduling/availability.ts` — `getTherapistWindows()`, `findAvailableSlots()`, `validateBookingSlot()` (shipped under `lib/scheduling/` instead of `lib/services/scheduling.ts`)
- [x] `src/lib/schemas/booking.ts`
- [x] `src/lib/scheduling/booking-engine.ts` — `createBooking()`, `cancelBooking()`, `rescheduleBooking()`, `updateBookingStatus()`, `findSlots()` (shipped under `lib/scheduling/booking-engine.ts` instead of `lib/services/booking-service.ts`)
- [x] `src/lib/actions/bookings.ts`
- [x] `src/app/admin/bookings/new/page.tsx` — multi-step: service → therapist (filtered) → room (filtered) → slot → customer → create
- [x] `src/app/admin/bookings/page.tsx` — list with filters
- [x] `src/app/admin/bookings/[id]/page.tsx` — detail with cancel/reschedule/complete
- [x] `src/app/admin/calendar/page.tsx` — week/day view by therapist or room
- [x] Therapist time-off management UI (admin + therapist portal)
- [x] Room block management UI
- [x] Date/time helpers — inlined via `TZ` constant + `date-fns-tz` (no dedicated `src/lib/utils/dates.ts`)
- [x] Vitest unit tests for availability engine (31 tests)

**Depends on:** Phase 2

### Phase 4: Payments + Browser-Direct Booking ✅ COMPLETE (merges original Phase 4 + Phase 5)

**Goal:** Hosted payment pages for four methods, webhook processing, browser-direct
`/book` flow, Hebrew RTL `/order/<token>` finalization page, admin payment UI, soft-hold
cron. Original Phase 5 (customer booking flow) was absorbed because `/book` and
`/order/<token>` tightly share the payment pipeline.

Schema (applies to an existing DB):
- [x] Migration `00015_payments_and_holds.sql` — payment_method + payment_role enums,
      payment_status ADD VALUE 'authorized', columns on payments/bookings,
      service_voucher_mappings table with super_admin RLS
- [x] Migration `00016_payment_status_authorized_index.sql` — partial unique index
      enforcing one in-flight payment row per booking+role
- [x] Migration `00017_therapist_gender.sql` — therapist_gender + gender_preference
      enums, therapists.gender, bookings.therapist_gender_preference

Payment provider layer:
- [x] `src/lib/payments/types.ts` — HostedPaymentProvider, PosMoneyVoucherProvider,
      PosBenefitVoucherProvider interfaces + payment enums
- [x] `src/lib/payments/cardcom.ts` — SOAP adapter for CreateLowProfileDeal,
      GetLowProfileIndicator, RevokeLowProfileDeal, LowProfileChargeToken. Supports
      both BillOnly (capture) and CreateTokenOnly (cash-on-arrival verification)
- [x] `src/lib/payments/dts.ts` — DTS-Knowledge benefit voucher adapter
- [x] `src/lib/payments/vpay.ts` — VPay HMAC-authed client (proxy lands in Phase 4.5)
- [x] `src/lib/payments/mock.ts` — in-memory mocks for all three providers + demo seeds
- [x] `src/lib/payments/providers.ts` — env-gated real/mock factory
- [x] `src/lib/payments/policy.ts` — v1 cancellation-fee calculator (5% or 100 ILS cap)
- [x] `src/lib/payments/jwt.ts` — signed /order/<token> JWT helper
- [x] `src/lib/payments/hold.ts` — isHoldExpired pure predicate for server components

Orchestration + server actions:
- [x] `src/lib/payments/engine.ts` — initiatePayment, confirmFromWebhook (pull-through),
      redeem{Dts,Vpay}Voucher, markCashReceived, applyCancellationFee (stored-token
      penalty), expireHolds (cron sweeper). Every state change writes audit_logs.
- [x] `src/lib/actions/payments.ts` — JWT-gated pay-page actions + super_admin actions
- [x] `src/lib/actions/book.ts` — /book contact form handler (find-or-create customer,
      random therapist assignment under gender filter, JWT issue)
- [x] `src/lib/actions/voucher-mappings.ts` — admin CRUD for service_voucher_mappings
- [x] `src/lib/scheduling/booking-engine.ts` — createBooking now sets hold_expires_at
      and payment_method; findSlots accepts gender filter

Customer UI (Hebrew RTL, therapist-anonymized per policy):
- [x] `src/lib/i18n/he.ts` — Hebrew strings + Israel-locale formatters
- [x] `src/app/book/` — service grid → slot picker (dedupe by time, gender toggle) →
      contact form → handoff to /order/<token>
- [x] `src/app/order/[token]/page.tsx` — finalization page: summary + inline edit
- [x] `src/components/order/method-picker.tsx` — 4-radio method chooser
- [x] `src/components/order/cardcom-iframe.tsx` — embedded hosted-page iframe for
      credit_card_full + cash_at_reception
- [x] `src/components/order/voucher-dts-form.tsx` — 2-step DTS redemption
- [x] `src/components/order/voucher-vpay-form.tsx` — 2-step VPay redemption with
      partial-amount support
- [x] `src/app/order/[token]/return/page.tsx` — bridge from CardCom redirect
- [x] `src/app/order/[token]/success/page.tsx` — confirmation + idempotent Twilio SMS
      dispatch via bookings.sms_sent_at

Operational:
- [x] `src/app/api/webhooks/cardcom/[secret]/route.ts` — shared-secret-gated webhook
      with pull-through verification via GetLowProfileIndicator
- [x] `src/app/api/cron/expire-holds/route.ts` — 2-min sweep of expired pending_payment
      bookings, best-effort RevokeLowProfileDeal
- [x] `vercel.json` — region pin (fra1), cron schedule, per-route maxDuration

Admin UI additions:
- [x] Therapist admin: gender field (required on new, warning banner for legacy rows)
- [x] Service admin: VoucherMappingsSection with add/list/remove
- [x] Booking detail: PaymentPanel with rows table, "Mark cash received", "Apply
      cancellation fee"

Messaging:
- [x] `src/lib/messaging/twilio.ts` — sendSms wrapper, E.164 normalisation
- [x] `src/lib/messaging/templates/booking-confirmed-sms.ts` — Hebrew template,
      anonymous (no therapist name)

Quality:
- [x] Vitest tests — 127 passing across 10 files (61 new for phase 4 + 31 existing
      scheduling + 8 e2e smoke covering every method end-to-end)
- [x] `npm run lint` clean, `npm run build` succeeds
- [x] Dev-only CardCom webhook simulator (amber panel on /return) for end-to-end
      mock testing without a real provider

**Depends on:** Phase 3

### Phase 4.5: VPay Proxy on Fly.io (follow-up)

Deferred from Phase 4. Ships the real VPay SOAP client under `services/vpay-proxy/`
with mTLS / static IP as required by Verifone. Detailed plan:
`.cursor/plans/phase_4_payments_and_booking_*.plan.md` §14.

### Phase 4 QA: S1-S4 Defect Sweep (PRs #12, #13, #16) — COMPLETE

Closed the 32-item UAT backlog against Phase 4 across three PRs. Shipped in Phase A:
sonner toast + Radix AlertDialog primitives, `ConfirmButton` wrapper for every
destructive action, whole-ILS price input with agorot transform, 15-minute grid
snapping in `findAvailableSlots`, availability-rule schema tightening (end>start,
min shift, no overlap), reusable `SlotPicker` on reschedule, bookings list filter
bar + pagination, sticky action bar on booking detail, and audit-log entity
enrichment with deep links. Phase B added structured diff rendering, `RowLink`
full-row navigation, `DateTimePicker` replacing native `datetime-local`, voucher
SKU validation, customer Title-Case + "Add email" CTA, audit-log pagination,
calendar block customer/service visibility. Phase C added the `Breadcrumbs`
component across detail pages, clickable-week-header date picker, canonical
Title-Case status labels, `ActiveBadge` styling. Bumped `next` to `16.2.4` and
`vite` transitive to `8.0.10` (closed 4 Dependabot alerts). 161 tests green
across 12 files. PR #16 reverted the therapist avatar component per product call.

### Phase 5: Deferred Assignment (PR #10) — COMPLETE

Paid-but-unassigned bookings now flow through `/admin/assignments`. Customer
finishes payment → on-call manager receives SMS + WhatsApp alert (best-effort
fallback when Twilio creds are missing) → manager picks therapist → therapist
has 2 hours to confirm → manager re-alerted on timeout. Driven by
`00018_deferred_assignment.sql` migration (assignment_status enum +
pending_confirmation SLA), `/api/cron/assignment-monitor` cron (15-min),
`src/lib/messaging/on-call-manager.ts`, `src/lib/actions/assignments.ts`.

### Phase 4.6: Testable Deploy Unblockers — COMPLETE

One PR that unlocked `spa-me2.vercel.app` as a testable end-to-end
environment for admin / therapists / clients without any real payment
credentials. Three workstreams landed together:

- **Reset-password + localhost sweep.** The forgot-password flow now
  prefers `NEXT_PUBLIC_APP_URL` over `window.location.origin` so the
  email redirect is always the deployed domain. Six silent
  `|| "http://localhost:3000"` fallbacks across the actions were
  replaced with a hard-fail `getAppUrl()` helper in
  `src/lib/app-url.ts` — misconfigured prod env vars now throw loud
  errors instead of baking localhost into outbound emails.
- **Business hours + slot granularity.** New migration 00020 adds
  `business_hours_start` / `business_hours_end` / `slot_granularity_
  minutes` columns to `spa_settings` (defaults `09:00 / 21:00 / 60`).
  Settings UI exposes all three. `findAvailableSlots` reads spa
  settings, clips therapist availability windows to the spa-wide
  business hours, and emits slot starts at the configured granularity.
  On a 60-min grid with a 90-min service, a 10:00 booking blocks the
  11:00 slot (would run past 12:00-service-end if placed). First
  bookable start each day is 09:00; last is 19:00 when the service
  duration is 90 min.
- **Mock payment UX.** A first-party test-mode CardCom form replaces
  the hosted-page iframe when `PAYMENTS_CARDCOM_PROVIDER=mock`: fake
  16-digit card + expiry + CVV fields, any input accepted, 1-sec
  spinner, auto-confirm via the existing `simulateCardcomWebhook
  Action` path. DTS + VPay voucher forms carry TEST MODE banners with
  demo-card hints. A global amber TEST MODE strip sits at the top of
  every `/order/[token]/*` page when any provider is mocked.

The `simulateCardcomWebhookAction` guard was loosened from
`NODE_ENV=production` to `PAYMENTS_CARDCOM_PROVIDER=real` so the mock
path works in production as long as the provider env is set to mock.

### Confirmed decisions (Phase 4.6)

- Spa operating hours default to **09:00-21:00**, admin-editable.
- Slot granularity defaults to **60 minutes** ("treatments start on
  the hour only"). 15 and 30 remain allowed values in the schema.
- `APP_URL` and `NEXT_PUBLIC_APP_URL` are **required** in production —
  no silent localhost fallback anywhere in the actions.

### Phase 5.5: Operator Reality Check & Calendar for 20 Therapists (PRs #15, #17) — COMPLETE

11 SPA-* items shipped against the real spa scale (~20 therapists, multiple
receptionists):

- **SPA-006** Typeahead customer combobox + inline "Create new customer" on
  New Booking.
- **SPA-005** Operational dashboard (today's agenda, pending payment,
  unassigned today, today's revenue).
- **SPA-003 (lite)** Global `⌘K` search popover in the sidebar — customers,
  active therapists, bookings.
- **SPA-030** Resource view on calendar — columns per therapist, filter-first
  (up to 8 selected therapists become columns).
- **SPA-008** Per-therapist multi-select filter, URL-synced with
  `localStorage` default.
- **SPA-033 (remainder)** Month view with per-day booking counts.
- **SPA-032** Click any empty half-hour cell on calendar → New Booking form
  prefilled with date / start time / therapist.
- **SPA-133** Unsaved-changes guard (`DirtyFormGuard`) on customer / therapist
  / service / room / settings forms.
- **SPA-101** Phone E.164 normalization + duplicate-detection warning on
  customer create.
- Customer + Therapist list pagination + search applied to both lists.
- **Vercel Web Analytics** (PR #17) — `@vercel/analytics` in root layout,
  auto page-view tracking.

### Phase 6: Chatbot Foundation (~15 files)

**Reshaped for SpaMeV3** — reframed as a first-party WhatsApp Business Cloud
platform (a "Texter-alike" — see https://texterchat.com for the market
reference). **Do not implement in this repo.** Twilio SMS confirmations
shipped in Phase 4 stay in production; the conversational / bot layer lives in
SpaMeV3.

**Original V2 goal (now deferred):** AI conversation engine with WhatsApp +
web chat.

- [ ] `src/lib/chatbot/tools.ts` — 6 tool function definitions mapping to server actions
- [ ] `src/lib/chatbot/prompts.ts` — constraining system prompt
- [ ] `src/lib/chatbot/engine.ts` — `processMessage()`: load history, call Claude API, execute tools, save messages
- [ ] `src/lib/whatsapp/client.ts` — send messages, mark as read
- [ ] `src/lib/whatsapp/mock.ts`
- [ ] `src/lib/chatbot/whatsapp-adapter.ts`
- [ ] `src/app/api/webhooks/whatsapp/route.ts` — GET (verify) + POST (receive + respond)
- [ ] `src/app/api/chat/route.ts` — streaming web chat endpoint
- [ ] `src/app/chat/page.tsx` + `src/components/chat/chat-widget.tsx`
- [ ] `src/lib/services/notification-service.ts`
- [ ] `src/app/api/cron/reminders/route.ts`

**Depends on:** Phases 4, 5

### Phase 7: Staff Inbox & Polish (~10 files)
**Goal:** Escalated conversation management, real-time updates, final polish.

- [ ] `src/app/admin/inbox/page.tsx` — open threads, sorted/filtered
- [ ] `src/app/admin/inbox/[threadId]/page.tsx` — message history, staff reply, close thread
- [ ] Supabase Realtime for inbox + calendar
- [ ] Dashboard metrics: today's bookings, pending payments, open threads
- [ ] Loading states, error handling, toast notifications throughout
- [ ] RTL groundwork (`dir="rtl"` support in layout)
- [ ] Final README update
- [ ] End-to-end manual testing

**Depends on:** Phase 6

---

## 5. Risks and Tradeoffs

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Exclusion constraint with WHERE clause may not work on Supabase Postgres | Overlap prevention fails | Test in first migration run. Fallback: advisory lock + check-then-insert in transaction |
| Israeli payment provider API quirks (Hebrew docs, inconsistent behavior) | Payment flow broken | `PaymentProvider` interface allows swapping. Start with mock adapter |
| WhatsApp Business API approval delay (days to weeks) | Chatbot blocked | Build with mock adapter. Design flows to work within 24h session window |
| AI tool call reliability — invalid params, misinterpreted intent | Bad bookings | Zod-validate all tool params. Require customer confirmation. `handoff_to_staff` escape hatch |
| Israel DST transitions — ambiguous/skipped hours | Wrong slot times | Store all times as TIMESTAMPTZ. Use `date-fns-tz` with `Asia/Jerusalem`. Never use server local time |
| Concurrent booking race conditions | Double-booking | Exclusion constraint rejects at DB level. App catches constraint error → "slot no longer available" |

### Acceptable V1 Shortcuts

- No real-time calendar until Phase 7 (polling/refresh is fine)
- No i18n framework — hardcode Hebrew strings directly
- No email notifications — WhatsApp is primary channel
- Simple role model — all authenticated staff are admins
- 161 Vitest tests across 12 files cover scheduling, payments, availability, and the unassigned-booking matcher. CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + build on every push and PR.
- Single payment provider, no multi-provider routing
- No job queue — webhook/WhatsApp processing is synchronous in route handlers
- Price as integer (agorot) not decimal — UI handles display conversion

### Key Tradeoffs

- **Monolith over microservices** — appropriate for V1. Service layer (`lib/services/`) enables extraction later
- **Supabase Auth over custom auth** — faster, but locks admin users into Supabase auth model
- **Server Actions over tRPC** — simpler, native Next.js, Zod compensates for type boundary

---

## 6. Assumptions

### Confirmed
- **Payment provider:** CardCom (hosted page) + DTS benefit vouchers + VPay stored-value vouchers
- **Payment requirement:** Optional for super admin (can confirm directly), required for customer/chatbot bookings
- **Buffer time:** Configurable per service (`buffer_minutes` on services table)
- **UI language:** English for admin; Hebrew customer-facing (/book, /order) shipped in Phase 4
- **Cash-on-arrival:** Secured by CardCom token (CreateTokenOnly with Shva J-validation),
  NOT a symbolic 1 NIS charge. Penalty captured via LowProfileChargeToken on late
  cancel / no-show per the 5%-or-100-ILS policy (v1_5pct_or_100ILS_min snapshot).
- **Therapist identity:** anonymous across customer surfaces (/book, /order, SMS).
  Admin + therapist portals retain full identity. Customer picks gender preference
  (male / female / any); server assigns a random eligible therapist at booking time.

### Still Assuming (flag if wrong)
1. **Single location** — no multi-branch logic needed
2. **Two roles implemented today** — `super_admin` (full access) and `therapist` (own availability + own bookings read-only). Front-desk receptionists share the `super_admin` role in V1; a dedicated `receptionist` role with limited permissions is deferred (SPA-137).
3. **Slot granularity** — 15-minute increments
4. **Operating hours** — per-therapist only (no spa-wide override)
5. **WhatsApp account** — needs to be set up (build with mock first)
6. **Supabase/Vercel** — Pro plans for production (free tier for dev)
7. **Customer identity** — identified by phone only, no login/accounts

---

## Verification Strategy

After each phase, verify:
- `npm run build` succeeds (no TypeScript errors)
- `supabase db reset` runs all migrations cleanly
- Key flows work locally via browser testing
- Exclusion constraints tested in Phase 3 with concurrent insert attempts
- Payment webhook tested with mock adapter in Phase 4
- Chatbot tool calls tested with mock WhatsApp in Phase 6
