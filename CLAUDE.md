# Project: SpaMe — spa management platform for a Tel Aviv spa

## Product goal

SpaMe is a single-repo spa management platform replacing Biz-Online for a boutique
Tel Aviv spa. It fuses — tailored to spa operations — the surface area of BizOnline
(booking + payment), ShiftOrganizer (staff availability), and Texter (WhatsApp
Business + AI conversational platform), with AI-assisted automation as a first
principle. **Everything ships in this repo.** The earlier "SpaMeV3" name for a
separate conversational product is dropped.

Core surfaces:

1. Calendar + scheduling + **auto-assignment engine (therapist + room) with publish rail + multi-channel therapist confirmation**
2. Payment processing (CardCom + DTS + VPay, hosted + mock)
3. Customer booking flow (`/book`) — browser-direct, phone-only identity
4. Receptionist Texter inbox (`/reception/inbox`, Phase 8) — live visibility into every active
   conversation, approve/edit/reject every AI draft before it sends, in-chat booking panel
5. WhatsApp Business + web-chat gateway (Phase 8) — AI drafts, receptionist or super admin approves
6. Therapist portal — availability, time-off, confirm assignment receipts across chosen channels
7. Reports (Phase 9) — fixed-report module with date-range + CSV

## Required stack

- Next.js (App Router) on Vercel
- TypeScript
- Supabase Postgres
- Supabase Auth
- Tailwind CSS v4 + hand-rolled UI primitives (`src/components/ui/`)
- Zod for validation
- Server Actions are the only write path — AI and staff call the same actions
- WhatsApp Business Cloud API (Meta) — Phase 8
- CardCom + DTS + VPay for payment
- `next-intl` for i18n — cookie-only mode (no URL segment), catalogs in `src/i18n/messages/`
- Twilio for SMS (booking confirmations + one of four therapist notification channels)
- **Email provider** (TBD — Resend / Postmark / SES / SendGrid candidate, Phase 7c) — therapist notification channel + manager push alerts
- **ESLint `no-literal-strings` rule** (Phase 7d) — scoped to customer-facing + therapist portal components; hardcoded user-visible strings fail the build on those surfaces

## Hard invariants (never relaxed)

1. **The conversational AI agent never writes to the DB directly** — only calls approved, Zod-validated server actions. The same server actions human staff use.
2. **The conversational AI agent does not pick therapists or rooms.** Resource selection runs via the server-side auto-assignment engine after payment confirmation; the agent's role is to create the booking, the engine assigns, the manager edits + publishes.
3. **No therapist is notified of a treatment assignment (or the weekly work schedule it rolls up into) until the manager publishes.** Auto-assignment, edits, and admin approval all happen silently. Default operational cadence: tomorrow's treatment assignments are published the evening before.
4. **Capacity (therapist + room) is held at engine-selection time, regardless of mode.** A booking in `auto_suggested`, `auto_assigned`, `published`, or `therapist_confirmed` state blocks both resources. `pending_payment` and `cancelled` do not hold capacity.
5. **Every AI-drafted outbound reply to customers is approved by a receptionist OR a super admin.** No auto-send in V1.
6. **Payment webhook is the source of truth for payment success.** Server actions never mark a booking paid without webhook confirmation.
7. **Therapist identity AND room identity are anonymous on every customer-facing surface** (`/book`, `/order`, SMS, WhatsApp replies, web chat).
8. **Three booking paths (web / WhatsApp / receptionist), one source of truth** — same DB, same overlap constraints, same payment pipeline, same assignment lifecycle.
9. **Customer-facing surfaces and the therapist portal render in full HE / EN / RU with no fallbacks.** Admin + reception may fall back to EN. ESLint enforces no literal user-visible strings on the surfaces that require RU.

Supporting rules (apply always, not assignment-specific):

- All scheduling logic runs on the server.
- Never store raw credit card data.
- Default timezone: Asia/Jerusalem.
- Default currency: ILS (agorot in DB).

## Roles

