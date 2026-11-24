-- ============================================================================
-- 20261124200800_trivia_elo_matchmaking_and_friend_duels.sql
-- ============================================================================
-- TIER:        3 (Additive SECURITY DEFINER RPC hardening; zero ALTER TABLE)
-- AUTHOR:      Antigravity (trivia-pvp-elo-duel), Gap Closure Track 1
-- AFFECTS:     public.trivia_pvp__try_match(uuid, boolean, timestamptz)
--              public.trivia_friend_challenge_create_v1(uuid, integer, integer, uuid)
--              public.trivia_friend_challenge_get_v1(text, uuid)
--              public.trivia_friend_challenge_accept_v1(uuid, text)
-- IRREVERSIBLE: no
--
-- WHY:
--   1. Elo-based matchmaking with widening search windows in trivia_pvp__try_match:
--      - 0 <= elapsed < 8s:  ABS(elo_a - elo_b) <= 150
--      - 8 <= elapsed < 16s: ABS(elo_a - elo_b) <= 350
--      - elapsed >= 16s:     unlimited Elo difference (so compatible waiting
--        humans ALWAYS pair before the 20-45s Smarter Horse fallback).
--      - Default unrated players to 1200 Elo; rank eligible candidates by
--        closest Elo distance, then oldest joined_at, then id.
--   2. Direct Friend Duel full end-to-end pairing & intended-recipient guard:
--      - Add optional p_challenged_user_id uuid DEFAULT NULL to
--        trivia_friend_challenge_create_v1 (preserving 2-arg and 3-arg calls).
--      - Update trivia_friend_challenge_get_v1 so canAccept respects
--        challenged_user_id when targeted.
--      - Upgrade trivia_friend_challenge_accept_v1 to enforce self-accept,
--        intended-recipient (unauthorized_recipient), expiry, cancellation,
--        duplicate-accept idempotency for the same accepter vs refusal for a
--        second distinct user (challenge_already_accepted), and atomic direct
--        human-vs-human Phase 5 match pairing via trivia_pvp__bind_match
--        (holding both stakes in Phase 5 escrow, checking active seats and
--        balances cleanly so neither friend can match a stranger or horse).
-- ============================================================================

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';

-- 1. PRE-FLIGHT PREDECESSOR MD5 GUARDS ---------------------------------------
DO $preflight$
DECLARE
    v_cnt integer;
    v_md5 text;
    v_sec boolean;
BEGIN
    SELECT count(*) INTO v_cnt
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_pvp__try_match';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'preflight: expected 1 overload for trivia_pvp__try_match, got %', v_cnt;
    END IF;
    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_md5, v_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_pvp__try_match(uuid,boolean,timestamptz)'::regprocedure;
    IF v_md5 IS DISTINCT FROM 'a525e7bc94e220c86de87dd6a2034e31' THEN
        RAISE EXCEPTION 'preflight: trivia_pvp__try_match MD5 mismatch (got %, expected a525e7bc94e220c86de87dd6a2034e31)', v_md5;
    END IF;
    IF v_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_pvp__try_match is not SECURITY DEFINER';
    END IF;

    SELECT count(*) INTO v_cnt
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_friend_challenge_create_v1';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'preflight: expected 1 overload for trivia_friend_challenge_create_v1, got %', v_cnt;
    END IF;
    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_md5, v_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_friend_challenge_create_v1(uuid,integer,integer)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '4ccba5903f6a7fbc096d0a210d2771b4' THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_create_v1 MD5 mismatch (got %, expected 4ccba5903f6a7fbc096d0a210d2771b4)', v_md5;
    END IF;
    IF v_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_create_v1 is not SECURITY DEFINER';
    END IF;

    SELECT count(*) INTO v_cnt
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_friend_challenge_get_v1';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'preflight: expected 1 overload for trivia_friend_challenge_get_v1, got %', v_cnt;
    END IF;
    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_md5, v_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_friend_challenge_get_v1(text,uuid)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '736e61d65ab2cf26de11f2c409f63634' THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_get_v1 MD5 mismatch (got %, expected 736e61d65ab2cf26de11f2c409f63634)', v_md5;
    END IF;
    IF v_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_get_v1 is not SECURITY DEFINER';
    END IF;

    SELECT count(*) INTO v_cnt
      FROM pg_catalog.pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'trivia_friend_challenge_accept_v1';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'preflight: expected 1 overload for trivia_friend_challenge_accept_v1, got %', v_cnt;
    END IF;
    SELECT md5(pg_catalog.pg_get_functiondef(oid)), prosecdef
      INTO v_md5, v_sec
      FROM pg_catalog.pg_proc
     WHERE oid = 'public.trivia_friend_challenge_accept_v1(uuid,text)'::regprocedure;
    IF v_md5 IS DISTINCT FROM '1e3abb5c665880ea033fcc40103914e0' THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_accept_v1 MD5 mismatch (got %, expected 1e3abb5c665880ea033fcc40103914e0)', v_md5;
    END IF;
    IF v_sec IS NOT TRUE THEN
        RAISE EXCEPTION 'preflight: trivia_friend_challenge_accept_v1 is not SECURITY DEFINER';
    END IF;
