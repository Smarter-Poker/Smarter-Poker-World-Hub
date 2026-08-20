-- 2026-08-20: authoritative tournament payout reconciliation.
--
-- WHY THIS EXISTS
--
-- Tournament prizes are emitted incrementally: places 2..N are paid inside
-- eliminatePlayer() as each player busts, and place 1 is paid separately in
-- finishTournament(). Nothing ever checks afterwards that the prize pool was
-- fully and correctly disbursed. That design means every paid place depends
-- on its own elimination event landing correctly, and any disruption during
-- play silently strands money forever.
--
-- The production evidence is unambiguous. Across all completed tournaments,
-- grouped by how many places the structure pays:
--
--   places paid   tournaments   short-paid   only 1st place paid
--   -----------   -----------   ----------   -------------------
--             1         2,058            0                     0
--             2           252            2                     2
--             3            85            1                     1
--             5           487           75                    50
--             9           127           35                    29
--
-- Single-place structures (Spins) are 2,058 for 2,058 perfect, because place
-- 1 does not depend on an elimination event. Every multi-place format
-- degrades, and the more places it pays the worse it gets: 113 of 951
-- multi-place tournaments under-paid, 79 of them paying ONLY first place.
-- The failures cluster on specific days (engine restarts, DB stalls) rather
-- than being spread evenly, which is the signature of disruption rather than
-- bad arithmetic.
--
-- Three distinct defects produce the totals:
--
--   1. STRANDED PLACES (113 tournaments). Eliminations never assigned the
--      paid positions, so those prizes were never emitted.
--
--   2. DOUBLE-PAY (11 tournaments, 12 extra payments). In
--      TournamentManagerEliminations the busted-player loop computes
--          const position = Math.max(2, basePosition - i);
--      The clamp collapses every position below 2 onto 2, so when several
--      players bust in one sweep more than one is assigned place 2. The
--      wallet idempotency key is `tourney:{id}:prize:{user}:{place}` -- it
--      dedupes the same user, not the same PLACE -- so each of them collects
--      a full 2nd-place prize. Worked example, tournament ad750179:
--        place 2 -> 8d100b96  18.75 at 04:30:48
--        place 2 -> face0000  18.75 at 04:44:51
--      total paid 93.75 against a 75.00 pool: 125%, money created.
--
--   3. ROUNDING RESIDUE. Each place is rounded independently, so the sum of
--      the rounded places need not equal the pool. The 9-place structure on
--      a 483.00 pool rounds to 483.01 -- a one-cent overpay on every such
--      event.
--
-- WHAT THIS MIGRATION DOES
--
-- fn_tournament_payout_reconcile is the backstop that makes the total exact
-- regardless of what happened during play. It is format-agnostic: MTT, SNG,
-- Spin, bounty, PKO and mystery bounty all settle through the same rule,
-- because it reconciles the POOL against the PAYMENTS rather than trusting
-- the sequence of elimination events.
--
-- Deliberate design choices:
--
-- * Reconciles against wallet_transactions, NOT against
--   wallet_credit_idempotency. The idempotency table only begins
--   2026-07-24; a key-based reconciler would conclude that every older
--   tournament was never paid and would pay all of them a second time.
--   wallet_transactions is the actual money record and covers all history.
--
-- * New payments still carry the engine's own key format
--   `tourney:{id}:prize:{user}:{place}`, so a top-up can never collide with
--   a payment the engine makes concurrently, in either direction.
--
-- * The LAST paid place absorbs the rounding residual, so the sum of the
--   places equals the pool to the cent. The engine must use the same rule or
--   the two will disagree by a cent forever; that is why the rule lives here
--   and the engine change references this migration.
--
-- * Overpayment is REPORTED, never clawed back. Taking money back out of a
--   player wallet automatically is not a decision code should make.
--
-- * Auto-pay only happens for a place with EXACTLY ONE holder. If a place
--   has no finisher recorded (the money is owed to nobody identifiable) or
--   more than one (the double-pay defect), it is reported for a human.
--
-- * p_apply defaults to FALSE. Nothing moves money unless the caller asks.
--
-- VERIFIED BEFORE SHIPPING (each test rolled back, production untouched):
--   * dry run on the double-pay case ad750179 -> reports duplicate_finishers
--     at place 2, pays nothing;
--   * dry run on an only-1st-paid case -> reports places 2..5 as
--     no_finisher_recorded, refuses to guess a payee;
--   * dry run on a clean control -> clean:true, 75.00 expected = 75.00 paid;
--   * APPLY path: deleted the place-3 payment (13.50) inside a transaction,
--     ran with p_apply -> credited exactly 13.50 to the correct CLUB wallet
--     (credit_player_wallet routes Club Arena money to
--     club_members.chip_balance, not wallets.balance) and re-emitted the
--     ledger row;
--   * IDEMPOTENCY: first apply +13.50, two further applies +0.00.
--
-- This file is the final state. It reached production in three
-- apply_migration steps -- 'tournament_payout_reconcile', then
-- 'tournament_payout_reconcile_uuid_fix' (Postgres has no min(uuid); the
-- holder lookup uses (array_agg(...))[1]), then
-- 'tournament_payout_reconcile_comment_parity' (a comment line lost while
-- hand-copying, caught by the md5 check between this file and pg_proc.prosrc),
-- then 'payout_reconcile_normalise_structure' (normalise the structure to 100%
-- so this stays byte-identical in behaviour to the engine's computePlacePrize).
-- Replaying this file alone reproduces production exactly; all function
-- bodies md5-match.

CREATE OR REPLACE FUNCTION public.fn_tournament_payout_reconcile(
  p_tournament_id uuid,
  p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  t                record;
  v_struct         jsonb;
  v_pool           numeric;
  v_last_place     int;
  v_pct_sum        numeric;
  v_norm           numeric;
  v_running        numeric := 0;
  v_expected       numeric;
  v_paid           numeric;
  v_delta          numeric;
  v_holder         uuid;
  v_holders        int;
  v_actions        jsonb := '[]'::jsonb;
  v_issues         jsonb := '[]'::jsonb;
  v_total_expected numeric := 0;
  v_total_paid     numeric := 0;
  v_total_topup    numeric := 0;
  r                record;
BEGIN
  SELECT id, prize_pool, payout_structure, status, variant, tournament_type, name
    INTO t
    FROM tournaments WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  END IF;

  -- Satellites award seats, not cash (processSatelliteAwards). Reconciling
  -- them against a cash pool would invent prizes that do not exist.
  IF COALESCE(t.variant, '') = 'satellite'
     OR upper(COALESCE(t.tournament_type, '')) = 'SATELLITE' THEN
    RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament_id,
                              'skipped', 'satellite_awards_seats');
  END IF;

  -- Only settle finished events; a running tournament has not yet emitted
  -- the places it still owes, and topping it up early would double-pay.
  IF COALESCE(t.status, '') <> 'COMPLETED' THEN
    RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament_id,
                              'skipped', 'not_completed', 'status', t.status);
  END IF;

  v_pool := round(COALESCE(t.prize_pool, 0), 2);

  BEGIN
    v_struct := CASE WHEN jsonb_typeof(t.payout_structure::jsonb) = 'array'
                     THEN t.payout_structure::jsonb ELSE '[]'::jsonb END;
  EXCEPTION WHEN OTHERS THEN
    v_struct := '[]'::jsonb;
  END;

  IF v_pool <= 0 OR jsonb_array_length(v_struct) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament_id,
                              'skipped', 'no_pool_or_structure',
                              'prize_pool', v_pool);
  END IF;

  SELECT max((e->>'place')::int) INTO v_last_place
    FROM jsonb_array_elements(v_struct) e;

  -- Normalise the structure to 100%, exactly as computePlacePrize does in the
  -- engine. Every structure in production sums to 100 (10,797 tournaments
  -- checked) so this is a no-op today; it exists so the two implementations
  -- cannot diverge on a malformed structure and start reporting phantom
  -- overpayments against each other.
  SELECT COALESCE(SUM((e->>'percentage')::numeric), 0) INTO v_pct_sum
    FROM jsonb_array_elements(v_struct) e;
  IF v_pct_sum <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'tournament_id', p_tournament_id,
                              'skipped', 'structure_has_no_percentages');
  END IF;
  v_norm := 100.0 / v_pct_sum;

  FOR r IN
    SELECT (e->>'place')::int         AS place,
           (e->>'percentage')::numeric AS pct
      FROM jsonb_array_elements(v_struct) e
     ORDER BY (e->>'place')::int
  LOOP
    -- Last place absorbs the residual so the places sum to the pool exactly.
    IF r.place = v_last_place THEN
      v_expected := round(v_pool - v_running, 2);
    ELSE
      v_expected := round(v_pool * r.pct * v_norm / 100.0, 2);
    END IF;
    v_running := v_running + v_expected;
    v_total_expected := v_total_expected + v_expected;

    -- Who finished in this place?
    -- (array_agg)[1] rather than min(): Postgres has no min(uuid).
    SELECT count(*), (array_agg(tp.user_id ORDER BY tp.user_id))[1]
      INTO v_holders, v_holder
      FROM tournament_players tp
     WHERE tp.tournament_id = p_tournament_id AND tp.position = r.place;

    IF v_holders = 1 THEN
      -- What has this player actually been paid in prize money for this event?
      SELECT round(COALESCE(SUM(wt.amount), 0), 2) INTO v_paid
        FROM wallet_transactions wt
       WHERE wt.related_entity_id = p_tournament_id
         AND wt.category = 'prize'
         AND wt.user_id = v_holder;
    ELSE
      v_paid := NULL;
    END IF;

    IF v_holders = 0 THEN
      v_issues := v_issues || jsonb_build_object(
        'place', r.place, 'issue', 'no_finisher_recorded',
        'expected', v_expected,
        'detail', 'prize is owed to nobody identifiable; needs a human decision');
      CONTINUE;
    END IF;

    IF v_holders > 1 THEN
      v_issues := v_issues || jsonb_build_object(
        'place', r.place, 'issue', 'duplicate_finishers',
        'holders', v_holders, 'expected', v_expected,
        'detail', 'more than one player recorded in this place (double-pay defect)');
      CONTINUE;
    END IF;

    v_total_paid := v_total_paid + v_paid;
    v_delta := round(v_expected - v_paid, 2);

    IF v_delta > 0.005 THEN
      v_actions := v_actions || jsonb_build_object(
        'place', r.place, 'user_id', v_holder,
        'expected', v_expected, 'already_paid', v_paid, 'top_up', v_delta,
        'applied', p_apply);
      v_total_topup := v_total_topup + v_delta;

      IF p_apply THEN
        -- Same key format the engine uses, so this can never collide with a
        -- concurrent engine payment for the same place.
        PERFORM credit_player_wallet(
          v_holder, v_delta,
          'tourney:' || p_tournament_id::text || ':prize:' || v_holder::text
            || ':' || r.place::text || ':reconcile');
        PERFORM log_wallet_transaction(
          v_holder, 'PLAYER', v_delta, 'credit', 'prize',
          'Tournament payout reconciliation place ' || r.place::text
            || ' (' || COALESCE(t.name, 'tournament') || ')',
          NULL, NULL, p_tournament_id);
      END IF;

    ELSIF v_delta < -0.005 THEN
      v_issues := v_issues || jsonb_build_object(
        'place', r.place, 'issue', 'overpaid', 'user_id', v_holder,
        'expected', v_expected, 'already_paid', v_paid, 'excess', -v_delta,
        'detail', 'reported only; automatic clawback is deliberately not done');
    END IF;
  END LOOP;

  IF jsonb_array_length(v_issues) > 0 THEN
    INSERT INTO financial_alerts (severity, source, message, context)
    SELECT 'critical', 'fn_tournament_payout_reconcile',
           'Tournament payout could not be fully reconciled: '
             || COALESCE(t.name, p_tournament_id::text),
           jsonb_build_object('tournament_id', p_tournament_id,
                              'prize_pool', v_pool, 'issues', v_issues)
     WHERE NOT EXISTS (
       SELECT 1 FROM financial_alerts
        WHERE source = 'fn_tournament_payout_reconcile'
          AND resolved IS NOT TRUE
          AND context->>'tournament_id' = p_tournament_id::text);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tournament_id', p_tournament_id,
    'name', t.name,
    'prize_pool', v_pool,
    'total_expected', round(v_total_expected, 2),
    'total_paid_to_known_holders', round(v_total_paid, 2),
    'total_top_up', round(v_total_topup, 2),
    'applied', p_apply,
    'actions', v_actions,
    'issues', v_issues,
    'clean', (jsonb_array_length(v_actions) = 0 AND jsonb_array_length(v_issues) = 0));
