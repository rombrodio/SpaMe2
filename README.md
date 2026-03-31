# SpaMe2

Spa management and booking system for a Tel Aviv spa.

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Vercel
- **Language:** TypeScript
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth (email/password)
- **Styling:** Tailwind CSS v4 + shadcn/ui components
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

# 3. Start Supabase locally (or use a hosted project)
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

See `.env.local.example` for all variables. Only Supabase variables are needed for Phase 1.

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
└── middleware.ts      # Auth + role-based routing

supabase/
├── migrations/       # SQL migration files (00001-00012)
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

## Scripts

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```
