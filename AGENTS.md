# AGENTS.md

30-second entrypoint for any AI agent (Claude, Cursor, Codex, v0, Augment, Copilot, etc.) working on this repo.

## What this is

**SpaMe2** is a single-venue spa management web app built for a boutique spa in Tel Aviv. Next.js 16 (App Router) on Vercel, Supabase Postgres + Auth, Tailwind v4, TypeScript. In production at **https://spa-me2.vercel.app**. Current scale: ~20 therapists, several receptionists, hundreds of customers. Admin UI is English; the customer-facing `/book` and `/order/<token>` flows are Hebrew (RTL).

## Before you do anything

1. Read [`CLAUDE.md`](./CLAUDE.md) — engineering rules, non-negotiable architecture constraints, business rules, allowed-action list for the (deferred) chatbot.
2. Read [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) — single source of truth for phase status. Do not rederive it; update it when phases ship.
3. Read [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) — the mandatory pre-commit manifest. Walk it before every commit.
4. `git log --oneline -10` on `main` + `gh pr list --state merged --limit 5` — confirms what just shipped so you don't duplicate work.

## Hosted services you'll hit

- **Supabase** — project `avnsuyiyhcnihsnisgig`. Migrations in `supabase/migrations/` are the source of truth; `00001_*` through `00019_*` are applied.
- **Vercel** — project `spa-me2` under team `roman-8776's projects` (Pro plan). Production alias `spa-me2.vercel.app`. Auto-deploys on push to `main`; PRs get preview URLs.
- **CardCom** — payment provider. `PAYMENTS_CARDCOM_PROVIDER=mock` by default; flip to `real` only with valid terminal credentials.
- **DTS + VPay** — voucher providers. Both default to `mock`.
- **Twilio** — SMS for booking confirmations (Phase 4). Stays in production. Conversational / chatbot layer is reshaped for **SpaMeV3** (see below) and not implemented in this repo.

## Minimum env to boot

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ORDER_TOKEN_SECRET
```

Production also needs `CRON_SECRET`. Full reference lives in `.env.local.example`.

## Git flow

- `main`-only. Every feature is a short-lived branch squash-merged via PR, auto-deleted on merge.
- Feature branches are descriptive: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`. No phase prefix required.
- Never push directly to `main`. CI (`.github/workflows/ci.yml`) runs `tsc --noEmit`, `lint`, `test`, `build` on every push and PR.

## Docs-sync rule (the rail)

**Before every commit** that introduces a new migration, env var, route, feature, SPA-* item, DEF-* fix, UI primitive, or dependency, walk [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) and update every doc listed for that change in the **same commit**. Tick the `## Docs sync` checklist in the PR template when you open the PR. This is not optional — it's what keeps the plan and the README honest across sessions. It is the single rule agents skipped that produced the 20-finding doc drift we just cleaned up.

## What's deferred to SpaMeV3

The WhatsApp conversational layer and staff inbox (originally Phase 6 + Phase 7 in MASTER-PLAN) are reshaped for **SpaMeV3**. SpaMeV3 will ship a first-party Texter-alike WhatsApp Business platform (see https://texterchat.com as the market reference) — multi-agent inbox, rule-based + AI bot, CRM integrations, Meta ISV-verified sender. **Do not implement any of that in this repo.** The existing Twilio SMS confirmations from Phase 4 stay in production as-is.

## Something off?

If a guidance doc contradicts the repo (e.g. README says 12 migrations, actual count is 20), **update the doc in your PR** rather than matching the code to the stale doc. Then tick the `## Docs sync` block so reviewers can see the drift was caught.
