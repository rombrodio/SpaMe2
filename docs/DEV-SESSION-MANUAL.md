# Dev-session manual

How to run a SpaMe dev session under the Cursor-native SDLC rail that shipped in PR #35 (`.cursor/rules/*.mdc`, `.cursor/hooks/*`, `.cursor/bugbot.yaml`, `.cursor/mcp.json`) alongside the pre-existing `docs/DOC-SYNC.md` and `docs/SESSION-HANDOFF.md` rails.

This file is operator-facing. It documents **what to click, what to run, what happens, and what to do when a hook fires.** It does not duplicate the engineering rules — those live in [`CLAUDE.md`](../CLAUDE.md) — and it does not duplicate phase status — that lives in [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md).

---

## TL;DR — the loop

1. Open Cursor. The `sessionStart` hook prints a briefing (branch, last 5 commits, current phase frontier). Plan mode is the default Agent mode.
2. Stay in **Plan mode** until you have a confirmed plan. Switch to **Agent mode** for implementation only.
3. Implement. `afterFileEdit` runs Prettier on every saved TS / TSX / JSON / MD / MDC.
4. Before commit: `npm run typecheck && npm run lint && npm run test && npm run build` — all green.
5. Walk [`docs/DOC-SYNC.md`](./DOC-SYNC.md) top to bottom, update every matching doc **in the same commit**, paste a `Docs-sync:` footer in the commit body.
6. `git push`, open a PR. Tick the `## Docs sync` section of the PR template.
7. If the chat gets long (~40 tool calls or the model forgets an invariant): fill [`docs/SESSION-HANDOFF.md`](./SESSION-HANDOFF.md), open a fresh chat, paste the handoff as the first message.

**One feature = one chat. One chat = one PR.**

---

## One-time setup

### Cursor client settings (per-laptop, not checked in)

- **Settings → Models → Default:** `claude-opus-4.7` for Plan / Agent / Debug / Ask. This repo is authored against Opus 4.7; every rule and hook is tuned against its behaviour.
- **Settings → Agents → Default Mode:** Plan. Forces a think-first moment. You switch to Agent only after confirming the plan.
- **Settings → Auto-Run → Sandbox:** ON (macOS).
- **Settings → Auto-Run → Denylist:** **leave empty.** Dangerous-command blocking is owned entirely by the project hook `.cursor/hooks/guard-shell.sh`. Mirroring patterns into Settings gives you two lists to keep in sync; don't do it.
- **Settings → Docs → Add** (so `@Docs <name>` returns current API surface rather than stale training data):
  - `https://nextjs.org/docs`
  - `https://tailwindcss.com/docs`
  - `https://next-intl.dev/docs`
  - `https://supabase.com/docs/reference/javascript/introduction`
  - `https://supabase.com/docs/guides/auth/server-side/nextjs`

### Shell environment (credentials for MCP + app)

Populate these in `~/.zshrc` (or `~/.bash_profile`) before opening Cursor. MCP servers read them at spawn time; they never live in the repo.

```bash
# App (.env.local) — minimum to boot
export NEXT_PUBLIC_SUPABASE_URL=<dev-project-url>
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # never in a prompt, never in mcp.json
export ORDER_TOKEN_SECRET=<random-32-bytes>

# MCP servers — see `.cursor/mcp.json`
export SUPABASE_DEV_PROJECT_REF=<dev-project-ref>     # dev project only, never prod
export SUPABASE_DEV_ACCESS_TOKEN=<scoped-personal-access-token>  # NOT service-role
export GITHUB_MCP_PAT=<fine-grained-pat>              # contents:write, pull_requests:write, issues:write — scoped to this repo
```

Full app reference: [`.env.local.example`](../.env.local.example).

### Host binaries the hooks rely on

The hooks fail-closed on `guard-shell.sh` if `jq` is missing (every shell command gets blocked). Other hooks fail-open. Install:

```bash
brew install jq        # macOS
sudo apt install jq    # Linux
# npx + git ship with Node / git — verify both respond: command -v npx git
```

### Statusline (optional, recommended)

