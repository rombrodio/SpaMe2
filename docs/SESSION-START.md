# Session start — the one thing you paste

Open a Cursor chat. The `sessionStart` hook prints a briefing automatically — it runs `git fetch --prune` against `origin` first, then reports branch, sync status (up-to-date / N commits behind origin/main / offline), last 5 commits, a reminder to read `docs/plans/MASTER-PLAN.md` for the phase frontier, and a reminder that Plan mode is default. You read nothing else to begin. If the sync line says "N commits behind", run `git checkout main && git pull --ff-only` before starting.

Then paste the template below, fill in the `<FEATURE>` blank, and send. The agent drives the rest of the session end-to-end.

## Kickoff template (copy-paste)

```
Start a new feature: <DESCRIBE IT IN ONE SENTENCE>.

Drive this session end-to-end:

1. Read docs/plans/MASTER-PLAN.md and docs/vision/SpaMe-vision.md.
   Confirm the phase frontier and the relevant invariants.
2. Ask me 1-2 scoping questions if the ask is ambiguous. Do not guess
   on schema shape, role matrix, or payment / scheduling semantics.
3. CreatePlan when scoped. Wait for my confirmation before switching
   to Agent mode.
4. Switch to Agent. Implement. Do not touch unrelated files.
5. Before commit, run:
   npm run typecheck && npm run lint && npm run test && npm run build
   Fix failures in the same PR.
6. Walk docs/DOC-SYNC.md. Update every matching doc in the SAME
   commit. Paste a one-line `Docs-sync:` footer in the commit body.
7. Create a `feat/<kebab-topic>` branch, commit, push, open a draft
   PR using .github/pull_request_template.md. Tick `## Docs sync`
   and the four `## Testing` rows.
8. Return the PR URL.

If a hook fires (guard-shell, scan-prompt, docs-sync-reminder), read
the script output, react, and continue. Consult
docs/DEV-SESSION-MANUAL.md only when the reaction isn't obvious.

If the chat exceeds ~40 tool calls or you notice context drift, stop,
fill docs/SESSION-HANDOFF.md, and tell me to open a fresh chat.
```

## What the agent will do for you

- Read the canonical docs (`MASTER-PLAN.md`, `SpaMe-vision.md`, `CLAUDE.md` invariants) before proposing anything.
- Ask a narrow scoping question rather than guessing when the ask is ambiguous.
- Produce a plan artifact and wait for your confirmation before writing code.
- Run the local gate (`typecheck && lint && test && build`) and fix failures before asking you to review.
- Walk [`docs/DOC-SYNC.md`](./DOC-SYNC.md) and update every matching doc in the same commit, with a `Docs-sync:` footer summarising what changed.
- Open a draft PR using the repo template, with the `## Docs sync` and `## Testing` rows explicitly ticked.

You review the PR. You don't manage the workflow.

## When to consult the manual

[`docs/DEV-SESSION-MANUAL.md`](./DEV-SESSION-MANUAL.md) is on-demand reference, not a per-session checklist. Open it only when something unusual happens mid-session:

- `guard-shell.sh` denies a command you expected to work → DENY / ASK lists.
- `scan-prompt.sh` flags a value you need to send → redact-vs-approve guidance.
- A hook output mentions a script behaviour that isn't self-evident.
- You hit one of the 8 troubleshooting entries (redirect loop, literal-strings lint, `supabase db reset` failure, etc.).
- You need to confirm which rule auto-attaches to a path, or which MCP server is wired for what.

## Handoff procedure

When the chat approaches ~40 tool calls or the agent starts drifting on an invariant it clearly read earlier, the agent will stop and ask you to open a fresh chat. Procedure:

1. Fill [`docs/SESSION-HANDOFF.md`](./SESSION-HANDOFF.md) — it's a template, not a journal. Overwrite, don't append.
2. Open a fresh Cursor chat.
3. Paste the handoff as the first message, then paste this kickoff template under it.

The new chat starts with the full context (branch, what shipped, what's next, open questions) plus the session-start briefing the hook prints automatically.

## What you never paste here

- Real secrets (`sbp_…`, `ghp_…`, `sk-…`, JWTs). Git history is permanent.
- Full terminal transcripts that may embed secrets. Summarise; don't copy raw output.
- Per-machine paths unique to an operator. Use `~/` form.
