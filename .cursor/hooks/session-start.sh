#!/usr/bin/env bash
# sessionStart hook — prints a short briefing when a new Cursor chat opens.
# Fail-open: any error here prints a minimal message instead of blocking.
set -u

if ! command -v git >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  jq -n '{additional_context: "SpaMe2 — git or jq unavailable; skipping session briefing. Read AGENTS.md + CLAUDE.md before making changes."}' 2>/dev/null \
    || echo '{"additional_context":"SpaMe2 — skipping briefing (no jq)."}'
  exit 0
fi

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
dirty_count="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
recent="$(git log --oneline -5 2>/dev/null || echo '(no commits)')"

briefing=$(cat <<EOF
SpaMe2 session briefing

Branch: ${branch} (${dirty_count} uncommitted)

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
