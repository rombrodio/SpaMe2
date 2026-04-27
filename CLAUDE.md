# Project: SpaMe — spa management platform for a Tel Aviv spa

## Product goal

SpaMe is a single-repo spa management platform replacing Biz-Online for a boutique
Tel Aviv spa. It fuses — tailored to spa operations — the surface area of BizOnline
(booking + payment), ShiftOrganizer (staff availability), and Texter (WhatsApp
Business + AI conversational platform), with AI-assisted automation as a first
principle. **Everything ships in this repo.** The earlier "SpaMeV3" name for a
separate conversational product is dropped.

Core surfaces:

1. Calendar + scheduling + deferred-therapist assignment
2. Payment processing (CardCom + DTS + VPay, hosted + mock)
3. Customer booking flow (`/book`) — browser-direct, phone-only identity
4. Receptionist Texter inbox (`/reception/inbox`, Phase 8) — live visibility into every active
   conversation, approve/edit/reject every AI draft before it sends, in-chat booking panel
5. WhatsApp Business + web-chat gateway (Phase 8) — AI drafts, human approves
6. Therapist portal — availability, time-off, confirm deferred-assignment receipts
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
- Twilio for SMS fallback

## Hard invariants (never relaxed)

- All scheduling logic runs on the server
- **AI never writes arbitrary data to the DB** — only calls approved, Zod-validated server actions
- **AI never assigns a therapist** in V1 — humans only (manager assigns, therapist confirms via WhatsApp within a 2h SLA)
- **Every AI-drafted outbound reply is receptionist-approved** in V1. Full auto-send mode is deferred.
- Never store raw credit card data
- Payment webhook is the source of truth for payment success
- Default timezone: Asia/Jerusalem
- Default currency: ILS (agorot in DB)
- Therapist identity is anonymous across every customer surface (`/book`, `/order`, SMS, WhatsApp replies)

## Roles

- **Super Admin** — full CRUD + audit log + reports + full inbox visibility
- **Receptionist** (Phase 6) — primary surface is `/reception/inbox`; creates bookings (may pick therapist); submits own on-duty (chat + phone) windows; cannot manage therapists/services/rooms/settings/audit log and does not receive therapist assignment receipts
- **Therapist** — own availability + time-off, read-only bookings, confirms assignment receipts
- **Customer** — phone-identified (E.164), no login, no accounts

## Language policy (Phases 7a + 7b shipped)

Hebrew default. First-class English for every user. Russian is deep-merge fallback
to English at render time (catalog exists, not yet validated surface-by-surface).

Per-user toggle for staff persisted on `profiles.language`. Customer language
auto-detected on first inbound message and persisted on `customers.language`
(Phase 8 wires the detection).

When adding new user-facing strings, put the canonical key in `en.json` and a
human translation in `he.json`. RU can be left empty. ESLint does **not** block
literals — manual review is the guardrail until / unless a `no-literal-user-facing-strings`
rule is added in a follow-up.

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
- Booking
- Payment
- ConversationThread / ConversationMessage (+ approval-state, draft-linkage, translations, handoff summary in Phase 8)
- AuditLog

## Business rules

- Prevent overlapping therapist bookings (Postgres exclusion constraint)
- Prevent overlapping room bookings (Postgres exclusion constraint)
- Only allow therapists qualified for the selected service (composite FK)
- Only allow rooms compatible with the selected service (composite FK)
- Booking statuses: `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show`
- If payment is required, booking remains `pending_payment` until webhook confirmation
- Never fabricate availability
- Never fabricate payment confirmation
- Services 45-min treatment + 15-min buffer by default (migration 00021)
- Business hours 09:00–21:00, admin-configurable, 60-min slot granularity default (migration 00020)

## AI allowed actions (Phase 8 — in this repo)

These are the only tools the AI will be allowed to call. Each maps to a
Zod-validated server action; every outbound send goes through the receptionist
approval rail before it leaves the platform. Deferred to Phase 8 and will grow
with usage analysis:

- `find_available_slots`
- `create_tentative_booking` (creates `unassigned` booking)
- `create_payment_link`
- `reschedule_booking`
- `cancel_booking`
- `handoff_to_staff`
- `translate_message`
- `summarize_thread`
- `compose_reply` (drafts a reply for receptionist approval — never sends directly)

**Explicitly not allowed:** `assign_therapist`, `confirm_payment`, `override_business_hours`.

## V1 scope

Build in V1:

- admin / receptionist / therapist portals
- calendar, bookings, therapists, rooms, services, customers
- hosted payment flow (CardCom + DTS + VPay)
- WhatsApp + web chat foundation (Phase 8)
- receptionist Texter inbox with AI-draft approval (Phase 8)
- AI writing-assist for receptionists (translate / shorten / soften / draft from bullets)
- inbound auto-translation + AI handoff summary
- predictive no-show scoring (advisory only)
- fixed reports with date-range + CSV (Phase 9)
- audit logs
- HE / EN / RU localization across every surface (Phase 7a + 7b shipped — HE + EN validated; RU AI-drafted with EN fallback)

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
- AI assigning therapists
- smart auto-assignment or auto-rebook on sick-outs
- fully-autonomous AI replies (receptionist approves every send in V1)
- a human design partner (AI does the design work)

## Engineering rules

- Keep business logic in `src/lib/` modules, not UI components
- Validate all inputs with Zod
- Use environment variables for all secrets
- Add mock adapters when external credentials are missing
- Prefer simple, production-sane solutions
- Keep files modular and readable
- All user-facing strings come from the i18n catalog. Canonical key source is `en.json`; `he.json` must be kept in sync manually (no ESLint rule yet — reviewer enforces)

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
2. Confirm CI is green locally: `npm run lint && npm run test && npm run build`.
3. Walk `docs/DOC-SYNC.md` and tick the `## Docs sync` section in the PR
   body per the manifest.

## Definition of done per phase

A phase is done only when:

- CI gate passes (`tsc --noEmit`, `lint`, `test`, `build` — see `.github/workflows/ci.yml`)
- schema / migrations are valid
- key flows work locally
- edge cases for that phase are handled
- docs affected by the change are updated per `docs/DOC-SYNC.md`
