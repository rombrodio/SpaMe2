# SpaMe — Comprehensive Implementation Plan

## Context

SpaMe is a custom spa management platform replacing Biz-Online for a boutique Tel Aviv spa. It fuses — tailored to spa operations — the functional surface of **BizOnline** (booking + payment), **ShiftOrganizer** (staff shifts / availability), and **Texter** (WhatsApp Business + AI conversational platform), with AI-assisted automation as a first principle so the manager and staff can run operations with as little manual intervention as possible. **Everything ships in a single codebase in this repository**; the earlier "SpaMeV3" split is dropped.

This plan covers architecture, database schema, folder structure, phased implementation, risks, and assumptions — all scoped to V1 only.

### Revised vision summary (2026-04-27, VISION_1)

Canonical vision: [`docs/vision/SpaMe-vision.md`](../vision/SpaMe-vision.md). Summary below; the vision doc is the tie-breaker.

**Four roles**

- **Super Admin** — full access: calendar, bookings, all entities, settings, audit log, reports, full Texter inbox visibility. Approves / edits / rejects AI-drafted outbound replies from the same inbox receptionists use. Owns the `auto_assign_enabled` spa setting and the publish action.
- **Receptionist** — primary surface is the Texter-style `/reception/inbox`: live visibility into every active customer conversation (including bot-handled ones), take-over at any moment, AI-assisted writing, quick replies in EN/HE/RU. **Creates bookings and may pre-empt the auto-assignment engine by selecting a therapist and/or a room at booking creation** (the booking still flows through manager publish). Submits own on-duty (chat + phone) windows. Does **not** manage therapists / services / rooms / settings / audit log and does **not** receive therapist assignment receipts.
- **Therapist** (~20, mixed patterns) — submits own availability + time-off. Confirms assignment requests across **the therapist's chosen subset of four parallel channels** (WhatsApp + portal + email + SMS — default all four); one confirmation across any enabled channel resolves; 2h SLA from publish. Read-only view of own bookings.
- **Customer** — phone-identified and anonymous. No login, no accounts. Picks language on first interaction; **never sees therapist names or specific room identifiers**.

**Customer experience principles**

- Phone (E.164) is the unique identifier; customer record stores information without credentials.
- Required at booking: phone, full name, **customer gender**, preferred-therapist gender, date/time. Email optional.
- Therapist anonymity AND room anonymity are non-negotiable on every customer surface (`/book`, `/order`, WhatsApp replies, outbound SMS). Customers never choose room subtypes and never see room identifiers.
- Customer language wins: HE / EN / RU first-class on customer-facing surfaces and the therapist portal (no fallback). Admin + reception stay HE/EN-validated with RU fallback. Language auto-detected on first inbound message and persisted on the customer record.
- Three booking paths (browser `/book`, WhatsApp, receptionist), **one source of truth** (same DB, same overlap constraints, same payment pipeline, same assignment lifecycle).
- **Auto-assignment engine picks `(therapist, room)` as one decision on payment confirmation.** Spa-wide `auto_assign_enabled` (default ON) toggles between commit (`auto_assigned`) and suggest-only (`auto_suggested`) modes. No therapist is notified until the manager publishes (default cadence: the evening before the treatment day).
- Payment is real. Cash-on-arrival is secured by a CardCom token, not a token charge. Cancellation policy (5% or 100 ILS, whichever greater) is enforced via stored card token. Payment webhooks are the only authoritative confirmation source.

**AI / automation thesis — four layers**

- **Layer 1 — Self-service customer booking** (shipped) — `/book` → `/order/[token]` flow is fully automated. Bookings land in the auto-assignment engine post-payment.
- **Layer 2 — AI conversational booking** (Phase 8) — AI agent reads inbound WhatsApp / web messages, drafts replies, proposes tool calls from the approved list. The agent creates bookings; the engine assigns resources; the manager edits + publishes. Precise escalation thresholds are an open question to be answered by analysing the spa's last 12 months of WhatsApp conversations and iterating.
- **Layer 3 — Receptionist Texter** (Phase 8) — `/reception/inbox` is the receptionist's primary work surface: live monitoring + takeover + AI handoff summary (2–3 sentences) + in-chat booking panel + AI writing-assist (translate / shorten / soften / draft from bullets) + inbound auto-translation when customer ≠ receptionist language.
- **Layer 4 — Operational AI (narrow V1 scope)** — predictive no-show scoring as an **advisory** signal (surfaced on booking detail + in-chat booking panel, never blocks). Rule-based auto-assignment engine for `(therapist, room)` pair selection. Manager push alerts (email + WhatsApp) on new auto-assignments with per-manager mute. Explicitly **not** in V1: conversational agent picking therapists or rooms, ML-based assignment scoring, auto-rebook on sick-outs.

**Hard invariants (never relaxed)**

