# AGENTS.md

30-second entrypoint for any AI agent (Claude, Cursor, Codex, v0, Augment, Copilot, etc.) working on this repo.

## What this is

**SpaMe** is a single-venue spa management platform built for a boutique spa in Tel Aviv, replacing Biz-Online. Single repo, single product — the earlier "SpaMeV3" split for the conversational layer is dropped; WhatsApp + AI + receptionist Texter inbox all live here.

Next.js 16 (App Router) on Vercel, Supabase Postgres + Auth, Tailwind v4, TypeScript. In production at **https://spa-me2.vercel.app**. Current scale: ~20 therapists, a few receptionists, hundreds of customers. Hebrew default, English validated surface-by-surface; Russian is AI-drafted with EN deep-merge fallback. Locale is a `NEXT_LOCALE` cookie — no `[locale]` URL segment.

## Roles (Phase 6+)

- **Super Admin** — full CRUD + audit log + reports + full inbox visibility.
- **Receptionist** (Phase 6) — primary surface `/reception/inbox`; creates bookings (may pick a therapist); submits own on-duty (chat + phone) windows. Cannot manage therapists / services / rooms / settings / audit log; does not receive therapist assignment receipts.
- **Therapist** — own availability + time-off; read-only bookings; confirms deferred-assignment receipts (2h SLA).
- **Customer** — phone-identified (E.164), no login, no accounts.

## Hard invariants (never relaxed)

- AI never writes to the DB directly — only calls Zod-validated server actions.
- AI never assigns a therapist in V1 — humans only.
- Every AI-drafted outbound reply is receptionist-approved in V1. No auto-send.
- Payment webhook is the source of truth for payment success.
- Therapist identity is anonymous on every customer surface.

## Before you do anything

1. Read [`CLAUDE.md`](./CLAUDE.md) — engineering rules, non-negotiable architecture constraints, business rules, allowed-action list for the AI.
2. Read [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) — single source of truth for phase status. Do not rederive it; update it when phases ship.
3. Read [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) — the mandatory pre-commit manifest. Walk it before every commit.
4. `git log --oneline -10` on `main` + `gh pr list --state merged --limit 5` — confirms what just shipped so you don't duplicate work.

## Hosted services you'll hit

- **Supabase** — project `avnsuyiyhcnihsnisgig`. Migrations in `supabase/migrations/` are the source of truth; `00001_*` through `00025_*` are applied.
- **Vercel** — project `spa-me2` under team `roman-8776's projects` (Pro plan). Production alias `spa-me2.vercel.app`. Auto-deploys on push to `main`; PRs get preview URLs.
- **CardCom** — payment provider. `PAYMENTS_CARDCOM_PROVIDER=mock` by default; flip to `real` only with valid terminal credentials.
- **DTS + VPay** — voucher providers. Both default to `mock`. VPay client will live in `services/vpay-proxy/` deployed to Fly.io (mTLS + static IP) — single repo, separate deploy target.
- **Twilio** — SMS for booking confirmations (Phase 4). Stays in production as fallback when WhatsApp is unavailable.
- **Meta WhatsApp Business Cloud API** — inbound + outbound conversational channel (Phase 8, not yet wired; build against mock adapter first).
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
- **Phase 7b — Staff + customer literal swaps** — SHIPPED across 7 PRs (#24 customer flow, #25 reception, #26 therapist, #28–#31 admin portal in 4 sub-PRs). **EN + HE only** per operator decision; RU remains at framework level (AI-drafted, deep-merge fallback to EN at render). Server-action error envelope + SMS/email templating + ESLint no-literal-strings rule all deferred.
- **PR #27 — middleware redirect-loop + cookie propagation fix** — SHIPPED (effective-role check + `redirectWithCookies` helper closes `/login ↔ portal` loop for users with broken `profiles.therapist_id`/`receptionist_id` links, and propagates Supabase session cookies through every redirect)
- **Phase 8 — Conversational platform** — NEXT (WhatsApp + web chat + AI agent + Texter-style receptionist inbox + AI writing-assist + no-show scoring), all in this repo; migration `00026_conversations_extensions.sql`
- **Phase 9 — Customer profile + Reports** — customer gender + booking history + fixed reports + CSV; migration `00027_customer_gender.sql`

## Something off?

If a guidance doc contradicts the repo (e.g. README says 12 migrations, actual count is 21), **update the doc in your PR** rather than matching the code to the stale doc. Then tick the `## Docs sync` block so reviewers can see the drift was caught.
