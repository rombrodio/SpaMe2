#!/usr/bin/env bash
# beforeShellExecution hook — single source of truth for dangerous-command blocking.
# failClosed: true in .cursor/hooks.json — if this script crashes, the command is blocked.
# Not mirrored in Cursor Settings Auto-Run denylist; keep the list here only.
#
# JSON output is always assembled via jq so regex patterns with backslashes or
# brackets cannot produce invalid JSON (which would tripper failClosed and
# block every command).
set -u

if ! command -v jq >/dev/null 2>&1; then
  # jq missing → fail closed. Install jq (brew install jq) or the guardrail is useless.
  printf '%s\n' '{"permission":"ask","user_message":"guard-shell.sh cannot run: jq not installed. Install with: brew install jq","agent_message":"Blocked: jq missing on host."}'
  exit 0
fi

input="$(cat)"
cmd="$(printf '%s' "$input" | jq -r '.command // empty')"

if [ -z "$cmd" ]; then
  echo '{"permission":"allow"}'
  exit 0
fi

# DENY — unconditional block on clearly-destructive patterns.
# Regex anchors carefully so token boundaries match both `git push -f` and `git push ... -f`.
deny_patterns=(
  'git[[:space:]]+push([[:space:]]+-f([[:space:]]|$)|[[:space:]].*[[:space:]]-f([[:space:]]|$)|.*--force([[:space:]]|$))'
  'git[[:space:]]+reset[[:space:]]+--hard[[:space:]]+origin'
  '(^|[[:space:]])rm[[:space:]]+-rf[[:space:]]+/($|[[:space:]])'
  '(^|[[:space:]])rm[[:space:]]+-rf[[:space:]]+~($|/|[[:space:]])'
  'supabase[[:space:]]+db[[:space:]]+push[[:space:]]+.*--linked'
  '(^|[[:space:]])npm[[:space:]]+publish([[:space:]]|$)'
  'DROP[[:space:]]+(TABLE|SCHEMA|DATABASE)'
)

for pat in "${deny_patterns[@]}"; do
  if printf '%s' "$cmd" | grep -qE "$pat"; then
    jq -n --arg pat "$pat" '{
      permission: "deny",
      user_message: ("Blocked by guard-shell.sh: destructive pattern matched (" + $pat + "). If this is intentional, run it in a separate terminal outside Cursor."),
      agent_message: "Command blocked by project safety hook. Do not retry; escalate to the user."
    }'
    exit 0
  fi
done

# ASK — patterns that are sometimes valid but should always be reviewed.
# The .env rule covers `.env` + `.env.local` + `.env.production` + `.env.development`
# but NOT `.env.local.example` / `.env.example` (those are public docs, safe).
ask_patterns=(
  'supabase[[:space:]]+db[[:space:]]+reset'
  'vercel[[:space:]]+--prod'
  'gh[[:space:]]+pr[[:space:]]+merge[[:space:]]+.*--admin'
  '(^|[[:space:]=])\.env(\.local|\.production|\.development)?([[:space:]=/]|$)'
  'git[[:space:]]+push[[:space:]]+.*[[:space:]]main([[:space:]]|$)'
)

for pat in "${ask_patterns[@]}"; do
  if printf '%s' "$cmd" | grep -qE "$pat"; then
    jq -n --arg pat "$pat" '{
      permission: "ask",
      user_message: ("guard-shell.sh flagged: pattern " + $pat + " matched. Approve only if you are sure — this touches production, secrets, or main branch."),
      agent_message: "Project safety hook paused this command. Human approval required."
    }'
    exit 0
  fi
done

echo '{"permission":"allow"}'
exit 0
