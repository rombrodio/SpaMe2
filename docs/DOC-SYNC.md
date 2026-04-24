# Docs sync manifest

The single rule that keeps our guidance docs honest across sessions. This exists because we shipped 20 doc-drift findings in one audit — and every one of them came from a commit that changed code but didn't touch the doc that described it.

## How to use this

**Before you run `git commit`**, walk the table below top to bottom. For each row, ask yourself: *"Does this commit touch the thing in the left column?"* If yes, edit every file in the right column in the **same commit** — not a follow-up PR, the same commit.

Paste a one-line **Docs-sync:** summary in the commit body footer (e.g. `Docs-sync: README migration list, MASTER-PLAN migrations, .env.local.example`). When you open the PR, tick the corresponding row in the template's `## Docs sync` section.

If none of the rows apply, tick `N/A — no docs affected` in the PR template. Being explicit about N/A is the whole point — a reviewer should never have to guess whether the author forgot.

## The manifest

| If you add / change…                                            | Update…                                                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new migration in `supabase/migrations/`                       | [`README.md`](../README.md) migration list + count, [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) migration file list, short mention in the PR description                   |
| A new or removed env var                                        | [`.env.local.example`](../.env.local.example) with a comment explaining when it's required, [`README.md`](../README.md) env section, [`AGENTS.md`](../AGENTS.md) minimum-env list if load-bearing  |
| A new route under `src/app/admin/` or a new surface             | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) folder-structure section, [`AGENTS.md`](../AGENTS.md) hosted-services if it calls something external                          |
| A phase or sub-phase completed or deferred                      | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) phase status marker, [`CLAUDE.md`](../CLAUDE.md) only if the phase is referenced there                                         |
| A new SPA-* or DEF-* item shipped                               | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) shipped-list (under the relevant phase), PR description body                                                                   |
| A new UI primitive added to `src/components/ui/`                | [`README.md`](../README.md) tech-stack line (the "hand-rolled UI primitives" bullet), brief note in PR description                                                                   |
| A dependency added, removed, or bumped in `package.json`        | commit body (list the package + version change), [`README.md`](../README.md) tech-stack line if it's load-bearing (e.g. Next major, Tailwind major, swap of primary auth/DB library) |
| A new cron, webhook, secret, or hosted integration              | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) risks/verification section, [`AGENTS.md`](../AGENTS.md) hosted-services list                                                   |
| A breaking change to a server action or schema shape            | [`CLAUDE.md`](../CLAUDE.md) if the action is in "AI allowed actions", [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) architecture or schema section                          |
| A role / RBAC change (new role, new permission, role deprecation) | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) Auth & Roles section + "Still Assuming" list, [`CLAUDE.md`](../CLAUDE.md) if role-specific                                   |
| A production deploy URL, environment, or host changes           | [`AGENTS.md`](../AGENTS.md) hosted-services, [`README.md`](../README.md) deploy notes                                                                                                |
| Something previously "Still Assuming" becomes confirmed         | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) — move the bullet from "Still Assuming" up into "Confirmed Decisions"                                                          |

## What this manifest does NOT cover

- Refactors that don't change public shape (internal module moves, lint fixes, comment tweaks) — no doc update required.
- Test-only additions — no doc update required unless the added test surfaces a new guarantee worth documenting.
- `.agents/skills/` — those are upstream skill bundles, not ours. Never edit them.

## When this file itself is wrong

If the manifest misses a drift case you just hit, update this file in the same PR that caught the gap. Add the row, re-commit. One line here saves hours of stale-doc archaeology later.
