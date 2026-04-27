# SpaMe

Single-venue spa management platform for a boutique spa in Tel Aviv, replacing Biz-Online.

Combines — tailored to spa operations — the functional surface of **BizOnline**
(booking + payment), **ShiftOrganizer** (staff shifts + availability), and
**Texter** (WhatsApp Business + AI conversational platform), with AI-assisted
automation as a first principle. Everything ships in this single codebase; the
earlier "SpaMeV3" split for the conversational layer is dropped.

## Tech Stack

- **Framework:** Next.js 16 (App Router) on Vercel
- **Language:** TypeScript
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth (email/password)
- **Styling:** Tailwind CSS v4 + hand-rolled UI primitives under `src/components/ui/` (CVA + Radix: `alert-dialog`, `popover`, `dropdown-menu`, `command`, plus locally-built `button`, `card`, `input`, `select`, `textarea`, `badge`)
- **Validation:** Zod
- **Messaging / notifications:** Twilio (SMS + WhatsApp today); Meta WhatsApp Business Cloud API (Phase 8); **email provider TBD** (Resend / Postmark / SES / SendGrid candidate, Phase 7c) — adds the third parallel notification channel for therapist assignment confirmations + the second channel for manager push alerts
- **Lint:** `eslint-config-next` today; **`eslint-plugin-no-literal-string` scoped to customer + therapist surfaces** lands with Phase 7d (build-time guardrail on literal user-visible strings)

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
│   ├── reception/    # Receptionist portal (Phase 6) + Texter inbox (Phase 8)
│   ├── therapist/    # Therapist portal
│   ├── book/         # Customer browser-direct booking (Hebrew, RTL)
│   ├── order/        # Hosted payment finalisation pages
│   └── chat/         # Embeddable customer web-chat widget (Phase 8)
├── components/       # React components
│   ├── ui/           # Base UI components (button, input, card, etc.)
│   └── admin/        # Admin-specific components
├── lib/              # Shared library code
│   ├── supabase/     # Supabase client helpers
│   ├── scheduling/   # Availability + slot finding + booking engine
│   ├── payments/     # CardCom + DTS + VPay adapters (mock + real)
│   ├── conversations/ # WhatsApp + AI engine + approval rail (Phase 8)
│   ├── i18n/         # HE / EN / RU catalogs + loader (Phase 7)
│   └── reports/      # Fixed-report queries + CSV export (Phase 9)
└── middleware.ts      # Auth + role-based routing

services/              # Same-repo, separate-deploy workstreams
└── vpay-proxy/        # Fly.io mTLS + static-IP proxy (Phase 4.5)