END
$preflight$;

-- 2. ELO WIDENING-WINDOW MATCHMAKING IN trivia_pvp__try_match -----------------
CREATE OR REPLACE FUNCTION public.trivia_pvp__try_match(
    p_ticket_id uuid,
    p_horses_allowed boolean,
    p_now timestamp with time zone
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_t public.trivia_pvp_queue%ROWTYPE;
    v_o public.trivia_pvp_queue%ROWTYPE;
    v_now timestamptz;
    v_res jsonb;
    v_attempts integer := 0;
    v_t_elo integer := 1200;
    v_t_wait numeric := 0;
BEGIN
    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
    IF NOT FOUND OR v_t.engine_version IS DISTINCT FROM 'pvp-v2' THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'ticket_not_found');
    END IF;
    IF v_t.status <> 'waiting' THEN
        RETURN jsonb_build_object('matched', v_t.status = 'matched', 'reason', 'not_waiting',
                                  'match_id', v_t.match_id);
    END IF;

    PERFORM public.trivia_pvp__bucket_lock(v_t.stake_amount, v_t.rules_version_id);
    v_now := COALESCE(p_now, clock_timestamp());
    SELECT * INTO v_cfg FROM public.trivia_pvp_engine_config WHERE id = 1;

    PERFORM public.trivia_pvp__expire_dead(v_t.stake_amount, v_t.rules_version_id, v_now);

    SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id FOR UPDATE;
    IF v_t.status <> 'waiting' THEN
        RETURN jsonb_build_object('matched', v_t.status = 'matched', 'reason', 'not_waiting',
                                  'match_id', v_t.match_id);
    END IF;
    -- Dead presence is never matched: not by a human claim, not by a horse.
    IF v_t.lease_expires_at <= v_now THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'presence_lapsed');
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats WHERE user_id = v_t.user_id) THEN
        RETURN jsonb_build_object('matched', false, 'reason', 'already_seated');
    END IF;

    -- Default unrated players to 1200 Elo. Widening windows on GREATEST(wait_a, wait_b):
    --   0 <= elapsed < 8s  : ABS(elo_a - elo_b) <= 150
    --   8 <= elapsed < 16s : ABS(elo_a - elo_b) <= 350
    --   elapsed >= 16s     : unlimited (always pairs humans before 20-45s horse fallback)
    SELECT COALESCE((SELECT r.elo FROM public.trivia_pvp_ratings AS r WHERE r.user_id = v_t.user_id), 1200)
      INTO v_t_elo;
    v_t_wait := GREATEST(0.0, EXTRACT(EPOCH FROM (v_now - v_t.joined_at)));

    -- 1) Closest-Elo compatible live human within widening search window, then oldest joined_at.
    LOOP
        v_attempts := v_attempts + 1;
        EXIT WHEN v_attempts > 25;
        SELECT q.* INTO v_o
          FROM public.trivia_pvp_queue AS q
          LEFT JOIN public.trivia_pvp_ratings AS rq ON rq.user_id = q.user_id
         WHERE q.engine_version = 'pvp-v2'
           AND q.status = 'waiting'
           AND q.stake_amount = v_t.stake_amount
           AND q.rules_version_id = v_t.rules_version_id
           AND q.id <> v_t.id
           AND q.user_id <> v_t.user_id
           AND q.lease_expires_at > v_now
           AND q.expires_at > v_now
           AND NOT EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats AS s WHERE s.user_id = q.user_id)
           AND (
               GREATEST(v_t_wait, GREATEST(0.0, EXTRACT(EPOCH FROM (v_now - q.joined_at)))) >= 16.0
               OR (
                   GREATEST(v_t_wait, GREATEST(0.0, EXTRACT(EPOCH FROM (v_now - q.joined_at)))) >= 8.0
                   AND ABS(v_t_elo - COALESCE(rq.elo, 1200)) <= 350
               )
               OR ABS(v_t_elo - COALESCE(rq.elo, 1200)) <= 150
           )
         ORDER BY ABS(v_t_elo - COALESCE(rq.elo, 1200)) ASC, q.joined_at ASC, q.id ASC
         LIMIT 1
         FOR UPDATE OF q;
        EXIT WHEN NOT FOUND;

        IF (v_o.joined_at, v_o.id) < (v_t.joined_at, v_t.id) THEN
            v_res := public.trivia_pvp__create_human_match(v_o.id, v_t.id, v_now);
        ELSE
            v_res := public.trivia_pvp__create_human_match(v_t.id, v_o.id, v_now);
        END IF;
        IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
            RETURN jsonb_build_object('matched', true, 'kind', 'human', 'match_id', v_res ->> 'match_id');
        END IF;
        -- A failed pairing ends only the ticket that could not fund its seat.
        SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
        IF v_t.status <> 'waiting' THEN
            RETURN jsonb_build_object('matched', false, 'reason', COALESCE(v_t.end_reason, 'ended'),
                                      'error', v_res ->> 'error');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.trivia_pvp_queue WHERE id = v_o.id AND status <> 'waiting') THEN
            -- Neither ticket ended: a non-funding failure. Stop; the next poll retries.
            RETURN jsonb_build_object('matched', false, 'reason', 'match_create_failed',
                                      'error', v_res ->> 'error');
        END IF;
    END LOOP;

    -- 2) Boundary: no human was claimable. A horse only after the stored deadline.
    IF COALESCE(p_horses_allowed, false) AND v_cfg.horses_enabled
       AND v_now >= v_t.horse_eligible_at THEN
        v_res := public.trivia_pvp__create_horse_match(v_t.id, v_now);
        IF COALESCE((v_res ->> 'ok')::boolean, false) THEN
            RETURN jsonb_build_object('matched', true, 'kind', 'horse', 'match_id', v_res ->> 'match_id');
        END IF;
        SELECT * INTO v_t FROM public.trivia_pvp_queue WHERE id = p_ticket_id;
        RETURN jsonb_build_object('matched', false,
                                  'reason', CASE WHEN v_t.status = 'waiting' THEN 'horse_unavailable'
                                                 ELSE COALESCE(v_t.end_reason, 'ended') END,
                                  'error', v_res ->> 'error');
    END IF;
    RETURN jsonb_build_object('matched', false, 'reason', 'searching');
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_pvp__try_match(uuid, boolean, timestamptz)
    FROM PUBLIC, anon, authenticated, service_role;

