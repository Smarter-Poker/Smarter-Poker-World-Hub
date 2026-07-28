-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728000459_revoke_anon_execute_on_unauthenticated_definer_functions.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Remove `anon` EXECUTE from SECURITY DEFINER functions that carry no
-- internal identity check.
--
-- 24 SECURITY DEFINER functions in `public` were executable by `anon` and
-- contained no reference to auth.uid(), auth.jwt(), auth.role() or the
-- request JWT. Because they are DEFINER, each runs with the owner's
-- privileges and RLS does not constrain it. Every one is published at
-- /rest/v1/rpc/<name>, so anybody holding the publishable key could call
-- them with no session at all.
--
-- Each was triaged against its real call sites across
-- Smarter-Poker-World-Hub, club-arena and smarter-poker-commander before
-- anything was changed. Three outcomes:
--
--   (a) revoke PUBLIC/anon, KEEP `authenticated` — money and club
--       operations that the club-arena Vite SPA genuinely invokes from the
--       browser with a logged-in session (src/lib/supabase.ts builds a
--       normal anon-key client, so a signed-in caller arrives as
--       `authenticated`). Revoking `authenticated` would break live
--       functionality; revoking `anon` costs nothing.
--   (b) revoke PUBLIC/anon/authenticated outright — server-only helpers
--       and trigger functions with no browser caller at all.
--   (c) left alone — genuinely public reads, verified below.
--
-- Note on mechanics: Postgres grants EXECUTE on every new function to
-- PUBLIC, and `anon` merely inherits it. `REVOKE ... FROM anon` on its own
-- is a silent no-op in that situation. Every revoke below names `public`
-- first for that reason.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── (a) Browser-invoked, keep `authenticated` ───────────────────────────
-- fn_bbj_promo_payout_atomic  — pays a bad-beat-jackpot pool out to an
--   arbitrary array of recipient user ids. Anonymously callable, this was
--   a direct mint. Caller: club-arena src/services/BBJService.ts:514.
-- fn_member_leave_to_treasury — sweeps a departing member's club balance.
--   Caller: club-arena src/services/ClubsService.ts:391.
-- fn_generate_credit_invoice / fn_generate_all_credit_invoices — create
--   agent debt records. Callers: CreditService.ts:360,
--   FinancialCronService.ts:214.
-- fn_sync_tournament_chips — rewrites chip counts for a whole tournament
--   from a jsonb payload. Caller: club-arena server/src/GameServer.ts:2257.
REVOKE EXECUTE ON FUNCTION public.fn_bbj_promo_payout_atomic(uuid, numeric, uuid[], text, text)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_bbj_promo_payout_atomic(uuid, numeric, uuid[], text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_member_leave_to_treasury(uuid, uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_member_leave_to_treasury(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_generate_credit_invoice(uuid, timestamptz, timestamptz, numeric, timestamptz)
  FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_generate_credit_invoice(uuid, timestamptz, timestamptz, numeric, timestamptz)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_generate_all_credit_invoices(timestamptz) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_generate_all_credit_invoices(timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_sync_tournament_chips(uuid, jsonb) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.fn_sync_tournament_chips(uuid, jsonb) TO authenticated;

-- ── (b) Server-only or trigger functions — no browser caller ────────────
-- get_daily_commission_summary / sum_agent_commissions leaked club and
--   agent commission financials. Sole caller is
--   pages/api/club-arena/agent-analytics.js, which throws unless
--   SUPABASE_SERVICE_ROLE_KEY is present, so neither role is needed.
REVOKE EXECUTE ON FUNCTION public.get_daily_commission_summary(uuid, uuid, integer)
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sum_agent_commissions(uuid, uuid, timestamptz)
  FROM public, anon, authenticated;

-- fn_submit_bug_report_to_admin takes p_sender_id and trusts it, so anon
--   could file reports impersonating any user. Server-side caller only
--   (pages/api/live-help/report-bug.js).
REVOKE EXECUTE ON FUNCTION public.fn_submit_bug_report_to_admin(uuid, text, text, text, text, text)
  FROM public, anon, authenticated;

-- Trigger functions. Postgres checks EXECUTE when a trigger is CREATED,
-- not when it fires, so revoking here does not affect trigger execution.
REVOKE EXECUTE ON FUNCTION public.fn_hg_enforce_rsvp_capacity()
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_update_messenger_conversation_last_message()
  FROM public, anon, authenticated;

-- Reward/count synchronisers and tier lookups. Callers are server routes
-- (pages/api/live/gift.js, pages/api/store/diamond-transfer.js) using the
-- service role.
REVOKE EXECUTE ON FUNCTION public.fn_sync_agent_player_counts()          FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_share_streak_multiplier(uuid)  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_source_tier_available(uuid)        FROM public, anon, authenticated;

-- MLB / betting analytics. The shipping MLB routes talk to a DIFFERENT
-- Supabase project via getMlbSupabase() (nscdmxldtyszyvcxxwgr); these
-- copies in the main project have no verified caller. anon removed,
-- `authenticated` retained so that an internal dashboard reading them with
-- a user session is not silently broken.
REVOKE EXECUTE ON FUNCTION public.get_best_bets_stats(text)                        FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_best_bets_stats(text)                        TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mlb_backtest_stats()                         FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_mlb_backtest_stats()                         TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mlb_status_metrics(timestamptz, text)        FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_mlb_status_metrics(timestamptz, text)        TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_mlb_team_detail(bigint)                      FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_mlb_team_detail(bigint)                      TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_portfolio_stats(integer, text)               FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_portfolio_stats(integer, text)               TO authenticated;

-- ── (c) Deliberately left executable by `anon` ──────────────────────────
-- get_public_profile_by_username — called client-side from pages/u/[username].js
--   by logged-out visitors. It exists precisely so anon can read a
--   display-safe subset of `profiles` without SELECT on the table.
-- find_live_games_nearby — public game finder.
-- find_similar_questions  — read-only trivia/KB dedupe.
-- st_estimatedextent x3   — PostGIS internals.
-- Each is read-only and returns nothing an anonymous visitor cannot
-- already see in the product.

-- ── Post-condition ─────────────────────────────────────────────────────
DO $$
DECLARE
  leaked text := '';
  must_keep text := '';
  r record;
BEGIN
  -- nothing in the revoked set may still be anon-executable
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_bbj_promo_payout_atomic','fn_member_leave_to_treasury',
        'fn_generate_credit_invoice','fn_generate_all_credit_invoices',
        'fn_sync_tournament_chips','get_daily_commission_summary',
        'sum_agent_commissions','fn_submit_bug_report_to_admin',
        'fn_hg_enforce_rsvp_capacity','fn_update_messenger_conversation_last_message',
        'fn_sync_agent_player_counts','fn_sync_share_streak_multiplier',
        'get_source_tier_available','get_best_bets_stats','get_mlb_backtest_stats',
        'get_mlb_status_metrics','get_mlb_team_detail','get_portfolio_stats')
  LOOP
    IF has_function_privilege('anon', r.oid, 'EXECUTE') THEN
      leaked := leaked || r.proname || ' ';
    END IF;
  END LOOP;

  -- the browser-invoked set must NOT have lost `authenticated`
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'fn_bbj_promo_payout_atomic','fn_member_leave_to_treasury',
        'fn_generate_credit_invoice','fn_generate_all_credit_invoices',
        'fn_sync_tournament_chips')
  LOOP
    IF NOT has_function_privilege('authenticated', r.oid, 'EXECUTE') THEN
      must_keep := must_keep || r.proname || ' ';
    END IF;
  END LOOP;

  -- the public read must still work for logged-out visitors
  IF NOT has_function_privilege('anon', 'public.get_public_profile_by_username(text)', 'EXECUTE') THEN
    must_keep := must_keep || 'get_public_profile_by_username(anon) ';
  END IF;

  IF leaked <> '' OR must_keep <> '' THEN
    RAISE EXCEPTION 'post-condition failed. still anon-executable: [%]; lost required access: [%]', leaked, must_keep;
  END IF;
END $$;

COMMIT;