- **Super Admin** — full CRUD + audit log + reports + full inbox visibility. Approves / edits / rejects AI-drafted outbound replies from the same inbox the receptionist uses. Owns the `auto_assign_enabled` spa setting and the publish action. May mute own manager push alerts via profile preferences.
- **Receptionist** (Phase 6) — primary surface is `/reception/inbox`. Creates bookings on behalf of customers and **may pre-empt the auto-assignment engine by selecting a therapist and/or a room at booking-creation time** (the booking still flows through the manager's publish step). Submits own on-duty (chat + phone) windows. Cannot manage therapists / services / rooms / settings / audit log. Does not receive therapist assignment receipts.
- **Therapist** — own availability + time-off; read-only bookings; confirms assignment receipts delivered **across the therapist's chosen subset of four parallel channels** (WhatsApp + portal + email + SMS — default: all four). One confirmation across any enabled channel resolves the request; 2h SLA from publish.
- **Customer** — phone-identified (E.164), no login, no accounts. Never sees therapist names or specific room identifiers.

## Language policy

Hebrew default. V1 coverage matrix:

| Surface | HE | EN | RU |
|---|---|---|---|
| Customer-facing (`/book`, `/order`, SMS, WhatsApp templates, web-chat widget, payment pages) | first-class | first-class | **first-class — no fallback** |
| Therapist portal | first-class | first-class | **first-class — no fallback** |
| Admin portal | first-class | validated | keys where present, EN fallback at render |
| Reception portal | first-class | validated | keys where present, EN fallback at render |

**Phases 7a + 7b shipped.** Phase 7a landed `next-intl` cookie-only mode + migration 00025 (`language_code` enum + `profiles.language` + `customers.language`). Phase 7b migrated every surface off literals (7 PRs, EN + HE only at that stage).

**Phase 7d completes the matrix** by translating every `customer.*` + `therapist.*` key into RU and installing an ESLint `no-literal-strings` rule scoped to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`. A missing RU key on those surfaces is a release blocker; the lint rule fails the build on hardcoded user-visible strings there. Admin + reception surfaces remain exempt (RU stays deep-merge fallback).

Per-user toggle for staff persisted on `profiles.language`. Customer language
auto-detected on first inbound message and persisted on `customers.language`
(Phase 8 wires the detection).

When adding new user-facing strings, put the canonical key in `en.json` and a
human translation in `he.json`. **For customer-facing or therapist-portal keys, also add a RU translation** — the ESLint rule + no-fallback policy make this mandatory after Phase 7d. Admin / reception keys can leave RU empty (deep-merge fallback to EN).

**Still-English surfaces (intentional, deferred):**

- Server-action error envelopes — Zod errors still come back as English strings
  and `FormErrors` renders them verbatim. Refactor to `{key, params}` is Phase 8+.
- SMS / email templates — keyed off Hebrew for now. Phase 8 work expands this.
- Supabase auth error text (`/login?error=...`) — the error message is whatever
  Supabase returns, English. Not worth intercepting for one or two strings.

## Core entities

- Customer (+ `language` shipped in Phase 7a, `gender` pending Phase 9)
- Therapist
- Room
- Service
- TherapistService / RoomService
- TherapistAvailabilityRule / TherapistTimeOff
- ReceptionistAvailabilityRule (Phase 6)
- RoomBlock
- Booking (+ `assignment_status` enum `unassigned` / `auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed` and `published_at`, Phase 7c)
- **TherapistNotification** (Phase 7c) — one row per `(booking, channel)`: `channel`, `sent_at`, `confirmed_at`, `confirmation_channel`, `expiry_at`
- **ManagerAlert** (Phase 7c) — per-booking push-alert log: `booking_id`, `sent_at`, `channels[]`
- Payment
- ConversationThread / ConversationMessage (+ approval-state, draft-linkage, translations, handoff summary in Phase 8)
- AuditLog

## Business rules

- Prevent overlapping therapist bookings (Postgres exclusion constraint)
- Prevent overlapping room bookings (Postgres exclusion constraint)
- **Exclusion constraints gate on `assignment_status`, not `booking_status`** — the engaged states (`auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed`) block both therapist AND room capacity. `pending_payment` and `cancelled` do not hold capacity (Phase 7c rewrites the existing constraints).
- Only allow therapists qualified for the selected service (composite FK)
- Only allow rooms compatible with the selected service (composite FK)
- **Service-room compatibility + room blocks are hard constraints respected by the auto-assignment engine** at selection time; DB also enforces compatibility via the composite FK.
- **Auto-assignment engine runs on payment confirmation and picks a qualified `(therapist, room)` pair as one decision** (Phase 7c). The spa-wide `spa_settings.auto_assign_enabled` boolean (default **ON**) toggles between commit (`auto_assigned`) and suggest-only (`auto_suggested`) modes.
- **Publish is manager-button-only** — per-booking immediate OR batch (default cadence: the evening before the treatment day). No automatic cutoff in V1.
- **Therapist confirmation** runs across the therapist's chosen channel subset (WhatsApp + portal + email + SMS, default all four) fired in parallel at publish. One confirmation across any enabled channel resolves the request. 2h SLA per therapist from publish.
- **SLA expiry** → manager reminder + system suggests a qualified alternative; manager decides reassign vs chase.
- **Manager push alerts on new auto-assignments** go via email + WhatsApp only (no SMS, no portal push). Muteable per-manager via `profiles.alert_preferences`.
- **Room reassignment after publish is silent** — no re-notification, no re-confirmation, no SLA reset. The therapist sees the new room on the portal or on arrival.
- **Receptionist pre-empt** — receptionist may select therapist and/or room at booking-creation time; the specified resource(s) skip `auto_suggested` and go straight to `auto_assigned`. Booking still flows through publish.
- Booking statuses: `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show`. The `status` and `assignment_status` fields are orthogonal — `status` tracks payment/lifecycle, `assignment_status` tracks the manager-publish pipeline.
- If payment is required, booking remains `pending_payment` until webhook confirmation
- Never fabricate availability
- Never fabricate payment confirmation
- Services 45-min treatment + 15-min buffer by default (migration 00021)
- Business hours 09:00–21:00, admin-configurable, 60-min slot granularity default (migration 00020)

## AI allowed actions (Phase 8 — in this repo)

These are the only tools the conversational AI agent will be allowed to call. Each maps to a Zod-validated server action; every outbound send goes through the receptionist-or-super-admin approval rail before it leaves the platform. Deferred to Phase 8 and will grow with usage analysis:

- `find_available_slots`
- `create_tentative_booking` (creates `unassigned` booking; the auto-assignment engine picks `(therapist, room)` post-payment, not the agent)
- `create_payment_link`
- `reschedule_booking`
- `cancel_booking`
- `handoff_to_staff`
- `translate_message`
- `summarize_thread`
- `compose_reply` (drafts a reply for receptionist-or-super-admin approval — never sends directly)

**Explicitly not allowed:** `assign_therapist`, `assign_room`, `confirm_payment`, `override_business_hours`. Resource assignment is the server-side auto-assignment engine's job (Phase 7c `src/lib/scheduling/assignment/`), never the conversational agent's.

## V1 scope

Build in V1:

- admin / receptionist / therapist portals
- calendar, bookings, therapists, rooms, services, customers
- hosted payment flow (CardCom + DTS + VPay)
- **auto-assignment engine** picking `(therapist, room)` pairs on payment confirmation (Phase 7c)
- **publish rail** — manager-button per-booking + batch publish (default: the evening before the treatment day) (Phase 7c)
- **4-channel therapist notification rail** — WhatsApp + portal + email + SMS, per-therapist chosen subset (Phase 7c)
- **manager push alerts** on new auto-assignments (email + WhatsApp) with per-manager mute preference (Phase 7c)
- `auto_assign_enabled` spa setting (default ON, super-admin-only) (Phase 7c)
- WhatsApp + web chat foundation (Phase 8)
- receptionist Texter inbox with AI-draft approval rail (receptionist OR super admin) (Phase 8)
- AI writing-assist for receptionists (translate / shorten / soften / draft from bullets)
- inbound auto-translation + AI handoff summary
- predictive no-show scoring (advisory only)
- fixed reports with date-range + CSV (Phase 9)
- audit logs
- **HE / EN / RU first-class on customer-facing surfaces and the therapist portal** (Phase 7d); admin + reception stay HE/EN-validated with RU fallback
- **ESLint `no-literal-strings` rule** enforced on customer-facing + therapist portal components (Phase 7d)

Do NOT build in V1:

- payroll
- inventory
- loyalty programs
- deep accounting
- complex memberships
- multi-branch logic
- advanced BI dashboards or custom report builder
- customer accounts / login / self-service history pages
- shift-swap / shift-approval / time-clock / payroll-adjacent workflows
- WCAG compliance
- **conversational AI agent picking therapists or rooms** — resource assignment is the engine's job, not the agent's
- **ML-based assignment scoring** beyond the deterministic rule set
- **automatic publish cutoff** — publish stays manager-button-only in V1
- auto-rebook on therapist sick-outs or room outages
- fully-autonomous AI replies (receptionist or super admin approves every send in V1)
- a human design partner (AI does the design work)

## Engineering rules

- Keep business logic in `src/lib/` modules, not UI components
- Validate all inputs with Zod
- Use environment variables for all secrets
- Add mock adapters when external credentials are missing
- Prefer simple, production-sane solutions
- Keep files modular and readable
- All user-facing strings come from the i18n catalog. Canonical key source is `en.json`; `he.json` must be kept in sync manually.
- **Customer-facing components and the therapist portal MUST NOT contain literal user-visible strings** — ESLint enforces at build time (Phase 7d, globs: `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`). RU coverage on those surfaces is mandatory — a missing RU key is a release blocker. Admin + reception surfaces remain exempt (reviewer enforces, EN deep-merge fallback at render).

## Current implementation order

See [`docs/plans/MASTER-PLAN.md`](docs/plans/MASTER-PLAN.md) — single source of truth for phase status. Do not duplicate phase lists here; they drift.

## Plan Management

- The project plan lives in `docs/plans/`. At the START of every session, read all
  plan files in that directory before doing anything else.
- The plan is the single source of truth for architecture decisions, phased
  implementation order, schema design, and module structure.
- Do not deviate from the plan without explicitly discussing the change with the
  user and getting approval first.
- If the plan needs to be updated (scope change, new tradeoff), update the plan
  file itself so it stays current for future sessions. Do that after confirming
  with the user.

## Session Workflow

- At session start, run `git log --oneline -10` on `main` plus
  `gh pr list --state merged --limit 5` to see what shipped recently.
  Cross-reference against `docs/plans/MASTER-PLAN.md` phase markers to
  identify the frontier.
- Feature branches are ephemeral (`main`-only flow, squash-merged, auto-
  deleted on merge). Don't assume a phase matches the branch name.

## Working with Cursor + Opus 4.7

This repo is authored against **Opus 4.7**. Set it as your default model in
Cursor Settings → Models for Plan / Agent / Debug / Ask. Override only with
explicit user direction (e.g. a faster model for a one-shot formatting pass).

**Mode discipline:**

- **Plan mode is the default.** Settings → Agents → Default Mode = Plan.
  Use it for anything touching a migration, schema shape, multi-file
  refactor, or an ambiguous ask. The plan mode forces a think-first moment
  and a `CreatePlan` artifact before any code change.
- **Agent mode** is only for implementing an already-confirmed plan. If
  mid-implementation the scope grows, return to Plan mode.
- **Debug mode** fires when investigation is needed — an error, an
  unexpected test failure, or behaviour that does not match the plan.
- **Subagents:** prefer `explore` (read-only) for research passes on big
  subtrees; prefer `shell` for git operations so the main thread stays in
  code context.

**One feature = one chat.** When a chat reaches roughly 40 tool calls or
the model starts forgetting an invariant it clearly read earlier, stop,
fill out [`docs/SESSION-HANDOFF.md`](docs/SESSION-HANDOFF.md), open a fresh
chat, paste the handoff as the first message. Do not let context
compaction decide what gets forgotten.

**The Cursor-native rail is in `.cursor/`:**

- `.cursor/rules/*.mdc` — auto-attached by glob; the always-apply rules
  (`00-project-invariants.mdc` + `90-mcp-safety.mdc`) load every session.
- `.cursor/hooks.json` + `.cursor/hooks/*.sh` — dangerous-command blocker
  (`guard-shell.sh`, the single source of truth — not mirrored in Cursor
  Settings), secret scanner, Prettier-on-save, DOC-SYNC reminder.
- `.cursor/bugbot.yaml` — review bot scoped to the high-risk paths.
- `.cursor/mcp.json` — Supabase (read-only, dev only, **never**
  service-role), GitHub, Playwright. Credentials live in environment
  variables, never in the file.

Operator-side setup (Cursor Settings defaults, statusline install, Cloud
Agent setup) is documented in [`CONTRIBUTING.md`](CONTRIBUTING.md)
"Cursor SDLC rail" sections.

## Docs sync (MANDATORY)

**Before every commit** that introduces a new migration, env var, route,
feature, SPA-* item, DEF-* fix, role change, or user-facing string, walk
[`docs/DOC-SYNC.md`](docs/DOC-SYNC.md). Update every doc listed for that
change in the **same commit**. Tick the `## Docs sync` checklist in the PR
template when you open the PR.

This is not optional. It is the single rule that keeps the plan, the
README, and the agent-facing docs honest across sessions. Skipping it is
how we got the last audit's 20 findings.

## Suggested end-of-session checklist

Before opening a PR:

1. Summarize what shipped in the PR description (paste the commits,
   mention which SPA-* / DEF-* items it closes).
2. Confirm CI is green locally: `npm run typecheck && npm run lint && npm run test && npm run build`.
3. Walk `docs/DOC-SYNC.md` and tick the `## Docs sync` section in the PR
   body per the manifest.

## Definition of done per phase

A phase is done only when:

- CI gate passes (`tsc --noEmit`, `lint`, `test`, `build` — see `.github/workflows/ci.yml`)
- schema / migrations are valid
- key flows work locally
- edge cases for that phase are handled
- docs affected by the change are updated per `docs/DOC-SYNC.md`
