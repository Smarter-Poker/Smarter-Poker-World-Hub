-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728000253_lock_down_security_definer_views.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Close the three remaining SECURITY DEFINER views.
--
-- A view owned by `postgres` without `security_invoker` runs its query as
-- the OWNER, so RLS on the underlying tables is bypassed for whoever
-- queries the view. All three of these were SELECT-able by `anon`, i.e.
-- readable by anyone holding the publishable key.
--
-- WHAT WAS EXPOSED:
--   * horse_hand_results  — explodes public.hand_history for every
--     non-tournament hand in the last 24 hours into per-player, per-street
--     action rows (user_id, stage, action, amount, net, net_bb). That is a
--     live feed of every cash-game player's actions, readable anonymously.
--     In a poker product this is the most damaging read in the database:
--     it is directly usable to profile and exploit opponents in real time.
--   * horse_style_performance — aggregates the above joined to
--     public.profiles, keyed by bot style.
--   * auth_health_view — aggregates public.probe_heartbeats, leaking
--     internal auth-system health (which signup/login/recovery probes are
--     failing, and when). Useful reconnaissance for timing an attack
--     against auth while it is already degraded.
--
-- VERIFIED CALLERS:
--   * auth_health_view is read in exactly two places — pages/admin/auth-health.js
--     (getServerSideProps) and pages/api/admin/auth-health-data.js — both of
--     which build their client from SUPABASE_SERVICE_ROLE_KEY.
--   * horse_hand_results and horse_style_performance have ZERO references in
--     Smarter-Poker-World-Hub, club-arena, smarter-poker-commander,
--     Poker-Engine or smarter-poker-workers. They are ad-hoc analytics views.
--   service_role bypasses RLS, so neither the invoker switch nor the revoke
--     changes anything for the legitimate readers.
--
-- Both halves of the fix are applied: `security_invoker = true` so the
-- caller's RLS applies, AND the grants are dropped. The revoke names
-- `public` explicitly — Postgres grants SELECT on a new view to the
-- owner only, but these carry inherited grants, and revoking from `anon`
-- alone is a silent no-op whenever the privilege is actually held by
-- PUBLIC.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER VIEW public.auth_health_view        SET (security_invoker = true);
ALTER VIEW public.horse_hand_results      SET (security_invoker = true);
ALTER VIEW public.horse_style_performance SET (security_invoker = true);

REVOKE ALL ON public.auth_health_view        FROM public, anon, authenticated;
REVOKE ALL ON public.horse_hand_results      FROM public, anon, authenticated;
REVOKE ALL ON public.horse_style_performance FROM public, anon, authenticated;

GRANT SELECT ON public.auth_health_view        TO service_role;
GRANT SELECT ON public.horse_hand_results      TO service_role;
GRANT SELECT ON public.horse_style_performance TO service_role;

-- Post-condition: refuse to half-apply.
DO $$
DECLARE
  v text;
  bad text := '';
BEGIN
  FOREACH v IN ARRAY ARRAY['auth_health_view','horse_hand_results','horse_style_performance']
  LOOP
    IF has_table_privilege('anon', ('public.'||v)::regclass, 'SELECT')
       OR has_table_privilege('authenticated', ('public.'||v)::regclass, 'SELECT') THEN
      bad := bad || v || ' still readable; ';
    END IF;
    IF NOT has_table_privilege('service_role', ('public.'||v)::regclass, 'SELECT') THEN
      bad := bad || v || ' lost service_role SELECT; ';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname = v
        AND c.reloptions @> ARRAY['security_invoker=true']
    ) THEN
      bad := bad || v || ' not security_invoker; ';
    END IF;
  END LOOP;

  IF bad <> '' THEN
    RAISE EXCEPTION 'post-condition failed: %', bad;
  END IF;
END $$;

COMMIT;
