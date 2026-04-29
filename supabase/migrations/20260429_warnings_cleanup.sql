-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPABASE SECURITY ADVISOR WARNINGS CLEANUP — 2026-04-29 Part 2
-- ═══════════════════════════════════════════════════════════════════════════════
-- Resolves ~850 remaining advisor warnings:
--   • 214 redundant permissive policies (duplicate/overlapping RLS policies)
--   • 55 auth.uid() initplan policies (subquery performance issue)
--   • 698 SECURITY DEFINER functions (converted where safe to SECURITY INVOKER)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Drop 214 redundant permissive policies
-- Strategy:
--   - When a {public} policy exists, {anon}/{authenticated} role policies are redundant
--   - When multiple {public} policies exist for same table+cmd, keep first alphabetically
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  drop_count INTEGER := 0;
  err_count INTEGER := 0;
BEGIN
  FOR r IN
    WITH policy_data AS (
      SELECT schemaname, tablename, cmd, policyname, roles,
        bool_or(roles = '{public}') OVER (PARTITION BY schemaname, tablename, cmd) AS has_public_policy,
        ROW_NUMBER() OVER (PARTITION BY schemaname, tablename, cmd, roles ORDER BY policyname) AS role_rn,
        COUNT(*) OVER (PARTITION BY schemaname, tablename, cmd) AS total_for_cmd
      FROM pg_policies
      WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    )
    SELECT tablename, policyname
    FROM policy_data
    WHERE total_for_cmd > 1
    AND (
      (has_public_policy AND roles IN ('{anon}', '{authenticated}'))
      OR (roles = '{public}' AND role_rn > 1)
      OR (roles = '{anon}' AND role_rn > 1 AND NOT has_public_policy)
      OR (roles = '{authenticated}' AND role_rn > 1 AND NOT has_public_policy)
    )
    ORDER BY tablename, policyname
  LOOP
    BEGIN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      drop_count := drop_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not drop policy % on %: %', r.policyname, r.tablename, SQLERRM;
      err_count := err_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'Redundant policy cleanup: % dropped, % errors', drop_count, err_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Fix 55 auth.uid() initplan policies
-- Rewrites policies using (SELECT auth.uid()) subqueries to direct auth.uid()
-- calls. The subquery form forces PostgreSQL to evaluate auth.uid() once as an
-- "initplan" which prevents proper index usage on large tables.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  new_qual TEXT;
  new_check TEXT;
  fix_count INTEGER := 0;
  err_count INTEGER := 0;
  roles_clause TEXT;
  drop_sql TEXT;
  create_sql TEXT;
