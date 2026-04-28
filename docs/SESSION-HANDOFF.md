# Session handoff

One feature = one chat. When a chat gets long (roughly 40+ tool calls or you notice the agent forgetting an invariant it clearly read earlier), stop, fill this template, open a fresh chat, paste this file as the first message. Do not let context compaction decide what gets forgotten.

This file is owned by the human, not the agent. **Overwrite between sessions; keep it current, not historical.** It is a *template*, not a journal.

## What NEVER goes in this file

- **No secrets, tokens, keys, or their prefixes** (e.g. `sbp_...`, `ghp_...`, `sk-...`, `eyJ...` JWTs). Git history is permanent; once committed, a secret is exposed even after rotation. If the previous chat leaked one, rotate immediately and leave a generic note here (e.g. "token rotated YYYY-MM-DD, old value revoked"), never the value.
- **No full terminal transcripts** that may embed secrets. Summarise what happened; do not paste raw command output.
- **No per-machine paths unique to an operator** (e.g. `/Users/<name>/...`) — use `~/` or `<home>` form.

---

## Branch

<branch-name>

## What shipped in the last chat

-
-
-

## What is next

-

## Open decisions / unresolved questions

-

## Gotchas the next chat needs to know

-

## Current plan file (if any)

`.cursor/plans/<name>_<id>.plan.md`

## Verification status

- [ ] `npm run typecheck` green
- [ ] `npm run lint` green
- [ ] `npm run test` green
- [ ] `npm run build` green
- [ ] [`docs/DOC-SYNC.md`](./DOC-SYNC.md) walked for this change
