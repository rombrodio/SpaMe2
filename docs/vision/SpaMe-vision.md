# SpaMe — Vision (V1)

> **Status:** canonical product vision. When this file changes, walk `docs/DOC-SYNC.md` and update every doc listed at the bottom in the same PR.

## In one sentence

SpaMe is a single-codebase spa-management platform for one boutique Tel Aviv spa, replacing Biz-Online. It combines — tailored to spa operations — the booking + payment surface of **BizOnline**, the staff availability + on-duty surface of **ShiftOrganizer**, and the WhatsApp Business + AI conversational surface of **Texter**, with AI-assisted automation as a first principle so the manager and staff run operations with as little manual intervention as possible.

## What we take from each reference system

**From BizOnline** — the full booking pipeline: calendar, services, therapists, rooms, customers, payment processing through Israeli providers (CardCom + DTS + VPay), reports, audit trail.

**From ShiftOrganizer** — staff availability submission. Therapists submit weekly availability + time-off; receptionists submit on-duty windows that cover both chat and phone in a single mode. Shift-swap, shift-approval, time-clock, and payroll-adjacent workflows are explicitly **not** in V1.

**From Texter** — a WhatsApp Business + web-chat conversational surface. The receptionist portal incorporates a WhatsApp-Desktop-style UI with live visibility into every active customer conversation, intervention at any point, and full handling of conversations the bot cannot resolve or that customers escalate.

## Who it serves

### Super Admin
Full access to everything — calendar, bookings, all entities, settings (including the auto-assignment toggle described below), audit log, **fixed reports with date-range + CSV** (no custom-report builder in V1), full Texter inbox visibility. Operational oversight is the primary job. The super admin may also approve / edit / reject AI-drafted outbound replies from the same inbox the receptionist uses.

