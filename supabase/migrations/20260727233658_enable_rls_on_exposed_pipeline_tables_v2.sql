-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727233658_enable_rls_on_exposed_pipeline_tables_v2.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- 2026-07-27 security: eleven public tables had RLS switched off entirely while
-- anon held SELECT + INSERT + UPDATE + DELETE. Anyone holding the publishable
-- key could read or rewrite them through PostgREST; for solver/simulation state
-- that is a direct path to poisoning grading and model output.
--
-- Verified before enabling: none is referenced in Smarter-Poker-World-Hub,
-- club-arena (the browser SPA), or smarter-poker-workers. They are populated by
-- service-role pipelines, and the service role bypasses RLS, so enabling RLS
-- with no policy is fail-closed for untrusted callers and a no-op for the
-- pipelines. Same pattern as commander_admin_pins.
--
-- NOTE: privileges here are held by PUBLIC, which anon and authenticated merely
-- inherit — revoking from `anon` alone is a silent no-op.

do $$
declare t text; failed text := '';
begin
  foreach t in array array[
    'solver_status','solver_manifest','solver_pipeline',
    'sp_pending_family_cache','sp_combo_class','bet_type_reliability',
    'sim_baseline_compare','sim_bet_grade_summary','sim_equity_daily',
    'sim_market_summary','sim_risk_metrics'
  ] loop
    begin
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
    exception when others then
      failed := failed || t || ' (' || sqlerrm || '); ';
    end;
  end loop;
  if failed <> '' then raise exception 'could not secure: %', failed; end if;
end $$;

-- spatial_ref_sys is owned by the PostGIS extension. It is public EPSG
-- reference data and must stay readable, but anon holding write privileges
-- means the coordinate lookups behind every geo feature could be corrupted.
-- Best-effort: if we do not own it, report rather than fail the migration.
do $$
begin
  revoke insert, update, delete, truncate on table public.spatial_ref_sys from public, anon, authenticated;
  raise notice 'spatial_ref_sys writes revoked';
exception when others then
  raise notice 'spatial_ref_sys not modifiable by this role (extension-owned): %', sqlerrm;
end $$;

-- Post-conditions: the eleven application tables are the hard requirement.
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity = false
    and c.relname in ('solver_status','solver_manifest','solver_pipeline',
                      'sp_pending_family_cache','sp_combo_class','bet_type_reliability',
                      'sim_baseline_compare','sim_bet_grade_summary','sim_equity_daily',
                      'sim_market_summary','sim_risk_metrics');
  if bad is not null then raise exception 'RLS still disabled on: %', bad; end if;

  select string_agg(c.relname, ', ') into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind='r'
    and c.relname in ('solver_status','solver_manifest','solver_pipeline',
                      'sp_pending_family_cache','sp_combo_class','bet_type_reliability',
                      'sim_baseline_compare','sim_bet_grade_summary','sim_equity_daily',
                      'sim_market_summary','sim_risk_metrics')
    and has_table_privilege('anon', c.oid, 'INSERT');
  if bad is not null then raise exception 'anon can still INSERT into: %', bad; end if;
end $$;