One user-level file that renders `[spa-me2] main | <sha> <subject> | Opus 4.7 | Phase 7c | N modified` in every Cursor terminal. Setup steps: [CONTRIBUTING.md — Statusline install](../CONTRIBUTING.md#statusline-install). The phase heuristic parses `docs/plans/MASTER-PLAN.md` and lands on the first phase header without `COMPLETE` / `SHIPPED` / ✅ / `(follow-up)` / `(deferred)`.

### MCP server verification

Run `/mcp` in the Cursor chat. Three servers should show green:

- `supabase-dev` — read-only, dev project. **Never** `supabase-prod` — that entry does not exist and must not be added.
- `github`
- `playwright` — first run downloads a Chromium sandbox; that's normal.

If any are red, check the matching env var from the "Shell environment" block above.

---

## The daily rhythm

### 1. Session start

Open a chat. The `sessionStart` hook ([`.cursor/hooks/session-start.sh`](../.cursor/hooks/session-start.sh)) prints:

- current branch + uncommitted-file count
- last 5 commits
- reminder to read `docs/plans/MASTER-PLAN.md` for the phase frontier
- reminder that Plan mode is the default
- reminder to fill `docs/SESSION-HANDOFF.md` at ~40 tool calls

If `git` or `jq` is unavailable the hook prints a minimal fallback message and exits; it never blocks the session.

### 2. Plan mode (default)

Use Plan mode for anything that touches:

- a migration or schema shape
- a multi-file refactor
- an ambiguous ask
- payment adapters or webhooks
- middleware / auth / role matrix
- the auto-assignment engine or publish rail

Plan mode produces a `CreatePlan` artifact under `.cursor/plans/<name>_<id>.plan.md`. Confirm the plan before switching.

### 3. Agent mode

Switch to Agent only after a plan is confirmed. If scope grows mid-implementation, go back to Plan.

While Agent mode writes:

- **`afterFileEdit`** runs Prettier on every saved `.ts` / `.tsx` / `.js` / `.jsx` / `.json` / `.md` / `.mdc` / `.mjs` / `.cjs`. Silent unless Prettier is missing (`npx --no-install prettier` — no install-on-demand).
- **Glob-scoped rules** auto-attach when Cursor reads a file matching their `globs:` frontmatter. E.g. editing anything under `src/lib/payments/**` auto-attaches [`30-payments.mdc`](../.cursor/rules/30-payments.mdc); editing a migration auto-attaches [`50-supabase-migrations.mdc`](../.cursor/rules/50-supabase-migrations.mdc).
- **Always-apply rules** ([`00-project-invariants.mdc`](../.cursor/rules/00-project-invariants.mdc), [`90-mcp-safety.mdc`](../.cursor/rules/90-mcp-safety.mdc)) load on every turn.

### 4. Local gate

Before commit, run the full gate:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

CI runs the same four commands in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml); skipping the local gate just moves the failure to CI.

### 5. Walk `docs/DOC-SYNC.md`

Open [`docs/DOC-SYNC.md`](./DOC-SYNC.md). For each row, ask "does this commit touch the thing in the left column?" If yes, update every file in the right column **in the same commit**. Paste a `Docs-sync:` footer in the commit body, e.g.:

```
Docs-sync: README migration list, MASTER-PLAN migrations, .env.local.example
```

If nothing applies, tick `N/A — no docs affected` explicitly in the PR body. Silent N/A forces a reviewer to guess.

The `stop` hook ([`docs-sync-reminder.sh`](../.cursor/hooks/docs-sync-reminder.sh)) surfaces a reminder when your staged / modified / untracked files look like they need a doc update (new migration, new env var, new key in `en.json`, new route under `src/app/`, change to `.cursor/mcp.json` or `.cursor/rules|hooks|bugbot`). It never blocks — it just nudges.

### 6. Commit + push

Conventional commits. No force-push, no amend on someone else's branch (`guard-shell.sh` blocks the destructive patterns — see below).

### 7. Open a PR

Use the PR template at [`.github/pull_request_template.md`](../.github/pull_request_template.md). Tick:

- the matching `## Docs sync` rows (or `N/A`)
- the four `## Testing` rows

PRs are draft by default. Bugbot ([`.cursor/bugbot.yaml`](../.cursor/bugbot.yaml)) auto-reviews the scoped high-risk paths: `src/lib/scheduling/**`, `src/lib/payments/**`, `src/app/api/webhooks/**`, `src/app/api/cron/**`, `supabase/migrations/**`, `src/middleware.ts`, `src/lib/roles.ts`, `src/lib/auth/**`, `src/lib/audit.ts`, and (once they exist) `src/lib/notifications/**`, `src/lib/scheduling/assignment/**`, `src/lib/conversations/**`. Everything else — UI primitives, i18n content, docs, tests, scripts, public, `.cursor/**` — is explicitly excluded.

