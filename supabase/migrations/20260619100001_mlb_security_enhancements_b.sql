-- ===================================================================
-- MLB Analytics Engine — Security Enhancements (Section B)
-- ===================================================================

-- B1) Transition views from SECURITY DEFINER (default) to SECURITY INVOKER
-- The advisor flagged 13 views. We dynamically transition all views in the public schema
-- that are currently using the default (SECURITY DEFINER) to SECURITY INVOKER.
DO $$ 
DECLARE
  v record;
BEGIN
  FOR v IN 
    SELECT c.oid::regclass::text AS view_name
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'v' 
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(c.reloptions) opt WHERE opt ILIKE 'security_invoker=true'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = true);', v.view_name);
    EXCEPTION WHEN insufficient_privilege THEN
      -- PostGIS views like geography_columns are owned by the system
      RAISE NOTICE 'Skipping % due to insufficient privileges', v.view_name;
    END;
  END LOOP;
END $$;

-- B2) RLS Initplan Optimization
-- Wrap auth.uid() in a subselect for pred_bet_log, user_bets, user_portfolio, and pipeline_runs.
DO $$ 
DECLARE
  pol record;
  new_qual text;
  new_with_check text;
BEGIN
  FOR pol IN 
    SELECT p.polname, c.relname,
           pg_get_expr(p.polqual, p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON p.polrelid = c.oid
    WHERE c.relname IN ('pred_bet_log', 'user_bets', 'user_portfolio', 'pipeline_runs')
  LOOP
    new_qual := replace(pol.qual, 'auth.uid()', '(SELECT auth.uid())');
    new_with_check := replace(pol.with_check, 'auth.uid()', '(SELECT auth.uid())');
    
    IF pol.qual IS NOT NULL AND pol.qual LIKE '%auth.uid()%' AND pol.qual NOT LIKE '%(SELECT auth.uid())%' THEN
      EXECUTE format('ALTER POLICY %I ON %I USING (%s);', pol.polname, pol.relname, new_qual);
    END IF;
    
    IF pol.with_check IS NOT NULL AND pol.with_check LIKE '%auth.uid()%' AND pol.with_check NOT LIKE '%(SELECT auth.uid())%' THEN
      EXECUTE format('ALTER POLICY %I ON %I WITH CHECK (%s);', pol.polname, pol.relname, new_with_check);
    END IF;
  END LOOP;
END $$;

-- B4) Pin Function search_paths
-- Apply search_path = public, pg_temp to all SECURITY DEFINER functions in public schema.
DO $$ 
DECLARE
  f record;
BEGIN
  FOR f IN 
    SELECT n.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS conf WHERE conf ILIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp;', 
                     f.schema_name, f.function_name, f.arguments);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping % due to insufficient privileges', f.function_name;
    END;
  END LOOP;
END $$;