supabase/
├── migrations/       # SQL migration files (00001-00025)
└── seed.sql          # Demo data for local development
```

## Auth & Roles

- **Super Admin:** Full access to `/admin/*`. Can manage therapists, rooms, services, bookings, calendar, receptionists, settings (including the spa-wide `auto_assign_enabled` toggle, Phase 7c), audit log. Full visibility into the receptionist inbox. **Approves / edits / rejects AI-drafted outbound replies** from the same inbox the receptionist uses. Owns the manager publish action (per-booking immediate + batch). May mute own manager push alerts via profile preferences.
- **Receptionist** _(Phase 6)_: Primary surface is `/reception/inbox`. Creates bookings on behalf of customers — **may pre-empt the auto-assignment engine by selecting a therapist and/or a room at booking creation** (the booking still flows through manager publish). Submits own on-duty (chat + phone) windows, monitors every active conversation, approves / edits / rejects every AI-drafted reply before it sends. Cannot manage therapists / services / rooms / settings / audit log.
- **Therapist:** Access to `/therapist/*`. Manages own availability, views own bookings (read-only). **Confirms assignment receipts delivered across the therapist's chosen subset of four parallel channels** — WhatsApp + portal + email + SMS (default: all four enabled, Phase 7c). One confirmation across any enabled channel resolves; 2-hour SLA from publish. The therapist portal is also where the per-channel preferences are managed.
- **Customer:** No login. Identified by phone number (E.164). Never sees therapist names or specific room identifiers.

Language policy: Hebrew default. **HE / EN / RU first-class on customer-facing surfaces and the therapist portal** (Phase 7d lands full RU + an ESLint rule making hardcoded literals on those surfaces fail the build). Admin + reception stay HE/EN-validated with RU deep-merge fallback. Per-user toggle for staff on `profiles.language`; customer language auto-detected on first inbound message and persisted on `customers.language`.

### Production Supabase dashboard settings

Password-reset emails only work when the hosted Supabase project knows
our real origin. After deploying to Vercel:

1. **Supabase → Authentication → URL Configuration**
   - **Site URL:** `https://<your-vercel-domain>` (e.g. `https://spa-me2.vercel.app`)
   - **Redirect URLs (allow-list):**
     - `https://<your-vercel-domain>/callback`
     - `https://<your-vercel-domain>/**` (wildcard, covers `/callback?next=...`)
2. **Vercel → Project → Environment Variables**
   - `NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>`

The app's `/callback` route handles both PKCE (`?code=`) and OTP
(`?token_hash=&type=`) flows and forwards Supabase errors back to the
login page, so "Email link is invalid or has expired" is surfaced
instead of silently redirecting.

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
21. Service durations normalised to 45 min + 15 min buffer (operator decision)
22. `user_role` enum adds `'receptionist'` (Phase 6)
23. `receptionists` entity + `receptionist_availability_rules` + RLS extended for receptionist role
24. `booking_source` enum + `bookings.source` column (customer_web / admin_manual / receptionist_manual / chatbot)
25. `language_code` enum + `profiles.language` + `customers.language` (Phase 7 — HE/EN/RU localization)

## Localization

Phase 7a shipped the i18n framework. Phase 7b shipped the content migration across 7 PRs (customer `/book` + `/order`, reception, therapist, admin portal in 4 sub-PRs) — EN + HE validated on every surface. **Phase 7d** (pending) completes the picture: RU becomes first-class on customer-facing surfaces and the therapist portal, and an ESLint rule makes hardcoded literals on those surfaces fail the build.

- **Framework:** [next-intl](https://next-intl.dev/) in cookie-only mode (no `[locale]` URL segment). Locale is resolved per request via `NEXT_LOCALE` cookie → falls back to Hebrew.
- **Supported locales + coverage matrix:**
  - Hebrew — default, RTL, first-class on every surface.
  - English — first-class on customer + therapist surfaces; validated on admin + reception.
  - Russian — **first-class on customer + therapist surfaces after Phase 7d ships (no fallback — a missing RU key on those surfaces is a release blocker)**. Admin + reception remain at EN deep-merge fallback.
  - Catalog locales defined in [`src/i18n/config.ts`](src/i18n/config.ts).
- **Catalogs:** one JSON file per locale under [`src/i18n/messages/`](src/i18n/messages/) (`he.json`, `en.json`, `ru.json`). Top-level namespaces: `common.*`, `customer.*`, `admin.*`, `reception.*`, `therapist.*`.
- **Persistence:** staff preference persists on `profiles.language`; customer preference on `customers.language` (auto-detected on first inbound message starting in Phase 8).
- **Switcher:** [`src/components/locale-switcher.tsx`](src/components/locale-switcher.tsx), mounted in admin, reception, and therapist sidebars.
- **RTL:** root layout sets `<html dir>` dynamically based on the active locale. Customer `/book` + `/order` pages no longer carry hardcoded `dir="rtl"` — they inherit from the root layout.
- **Server-action errors:** still returned as English strings and rendered verbatim by `FormErrors`. Refactoring them to `{key, params}` envelopes was deferred from Phase 7b — a Phase 8+ item.
- **SMS / email templates:** still English / Hebrew only (Twilio + CardCom-receipt paths). Templating them off `customers.language` is deferred to Phase 8 (when the SMS set expands).
- **ESLint no-literal-strings rule:** not installed yet. **Phase 7d installs it scoped to `src/app/book/**`, `src/app/order/**`, `src/app/therapist/**`, `src/components/book/**`, `src/components/order/**`, `src/components/therapist/**`.** Admin + reception remain exempt while RU stays optional there.

**To add a new user-facing string:**

- **Admin / reception / common:** edit `en.json` and `he.json` under the same key path, then call `t('namespace.key')` in the component (use `useTranslations(ns)` in client components, `getTranslations(ns)` in server components). RU can be left empty — it falls back to English automatically.
- **Customer-facing (`/book`, `/order`) or therapist portal:** edit `en.json`, `he.json`, **and** `ru.json` in the same commit. The ESLint rule (after Phase 7d) will fail the build if the literal is inlined in the component instead of keyed.

## Scripts

```bash
npm run dev            # Start development server
npm run build          # Production build
npm run start          # Start production server
npm run lint           # Run ESLint
npm run test           # Vitest one-shot (208 tests across 16 files)
npm run test:watch     # Vitest in watch mode
npm run demo:payments  # Seed + exercise payment adapters (tsx)
```

## Agent guidance

Read these before making changes — in order:

1. [`AGENTS.md`](./AGENTS.md) — entrypoint for any AI agent (Claude, Cursor, Codex, v0, Augment, etc.).
2. [`CLAUDE.md`](./CLAUDE.md) — product goal, stack, engineering rules, non-negotiable architecture constraints.
3. [`docs/plans/MASTER-PLAN.md`](./docs/plans/MASTER-PLAN.md) — single source of truth for phase status.
4. [`docs/DOC-SYNC.md`](./docs/DOC-SYNC.md) — **mandatory** pre-commit manifest: *if you change X, update Y*. Walk it before every commit.
