-- 00026_profiles_rls_language_privilege_fix.sql
-- SECURITY: close privilege-escalation hole introduced in 00025.
--
-- Problem
-- -------
-- Migration 00025 widened the `profiles_access` RLS policy's WITH
-- CHECK clause so any authenticated user could write to their own
-- profiles row, with the goal of letting setLocaleAction update
-- `profiles.language`. Postgres RLS WITH CHECK operates at the ROW
-- level — not the column level — so this also permitted a logged-in
-- therapist or receptionist to do, from the browser anon-key client:
--
--     await supabase
--       .from('profiles')
--       .update({ role: 'super_admin' })
--       .eq('id', <their own id>);
--
-- …and the widened policy accepted it (USING and WITH CHECK both
-- satisfied by `id = auth.uid()`). That grants full super_admin DB
-- access: read all customers (phone, email), read all payments, read
-- the audit log, modify bookings / services / rooms / spa_settings,
-- and — via `therapist_id` / `receptionist_id` rewrites — impersonate
-- other staff inside the dependent RLS policies that key on those FKs.
--
-- Fix
-- ---
-- 1. Restore the pre-00025 `profiles_access` WITH CHECK to
--    super_admin-only. Normal staff can still read their own row
--    (USING), but cannot UPDATE / INSERT / DELETE it directly.
--
-- 2. Add `set_own_language(lang language_code)` — a SECURITY DEFINER
--    function that updates ONLY the `language` column on the caller's
--    own profiles row. This is the single write the staff portal
--    actually needs. setLocaleAction is updated in the same commit
--    to invoke this RPC instead of touching `profiles` directly.
--
-- 3. GRANT EXECUTE to `authenticated` only — anonymous callers (public
--    /book / /order) cannot reach it (they also have no profile row).

-- ── 1. Tighten profiles_access RLS ───────────────────────────

DROP POLICY IF EXISTS "profiles_access" ON public.profiles;

CREATE POLICY "profiles_access" ON public.profiles FOR ALL
  USING (
    (select public.get_user_role()) = 'super_admin'::public.user_role
    OR id = (select auth.uid())
  )
  WITH CHECK (
    (select public.get_user_role()) = 'super_admin'::public.user_role
  );

-- ── 2. set_own_language helper ───────────────────────────────

CREATE OR REPLACE FUNCTION public.set_own_language(lang public.language_code)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := (select auth.uid());
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.profiles
     SET language = lang
   WHERE id = uid;
END;
$$;

-- Deny-by-default for public, allow authenticated to call the RPC.
REVOKE ALL ON FUNCTION public.set_own_language(public.language_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_language(public.language_code) TO authenticated;
