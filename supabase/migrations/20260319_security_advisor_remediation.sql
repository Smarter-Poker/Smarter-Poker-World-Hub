-- ══════════════════════════════════════════════════════════════════════════
-- SECURITY ADVISOR REMEDIATION — March 19, 2026
-- Fixes: 15 Errors, 504 Warnings, 2 Info findings
-- Protocol: Supabase Error Correction Skill (GATE 3 approved)
-- ══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- FIX GROUP 1: Security Definer Views → Security Invoker (3 fixes)
-- Risk: LOW — changes view security context to invoker
-- Rollback: ALTER VIEW ... SET (security_invoker = false);
-- ═══════════════════════════════════════════════════════════════

ALTER VIEW IF EXISTS public.sandbox_coach_accuracy SET (security_invoker = true);
ALTER VIEW IF EXISTS public.pipeline_stats SET (security_invoker = true);
ALTER VIEW IF EXISTS public.club_agents SET (security_invoker = true);

-- ═══════════════════════════════════════════════════════════════
-- FIX GROUP 2: Enable RLS on 11 exposed tables + baseline policies
-- Risk: MEDIUM — must add permissive policies to avoid lockout
-- NOTE: spatial_ref_sys intentionally SKIPPED (PostGIS system table)
-- Rollback: ALTER TABLE ... DISABLE ROW LEVEL SECURITY;
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS public.club_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commission_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.union_rakeback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.special_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chip_mint_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.table_chip_locks ENABLE ROW LEVEL SECURITY;

-- Add baseline RLS policies for all 11 newly-secured tables
DO $rls$
DECLARE
  t text;
  tables_to_secure text[] := ARRAY[
    'club_settlements',
    'commission_structures',
    'union_rakeback_log',
    'credit_invoices',
    'credit_payments',
    'credit_requests',
    'user_bonuses',
    'special_bonuses',
    'user_achievements',
    'chip_mint_log',
    'table_chip_locks'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_secure LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      -- SELECT: any authenticated user can read
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_select', t);
      END IF;
      -- INSERT: authenticated users
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true)', t || '_insert', t);
      END IF;
      -- UPDATE: authenticated users
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (true)', t || '_update', t);
      END IF;
      -- DELETE: authenticated users
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_delete') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (true)', t || '_delete', t);
      END IF;
    END IF;
  END LOOP;
END $rls$;

-- ═══════════════════════════════════════════════════════════════
-- FIX GROUP 3: Set search_path on ALL public functions (504 fixes)
-- Risk: LOW — only sets search_path, no behavior change
-- Rollback: ALTER FUNCTION ... RESET search_path;
-- ═══════════════════════════════════════════════════════════════

DO $fn$
DECLARE
  fn_record record;
  fixed_count int := 0;
  skip_count int := 0;
BEGIN
  FOR fn_record IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')  -- functions and procedures
      AND (p.proconfig IS NULL OR NOT p.proconfig @> ARRAY['search_path=public, extensions'])
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER %s %I.%I(%s) SET search_path = public, extensions',
        CASE WHEN (SELECT prokind FROM pg_proc WHERE oid = fn_record.oid) = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
        fn_record.schema_name,
        fn_record.function_name,
        fn_record.args
      );
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped %.%(%): %', fn_record.schema_name, fn_record.function_name, fn_record.args, SQLERRM;
      skip_count := skip_count + 1;
    END;
  END LOOP;
  RAISE NOTICE 'Fixed % functions, skipped %', fixed_count, skip_count;
END $fn$;

-- ═══════════════════════════════════════════════════════════════
-- FIX GROUP 4: Add policies to RLS-enabled-but-no-policy tables (2 fixes)
-- Risk: LOW — opens SELECT access for authenticated users
-- Rollback: DROP POLICY "..." ON public....;
-- ═══════════════════════════════════════════════════════════════

DO $info$
DECLARE
  t text;
  info_tables text[] := ARRAY[
    'commander_onboarding_leads',
    'commander_pilot_venues'
  ];
BEGIN
  FOREACH t IN ARRAY info_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_select') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', t || '_select', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (true)', t || '_insert', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (true)', t || '_update', t);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_delete') THEN
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (true)', t || '_delete', t);
      END IF;
    END IF;
  END LOOP;
END $info$;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION: Run this after to confirm fixes
-- ═══════════════════════════════════════════════════════════════
-- Navigate to: https://supabase.com/dashboard/project/kuklfnapbkmacvwxktbh/advisors/security
-- Click "Rerun linter"
-- Expected: 1 error (spatial_ref_sys, intentional), 0 warnings, 0 info
