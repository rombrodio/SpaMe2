# Session handoff

One feature = one chat. When a chat gets long (roughly 40+ tool calls or you notice the agent forgetting an invariant it clearly read earlier), stop, fill this template, open a fresh chat, paste this file as the first message. Do not let context compaction decide what gets forgotten.

This file is owned by the human, not the agent. Overwrite between sessions; keep it current, not historical.

---

## Branch

`main` (no code changes made this session; 10 pre-existing uncommitted files per session start)

## What shipped in the last chat

- Diagnosed why the Supabase MCP (`supabase-dev` in `.cursor/mcp.json`) was returning `Unauthorized` despite `SUPABASE_DEV_ACCESS_TOKEN` + `SUPABASE_DEV_PROJECT_REF` being set in `~/.zshrc`. Root cause: macOS GUI apps (Cursor.app launched from Dock/Finder) inherit env from `launchd`, not from `~/.zshrc`. The MCP subprocess therefore never saw the vars.
- Built a permanent fix on the operator machine only (NOT in the repo):
  - `~/Library/Application Support/spame/publish-env.sh` — zsh helper script that sources `~/.zshrc` and `launchctl setenv`'s both vars.
  - `~/Library/LaunchAgents/com.spame.env.plist` — LaunchAgent (`Label: com.spame.env`, `RunAtLoad: true`) that runs the helper at every login.
  - Bootstrapped with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.spame.env.plist`. Verified: Cursor process inherits both vars, `launchctl getenv` returns them, `curl` against `api.supabase.com` returns HTTP 200, Supabase MCP `list_tables` returns the full 19-table public schema (profiles, customers, therapists, rooms, services, therapist_services, room_services, therapist_availability_rules, therapist_time_off, room_blocks, bookings, payments, conversation_threads, conversation_messages, audit_logs, service_voucher_mappings, spa_settings, receptionists, receptionist_availability_rules — all RLS enabled).
- Rotated `SUPABASE_DEV_ACCESS_TOKEN` after the agent accidentally printed the old value in full in terminal output. Old token revoked on https://supabase.com/dashboard/account/tokens, new token pasted into `~/.zshrc`, `launchctl kickstart -k "gui/$(id -u)/com.spame.env"` re-published to launchd, Cursor relaunched, MCP re-verified.
- Audited docs for operator-onboarding gaps (see "Open decisions" below).

## What is next

Operator chose to defer the docs work. Candidate follow-ups when picked up:

- **Option A — Write `docs/setup/operator-onboarding.md`** (new file) covering: macOS LaunchAgent pattern (copy from this session), rotation procedure, diagnostic chain for `Unauthorized`, first-call `list_tables` sanity check, secret-leak incident response. Add a new DOC-SYNC row for "operator-side setup procedure changed → CONTRIBUTING.md §MCP + `.env.local.example` MCP block + `docs/setup/operator-onboarding.md`". Trim CONTRIBUTING.md §"MCP server setup" to a summary + link. Add a README pointer for macOS operators. Touches 4 files.
- **Option B — Resume phase frontier (Phase 7c: auto-assignment engine + publish rail + multi-channel therapist notifications + manager push alerts)** per `docs/plans/MASTER-PLAN.md`. Migration `00026_auto_assignment.sql`, `src/lib/scheduling/assignment/` engine, `src/lib/notifications/` adapters, admin publish UI, email-provider choice. Do this in Plan mode first.

## Open decisions / unresolved questions

- **Do the LaunchAgent artifacts (`publish-env.sh` + `com.spame.env.plist`) belong in-repo as templates (e.g. under `docs/setup/macos-launchagent/`) or stay as per-machine-local only?** Arguments for in-repo: new operators copy-paste instead of reconstructing. Arguments against: secrets live in zshrc so templates wouldn't leak, but committing a plist with hardcoded `/Users/brodsky` paths drifts if a different operator's home path differs. Tentative: ship them as templates under `docs/setup/` with a `<user>` placeholder if Option A above is picked up.
- **Scope of `operator-onboarding.md`** if written: macOS-only for V1 (only one operator today), or cover Linux + WSL too? Linux operators likely don't hit this problem; WSL operators hit a different variant. Defer to when a second operator joins.
- **Should DOC-SYNC grow a row for "operator-side setup procedure changed"?** Closest existing row catches `.cursor/mcp.json` config changes but not the operator instructions. Small addition, worth one line.

## Gotchas the next chat needs to know

- **The old `SUPABASE_DEV_ACCESS_TOKEN` value `sbp_f01495c38f1d633675502695efaf2a54f9295168` appears in this session's transcript. It is REVOKED. Do not reuse it even if it surfaces in chat history.** New token lives only in `~/.zshrc` and in launchd's env.
- **The LaunchAgent is loaded and runs at every login.** To force a reload after editing `~/.zshrc` (e.g. on next rotation): `source ~/.zshrc && launchctl kickstart -k "gui/$(id -u)/com.spame.env"` then quit + relaunch Cursor. No need to touch the plist itself.
- **If `Unauthorized` returns from the MCP**, diagnostic chain in order: (1) `ps eww -p <cursor-pid> | tr ' ' '\n' | grep SUPABASE_DEV_` (does Cursor process have the vars?), (2) `launchctl getenv SUPABASE_DEV_ACCESS_TOKEN` (does launchd have them?), (3) `curl -H @<headerfile> https://api.supabase.com/v1/projects/$REF` (is the token valid?). Fix the first layer that's missing.
- **Quirk when testing with curl in the shell:** `curl -H "Authorization: Bearer $(launchctl getenv TOKEN)"` can fail with `{"message":"Format is Authorization: Bearer [token]"}` due to shell-escaping inside the agent's Shell tool wrapper. Use `printf 'Authorization: Bearer %s' "$tok" > /tmp/auth_hdr; curl -H @/tmp/auth_hdr ...` instead. This is a test-time quirk only; the MCP itself is unaffected.
- **`~/.zshrc` is interactive-only on most configs.** Sourcing it from a non-interactive shell can skip exports if it has `[[ -o interactive ]] || return` early. Our helper uses `#!/bin/zsh -i` to force interactive mode, which works here; do not "simplify" to `#!/bin/bash`.
- **Never put the SUPABASE_DEV_ACCESS_TOKEN or GITHUB_MCP_PAT literal in `.cursor/mcp.json`.** Always `${VAR}` form. Rule `90-mcp-safety.mdc` blocks this at review.

## Current plan file (if any)

None — no code touched this session.

## Verification status

- [x] `npm run typecheck` — N/A (no code changes)
- [x] `npm run lint` — N/A (no code changes)
- [x] `npm run test` — N/A (no code changes)
- [x] `npm run build` — N/A (no code changes)
- [x] [`docs/DOC-SYNC.md`](./DOC-SYNC.md) walked — N/A (no repo files changed; only `~/Library/` on the operator machine)