---

## What each hook does (and what to do when it fires)

Source of truth: [`.cursor/hooks.json`](../.cursor/hooks.json) + the scripts under [`.cursor/hooks/`](../.cursor/hooks).

| Event | Script | Fail mode | What it does | What you do when it fires |
|---|---|---|---|---|
| `sessionStart` | `session-start.sh` | fail-open | Prints branch + last 5 commits + phase-frontier reminder | Read it. Acknowledge the frontier. Don't fight the default. |
| `beforeShellExecution` | `guard-shell.sh` | **fail-closed** | DENY destructive patterns; ASK on prod-adjacent patterns | If DENY: do not retry the command in Cursor. Run it in a separate terminal outside Cursor if you're sure. If ASK: review the command, approve only if you understand what it touches. |
| `beforeSubmitPrompt` | `scan-prompt.sh` | fail-open | ASK if the outgoing prompt contains secret-shaped strings (`SUPABASE_SERVICE_ROLE_KEY=...`, `sk-…`, `ghp_…`, JWTs, etc.) | If flagged: redact before sending. If it's a deliberate test fixture (e.g. a known-bad shape), approve explicitly. |
| `afterFileEdit` | `format-edit.sh` | fail-open | `npx --no-install prettier --write` on TS / TSX / JSON / MD / MDC | Silent when Prettier runs. If formatting is off, check that Prettier is resolvable via `npx --no-install`. |
| `stop` | `docs-sync-reminder.sh` | fail-open | Nudge about `docs/DOC-SYNC.md` rows based on staged / modified / untracked files | Walk the manifest and update the listed docs in the same commit. |

### `guard-shell.sh` — what it blocks

**DENY (unconditional block):**

- `git push -f` / `git push --force` / `git push … -f`
- `git reset --hard origin/...`
- `rm -rf /` and `rm -rf ~`
- `supabase db push ... --linked`
- `npm publish`
- `DROP TABLE|SCHEMA|DATABASE`

**ASK (needs human approval):**

- `supabase db reset` (destructive in local Supabase)
- `vercel --prod`
- `gh pr merge ... --admin`
- Any `.env` / `.env.local` / `.env.production` / `.env.development` path (but **not** `.env.local.example` / `.env.example` — those are public)
- `git push ... main ...` (direct push to main)

This list is the single source of truth. **Do not mirror it into Cursor Settings → Auto-Run → Denylist** — two lists drift.

---

## Cursor rules — what auto-attaches where

Source of truth: [`.cursor/rules/`](../.cursor/rules).

