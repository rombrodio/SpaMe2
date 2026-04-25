# SpaMe — Comprehensive Implementation Plan

## Context

SpaMe is a custom spa management platform replacing Biz-Online for a boutique Tel Aviv spa. It fuses — tailored to spa operations — the functional surface of **BizOnline** (booking + payment), **ShiftOrganizer** (staff shifts / availability), and **Texter** (WhatsApp Business + AI conversational platform), with AI-assisted automation as a first principle so the manager and staff can run operations with as little manual intervention as possible. **Everything ships in a single codebase in this repository**; the earlier "SpaMeV3" split is dropped.

This plan covers architecture, database schema, folder structure, phased implementation, risks, and assumptions — all scoped to V1 only.

### Revised vision summary (2026-04-25)

**Four roles**

- **Super Admin** — full access: calendar, bookings, all entities, settings, audit log, reports, full Texter inbox visibility.
- **Receptionist** — primary surface is the Texter-style `/reception/inbox`: live visibility into every active customer conversation (including bot-handled ones), take-over at any moment, AI-assisted writing, quick replies in EN/HE/RU, can create bookings (optionally picking a therapist), submits own on-duty (chat + phone) windows. Does **not** manage therapists / services / rooms / settings / audit log and does **not** receive therapist assignment receipts.
- **Therapist** (~20, mixed patterns) — submits own availability + time-off, confirms deferred-assignment requests via WhatsApp within a 2-hour SLA, read-only view of own bookings.
- **Customer** — phone-identified and anonymous. No login, no accounts. Picks language on first interaction; never sees therapist names.

**Customer experience principles**

- Phone (E.164) is the unique identifier; customer record stores information without credentials.
- Required at booking: phone, full name, **customer gender**, preferred-therapist gender, date/time. Email optional.
- Therapist anonymity is non-negotiable on every customer surface (`/book`, `/order`, WhatsApp replies, outbound SMS).
- Customer language wins: three-way (HE / EN / RU) first-class support for every user including customers, auto-detected on first inbound message and persisted on the customer record.
- Three booking paths (browser `/book`, WhatsApp, receptionist), **one source of truth** (same DB, same overlap constraints, same payment pipeline, same lifecycle).
- Customer-facing and AI-driven bookings create an **unassigned** booking; a manager assigns a qualified therapist post-payment. Receptionists and super admins creating bookings manually may pick a therapist directly.
- Payment is real. Cash-on-arrival is secured by a CardCom token, not a token charge. Cancellation policy (5% or 100 ILS, whichever greater) is enforced via stored card token. Payment webhooks are the only authoritative confirmation source.

**AI / automation thesis — four layers**

- **Layer 1 — Self-service customer booking** (shipped) — `/book` → `/order/[token]` flow is fully automated. Bookings land in the manager-assignment queue post-payment.
- **Layer 2 — AI conversational booking** (Phase 8) — AI agent reads inbound WhatsApp / web messages, drafts replies, proposes tool calls from the approved list. Precise escalation thresholds are an open question to be answered by analysing the spa's last 12 months of WhatsApp conversations and iterating.
- **Layer 3 — Receptionist Texter** (Phase 8) — `/reception/inbox` is the receptionist's primary work surface: live monitoring + takeover + AI handoff summary (2–3 sentences) + in-chat booking panel + AI writing-assist (translate / shorten / soften / draft from bullets) + inbound auto-translation when customer ≠ receptionist language.
- **Layer 4 — Operational AI (narrow V1 scope)** — predictive no-show scoring as an **advisory** signal (surfaced on booking detail + in-chat booking panel, never blocks). Explicitly **not** in V1: AI assigning therapists, smart auto-assignment scoring, auto-rebook on sick-outs.

**Two hardest invariants (never relaxed)**

1. AI never writes to the database directly. It only calls the same Zod-validated server actions the staff use.
2. AI never assigns a therapist in V1. Therapist assignment is human-only: managers assign, therapists confirm via WhatsApp within 2 hours.
3. Every AI-drafted outbound reply is **receptionist-approved** in the Texter inbox. Full auto-send mode is not in V1.

