-- 20261114163728_digest_promo_chips_agent_to_player_and_automated
--
-- TIER 1: one new read-only, service-only report. No wallet, ledger or
-- table is written.
--
-- OWNER REQUEST, 2026-11-14 10:19 Central, verbatim:
--   "IN THE DAILY EMAIL, IN THE FIRST SECTION, "DAILY UPDATE" I WANT TOTALS ON
--    PROMO CHIPS, HOW MANY WERE SENT AND WHO RECEIVED THEM. THIS SHOULD BE
--    BROKEN DOWN BY AGENT TO PLAYER. ANY AGENT WHO SENT PROMO CHIPS THE
--    PREVIOUS DAY, AND IF THEY DID, TO WHO AND HOW MUCH. AS WELL AS IF THERE
--    WERE ANY PROMO CHIPS SENT TO USERS BY ANY AND ALL AUTOMATED SYSTEMS."
--
-- fn_sp_digest_promo_chips(day) reads chip_ledger for the Chicago day and
-- returns every promo-funded credit to a player wallet:
--   * sent from an agent's or a club's promo wallet (from_type promo_wallet),
--   * paid from a union promo wallet under any category (union promo
--     disbursements, Diamond Spins and Diamond game prizes, settlements),
--   * leaderboard prizes.
-- A credit is an AGENT send when a person pressed send: an agent or club
-- promo wallet, or a union promo send recorded under a real account. Every
-- other credit is an AUTOMATED send, labelled by system: union disbursements
-- by the name in their chip_transactions note (Welcome Back Chips, Midway
-- Weekly Promo Distribution, ...), Diamond games by game, leaderboards.
-- Agents are listed agent to player with the amount and send count; systems
-- with every recipient. Horses are included and flagged, never filtered out
-- (CLAUDE.md 10.5). Totals are the ledger's own sums, so nothing that landed
-- is left out of them.
--
-- Read cost, measured on production before install: about 3 s for an
-- ordinary day (33 credits) and about 6 s for a Monday weekly distribution
-- (1,039 credits, 73 KB of JSON). Statement limit 30 s.
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
                          'players', players, 'horses', horses, 'recipients', recipients) ORDER BY total DESC, system) FROM systems), '[]'::jsonb)
  ));
END
$function$;

REVOKE ALL ON FUNCTION public.fn_sp_digest_promo_chips(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sp_digest_promo_chips(date) TO service_role;

COMMENT ON FUNCTION public.fn_sp_digest_promo_chips(date) IS
  'Daily digest: promo-funded chip credits to player wallets for one Chicago day, agent to player and by automated system (Dan, 2026-11-14). Read-only, service_role only.';

DO $verify$
DECLARE r jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.fn_sp_digest_promo_chips(date)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_sp_digest_promo_chips(date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'promo chips report is not service-only';
  END IF;
  -- 2026-11-13 Chicago: ChiToWnBaLLn sent Kewski 50 from his promo wallet and
  -- MeepMeep was paid 25 Welcome Back Chips. Both must be itemised.
  r := public.fn_sp_digest_promo_chips('2026-11-13');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'agents') a, jsonb_array_elements(a->'recipients') x
                  WHERE a->>'agent' = 'ChiToWnBaLLn' AND x->>'player' = 'Kewski' AND (x->>'amount')::numeric = 50) THEN
    RAISE EXCEPTION 'agent send ChiToWnBaLLn -> Kewski 50 is missing: %', r->'agents';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'systems') s, jsonb_array_elements(s->'recipients') x
                  WHERE s->>'system' = 'Welcome Back Chips' AND x->>'player' = 'MeepMeep' AND (x->>'amount')::numeric = 25) THEN
    RAISE EXCEPTION 'automated Welcome Back Chips -> MeepMeep 25 is missing: %', r->'systems';
  END IF;
  IF (r->>'total')::numeric <> (r->>'agent_total')::numeric + (r->>'automated_total')::numeric THEN
    RAISE EXCEPTION 'agent and automated totals do not add up to the total';
  END IF;
END $verify$;

COMMIT;