| Rule | Scope | When it loads |
|---|---|---|
| [`00-project-invariants.mdc`](../.cursor/rules/00-project-invariants.mdc) | always | Every turn. The 9 hard invariants + Opus-4.7 default. |
| [`10-server-actions.mdc`](../.cursor/rules/10-server-actions.mdc) | `src/lib/actions/**`, `src/app/**/route.ts` | Editing a server action or API route. |
| [`20-scheduling-assignment.mdc`](../.cursor/rules/20-scheduling-assignment.mdc) | `src/lib/scheduling/**` | Editing the scheduler or the Phase-7c assignment engine. |
| [`30-payments.mdc`](../.cursor/rules/30-payments.mdc) | `src/lib/payments/**` | Editing CardCom / DTS / VPay adapters or the engine. |
| [`40-i18n-customer-therapist.mdc`](../.cursor/rules/40-i18n-customer-therapist.mdc) | `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**` | Editing a customer-facing or therapist-portal surface. RU is first-class on these; Phase 7d's ESLint rule fails the build on inline literals. |
| [`41-i18n-admin-reception.mdc`](../.cursor/rules/41-i18n-admin-reception.mdc) | `src/app/admin/**`, `src/app/reception/**`, `src/components/admin/**`, `src/components/reception/**` | Editing admin / reception surfaces. RU stays optional (deep-merge fallback). |
| [`50-supabase-migrations.mdc`](../.cursor/rules/50-supabase-migrations.mdc) | `supabase/migrations/**` | Authoring a migration. |
| [`60-tests.mdc`](../.cursor/rules/60-tests.mdc) | `**/*.test.ts`, `**/*.test.tsx` | Authoring a Vitest test. |
| [`70-docs-sync.mdc`](../.cursor/rules/70-docs-sync.mdc) | `docs/**`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.env.local.example`, `supabase/migrations/**`, `src/i18n/messages/**` | Editing anything governed by the DOC-SYNC manifest. |
| [`80-middleware-auth.mdc`](../.cursor/rules/80-middleware-auth.mdc) | `src/middleware.ts`, `src/lib/roles.ts`, `src/lib/auth/**` | Editing the auth perimeter. Effective-role check + `redirectWithCookies` helper (PR #27). |
| [`90-mcp-safety.mdc`](../.cursor/rules/90-mcp-safety.mdc) | always | Every turn. Hard rules on `.cursor/mcp.json`. |

Rules are kept under 50 lines on purpose. Only `00-` and `90-` are `alwaysApply: true`; adding a third always-apply rule needs a justification in the PR description.

---

## MCP servers — what's wired and what's allowed

Source of truth: [`.cursor/mcp.json`](../.cursor/mcp.json). Safety rules: [`90-mcp-safety.mdc`](../.cursor/rules/90-mcp-safety.mdc).

| Server | Mode | Purpose | Hard rules |
|---|---|---|---|
| `supabase-dev` | **read-only** | Query the dev Supabase project (introspection, migration listing, advisor checks) | `--read-only` is mandatory; project ref comes from `${SUPABASE_DEV_PROJECT_REF}` (never a literal); access token is a scoped operator PAT, **never** `SUPABASE_SERVICE_ROLE_KEY`; no `supabase-prod` entry exists and none may be added. |
| `github` | read + write | Manage PRs, issues, comments on this repo | Fine-grained PAT only, scoped to this repo, min perms `contents:write` + `pull_requests:write` + `issues:write`. Never commit the token. |
| `playwright` | sandboxed Chromium | Drive `/book` + `/order/[token]` in RTL to validate flows manually | Primary use case is our own app. Not for scraping third-party sites. |

### Reviewer signals that block a PR (from `90-mcp-safety.mdc`)

Any of these in a diff against `.cursor/mcp.json` is a must-fix:

- Literal value for `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, or `GITHUB_PERSONAL_ACCESS_TOKEN`
- Removal of `--read-only` from the supabase args
- A new `mcpServers` entry with `supabase` in the name that isn't `supabase-dev`
- A literal Supabase project ref hard-coded anywhere in the file

---

## Cloud Agents

**Exactly one** Cloud Agent is configured. Set up at **cursor.com/agents**:

- **Name:** `i18n-translation-drafter`
- **Trigger:** a commit on any branch other than `main` adds a new key to `src/i18n/messages/en.json`.
- **Task:** draft matching entries in `he.json` and `ru.json` under the same key path, push to `chore/i18n-draft/<sha>`, open a PR against the triggering branch titled `chore(i18n): draft HE + RU for <key-path>`. Does **not** auto-merge.
- **Scope restriction:** `src/i18n/messages/**` only.
- **Model:** Opus 4.7.

Every draft PR needs human review before merge. For customer-facing (`/book`, `/order`) or therapist-portal keys, RU is first-class — hand-edit the draft if the machine translation isn't right (the ESLint rule from Phase 7d makes a missing RU key there a release blocker).

Adding a second Cloud Agent is a plan change, not a config tweak. There is explicitly no "keep main green" bot, no Dependabot auto-merger, no autonomous refactor agent.

---

## Session handoff — when and how

**One feature = one chat.** Trigger the handoff when:

- the chat reaches ~40 tool calls, OR
- context compaction kicks in (Cursor tells you), OR
- you notice the model forgetting an invariant it clearly read earlier.

Steps:

1. Open [`docs/SESSION-HANDOFF.md`](./SESSION-HANDOFF.md). It's a **template**, not a journal — overwrite, don't append history.
2. Fill: branch, what shipped, what's next, open decisions, gotchas, current plan file, verification checklist.
3. **Do not paste secrets.** No `sbp_…` / `ghp_…` / `sk-…` / JWTs. No full terminal transcripts. No per-machine paths (use `~/` / `<home>`).
4. Save. Open a fresh chat. Paste the handoff file as the first message.

The fresh chat starts in Plan mode with the `sessionStart` briefing + the handoff — so the model immediately knows branch, frontier, and open questions.

---

## Troubleshooting

### `guard-shell.sh cannot run: jq not installed`

Install jq (`brew install jq` / `sudo apt install jq`). Without jq the hook fails closed and every shell command gets blocked. This is intentional — the alternative (fail-open) lets destructive commands through silently.

### Every shell command is blocked after a valid-looking command

Check `jq -r '.command'` parses correctly on the exact command string. `guard-shell.sh` always assembles JSON via `jq`, so regex patterns with backslashes or brackets cannot corrupt the response. If a block is unexpected, `grep -E` the command against the `deny_patterns` + `ask_patterns` in the script to find which rule matched.

### `ERR_TOO_MANY_REDIRECTS` on `/login`

Two independent bugs stacked, both closed in PR #27 ([`80-middleware-auth.mdc`](../.cursor/rules/80-middleware-auth.mdc)):

1. Broken profile link (`profiles.role='therapist'` with `therapist_id = NULL`) — middleware now computes an **effective role** via `src/lib/roles.ts` and keeps broken-link users on `/login` with a `?error=` banner.
2. Cookie strip on redirect — `NextResponse.redirect(url)` drops `Set-Cookie`. Every redirect site goes through `redirectWithCookies(url)` now. Don't add a new redirect without routing it through the helper — grep for `redirectWithCookies` before you add one.

### CI fails on a customer-facing surface for an inlined literal

Phase 7d's `eslint-plugin-no-literal-string` rule is scoped to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`. Move the string to `en.json` + `he.json` + **`ru.json`** in the same commit (all three — RU is a release blocker on these surfaces). See [`40-i18n-customer-therapist.mdc`](../.cursor/rules/40-i18n-customer-therapist.mdc).

### New migration fails on `supabase db reset`

`supabase db reset` is on the `guard-shell.sh` ASK list — approve each time. If your migration fails reset it will fail CI too. Common causes: enum `ADD VALUE` used in the same transaction as the value; missing RLS on a new table; `pending_payment` rows left holding capacity after an exclusion-constraint rewrite. See [`50-supabase-migrations.mdc`](../.cursor/rules/50-supabase-migrations.mdc).

### `scan-prompt.sh` flagged a value I need to send

If it's a deliberate test fixture (a known-bad shape, not a real secret), approve the send. If it's a real secret, redact and rotate — git history is permanent, and once a secret is committed it's exposed even after rotation.

### Bugbot didn't review my PR

Bugbot scope is narrow on purpose ([`.cursor/bugbot.yaml`](../.cursor/bugbot.yaml)). UI primitives, i18n content, docs, tests, scripts, `public/**`, and `.cursor/**` are excluded. If you want a review on an excluded path, request a human reviewer — widening Bugbot scope is a config change, not a per-PR thing.

### The `stop` hook nagged about docs I already updated

The reminder matches on staged + modified + untracked paths, not on diff contents. If you already updated `README.md` + `MASTER-PLAN.md` for a new migration, the reminder still fires — acknowledge it and move on. The reminder is advisory; it never blocks.

---

## Quick reference card

**Canonical docs (in authority order):**

1. [`docs/vision/SpaMe-vision.md`](./vision/SpaMe-vision.md) — product vision (tie-breaker)
2. [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) — phase status
3. [`CLAUDE.md`](../CLAUDE.md) — engineering rules + business rules + AI allowed actions
4. [`AGENTS.md`](../AGENTS.md) — 30-second entrypoint
5. [`README.md`](../README.md) — human README

**Mode discipline:**

- Plan = default. Use for migrations, schema changes, multi-file refactors, ambiguous asks.
- Agent = implement a confirmed plan.
- Debug = investigate a failure.
- Ask = read-only explore.

**Before every commit:**

```
npm run typecheck && npm run lint && npm run test && npm run build
```

Walk `docs/DOC-SYNC.md`. Paste a `Docs-sync:` footer.

**When the chat gets long:**

Fill `docs/SESSION-HANDOFF.md` → open fresh chat → paste handoff.

**Never commit:**

- `SUPABASE_SERVICE_ROLE_KEY` (or a string that matches the shape)
- Literal tokens in `.cursor/mcp.json`
- A literal Supabase project ref in `.cursor/mcp.json`
- `--read-only` removed from the supabase MCP args
- A `supabase-prod` MCP entry
