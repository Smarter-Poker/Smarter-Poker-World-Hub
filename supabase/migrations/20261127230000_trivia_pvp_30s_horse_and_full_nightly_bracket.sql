-- ============================================================================
-- 20261127230000_trivia_pvp_30s_horse_and_full_nightly_bracket.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Trivia Phase 3 delivery (owner direction 2026-11-27)
-- AFFECTS:     public.trivia_rules_versions, public.trivia_rules_current,
--              public.trivia_pvp_queue, public.trivia_pvp__draw_wait_seconds,
--              public.trivia_pvp_quote_v3, public.trivia_pvp__join_core_v3,
--              public.trivia_ledger_config, public.trivia_tournament_admit,
--              public.trivia_tournament_population_finalize,
--              public.trivia_nightly_burnin_scorecard_v1
-- IRREVERSIBLE: no (additive rules version + replaceable functions + check update)
--
-- WHY:
--   1. 1v1 PvP Smarter Horse fallback previously drew 20..45 seconds, so solo
--      humans waited up to 45 seconds before matching a Smarter Horse. Owner
--      direction requires matching a human against a Smarter Horse after waiting
--      up to 30 seconds (uniform CSPRNG draw in 15..30 seconds).
--   2. Nightly Trivia Tournaments previously stopped admitting Smarter Horses
--      at t.horse_target (70..140), leaving 116..186 seats empty as Round 1
--      byes when humans did not fill the bracket. Owner direction requires
--      filling ALL remaining bracket seats (up to full bracket_capacity, e.g.
--      256/256) with Smarter Horses once registration closes at start time,
--      while preserving open human seats during registration.
--   3. Filling 256 tournament seats at 10 Diamonds = 2,560 Diamonds, which
--      exceeded safe headroom under the provisional 3,000-Diamond daily/open
--      treasury ceilings when combined with daily PvP horses. Raising both
--      ceilings to 10,000 preserves full ledger conservation while preventing
--      artificial refusal of tournament/PvP horse seats.
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ----------------------------------------------------------------------------
-- 1. Pre-flight assertions
-- ----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name ORDER BY name)
      INTO v_missing
      FROM (VALUES
          ('public.trivia_rules_versions'),
          ('public.trivia_rules_current'),
          ('public.trivia_pvp_queue'),
          ('public.trivia_pvp_engine_config'),
          ('public.trivia_ledger_config'),
          ('public.trivia_tournaments'),
          ('public.trivia_tournament_entrants'),
          ('public.trivia_tournament_horse_schedule'),
          ('public.trivia_tournament_population_runs')
      ) AS req(name)
     WHERE to_regclass(name) IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'pre-flight failed: missing required relations %', v_missing;
    END IF;

    IF to_regprocedure('public.trivia_rules_set_current(text,text,text)') IS NULL
       OR to_regprocedure('public.trivia_ledger_set_config(text,bigint,text)') IS NULL
       OR to_regprocedure('public.trivia_pvp__draw_wait_seconds()') IS NULL
       OR to_regprocedure('public.trivia_pvp_quote_v3(uuid)') IS NULL
       OR to_regprocedure('public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)') IS NULL
       OR to_regprocedure('public.trivia_tournament_admit(uuid,uuid,text,text,bigint)') IS NULL
       OR to_regprocedure('public.trivia_tournament_population_finalize(uuid,bigint)') IS NULL
       OR to_regprocedure('public.trivia_nightly_burnin_scorecard_v1(date,integer)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: required Trivia PvP/Tournament functions are missing';
    END IF;
END
$preflight$;

-- ----------------------------------------------------------------------------
-- 2. PvP Rules v2 (pvp.standard@2): 15..30 second Smarter Horse fallback window
-- ----------------------------------------------------------------------------
INSERT INTO public.trivia_rules_versions (
    id, rules_key, version, family, mode, provisional, approval_source, rules_canonical, rules_sha256
) VALUES (
    'pvp.standard@2',
    'pvp.standard',
    2,
    'pvp',
    'pvp',
    false,
    'Owner direction 2026-11-27: 1v1 Smarter Horse matches within 15 to 30 seconds',
    '{"clock_zone":"America/Chicago","contract":"trivia-rules/1","family":"pvp","horse":{"disclosure":"Smarter Horse","fallback_wait_seconds":{"max":30,"min":15},"human_first":true,"max_horses_per_match":1,"seat_funding":"treasury","wait_persisted_once":true,"winnings_to":"treasury"},"match_window_seconds":1800,"mode":"pvp","outcomes":{"forfeit":"finisher_wins_under_winner_rule_when_opponent_was_charged","half_funded":"refund_only_the_charged_finisher","incomplete":"refund_each_charged_stake","tie":"refund_each_charged_stake","void":"zero_movement_when_nobody_was_charged","win":"winner_receives_pot_minus_rake"},"questions":{"count":20,"grading":"server","source":"server_roster","unique":true},"rake":{"basis":"funded_pot","denominator":100,"numerator":10,"rounding":"floor"},"references":{"refund":"pvp_refund_<match>_<user>","settlement":"pvp_settlement_<match>","stake":"pvp_stake_<match>_<user>","tie_refund":"pvp_tie_refund_<match>_<user>","win":"pvp_match_win_<match>"},"scoring":{"metric":"correct_count","tie":"equal_correct_count"},"stakes":[10,25,50,100],"wallet_kinds":{"refund":"pvp_refund","stake":"pvp_stake","win":"pvp_win"}}',
    '6cb96043bb1cf6be3d3194d28fc8868dd4cac997ae19ceacfd3da4a017e21026'
)
ON CONFLICT (id) DO NOTHING;

SELECT public.trivia_rules_set_current(
    'pvp.standard',
    'pvp.standard@2',
    'Owner direction 2026-11-27: 1v1 Smarter Horse matches within 15 to 30 seconds'
);

-- Allow 15..45 on trivia_pvp_queue so historical 31..45 tickets remain valid
-- while all new draws and v3 joins strictly enforce 15..30 seconds.
ALTER TABLE public.trivia_pvp_queue
    DROP CONSTRAINT IF EXISTS trivia_pvp_queue_v2_shape_check;

ALTER TABLE public.trivia_pvp_queue
    ADD CONSTRAINT trivia_pvp_queue_v2_shape_check CHECK (
        engine_version IS NULL OR (
            client_nonce IS NOT NULL
            AND rules_version_id IS NOT NULL AND length(rules_version_id) BETWEEN 1 AND 120
            AND joined_at IS NOT NULL AND created_at IS NOT NULL
            AND heartbeat_at IS NOT NULL AND heartbeat_at >= joined_at
            AND lease_expires_at IS NOT NULL AND lease_expires_at > heartbeat_at
            AND horse_wait_seconds IS NOT NULL AND horse_wait_seconds BETWEEN 15 AND 45
            AND horse_eligible_at = joined_at + make_interval(secs => horse_wait_seconds)
            AND expires_at > horse_eligible_at
            AND updated_at IS NOT NULL
        ));

-- Uniform whole-second draw in [15, 30] from CSPRNG.
-- 2^32 = 4294967296 is an exact multiple of 16, so every value 15..30 has
-- exact 1/16 probability with zero modulo bias.
CREATE OR REPLACE FUNCTION public.trivia_pvp__draw_wait_seconds()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_bytes bytea;
    v_n bigint;
BEGIN
    v_bytes := extensions.gen_random_bytes(4);
    v_n := (get_byte(v_bytes, 0)::bigint << 24)
         | (get_byte(v_bytes, 1)::bigint << 16)
         | (get_byte(v_bytes, 2)::bigint << 8)
         |  get_byte(v_bytes, 3)::bigint;
    RETURN 15 + (v_n % 16)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_pvp_quote_v3(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_rules jsonb;
    v_rule_body jsonb;
    v_balance bigint;
    v_stakes jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;

    SELECT *
      INTO v_cfg
      FROM public.trivia_pvp_engine_config
     WHERE id = 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_configuration_unavailable');
    END IF;

    SELECT COALESCE(p.diamonds, 0)::bigint
      INTO v_balance
      FROM public.profiles AS p
     WHERE p.id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    v_rules := public.trivia_rules_current('pvp.standard');
    v_rule_body := v_rules -> 'rules';
    IF v_rules ->> 'id' IS NULL
       OR jsonb_typeof(v_rule_body -> 'stakes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'stake', x.stake,
               'pot', (m.money ->> 'pot')::integer,
               'rake', (m.money ->> 'rake')::integer,
               'possibleReturn', (m.money ->> 'winner_payout')::integer,
               'netWin', (m.money ->> 'winner_payout')::integer - x.stake
           ) ORDER BY x.stake), '[]'::jsonb)
      INTO v_stakes
      FROM (
          SELECT value::integer AS stake
            FROM jsonb_array_elements_text(v_rule_body -> 'stakes')
      ) AS x
      CROSS JOIN LATERAL (
          SELECT public.trivia_rules_pvp_money(v_rules ->> 'id', x.stake) AS money
      ) AS m;

    RETURN jsonb_build_object(
        'success', true,
        'engine', 'pvp-v2',
        'serverNow', statement_timestamp(),
        'balance', v_balance,
        'rulesVersion', v_rules ->> 'id',
        'joinsEnabled', v_cfg.joins_enabled,
        'horseFallbackEnabled', v_cfg.joins_enabled AND v_cfg.horses_enabled,
        'stakes', v_stakes,
        'questionCount', COALESCE((v_rule_body -> 'questions' ->> 'count')::integer, 20),
        'humanFirst', COALESCE((v_rule_body -> 'horse' ->> 'human_first')::boolean, true),
        'horseWaitSeconds', jsonb_build_object(
            'min', COALESCE((v_rule_body -> 'horse' -> 'fallback_wait_seconds' ->> 'min')::integer, 15),
            'max', COALESCE((v_rule_body -> 'horse' -> 'fallback_wait_seconds' ->> 'max')::integer, 30)),
        'horseLabel', COALESCE(v_rule_body -> 'horse' ->> 'disclosure', 'Smarter Horse'),
        'cancellation', 'search_only_before_match',
        'tie', 'stake_refund'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_pvp__join_core_v3(
    p_user_id uuid,
    p_stake integer,
    p_client_nonce uuid,
    p_horses_allowed boolean,
    p_expected_rules_version text,
    p_now timestamptz DEFAULT NULL,
    p_wait_seconds integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_ticket public.trivia_pvp_queue%ROWTYPE;
    v_rules jsonb;
    v_rules_version text;
    v_existing_rules_version text;
    v_wait integer;
    v_now timestamptz;
    v_available bigint;
    v_effective_horses boolean;
BEGIN
    IF p_user_id IS NULL OR p_client_nonce IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_stake IS NULL OR p_stake NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;
    IF p_expected_rules_version IS NULL
       OR p_expected_rules_version !~ '^pvp\.standard@[1-9][0-9]*$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_rules_version');
    END IF;
    IF p_wait_seconds IS NOT NULL AND p_wait_seconds NOT BETWEEN 15 AND 30 THEN
        RAISE EXCEPTION 'horse wait must be 15..30 seconds';
    END IF;

    PERFORM public.trivia_pvp__user_lock(p_user_id);

    SELECT *
      INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id
       AND client_nonce = p_client_nonce;
    IF FOUND THEN
        IF v_ticket.rules_version_id IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_ticket.rules_version_id);
        END IF;
        PERFORM public.trivia_pvp__log(
            v_ticket.match_id, v_ticket.id, p_user_id, 'human',
            'ticket_join_replayed', jsonb_build_object('status', v_ticket.status),
            COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(
            p_user_id, v_ticket.id, p_horses_allowed, p_now)
            || jsonb_build_object('join', 'replayed');
    END IF;

    SELECT m.rules_version_id
      INTO v_existing_rules_version
      FROM public.trivia_pvp_active_seats AS s
      JOIN public.trivia_pvp_matches AS m ON m.id = s.match_id
     WHERE s.user_id = p_user_id;
    IF FOUND THEN
        IF v_existing_rules_version IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_existing_rules_version);
        END IF;
        RETURN public.trivia_pvp__status_core(p_user_id, NULL, p_horses_allowed, p_now)
            || jsonb_build_object('join', 'already_in_match');
    END IF;

    SELECT *
      INTO v_ticket
      FROM public.trivia_pvp_queue
     WHERE user_id = p_user_id
       AND status = 'waiting';
    IF FOUND THEN
        IF v_ticket.engine_version IS DISTINCT FROM 'pvp-v2' THEN
            RETURN jsonb_build_object('success', false, 'error', 'legacy_ticket_present');
        END IF;
        IF v_ticket.rules_version_id IS DISTINCT FROM p_expected_rules_version THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'rules_quote_stale',
                'quotedRulesVersion', p_expected_rules_version,
                'storedRulesVersion', v_ticket.rules_version_id);
        END IF;
        PERFORM public.trivia_pvp__log(
            NULL, v_ticket.id, p_user_id, 'human', 'ticket_join_adopted',
            jsonb_build_object('requested_stake', p_stake),
            COALESCE(p_now, clock_timestamp()));
        RETURN public.trivia_pvp__status_core(
            p_user_id, v_ticket.id, p_horses_allowed, p_now)
            || jsonb_build_object(
                'join', 'already_searching',
                'stake_mismatch', v_ticket.stake_amount <> p_stake);
    END IF;

    SELECT c.rules_version_id
      INTO v_rules_version
      FROM public.trivia_rules_current AS c
     WHERE c.rules_key = 'pvp.standard'
     FOR SHARE OF c;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;
    IF v_rules_version IS DISTINCT FROM p_expected_rules_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'rules_quote_stale',
            'quotedRulesVersion', p_expected_rules_version,
            'currentRulesVersion', v_rules_version);
    END IF;

    SELECT *
      INTO v_cfg
      FROM public.trivia_pvp_engine_config
     WHERE id = 1
     FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_configuration_unavailable');
    END IF;
    IF NOT v_cfg.joins_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_joins_paused');
    END IF;

    v_rules := public.trivia_rules_get(v_rules_version);
    IF v_rules ->> 'id' IS DISTINCT FROM v_rules_version
       OR jsonb_typeof(v_rules -> 'rules' -> 'stakes') IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;
    IF NOT ((v_rules -> 'rules' -> 'stakes') @> to_jsonb(p_stake)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake');
    END IF;

    SELECT COALESCE(p.diamonds, 0)
      INTO v_available
      FROM public.profiles AS p
     WHERE p.id = p_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;
    IF v_available < p_stake THEN
        RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds');
    END IF;

    v_wait := COALESCE(p_wait_seconds, public.trivia_pvp__draw_wait_seconds());
    v_effective_horses := COALESCE(p_horses_allowed, false) AND v_cfg.horses_enabled;
    PERFORM public.trivia_pvp__bucket_lock(p_stake, v_rules_version);
    v_now := COALESCE(p_now, clock_timestamp());
    PERFORM set_config('trivia_pvp.v2_authority', 'ticket:' || p_user_id::text, true);
    INSERT INTO public.trivia_pvp_queue (
        user_id, stake_amount, status, expires_at, created_at,
        engine_version, client_nonce, rules_version_id, joined_at,
        heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at
    ) VALUES (
        p_user_id, p_stake, 'waiting',
        v_now + make_interval(secs => GREATEST(v_cfg.max_search_seconds, v_wait + 30)), v_now,
        'pvp-v2', p_client_nonce, v_rules_version, v_now,
        v_now, v_now + make_interval(secs => v_cfg.lease_seconds), v_wait,
        v_now + make_interval(secs => v_wait), v_now
    ) RETURNING * INTO v_ticket;
    PERFORM set_config('trivia_pvp.v2_authority', '', true);

    PERFORM public.trivia_pvp__log(
        NULL, v_ticket.id, p_user_id, 'human', 'ticket_joined',
        jsonb_build_object(
            'stake', p_stake,
            'rules_version_id', v_rules_version,
            'quoted_rules_version_id', p_expected_rules_version,
            'horse_wait_seconds', v_wait,
            'horse_eligible_at', v_ticket.horse_eligible_at),
        v_now);

    PERFORM public.trivia_pvp__try_match(v_ticket.id, v_effective_horses, p_now);
    RETURN public.trivia_pvp__dto(p_user_id, p_now, v_effective_horses)
        || jsonb_build_object('join', 'created');
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. Treasury Ceilings + Nightly Tournament Full Bracket Horse Fill
-- ----------------------------------------------------------------------------
DO $treasury_cfg$
BEGIN
    IF COALESCE(public.trivia_ledger_config_value('treasury_daily_subsidy_ceiling'), 0) < 10000 THEN
        PERFORM public.trivia_ledger_set_config(
            'treasury_daily_subsidy_ceiling',
            10000,
            'Owner direction 2026-11-27: support full 256-seat nightly horse fill plus daily PvP horse matches'
        );
    END IF;
    IF COALESCE(public.trivia_ledger_config_value('treasury_exposure_ceiling'), 0) < 10000 THEN
        PERFORM public.trivia_ledger_set_config(
            'treasury_exposure_ceiling',
            10000,
            'Owner direction 2026-11-27: support full 256-seat nightly horse fill plus concurrent PvP horse matches'
        );
    END IF;
END
$treasury_cfg$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_admit(
    p_tournament_id uuid, p_participant_id uuid, p_kind text, p_client_nonce text, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    e public.trivia_tournament_entrants%ROWTYPE;
    f jsonb;
    v_now timestamptz := public.trivia_tournament_clock();
    v_humans integer;
    v_horses integer;
    v_fee integer;
    v_rake integer;
    v_ref text;
    v_name text;
    v_res jsonb;
    v_journal uuid;
    v_id uuid;
BEGIN
    IF p_kind NOT IN ('human', 'horse') THEN
        RAISE EXCEPTION 'trivia_p6: invalid participant kind %', p_kind;
    END IF;
    SELECT * INTO t FROM public.trivia_tournaments WHERE id = p_tournament_id;
    f := t.format_snapshot;
    SELECT * INTO e FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND participant_id = p_participant_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'duplicate', true, 'entrant_id', e.id,
                                  'entry_reference', e.entry_reference, 'entry_state', e.entry_state,
                                  'entry_fee', e.entry_fee);
    END IF;
    SELECT count(*) FILTER (WHERE participant_kind = 'human'),
           count(*) FILTER (WHERE participant_kind = 'horse')
      INTO v_humans, v_horses
      FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND entry_state = 'entered';
    IF p_kind = 'human' THEN
        -- Humans are additive, but never into the horse reserve.
        IF v_humans >= t.bracket_capacity - t.horse_target
           AND COALESCE((f->>'auto_expand_capacity')::boolean, false)
           AND t.bracket_capacity < (f->>'bracket_capacity_max')::integer THEN
            UPDATE public.trivia_tournaments
               SET bracket_capacity = (f->>'bracket_capacity_max')::integer,
                   last_fencing_token = COALESCE(p_fencing_token, last_fencing_token)
             WHERE id = t.id
            RETURNING * INTO t;
            PERFORM public.trivia_tournament_event(t.id, 'capacity_expanded',
                jsonb_build_object('bracket_capacity', t.bracket_capacity, 'humans', v_humans),
                NULL, NULL, NULL, p_fencing_token);
        END IF;
        IF v_humans >= t.bracket_capacity - t.horse_target THEN
            RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
        END IF;
    ELSIF current_setting('app.trivia_tournament_final_fill', true) = 'on' THEN
        -- At start time (registration closed), Smarter Horses fill all remaining seats up to bracket_capacity.
        IF v_humans + v_horses >= t.bracket_capacity THEN
            RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
        END IF;
    ELSIF v_horses >= t.horse_target THEN
        RETURN jsonb_build_object('success', false, 'error', 'horse_target_reached');
    END IF;

    v_fee := COALESCE((f->>'entry_fee')::integer, 0);
    v_rake := CASE WHEN v_fee > 0
                   THEN GREATEST((f->>'rake_minimum')::integer,
                                 round(v_fee * (f->>'rake_rate_bp')::integer / 10000.0)::integer)
                   ELSE 0 END;
    v_ref := 'trivia_tourn_entry_' || t.id::text || '_' || p_participant_id::text;
    SELECT left(COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), 'Player'), 80)
      INTO v_name FROM public.profiles AS p WHERE p.id = p_participant_id;
    IF v_name IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    IF v_fee > 0 THEN
        IF p_kind = 'human' THEN
            v_res := public.trivia_ledger_hold(v_ref, 'tournament', t.id, p_participant_id, v_fee,
                'tournament_entry', 'Trivia Nightly entry - ' || t.name, 'human',
                jsonb_build_object('tournament_id', t.id, 'engine', t.engine_version));
        ELSE
            v_res := public.trivia_ledger_subsidy(v_ref, 'tournament', t.id, p_participant_id, v_fee,
                'horse_seat', jsonb_build_object('tournament_id', t.id, 'engine', t.engine_version));
        END IF;
        IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', COALESCE(v_res->>'error', 'ledger_refused'),
                                      'ledger_detail', v_res->'detail');
        END IF;
        v_journal := NULLIF(v_res->>'journal_id', '')::uuid;
    END IF;

    INSERT INTO public.trivia_tournament_entrants (
        tournament_id, participant_id, participant_kind, display_name, entered_at, entry_reference,
        entry_fee, rake_amount, net_contribution, funding_source, ledger_journal_id, client_nonce, created_by)
    VALUES (t.id, p_participant_id, p_kind, v_name, v_now, v_ref, v_fee, v_rake, v_fee - v_rake,
            CASE WHEN v_fee = 0 THEN 'none' WHEN p_kind = 'human' THEN 'player_wallet' ELSE 'house_treasury' END,
            v_journal, p_client_nonce, CASE WHEN p_kind = 'human' THEN 'player' ELSE 'horse_population' END)
    RETURNING id INTO v_id;
    UPDATE public.trivia_tournaments SET current_players = current_players + 1 WHERE id = t.id;
    PERFORM public.trivia_tournament_event(t.id, 'entrant_admitted',
        jsonb_build_object('participant_kind', p_kind, 'entry_fee', v_fee, 'entry_reference', v_ref),
        v_id, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object('success', true, 'duplicate', false, 'entrant_id', v_id,
                              'entry_reference', v_ref, 'entry_fee', v_fee, 'journal_id', v_journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.trivia_tournament_population_finalize(
    p_tournament_id uuid, p_fencing_token bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.trivia_tournaments%ROWTYPE;
    v_now timestamptz;
    v_key bytea;
    v_join jsonb;
    v_entered integer;
    v_humans integer;
    v_fill_target integer;
    v_is_final_lock boolean;
    v_rank integer;
    v_res jsonb;
    v_row uuid;
    v_pop_run uuid;
    c record;
    v_inserted integer := 0;
    v_failed integer := 0;
    v_consecutive integer := 0;
    v_funding bigint := 0;
    v_outcome text;
BEGIN
    PERFORM public.trivia_tournament_assert_fence(p_fencing_token);
    SELECT * INTO t FROM public.trivia_tournaments
     WHERE id = p_tournament_id AND engine_version IS NOT NULL FOR UPDATE;
    IF NOT FOUND OR t.horse_population_mode <> 'enabled'
       OR t.lifecycle_state NOT IN ('scheduled', 'registration', 'held') THEN
        RETURN jsonb_build_object('finalized', false);
    END IF;
    v_now := public.trivia_tournament_clock();
    v_join := public.trivia_tournament_population_join_due(t.id, p_fencing_token, 1000, true);
    SELECT count(*) FILTER (WHERE participant_kind = 'horse'),
           count(*) FILTER (WHERE participant_kind = 'human')
      INTO v_entered, v_humans
      FROM public.trivia_tournament_entrants
     WHERE tournament_id = t.id AND entry_state = 'entered';
    SELECT run_id INTO v_pop_run FROM public.trivia_tournament_population_runs
     WHERE tournament_id = t.id AND run_kind = 'population';

    -- While registration is still open (before start_time / registration_closes_at),
    -- only top up to t.horse_target so human seats stay open until lock.
    -- Once registration closes at start time, fill EVERY remaining seat up to
    -- t.bracket_capacity with Smarter Horses so no seat is left empty.
    v_is_final_lock := (v_now >= t.registration_closes_at OR v_now >= t.start_time);
    v_fill_target := CASE
        WHEN v_is_final_lock THEN GREATEST(t.horse_target, GREATEST(0, t.bracket_capacity - v_humans))
        ELSE t.horse_target
    END;

    IF v_entered < v_fill_target THEN
        SELECT s.horse_plan_key INTO v_key FROM public.trivia_tournament_secrets s WHERE s.tournament_id = t.id;
        SELECT COALESCE(max(selection_rank), 0) INTO v_rank
          FROM public.trivia_tournament_horse_schedule WHERE tournament_id = t.id;
        IF v_is_final_lock THEN
            PERFORM set_config('app.trivia_tournament_final_fill', 'on', true);
        END IF;
        FOR c IN
            SELECT p.id AS horse_id, hp.skill_band
              FROM public.profiles AS p
              JOIN public.trivia_tournament_horse_personas AS hp ON hp.horse_id = p.id
             WHERE p.is_horse IS TRUE AND p.horse_status = 'available'
               AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_horse_schedule hs
                                WHERE hs.tournament_id = t.id AND hs.horse_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats s WHERE s.user_id = p.id)
               AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_entrants oe
                                 JOIN public.trivia_tournaments ot ON ot.id = oe.tournament_id
                                WHERE oe.participant_id = p.id AND oe.entry_state = 'entered' AND ot.id <> t.id
                                  AND ot.lifecycle_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
                                  AND ot.start_time BETWEEN t.start_time - interval '3 hours' AND t.start_time + interval '3 hours')
             ORDER BY (SELECT max(hs.planned_at) FROM public.trivia_tournament_horse_schedule hs
                        WHERE hs.horse_id = p.id) NULLS FIRST,
                      public.trivia_tournament_keyed_unit(v_key, 'rot:' || p.id::text)
             LIMIT (v_fill_target - v_entered) * 2 + 10
        LOOP
            EXIT WHEN v_entered >= v_fill_target OR v_consecutive >= 5;
            v_rank := v_rank + 1;
            INSERT INTO public.trivia_tournament_horse_schedule
                (tournament_id, horse_id, skill_band, selection_rank, planned_join_at, is_replacement,
                 population_run_id, planned_at)
            VALUES (t.id, c.horse_id, c.skill_band, v_rank, v_now, true, v_pop_run, v_now)
            RETURNING id INTO v_row;
            BEGIN
                v_res := public.trivia_tournament_admit(t.id, c.horse_id, 'horse', NULL, p_fencing_token);
            EXCEPTION WHEN OTHERS THEN
                v_res := jsonb_build_object('success', false, 'error', left(SQLERRM, 160));
            END;
            IF COALESCE((v_res->>'success')::boolean, false) THEN
                UPDATE public.trivia_tournament_horse_schedule
                   SET status = 'entered', entrant_id = (v_res->>'entrant_id')::uuid, entered_at = v_now, attempts = 1
                 WHERE id = v_row;
                v_entered := v_entered + 1;
                v_inserted := v_inserted + 1;
                v_consecutive := 0;
                v_funding := v_funding + COALESCE((v_res->>'entry_fee')::bigint, 0);
            ELSE
                UPDATE public.trivia_tournament_horse_schedule
                   SET status = 'failed', attempts = 1, last_error = v_res->>'error' WHERE id = v_row;
                v_failed := v_failed + 1;
                v_consecutive := v_consecutive + 1;
            END IF;
        END LOOP;
        IF v_is_final_lock THEN
            PERFORM set_config('app.trivia_tournament_final_fill', '', true);
        END IF;
    END IF;

    v_outcome := CASE WHEN v_entered >= v_fill_target THEN 'complete'
                      WHEN v_entered >= (t.format_snapshot->>'min_horses_to_start')::integer THEN 'short'
                      ELSE 'held' END;
    INSERT INTO public.trivia_tournament_population_runs
        (tournament_id, run_kind, idempotency_key, fencing_token, horse_target, selected, inserted,
         failed, funding_total, entered_after, outcome, started_at, finished_at, detail)
    VALUES (t.id, 'final_reconcile', 'trivia_tourn_population_final_' || t.id::text, p_fencing_token,
            t.horse_target, (v_join->>'inserted')::integer + v_inserted + v_failed,
            (v_join->>'inserted')::integer + v_inserted,
            (v_join->>'failed')::integer + v_failed,
            (v_join->>'funding')::bigint + v_funding, v_entered, v_outcome, v_now, v_now,
            jsonb_build_object(
                'replacements', v_inserted,
                'replacement_failures', v_failed,
                'fill_target', v_fill_target,
                'full_bracket_fill', v_is_final_lock
            ))
    ON CONFLICT (tournament_id, run_kind) DO UPDATE
       SET selected = public.trivia_tournament_population_runs.selected + EXCLUDED.selected,
           inserted = public.trivia_tournament_population_runs.inserted + EXCLUDED.inserted,
           failed = public.trivia_tournament_population_runs.failed + EXCLUDED.failed,
           funding_total = public.trivia_tournament_population_runs.funding_total + EXCLUDED.funding_total,
           entered_after = EXCLUDED.entered_after, outcome = EXCLUDED.outcome,
           finished_at = EXCLUDED.finished_at, fencing_token = EXCLUDED.fencing_token,
           detail = public.trivia_tournament_population_runs.detail || EXCLUDED.detail;
    UPDATE public.trivia_tournament_population_runs
       SET outcome = v_outcome, entered_after = v_entered, finished_at = v_now
     WHERE run_id = v_pop_run;
    PERFORM public.trivia_tournament_event(t.id, 'population_final',
        jsonb_build_object(
            'horse_target', t.horse_target,
            'fill_target', v_fill_target,
            'full_bracket_fill', v_is_final_lock,
            'entered', v_entered,
            'outcome', v_outcome
        ),
        NULL, NULL, NULL, p_fencing_token);
    RETURN jsonb_build_object(
        'finalized', true,
        'entered', v_entered,
        'fill_target', v_fill_target,
        'full_bracket_fill', v_is_final_lock,
        'outcome', v_outcome
    );
END;
$$;

-- Update burn-in scorecard RPC so SLO 1 (horse_target_exact) passes for BOTH
-- historical horse_target nights and new full-bracket horse fill nights.
CREATE OR REPLACE FUNCTION public.trivia_nightly_burnin_scorecard_v1(
    p_start_date date DEFAULT DATE '2026-11-24',
    p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_start_date date := COALESCE(p_start_date, DATE '2026-11-24');
    v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 7), 31));
    v_end_date date := v_start_date + (v_days - 1);
    v_now timestamptz := now();
    v_ledger_clean boolean := false;
    v_local_date date;
    v_row record;
    v_state text;
    v_is_future_or_in_progress boolean;
    v_stuck_rounds integer;
    v_settlement_state text;
    v_full_bracket_fill boolean;
    v_slo1_pass boolean;
    v_slo2_pass boolean;
    v_slo3_pass boolean;
    v_slo4_pass boolean;
    v_slo5_pass boolean;
    v_slo6_pass boolean;
    v_slo1_detail text;
    v_slo2_detail text;
    v_slo3_detail text;
    v_slo4_detail text;
    v_slo5_detail text;
    v_slo6_detail text;
    v_start_delay_disp numeric;
    v_event_duration_disp numeric;
    v_settlement_latency_disp numeric;
    v_slos jsonb;
    v_status text;
    v_night jsonb;
    v_nights jsonb := '[]'::jsonb;
    v_passed integer := 0;
    v_failed integer := 0;
    v_pending integer := 0;
    v_scheduled integer := 0;
    v_certified boolean := false;