### Receptionist
Primary surface is the WhatsApp-Desktop-style inbox at `/reception/inbox`. They also have a separate availability-submission screen and the dashboard surfaces they need to operate (creating bookings, viewing today's schedule, etc.).

In the inbox they:
- See every active customer conversation in real time, including ones the AI bot is currently handling. They can monitor, observe, or jump in at any point.
- Take over conversations when the bot can't resolve them or when a customer asks for a human.
- Use AI-assisted writing tools (translate, draft, shorten, soften) and quick-reply templates in HE/EN/RU.
- Manually create bookings on behalf of customers (phone, walk-in, chat-driven). They may pre-empt the auto-assignment engine by selecting a therapist and/or a room; otherwise the booking goes through the same auto-assignment as customer/AI bookings.
- Submit their own on-duty availability — single mode covering both chat and phone.

What receptionists explicitly do **not** do:
- Receive therapist assignment-confirmation receipts (therapist-only flow).
- Manage therapists, services, rooms, settings, or the audit log.
- Any shift-swap, shift-approval, or payroll-adjacent work.

### Therapist (~20, mixed shift patterns)
- Submit + edit own weekly availability and time-off via the therapist portal.
- Receive assignment-confirmation requests from the manager's publish action across up to **four channels in parallel** — WhatsApp, the therapist portal, email, and SMS. **Which channels fire is per the therapist's own channel preferences** (default: all four enabled). One confirmation across any channel resolves the request. The 2-hour SLA clock starts at publish time.
- The notification includes date, time, room, treatment type, and customer-relevant details.
- View own upcoming + past bookings (read-only).
- Use the therapist portal in their own language: **HE / EN / RU all first-class** in V1.

### Customer (phone-identified, anonymous)
- Book online via `/book`, via WhatsApp (the AI bot collects the data and redirects to web for payment), or by talking to a receptionist.
- No login, no account, no self-service history page. **Phone (E.164-normalized) is the unique identifier.**
- Choose their language (HE / EN / RU) on first interaction; the choice is persisted on the customer record and auto-detected from their first inbound message thereafter.
- **Never see therapist names.** Therapist identity is anonymous across every customer surface.
- **Never see specific room identifiers.** Room selection is purely operational; customers see "your booking is confirmed," not "Room 3" or "Lavender Suite."

## Core operational reality

- Single location, Tel Aviv. No multi-branch logic.
- Operating hours **09:00–21:00**, admin-configurable.
- Treatments start at the top of the hour by default; **15 / 30 / 60-minute** granularity options remain in the schema (60 default).
- Treatments can run in parallel in different rooms.
- ~20 therapists, mixed working patterns (some weekly regulars, some ad-hoc).
- Multiple rooms with service-specific compatibility (some treatments require specific rooms, e.g., hot-stone equipment).
- Currency **ILS**, prices stored as integer **agorot**, timezone **Asia/Jerusalem**.

### Language policy

Hebrew is the default language. The V1 coverage matrix:

| Surface | HE | EN | RU |
|---|---|---|---|
| Customer-facing (`/book`, `/order`, SMS, WhatsApp templates, web-chat widget, payment pages) | first-class | first-class | first-class |
| Therapist portal | first-class | first-class | first-class |
| Admin portal | first-class | validated | keys filled where present, EN fallback at render |
| Reception portal | first-class | validated | keys filled where present, EN fallback at render |

**No fallbacks on customer-facing surfaces or in the therapist portal.** A missing RU key on those surfaces is a release blocker. Promoting admin + reception to full RU first-class is post-V1.

The customer's chosen language is the language the spa replies in. Therapists work in their preferred language regardless of the customer's language; the platform handles translation between the two.

**Build-time enforcement:** an ESLint rule (`no-literal-strings` or equivalent) is installed and enforced in CI for customer-facing components and the therapist portal. Hardcoded user-visible strings outside the i18n catalog fail the build. Admin and reception surfaces remain exempt while RU is optional there.

## Customer experience principles

- **Phone-identified and anonymous.** Customers are identified by phone; they do not register or log in.
- **Required at booking time:** phone number, full name, gender, preferred therapist gender, date and timeslot. Email is optional.
- **Therapist anonymity is non-negotiable.** No therapist name, no therapist photo, no therapist-identifying detail on `/book`, `/order`, SMS, or WhatsApp replies.
- **Room identity is operational, not customer-facing.** Customers don't pick room types and don't see room identifiers.
- **Customer language wins.** The system auto-detects language on first inbound message, persists it on the customer record, and replies in that language by default.
- **Three booking paths, one source of truth.** Web `/book`, WhatsApp/AI, receptionist — all land in the same DB with the same overlap constraints, the same payment pipeline, the same lifecycle.
- **Payment is real.** Cash-on-arrival is secured by a CardCom token (not a token charge). The cancellation policy (5% or 100 ILS, whichever is greater) is enforced via the stored card token.

## Booking assignment lifecycle (therapist + room)

This is the operational heart of V1. The flow is the same regardless of booking channel (web `/book`, WhatsApp/AI, receptionist-created). The auto-assignment engine selects **both a therapist and a room as a single decision**.

### The `auto_assign_enabled` setting

A single spa-wide setting controls how the auto-assignment engine commits its choices. **V1 ships with `auto_assign_enabled = ON` by default.** Both modes hold capacity (therapist + room) the same way (see Capacity rule below); the only difference is whether the manager must explicitly approve each pick before it counts as a "real" assignment for publish purposes.

- **ON (default):** on payment confirmation, the engine selects a qualified `(therapist, room)` pair, holds both slots, and commits the assignment immediately. The booking is `auto_assigned` and the manager can edit before publish.
- **OFF:** on payment confirmation, the engine selects a qualified `(therapist, room)` pair and **holds both slots** — but the booking enters the `auto_suggested` state. The spa admin must explicitly approve before it becomes `auto_assigned`. If the admin rejects the suggestion or picks a different therapist or different room, the original holds are released and new ones are created in their place.

Either way:
- **The engine never produces a free-floating suggestion.** Capacity is always reserved at engine-selection time.
- **No therapist is ever notified until the manager publishes.**

### Capacity rule (both modes, both resources)

**Capacity (therapist + room) is reserved at engine-selection time, not at manager-approval time.** Concretely, a booking in any of these states blocks both the assigned therapist AND the assigned room from being picked for an overlapping booking: `auto_suggested`, `auto_assigned`, `published`, `therapist_confirmed`. The reservation is released only if the assignment is rejected or reassigned (in which case the new resource's slot is held instead).

This is the whole point of `auto_suggested` doing real work in OFF mode. Without the hold, two bookings could land in the manager's approval queue both pointing at the same therapist (or the same room) for the same slot — a silent double-booking waiting to be approved. With the hold, the second booking can never see the suggested therapist or room as available; the engine picks an alternative, or marks the booking `unassigned` if no alternative is qualified.

Bookings in `pending_payment` (not yet paid) and `cancelled` do **not** hold capacity. The engine only runs after payment confirmation, so capacity is never reserved on speculative customer attempts.

### The lifecycle

**Step 1 — Booking creation.** A booking is created with status `pending_payment` via any of the three channels.

**Step 2 — Payment confirmation triggers the auto-assignment engine.** When the payment webhook confirms (CardCom / DTS / VPay), the booking moves to `confirmed`. The auto-assignment engine immediately picks a qualified `(therapist, room)` pair from the published availability for the booking's day, respecting service eligibility, **service-room compatibility**, **room blocks**, gender preference, therapist availability, and existing bookings. Both selected slots are held per the capacity rule.

- If `auto_assign_enabled = ON`: assignment_status = `auto_assigned`.
- If `auto_assign_enabled = OFF`: assignment_status = `auto_suggested`. The spa admin sees it in their dashboard and must confirm (which transitions it to `auto_assigned`) or pick a different qualified therapist or different room (which releases the original holds and creates new ones).

**Step 3 — Manager edit window.** Up until publish, the manager can reassign any `auto_assigned` booking to a different qualified therapist and/or a different qualified room via the admin UI. This is a manual action; no notification is sent to the therapist yet. Reassigning releases the previous resource's hold and creates a new one.

The manager learns about new auto-assignments through two channels:

- **Real-time dashboard.** Every newly auto-assigned (or auto-suggested) booking appears immediately on the manager's dashboard.
- **Push notification.** A push goes out to the manager via **email and WhatsApp** for every new auto-assignment. Each manager can mute the push notifications individually in their profile settings; muting does not affect the dashboard, only the push.

**Step 4 — Publish (two paths, default cadence = evening before the treatment day).** Therapist notification only happens when the manager publishes. There are two ways to publish:

- **Per-booking immediate publish.** The manager opens a single auto-assigned booking, optionally edits the assignment, then publishes that one booking. The use case is same-day or near-same-day bookings where waiting for the default cadence is too late.
- **Batch publish (default cadence).** The manager hits "Publish all unpublished assignments." This batches every booking still in `auto_assigned` state and sends them out together. **Default operational cadence is the evening before the treatment day** — the manager publishes tomorrow's assignments tonight. Weekly work-schedule publishes (surfacing which days a therapist is on duty) ride the same publish rail when the manager chooses to batch further ahead.

> **Trigger:** publish is **manager-button-only** in V1. There is no automatic cutoff.

In both publish paths the booking transitions to `published` and the system sends confirmation requests to each affected therapist **across the therapist's chosen channels** (any subset of WhatsApp + therapist portal notification + email + SMS; default is all four). The notification includes the room. The **2-hour SLA** clock starts at publish time, per therapist.

**Step 5 — Therapist confirmation.** Therapists confirm via whichever channel they prefer; one confirmation across any channel resolves the request and is recorded on the booking. The booking transitions to `therapist_confirmed`.

**Step 6 — SLA expiry.** If a therapist does not confirm within 2 hours after publish:

- The manager receives a reminder notification.
- The system suggests an alternative qualified therapist (and an updated room if the new therapist's compatibility requires it) for the manager to pick.
- The manager either reassigns (which releases the original holds, creates new ones, and restarts the publish + notification flow for the new assignee) or chases the original therapist directly.
- The booking remains in `published` state until either the original therapist confirms late or the manager reassigns.

### Room-specific differences

Rooms move through the same assignment states as therapists (`unassigned` → `auto_suggested`/`auto_assigned` → `published`), but with three operational differences:

- **No notification, no confirmation, no SLA.** Rooms don't get assignment requests; they don't confirm anything. The publish action notifies the therapist (the room is part of the therapist's notification), but the room itself is not a notification target.
- **Service-room compatibility is a hard constraint.** Some services require specific rooms (e.g., hot-stone treatments need a heated-stone-equipped room). The auto-assignment engine respects the existing service-room compatibility rules at selection time; the DB also enforces it.
- **Admin-set room blocks take rooms out of the pool.** Maintenance, deep cleaning, equipment failures — the admin marks a room as blocked for a period, and the engine excludes it from auto-assignment for that period.

**Reassignment timing:**

- *Before publish:* silent (same as reassigning a therapist before publish).
- *After publish:* silent. The therapist sees the new room when they next check the therapist portal or arrive for the appointment. There is no follow-up notification, no re-confirmation, no SLA reset. Therapists already confirmed availability for the time slot; the room change is metadata they pick up from the portal.

### Receptionist pre-empt

When a receptionist creates a booking, they can select a therapist and/or a room directly at booking time. This pre-empts the engine's choice for whatever they specify — the booking goes straight to `auto_assigned` with the receptionist's selection(s), and capacity is held the same way. The booking still flows through publish like any other booking; the receptionist's choice does not skip the manager's edit window or the publish step.

## The AI / automation thesis — four layers

> **Distinction worth holding.** "AI" in this section refers to **the conversational AI agent** (the WhatsApp / web-chat bot that talks to customers). The auto-assignment engine that picks therapists and rooms is server-side rule-based logic — it can use AI/ML techniques later, but it is not the conversational agent and is not bound by the conversational agent's restrictions. The hard invariants below restrict the conversational agent specifically.

### Layer 1 — Self-service customer booking (shipped)
Browser-direct `/book` → `/order/[token]` flow handles booking + payment without human touch. Bookings created here flow into the assignment lifecycle described above.

### Layer 2 — AI conversational booking (Phase 8)
The conversational AI agent reads inbound WhatsApp / web-chat messages, detects intent, drafts replies, and proposes tool calls (find slots, send payment link, etc.). **Every AI-drafted outbound reply is gated by receptionist or super-admin approval in V1; full auto-send is not in V1.**

### Layer 3 — Receptionist Texter
The receptionist's primary surface. They can:
- Monitor any conversation in real time, including bot-handled ones.
- Take over a conversation at any point.
- See full history with auto-translation when customer language ≠ receptionist language.
- See an AI-generated 2–3 sentence handoff summary.
- Use an in-chat booking panel for booking actions.
- Use quick replies in HE/EN/RU and AI-assist tools (translate, shorten, soften, draft from bullets).

### Layer 4 — Operational AI (intentionally narrow in V1)
**In V1:**
- Predictive no-show scoring as an advisory "high risk" signal (surfaced; never blocks).
- Auto-translate inbound messages.
- Auto-summarize conversation handoff.
- Auto-assignment of `(therapist, room)` pairs via the server-side engine (rule-based in V1; the toggle above lets the spa run it in suggest-only mode if they prefer).
- Manager push notifications on new auto-assignments (email + WhatsApp; per-manager mute).

**Not in V1:**
- The conversational AI agent picking therapists or rooms directly. (Resource selection is the auto-assignment engine's job, post-payment.)
- Auto-rebook on therapist sick-outs or room outages.
- Fully autonomous AI replies (receptionist or super admin approves every outbound send).
- Smart ML-based assignment scoring beyond the deterministic rule set.

## Hard invariants (never relaxed in V1)

1. **The conversational AI agent never writes to the DB directly.** It only calls Zod-validated server actions — the same actions human staff use.
2. **The conversational AI agent does not pick therapists or rooms.** Resource selection runs via the server-side auto-assignment engine after payment confirmation. The conversational agent's role is to create the booking; the engine assigns; the manager edits + publishes.
3. **No therapist is notified of a treatment assignment (or the weekly work schedule it rolls up into) until the manager publishes.** Auto-assignment, edits, and admin confirmation all happen silently. Publish is the only event that produces an outbound therapist notification. Default operational cadence: the manager publishes the coming day's treatments the evening before.
4. **Capacity (therapist + room) is held at engine-selection time, regardless of mode.** A booking in `auto_suggested`, `auto_assigned`, `published`, or `therapist_confirmed` state blocks both the assigned therapist and the assigned room from being selected for an overlapping booking. Suggestions are never free-floating. `pending_payment` and `cancelled` do not hold capacity.
5. **Every AI-drafted outbound reply to customers is approved by a receptionist or a super admin.** No auto-send in V1.
6. **The payment webhook is the source of truth for payment success.** Server actions never mark a booking paid without webhook confirmation.
7. **Therapist identity is anonymous on every customer-facing surface, and so is room identity.** No therapist names, no specific room identifiers, on `/book`, `/order`, SMS, or WhatsApp replies.
8. **Three booking paths, one source of truth.** Web, WhatsApp, receptionist — same DB, same overlap constraints, same payment pipeline, same lifecycle.
9. **Customer-facing surfaces and the therapist portal render in full HE / EN / RU with no fallbacks.** Admin and reception surfaces may fall back to EN. The ESLint no-literal-strings rule enforces this at build time on the surfaces that require it.

## Architecture principles

- One codebase, one repo. All product surfaces live in `rombrodio/SpaMe2`.
- Internal modularity:
  - Booking + scheduling: `src/lib/scheduling/`
  - **Auto-assignment engine** (new): `src/lib/scheduling/assignment/` — picks both therapist and room as a single decision
  - Payments: `src/lib/payments/`
  - Server actions: `src/lib/actions/`
  - Conversations (WhatsApp + AI agent): `src/lib/conversations/`
  - Receptionist Texter UI: `src/app/reception/inbox/`
  - **Multi-channel notifications** (new): `src/lib/notifications/` — adapters for WhatsApp, portal in-app, email, SMS, plus the publish orchestrator (therapist confirmation requests) and the manager-alert sender (per-booking pushes)
  - Reports: `src/lib/reports/`
- The VPay proxy lives in this repo under `services/vpay-proxy/` but ships to its own infrastructure (Fly.io, mTLS + static IP) per Verifone requirements.

## Confirmed decisions

These belong in `docs/plans/MASTER-PLAN.md → Confirmed Decisions`:

- **Booking assignment (therapist + room)** — auto-assignment engine runs on payment confirmation and selects both a therapist and a room as a single decision. The spa toggles `auto_assign_enabled` to choose between commit (`auto_assigned`) and suggest-only (`auto_suggested`) modes. Rooms move through the same lifecycle but without notification/confirmation/SLA.
- **`auto_assign_enabled` default value: ON.** V1 ships with the engine in commit mode; the spa can flip to OFF in super-admin settings if they prefer the approval gate.
- **Capacity rule** — both modes hold the therapist's AND room's slots at engine-selection time. `auto_suggested`, `auto_assigned`, `published`, and `therapist_confirmed` all block availability for both resources. `pending_payment` and `cancelled` do not.
- **Publish trigger** — manager-button-only. No automatic cutoff in V1.
- **Publish paths and cadence** — per-booking immediate (manager handles one booking now) and batch publish (default). Default operational cadence is the evening before the treatment day.
- **Therapist confirmation channels** — WhatsApp + portal + email + SMS. All enabled channels fire in parallel at publish; which channels are enabled is per-therapist preference (default: all four). One confirmation across any enabled channel resolves the request.
- **Confirmation SLA** — 2 hours from publish, per therapist.
- **SLA expiry behavior** — manager gets a reminder; system suggests an alternative qualified therapist (and updated room if needed); manager decides whether to reassign or chase.
- **Manager push notifications on new auto-assignments** — sent via email + WhatsApp (no SMS, no in-portal push). Muteable per manager via a profile-level preference.
- **Room reassignment after publish** — silent. The therapist sees the new room via the portal or on arrival; no follow-up notification, no re-confirmation, no SLA reset.
- **Receptionist pre-empt** — receptionists may select a therapist and/or a room at booking-creation time, pre-empting the engine for whatever they specify. Capacity is held the same way. The booking still goes through the publish step.
- **Room visibility to customers** — none. Customers don't see specific room identifiers and don't choose room subtypes.
- **Draft-approval authority** — a receptionist OR a super admin can approve, edit, or reject an AI-drafted outbound reply.
- **Language** — HE / EN / RU first-class on customer surfaces and the therapist portal in V1. Admin + reception stay HE/EN-validated with RU fallback; full RU on those surfaces is post-V1.
- **ESLint `no-literal-strings` rule installed and enforced in CI** — scoped to customer-facing components (`src/app/book/**`, `src/app/order/**`, `src/components/book/**`, `src/components/order/**`) and the therapist portal (`src/app/therapist/**`, `src/components/therapist/**`). Hardcoded user-visible strings on those surfaces fail the build. Admin and reception surfaces are exempt while RU remains optional there.

## Open questions still to resolve

These are deliberately not decided yet. Each should land as a one-line decision in `docs/plans/MASTER-PLAN.md → Confirmed Decisions` once chosen.

1. **Cancellation-policy scope.** Does the 5% / 100 ILS cancellation fee apply to all bookings, or only to bookings secured by a card token? Cash-on-arrival has a CardCom token via CreateTokenOnly so it could apply uniformly — confirm.
2. **Late same-day bookings — default publish behavior.** A booking made at 17:50 today for tomorrow at 09:00 is fine in the end-of-day batch. But what about a booking made at 09:00 today for 14:00 today? In principle the manager should use per-booking immediate publish, but is there a default cutoff (e.g., "any booking starting within 4 hours auto-flags for immediate publish")? Or is it purely the manager's call every time?

## Files this vision propagates to

When this vision changes, update the following in the same PR (per `docs/DOC-SYNC.md`):

| File | What needs updating |
|---|---|
| `AGENTS.md` | Hard invariants list (#1–#9), Roles section, Roadmap (new Phase: auto-assignment engine + multi-channel therapist notification + manager push alerts + publish flow) |
| `CLAUDE.md` | Hard invariants, Roles, Language policy (full RU on customer + therapist surfaces; ESLint rule note), AI allowed actions list, V1 scope (Build / Do not build), Business rules (add: capacity rule applies to both therapist AND room; service-room compatibility is a hard constraint; room blocks take rooms out of the auto-assignment pool; manager push alerts), Booking statuses, the new `auto_assign_enabled` setting (default ON), Engineering rules (no literal user-facing strings on customer + therapist surfaces) |
| `docs/plans/MASTER-PLAN.md` | Vision summary, Confirmed Decisions (move every item from "Confirmed decisions" above into the master list), Phase list (assignment engine + notification work), Architecture, Schema (new `bookings.assignment_status` enum, new `therapist_notifications` table, new `manager_alerts` log, new `spa_settings.auto_assign_enabled` boolean default true, new `profiles.alert_preferences` JSON or similar for per-manager mute), Risks |
| `README.md` | Auth & Roles section (therapist confirmation channels, manager push alerts), Tech stack (new SMS/email notification adapters, channel-orchestration component, ESLint plugin) |
| `.cursor/rules/30-roles-auth.mdc` *(when created)* | Therapist confirmation surface boundaries; receptionist pre-empt rule (covers both therapist and room); `auto_assign_enabled` setting visibility (super_admin only); per-manager alert-mute preference |
| `.cursor/rules/40-server-actions.mdc` *(when created)* | The AI-allowed-action list — confirm `assign_therapist` AND `assign_room` are **not** added (assignment is the engine's job, not the conversational agent's) |
| `eslint.config.mjs` + `package.json` | Install `eslint-plugin-no-literal-string` (or equivalent); configure with file-glob scoping to customer-facing components and the therapist portal only; add to lint script. Update CONTRIBUTING.md to reference the rule. |
| `src/i18n/messages/{he,en,ru}.json` | New strings for: end-of-day publish, per-booking publish, batched confirmation requests, multi-channel notification templates (with room info for therapist notifications), SLA-expiry reminder, system-suggests-alternative prompt, manager push-alert templates; full RU coverage on every customer-facing key and every therapist-portal key |
| `supabase/migrations/` | New migration(s) for: `bookings.assignment_status` enum (`unassigned` / `auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed`), `therapist_notifications` table (channel, sent_at, confirmed_at, confirmation_channel, expiry_at), `manager_alerts` table (booking_id, sent_at, channels), `spa_settings.auto_assign_enabled` boolean default true, `profiles.alert_preferences` (per-manager mute + per-therapist channel subset), indexes for the SLA timer + per-therapist confirmation queries. **Critically: update BOTH overlap-prevention exclusion constraints (therapist + room) on `bookings` to treat all four "engaged" assignment states (`auto_suggested`, `auto_assigned`, `published`, `therapist_confirmed`) as blocking, so the capacity rule is enforced at the DB layer for both resources, not just at the application layer.** |
