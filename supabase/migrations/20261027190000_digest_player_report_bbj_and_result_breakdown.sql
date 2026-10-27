-- TIER: 1. Reporting-only RPC for the Daily Operations Digest.
-- AUTHOR: Codex. AFFECTS: fn_sp_digest_player_report(date).
-- WHY: Human BBJ contributions were omitted, net results were presented as an
-- undifferentiated won/lost amount, and installed period reporting was unwired.
-- Keep the existing authoritative cash-hand and posted tournament-leg results.
-- Net already includes pot deductions: never subtract reported rake/BBJ again.
-- Rollback: DROP FUNCTION public.fn_sp_digest_player_report(date);
BEGIN;
CREATE FUNCTION public.fn_sp_digest_player_report(p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '60s'
AS $fn$
DECLARE
  v jsonb := public.fn_sp_digest_player_period(p_day);
  s timestamptz := p_day::timestamp AT TIME ZONE 'America/Chicago';
  e timestamptz := (p_day + 1)::timestamp AT TIME ZONE 'America/Chicago';
  w timestamptz := (p_day - 6)::timestamp AT TIME ZONE 'America/Chicago';
  m timestamptz := date_trunc('month', p_day)::timestamp AT TIME ZONE 'America/Chicago';
  v_bbj jsonb; v_players jsonb; v_won numeric; v_lost numeric;
BEGIN
  IF v IS NULL OR v ? 'error' THEN RETURN v; END IF;
  -- Same posted attribution and timestamp as cash rake in the daily report.
  -- Sum attribution directly; never join one rake row to several game rows.
  WITH b AS (
    SELECT r.player_id,
      COALESCE(sum(r.bbj_attributed_contribution) FILTER (WHERE r.created_at >= s), 0) AS day,
      COALESCE(sum(r.bbj_attributed_contribution) FILTER (WHERE r.created_at >= w), 0) AS week,
      COALESCE(sum(r.bbj_attributed_contribution) FILTER (WHERE r.created_at >= m), 0) AS month
    FROM public.rake_attributions r
    JOIN smarter_private.sp_real_humans h ON h.id = r.player_id
    WHERE r.created_at >= LEAST(w, m) AND r.created_at < e
      AND r.club_id IS NOT NULL
      AND r.club_id IS DISTINCT FROM public.fn_diamond_arena_club()
    GROUP BY r.player_id
  ) SELECT jsonb_build_object(
    'players', COALESCE(jsonb_object_agg(player_id::text, round(day, 2)), '{}'::jsonb),
    'day', round(COALESCE(sum(day), 0), 2),
    'week', round(COALESCE(sum(week), 0), 2),
    'month', round(COALESCE(sum(month), 0), 2)) INTO v_bbj FROM b;

  SELECT COALESCE(jsonb_agg(x || jsonb_build_object('bbj_rake',
      COALESCE((v_bbj->'players'->>(x->>'user_id'))::numeric, 0)) ORDER BY ord), '[]'::jsonb),
    round(COALESCE(sum(GREATEST((x->>'net')::numeric, 0)), 0), 2),
    round(COALESCE(sum(GREATEST(-(x->>'net')::numeric, 0)), 0), 2)
  INTO v_players, v_won, v_lost
  FROM jsonb_array_elements(COALESCE(v->'players', '[]'::jsonb)) WITH ORDINALITY AS p(x, ord);

  v := jsonb_set(v, '{players}', v_players);
  v := jsonb_set(v, '{totals}', (v->'totals') || jsonb_build_object(
    'bbj_rake', v_bbj->'day', 'won', v_won, 'lost', v_lost));
  IF v->'period'->'day' IS NOT NULL THEN
    v := jsonb_set(v, '{period,day,bbj_rake}', v_bbj->'day');
    v := jsonb_set(v, '{period,week,bbj_rake}', v_bbj->'week');
    v := jsonb_set(v, '{period,month,bbj_rake}', v_bbj->'month');
  END IF;
  RETURN v || jsonb_build_object('result_basis',
    'Cash: completed hand payouts minus contributions. Tournaments: posted entry, rebuy and add-on debits plus prizes, bounties and refunds during the Central day. Net already includes rake and BBJ.');
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_sp_digest_player_report(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_player_report(date) TO service_role;
DO $assert$
BEGIN
  IF has_function_privilege('anon', 'public.fn_sp_digest_player_report(date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_digest_player_report(date)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_sp_digest_player_report(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'digest report access assertion failed';
  END IF;
END;
$assert$;
COMMIT;
