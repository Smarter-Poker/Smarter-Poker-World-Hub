-- ============================================================================
-- 20261005124500_trivia_p7_pvp_history_receipts.sql
-- ============================================================================
-- TIER:         3
-- AUTHOR:       Codex Phase 7
-- AFFECTS:      service-only viewer-scoped PvP history read
-- IRREVERSIBLE: no
--
-- Phase 7 keeps a settled PvP result available after the short live-result
-- window. The database, not the browser, binds each row to the authenticated
-- participant and derives the same immutable stake, settlement and player
-- credit references used by the live result DTO. No queue identity, opponent
-- id, roster, answer, session id, horse plan or answer key leaves this RPC.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $preflight$
BEGIN
    IF to_regclass('public.trivia_pvp_matches') IS NULL
       OR to_regclass('public.trivia_pvp_settlement_decisions') IS NULL
       OR to_regclass('public.profiles') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp history preflight: Phase 5 relations are missing';
    END IF;
    IF to_regprocedure('public.trivia_pvp_status_v2(uuid,uuid,boolean)') IS NULL
       OR to_regprocedure('public.trivia_pvp_quote_v3(uuid)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp history preflight: Phase 5/7 functions are missing';
    END IF;
    IF to_regprocedure('public.trivia_pvp_history_v1(uuid,integer,integer)') IS NOT NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp history preflight: target function already exists';
    END IF;
END
$preflight$;

CREATE FUNCTION public.trivia_pvp_history_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 10,
    p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total bigint := 0;
    v_items jsonb := '[]'::jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
    END IF;
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
    END IF;
    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20
       OR p_offset IS NULL OR p_offset < 0 OR p_offset > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_pagination');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = p_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
    END IF;

    SELECT count(*)
      INTO v_total
      FROM public.trivia_pvp_matches AS m
      JOIN public.trivia_pvp_settlement_decisions AS d ON d.match_id = m.id
     WHERE m.engine_version = 'pvp-v2'
       AND m.status IN ('complete', 'completed')
       AND m.completed_at IS NOT NULL
       AND p_user_id IN (m.player1_id, m.player2_id);

    SELECT COALESCE(jsonb_agg(page.item ORDER BY page.completed_at DESC, page.match_id DESC), '[]'::jsonb)
      INTO v_items
      FROM (
          SELECT m.id AS match_id,
                 m.completed_at,
                 jsonb_build_object(
                     'settled_at', m.completed_at,
                     'rules_version_id', m.rules_version_id,
                     'opponent', jsonb_build_object(
                         'kind', CASE WHEN COALESCE(opponent.is_horse, false) THEN 'horse' ELSE 'human' END,
                         'is_horse', COALESCE(opponent.is_horse, false),
                         'label', CASE WHEN COALESCE(opponent.is_horse, false) THEN 'Smarter Horse' ELSE 'Player' END,
                         'display_name', CASE WHEN COALESCE(opponent.is_horse, false) THEN 'Smarter Horse'
                             ELSE COALESCE(NULLIF(btrim(opponent.display_name), ''),
                                           NULLIF(btrim(opponent.username), ''), 'Player') END),
                     'outcome', CASE
                         WHEN d.decision_kind = 'win' AND d.winner_id = p_user_id THEN 'win'
                         WHEN d.decision_kind = 'win' THEN 'loss'
                         WHEN d.decision_kind = 'tie' THEN 'tie'
                         WHEN d.decision_kind = 'refund' AND credits.amount > 0 THEN 'refund'
                         ELSE 'void' END,
                     'decision', d.decision_kind,
                     'forfeit', COALESCE(d.forfeit, false),
                     'my_correct', CASE WHEN m.player1_id = p_user_id THEN d.player1_score ELSE d.player2_score END,
                     'opponent_correct', CASE WHEN m.player1_id = p_user_id THEN d.player2_score ELSE d.player1_score END,
                     'stake', m.stake_amount,
                     'pot', m.stake_amount * 2,
                     'rake', rake.amount,
                     'payout', credits.amount,
                     'net', credits.amount - m.stake_amount,
                     'receipts', credits.receipts,
                     'stake_reference', 'pvp_stake_' || m.id::text || '_' || p_user_id::text,
                     'settlement_reference', d.reference_family
                 ) AS item
            FROM public.trivia_pvp_matches AS m
            JOIN public.trivia_pvp_settlement_decisions AS d ON d.match_id = m.id
            JOIN public.profiles AS opponent
              ON opponent.id = CASE WHEN m.player1_id = p_user_id THEN m.player2_id ELSE m.player1_id END
            LEFT JOIN LATERAL (
                SELECT COALESCE(sum((leg.value ->> 'amount')::integer), 0)::integer AS amount,
                       COALESCE(jsonb_agg(jsonb_build_object(
                           'reference', leg.value ->> 'reference_id',
                           'kind', leg.value ->> 'transaction_type',
                           'amount', (leg.value ->> 'amount')::integer)
                           ORDER BY leg.value ->> 'reference_id'), '[]'::jsonb) AS receipts
                  FROM jsonb_array_elements(COALESCE(d.credit_plan, '[]'::jsonb)) AS leg(value)
                 WHERE leg.value ->> 'user_id' = p_user_id::text
                   AND COALESCE(leg.value ->> 'leg', 'player_credit') = 'player_credit'
            ) AS credits ON true
            LEFT JOIN LATERAL (
                SELECT COALESCE(sum((leg.value ->> 'amount')::integer), 0)::integer AS amount
                  FROM jsonb_array_elements(COALESCE(d.credit_plan, '[]'::jsonb)) AS leg(value)
                 WHERE leg.value ->> 'leg' = 'rake'
            ) AS rake ON true
           WHERE m.engine_version = 'pvp-v2'
             AND m.status IN ('complete', 'completed')
             AND m.completed_at IS NOT NULL
             AND p_user_id IN (m.player1_id, m.player2_id)
           ORDER BY m.completed_at DESC, m.id DESC
           LIMIT p_limit OFFSET p_offset
      ) AS page;

    RETURN jsonb_build_object(
        'success', true,
        'engine', 'pvp-v2',
        'server_now', clock_timestamp(),
        'total', v_total,
        'offset', p_offset,
        'limit', p_limit,
        'items', v_items
    );
END;
$$;

ALTER FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer) IS
    'Phase 7 service-only viewer-scoped settled PvP history with immutable transaction references and disclosed Smarter Horses.';