See [`CLAUDE.md`](../../CLAUDE.md#hard-invariants-never-relaxed) for the canonical 9-bullet list. Summary: conversational AI does not write to the DB or pick resources; no therapist notified until publish; capacity held at engine-selection for both resources; every AI draft approved by receptionist OR super admin; webhook is payment truth; therapist AND room anonymous on customer surfaces; three paths one source of truth; customer + therapist surfaces render in full HE/EN/RU.

### Confirmed Decisions

- **Payment:** Optional for super admin (can confirm bookings directly without payment); required for customer self-booking and chatbot.
- **Buffer time:** Configurable per service (`buffer_minutes` column on `services` table).
- **Services:** 45 minutes treatment + 15 minutes buffer by default (operator decision, migration 00021).
- **Business hours:** 09:00–21:00, admin-configurable, with 15/30/60-minute slot granularity (60 default).
- **UI language:** Hebrew default. **HE / EN / RU first-class on customer-facing surfaces and the therapist portal — no fallback (a missing RU key on those surfaces is a release blocker).** Admin + reception retain HE/EN-validated with RU deep-merge fallback. Per-user toggle persists on `profiles.language`; customer language is auto-detected on first inbound message and persisted on `customers.language`. Framework shipped in Phase 7a (#23); content migration shipped in Phase 7b (#24–#31); customer + therapist RU completion + ESLint rule land in Phase 7d.
- **Payment provider:** CardCom (hosted page + webhooks) + DTS benefit vouchers + VPay stored-value vouchers.
- **Roles:** `super_admin`, `receptionist`, `therapist`. Receptionist role lands in **Phase 6**.
- **Therapist identity AND room identity:** anonymous on every customer surface. Customer picks gender preference; the auto-assignment engine picks a qualified `(therapist, room)` pair at payment-confirmation time (Phase 7c).
- **Customer identity:** phone-only (E.164), no login, no accounts, no self-service history page.
- **Cash-on-arrival:** CardCom token (CreateTokenOnly with Shva J-validation); penalty captured via LowProfileChargeToken per 5%-or-100-ILS policy.
- **VPay carve-out:** `services/vpay-proxy/` lives in this repo but deploys to Fly.io (mTLS + static IP). Same source of truth, different deploy target.

**Booking assignment + notifications (Phase 7c, authored by VISION_1):**

- **Booking assignment (therapist + room):** auto-assignment engine runs on payment confirmation and selects both a therapist and a room as a single decision. The spa toggles `spa_settings.auto_assign_enabled` to choose between commit (`auto_assigned`) and suggest-only (`auto_suggested`) modes. Rooms move through the same lifecycle but without notification/confirmation/SLA.
- **`auto_assign_enabled` default: ON.** V1 ships with the engine in commit mode; the spa can flip to OFF in super-admin settings if they prefer the approval gate.
- **Capacity rule:** both modes hold therapist AND room slots at engine-selection time. Exclusion constraints gate on `assignment_status` IN (`auto_suggested`, `auto_assigned`, `published`, `therapist_confirmed`), covering both resources. `pending_payment` and `cancelled` do NOT hold capacity.
- **Publish trigger:** manager-button-only. No automatic cutoff in V1.
- **Publish paths + cadence:** per-booking immediate (manager handles one booking now) and batch publish (default). Default operational cadence is the evening before the treatment day; weekly work-schedule publishes ride the same rail.
- **Therapist confirmation channels:** WhatsApp + portal + email + SMS. All enabled channels fire in parallel at publish; which channels are enabled is per-therapist preference (default: all four). One confirmation across any enabled channel resolves the request.
- **Confirmation SLA:** 2 hours from publish, per therapist.
- **SLA expiry behavior:** manager gets a reminder; system suggests an alternative qualified therapist (and updated room if needed); manager decides whether to reassign or chase.
- **Manager push notifications on new auto-assignments:** email + WhatsApp only (no SMS, no portal push). Muteable per-manager via `profiles.alert_preferences`.
- **Room reassignment after publish:** silent. Therapist sees the new room via the portal or on arrival; no follow-up notification, no re-confirmation, no SLA reset.
- **Receptionist pre-empt:** receptionists may select a therapist and/or a room at booking-creation time, pre-empting the engine for whatever they specify. Capacity is held the same way; booking still goes through publish.
- **Room visibility to customers:** none. Customers don't see specific room identifiers and don't choose room subtypes.
- **Draft-approval authority:** receptionist OR super admin approves / edits / rejects any AI-drafted outbound customer reply.
- **ESLint `no-literal-strings` rule:** installed and enforced in CI (Phase 7d), scoped to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`. Hardcoded user-visible strings on those surfaces fail the build. Admin + reception exempt.

### Open Questions

Deliberately not decided yet. Each should migrate into "Confirmed Decisions" once chosen.

1. **Cancellation-policy scope.** Does the 5% / 100 ILS cancellation fee apply to all bookings, or only to bookings secured by a card token? Cash-on-arrival has a CardCom token via CreateTokenOnly so it could apply uniformly — confirm.
2. **Late same-day bookings — default publish behavior.** A booking made at 17:50 today for tomorrow at 09:00 is fine in the end-of-day batch. But what about a booking made at 09:00 today for 14:00 today? In principle the manager should use per-booking immediate publish, but is there a default cutoff (e.g., "any booking starting within 4 hours auto-flags for immediate publish")? Or is it purely the manager's call every time?

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
   - Create bookings on behalf of customers — **may pre-empt the auto-assignment engine by selecting a therapist and/or a room at booking creation**; the booking still flows through manager publish.
   - Submit own on-duty (chat + phone) availability windows
   - Use quick-reply templates + AI writing-assist (translate, shorten, soften, draft from bullets) in EN/HE/RU
   - Approve / edit / reject every AI-drafted outbound reply before it sends (receptionist OR super admin may do this)
   
   Explicitly cannot: manage therapists / services / rooms / settings / audit log, receive therapist assignment receipts, do shift-swap or approval work.
3. **Therapist** — submits own availability rules and time-off. **Confirms assignment requests across the therapist's chosen subset of four parallel channels** — WhatsApp + portal + email + SMS (default: all four; per-therapist preference, Phase 7c). One confirmation across any enabled channel resolves; 2-hour SLA from publish. Read-only view of own bookings.

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

-- assignment_status exists today as ('unassigned','pending_confirmation','confirmed','declined')
-- via migration 00018. Phase 7c rewrites it to match VISION_1 (breaking change — old values
-- remapped via a data migration):
-- CREATE TYPE assignment_status AS ENUM ('unassigned','auto_suggested','auto_assigned','published','therapist_confirmed');

-- Phase 7c also introduces:
CREATE TYPE notification_channel AS ENUM ('whatsapp','portal','email','sms');
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

**bookings** — `id`, `customer_id`, `therapist_id`, `room_id`, `service_id`, `start_at`, `end_at`, `status`, `assignment_status` (enum, Phase 7c rewrite — see Extensions & Enums), `published_at` (TIMESTAMPTZ nullable, Phase 7c), `price_ils`, `notes`, `created_by` (nullable), `cancelled_at`, `cancel_reason`, `created_at`, `updated_at`. CHECK(start_at < end_at).
- **Composite FK** `(therapist_id, service_id) REFERENCES therapist_services` — enforces therapist qualification at DB level
- **Composite FK** `(room_id, service_id) REFERENCES room_services` — enforces room compatibility at DB level
- **`therapist_id` is NOT NULL when `assignment_status IN ('auto_suggested','auto_assigned','published','therapist_confirmed')`** (Phase 7c — otherwise Postgres gist exclusion does not block a NULL row from overlapping others). Enforced via a CHECK or by making the column NOT NULL once every `unassigned`-era row is back-filled.

**spa_settings** (Phase 4.6 + Phase 7c) — single row: `id`, `on_call_manager_name`, `on_call_manager_phone`, `business_hours_start`, `business_hours_end`, `slot_granularity_minutes`, `auto_assign_enabled` (BOOLEAN NOT NULL DEFAULT true, **Phase 7c**), `updated_at`.

**profiles** extensions (Phase 7c) — add `alert_preferences` (JSONB NOT NULL DEFAULT `'{}'`), carrying per-manager mute toggles (`push_muted_email`, `push_muted_whatsapp`) and per-therapist notification-channel preferences (`channels_enabled: ['whatsapp','portal','email','sms']`). Defaults documented in migration 00027.

**therapist_notifications** (Phase 7c) — `id`, `booking_id` (FK CASCADE), `channel` (`notification_channel`), `sent_at`, `confirmed_at` (nullable), `confirmation_channel` (`notification_channel`, nullable — set when the THIS row is the one that resolved), `expiry_at` (`sent_at + interval '2 hours'`), `created_at`. UNIQUE `(booking_id, channel)`. Index on `(expiry_at) WHERE confirmed_at IS NULL` for the SLA sweeper.

**manager_alerts** (Phase 7c) — `id`, `booking_id` (FK CASCADE), `sent_at`, `channels` (`notification_channel[]`), `created_at`. Per-booking push-alert log; one row per alert event.

**payments** — `id`, `booking_id`, `amount_ils`, `status`, `provider`, `provider_tx_id`, `payment_page_url`, `webhook_payload` (JSONB), `paid_at`, `created_at`, `updated_at`

**conversation_threads** — `id`, `customer_id`, `channel`, `external_id`, `is_open`, `assigned_to` (nullable), `created_at`, `updated_at`

**conversation_messages** — `id`, `thread_id`, `role`, `content`, `metadata` (JSONB), `created_at`

**audit_logs** — `id`, `user_id` (nullable), `action`, `entity_type`, `entity_id`, `old_data` (JSONB), `new_data` (JSONB), `ip_address` (INET), `created_at`

### Overlap Prevention (Critical)

Postgres exclusion constraints using `btree_gist`.

**Current (shipped through migration 00013)** — keyed off `booking_status`:

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

**Phase 7c rewrite** — re-gate both constraints on `assignment_status` so the engine's capacity rule is enforced at the DB layer for BOTH resources. Engaged states (`auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed`) block; `unassigned`, `pending_payment`, and `cancelled` do not:

```sql
ALTER TABLE bookings DROP CONSTRAINT no_therapist_overlap;
ALTER TABLE bookings DROP CONSTRAINT no_room_overlap;

ALTER TABLE bookings ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (assignment_status IN ('auto_suggested','auto_assigned','published','therapist_confirmed'));

ALTER TABLE bookings ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (assignment_status IN ('auto_suggested','auto_assigned','published','therapist_confirmed'));
```

This closes two gaps the old predicate left open: `pending_payment` rows currently hold capacity (they shouldn't — the vision explicitly excludes them), and `auto_suggested` rows don't block anything because the column doesn't exist yet.

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
├── 00024_booking_source.sql                 (bookings.source: customer_web | admin_manual |
│                                              receptionist_manual | chatbot)
├── 00025_language_columns.sql               (language_code enum + profiles.language +
│                                              customers.language — Phase 7a i18n foundation)
└── 00026_profiles_rls_language_privilege_fix.sql
                                             (SECURITY: close privilege-escalation hole from 00025 —
                                              restore profiles WITH CHECK to super_admin-only,
                                              add set_own_language SECURITY DEFINER RPC)
```

### Pending migrations (by phase)

```
Phase 7c — Auto-assignment engine + publish + multi-channel notifications + manager alerts
  00027_auto_assignment.sql                  (assignment_status enum rewrite — remap
                                              pending_confirmation → published,
                                              confirmed → therapist_confirmed, add
                                              auto_suggested + auto_assigned;
                                              notification_channel enum;
                                              bookings.published_at + CHECK therapist_id
                                              NOT NULL when assignment_status IN engaged;
                                              spa_settings.auto_assign_enabled BOOLEAN
                                              DEFAULT true NOT NULL;
                                              profiles.alert_preferences JSONB DEFAULT '{}';
                                              therapist_notifications + manager_alerts
                                              tables with indexes;
                                              rewrite no_therapist_overlap +
                                              no_room_overlap exclusion constraints onto
                                              assignment_status)

Phase 8 — Conversational platform
  00028_conversations_extensions.sql         (conversation_messages.ai_draft_of,
                                              approval state enum, translations table,
                                              conversation_threads.handoff_summary)

Phase 9 — Customer profile + reports
  00029_customer_gender.sql                  (customers.gender enum, required at
                                              booking time going forward)
```

All 25 files in `supabase/migrations/` (`00001_*` through `00025_*`) are applied to the hosted Supabase project `avnsuyiyhcnihsnisgig` as of this writing. Phase 7c, Phase 8, and Phase 9 migrations are pending authoring.

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
│   │   ├── set-password/page.tsx
│   │   └── callback/page.tsx              # Client component — handles PKCE, OTP, implicit-hash flows
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
│   │   ├── layout.tsx                      # Customer-facing layout (RTL flips via dynamic <html dir>)
│   │   └── page.tsx                        # Single-page flow: service → slot → contact, renders BookFlow
│   ├── order/[token]/                      # Payment finalisation (JWT-gated)
│   │   ├── layout.tsx page.tsx             # Method picker + summary
│   │   ├── return/page.tsx                 # Bridge from CardCom redirect
│   │   └── success/page.tsx                # Confirmation + idempotent SMS dispatch
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
│   │   └── notification-service.ts         # WhatsApp reminders (pre-Phase 7c)
│   ├── scheduling/
│   │   ├── availability.ts                 # Shipped (Phase 3)
│   │   ├── booking-engine.ts               # Shipped (Phase 3)
│   │   ├── matcher.ts                      # Shipped (Phase 5 — deferred-assignment matcher)
│   │   └── assignment/                     # Phase 7c — auto-assignment engine
│   │       ├── engine.ts                   # pickTherapistAndRoom() — one decision, both resources
│   │       ├── candidates.ts               # qualified therapist + room candidate set
│   │       ├── publish.ts                  # manager publish orchestrator (per-booking + batch)
│   │       └── sla.ts                      # SLA sweeper + manager reminder
│   ├── notifications/                      # Phase 7c — replaces messaging/notify.ts
│   │   ├── types.ts                        # NotificationChannel, TherapistNotificationRow
│   │   ├── orchestrator.ts                 # publish → fan out to therapist's enabled channels
│   │   ├── manager-alerts.ts               # manager push-alert sender (email + WhatsApp)
│   │   └── adapters/                       # one file per channel
│   │       ├── whatsapp.ts                 # existing Twilio WhatsApp (promoted)
│   │       ├── portal.ts                   # Supabase Realtime in-app notification
│   │       ├── email.ts                    # TBD (Resend / Postmark / SES / SendGrid)
│   │       └── sms.ts                      # existing Twilio SMS (promoted)
│   ├── conversations/                      # Phase 8 — replaces the old chatbot/ sketch
│   │   ├── engine.ts                       # processInbound(): history → translate → LLM → draft
│   │   ├── tools.ts                        # Zod tool schemas → server actions
│   │   ├── prompts.ts                      # System prompt + hard-rule guards
│   │   ├── approval.ts                     # approveDraft / editAndApprove / rejectDraft
│   │   ├── translation.ts                  # inbound + outbound auto-translation
│   │   ├── summary.ts                      # 2-3 sentence handoff summary
│   │   └── no-show-scoring.ts              # advisory risk score
│   ├── i18n/                               # Phase 7 — locale-aware formatters
│   │   ├── format.ts                       # formatIlsFromAgorot, formatDateIL, ...
│   │   └── detect.ts                       # detectLanguage(text) — HE/RU/EN char-range heuristic
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
│   ├── ui/                                 # Hand-rolled primitives (CVA + Radix) — button, card, input, select, etc.
│   ├── admin/                              # Super-admin portal components
│   │   ├── sidebar.tsx
│   │   ├── booking/ bookings/ calendar/ customer/ therapist/ receptionist/
│   │   ├── service/ room/ assignments/ audit-log/ settings/
│   │   ├── breadcrumbs.tsx global-search.tsx list-search-bar.tsx row-link.tsx
│   │   └── form-message.tsx
│   ├── reception/                          # Receptionist portal — shares many admin components
│   │   └── sidebar.tsx
│   ├── therapist/                          # Therapist portal
│   │   ├── change-password-card.tsx
│   │   └── pending-confirmations-card.tsx
│   ├── book/                               # Customer /book flow
│   │   ├── book-flow.tsx contact-form.tsx service-card.tsx slot-grid.tsx
│   ├── order/                              # Customer /order/[token]/* flow
│   │   ├── booking-summary.tsx cardcom-iframe.tsx method-picker.tsx
│   │   ├── order-page.tsx voucher-dts-form.tsx voucher-vpay-form.tsx
│   └── locale-switcher.tsx                 # Mounted in all three staff sidebars
├── i18n/                                   # Phase 7a — next-intl framework
│   ├── config.ts                           # locales: ['he','en','ru']; defaultLocale 'he'; RTL set
│   ├── request.ts                          # getRequestConfig — cookie-only locale, deep-merge fallback to EN
│   └── messages/                           # JSON catalogs per locale
│       ├── he.json                         # Hebrew (default)
│       ├── en.json                         # English (canonical key source)
│       └── ru.json                         # Russian. Phase 7d: first-class on customer.* + therapist.* (no fallback); admin.* + reception.* remain EN deep-merge fallback
├── middleware.ts                            # Auth guard + effective-role check + cookie propagation on redirects

services/                                    # Phase 4.5 / 8 — non-Vercel deploys
└── vpay-proxy/                              # mTLS + static-IP Fly.io proxy (Phase 4.5)

supabase/
├── config.toml
├── migrations/                             # 25 files, 00001_* through 00025_*
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

### Phase 7: Localization — split into 7a + 7b

Scope of the originally-planned single phase was too large to ship as one reviewable PR once the admin portal string count materialised. Split into 7a (framework) and 7b (content migration).

**Revised scope for 7b** per operator decision on 2026-04-26: **EN + HE only**. Russian dropped at this stage (may return in a follow-up). No server-action error-envelope refactor. No SMS/email template i18n yet (Phase 8+).

#### Phase 7a — i18n foundation — SHIPPED (PR #23)

- [x] `next-intl` installed in **cookie-only** mode (no `[locale]` URL segment); `src/i18n/{config,request}.ts`, `next.config.ts` wrap
- [x] Migration `00025_language_columns.sql` — `language_code` enum (`he`/`en`/`ru`), `profiles.language NOT NULL DEFAULT 'he'`, `customers.language` nullable (Phase 8 fills on first inbound message). (The WITH CHECK widening shipped in 00025 was reverted by 00026 — see security follow-up below.)
- [x] Migration `00026_profiles_rls_language_privilege_fix.sql` — SECURITY fix. 00025's widened WITH CHECK let any authenticated user UPDATE arbitrary columns on their own profiles row (including `role` → `super_admin`, `therapist_id`, `receptionist_id`). 00026 restores WITH CHECK to super_admin-only and introduces `set_own_language(lang)` SECURITY DEFINER RPC that writes only the `language` column. `setLocaleAction` now calls the RPC.
- [x] Per-locale JSON catalogs under `src/i18n/messages/{he,en,ru}.json` — scaffold `common.*` + `customer.*` namespaces (Hebrew seeded from the pre-existing `src/lib/i18n/he.ts`, English source authored, Russian AI-drafted)
- [x] `setLocaleAction` server action (writes `NEXT_LOCALE` cookie + `profiles.language`) + `LocaleSwitcher` component mounted in admin / reception / therapist sidebars
- [x] `detectLanguage(text)` helper + 15 unit tests (Hebrew / Cyrillic / Latin char-range detection, majority wins, HE tie-break) — ready for Phase 8 to auto-set `customers.language` on first inbound WhatsApp / web-chat message
- [x] Root layout sets `<html lang dir>` dynamically from active locale; `dir` flips to `rtl` for Hebrew
- [x] `src/lib/i18n/format.ts` — locale-aware formatters (`formatIlsFromAgorot`, `formatDateIL`, `formatTimeIL`, `formatDateTimeILFull`) extracted from the old `he.ts`

#### Phase 7b — Staff + customer literal swaps — SHIPPED (7 PRs)

Content translation for every user-facing surface. Split across seven independently-merged PRs so review stayed scoped:

- [x] **PR #24 — Customer flow** — migrated `/book` + `/order/*` (17 files) from the old `he.ts` helpers to `useTranslations()`, dropped the transitional hardcoded `dir="rtl"` on customer layouts, deleted `src/lib/i18n/he.ts` + `he.test.ts`
- [x] **PR #25 — Reception portal** — `/reception/*` dashboard, availability, booking-new, booking-list, sidebar all on `useTranslations()`; new `reception.*` namespace
- [x] **PR #26 — Therapist portal** — `/therapist/*` pages + shared availability/time-off sections; new `therapist.*` namespace, shared `AvailabilitySection`/`TimeOffSection` accept `titleKey`/`helperKey` for per-portal override
- [x] **PR #28 — Admin portal 1/4: chrome + dashboard** — admin sidebar, global search, list-search-bar, pager, row-link, breadcrumbs, `/admin` dashboard; nav config migrated to `labelKey`/`groupLabelKey`
- [x] **PR #29 — Admin portal 2/4: bookings + calendar + assignments** — biggest subtree (~3,400 LOC): bookings list/detail/new, `BookingForm` + `SlotPicker` + `PaymentPanel`, all four calendar views + `TherapistFilter`, `AssignmentList` + empty states; new `admin.bookings.*`, `admin.calendar.*`, `admin.assignments.*`, `admin.status.*`, `admin.paymentStatus.*`, `admin.source.*` namespaces
- [x] **PR #30 — Admin portal 3/4: people** — therapists/receptionists/customers list+new+edit, edit-forms + services-section, `CustomerCombobox` + `CreateCustomerDialog` (shared with `/admin/bookings/new` and `/reception/bookings/new`)
- [x] **PR #31 — Admin portal 4/4: catalog + ops tail** — services (+ `VoucherMappingsSection`), rooms (+ services + blocks sections, locale-aware date formatting), `/admin/audit-log` (with `translateAction`/`translateEntityType` lookup helpers, ICU-plural diff toggles), `/admin/settings`

**What's in scope that did NOT ship** (explicitly deferred, not forgotten):

- Server-action error envelope refactor — `FormErrors` still renders English strings returned by the server; operator called this a Nit
- SMS + email templates keyed off `customers.language` — Phase 8+ work
- ESLint `no-literal-user-facing-strings` rule — not installed; manual review is the only guardrail for regressions
- Snapshot tests of `/book` and `/admin` rendered in each locale — not added
- Russian — catalog exists (AI-drafted in 7a) but none of the 7b surfaces were validated in RU; `src/i18n/request.ts` deep-merges missing RU keys to English at render time

**Depends on:** Phase 7a (shipped).

### Stabilization: PR #27 — middleware redirect-loop + cookie propagation — SHIPPED

Between Phase 7b PRs (landed with the therapist-portal i18n PR in flight), a subtle auth bug surfaced: users would hit `ERR_TOO_MANY_REDIRECTS` on `/login` after signing in.

**Root cause** — two independent bugs stacked:

1. **Broken profile-link loop.** `profiles.role='therapist'` with `profiles.therapist_id = NULL` (a half-completed invite) is internally inconsistent. Middleware trusted `role` alone and redirected `/login → /therapist`; `getCurrentTherapistId()` saw the null FK and bounced back to `/login`. Same topology existed for receptionists.
2. **Cookie strip on redirect.** `NextResponse.redirect(url)` creates a fresh response with no `Set-Cookie` headers, so the refreshed Supabase session cookies written by `auth.getUser()` were dropped on every redirect. Latent — would bite the first time a user's access token expired mid-navigation.

**Fix.** Middleware now computes an **effective role** that only trusts `role='therapist'` when `therapist_id` is also set (symmetrically for receptionist). Broken-link users stay on `/login` with a visible `?error=...` banner instead of looping. A new `redirectWithCookies(url)` helper explicitly copies every cookie from `supabaseResponse` onto the redirect before returning it — all five redirect call sites go through it.

Net result: the `/login ↔ /therapist` ping-pong is impossible to reproduce regardless of profile state, and session cookies are propagated through every auth redirect.

### Phase 7c: Auto-assignment engine + publish + multi-channel notifications + manager alerts

**Goal:** Implement VISION_1's operational heart — a server-side auto-assignment engine that picks both therapist and room on payment confirmation, a manager-publish rail (per-booking immediate + evening-before batch), a 4-channel therapist confirmation system with per-therapist channel preferences, and manager push alerts on new auto-assignments with per-manager mute. Rewrites the Phase 5 deferred-assignment flow; does not delete history, but retires `pending_confirmation` / `confirmed` / `declined` enum values (remapped via data migration).

- [ ] Migration `00027_auto_assignment.sql`:
  - `assignment_status` enum rewrite (`unassigned`, `auto_suggested`, `auto_assigned`, `published`, `therapist_confirmed`); data migration for existing rows
  - `notification_channel` enum (`whatsapp`, `portal`, `email`, `sms`)
  - `bookings.published_at` TIMESTAMPTZ nullable
  - `bookings` CHECK: `therapist_id IS NOT NULL` when `assignment_status IN ('auto_suggested','auto_assigned','published','therapist_confirmed')`
  - `spa_settings.auto_assign_enabled` BOOLEAN NOT NULL DEFAULT true
  - `profiles.alert_preferences` JSONB NOT NULL DEFAULT `'{}'::jsonb` (per-manager mute + per-therapist channel subset)
  - `therapist_notifications` table (columns + `UNIQUE (booking_id, channel)` + index on `expiry_at WHERE confirmed_at IS NULL`)
  - `manager_alerts` table
  - Drop + recreate `no_therapist_overlap` + `no_room_overlap` exclusion constraints on `assignment_status` membership (engaged states block; `pending_payment` does not)
- [ ] `src/lib/scheduling/assignment/engine.ts` — `pickTherapistAndRoom(booking)` — one decision, honours service eligibility, service-room compatibility, room blocks, gender preference, availability, existing bookings.
- [ ] `src/lib/scheduling/assignment/publish.ts` — `publishBooking(id)` + `publishBatch(cutoff)` orchestrators, invoked by admin UI buttons.
- [ ] `src/lib/scheduling/assignment/sla.ts` + `/api/cron/assignment-sla/route.ts` — sweep `therapist_notifications` past `expiry_at` with `confirmed_at IS NULL`; produce manager reminders + suggested alternatives.
- [ ] `src/lib/notifications/orchestrator.ts` — called by `publish.ts`; for each affected therapist, fans out to their enabled channels in parallel, writes one `therapist_notifications` row per channel.
- [ ] `src/lib/notifications/manager-alerts.ts` — fired by the engine on new auto-assignments; email + WhatsApp; respects each manager's `alert_preferences`.
- [ ] `src/lib/notifications/adapters/{whatsapp,portal,email,sms}.ts` — one adapter per channel. Portal adapter uses Supabase Realtime for in-portal delivery. Email adapter picks a provider (Resend / Postmark / SES / SendGrid — decision captured in this phase) and wires envs.
- [ ] `src/lib/actions/assignments.ts` — refactored: admin approve / reassign / publish actions replace the old assign-therapist action. `createReceptionistBookingAction` extends to accept therapist_id AND/OR room_id (pre-empt).
- [ ] Admin UI:
  - Dashboard card for newly auto-assigned / auto-suggested bookings (real-time via Supabase subscription)
  - Per-booking publish button + batch "Publish all unpublished assignments" button
  - `auto_assign_enabled` toggle in super-admin settings
  - Per-manager mute preferences (email + WhatsApp toggles) on own profile page
- [ ] Therapist portal:
  - Pending-confirmations card updated for the new multi-channel schema
  - Per-therapist channel-preferences panel (default all four)
- [ ] Vitest coverage: engine picks respecting all constraints, capacity hold on `auto_suggested`, SLA sweeper, per-manager mute, per-therapist channel subset, exclusion-constraint behaviour (paired with a DB integration test).

**Depends on:** Phase 6 (receptionist booking path wires pre-empt), Phase 4 (payment webhook triggers the engine). Gates Phase 8 (`create_tentative_booking` needs the new engine).

**Explicit non-goals:** ML-based assignment scoring, auto-rebook on sick-outs, automatic publish cutoff, fully-autonomous AI replies.

### Phase 7d: Customer + therapist full RU + ESLint no-literal-strings rule

**Goal:** Close the VISION_1 language policy — RU becomes a release blocker on customer-facing surfaces and the therapist portal, and the ESLint rule makes hardcoded literals on those surfaces fail CI.

- [ ] Translate every key in `customer.*` and `therapist.*` namespaces across `src/i18n/messages/ru.json`. Parity check against `en.json` (every leaf key present).
- [ ] Install `eslint-plugin-no-literal-string` (or `eslint-plugin-react/jsx-no-literals`, whichever is cleaner against our JSX + TS surface); configure with file-glob scoping to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`. Admin + reception paths are explicitly exempt.
- [ ] Fix the lint violations surfaced on those surfaces (expect a small number — Phase 7b already migrated most of them).
- [ ] Add CI gate: `npm run lint` fails if a literal string slips into the scoped dirs.
- [ ] Docs sync: README localization section, CLAUDE.md language policy, CONTRIBUTING (if added), `docs/DOC-SYNC.md` row for user-facing strings.

**Depends on:** Phase 7b (shipped). Can ship in parallel with Phase 7c; no schema dependency.

**Explicit non-goals:** admin + reception RU validation (kept at EN fallback per VISION_1); no literal-strings rule on admin + reception surfaces.

### Phase 8: Conversational platform (WhatsApp + Web Chat + AI) (~30 files)

**Goal:** The Texter-alike WhatsApp Business + web chat platform, fully in-repo. Inbound conversations stream into `/reception/inbox`; the AI drafts replies that a receptionist approves before send; booking actions are reachable from an in-chat booking panel.

- [ ] Migration `00028_conversations_extensions.sql`:
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

**Depends on:** Phases 6, 7, **7c** (engine must exist before `create_tentative_booking` can drop bookings into it).

**Explicit non-goals:** fully-autonomous AI replies; AI assigning therapists; auto-rebook on sick-outs; smart auto-assignment scoring. All four are deferred past V1.

### Phase 9: Customer profile + Reports (~10 files)

**Goal:** Close the customer-data gap (gender, booking history) and ship the fixed-report module.

- [ ] Migration `00029_customer_gender.sql` — `customers.gender` enum (`'male' | 'female' | 'other'`), not-null going forward (existing rows back-filled as `'other'` or NULL-tolerant with a one-time prompt). Number assumes Phase 7c + Phase 8 ship in order; if ordering changes, number shifts.
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
| Phase 7c exclusion-constraint rewrite data-migrates existing `pending_confirmation` / `confirmed` / `declined` rows incorrectly | Capacity held where it shouldn't be, or not held where it should | Migration runs in a transaction with a data-migration step that enumerates every row; Vitest has an integration test that asserts post-migration state |
| `auto_assign_enabled=ON` picks a `(therapist, room)` pair the manager disagrees with often | Manager overrides become the default workflow; engine unused | Per-booking edit-before-publish stays zero-friction; `auto_assign_enabled=OFF` is always the escape hatch; dashboard surfaces every auto-assignment for review |
| Email provider deliverability (spam filters, rate limits, bounces) | Therapist misses confirmation request | Pick a provider with domain verification + DKIM + delivery logs; log every send; fall back to WhatsApp + SMS + portal (3 other channels remain) |
| 4-channel race — therapist clicks confirm on two channels near-simultaneously | Double-confirmation write | `confirmed_at` set-once guard in `therapist_notifications` (UNIQUE `booking_id` partial index where `confirmed_at IS NOT NULL`); first write wins, second is a no-op |
| Israeli payment provider API quirks (Hebrew docs, inconsistent behavior) | Payment flow broken | `PaymentProvider` interface allows swapping. Start with mock adapter |
| WhatsApp Business API approval delay (days to weeks) | Chatbot blocked | Build with mock adapter. Design flows to work within 24h session window |
| AI tool call reliability — invalid params, misinterpreted intent | Bad bookings | Zod-validate all tool params. Require customer confirmation. `handoff_to_staff` escape hatch |
| Israel DST transitions — ambiguous/skipped hours | Wrong slot times | Store all times as TIMESTAMPTZ. Use `date-fns-tz` with `Asia/Jerusalem`. Never use server local time |
| Concurrent booking race conditions | Double-booking | Exclusion constraint (re-gated on `assignment_status` in Phase 7c) rejects at DB level. App catches constraint error → "slot no longer available" |

### Acceptable V1 Shortcuts

- No real-time calendar until Phase 8 (polling/refresh is fine); Supabase Realtime arrives with the inbox.
- No custom report builder — only fixed reports with date range + CSV export (Phase 9).
- No email notifications — WhatsApp is the primary channel, Twilio SMS is the fallback.
- 208 Vitest tests across 16 files cover scheduling, payments, availability, the unassigned-booking matcher, `allowedOrRedirect` role × portal matrix, `detectLanguage`, receptionist Zod schemas, and Twilio SMS wrapper. CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + build on every push and PR.
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
- **Language policy:** Hebrew default. HE / EN / RU first-class on customer-facing surfaces and the therapist portal — no fallback (a missing RU key on those surfaces is a release blocker once Phase 7d lands the ESLint rule). Admin + reception remain HE/EN-validated with RU deep-merge fallback. Per-user toggle for staff on `profiles.language`; customer language auto-detected on first inbound message and persisted on `customers.language`. Shipped: framework + columns in Phase 7a (#23), content migration in Phase 7b (#24–#31); customer + therapist RU completion + ESLint rule in Phase 7d.
- **Cash-on-arrival:** Secured by CardCom token (CreateTokenOnly with Shva J-validation), NOT a symbolic 1 NIS charge. Penalty captured via LowProfileChargeToken on late cancel / no-show per the 5%-or-100-ILS policy (v1_5pct_or_100ILS_min snapshot).
- **Therapist + room identity:** anonymous across customer surfaces (`/book`, `/order`, SMS, WhatsApp). Admin + therapist portals retain full identity. Customer picks gender preference (male / female / any); the **auto-assignment engine picks a qualified `(therapist, room)` pair post-payment** (Phase 7c), respecting service eligibility, service-room compatibility, room blocks, gender preference, and availability.
- **Role model:** `super_admin` + `receptionist` + `therapist`. Receptionist role is a named Phase 6 workstream, not deferred.
- **AI invariants:** the conversational AI agent never writes to the DB directly, never picks therapists or rooms (that's the engine's job, post-payment), and every AI-drafted outbound reply is approved by a receptionist OR a super admin in V1.

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
- Phase 7c: assignment-status exclusion constraint rejects concurrent engaged inserts for the same `(therapist, start, end)` AND the same `(room, start, end)`; SLA sweeper fires at `expiry_at`; per-therapist channel subset routes to the right adapters; manager mute suppresses push without affecting the dashboard
- Phase 7d: `npm run lint` fails on a deliberately-planted literal string in `src/app/book/page.tsx`; passes after the literal is moved to the catalog; `ru.json` key-count matches `en.json` for `customer.*` + `therapist.*`
- Chatbot tool calls + approval state machine tested with mock WhatsApp in Phase 8
- No-show scorer validated against historical bookings in Phase 8
- Report query correctness verified against seed data in Phase 9
