#!/usr/bin/env bash
# stop hook — reminds about docs/DOC-SYNC.md if staged changes look like they need it.
# Fail-open: never blocks.
set -u

if ! command -v git >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

staged="$(git diff --cached --name-only 2>/dev/null || echo '')"
modified="$(git diff --name-only 2>/dev/null || echo '')"
untracked="$(git ls-files --others --exclude-standard 2>/dev/null || echo '')"
all_changes="$(printf '%s\n%s\n%s\n' "$staged" "$modified" "$untracked")"

if [ -z "$all_changes" ]; then
  echo '{}'
  exit 0
fi

reminders=()

if echo "$all_changes" | grep -qE '^supabase/migrations/'; then
  reminders+=("Migration touched — update README.md migration list + docs/plans/MASTER-PLAN.md migration list.")
fi
if echo "$all_changes" | grep -qE '^\.env\.local\.example$'; then
  reminders+=("Env var changed — update README.md env section + AGENTS.md minimum-env list if load-bearing.")
fi
if echo "$all_changes" | grep -qE '^src/i18n/messages/en\.json$'; then
  reminders+=("New/changed key in en.json — confirm Cloud Agent auto-draft PR for he.json + ru.json (or hand-draft if on customer/therapist surfaces).")
fi
if echo "$all_changes" | grep -qE '^src/app/'; then
  reminders+=("New/changed route under src/app/ — update docs/plans/MASTER-PLAN.md folder structure section; AGENTS.md hosted-services if it calls something external.")
fi
if echo "$all_changes" | grep -qE '^\.cursor/mcp\.json$'; then
  reminders+=("MCP config changed — VERIFY no service-role key or prod project ref committed. Rule 90-mcp-safety.mdc is the reviewer signal.")
fi
if echo "$all_changes" | grep -qE '^\.cursor/(rules|hooks|bugbot)'; then
  reminders+=("Cursor rail changed (.cursor/rules|hooks|bugbot) — see docs/DOC-SYNC.md rows; note scope in PR description.")
fi

if [ ${#reminders[@]} -eq 0 ]; then
  echo '{}'
  exit 0
fi

joined="$(printf '• %s\\n' "${reminders[@]}")"
joined="${joined%\\n}"

cat <<EOF
{
  "additional_context": "docs/DOC-SYNC.md reminders based on your staged changes:\\n\\n${joined}\\n\\nWalk docs/DOC-SYNC.md end-to-end before you commit."
}
EOF
exit 0
