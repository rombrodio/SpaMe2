# Contributing

## Branch strategy
- `main` is always stable and deployable
- Never push directly to `main`
- Use short-lived branches only

### Branch naming
- `feat/<name>` for features
- `fix/<name>` for bug fixes
- `chore/<name>` for tooling, cleanup, config
- `refactor/<name>` for internal code changes without behavior changes

Examples:
- `feat/foundations`
- `feat/admin-crud`
- `feat/scheduling-core`
- `feat/payments`
- `feat/customer-booking`
- `feat/chatbot-foundation`
- `fix/payment-webhook-idempotency`

## Pull request rules
- Open a draft PR early
- One PR = one focused unit of work
- Do not mix unrelated systems in one PR
- Prefer small and reviewable PRs
- Merge with **Squash and merge**
- Delete branch after merge

## Commit style
Use short, clear, imperative commit messages.

Examples:
- `add booking schema and migrations`
- `implement therapist availability service`
- `add payment webhook handler`
- `build customer booking flow`
- `fix room overlap validation`

Avoid:
- `stuff`
- `wip`
- `fix`
- `changes`

## Branch naming in practice

Feature branches use descriptive kebab names:

- `feat/<short-kebab-topic>` — e.g. `feat/operator-reality-check`, `feat/vercel-analytics`
- `fix/<short-kebab-topic>` — e.g. `fix/payment-webhook-idempotency`
- `chore/<short-kebab-topic>` — e.g. `chore/remove-therapist-avatars`

Large multi-PR efforts may use a shared prefix (e.g. `feat/phase-4-qa-*`),
but this is optional. **Phase and SPA-* / DEF-* references live in the PR
description, not the branch name** — phase tags on branches were found to
drift as work got reshaped.

## Definition of done for a branch

Before merging:

- CI gate passes (`tsc --noEmit`, `lint`, `test`, `build` — see
  `.github/workflows/ci.yml`)
- schema/migrations are valid
- key flow for that branch works end-to-end (manual smoke or automated test)
- `docs/DOC-SYNC.md` manifest walked — every doc listed for the changes is
  updated in the same PR
- PR description is complete and the `## Docs sync` checklist is filled in

## Rules for Claude Code
- Claude works only on the current branch
- Claude should only implement the current phase
- Claude should not touch unrelated files unless necessary
- Claude should explain major architecture choices
- Claude should keep business logic in services/lib, not UI components
- Claude should not overbuild beyond V1

## High-risk areas
Be extra careful with:
- scheduling conflicts
- therapist/room overlap prevention
- payment webhook handling
- booking confirmation rules
- AI tool permissions
- WhatsApp webhook flows

## Merge checklist
- [ ] Branch is up to date
- [ ] Scope is focused
- [ ] Local testing done
- [ ] No unrelated changes included
- [ ] PR description explains what changed and why
- [ ] Ready to squash merge

---

## Cursor SDLC rail

This repo is authored against **Opus 4.7**. Daily session flow: open a
chat and paste the kickoff template from
[`docs/SESSION-START.md`](docs/SESSION-START.md). The agent drives plan
→ implement → local gate → DOC-SYNC walk → draft PR end-to-end; you
answer scoping questions, confirm the plan, and review the PR URL.

Reference material (what each hook does when it fires, `guard-shell.sh`
DENY / ASK lists, rule auto-attach scopes, MCP server matrix, eight
troubleshooting entries) lives in
[`docs/DEV-SESSION-MANUAL.md`](docs/DEV-SESSION-MANUAL.md). Consult it
only when something unusual happens mid-session.

## Recommended Cursor client settings

One-time setup. These are per-laptop (not checked into the repo):

- **Settings → Models → Default:** Opus 4.7 for Plan / Agent / Debug / Ask.
- **Settings → Agents → Default Mode:** Plan. Forces a think-first
  moment — you switch to Agent only after confirming the plan.
- **Settings → Auto-Run → Sandbox:** ON (macOS). Closes the documented
  bypass paths in Cursor's default Auto-Run allowlist.
- **Settings → Auto-Run → Denylist:** **leave empty.** Dangerous-command
  blocking is owned entirely by the project hook
  `.cursor/hooks/guard-shell.sh` — single source of truth, ships with the
  repo, applies identically for anyone who clones. Do **not** mirror the
  hook's patterns into Cursor Settings; keeping two lists in sync is
  exactly the bookkeeping we want to avoid.