### Confirmed Decisions

- **Payment:** Optional for super admin (can confirm bookings directly without payment); required for customer self-booking and chatbot.
- **Buffer time:** Configurable per service (`buffer_minutes` column on `services` table).
- **Services:** 45 minutes treatment + 15 minutes buffer by default (operator decision, migration 00021).
- **Business hours:** 09:00–21:00, admin-configurable, with 15/30/60-minute slot granularity (60 default).
- **UI language:** Hebrew is the default for every surface; English and Russian are first-class for all users (admin, therapist, receptionist, customer). Per-user toggle; customer language auto-detected on first inbound message and persisted. Shipping in **Phase 7**.
- **Payment provider:** CardCom (hosted page + webhooks) + DTS benefit vouchers + VPay stored-value vouchers.
- **Roles:** `super_admin`, `receptionist`, `therapist`. Receptionist role lands in **Phase 6**.
- **Therapist identity:** anonymous on every customer surface. Customer picks gender preference; server assigns a random eligible therapist at assignment time.
- **Customer identity:** phone-only (E.164), no login, no accounts, no self-service history page.
- **Cash-on-arrival:** CardCom token (CreateTokenOnly with Shva J-validation); penalty captured via LowProfileChargeToken per 5%-or-100-ILS policy.
- **VPay carve-out:** `services/vpay-proxy/` lives in this repo but deploys to Fly.io (mTLS + static IP). Same source of truth, different deploy target.

---

## 1. Architecture Plan

### System Overview

Next.js App Router monolith on Vercel, backed by Supabase (Postgres + Auth). Three surfaces, two external integrations.

### Auth & Roles

Three authenticated user types via Supabase Auth, distinguished by a `role` column in a `profiles` table:

1. **Super Admin** — full CRUD on every entity. Owns the calendar, bookings, therapists, rooms, services, customers, settings, audit log, reports, and has full Texter inbox visibility.
2. **Receptionist** (Phase 6) — primary surface is `/reception/inbox`. Can:
   - Monitor every active customer conversation in real time (including bot-handled ones)
   - Take over from the bot at any moment
   - Create bookings on behalf of customers — may pick a therapist directly or leave unassigned for the manager
   - Submit own on-duty (chat + phone) availability windows
   - Use quick-reply templates + AI writing-assist (translate, shorten, soften, draft from bullets) in EN/HE/RU
   - Approve / edit / reject every AI-drafted outbound reply before it sends
   
   Explicitly cannot: manage therapists / services / rooms / settings / audit log, receive therapist assignment receipts, do shift-swap or approval work.
3. **Therapist** — submits own availability rules and time-off, confirms deferred-assignment requests via WhatsApp (2-hour SLA), read-only view of own bookings.

Customers are NOT Supabase Auth users — identified by phone number (E.164) only.

### Surfaces

1. **Admin Dashboard** (`/admin/*`) — Super Admin: full access. Receptionist/Therapist: redirected to their own portal.
2. **Receptionist Portal** (`/reception/*`, Phase 6–8) — `/reception/inbox` is the primary Texter-style staff surface; `/reception/availability` for on-duty windows; `/reception/bookings/new` for phone/walk-in bookings (can pick therapist).
3. **Therapist Portal** (`/therapist/*`) — Behind Supabase Auth. Therapists manage their own availability, view their bookings.
4. **Customer Booking Flow** (`/book/*`) — Public pages. Service selection → slot picker → customer details (phone + name + gender + preferred-therapist gender + email optional) → redirect to hosted payment page → confirmation. Booking lands unassigned.
5. **Web Chat** (`/chat/*`, Phase 8) — Embeddable chat widget mirroring the WhatsApp conversational flow; all replies pass through the same Texter inbox approval rail.

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

### AI Conversational Layer (Phase 8, in-repo)