-- 3. FRIEND CHALLENGE CREATE (OPTIONAL INTENDED RECIPIENT) --------------------
DROP FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_create_v1(
    p_user_id uuid,
    p_stake_amount integer,
    p_expires_minutes integer DEFAULT 30,
    p_challenged_user_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_stake integer := COALESCE(p_stake_amount, 25);
    v_ttl integer := LEAST(GREATEST(COALESCE(p_expires_minutes, 30), 5), 1440);
    v_open_count integer := 0;
    v_code text;
    v_attempt integer := 0;
    v_row public.trivia_friend_challenges%ROWTYPE;
    v_display_name text;
    v_challenged_name text;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF v_stake NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake_amount');
    END IF;
    IF p_challenged_user_id IS NOT NULL THEN
        IF p_challenged_user_id = p_user_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'cannot_challenge_self');
        END IF;
        SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
          INTO v_challenged_name
          FROM public.profiles p
         WHERE p.id = p_challenged_user_id
           AND p.is_horse IS NOT TRUE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'challenged_user_not_found');
        END IF;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('trivia_friend_challenge:' || p_user_id::text));

    UPDATE public.trivia_friend_challenges
       SET status = 'expired', updated_at = now()
     WHERE challenger_id = p_user_id
       AND status = 'open'
       AND expires_at <= now();

    SELECT count(*)::integer INTO v_open_count
      FROM public.trivia_friend_challenges
     WHERE challenger_id = p_user_id
       AND status = 'open'
       AND expires_at > now();

    IF v_open_count >= 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'too_many_open_challenges', 'maxOpen', 5);
    END IF;

    LOOP
        v_attempt := v_attempt + 1;
        v_code := upper(substr(md5(gen_random_uuid()::text || ':' || clock_timestamp()::text || ':' || v_attempt::text), 1, 8));
        BEGIN
            INSERT INTO public.trivia_friend_challenges (
                challenge_code, challenger_id, challenged_user_id, stake_amount, status, expires_at
            ) VALUES (
                v_code, p_user_id, p_challenged_user_id, v_stake, 'open', now() + make_interval(mins => v_ttl)
            )
            RETURNING * INTO v_row;
            EXIT;
        EXCEPTION
            WHEN unique_violation THEN
                IF v_attempt >= 8 THEN
                    RETURN jsonb_build_object('success', false, 'error', 'code_generation_failed');
                END IF;
            WHEN foreign_key_violation THEN
                RETURN jsonb_build_object('success', false, 'error', 'challenged_user_not_found');
        END;
    END LOOP;

    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
      INTO v_display_name
      FROM public.profiles p
     WHERE p.id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'challenge', jsonb_build_object(
            'id', v_row.id,
            'challengeCode', v_row.challenge_code,
            'stakeAmount', v_row.stake_amount,
            'status', v_row.status,
            'matchId', v_row.match_id,
            'expiresAt', v_row.expires_at,
            'createdAt', v_row.created_at,
            'challengerDisplayName', COALESCE(v_display_name, 'Player'),
            'challengedDisplayName', v_challenged_name,
            'isTargeted', (v_row.challenged_user_id IS NOT NULL),
            'isOwner', true,
            'canAccept', false
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer, uuid)
    TO service_role;