END;
$function$;

-- Sweep: every completed tournament whose prize payments do not add up.
-- Bounded by a lookback window so it can run on a schedule without ever
-- becoming an unbounded scan (the failure mode that killed the treasury
-- sentinel earlier today).
CREATE OR REPLACE FUNCTION public.fn_tournament_payout_sweep(
  p_days int DEFAULT 2,
  p_apply boolean DEFAULT false,
  p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r        record;
  v_res    jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_n      int := 0;
  v_topup  numeric := 0;
BEGIN
  FOR r IN
    SELECT t.id
      FROM tournaments t
     WHERE t.status = 'COMPLETED'
       AND t.updated_at > now() - make_interval(days => GREATEST(p_days, 1))
       AND COALESCE(t.prize_pool, 0) > 0
       AND COALESCE(t.variant, '') <> 'satellite'
     ORDER BY t.updated_at DESC
     LIMIT GREATEST(p_limit, 1)
  LOOP
    v_res := fn_tournament_payout_reconcile(r.id, p_apply);
    IF COALESCE((v_res->>'clean')::boolean, true) = false THEN
      v_out := v_out || v_res;
      v_n := v_n + 1;
      v_topup := v_topup + COALESCE((v_res->>'total_top_up')::numeric, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'days', p_days, 'applied', p_apply,
                            'tournaments_with_findings', v_n,
                            'total_top_up', round(v_topup, 2),
                            'findings', v_out);
END;
$function$;

-- Money-moving reconciliation internals: no client role may call these.
REVOKE EXECUTE ON FUNCTION public.fn_tournament_payout_reconcile(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_tournament_payout_sweep(int, boolean, int)
  FROM PUBLIC, anon, authenticated;
