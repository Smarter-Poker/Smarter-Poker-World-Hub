-- audit_trail.actor_role could not record who actually did it.
--
-- Applied to production 2026-08-21 via Supabase MCP as
-- 'audit_trail_knows_the_club_roles' (version 20260821154317).
--
-- The constraint admitted owner, co_owner, host, agent, sub_agent, union_admin,
-- platform_admin and system - a mix of two taxonomies, missing three of the
-- seven club roles. A club admin promoting someone produced a constraint
-- violation rather than an audit row, which failed the role change outright.
--
-- Mapping 'admin' onto 'host' or 'union_admin' was the alternative and is
-- worse: an audit trail recording a role the actor does not hold will mislead
-- precisely when someone is reading it to find out what happened.

ALTER TABLE public.audit_trail DROP CONSTRAINT IF EXISTS audit_trail_actor_role_check;
ALTER TABLE public.audit_trail ADD CONSTRAINT audit_trail_actor_role_check
  CHECK (actor_role = ANY (ARRAY[
    'owner'::text, 'co_owner'::text, 'admin'::text, 'super_agent'::text,
    'agent'::text, 'sub_agent'::text, 'player'::text,
    'host'::text, 'union_admin'::text, 'platform_admin'::text, 'system'::text]));

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = 'public.audit_trail'::regclass AND conname = 'audit_trail_actor_role_check';
  IF v_def NOT LIKE '%super_agent%' OR v_def NOT LIKE '%''admin''%' THEN
    RAISE EXCEPTION 'club roles did not make it into audit_trail: %', v_def;
  END IF;
END $$;