- Receives messages from the WhatsApp webhook or web chat endpoint.
- Calls the LLM with a system prompt constraining it to an approved tool list. Each tool maps to a Zod-validated server action — the AI never writes to the DB directly and never assigns a therapist (hard invariants).
- Drafts outbound replies into a pending-send queue visible in `/reception/inbox`. **A receptionist approves / edits / rejects every send in V1.** Full auto-send mode is deferred.
- Starter tool list (not final — will grow as usage patterns are analysed):
  `find_available_slots`, `create_tentative_booking`, `create_payment_link`, `reschedule_booking`, `cancel_booking`, `handoff_to_staff`, `translate_message`, `summarize_thread`, `compose_reply`.
- Inbound auto-translation and a 2–3 sentence AI handoff summary accompany every conversation opened in the receptionist inbox.

### Key Data Flows

**Admin booking (with payment):** Select service/therapist/room/time → Server Action validates overlaps (Postgres exclusion constraint) → Booking(pending_payment) → payment link generated → customer pays → webhook → Booking(confirmed)

**Admin booking (skip payment):** Same flow but super admin clicks "Confirm without payment" → Booking(confirmed) directly. Only super admins can do this (not therapists). Audit log records which admin bypassed payment.

**Chatbot booking (Phase 8):** Customer message → webhook → conversation engine → AI calls `find_available_slots` → drafts a reply with options → **receptionist approves in the inbox** → reply sent → customer picks → `create_tentative_booking` (unassigned) → `create_payment_link` → sends link → customer pays → webhook → Booking(pending_assignment) → manager assigns a qualified therapist → therapist confirms via WhatsApp within 2h SLA → Booking(confirmed).

---

## 2. Database / Schema Plan

All tables use UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` timestamps. `updated_at` maintained by trigger.

### Auth Tables

**profiles** — `id` (UUID, FK to `auth.users`), `role` ('super_admin' | 'receptionist' | 'therapist'), `therapist_id` (UUID nullable, FK to `therapists` — set when role='therapist' to link Supabase Auth user to therapist record), `language` ('he' | 'en' | 'ru', default 'he', Phase 7), `created_at`, `updated_at`. Created via trigger on `auth.users` insert.

This allows: super admin invites therapist or receptionist via Supabase Auth → profile created with role + linked record → the new user logs in and lands on their portal.

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

**customers** — `id`, `full_name`, `phone` (UNIQUE, E.164), `email`, `gender` ('male' | 'female' | 'other', Phase 9), `language` ('he' | 'en' | 'ru', auto-detected on first inbound, Phase 7), `notes`, `created_at`, `updated_at`

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
├── 00020_business_hours.sql                 (spa-wide business hours + slot granularity)
├── 00021_service_durations_45min.sql        (all services → 45 min + 15 min buffer)
├── 00022_receptionist_role_enum.sql         (user_role += 'receptionist')
├── 00023_receptionist_tables.sql            (receptionists + receptionist_availability_rules
│                                              + RLS extended for the receptionist role)
└── 00024_booking_source.sql                 (bookings.source: customer_web | admin_manual |
                                              receptionist_manual | chatbot)
```

### Pending migrations (by phase)

