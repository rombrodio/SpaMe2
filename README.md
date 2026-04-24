# SpaMe2

Spa management and booking system for a Tel Aviv spa.

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Vercel
- **Language:** TypeScript
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth (email/password)
- **Styling:** Tailwind CSS v4 + hand-rolled UI primitives under `src/components/ui/` (CVA + Radix: `alert-dialog`, `popover`, `dropdown-menu`, `command`, plus locally-built `button`, `card`, `input`, `select`, `textarea`, `badge`)
- **Validation:** Zod

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase CLI (`npm install -g supabase`)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd SpaMe2
npm install

# 2. Copy environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase project credentials

# 2a. (Alternative path) Use the hosted Supabase project — paste its URL +
# anon + service-role keys into .env.local and skip steps 3 + 4 entirely.
# This is how the team actually works day to day; no Docker required.

# 3. Start Supabase locally (Docker required)
supabase start

# 4. Run migrations
supabase db reset    # Runs all migrations + seed.sql

# 5. Create an admin user
# In Supabase dashboard or via CLI, create an auth user.
# Then manually update their profile:
#   UPDATE profiles SET role = 'super_admin' WHERE id = '<user-id>';

# 6. Start the dev server
npm run dev
```

### Environment Variables

See `.env.local.example` for the full reference — canonical and kept current. Minimum to boot the app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ORDER_TOKEN_SECRET` — signs `/order/<token>` JWTs

Production also needs `CRON_SECRET` (Vercel Cron auth header). CardCom / DTS / VPay credentials are only required when flipping the corresponding `PAYMENTS_*_PROVIDER` env var off `mock`.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── (auth)/       # Login, auth callback
│   ├── admin/        # Super admin dashboard
│   └── therapist/    # Therapist portal
├── components/       # React components
│   ├── ui/           # Base UI components (button, input, card, etc.)
│   └── admin/        # Admin-specific components
├── lib/              # Shared library code
│   └── supabase/     # Supabase client helpers
└── middleware.ts      # Auth + role-based routing (renames to proxy.ts in a future Next 16 minor)

supabase/
├── migrations/       # SQL migration files (00001-00020)
└── seed.sql          # Demo data for local development
```

## Auth & Roles

- **Super Admin:** Full access to `/admin/*`. Can manage therapists, rooms, services, bookings, calendar.
- **Therapist:** Access to `/therapist/*`. Can manage own availability and view own bookings.
- **Customer:** No login. Identified by phone number.

## Database Migrations

Migrations are in `supabase/migrations/` and run in order:

1. Extensions (btree_gist)
2. Enum types
3. Profiles (auth linking)
4. Core tables (customers, therapists, rooms, services)
5. Junction tables (therapist_services, room_services)
6. Scheduling tables (availability, time-off, room blocks)
7. Bookings (with exclusion constraints for overlap prevention)
8. Payments
9. Conversations
10. Audit log
11. Triggers (auto updated_at)
12. RLS policies (role-based)
13. Supabase advisor fixes (security_invoker, search_path hardening)
14. Deterministic seed UUIDs
15. Payment methods + holds (CardCom, DTS, VPay)
16. Authorized-payment unique partial index
17. Therapist gender + booking gender preference
18. Deferred-assignment workflow (unassigned queue + SLA)
19. Spa settings (on-call manager name + phone)
20. Business hours + slot granularity (configurable via Settings)

## Scripts

```bash
npm run dev            # Start development server
npm run build          # Production build
npm run start          # Start production server
npm run lint           # Run ESLint
npm run test           # Vitest one-shot (161 tests across 12 files)
npm run test:watch     # Vitest in watch mode
npm run demo:payments  # Seed + exercise payment adapters (tsx)
```

## Agent guidance

Read these before making changes — in order:

1. [`AGENTS.md`](./AGENTS.md) — 30-second entrypoint for any AI agent (Claude, Cursor, Codex, v0, Augment, etc.).
2. [`CLAUDE.md`](./CLAUDE.md) — product goal, stack, engineering rules, non-negotiable architecture constraints.
3. [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) — single source of truth for phase status.
4. [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) — **mandatory** pre-commit manifest: *if you change X, update Y*. Walk it before every commit.
