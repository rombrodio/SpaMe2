#!/usr/bin/env bash
# afterFileEdit hook — runs Prettier on edited TS/TSX/JSON/MD/MDC files.
# Fail-open: any error here is logged to stderr and the edit proceeds.
set -u

if ! command -v jq >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  echo '{}'
  exit 0
fi

input="$(cat)"
file_path="$(echo "$input" | jq -r '.file_path // .tool_input.file_path // empty')"

if [ -z "$file_path" ]; then
  echo '{}'
  exit 0
fi

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.md|*.mdc|*.mjs|*.cjs)
    (npx --no-install prettier --write "$file_path" >/dev/null 2>&1) || true
    ;;
esac

echo '{}'
exit 0