```
Phase 7 — Localization
  00025_language_columns.sql                 (profiles.language, customers.language,
                                              defaults 'he')
Phase 8 — Conversational platform
  00026_conversations_extensions.sql         (conversation_messages.ai_draft_of,
                                              approval state enum, translations table)
Phase 9 — Customer profile + reports
  00027_customer_gender.sql                  (customers.gender enum, required at
                                              booking time going forward)
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
│   │   ├── reports/                        # Phase 9 — fixed reports + CSV
│   │   │   └── page.tsx
│   │   ├── settings/page.tsx
│   │   ├── assignments/page.tsx
│   │   └── audit-log/page.tsx
│   ├── reception/                          # Phase 6–8 (receptionist portal)
│   │   ├── layout.tsx
│   │   ├── page.tsx                        # Dashboard (today + own on-duty window)
│   │   ├── availability/page.tsx           # On-duty chat + phone windows (Phase 6)
│   │   ├── bookings/new/page.tsx           # Create booking (may pick therapist, Phase 6)
│   │   └── inbox/                          # Texter-style staff inbox (Phase 8)
│   │       ├── page.tsx                    # Live thread list (Supabase Realtime)
│   │       └── [threadId]/page.tsx         # Conversation + AI draft approval + booking panel
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
│   ├── conversations/                      # Phase 8 — replaces the old chatbot/ sketch
│   │   ├── engine.ts                       # processInbound(): history → translate → LLM → draft
│   │   ├── tools.ts                        # Zod tool schemas → server actions
│   │   ├── prompts.ts                      # System prompt + hard-rule guards
│   │   ├── approval.ts                     # approveDraft / editAndApprove / rejectDraft
│   │   ├── translation.ts                  # inbound + outbound auto-translation
│   │   ├── summary.ts                      # 2-3 sentence handoff summary
│   │   └── no-show-scoring.ts              # advisory risk score
│   ├── i18n/                               # Phase 7
│   │   ├── config.ts                       # locales list, default, fallback
│   │   ├── catalogs/he.json
│   │   ├── catalogs/en.json
│   │   └── catalogs/ru.json
│   ├── reports/                            # Phase 9
│   │   ├── queries.ts
│   │   └── csv.ts
│   ├── payments/
│   │   ├── provider.ts                     # Interface
│   │   ├── cardcom.ts                      # CardCom adapter
│   │   └── mock.ts
│   ├── whatsapp/
│   │   ├── client.ts                       # Meta WhatsApp Cloud API (Phase 8)
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
├── middleware.ts                            # Auth guard: /admin (super_admin), /reception (receptionist), /therapist (therapist)

services/                                    # Phase 4.5 / 8 — non-Vercel deploys
└── vpay-proxy/                              # mTLS + static-IP Fly.io proxy (Phase 4.5)

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

### Phase 4.6.1 — Post-deploy QA fixes

Follow-on fixes inside the same PR once UAT started against the
deployed preview:

- **Password reset robustness.** `/callback` route now handles both
  PKCE (`?code=`) and OTP (`?token_hash=&type=`) flows and surfaces
  Supabase verification errors back to `/login?error=...` instead of
  silently redirecting. Root `/` page forwards any `code` /
  `token_hash` / `error` query params into `/callback` so reset emails
  still work when Supabase's Site URL is misaligned. Login page reads
  the `?error=` param and shows the real Supabase message. Dashboard
  ops steps documented in `README.md`.
- **Delete confirmation uses a stable ASCII keyword.** Therapist,
  customer, and service delete dialogs now require typing `DELETE`
  (was the record's Hebrew full name, which was effectively impossible
  to type correctly on an IL keyboard).
- **Service durations normalised.** New migration
  `00021_service_durations_45min.sql` sets every service to
  `duration_minutes = 45, buffer_minutes = 15`. Customer-facing
  booking UI shows 45 min treatments; scheduler still occupies a full
  hour (45 + 15 buffer) per slot. Seed file updated.
- **Assignments screen: all future unassigned by default.**
  `getAssignmentScreenData` accepts `scope: "all" | "date"` (default
  `all`). "All future" groups bookings by day to keep matcher
  feasibility meaningful per day, then merges into one chronological
  list. A date filter stays available as optional narrowing.
- **Booking creation time on the bookings list.** New `Created`
  column on `/admin/bookings`, tooltip shows full timestamp.
  Assignments screen also shows each booking's creation time.

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

### Phase 6: Receptionist role + portal — COMPLETE

Promoted the receptionist from a deferred backlog ticket (SPA-137) to a
first-class role with its own portal. Gates Phase 7 (i18n across three
roles) and Phase 8 (the Texter inbox lives at `/reception/inbox`).

Shipped in one PR:

- **Migration 00022** — `user_role` enum adds `'receptionist'` (standalone so the new value is usable in subsequent migrations; Postgres rejects enum ADD VALUE + use in the same transaction).
- **Migration 00023** — `receptionists` entity + `profiles.receptionist_id` FK + `receptionist_availability_rules` table + `get_user_receptionist_id()` helper + RLS policies. `bookings` + `customers` + `therapists` + `rooms` + `services` + junction/scheduling tables' USING clauses extended to allow receptionists to read (customers also allow insert/update so receptionists can register walk-ins).
- **Migration 00024** — `booking_source` enum (`customer_web` / `admin_manual` / `receptionist_manual` / `chatbot`) + `bookings.source` column + back-fill for existing rows.
- **Server actions** — `src/lib/actions/receptionists.ts` (CRUD + invite flow that explicitly sets `profiles.role='receptionist'` after `inviteUserByEmail` since the default-trigger role is `'therapist'`) + own-availability CRUD + `createReceptionistBookingAction` pinning `source='receptionist_manual'`. `src/lib/actions/book.ts` pins `customer_web`; `src/lib/actions/bookings.ts` (admin) pins `admin_manual`.
- **Middleware** — three-role guard using the extracted `src/lib/roles.ts` helpers (`portalForRole`, `allowedOrRedirect`). `/reception/*` accepts receptionist + super_admin per the vision (super admin has full visibility).
- **Admin UI** — `/admin/receptionists` list + new + detail (mirrors therapist shape, simpler schema), sidebar entry, `Source` column on `/admin/bookings` list, provenance badge on booking detail.
- **Reception portal** — `/reception` dashboard (pending-payment / unassigned / today tiles + own on-duty rules), `/reception/availability` (own rules), `/reception/bookings/new` (reuses `BookingForm` with `submitAction` + `successRedirect` props), `/reception/bookings` (read-only list with source badges).
- **BookingForm reuse** — `src/components/admin/booking/booking-form.tsx` now accepts `submitAction` + `successRedirect` props so the same form renders for admin and reception with no duplication.
- **Vitest** — 24 new tests (186 total): role × portal matrix via `allowedOrRedirect`, receptionist Zod schemas (entity + availability rule edge cases).

**Explicit non-goals (deferred to later phases):**

- Receptionist inbox UI (Phase 8)
- AI-draft approval rail (Phase 8)
- Localization — new strings are in English, to be extracted into catalogs in Phase 7
- Multi-mode on-duty window (chat vs phone separately) — V1 is one combined window
- Shift-swap / approval / payroll-adjacent flows

### Phase 7: Localization (HE / EN / RU) (~20 files)

**Goal:** Hebrew default with first-class English and Russian support across every surface. Per-user toggle for staff; customer language auto-detected on first inbound message and persisted on the customer record.

- [ ] Pick + install i18n framework (candidate: `next-intl` for App Router compatibility)
- [ ] Migration `00023_language_columns.sql` — `profiles.language` + `customers.language` enums, default `'he'`
- [ ] `src/lib/i18n/` — loader, per-locale JSON catalogs, `useTranslations()` hooks, locale router
- [ ] Extract existing HE strings from `src/lib/i18n/he.ts` into the catalog
- [ ] Extract existing EN admin strings (currently hardcoded in components) into the EN catalog
- [ ] Author RU catalog for admin + therapist + reception + customer surfaces (≈ N keys — scoped when we extract)
- [ ] Per-user language toggle in navbar for staff; persist to `profiles.language`
- [ ] Customer language detection on first inbound message (heuristic on character set + greeting phrases), written to `customers.language`; manual override in customer detail
- [ ] RTL groundwork — `dir="rtl"` toggled per-user based on active locale; Tailwind logical properties where needed
- [ ] All error messages / toasts / emails / SMS templates / PDF receipts translated
- [ ] CI lint rule: no literal user-facing strings outside the catalog (via a custom ESLint rule or `no-literal-string` plugin)
- [ ] Vitest snapshot tests for each locale on the booking flow
- [ ] Docs: DOC-SYNC row added — *"if you add a user-facing string, add it to all three locale catalogs in the same commit"*

**Depends on:** Phase 6 (three roles is what justifies the framework overhead).

### Phase 8: Conversational platform (WhatsApp + Web Chat + AI) (~30 files)

**Goal:** The Texter-alike WhatsApp Business + web chat platform, fully in-repo. Inbound conversations stream into `/reception/inbox`; the AI drafts replies that a receptionist approves before send; booking actions are reachable from an in-chat booking panel.

- [ ] Migration `00024_conversations_extensions.sql`:
  - `conversation_messages.ai_draft_of` (nullable FK — links an approved send back to the AI draft it originated from)
  - `conversation_messages.approval_state` enum (`pending_approval`, `approved`, `edited`, `rejected`, `sent`, `received`)
  - `conversation_messages.translated_from` + `translated_to` for auto-translation records
  - `conversation_threads.handoff_summary` (text, AI-generated 2–3 sentences cached per open thread)
- [ ] `src/lib/conversations/engine.ts` — `processInbound()`: load history, detect language, auto-translate, call LLM, produce pending-send draft
- [ ] `src/lib/conversations/tools.ts` — Zod-validated tool schemas, each maps to a server action in `src/lib/actions/`
- [ ] `src/lib/conversations/prompts.ts` — system prompt with hard rules (never assign therapist, never confirm payment, never contradict operator-set business hours)
- [ ] `src/lib/conversations/approval.ts` — `approveDraft()`, `editAndApprove()`, `rejectDraft()` server actions
- [ ] `src/lib/conversations/translation.ts` — inbound/outbound translation, cached per message
- [ ] `src/lib/conversations/summary.ts` — `generateHandoffSummary(threadId)` callable on open and on takeover
- [ ] `src/lib/conversations/no-show-scoring.ts` — advisory scorer returning `{score, reasons[]}`; surfaced on booking detail + in-chat booking panel
- [ ] `src/lib/whatsapp/client.ts` + `mock.ts` — Meta WhatsApp Cloud API send / mark-as-read
- [ ] `src/app/api/webhooks/whatsapp/route.ts` — GET verify + POST receive
- [ ] `src/app/api/chat/route.ts` — embeddable web-chat inbound endpoint
- [ ] `src/app/chat/page.tsx` + `src/components/chat/chat-widget.tsx` — customer-facing chat widget
- [ ] `src/app/reception/inbox/page.tsx` — live list of open threads (Supabase Realtime subscription)
- [ ] `src/app/reception/inbox/[threadId]/page.tsx` — conversation UI with:
  - pending AI draft + approve / edit / reject controls
  - inbound auto-translation toggle
  - AI handoff summary pinned to the top
  - quick-reply picker in EN/HE/RU
  - AI writing-assist tools (translate / shorten / soften / draft from bullets) for receptionist-typed messages
  - in-chat booking panel (find slots, create tentative booking, send payment link, reschedule, cancel) — same server actions as `/admin/bookings/new`
- [ ] `src/app/api/cron/reminders/route.ts` — appointment reminders via WhatsApp (falls back to Twilio SMS if WhatsApp opt-out)
- [ ] Vitest coverage for engine + tools + approval state machine + no-show scorer

**Depends on:** Phases 6, 7.

**Explicit non-goals:** fully-autonomous AI replies; AI assigning therapists; auto-rebook on sick-outs; smart auto-assignment scoring. All four are deferred past V1.

### Phase 9: Customer profile + Reports (~10 files)

**Goal:** Close the customer-data gap (gender, booking history) and ship the fixed-report module.

- [ ] Migration `00025_customer_gender.sql` — `customers.gender` enum (`'male' | 'female' | 'other'`), not-null going forward (existing rows back-filled as `'other'` or NULL-tolerant with a one-time prompt)
- [ ] Update `/book`, `/reception/bookings/new`, `/admin/bookings/new`, and the AI `create_tentative_booking` tool to collect + require `gender`
- [ ] `src/app/admin/customers/[id]/page.tsx` — booking history (past + upcoming), lifetime value, next appointment, quick-rebook button (SPA-050 / SPA-051)
- [ ] SPA-091 service-polish remainder — per-service images, room/category grouping on `/book`, richer service detail
- [ ] `src/lib/reports/` — query layer for fixed reports (revenue by date-range, bookings-by-therapist, no-show rate, cancellation reasons)
- [ ] `src/app/admin/reports/page.tsx` — report picker with date-range + CSV export
- [ ] Vitest coverage for report queries
- [ ] Docs sync: README migration list, MASTER-PLAN migration list, DOC-SYNC row for reports

**Depends on:** Phase 6 (receptionist booking path needs `gender` too). Localization (Phase 7) applies to the new UI as it's authored.

**Explicit non-goals (deferred past V1):** custom report builder, advanced BI dashboards, payroll, inventory, loyalty, deep accounting, complex memberships, multi-branch logic, WCAG compliance, customer accounts / login / self-service history pages, shift-swap / shift-approval / time-clock / payroll-adjacent workflows.

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

- No real-time calendar until Phase 8 (polling/refresh is fine); Supabase Realtime arrives with the inbox.
- No custom report builder — only fixed reports with date range + CSV export (Phase 9).
- No email notifications — WhatsApp is the primary channel, Twilio SMS is the fallback.
- 162 Vitest tests across 12 files cover scheduling, payments, availability, and the unassigned-booking matcher. CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + build on every push and PR.
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
- **Payment provider:** CardCom (hosted page) + DTS benefit vouchers + VPay stored-value vouchers.
- **Payment requirement:** Optional for super admin (can confirm directly), required for customer / receptionist-chat / chatbot bookings.
- **Buffer time:** Configurable per service (`buffer_minutes` on services table).
- **Service durations:** 45 min treatment + 15 min buffer by default (migration 00021).
- **Business hours:** 09:00–21:00, admin-configurable; slot granularity 15/30/60 min, 60 default (migration 00020 + settings form).
- **Language policy:** Hebrew default, first-class EN + RU for every user. Per-user toggle for staff; customer language auto-detected on first inbound message and persisted. Framework + columns land in Phase 7.
- **Cash-on-arrival:** Secured by CardCom token (CreateTokenOnly with Shva J-validation), NOT a symbolic 1 NIS charge. Penalty captured via LowProfileChargeToken on late cancel / no-show per the 5%-or-100-ILS policy (v1_5pct_or_100ILS_min snapshot).
- **Therapist identity:** anonymous across customer surfaces (/book, /order, SMS, WhatsApp). Admin + therapist portals retain full identity. Customer picks gender preference (male / female / any); server assigns a random eligible therapist post-payment (deferred-assignment flow).
- **Role model:** `super_admin` + `receptionist` + `therapist`. Receptionist role is a named Phase 6 workstream, not deferred.
- **AI invariants:** AI never writes to the DB, AI never assigns a therapist, every AI-drafted outbound reply is receptionist-approved in V1.

### Still Assuming (flag if wrong)
1. **Single location** — no multi-branch logic needed.
2. **~20 therapists + a few receptionists + 1 super admin** — calendar UI + matcher sized against this scale.
3. **WhatsApp Business Cloud account** — needs Meta ISV onboarding; build with mock first (Phase 8).
4. **Supabase/Vercel** — Pro plans for production (free tier for dev).
5. **Customer identity** — identified by phone only, no login/accounts, no self-service history page.
6. **Anthropic Claude** as the LLM for the conversational layer (Phase 8) — to be confirmed against latency + Hebrew/Russian quality before Phase 8 implementation.
7. **Twilio** stays for SMS fallback when WhatsApp opt-out or failed delivery; WhatsApp becomes primary channel after Phase 8.

---

## Verification Strategy

After each phase, verify:
- `npm run build` succeeds (no TypeScript errors)
- `supabase db reset` runs all migrations cleanly
- Key flows work locally via browser testing
- Exclusion constraints tested in Phase 3 with concurrent insert attempts
- Payment webhook tested with mock adapter in Phase 4
- Receptionist route-guard verified in Phase 6 (Vitest + manual browser check)
- Locale snapshot tests per surface in Phase 7
- Chatbot tool calls + approval state machine tested with mock WhatsApp in Phase 8
- No-show scorer validated against historical bookings in Phase 8
- Report query correctness verified against seed data in Phase 9
