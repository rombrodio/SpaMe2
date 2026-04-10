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

## Phase branches for this project
Build in this order:
1. `feat/foundations`
2. `feat/admin-crud`
3. `feat/scheduling-core`
4. `feat/payments`
5. `feat/customer-booking`
6. `feat/chatbot-foundation`
7. `feat/staff-inbox-polish`

## Definition of done for a branch
Before merging:
- app runs locally
- schema/migrations are valid
- no obvious TypeScript errors
- key flow for that branch works end-to-end
- README updated if setup changed
- PR description is complete

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
