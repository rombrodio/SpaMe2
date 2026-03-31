# Project: Spa management app for Tel Aviv spa

## Product goal
Replace Biz-Online with a custom web app focused on:
1. Scheduling & calendar
2. AI chatbot for customers (WhatsApp + website)
3. Payment processing via hosted payment links/pages
4. Therapist and room management

## Required stack
- Next.js (App Router) on Vercel
- TypeScript
- Supabase Postgres
- Supabase Auth
- Tailwind CSS
- shadcn/ui where useful
- Zod for validation
- Route Handlers / Server Actions for backend flows
- WhatsApp Business Cloud API
- Hosted Israeli payment provider with webhook support

## Non-negotiable architecture rules
- All scheduling logic must run on the server
- AI must never write arbitrary data directly to the database
- AI may only call approved server actions
- Never store raw credit card data
- Payment webhook is the source of truth for payment success
- WhatsApp is used for conversation, reminders, confirmations, and payment-link sending only
- Default timezone: Asia/Jerusalem
- Default currency: ILS

## Core entities
- Customer
- Therapist
- Room
- Service
- TherapistService
- RoomService
- TherapistAvailabilityRule
- TherapistTimeOff
- RoomBlock
- Booking
- Payment
- ConversationThread
- ConversationMessage
- AuditLog

## Business rules
- Prevent overlapping therapist bookings
- Prevent overlapping room bookings
- Only allow therapists qualified for the selected service
- Only allow rooms compatible with the selected service
- Booking statuses:
  - pending_payment
  - confirmed
  - cancelled
  - completed
  - no_show
- If payment is required, booking remains pending_payment until webhook confirmation
- Never fabricate availability
- Never fabricate payment confirmation

## AI allowed actions only
- find_available_slots
- create_tentative_booking
- create_payment_link
- reschedule_booking
- cancel_booking
- handoff_to_staff

## V1 scope only
Build only:
- admin auth
- calendar
- bookings
- therapists
- rooms
- services
- customers
- hosted payment flow
- WhatsApp/web chat foundation
- staff inbox
- audit logs

Do not build in V1:
- payroll
- inventory
- loyalty
- deep accounting
- complex memberships
- multi-branch logic
- advanced BI dashboards

## Engineering rules
- Keep business logic in services/lib modules, not UI components
- Validate all inputs with Zod
- Use environment variables for all secrets
- Add mock adapters when external credentials are missing
- Prefer simple, production-sane solutions
- Keep files modular and readable
- Add README with setup, migrations, seed, env vars, deploy, webhook config

## Current implementation order
1. Foundations
2. Admin CRUD
3. Scheduling core
4. Payments
5. Customer booking flow
6. Chatbot foundation
7. Staff inbox and polish

## Definition of done per phase
A phase is done only when:
- code compiles
- schema/migrations are valid
- key flows work locally
- edge cases for that phase are handled
- README is updated if setup changes
