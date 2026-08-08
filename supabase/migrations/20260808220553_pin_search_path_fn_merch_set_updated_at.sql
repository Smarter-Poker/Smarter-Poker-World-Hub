-- Mirrored from the live database on 2026-08-08. Applied via MCP as migration 20260808220553_pin_search_path_fn_merch_set_updated_at.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- Pin the one remaining project function with a mutable search_path
-- (function_search_path_mutable advisor). Trigger function, owner postgres,
-- not extension-owned. `pg_temp` last per the documented safe ordering.
ALTER FUNCTION public.fn_merch_set_updated_at() SET search_path = public, pg_temp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='fn_merch_set_updated_at'
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'search_path was not pinned on fn_merch_set_updated_at';
  END IF;
END $$;