-- 4. FRIEND CHALLENGE LOOKUP (TARGETED RECIPIENT AWARENESS) -------------------
CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_get_v1(
    p_challenge_code text,
    p_viewer_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_code text := upper(btrim(COALESCE(p_challenge_code, '')));
    v_row public.trivia_friend_challenges%ROWTYPE;
    v_effective_status text;
    v_challenger_name text;
    v_challenged_name text;
BEGIN
    IF v_code !~ '^[A-Z0-9]{6,16}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_challenge_code');
    END IF;

    SELECT * INTO v_row
      FROM public.trivia_friend_challenges
     WHERE challenge_code = v_code;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_not_found');
    END IF;

    v_effective_status := CASE
        WHEN v_row.status = 'open' AND v_row.expires_at <= now() THEN 'expired'
        ELSE v_row.status
    END;

    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
      INTO v_challenger_name
      FROM public.profiles p
     WHERE p.id = v_row.challenger_id;

    IF v_row.challenged_user_id IS NOT NULL THEN
        SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
          INTO v_challenged_name
          FROM public.profiles p
         WHERE p.id = v_row.challenged_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'challenge', jsonb_build_object(
            'id', v_row.id,
            'challengeCode', v_row.challenge_code,
            'stakeAmount', v_row.stake_amount,
            'status', v_effective_status,
            'matchId', v_row.match_id,
            'expiresAt', v_row.expires_at,
            'createdAt', v_row.created_at,
            'challengerDisplayName', COALESCE(v_challenger_name, 'Player'),
            'challengedDisplayName', v_challenged_name,
            'isTargeted', (v_row.challenged_user_id IS NOT NULL),
            'isOwner', (p_viewer_id IS NOT NULL AND v_row.challenger_id = p_viewer_id),
            'isChallenged', (p_viewer_id IS NOT NULL AND v_row.challenged_user_id = p_viewer_id),
            'canAccept', (
                v_effective_status = 'open'
                AND (p_viewer_id IS NULL OR v_row.challenger_id <> p_viewer_id)
                AND (v_row.challenged_user_id IS NULL OR p_viewer_id = v_row.challenged_user_id)
            )
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_get_v1(text, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_get_v1(text, uuid)
    TO service_role;

-- 5. FRIEND CHALLENGE ACCEPT (DIRECT PHASE 5 HUMAN-HUMAN PAIRING + ESCROW) ---
CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_accept_v1(
    p_user_id uuid,
    p_challenge_code text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_code text := upper(btrim(COALESCE(p_challenge_code, '')));
    v_row public.trivia_friend_challenges%ROWTYPE;
    v_now timestamptz := clock_timestamp();
    v_challenger_name text;
    v_challenged_name text;
    v_rules_version text;
    v_cfg public.trivia_pvp_engine_config%ROWTYPE;
    v_challenger_bal bigint;
    v_challenger_horse boolean;
    v_accepter_bal bigint;
    v_accepter_horse boolean;
    v_existing_ticket record;
    v_wait integer;
    v_ticket1 public.trivia_pvp_queue%ROWTYPE;
    v_ticket2 public.trivia_pvp_queue%ROWTYPE;
    v_match_id uuid;
    v_bind jsonb;
    v_sqlstate text;
    v_detail text;
    v_message text;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF v_code !~ '^[A-Z0-9]{6,16}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_challenge_code');
    END IF;

    SELECT * INTO v_row
      FROM public.trivia_friend_challenges
     WHERE challenge_code = v_code
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_not_found');
    END IF;
    IF v_row.challenger_id = p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_accept_own_challenge');
    END IF;

    -- Idempotent retry for the original accepter; refuse any second distinct user.
    IF v_row.status = 'accepted' THEN
        IF v_row.challenged_user_id = p_user_id THEN
            SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
              INTO v_challenger_name
              FROM public.profiles p
             WHERE p.id = v_row.challenger_id;
            SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
              INTO v_challenged_name
              FROM public.profiles p
             WHERE p.id = p_user_id;
            BEGIN
                SELECT rc.rules_version_id INTO v_rules_version
                  FROM public.trivia_rules_current rc
                 WHERE rc.rules_key = 'pvp.standard'
                 LIMIT 1;
            EXCEPTION WHEN OTHERS THEN
                v_rules_version := NULL;
            END;
            RETURN jsonb_build_object(
                'success', true,
                'replayed', true,
                'challenge', jsonb_build_object(
                    'id', v_row.id,
                    'challengeCode', v_row.challenge_code,
                    'stakeAmount', v_row.stake_amount,
                    'status', v_row.status,
                    'matchId', v_row.match_id,
                    'expiresAt', v_row.expires_at,
                    'createdAt', v_row.created_at,
                    'challengerDisplayName', COALESCE(v_challenger_name, 'Player'),
                    'challengedDisplayName', COALESCE(v_challenged_name, 'Player'),
                    'isTargeted', true,
                    'isOwner', false,
                    'isChallenged', true,
                    'canAccept', false
                ),
                'pvpHandoff', jsonb_build_object(
                    'stake', v_row.stake_amount,
                    'challengeCode', v_row.challenge_code,
                    'challengeId', v_row.id,
                    'matchId', v_row.match_id,
                    'paired', (v_row.match_id IS NOT NULL),
                    'rulesVersion', v_rules_version,
                    'quoteEndpoint', '/api/trivia/pvp/quote',
                    'joinEndpoint', '/api/trivia/pvp/join',
                    'resumeEndpoint', '/api/trivia/pvp/resume',
                    'route', '/hub/trivia/pvp?challenge=' || v_row.challenge_code || '&stake=' || v_row.stake_amount::text
                        || CASE WHEN v_row.match_id IS NOT NULL THEN '&match=' || v_row.match_id::text ELSE '' END
                ),
                'broadcastTargets', jsonb_build_object(
                    'challengerId', v_row.challenger_id,
                    'challengedUserId', v_row.challenged_user_id,
                    'matchId', v_row.match_id
                )
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'challenge_already_accepted', 'status', v_row.status);
    END IF;

    IF v_row.status = 'open' AND v_row.expires_at <= v_now THEN
        UPDATE public.trivia_friend_challenges
           SET status = 'expired', updated_at = v_now
         WHERE id = v_row.id;
        RETURN jsonb_build_object('success', false, 'error', 'challenge_expired');
    END IF;
    IF v_row.status = 'expired' THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_expired');
    END IF;
    IF v_row.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_cancelled', 'status', v_row.status);
    END IF;
    IF v_row.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_not_open', 'status', v_row.status);
    END IF;

    -- Intended-recipient guard for targeted challenges.
    IF v_row.challenged_user_id IS NOT NULL AND v_row.challenged_user_id <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'unauthorized_recipient');
    END IF;

    -- Deadlock-free user locking in deterministic UUID order.
    IF v_row.challenger_id < p_user_id THEN
        PERFORM public.trivia_pvp__user_lock(v_row.challenger_id);
        PERFORM public.trivia_pvp__user_lock(p_user_id);
    ELSE
        PERFORM public.trivia_pvp__user_lock(p_user_id);
        PERFORM public.trivia_pvp__user_lock(v_row.challenger_id);
    END IF;

    -- Lock active Phase 5 rules and engine config.
    SELECT c.rules_version_id INTO v_rules_version
      FROM public.trivia_rules_current AS c
     WHERE c.rules_key = 'pvp.standard'
     FOR SHARE OF c;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'rules_unavailable');
    END IF;

    SELECT * INTO v_cfg
      FROM public.trivia_pvp_engine_config
     WHERE id = 1
     FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_configuration_unavailable');
    END IF;
    IF NOT v_cfg.joins_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'pvp_joins_paused');
    END IF;

    -- Verify neither friend currently holds an active PvP seat.
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats WHERE user_id = v_row.challenger_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenger_already_in_match');
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_active_seats WHERE user_id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'accepter_already_in_match');
    END IF;

    -- Verify both profiles exist, are human accounts, and hold enough diamonds for escrow.
    SELECT COALESCE(p.diamonds, 0)::bigint, COALESCE(p.is_horse, false),
           COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
      INTO v_challenger_bal, v_challenger_horse, v_challenger_name
      FROM public.profiles p
     WHERE p.id = v_row.challenger_id;
    IF NOT FOUND OR v_challenger_horse THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenger_profile_not_found');
    END IF;
    IF v_challenger_bal < v_row.stake_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenger_insufficient_diamonds');
    END IF;

    SELECT COALESCE(p.diamonds, 0)::bigint, COALESCE(p.is_horse, false),
           COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
      INTO v_accepter_bal, v_accepter_horse, v_challenged_name
      FROM public.profiles p
     WHERE p.id = p_user_id;
    IF NOT FOUND OR v_accepter_horse THEN
        RETURN jsonb_build_object('success', false, 'error', 'accepter_profile_not_found');
    END IF;
    IF v_accepter_bal < v_row.stake_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'accepter_insufficient_diamonds');
    END IF;

    -- Atomically bind BOTH friends into a Phase 5 human_human match + escrow in one subtransaction.
    -- Neither ticket ever enters open public matchmaking or horse fallback.
    BEGIN
        PERFORM public.trivia_pvp__bucket_lock(v_row.stake_amount, v_rules_version);
        v_now := clock_timestamp();

        -- End any waiting public queue ticket for either friend so neither can match a stranger/horse.
        FOR v_existing_ticket IN
            SELECT q.id, q.lease_expires_at
              FROM public.trivia_pvp_queue AS q
             WHERE q.user_id IN (v_row.challenger_id, p_user_id)
               AND q.status = 'waiting'
             ORDER BY q.user_id, q.id
             FOR UPDATE OF q
        LOOP
            PERFORM public.trivia_pvp__end_ticket(
                v_existing_ticket.id,
                CASE WHEN v_existing_ticket.lease_expires_at <= v_now THEN 'lease_expired' ELSE 'cancelled' END,
                v_now
            );
        END LOOP;

        v_wait := public.trivia_pvp__draw_wait_seconds();

        PERFORM set_config('trivia_pvp.v2_authority', 'ticket:' || v_row.challenger_id::text, true);
        INSERT INTO public.trivia_pvp_queue (
            user_id, stake_amount, status, expires_at, created_at,
            engine_version, client_nonce, rules_version_id, joined_at,
            heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at
        ) VALUES (
            v_row.challenger_id, v_row.stake_amount, 'waiting',
            v_now + make_interval(secs => GREATEST(v_cfg.max_search_seconds, v_wait + 30)), v_now,
            'pvp-v2', gen_random_uuid(), v_rules_version, v_now,
            v_now, v_now + make_interval(secs => v_cfg.lease_seconds), v_wait,
            v_now + make_interval(secs => v_wait), v_now
        ) RETURNING * INTO v_ticket1;

        PERFORM set_config('trivia_pvp.v2_authority', 'ticket:' || p_user_id::text, true);
        INSERT INTO public.trivia_pvp_queue (
            user_id, stake_amount, status, expires_at, created_at,
            engine_version, client_nonce, rules_version_id, joined_at,
            heartbeat_at, lease_expires_at, horse_wait_seconds, horse_eligible_at, updated_at
        ) VALUES (
            p_user_id, v_row.stake_amount, 'waiting',
            v_now + make_interval(secs => GREATEST(v_cfg.max_search_seconds, v_wait + 30)), v_now,
            'pvp-v2', gen_random_uuid(), v_rules_version, v_now,
            v_now, v_now + make_interval(secs => v_cfg.lease_seconds), v_wait,
            v_now + make_interval(secs => v_wait), v_now
        ) RETURNING * INTO v_ticket2;

        v_match_id := gen_random_uuid();
        PERFORM set_config('trivia_pvp.v2_authority', v_match_id::text, true);

        v_bind := public.trivia_pvp__bind_match(
            v_match_id,
            'human_human',
            v_row.challenger_id,
            p_user_id,
            v_ticket1.id,
            v_ticket2.id,
            v_row.stake_amount,
            v_rules_version,
            v_now,
            NULL
        );

        UPDATE public.trivia_pvp_queue
           SET status = 'matched',
               match_id = v_match_id,
               matched_at = v_now,
               match_kind = 'human',
               ended_at = v_now,
               end_reason = 'matched',
               updated_at = GREATEST(updated_at, v_now)
         WHERE id IN (v_ticket1.id, v_ticket2.id);

        PERFORM public.trivia_pvp__log(
            v_match_id, t.id, t.user_id, 'system', 'match_created',
            jsonb_build_object(
                'kind', 'human_human',
                'source', 'friend_challenge',
                'challenge_id', v_row.id,
                'challenge_code', v_row.challenge_code,
                'side', t.side,
                'stake', v_row.stake_amount,
                'rules_version_id', v_rules_version,
                'waited_ms', 0,
                'roster_hash', v_bind ->> 'roster_hash'
            ),
            v_now
        )
          FROM (VALUES (1, v_ticket1.id, v_row.challenger_id),
                       (2, v_ticket2.id, p_user_id))
               AS t(side, id, user_id);

        PERFORM public.trivia_pvp__log(
            v_match_id, NULL, NULL, 'system', 'match_active',
            jsonb_build_object(
                'source', 'friend_challenge',
                'challenge_id', v_row.id,
                'sessions', v_bind -> 'sessions',
                'deadline_at', v_bind -> 'deadline_at'
            ),
            v_now
        );

        PERFORM set_config('trivia_pvp.v2_authority', '', true);

        UPDATE public.trivia_friend_challenges
           SET status = 'accepted',
               challenged_user_id = p_user_id,
               match_id = v_match_id,
               updated_at = v_now
         WHERE id = v_row.id
         RETURNING * INTO v_row;
    EXCEPTION
        WHEN SQLSTATE 'P5001' THEN
            GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
            PERFORM set_config('trivia_pvp.v2_authority', '', true);
            RETURN jsonb_build_object(
                'success', false,
                'error', CASE WHEN v_detail = '1' THEN 'challenger_insufficient_diamonds'
                              ELSE 'accepter_insufficient_diamonds' END
            );
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT,
                                    v_detail = PG_EXCEPTION_DETAIL;
            PERFORM set_config('trivia_pvp.v2_authority', '', true);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'match_create_failed',
                'sqlstate', v_sqlstate,
                'detail', left(COALESCE(v_detail, v_message, ''), 200)
            );
    END;

    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'challenge', jsonb_build_object(
            'id', v_row.id,
            'challengeCode', v_row.challenge_code,
            'stakeAmount', v_row.stake_amount,
            'status', v_row.status,
            'matchId', v_row.match_id,
            'expiresAt', v_row.expires_at,
            'createdAt', v_row.created_at,
            'challengerDisplayName', COALESCE(v_challenger_name, 'Player'),
            'challengedDisplayName', COALESCE(v_challenged_name, 'Player'),
            'isTargeted', true,
            'isOwner', false,
            'isChallenged', true,
            'canAccept', false
        ),
        'pvpHandoff', jsonb_build_object(
            'stake', v_row.stake_amount,
            'challengeCode', v_row.challenge_code,
            'challengeId', v_row.id,
            'matchId', v_row.match_id,
            'paired', true,
            'rulesVersion', v_rules_version,
            'quoteEndpoint', '/api/trivia/pvp/quote',
            'joinEndpoint', '/api/trivia/pvp/join',
            'resumeEndpoint', '/api/trivia/pvp/resume',
            'route', '/hub/trivia/pvp?challenge=' || v_row.challenge_code || '&stake=' || v_row.stake_amount::text || '&match=' || v_row.match_id::text
        ),
        'broadcastTargets', jsonb_build_object(
            'challengerId', v_row.challenger_id,
            'challengedUserId', v_row.challenged_user_id,
            'matchId', v_row.match_id
        )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_accept_v1(uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_accept_v1(uuid, text)
    TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

/* FORWARD ROLLBACK (Tier 3)
BEGIN;
-- Restore prior trivia_pvp__try_match, trivia_friend_challenge_create_v1 (3-arg),
-- trivia_friend_challenge_get_v1, and trivia_friend_challenge_accept_v1 from
-- supabase/migrations/20261124142600_trivia_friend_challenges_reminders_seasons.sql
-- and Phase 5 PvP migration, then NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