- **Settings → Docs → Add** (indexes custom docs so `@Docs <name>`
  returns current API surface, not stale training data — Tailwind v4 and
  Next.js 16 are both newer than most model training cutoffs):
  - `https://nextjs.org/docs` — Next.js 16
  - `https://tailwindcss.com/docs` — Tailwind v4
  - `https://next-intl.dev/docs` — next-intl
  - `https://supabase.com/docs/reference/javascript/introduction` — supabase-js
  - `https://supabase.com/docs/guides/auth/server-side/nextjs` — @supabase/ssr

## Statusline install

Optional. One file, user-level (not checked into this repo). Shows project,
branch (+ dirty marker), most recent commit, active model, current phase
frontier (parsed from `docs/plans/MASTER-PLAN.md`), and uncommitted-file
count.

1. Create `~/.cursor/statusline.sh` with the contents from
   `.cursor/statusline-template.sh` in your home Cursor directory. The
   canonical template lives with the upstream skills — ask the repo
   maintainer for the latest version, or copy from another SpaMe2
   contributor who has it installed.
2. Make it executable: `chmod +x ~/.cursor/statusline.sh`.
3. In Cursor Settings, wire the statusline script path to
   `~/.cursor/statusline.sh`.
4. Open a new terminal in Cursor — the statusline should render:
   `[spa-me2] main | 164aa11 docs: sync to VISION_1 | Opus 4.7 | Phase 7c | 0 modified`

The phase heuristic skips headers marked COMPLETE / SHIPPED / ✅ /
(follow-up) / (deferred) / "split into", and skips sub-sub-phase headers
with three dotted segments (`Phase X.Y.Z`). Frontier = first remaining
phase header.

## Cloud Agents

One narrow agent only. Set up at **cursor.com/agents**:

- **Name:** `i18n-translation-drafter`
- **Trigger:** a commit on any branch other than `main` adds a new key
  to `src/i18n/messages/en.json`.
- **Task:** draft matching entries in `he.json` and `ru.json` under the
  same key path, push to a `chore/i18n-draft/<sha>` branch, open a PR
  against the triggering branch titled
  `chore(i18n): draft HE + RU for <key-path>`. PR body notes the draft is
  AI-generated and needs human review before merge. Does **not**
  auto-merge.
- **Scope restriction:** `src/i18n/messages/**` only. The agent has no
  permission to edit any other path.
- **Model:** Opus 4.7 (translation quality matters; cost is bounded by the
  narrow scope).

No other Cloud Agents. Adding a second is a plan change, not a config
tweak. Specifically, there is no "keep main green" bot, no Dependabot
auto-merger, no autonomous refactor agent.

## MCP server setup

`.cursor/mcp.json` ships with the repo and references three environment
variables. Populate them in your shell profile (`~/.zshrc` or
`~/.bash_profile`) before opening Cursor:

```bash
export SUPABASE_DEV_PROJECT_REF=<dev-project-ref>        # dev project only, never prod
export SUPABASE_DEV_ACCESS_TOKEN=<scoped-personal-access-token>  # NEVER SUPABASE_SERVICE_ROLE_KEY
export GITHUB_MCP_PAT=<fine-grained-pat>                  # contents:write, pull_requests:write, issues:write on this repo only
```

Playwright needs no credentials. First run of the Playwright MCP will
download a Chromium sandbox; that's normal.

Verify the MCP servers are loaded by running `/mcp` in the Cursor chat.
Three servers should show green: `supabase-dev`, `github`, `playwright`.

**Hard rules — never bypass:**

- `supabase-dev` is read-only (`--read-only` flag) and targets the dev
  project only. There is **no** `supabase-prod` server, and adding one is
  out of scope for every PR.
- Never commit a value for `SUPABASE_SERVICE_ROLE_KEY` anywhere near
  `.cursor/mcp.json`. The always-apply rule
  [`.cursor/rules/90-mcp-safety.mdc`](.cursor/rules/90-mcp-safety.mdc)
  catches it; the `scan-prompt.sh` hook catches it in prompts.
