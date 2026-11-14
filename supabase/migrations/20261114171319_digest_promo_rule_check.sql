-- 20261114171319_digest_promo_rule_check
--
-- TIER 1: replaces the read-only, service-only report fn_sp_digest_promo_chips
-- (installed 20261114163728). No wallet, ledger or table is written.
--
-- Asked by Dan, 2026-11-14 11:04 Central: "how do we insure users never get
-- promo chips they aren't supposed to." Migrations 20261114163112 (run
-- selection) and 20261114171206 (ledger write guard) prevent Welcome Back
-- Chips reaching a funded player. This is the independent daily check that
-- would show it if anything ever got past them. The report now also returns
-- 'violation_count' and 'violations' for the Chicago day:
--   * welcome_back_after_chips: a Welcome Back payment to a player who had
--     already been credited chips before it;
--   * duplicate_automated_promo: the same automated campaign (same note) paid
--     to the same player in the same club more than once, with a payment that
--     day. Keyed by club because the weekly horse distribution pays each
--     (club, horse) pair once by design (owner rule 2026-11-02).
-- The World Hub digest shows a Promo Rule Check row in the Daily Update and
-- raises a Needs Your Attention item when any violation exists.
--
-- Measured on production before install: 2026-11-13 reports MeepMeep;
-- 2026-11-04 reports 14 welcome-back violations; 2026-11-02 (weekly per-club
-- distribution) reports none. The violation queries add about 15 ms.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_sp_digest_promo_chips(p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_s timestamptz := p_day::timestamp AT TIME ZONE 'America/Chicago';
  v_e timestamptz := (p_day + 1)::timestamp AT TIME ZONE 'America/Chicago';
  -- Smarter.Poker Official: the actor chip_ledger records for platform jobs
  -- (weekly promo distribution, welcome-back, leaderboards, settlements).
  v_official uuid := '2d1cd6c3-5700-4af9-a271-d4863fdab20d';
BEGIN
  RETURN (
  WITH legs AS MATERIALIZED (
    -- Every promo-funded chip credit that landed in a player wallet this
    -- Chicago day: sent from an agent's or a club's promo wallet, paid from a
    -- union promo wallet (any category), or a leaderboard prize.
    SELECT l.created_at, l.category, l.from_type, l.from_label, l.from_entity_id,
           l.to_entity_id, l.amount, l.performed_by, l.club_id
      FROM public.chip_ledger l
     WHERE l.created_at >= v_s AND l.created_at < v_e
       AND l.club_id IS NOT NULL AND l.to_type = 'player_wallet' AND l.amount > 0
       AND (l.category IN ('promo_send', 'promo', 'leaderboard_payout')
            OR l.from_type = 'promo_wallet'
            OR l.from_label IN ('union_wallets.promo_wallet', 'clubs.promo_wallet', 'clubs.promo_balance'))
  ), classed AS MATERIALIZED (
    SELECT g.*,
      -- A person pressed send: an agent or club promo wallet, or a union promo
      -- wallet send recorded under a real account. Everything else is a
      -- platform job.
      (g.from_type = 'promo_wallet'
        OR (g.category = 'promo' AND g.performed_by IS NOT NULL AND g.performed_by <> v_official)) AS by_person,
      CASE WHEN g.from_type = 'promo_wallet' THEN COALESCE(g.performed_by, g.from_entity_id)
           ELSE g.performed_by END AS sender_id,
      CASE WHEN g.from_type = 'promo_wallet' AND g.from_label IN ('clubs.promo_balance', 'clubs.promo_wallet') THEN 'Club Promo Wallet'
           WHEN g.from_type = 'promo_wallet' THEN 'Agent Promo Wallet'
           ELSE 'Union Promo Wallet' END AS source,
      CASE
        WHEN g.category = 'promo' THEN COALESCE((
          SELECT NULLIF(btrim(split_part(split_part(ct.notes, ' - ', 1), ':', 1)), '')
            FROM public.chip_transactions ct
           WHERE ct.transaction_type = 'promo_disbursement' AND ct.to_user_id = g.to_entity_id
             AND ct.created_at = g.created_at AND ct.amount = g.amount
           LIMIT 1), 'Union Promo Disbursement')
        WHEN g.category = 'wheel_prize' THEN 'Diamond Spins Wheel Prizes'
        WHEN g.category = 'plinko_prize' THEN 'Diamond Spins Plinko Prizes'
        WHEN g.category = 'crash_prize' THEN 'Diamond Crash Prizes'
        WHEN g.category = 'mines_prize' THEN 'Diamond Mines Prizes'
        WHEN g.category = 'crossing_prize' THEN 'Diamond Crossing Prizes'
        WHEN g.category = 'leaderboard_payout' THEN 'Leaderboard Payouts'
        ELSE initcap(replace(g.category, '_', ' ')) || ' (Promo Wallet)'
      END AS system
    FROM legs g
  ), named AS MATERIALIZED (
    SELECT c.*,
           COALESCE(rp.username, 'Player ' || left(c.to_entity_id::text, 8)) AS recipient,
           COALESCE(rp.is_horse, false) AS recipient_horse,
           COALESCE(sp.username, 'Account ' || left(c.sender_id::text, 8)) AS sender,
           cl.name AS club
      FROM classed c
      LEFT JOIN public.profiles rp ON rp.id = c.to_entity_id
      LEFT JOIN public.profiles sp ON sp.id = c.sender_id
      LEFT JOIN public.clubs cl ON cl.id = c.club_id
  ), agent_pairs AS (
    SELECT sender_id, sender, to_entity_id, recipient, recipient_horse,
           round(sum(amount), 2) AS amount, count(*) AS sends,
           string_agg(DISTINCT club, ', ') AS clubs, string_agg(DISTINCT source, ', ') AS sources
      FROM named WHERE by_person
     GROUP BY sender_id, sender, to_entity_id, recipient, recipient_horse
  ), agents AS (
    SELECT sender, round(sum(amount), 2) AS total, sum(sends) AS sends, count(*) AS players,
           jsonb_agg(jsonb_build_object('player', recipient, 'horse', recipient_horse, 'amount', amount,
                     'sends', sends, 'club', clubs, 'source', sources) ORDER BY amount DESC, recipient) AS recipients
      FROM agent_pairs GROUP BY sender_id, sender
  ), auto_pairs AS (
    SELECT system, to_entity_id, recipient, recipient_horse, round(sum(amount), 2) AS amount, count(*) AS sends
      FROM named WHERE NOT by_person
     GROUP BY system, to_entity_id, recipient, recipient_horse
  ), wb_after_chips AS (
    -- Welcome Back Chips paid this day to a player who had already been
    -- credited chips before the payment (Dan, 2026-11-14: never allowed).
    SELECT w.to_user_id, w.club_id, w.amount, w.created_at, w.notes
      FROM public.chip_transactions w
     WHERE w.transaction_type = 'promo_disbursement'
       AND w.created_at >= v_s AND w.created_at < v_e AND w.to_user_id IS NOT NULL
       AND w.metadata ->> 'op_id' = md5('signup-welcome-back:' || w.to_user_id::text)::uuid::text
       AND (EXISTS (SELECT 1 FROM public.chip_transactions ct
                     WHERE ct.to_user_id = w.to_user_id AND ct.amount > 0 AND ct.created_at < w.created_at)
            OR EXISTS (SELECT 1 FROM public.chip_ledger l
                        WHERE l.to_entity_id = w.to_user_id AND l.to_type = 'player_wallet'
                          AND l.amount > 0 AND l.created_at < w.created_at))
  ), dup_auto AS (
    -- The same automated promo (same campaign note) paid to the same player
    -- in the same club more than once, with at least one payment this day.
    -- Keyed by club because the weekly horse distribution pays each
    -- (club, horse) pair once by design.
    SELECT d.to_user_id, d.club_id, d.notes, count(*) AS times, round(sum(d.amount), 2) AS amount, max(d.created_at) AS created_at
      FROM public.chip_transactions d
     WHERE d.transaction_type = 'promo_disbursement' AND d.from_user_id IS NULL AND d.to_user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.chip_transactions t
                    WHERE t.transaction_type = 'promo_disbursement' AND t.from_user_id IS NULL
                      AND t.to_user_id = d.to_user_id AND t.club_id IS NOT DISTINCT FROM d.club_id AND t.notes = d.notes
                      AND t.created_at >= v_s AND t.created_at < v_e)
     GROUP BY d.to_user_id, d.club_id, d.notes
    HAVING count(*) > 1
  ), violations AS (
    SELECT 'welcome_back_after_chips' AS rule, x.to_user_id, x.club_id, x.amount, x.created_at,
           'Welcome Back Chips paid to a player who had already received chips' AS detail
      FROM wb_after_chips x
    UNION ALL
    SELECT 'duplicate_automated_promo', y.to_user_id, y.club_id, y.amount, y.created_at,
           format('%s paid %s times', y.notes, y.times)
      FROM dup_auto y
  ), systems AS (
    SELECT system, round(sum(amount), 2) AS total, sum(sends) AS sends, count(*) AS players,
           count(*) FILTER (WHERE recipient_horse) AS horses,
           jsonb_agg(jsonb_build_object('player', recipient, 'horse', recipient_horse, 'amount', amount, 'sends', sends)
                     ORDER BY amount DESC, recipient) AS recipients
      FROM auto_pairs GROUP BY system
  )
  SELECT jsonb_build_object(
    'day', p_day,
    'window_start', v_s, 'window_end', v_e,
    'total', COALESCE((SELECT round(sum(amount), 2) FROM named), 0),
    'sends', (SELECT count(*) FROM named),
    'recipients', (SELECT count(DISTINCT to_entity_id) FROM named),
    'agent_total', COALESCE((SELECT round(sum(amount), 2) FROM named WHERE by_person), 0),
    'agent_sends', (SELECT count(*) FROM named WHERE by_person),
    'agent_recipients', (SELECT count(DISTINCT to_entity_id) FROM named WHERE by_person),
    'agents', COALESCE((SELECT jsonb_agg(jsonb_build_object('agent', sender, 'total', total, 'sends', sends,
                          'players', players, 'recipients', recipients) ORDER BY total DESC, sender) FROM agents), '[]'::jsonb),
    'automated_total', COALESCE((SELECT round(sum(amount), 2) FROM named WHERE NOT by_person), 0),
    'automated_sends', (SELECT count(*) FROM named WHERE NOT by_person),
    'automated_recipients', (SELECT count(DISTINCT to_entity_id) FROM named WHERE NOT by_person),
    'systems', COALESCE((SELECT jsonb_agg(jsonb_build_object('system', system, 'total', total, 'sends', sends,
                          'players', players, 'horses', horses, 'recipients', recipients) ORDER BY total DESC, system) FROM systems), '[]'::jsonb),
    'violation_count', (SELECT count(*) FROM violations),
    'violations', COALESCE((SELECT jsonb_agg(jsonb_build_object('rule', v.rule,
                          'player', COALESCE(vp.username, 'Player ' || left(v.to_user_id::text, 8)),
                          'horse', COALESCE(vp.is_horse, false), 'club', vc.name, 'amount', v.amount,
                          'at', v.created_at, 'detail', v.detail) ORDER BY v.created_at, v.rule)
                      FROM violations v
                      LEFT JOIN public.profiles vp ON vp.id = v.to_user_id
                      LEFT JOIN public.clubs vc ON vc.id = v.club_id), '[]'::jsonb)
  ));
END
$function$;

REVOKE ALL ON FUNCTION public.fn_sp_digest_promo_chips(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_promo_chips(date) TO service_role;

COMMENT ON FUNCTION public.fn_sp_digest_promo_chips(date) IS
  'Daily digest: promo-funded chip credits to player wallets for one Chicago day, agent to player and by automated system, plus promo rule violations (Dan, 2026-11-14). Read-only, service_role only.';

DO $verify$
DECLARE r jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.fn_sp_digest_promo_chips(date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_digest_promo_chips(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'promo chips report is not service-only';
  END IF;
  r := public.fn_sp_digest_promo_chips('2026-11-13');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'violations') v
                  WHERE v->>'rule' = 'welcome_back_after_chips' AND v->>'player' = 'MeepMeep') THEN
    RAISE EXCEPTION 'rule check misses MeepMeep on 2026-11-13: %', r->'violations';
  END IF;
  IF (r->>'total')::numeric <> (r->>'agent_total')::numeric + (r->>'automated_total')::numeric THEN
    RAISE EXCEPTION 'agent and automated totals do not add up to the total';
  END IF;
END $verify$;

COMMIT;
