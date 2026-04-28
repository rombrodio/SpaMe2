# AGENTS.md

30-second entrypoint for any AI agent (Claude, Cursor, Codex, v0, Augment, Copilot, etc.) working on this repo.

## What this is

**SpaMe** is a single-venue spa management platform built for a boutique spa in Tel Aviv, replacing Biz-Online. Single repo, single product — the earlier "SpaMeV3" split for the conversational layer is dropped; WhatsApp + AI + receptionist Texter inbox all live here.

Next.js 16 (App Router) on Vercel, Supabase Postgres + Auth, Tailwind v4, TypeScript. In production at **https://spa-me2.vercel.app**. Current scale: ~20 therapists, a few receptionists, hundreds of customers. Hebrew default; **HE / EN / RU are first-class on customer-facing surfaces and the therapist portal** (no fallbacks); admin + reception stay HE/EN-validated with RU deep-merge fallback. Locale is a `NEXT_LOCALE` cookie — no `[locale]` URL segment.

## Roles (Phase 6+)

- **Super Admin** — full CRUD + audit log + reports + full inbox visibility. Can approve / edit / reject AI-drafted outbound replies from the same inbox receptionists use. Owns the `auto_assign_enabled` spa setting and the publish action.
- **Receptionist** (Phase 6) — primary surface `/reception/inbox`; creates bookings (may pre-empt the auto-assignment engine by picking a therapist **and/or** a room at booking creation); submits own on-duty (chat + phone) windows; may mute own manager push alerts via profile preferences. Cannot manage therapists / services / rooms / settings / audit log; does not receive therapist assignment receipts.
- **Therapist** — own availability + time-off; read-only bookings; confirms assignment receipts delivered across their **chosen subset of four parallel channels** (WhatsApp + portal + email + SMS — default all four). One confirmation across any enabled channel resolves; 2h SLA from publish.
- **Customer** — phone-identified (E.164), no login, no accounts. Never sees therapist names or specific room identifiers.

## Hard invariants (never relaxed)

1. The conversational AI agent never writes to the DB directly — only calls Zod-validated server actions.
2. The conversational AI agent does not pick therapists or rooms — resource selection is the server-side auto-assignment engine's job, post-payment confirmation.
3. No therapist is notified of a treatment assignment (or the weekly work schedule it rolls up into) until the manager publishes. Default cadence: tomorrow's assignments publish the evening before.
4. Capacity (therapist + room) is held at engine-selection time — bookings in `auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed` block both resources. `pending_payment` and `cancelled` do not hold capacity.
5. Every AI-drafted outbound reply to customers is approved by a receptionist OR a super admin. No auto-send in V1.
6. Payment webhook is the source of truth for payment success.
7. Therapist identity AND room identity are anonymous on every customer-facing surface.
8. Three booking paths (web / WhatsApp / receptionist) share one source of truth — same DB, same overlap constraints, same payment pipeline, same assignment lifecycle.
9. Customer-facing surfaces and the therapist portal render in full HE / EN / RU with no fallbacks; admin + reception may fall back to EN.

## Before you do anything

1. Read [`CLAUDE.md`](./CLAUDE.md) — engineering rules, non-negotiable architecture constraints, business rules, allowed-action list for the AI.
2. Read [`docs/vision/SpaMe-vision.md`](./docs/vision/SpaMe-vision.md) — canonical product vision (who it serves, booking assignment lifecycle, hard invariants, confirmed decisions).
3. Read [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) — single source of truth for phase status. Do not rederive it; update it when phases ship.
4. Read [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) — the mandatory pre-commit manifest. Walk it before every commit.
5. Skim [`docs/DEV-SESSION-MANUAL.md`](./docs/DEV-SESSION-MANUAL.md) — operator-facing walkthrough of the Cursor SDLC rail (one-time setup, daily rhythm, what each hook does when it fires, troubleshooting). Start here if you haven't run a dev session in this repo before.
6. Skim [`docs/qa/defect-retest.md`](./docs/qa/defect-retest.md) if you're about to touch a UI surface — shows every DEF-* the repo has closed and where the fix lives, so you don't accidentally regress it.
7. `git log --oneline -10` on `main` + `gh pr list --state merged --limit 5` — confirms what just shipped so you don't duplicate work.

## Cursor rhythm

This repo is authored against Opus 4.7. The Cursor-native rail lives in `.cursor/`:

- [`.cursor/rules/`](./.cursor/rules) — scoped guardrails auto-attached by glob. Always-apply rules: `00-project-invariants.mdc` (9 hard invariants) and `90-mcp-safety.mdc` (MCP safety — never service-role, never prod project ref). Glob-scoped rules cover server-actions, scheduling, payments, i18n, migrations, tests, middleware, and docs-sync.
- [`.cursor/hooks.json`](./.cursor/hooks.json) + `.cursor/hooks/*.sh` — project hooks. `sessionStart` prints a briefing; `beforeShellExecution` blocks destructive commands (force-push, `rm -rf`, `supabase db reset`, etc. — single source of truth, not mirrored in Cursor Settings); `beforeSubmitPrompt` secret-scans outgoing prompts; `afterFileEdit` runs Prettier; `stop` reminds about DOC-SYNC on staged migrations / env changes / new i18n keys.
- [`.cursor/bugbot.yaml`](./.cursor/bugbot.yaml) — automated review scoped to payments, scheduling, migrations, middleware, and (future) notifications + conversations.
- [`.cursor/mcp.json`](./.cursor/mcp.json) — three MCP servers: Supabase (read-only, dev project, anon key only — never service-role), GitHub, Playwright. Credentials via env vars, never literal.

**Mode discipline:**