BEGIN
    v_ledger_clean := COALESCE(public.trivia_competitive_global_ledger_clean_v1(), false);

    FOR v_local_date IN
        SELECT (v_start_date + gs)::date
          FROM generate_series(0, v_days - 1) AS gs
    LOOP
        SELECT
            m.tournament_id,
            m.scheduled_local_date,
            m.start_time,
            m.lifecycle_state,
            m.horse_target,
            m.horses_entered,
            m.humans_entered,
            t.bracket_capacity,
            m.start_delay_seconds,
            m.event_duration_seconds,
            m.stuck_rounds,
            m.settlement_state,
            m.settlement_latency_seconds,
            m.escrow_balance,
            COALESCE((t.format_snapshot->>'event_budget_seconds')::integer, 3600) AS event_budget_seconds,
            COALESCE((t.format_snapshot->>'settlement_sla_seconds')::integer, 60) AS settlement_sla_seconds,
            (
                SELECT count(*)::integer
                  FROM public.trivia_tournament_entrants e
                 WHERE e.tournament_id = m.tournament_id
                   AND e.entry_state = 'entered'
            ) AS charged_entrants,
            (
                SELECT count(*)::integer
                  FROM public.trivia_tournament_entrants e
                 WHERE e.tournament_id = m.tournament_id
                   AND e.entry_state = 'entered'
                   AND (COALESCE(e.in_field, false) = false OR e.seed_number IS NULL)
            ) AS excluded_charged_entrants,
            COALESCE((
                SELECT sum(abs(COALESCE(r.unexplained_variance, 0)))::bigint
                  FROM public.trivia_ledger_recon_tournament r
                 WHERE r.subject_id = m.tournament_id
                   AND r.state IN ('settled', 'refunded', 'voided')
            ), 0)::bigint AS ledger_variance
          INTO v_row
          FROM public.trivia_tournament_metrics_v1 m
          JOIN public.trivia_tournaments t ON t.id = m.tournament_id
         WHERE m.schedule_kind = 'public_nightly'
           AND m.scheduled_local_date = v_local_date
         ORDER BY t.start_time DESC, t.id DESC
         LIMIT 1;

        IF NOT FOUND THEN
            v_status := 'failed';
            v_failed := v_failed + 1;
            v_slos := jsonb_build_object(
                'horse_target_exact', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'start_within_60s', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'all_charged_in_bracket', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'within_event_budget', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'settlement_within_slo', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing'),
                'zero_escrow_and_variance', jsonb_build_object('passed', false, 'detail', 'Nightly instance missing')
            );
            v_night := jsonb_build_object(
                'date', to_char(v_local_date, 'YYYY-MM-DD'),
                'tournament_id', NULL,
                'start_time', NULL,
                'lifecycle_state', 'missing',
                'horse_target', NULL,
                'horses_entered', NULL,
                'humans_entered', 0,
                'bracket_capacity', NULL,
                'start_delay_seconds', NULL,
                'event_duration_seconds', NULL,
                'event_budget_seconds', 3600,
                'stuck_rounds', 0,
                'settlement_state', NULL,
                'settlement_latency_seconds', NULL,
                'settlement_sla_seconds', 60,
                'charged_entrants', NULL,
                'excluded_charged_entrants', NULL,
                'escrow_balance', NULL,
                'ledger_variance', 0,
                'status', v_status,
                'slos', v_slos
            );
        ELSE
            v_scheduled := v_scheduled + 1;
            v_state := COALESCE(v_row.lifecycle_state, 'unknown');
            v_is_future_or_in_progress := (
                v_state IN ('scheduled', 'registration', 'held', 'live', 'settling')
                AND (v_row.start_time IS NULL OR v_now < v_row.start_time + interval '2 hours')
            );

            v_stuck_rounds := COALESCE(v_row.stuck_rounds, 0)::integer;
            v_settlement_state := COALESCE(v_row.settlement_state, '');
            v_start_delay_disp := CASE
                WHEN v_row.start_delay_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.start_delay_seconds::numeric, 2))
            END;
            v_event_duration_disp := CASE
                WHEN v_row.event_duration_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.event_duration_seconds::numeric, 2))
            END;
            v_settlement_latency_disp := CASE
                WHEN v_row.settlement_latency_seconds IS NULL THEN NULL
                ELSE pg_catalog.trim_scale(round(v_row.settlement_latency_seconds::numeric, 2))
            END;

            -- SLO 1: 70 <= horse_target <= 140 AND (horses_entered == horse_target OR full bracket fill)
            v_full_bracket_fill := (
                v_row.horses_entered IS NOT NULL
                AND v_row.horse_target IS NOT NULL
                AND v_row.bracket_capacity IS NOT NULL
                AND v_row.horses_entered >= v_row.horse_target
                AND (COALESCE(v_row.humans_entered, 0) + v_row.horses_entered) = v_row.bracket_capacity
            );
            v_slo1_pass := (
                v_row.horse_target IS NOT NULL
                AND v_row.horse_target BETWEEN 70 AND 140
                AND v_row.horses_entered IS NOT NULL
                AND (v_row.horses_entered = v_row.horse_target OR v_full_bracket_fill)
            );
            v_slo1_detail := CASE
                WHEN v_full_bracket_fill
                THEN v_row.horses_entered::text || '/' || v_row.bracket_capacity::text
                    || ' horses (full bracket fill, target ' || v_row.horse_target::text || ')'
                ELSE COALESCE(v_row.horses_entered::text, '-')
                    || '/' || COALESCE(v_row.horse_target::text, '-')
                    || ' horses (target 70-140)'
            END;

            v_slo2_pass := (
                v_row.start_delay_seconds IS NOT NULL
                AND v_row.start_delay_seconds >= -5
                AND v_row.start_delay_seconds <= 60
            );
            v_slo2_detail := CASE
                WHEN v_row.start_delay_seconds IS NULL THEN 'Not started yet'
                ELSE v_start_delay_disp::text || 's delay (limit <= 60s)'
            END;

            v_slo3_pass := (
                v_row.charged_entrants IS NOT NULL
                AND v_row.charged_entrants > 0
                AND COALESCE(v_row.excluded_charged_entrants, 0) = 0
            );
            v_slo3_detail := CASE
                WHEN v_row.charged_entrants IS NULL THEN 'No entrant counts'
                ELSE (v_row.charged_entrants - COALESCE(v_row.excluded_charged_entrants, 0))::text
                    || '/' || v_row.charged_entrants::text
                    || ' charged seated (excluded=' || COALESCE(v_row.excluded_charged_entrants::text, '-') || ')'
            END;

            v_slo4_pass := (
                v_row.event_duration_seconds IS NOT NULL
                AND v_row.event_duration_seconds <= v_row.event_budget_seconds
                AND v_stuck_rounds = 0
            );
            v_slo4_detail := CASE
                WHEN v_row.event_duration_seconds IS NULL
                THEN 'Not completed yet (stuck_rounds=' || v_stuck_rounds::text || ')'
                ELSE v_event_duration_disp::text || 's / ' || v_row.event_budget_seconds::text
                    || 's budget (stuck_rounds=' || v_stuck_rounds::text || ')'
            END;

            v_slo5_pass := (
                v_state = 'settled'
                AND v_settlement_state = 'settled'
                AND v_row.settlement_latency_seconds IS NOT NULL
                AND v_row.settlement_latency_seconds <= v_row.settlement_sla_seconds
            );
            v_slo5_detail := CASE
                WHEN v_row.settlement_latency_seconds IS NULL
                THEN 'State=' || v_state || ', settlement=' || COALESCE(NULLIF(v_settlement_state, ''), '-')
                ELSE v_settlement_latency_disp::text || 's settlement (SLA <= '
                    || v_row.settlement_sla_seconds::text || 's, state=' || v_settlement_state || ')'
            END;

            v_slo6_pass := (
                v_row.escrow_balance IS NOT NULL
                AND v_row.escrow_balance = 0
                AND v_row.ledger_variance = 0
                AND v_ledger_clean
            );
            v_slo6_detail := 'escrow=' || COALESCE(v_row.escrow_balance::text, '-')
                || ', variance=' || v_row.ledger_variance::text;

            v_slos := jsonb_build_object(
                'horse_target_exact', jsonb_build_object('passed', v_slo1_pass, 'detail', v_slo1_detail),
                'start_within_60s', jsonb_build_object('passed', v_slo2_pass, 'detail', v_slo2_detail),
                'all_charged_in_bracket', jsonb_build_object('passed', v_slo3_pass, 'detail', v_slo3_detail),
                'within_event_budget', jsonb_build_object('passed', v_slo4_pass, 'detail', v_slo4_detail),
                'settlement_within_slo', jsonb_build_object('passed', v_slo5_pass, 'detail', v_slo5_detail),
                'zero_escrow_and_variance', jsonb_build_object('passed', v_slo6_pass, 'detail', v_slo6_detail)
            );

            IF v_state = 'settled' THEN
                IF v_slo1_pass AND v_slo2_pass AND v_slo3_pass AND v_slo4_pass AND v_slo5_pass AND v_slo6_pass THEN
                    v_status := 'passed';
                    v_passed := v_passed + 1;
                ELSE
                    v_status := 'failed';
                    v_failed := v_failed + 1;
                END IF;
            ELSIF v_is_future_or_in_progress THEN
                v_status := 'pending';
                v_pending := v_pending + 1;
            ELSE
                v_status := 'failed';
                v_failed := v_failed + 1;
            END IF;

            v_night := jsonb_build_object(
                'date', to_char(v_local_date, 'YYYY-MM-DD'),
                'tournament_id', v_row.tournament_id,
                'start_time', v_row.start_time,
                'lifecycle_state', v_state,
                'horse_target', v_row.horse_target,
                'horses_entered', COALESCE(v_row.horses_entered, 0)::integer,
                'humans_entered', COALESCE(v_row.humans_entered, 0)::integer,
                'bracket_capacity', v_row.bracket_capacity,
                'start_delay_seconds', v_start_delay_disp,
                'event_duration_seconds', v_event_duration_disp,
                'event_budget_seconds', v_row.event_budget_seconds,
                'stuck_rounds', v_stuck_rounds,
                'settlement_state', NULLIF(v_settlement_state, ''),
                'settlement_latency_seconds', v_settlement_latency_disp,
                'settlement_sla_seconds', v_row.settlement_sla_seconds,
                'charged_entrants', v_row.charged_entrants,
                'excluded_charged_entrants', v_row.excluded_charged_entrants,
                'escrow_balance', v_row.escrow_balance,
                'ledger_variance', v_row.ledger_variance,
                'status', v_status,
                'slos', v_slos
            );
        END IF;

        v_nights := v_nights || jsonb_build_array(v_night);
    END LOOP;

    v_certified := (v_passed = v_days AND v_failed = 0 AND v_ledger_clean);

    RETURN jsonb_build_object(
        'contract', 'trivia-phase12-burnin/1',
        'generated_at', v_now,
        'window', jsonb_build_object(
            'start_date', to_char(v_start_date, 'YYYY-MM-DD'),
            'end_date', to_char(v_end_date, 'YYYY-MM-DD'),
            'days', v_days
        ),
        'scorecard', v_passed::text || '/' || v_days::text,
        'certified', v_certified,
        'passed', v_passed,
        'failed', v_failed,
        'pending', v_pending,
        'scheduled', v_scheduled,
        'total', v_days,
        'ledger_clean', v_ledger_clean,
        'summary', jsonb_build_object(
            'passed', v_passed,
            'failed', v_failed,
            'pending', v_pending,
            'scheduled', v_scheduled,
            'total', v_days,
            'ledger_clean', v_ledger_clean
        ),
        'nights', v_nights
    );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 4. Explicit ownership and least-privilege ACLs
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.trivia_pvp__draw_wait_seconds() OWNER TO postgres;
ALTER FUNCTION public.trivia_pvp_quote_v3(uuid) OWNER TO postgres;
ALTER FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer) OWNER TO postgres;
ALTER FUNCTION public.trivia_tournament_admit(uuid, uuid, text, text, bigint) OWNER TO postgres;
ALTER FUNCTION public.trivia_tournament_population_finalize(uuid, bigint) OWNER TO postgres;
ALTER FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.trivia_pvp__draw_wait_seconds() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp_quote_v3(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_pvp__join_core_v3(uuid, integer, uuid, boolean, text, timestamptz, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_admit(uuid, uuid, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_tournament_population_finalize(uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.trivia_pvp_quote_v3(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trivia_nightly_burnin_scorecard_v1(date, integer) TO postgres, service_role;

-- ----------------------------------------------------------------------------
-- 5. Post-flight verification
-- ----------------------------------------------------------------------------
DO $postflight$
DECLARE
    v_rules jsonb;
    v_draw integer;
    v_i integer;
BEGIN
    v_rules := public.trivia_rules_current('pvp.standard');
    IF v_rules ->> 'id' IS DISTINCT FROM 'pvp.standard@2'
       OR (v_rules -> 'rules' -> 'horse' -> 'fallback_wait_seconds' ->> 'min')::integer <> 15
       OR (v_rules -> 'rules' -> 'horse' -> 'fallback_wait_seconds' ->> 'max')::integer <> 30 THEN
        RAISE EXCEPTION 'post-flight failed: pvp.standard@2 rules activation mismatch';
    END IF;

    FOR v_i IN 1..200 LOOP
        v_draw := public.trivia_pvp__draw_wait_seconds();
        IF v_draw IS NULL OR v_draw NOT BETWEEN 15 AND 30 THEN
            RAISE EXCEPTION 'post-flight failed: trivia_pvp__draw_wait_seconds returned %', v_draw;
        END IF;
    END LOOP;

    IF public.trivia_ledger_config_value('treasury_daily_subsidy_ceiling') < 10000
       OR public.trivia_ledger_config_value('treasury_exposure_ceiling') < 10000 THEN
        RAISE EXCEPTION 'post-flight failed: treasury ceilings below 10000';
    END IF;

    IF has_function_privilege('anon', 'public.trivia_pvp_quote_v3(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.trivia_pvp_quote_v3(uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_pvp__draw_wait_seconds()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_pvp__join_core_v3(uuid,integer,uuid,boolean,text,timestamp with time zone,integer)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_tournament_admit(uuid,uuid,text,text,bigint)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.trivia_tournament_population_finalize(uuid,bigint)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-flight failed: unexpected function execute grant';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.trivia_nightly_burnin_scorecard_v1(date, integer)'::regprocedure
           AND p.prosecdef
           AND p.provolatile = 's'
           AND p.proowner = 'postgres'::regrole
           AND p.proconfig = ARRAY['search_path=""']
           AND p.proacl::text[] = ARRAY['postgres=X/postgres', 'service_role=X/postgres']
    ) THEN
        RAISE EXCEPTION 'post-flight failed: trivia_nightly_burnin_scorecard_v1 attributes mismatch';
    END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
SELECT public.trivia_rules_set_current('pvp.standard', 'pvp.standard@1', 'Rollback to 20..45s PvP horse wait');
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
