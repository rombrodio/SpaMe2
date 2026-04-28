# Docs sync manifest

The single rule that keeps our guidance docs honest across sessions. This exists because we shipped 20 doc-drift findings in one audit — and every one of them came from a commit that changed code but didn't touch the doc that described it.

## How to use this

**Before you run `git commit`**, walk the table below top to bottom. For each row, ask yourself: *"Does this commit touch the thing in the left column?"* If yes, edit every file in the right column in the **same commit** — not a follow-up PR, the same commit.

Paste a one-line **Docs-sync:** summary in the commit body footer (e.g. `Docs-sync: README migration list, MASTER-PLAN migrations, .env.local.example`). When you open the PR, tick the corresponding row in the template's `## Docs sync` section.

If none of the rows apply, tick `N/A — no docs affected` in the PR template. Being explicit about N/A is the whole point — a reviewer should never have to guess whether the author forgot.

## The manifest

| If you add / change…                                            | Update…                                                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/vision/SpaMe-vision.md`](./vision/SpaMe-vision.md) (the canonical product vision) | Walk the "Files this vision propagates to" table at the bottom of the vision doc. At minimum: [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md), [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md), [`README.md`](../README.md). When the two Cursor rule files under `.cursor/rules/*.mdc` exist, update them too. Every item moved from "Open Questions" into "Confirmed decisions" in the vision doc must also land in MASTER-PLAN's Confirmed Decisions block in the same PR. |
| A new migration in `supabase/migrations/`                       | [`README.md`](../README.md) migration list + count, [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) migration file list, short mention in the PR description                   |
| A new or removed env var                                        | [`.env.local.example`](../.env.local.example) with a comment explaining when it's required, [`README.md`](../README.md) env section, [`AGENTS.md`](../AGENTS.md) minimum-env list if load-bearing  |
| A new **email provider env var** (e.g. `RESEND_API_KEY`, `POSTMARK_SERVER_TOKEN`, `SENDGRID_API_KEY`, `EMAIL_FROM`) added or renamed (Phase 7c) | [`.env.local.example`](../.env.local.example) with a comment explaining when it's required + which provider it's for, [`README.md`](../README.md) env section + tech-stack line, [`AGENTS.md`](../AGENTS.md) hosted-services block (record the concrete provider choice once made) |
| A new **notification channel adapter** under `src/lib/notifications/adapters/` (Phase 7c+) | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) folder-structure section + Phase 7c shipped-list, [`AGENTS.md`](../AGENTS.md) hosted-services list if the adapter calls something external, [`CLAUDE.md`](../CLAUDE.md) stack line if it's load-bearing |
| A new `assignment_status` value added or renamed, OR the `spa_settings.auto_assign_enabled` default flips, OR `profiles.alert_preferences` grows a new key | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) schema section + "Extensions & Enums" block, [`CLAUDE.md`](../CLAUDE.md) Business rules section, [`docs/vision/SpaMe-vision.md`](./vision/SpaMe-vision.md) Confirmed decisions |
| A new route under `src/app/admin/` or a new surface             | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) folder-structure section, [`AGENTS.md`](../AGENTS.md) hosted-services if it calls something external                          |
| A phase or sub-phase completed or deferred                      | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) phase status marker, [`CLAUDE.md`](../CLAUDE.md) only if the phase is referenced there                                         |
| A new SPA-* or DEF-* item shipped                               | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) shipped-list (under the relevant phase), [`docs/qa/defect-retest.md`](./qa/defect-retest.md) status row (add or flip to FIXED/REGRESSED), PR description body |
| A new UI primitive added to `src/components/ui/`                | [`README.md`](../README.md) tech-stack line (the "hand-rolled UI primitives" bullet), brief note in PR description                                                                   |
| A dependency added, removed, or bumped in `package.json`        | commit body (list the package + version change), [`README.md`](../README.md) tech-stack line if it's load-bearing (e.g. Next major, Tailwind major, swap of primary auth/DB library) |
| A new cron, webhook, secret, or hosted integration              | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) risks/verification section, [`AGENTS.md`](../AGENTS.md) hosted-services list                                                   |
| A breaking change to a server action or schema shape            | [`CLAUDE.md`](../CLAUDE.md) if the action is in "AI allowed actions", [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) architecture or schema section                          |
| A role / RBAC change (new role, new permission, role deprecation) | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) Auth & Roles section + "Still Assuming" list, [`CLAUDE.md`](../CLAUDE.md) Roles section, [`AGENTS.md`](../AGENTS.md) Roles section, [`README.md`](../README.md) Auth & Roles section |
| A user-facing string (label, button copy, toast, email / SMS template, error) | [`src/i18n/messages/en.json`](../src/i18n/messages/en.json) (canonical) + [`he.json`](../src/i18n/messages/he.json) in the same commit. For **customer-facing (`/book`, `/order`) or therapist-portal keys**, also add `ru.json` — RU is first-class on those surfaces and a missing key is a release blocker once Phase 7d ships the ESLint guard. Admin + reception keys may leave `ru.json` empty (deep-merge fallback to EN). SMS / email template copy still lives in `src/lib/messaging/templates/` (not yet catalog-keyed — Phase 8+ work) |
| Anything added to the AI allowed-action list (new tool, new guardrail) | [`CLAUDE.md`](../CLAUDE.md) "AI allowed actions" section, [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) Phase 8 tool list. `assign_therapist` and `assign_room` are explicitly NOT allowed — resource assignment is the auto-assignment engine's job (Phase 7c), never the conversational agent's. |
| A production deploy URL, environment, or host changes           | [`AGENTS.md`](../AGENTS.md) hosted-services, [`README.md`](../README.md) deploy notes                                                                                                |
| Something previously "Still Assuming" or "Open Question" becomes confirmed | [`docs/plans/MASTER-PLAN.md`](./plans/MASTER-PLAN.md) — move the bullet from "Still Assuming" or "Open Questions" up into "Confirmed Decisions". If the decision was on a vision open question, also move it in [`docs/vision/SpaMe-vision.md`](./vision/SpaMe-vision.md). |
| A new or changed rule under `.cursor/rules/*.mdc`               | Note the rule + its `globs` in the PR description. Keep rules under 50 lines. If adding a rule with `alwaysApply: true`, justify it — only `00-project-invariants.mdc` and `90-mcp-safety.mdc` should be always-apply.                 |
| A new or changed hook under `.cursor/hooks/*` or `.cursor/hooks.json` | Update `.cursor/hooks.json` with the event + matcher. Note the change in the PR description. Confirm the script is executable (`chmod +x`) and that any helper binaries (`jq`, `git`, `npx`) are verified via `command -v` at the top of the script. If the hook is `guard-shell.sh`, update the pattern list here — it is the single source of truth for dangerous-command blocking. |
| A change to `.cursor/bugbot.yaml`                               | Note the scope change in the PR description. Prefer narrowing over widening. [`CONTRIBUTING.md`](../CONTRIBUTING.md) Cloud-Agent / Cursor-rail section for rationale on scope.                                                        |
| A change to `.cursor/mcp.json`                                  | Note the server + scope change in the PR description. **Verify no `SUPABASE_SERVICE_ROLE_KEY` or production project ref is committed** — credentials must reference environment variables, not literal values. [`CONTRIBUTING.md`](../CONTRIBUTING.md) MCP setup section for operator-side env var names. |
| A new user-facing string added to [`src/i18n/messages/en.json`](../src/i18n/messages/en.json) | The narrow Cloud Agent `i18n-translation-drafter` auto-opens a PR drafting `he.json` + `ru.json` entries. Flag in the PR description whether the merged PR reflects the auto-draft (expected) or a hand-drafted override (audit-worthy). |

## What this manifest does NOT cover

- Refactors that don't change public shape (internal module moves, lint fixes, comment tweaks) — no doc update required.
- Test-only additions — no doc update required unless the added test surfaces a new guarantee worth documenting.
- `.agents/skills/` — those are upstream skill bundles, not ours. Never edit them.

## When this file itself is wrong

If the manifest misses a drift case you just hit, update this file in the same PR that caught the gap. Add the row, re-commit. One line here saves hours of stale-doc archaeology later.
