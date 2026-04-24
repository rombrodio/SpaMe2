# Contributing

## Branch strategy
- `main` is always stable and deployable
- Never push directly to `main`
- Use short-lived branches only

### Branch naming
- `feat/<name>` for features
- `fix/<name>` for bug fixes
- `chore/<name>` for tooling, cleanup, config
- `refactor/<name>` for internal code changes without behavior changes

Examples:
- `feat/foundations`
- `feat/admin-crud`
- `feat/scheduling-core`
- `feat/payments`
- `feat/customer-booking`
- `feat/chatbot-foundation`
- `fix/payment-webhook-idempotency`

## Pull request rules
- Open a draft PR early
- One PR = one focused unit of work
- Do not mix unrelated systems in one PR
- Prefer small and reviewable PRs
- Merge with **Squash and merge**
- Delete branch after merge

## Commit style
Use short, clear, imperative commit messages.

Examples:
- `add booking schema and migrations`
- `implement therapist availability service`
- `add payment webhook handler`
- `build customer booking flow`
- `fix room overlap validation`

Avoid:
- `stuff`
- `wip`
- `fix`
- `changes`

## Branch naming in practice

Feature branches use descriptive kebab names:

- `feat/<short-kebab-topic>` — e.g. `feat/operator-reality-check`, `feat/vercel-analytics`
- `fix/<short-kebab-topic>` — e.g. `fix/payment-webhook-idempotency`
- `chore/<short-kebab-topic>` — e.g. `chore/remove-therapist-avatars`

Large multi-PR efforts may use a shared prefix (e.g. `feat/phase-4-qa-*`),
but this is optional. **Phase and SPA-* / DEF-* references live in the PR
description, not the branch name** — phase tags on branches were found to
drift as work got reshaped.

## Definition of done for a branch

Before merging:

- CI gate passes (`tsc --noEmit`, `lint`, `test`, `build` — see
  `.github/workflows/ci.yml`)
- schema/migrations are valid
- key flow for that branch works end-to-end (manual smoke or automated test)
- `docs/DOC-SYNC.md` manifest walked — every doc listed for the changes is
  updated in the same PR
- PR description is complete and the `## Docs sync` checklist is filled in

## Rules for Claude Code
- Claude works only on the current branch
- Claude should only implement the current phase
- Claude should not touch unrelated files unless necessary
- Claude should explain major architecture choices
- Claude should keep business logic in services/lib, not UI components
- Claude should not overbuild beyond V1

## High-risk areas
Be extra careful with:
- scheduling conflicts
- therapist/room overlap prevention
- payment webhook handling
- booking confirmation rules
- AI tool permissions
- WhatsApp webhook flows

## Merge checklist
- [ ] Branch is up to date
- [ ] Scope is focused
- [ ] Local testing done
- [ ] No unrelated changes included
- [ ] PR description explains what changed and why
- [ ] Ready to squash merge
