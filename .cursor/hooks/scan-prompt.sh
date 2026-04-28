#!/usr/bin/env bash
# beforeSubmitPrompt hook — regex-scans the outgoing prompt for secret-shaped content.
# Fail-open: if the scanner crashes, the prompt goes through (we rely on allow-by-default).
set -u

if ! command -v jq >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

input="$(cat)"
prompt="$(echo "$input" | jq -r '.prompt // empty')"

if [ -z "$prompt" ]; then
  echo '{}'
  exit 0
fi

# Patterns — kept conservative to avoid false blocks. All return permission: ask, never deny.
patterns=(
  'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9._-]{20,}'
  'sk-[A-Za-z0-9_-]{20,}'
  'sk_live_[A-Za-z0-9]{20,}'
  'ghp_[A-Za-z0-9]{30,}'
  'github_pat_[A-Za-z0-9_]{30,}'
  'TWILIO_AUTH_TOKEN[[:space:]]*=[[:space:]]*[A-Fa-f0-9]{20,}'
  'CARDCOM.*(PASSWORD|APIPASSWORD)[[:space:]]*[=:][[:space:]]*[A-Za-z0-9!@#$%^&*_-]{6,}'
  'eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}'
)

for pat in "${patterns[@]}"; do
  if echo "$prompt" | grep -qE "$pat"; then
    cat <<EOF
{
  "permission": "ask",
  "user_message": "scan-prompt.sh flagged a secret-shaped value in the prompt (pattern: ${pat}). Review and redact before sending. Approve only if this is a deliberate test value.",
  "agent_message": "Project safety hook paused prompt send. Human approval required."
}
EOF
    exit 0
  fi
done

echo '{}'
exit 0
