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
├── 00003_profiles.sql            (profiles table + trigger on auth.users insert)
├── 00004_core_tables.sql         (customers, therapists, rooms, services w/ buffer_minutes)
├── 00005_junction_tables.sql     (therapist_services, room_services)
├── 00006_scheduling_tables.sql   (availability_rules, time_off, room_blocks)
├── 00007_bookings.sql            (bookings + exclusion constraints)
├── 00008_payments.sql
├── 00009_conversations.sql
├── 00010_audit_log.sql
├── 00011_triggers.sql            (updated_at trigger applied to all tables)
└── 00012_rls_policies.sql        (role-based: super_admin full, therapist own-data)
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

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
PAYMENT_PROVIDER=cardcom (or 'mock')
CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME, CARDCOM_WEBHOOK_SECRET
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
ANTHROPIC_API_KEY
APP_URL
```

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

### Phase 2: Admin CRUD (~30 files)
**Goal:** Full CRUD for therapists, rooms, services, customers with data tables.

- [ ] Zod schemas: `therapist.ts`, `room.ts`, `service.ts`, `customer.ts`, `common.ts`
- [ ] TypeScript types: `src/lib/types/index.ts`
- [ ] Server actions: `therapists.ts`, `rooms.ts`, `services.ts`, `customers.ts`
- [ ] `src/components/admin/data-table.tsx` — generic sortable/filterable table
- [ ] Therapist pages (list, detail/edit, create) with availability rules + service assignment
- [ ] Room pages with service assignment
- [ ] Service pages
- [ ] Customer pages (list, detail)
- [ ] Therapist portal: `src/app/therapist/availability/page.tsx` — manage own weekly rules
- [ ] Therapist portal: `src/app/therapist/time-off/page.tsx` — manage own time-off
- [ ] Admin: invite therapist flow (create Supabase Auth user + profile with role=therapist + link to therapist record)
- [ ] Admin: remove therapist (deactivate auth user + therapist record)
- [ ] `src/lib/utils/audit.ts` + wire audit logging into all actions
- [ ] `src/app/admin/audit-log/page.tsx`

**Depends on:** Phase 1

### Phase 3: Scheduling Core (~15 files)
**Goal:** Availability engine, slot finding, booking CRUD, calendar view.

- [ ] `src/lib/services/scheduling.ts` — `getTherapistAvailability()`, `findAvailableSlots()`, `validateBookingSlot()`
- [ ] `src/lib/schemas/booking.ts`
- [ ] `src/lib/services/booking-service.ts` — `createBooking()`, `cancelBooking()`, `rescheduleBooking()`, `completeBooking()`, `markNoShow()`
- [ ] `src/lib/actions/bookings.ts`
- [ ] `src/app/admin/bookings/new/page.tsx` — multi-step: service → therapist (filtered) → room (filtered) → slot → customer → create
- [ ] `src/app/admin/bookings/page.tsx` — list with filters
- [ ] `src/app/admin/bookings/[id]/page.tsx` — detail with cancel/reschedule/complete
- [ ] `src/app/admin/calendar/page.tsx` — week/day view by therapist or room
- [ ] Therapist time-off management UI
- [ ] Room block management UI
- [ ] `src/lib/utils/dates.ts`

**Depends on:** Phase 2

### Phase 4: Payments (~10 files)
**Goal:** Hosted payment pages, webhook processing, booking status updates.

- [ ] `src/lib/payments/provider.ts` — `PaymentProvider` interface
- [ ] `src/lib/payments/cardcom.ts` — CardCom hosted page API
- [ ] `src/lib/payments/mock.ts` — mock (auto-confirms)
- [ ] `src/lib/services/payment-service.ts` — `initiatePayment()`, `processWebhook()`
- [ ] `src/lib/actions/payments.ts`
- [ ] `src/app/api/webhooks/payment/route.ts` — verify signature, idempotent processing
- [ ] `src/lib/schemas/payment.ts`
- [ ] "Send Payment Link" button on booking detail
- [ ] Payment status display on booking list/detail

**Depends on:** Phase 3

### Phase 5: Customer Booking Flow (~10 files)
**Goal:** Public-facing self-service booking.

- [ ] `src/app/book/layout.tsx`
- [ ] `src/app/book/page.tsx` — service selection
- [ ] `src/app/book/slots/page.tsx` — date picker + slot grid
- [ ] `src/app/book/confirm/page.tsx` — review + customer details
- [ ] `src/app/book/payment-return/page.tsx` — post-payment confirmation
- [ ] `src/components/booking/service-picker.tsx`, `slot-picker.tsx`, `customer-form.tsx`
- [ ] Server action: find-or-create customer by phone, create booking, initiate payment, redirect

**Depends on:** Phase 4

### Phase 6: Chatbot Foundation (~15 files)
**Goal:** AI conversation engine with WhatsApp + web chat.

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
- No automated tests Phase 1-2; add integration tests for scheduling in Phase 3
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
- **Payment provider:** CardCom
- **Payment requirement:** Optional for super admin (can confirm directly), required for customer/chatbot bookings
- **Buffer time:** Configurable per service (`buffer_minutes` on services table)
- **UI language:** English for admin; Hebrew customer-facing deferred

### Still Assuming (flag if wrong)
1. **Single location** — no multi-branch logic needed
2. **Two roles only** — super_admin (full access) and therapist (own availability + own bookings read-only). No intermediate roles.
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
