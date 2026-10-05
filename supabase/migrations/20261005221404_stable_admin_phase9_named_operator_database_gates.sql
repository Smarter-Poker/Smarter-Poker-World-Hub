-- Phase 9 folds Hand Reviews and Home Games Moderation into the Stable Admin
-- shell. The browser routes have enforced the Phase 2 permission vocabulary
-- since September, but the caller-scoped RPCs still repeated the older
-- profiles.role IN (admin, superadmin, god) rule. That split let a named-role
-- operator through the route and then refused the same operator in PostgREST.
--
-- This migration makes the database use the same additive/enforced permission
-- resolver as the route. It never trusts a supplied user id: the helper first
-- proves auth.uid() is that user. The legacy roles continue to resolve their
-- full permission set through fn_ca_operator_permissions.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_has_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_permissions jsonb;
BEGIN
  IF p_user_id IS NULL
     OR p_permission IS NULL
     OR auth.uid() IS NULL
     OR auth.uid() <> p_user_id THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ca_operator_role_permissions rp
    WHERE rp.permission = p_permission
  ) THEN
    RETURN false;
  END IF;

  v_permissions := public.fn_ca_operator_permissions(p_user_id) -> 'permissions';
  RETURN COALESCE(v_permissions ? p_permission, false);
END
$fn$;