- **Plan mode** is the default. Use it for anything touching a migration, schema shape, multi-file refactor, or an ambiguous ask.
- **Agent mode** is for implementation after a plan is confirmed.
- **Debug mode** fires when investigation is needed.
- **Subagents:** `explore` for read-only research, `shell` for git operations.

**One feature = one chat.** When a chat reaches ~40 turns or the model starts forgetting an invariant it clearly read earlier, stop, fill out [`docs/SESSION-HANDOFF.md`](./docs/SESSION-HANDOFF.md), open a fresh chat, paste the handoff as the first message. Do not let compaction decide what gets forgotten.

**Session-end checklist:** `npm run typecheck && npm run lint && npm run test && npm run build` all green, `docs/DOC-SYNC.md` walked, PR body ticked.

## Hosted services you'll hit

- **Supabase** — project `avnsuyiyhcnihsnisgig`. Migrations in `supabase/migrations/` are the source of truth; `00001_*` through `00025_*` are applied.
- **Vercel** — project `spa-me2` under team `roman-8776's projects` (Pro plan). Production alias `spa-me2.vercel.app`. Auto-deploys on push to `main`; PRs get preview URLs.
- **CardCom** — payment provider. `PAYMENTS_CARDCOM_PROVIDER=mock` by default; flip to `real` only with valid terminal credentials.
- **DTS + VPay** — voucher providers. Both default to `mock`. VPay client will live in `services/vpay-proxy/` deployed to Fly.io (mTLS + static IP) — single repo, separate deploy target.
- **Twilio** — SMS for booking confirmations (Phase 4). Stays in production as fallback when WhatsApp is unavailable; also one of four therapist assignment-notification channels once Phase 7c ships.
- **Meta WhatsApp Business Cloud API** — inbound + outbound conversational channel (Phase 8, not yet wired; build against mock adapter first). Also carries therapist assignment notifications and manager push alerts once Phase 7c ships.
- **Email provider** (TBD — Resend / Postmark / SES / SendGrid candidate, Phase 7c) — fourth therapist notification channel + manager push alerts on new auto-assignments. Provider choice + env vars land with Phase 7c; no email is sent today.
- **LLM provider** (Anthropic Claude candidate, Phase 8) — drafts conversational replies into the approval queue.

## Minimum env to boot

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ORDER_TOKEN_SECRET
```

Production also needs `CRON_SECRET` + `NEXT_PUBLIC_APP_URL` (covers reset-password redirects). Full reference lives in `.env.local.example`.

## Git flow

- `main`-only. Every feature is a short-lived branch squash-merged via PR, auto-deleted on merge.
- Feature branches are descriptive: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`, `docs/<topic>`. No phase prefix required.
- Never push directly to `main`. CI (`.github/workflows/ci.yml`) runs `tsc --noEmit`, `lint`, `test`, `build` on every push and PR.

## Docs-sync rule (the rail)

**Before every commit** that introduces a new migration, env var, route, feature, SPA-* item, DEF-* fix, UI primitive, dependency, role change, or user-facing string, walk [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) and update every doc listed for that change in the **same commit**. Tick the `## Docs sync` checklist in the PR template when you open the PR. This is not optional — it's what keeps the plan and the README honest across sessions.

## What's next on the roadmap

See [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) for the full phase list. Current frontier:

- **Phase 6 — Receptionist role + portal** — SHIPPED (migrations 00022-00024, `/reception/*` portal, booking provenance)
- **Phase 7a — i18n foundation** — SHIPPED (next-intl cookie-only mode, migration 00025 `language_code` enum + columns, catalogs in `src/i18n/messages/`, locale switcher, language-detect helper for Phase 8)
- **Phase 7b — Staff + customer literal swaps** — SHIPPED across 7 PRs (#24 customer flow, #25 reception, #26 therapist, #28–#31 admin portal in 4 sub-PRs). **EN + HE only** per operator decision at the time; Phase 7d upgrades customer + therapist surfaces to first-class RU.
- **PR #27 — middleware redirect-loop + cookie propagation fix** — SHIPPED (effective-role check + `redirectWithCookies` helper closes `/login ↔ portal` loop for users with broken `profiles.therapist_id`/`receptionist_id` links, and propagates Supabase session cookies through every redirect)
- **Phase 7c — Auto-assignment engine + publish rail + multi-channel therapist notifications + manager push alerts** — NEXT. Migration `00026_auto_assignment.sql` (assignment_status rewrite `unassigned` / `auto_suggested` / `auto_assigned` / `published` / `therapist_confirmed`, exclusion constraints re-gated on assignment_status for both therapist AND room, `spa_settings.auto_assign_enabled` default ON, `profiles.alert_preferences` JSON, `therapist_notifications` + `manager_alerts` tables). Code: `src/lib/scheduling/assignment/` engine, `src/lib/notifications/` per-channel adapters + publish orchestrator + manager-alert sender, admin publish UI, per-manager mute preference. Email provider chosen here.
- **Phase 7d — Customer + therapist full RU + ESLint no-literal-strings rule** — RU translation of every `customer.*` + `therapist.*` key; install `eslint-plugin-no-literal-string` (or equivalent) scoped to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`. Admin + reception remain exempt.
- **Phase 8 — Conversational platform** — WhatsApp + web chat + AI agent + Texter-style receptionist inbox + AI writing-assist + no-show scoring, all in this repo. Migration `00027_conversations_extensions.sql`.
- **Phase 9 — Customer profile + Reports** — customer gender + booking history + fixed reports + CSV. Migration `00028_customer_gender.sql`.

## Something off?

If a guidance doc contradicts the repo (e.g. README says 12 migrations, actual count is 21), **update the doc in your PR** rather than matching the code to the stale doc. Then tick the `## Docs sync` block so reviewers can see the drift was caught.
