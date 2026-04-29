#!/usr/bin/env bash
# sessionStart hook — prints a short briefing when a new Cursor chat opens.
# Fail-open: any error here prints a minimal message instead of blocking.
set -u

if ! command -v git >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  jq -n '{additional_context: "SpaMe2 — git or jq unavailable; skipping session briefing. Read AGENTS.md + CLAUDE.md before making changes."}' 2>/dev/null \
    || echo '{"additional_context":"SpaMe2 — skipping briefing (no jq)."}'
  exit 0
fi

# Sync remote refs so the briefing reflects github.com reality (e.g. when a PR
# is merged in the browser while the operator is away from this machine).
# Read-only: updates origin/* tracking refs and prunes dead remote branches,
# never touches the working tree. Fail-open on offline/slow network — the
# outer hook-level timeout in .cursor/hooks.json caps runtime.
fetch_status="ok"
if command -v timeout >/dev/null 2>&1; then
  timeout 5 git fetch --prune --quiet origin 2>/dev/null || fetch_status="skipped (offline or slow)"
else
  git fetch --prune --quiet origin 2>/dev/null || fetch_status="skipped (offline or slow)"
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
dirty_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
recent="$(git log --oneline -5 2>/dev/null || echo '(no commits)')"

# Compare local main to origin/main so the briefing tells the operator whether
# a manual `git pull --ff-only` is needed before starting work.
behind_main="$(git rev-list --count main..origin/main 2>/dev/null || echo '?')"

if [ "$fetch_status" != "ok" ]; then
  sync_hint="Sync: ${fetch_status} — run \`git fetch --prune\` when back online."
elif [ "$behind_main" = "?" ] || [ "$behind_main" = "0" ]; then
  sync_hint="Sync: up to date with origin."
elif [ "$branch" = "main" ]; then
  sync_hint="Sync: local main is ${behind_main} commit(s) behind origin/main — run \`git pull --ff-only\` before starting."
else
  sync_hint="Sync: origin/main has advanced ${behind_main} commit(s) since your local main — rebase / merge / checkout main and pull when ready."
fi

briefing=$(cat <<EOF
SpaMe2 session briefing

Branch: ${branch} (${dirty_count} uncommitted)
${sync_hint}

Recent commits:
${recent}

For current phase frontier: read docs/plans/MASTER-PLAN.md — look for the first "Phase X" header without ✅/SHIPPED/COMPLETE.

Model: Opus 4.7 (default). Plan mode is the default Agent mode — switch to Agent only after a plan is confirmed.

Before every commit: walk docs/DOC-SYNC.md. Session-end: npm run typecheck && lint && test && build.

If this chat grows long (~40 tool calls), stop and fill docs/SESSION-HANDOFF.md, open a fresh chat.
EOF
)

jq -n --arg msg "$briefing" '{additional_context: $msg}'
exit 0