ALTER FUNCTION public.fn_ca_operator_has_permission(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_ca_operator_has_permission(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_has_permission(uuid, text)
  TO authenticated, service_role;

-- All Hand Review read RPCs already call this helper. Preserve its no-argument
-- caller contract and widen only through the canonical fleet.read permission.
CREATE OR REPLACE FUNCTION public.fn_is_horse_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT public.fn_ca_operator_has_permission(auth.uid(), 'fleet.read');
$fn$;

ALTER FUNCTION public.fn_is_horse_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_is_horse_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_horse_admin() TO authenticated, service_role;

-- Preserve every installed function body byte-for-byte except its duplicated
-- legacy role predicate. The exact regprocedure signatures make overload drift
-- fatal. The security, identity and role-vocabulary preflight makes a changed
-- function fatal rather than attempting a best-effort rewrite.
DO $phase9$
DECLARE
  r record;
  v_oid oid;
  v_before text;
  v_after text;
  v_permission_literal text;
  v_identity text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_home_content_report_detail(uuid,uuid)', 'players.read', 'p_caller_user_id'),
      ('public.list_home_content_reports(uuid,text,text,integer,integer)', 'players.read', 'p_caller_user_id'),
      ('public.resolve_home_content_report(uuid,text,text,uuid)', 'moderation.write', 'p_caller_user_id'),
      ('public.fn_get_home_games_onboarding_status_admin(uuid,uuid)', 'players.read', 'p_caller_user_id'),
      ('public.fn_anonymize_hg_user_content(uuid,uuid)', 'gdpr.erase', 'p_requested_by'),
      ('public.list_home_ban_appeals_admin(uuid,text,uuid,integer,integer)', 'players.read', 'p_caller_user_id'),
      ('public.review_home_ban_appeal(uuid,text,text,uuid)', 'moderation.write', 'p_caller_user_id')
    ) AS x(signature, permission, identity_argument)
  LOOP
    v_oid := to_regprocedure(r.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Phase 9 expected %, but that exact function is missing', r.signature;
    END IF;
    IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
      RAISE EXCEPTION 'Phase 9 refuses to rewrite % because it is not SECURITY DEFINER', r.signature;
    END IF;

    v_before := pg_get_functiondef(v_oid);
    IF position('auth.uid()' IN v_before) = 0
       OR position('admin' IN v_before) = 0
       OR position('superadmin' IN v_before) = 0
       OR position('god' IN v_before) = 0 THEN
      RAISE EXCEPTION 'Phase 9 gate preflight failed for %', r.signature;
    END IF;

    v_permission_literal := quote_literal(r.permission);
    v_identity := quote_ident(r.identity_argument);
    v_after := v_before;

    -- IF v_role NOT IN ('admin','superadmin','god') ...
    v_after := regexp_replace(
      v_after,
      '[A-Za-z_][A-Za-z0-9_.]*[[:space:]]+NOT[[:space:]]+IN[[:space:]]*\\([[:space:]]*''(admin|superadmin|god)''[[:space:]]*,[[:space:]]*''(admin|superadmin|god)''[[:space:]]*,[[:space:]]*''(admin|superadmin|god)''[[:space:]]*\\)',
      'NOT public.fn_ca_operator_has_permission(' || v_identity || ', ' || v_permission_literal || ')',
      'gi'
    );

    -- WHERE id = caller AND role IN (...), including qualified role columns.
    v_after := regexp_replace(
      v_after,
      '[A-Za-z_][A-Za-z0-9_.]*role[[:space:]]+IN[[:space:]]*\\([[:space:]]*''(admin|superadmin|god)''[[:space:]]*,[[:space:]]*''(admin|superadmin|god)''[[:space:]]*,[[:space:]]*''(admin|superadmin|god)''[[:space:]]*\\)',
      'public.fn_ca_operator_has_permission(' || v_identity || ', ' || v_permission_literal || ')',
      'gi'
    );

    -- Some installed definitions use the array spelling.
    v_after := regexp_replace(
      v_after,
      '[A-Za-z_][A-Za-z0-9_.]*role[[:space:]]*=[[:space:]]*ANY[[:space:]]*\\([[:space:]]*ARRAY\\[[^]]*''admin''[^]]*''superadmin''[^]]*''god''[^]]*\\][[:space:]]*\\)',
      'public.fn_ca_operator_has_permission(' || v_identity || ', ' || v_permission_literal || ')',
      'gi'
    );

    -- A few Home Games functions use the existing zero-argument legacy
    -- helper instead of spelling out the role list.
    v_after := replace(
      v_after,
      'public.fn_is_platform_admin()',
      'public.fn_ca_operator_has_permission(' || v_identity || ', ' || v_permission_literal || ')'
    );
    v_after := replace(
      v_after,
      'fn_is_platform_admin()',
      'public.fn_ca_operator_has_permission(' || v_identity || ', ' || v_permission_literal || ')'
    );

    IF v_after = v_before THEN
      RAISE EXCEPTION 'Phase 9 found no reviewed legacy gate to replace in %', r.signature;
    END IF;
    IF position('fn_ca_operator_has_permission' IN v_after) = 0 THEN
      RAISE EXCEPTION 'Phase 9 replacement is absent from %', r.signature;
    END IF;

    EXECUTE v_after;
  END LOOP;
END
$phase9$;

DO $assert$
DECLARE
  r record;
  v_def text;
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.fn_ca_operator_has_permission(uuid,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_ca_operator_has_permission';
  END IF;
  IF has_function_privilege('anon', 'public.fn_ca_operator_has_permission(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute fn_ca_operator_has_permission';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_home_content_report_detail(uuid,uuid)'),
      ('public.list_home_content_reports(uuid,text,text,integer,integer)'),
      ('public.resolve_home_content_report(uuid,text,text,uuid)'),
      ('public.fn_get_home_games_onboarding_status_admin(uuid,uuid)'),
      ('public.fn_anonymize_hg_user_content(uuid,uuid)'),
      ('public.list_home_ban_appeals_admin(uuid,text,uuid,integer,integer)'),
      ('public.review_home_ban_appeal(uuid,text,text,uuid)')
    ) AS x(signature)
  LOOP
    SELECT pg_get_functiondef(to_regprocedure(r.signature)) INTO v_def;
    IF position('fn_ca_operator_has_permission' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Post-apply gate missing from %', r.signature;
    END IF;
  END LOOP;
END
$assert$;

COMMIT;
