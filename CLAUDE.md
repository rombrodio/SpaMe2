# Project: Spa management app for Tel Aviv spa

## Product goal
Replace Biz-Online with a custom web app focused on:
1. Scheduling & calendar
2. AI chatbot for customers (WhatsApp + website)
3. Payment processing via hosted payment links/pages
4. Therapist and room management

## Required stack
- Next.js (App Router) on Vercel
- TypeScript
- Supabase Postgres
- Supabase Auth
- Tailwind CSS
- shadcn/ui where useful
- Zod for validation
- Route Handlers / Server Actions for backend flows
- WhatsApp Business Cloud API
- Hosted Israeli payment provider with webhook support

## Non-negotiable architecture rules
- All scheduling logic must run on the server
- AI must never write arbitrary data directly to the database
- AI may only call approved server actions
- Never store raw credit card data
- Payment webhook is the source of truth for payment success
- WhatsApp is used for conversation, reminders, confirmations, and payment-link sending only
- Default timezone: Asia/Jerusalem
- Default currency: ILS

## Core entities
- Customer
- Therapist
- Room
- Service
- TherapistService
- RoomService
- TherapistAvailabilityRule
- TherapistTimeOff
- RoomBlock
- Booking
- Payment
- ConversationThread
- ConversationMessage
- AuditLog

## Business rules
- Prevent overlapping therapist bookings
- Prevent overlapping room bookings
- Only allow therapists qualified for the selected service
- Only allow rooms compatible with the selected service
- Booking statuses:
  - pending_payment
  - confirmed
  - cancelled
  - completed
  - no_show
- If payment is required, booking remains pending_payment until webhook confirmation
- Never fabricate availability
- Never fabricate payment confirmation

## AI allowed actions (Phase 6 — not yet implemented)

These are the only tools the chatbot will be allowed to call when Phase 6
begins; **none exist in the codebase today**. Phase 6 is reshaped for
SpaMeV3 — the conversational / bot layer will ship as a first-party
Texter-alike WhatsApp Business platform, not in this repo. See
`docs/plans/MASTER-PLAN.md`.

- find_available_slots
- create_tentative_booking
- create_payment_link
- reschedule_booking
- cancel_booking
- handoff_to_staff

## V1 scope only
Build only:
- admin auth
- calendar
- bookings
- therapists
- rooms
- services
- customers
- hosted payment flow
- WhatsApp/web chat foundation
- staff inbox
- audit logs

Do not build in V1:
- payroll
- inventory
- loyalty
- deep accounting
- complex memberships
- multi-branch logic
- advanced BI dashboards

## Engineering rules
- Keep business logic in services/lib modules, not UI components
- Validate all inputs with Zod
- Use environment variables for all secrets
- Add mock adapters when external credentials are missing
- Prefer simple, production-sane solutions
- Keep files modular and readable
- Add README with setup, migrations, seed, env vars, deploy, webhook config

## Current implementation order

See [`docs/plans/MASTER-PLAN.md`](docs/plans/MASTER-PLAN.md) — single source of truth for phase status. Do not duplicate phase lists here; they drift.

## Plan Management

- The project plan lives in `docs/plans/`. At the START of every session, read all
  plan files in that directory before doing anything else.
- The plan is the single source of truth for architecture decisions, phased
  implementation order, schema design, and module structure.
- Do not deviate from the plan without explicitly discussing the change with the
  user and getting approval first.
- If the plan needs to be updated (e.g. scope change, new tradeoff discovered),
  update the plan file itself so it stays current for future sessions. do that after confirming with the user

## Session Workflow

- At session start, run `git log --oneline -10` on `main` plus
  `gh pr list --state merged --limit 5` to see what shipped recently.
  Cross-reference against `docs/plans/MASTER-PLAN.md` phase markers to
  identify the frontier.
- Feature branches are ephemeral (`main`-only flow, squash-merged, auto-
  deleted on merge). Don't assume a phase matches the branch name.

## Docs sync (MANDATORY)

**Before every commit** that introduces a new migration, env var, route,
feature, SPA-* item, or DEF-* fix, walk the manifest at
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
- CI gate passes (`tsc --noEmit`, `lint`, `test`, `build` — see
  `.github/workflows/ci.yml`)
- schema/migrations are valid
- key flows work locally
- edge cases for that phase are handled
- docs affected by the change are updated per `docs/DOC-SYNC.md`