DO $postcondition$
BEGIN
    IF to_regprocedure('public.trivia_pvp_history_v1(uuid,integer,integer)') IS NULL THEN
        RAISE EXCEPTION 'trivia p7 pvp history postcondition: function is missing';
    END IF;
    IF NOT has_function_privilege('service_role',
            'public.trivia_pvp_history_v1(uuid,integer,integer)', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.trivia_pvp_history_v1(uuid,integer,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated',
            'public.trivia_pvp_history_v1(uuid,integer,integer)', 'EXECUTE') THEN
        RAISE EXCEPTION 'trivia p7 pvp history postcondition: function ACL drift';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_proc AS p
          JOIN pg_namespace AS n ON n.oid = p.pronamespace
          JOIN pg_roles AS r ON r.oid = p.proowner
         WHERE n.nspname = 'public'
           AND p.proname = 'trivia_pvp_history_v1'
           AND (NOT p.prosecdef
                OR r.rolname <> 'postgres'
                OR NOT ('search_path=""' = ANY(COALESCE(p.proconfig, ARRAY[]::text[]))))
    ) THEN
        RAISE EXCEPTION 'trivia p7 pvp history postcondition: ownership/definer/search_path drift';
    END IF;
END
$postcondition$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Rollback in a NEW migration:
-- REVOKE ALL ON FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer)
--     FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION public.trivia_pvp_history_v1(uuid, integer, integer);
