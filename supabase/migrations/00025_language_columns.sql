-- 00025_language_columns.sql
-- Phase 7 — HE / EN / RU localization
--
-- Adds a language_code enum + language columns on profiles and
-- customers so each user has a persisted preference, independent of
-- the NEXT_LOCALE cookie. This lets us:
--   * route SMS/email templates in the customer's language (Phase 7)
--   * resume a signed-in staff member's locale across devices (Phase 7)
--   * auto-detect inbound WhatsApp language and persist it (Phase 8)
--
-- Default is 'he' — the Tel Aviv spa's primary language. Customer
-- rows stay nullable until Phase 8 detects their language from a
-- first inbound message (legacy rows have no signal to guess from).

CREATE TYPE public.language_code AS ENUM ('he', 'en', 'ru');

ALTER TABLE public.profiles
  ADD COLUMN language public.language_code NOT NULL DEFAULT 'he';

ALTER TABLE public.customers
  ADD COLUMN language public.language_code;

-- The existing profiles_access policy (from 00013) allows self-read
-- via `id = auth.uid()` in USING, but WITH CHECK is super_admin-only.
-- That blocks a therapist/receptionist from updating their OWN row
-- (e.g. `UPDATE profiles SET language = 'en' WHERE id = auth.uid()`),
-- which is exactly what setLocaleAction needs to do.
--
-- Widen WITH CHECK so every authenticated user can write to their own
-- profile row. Super admins retain unrestricted access.

DROP POLICY IF EXISTS "profiles_access" ON public.profiles;

CREATE POLICY "profiles_access" ON public.profiles FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR id = (select auth.uid())
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR id = (select auth.uid())
  );