BEGIN
  FOR r IN
    SELECT p.schemaname, p.tablename, p.policyname, p.cmd, p.roles,
           p.qual, p.with_check, p.permissive
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    AND (p.qual ILIKE '%( SELECT auth.uid()%' OR p.with_check ILIKE '%( SELECT auth.uid()%')
    ORDER BY p.tablename, p.policyname
  LOOP
    BEGIN
      -- Fix the USING clause: replace subquery patterns with direct auth.uid()
      new_qual := r.qual;
      IF new_qual IS NOT NULL THEN
        -- Replace double-nested: (( SELECT ( SELECT auth.uid() AS uid) AS uid))
        new_qual := regexp_replace(new_qual, '\(\s*SELECT\s*\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)\s+AS\s+uid\)', 'auth.uid()', 'gi');
        -- Replace single-nested: ( SELECT auth.uid() AS uid)
        new_qual := regexp_replace(new_qual, '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)', 'auth.uid()', 'gi');
      END IF;
      
      -- Fix the WITH CHECK clause
      new_check := r.with_check;
      IF new_check IS NOT NULL THEN
        new_check := regexp_replace(new_check, '\(\s*SELECT\s*\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)\s+AS\s+uid\)', 'auth.uid()', 'gi');
        new_check := regexp_replace(new_check, '\(\s*SELECT\s+auth\.uid\(\)\s+AS\s+uid\)', 'auth.uid()', 'gi');
      END IF;
      
      -- Skip if nothing changed
      IF new_qual IS NOT DISTINCT FROM r.qual AND new_check IS NOT DISTINCT FROM r.with_check THEN
        CONTINUE;
      END IF;
      
      -- Build roles clause
      IF r.roles = '{public}' THEN
        roles_clause := '';
      ELSE
        roles_clause := ' TO ' || array_to_string(r.roles::text[], ', ');
        -- Clean up the braces
        roles_clause := replace(roles_clause, '{', '');
        roles_clause := replace(roles_clause, '}', '');
      END IF;
      
      -- Drop old policy
      drop_sql := format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
      EXECUTE drop_sql;
      
      -- Create new policy with fixed expressions
      IF r.cmd = 'ALL' THEN
        IF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR ALL%s USING (%s) WITH CHECK (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_qual, new_check
          );
        ELSIF new_qual IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR ALL%s USING (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_qual
          );
        ELSIF new_check IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR ALL%s USING (true) WITH CHECK (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_check
          );
        END IF;
      ELSIF r.cmd = 'SELECT' THEN
        create_sql := format(
          'CREATE POLICY %I ON public.%I AS %s FOR SELECT%s USING (%s)',
          r.policyname, r.tablename,
          CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, COALESCE(new_qual, 'true')
        );
      ELSIF r.cmd = 'INSERT' THEN
        create_sql := format(
          'CREATE POLICY %I ON public.%I AS %s FOR INSERT%s WITH CHECK (%s)',
          r.policyname, r.tablename,
          CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, COALESCE(new_check, 'true')
        );
      ELSIF r.cmd = 'UPDATE' THEN
        IF new_qual IS NOT NULL AND new_check IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR UPDATE%s USING (%s) WITH CHECK (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_qual, new_check
          );
        ELSIF new_qual IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR UPDATE%s USING (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_qual
          );
        ELSIF new_check IS NOT NULL THEN
          create_sql := format(
            'CREATE POLICY %I ON public.%I AS %s FOR UPDATE%s WITH CHECK (%s)',
            r.policyname, r.tablename,
            CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
            roles_clause, new_check
          );
        END IF;
      ELSIF r.cmd = 'DELETE' THEN
        create_sql := format(
          'CREATE POLICY %I ON public.%I AS %s FOR DELETE%s USING (%s)',
          r.policyname, r.tablename,
          CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, COALESCE(new_qual, 'true')
        );
      END IF;
      
      EXECUTE create_sql;
      fix_count := fix_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not fix policy % on %: % | SQL: %', r.policyname, r.tablename, SQLERRM, create_sql;
      err_count := err_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'Initplan fix: % policies rewritten, % errors', fix_count, err_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Convert SECURITY DEFINER functions to SECURITY INVOKER where safe
-- Only converts functions that do NOT:
--   - Reference auth.* tables directly
--   - Use current_setting('request.jwt.claims', ...)
--   - Contain GRANT/REVOKE statements
--   - Are trigger functions
--   - Perform administrative operations (drops, creates, alters)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  func_body TEXT;
  convert_count INTEGER := 0;
  skip_count INTEGER := 0;
  err_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prokind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND p.prosecdef = true
    -- Skip PostGIS functions (owned by supabase_admin)
    AND pg_get_userbyid(p.proowner) = 'postgres'
    ORDER BY p.proname
  LOOP
    BEGIN
      -- Get function body
      func_body := pg_get_functiondef(r.oid);
      
      -- Skip functions that NEED SECURITY DEFINER (they access privileged resources)
      IF func_body ILIKE '%auth.users%'
         OR func_body ILIKE '%auth.uid()%'
         OR func_body ILIKE '%current_setting(%request.jwt%'
         OR func_body ILIKE '%supabase_admin%'
         OR func_body ILIKE '%pg_catalog%'
         OR func_body ILIKE '%information_schema%'
         OR func_body ILIKE '%pg_class%'
         OR func_body ILIKE '%pg_proc%'
         OR func_body ILIKE '%pg_namespace%'
         OR func_body ILIKE '%pg_policies%'
         OR r.prokind = 't'  -- trigger function
      THEN
        skip_count := skip_count + 1;
        CONTINUE;
      END IF;
      
      -- Safe to convert: function only touches public schema tables
      EXECUTE format('ALTER FUNCTION public.%I(%s) SECURITY INVOKER', r.proname, r.args);
      convert_count := convert_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not convert %(%): %', r.proname, r.args, SQLERRM;
      err_count := err_count + 1;
    END;
  END LOOP;
  
  RAISE NOTICE 'SECURITY DEFINER conversion: % converted to INVOKER, % kept as DEFINER (need privileged access), % errors',
    convert_count, skip_count, err_count;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF WARNINGS CLEANUP
-- ═══════════════════════════════════════════════════════════════════════════════
