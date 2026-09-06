-- ============================================================================
-- Trivia Phase 1 competitive production baseline
-- ============================================================================
-- Purpose:
--   Capture a repeatable, read-only, non-PII snapshot of the current PvP,
--   tournament, session, and diamond-settlement surfaces before containment
--   migrations are deployed.
--
-- Safety:
--   * This script executes in a READ ONLY transaction.
--   * It contains no INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DDL, RPC call,
--     temporary table, or sequence operation.
--   * Results contain aggregate counts and schema/catalog metadata only.
--   * User UUIDs, usernames, emails, raw transaction references, question
--     content, answer keys, and row-level metadata are never selected.
--
-- Run as a privileged production auditor and export every result set together
-- with its execution timestamp. Preserve the exported artifact and checksum in
-- docs/trivia/PHASE-1-RELEASE-REPORT.md.
-- ============================================================================

BEGIN TRANSACTION READ ONLY;

SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '60s';

-- 01. Capture context. Times are UTC regardless of the session time zone.
SELECT
    'capture_context' AS evidence_set,
    CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS captured_at_utc,
    current_setting('server_version') AS postgres_version,
    current_setting('TimeZone') AS session_timezone,
    current_setting('transaction_read_only') AS transaction_read_only;

-- 02. PvP match counts by terminal state and participant composition.
--     Profiles are joined only to classify each participant as human/horse;
--     no participant identifier is returned.
WITH classified_matches AS (
    SELECT
        m.status,
        m.created_at,
        m.completed_at,
        m.winner_id,
        m.challenger_id,
        m.opponent_id,
        CASE
            WHEN p1.id IS NULL OR p2.id IS NULL THEN 'missing_profile'
            WHEN COALESCE(p1.is_horse, false)
                 AND COALESCE(p2.is_horse, false) THEN 'horse_vs_horse'
            WHEN COALESCE(p1.is_horse, false)
                 OR COALESCE(p2.is_horse, false) THEN 'human_vs_horse'
            ELSE 'human_vs_human'
        END AS participant_mix
    FROM public.trivia_pvp_matches AS m
    LEFT JOIN public.profiles AS p1 ON p1.id = m.player1_id
    LEFT JOIN public.profiles AS p2 ON p2.id = m.player2_id
)
SELECT
    'pvp_matches_by_status_and_mix' AS evidence_set,
    status,
    participant_mix,
    COUNT(*)::bigint AS match_count,
    COUNT(*) FILTER (WHERE winner_id IS NOT NULL)::bigint AS winner_recorded_count,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed_at_recorded_count,
    COUNT(*) FILTER (WHERE challenger_id IS NOT NULL)::bigint AS player1_link_value_count,
    COUNT(*) FILTER (WHERE opponent_id IS NOT NULL)::bigint AS player2_link_value_count,
    MIN(created_at) AS first_created_at,
    MAX(created_at) AS last_created_at
FROM classified_matches
GROUP BY status, participant_mix
ORDER BY status, participant_mix;

-- 03. Validate the overloaded legacy PvP link columns without returning IDs.
--     In the live contract challenger_id/opponent_id are session links, while
--     player1_id/player2_id are participant IDs. A populated link must resolve
--     to a PvP session owned by the participant in the corresponding slot.
WITH match_link_audit AS (
    SELECT
        m.challenger_id,
        m.opponent_id,
        s1.id AS player1_session_id,
        s2.id AS player2_session_id,
        s1.user_id AS player1_session_owner,
        s2.user_id AS player2_session_owner,
        s1.mode AS player1_session_mode,
        s2.mode AS player2_session_mode,
        m.player1_id,
        m.player2_id
    FROM public.trivia_pvp_matches AS m
    LEFT JOIN public.trivia_sessions AS s1 ON s1.id = m.challenger_id
    LEFT JOIN public.trivia_sessions AS s2 ON s2.id = m.opponent_id
)
SELECT
    'pvp_session_link_integrity' AS evidence_set,
    COUNT(*)::bigint AS match_count,
    COUNT(*) FILTER (
        WHERE challenger_id IS NOT NULL
    )::bigint AS populated_player1_links,
    COUNT(*) FILTER (
        WHERE opponent_id IS NOT NULL
    )::bigint AS populated_player2_links,
    COUNT(*) FILTER (
        WHERE challenger_id IS NOT NULL AND player1_session_id IS NULL
    )::bigint AS unresolved_player1_links,
    COUNT(*) FILTER (
        WHERE opponent_id IS NOT NULL AND player2_session_id IS NULL
    )::bigint AS unresolved_player2_links,
    COUNT(*) FILTER (
        WHERE player1_session_id IS NOT NULL
          AND (
              player1_session_owner IS DISTINCT FROM player1_id
              OR player1_session_mode IS DISTINCT FROM 'pvp'
          )
    )::bigint AS mismatched_player1_links,
    COUNT(*) FILTER (
        WHERE player2_session_id IS NOT NULL
          AND (
              player2_session_owner IS DISTINCT FROM player2_id
              OR player2_session_mode IS DISTINCT FROM 'pvp'
          )
    )::bigint AS mismatched_player2_links
FROM match_link_audit;

-- 04. Matchmaking queue lifecycle. No user or match identifier is selected.
SELECT
    'pvp_queue_by_status' AS evidence_set,
    status,
    COUNT(*)::bigint AS queue_row_count,
    COUNT(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP)::bigint AS past_expiry_count,
    COUNT(*) FILTER (WHERE match_id IS NOT NULL)::bigint AS match_linked_count,
    MIN(created_at) AS first_created_at,
    MAX(created_at) AS last_created_at,
    MIN(expires_at) AS first_expires_at,
    MAX(expires_at) AS last_expires_at
FROM public.trivia_pvp_queue
GROUP BY status
ORDER BY status;

-- 05. Detect duplicate live queue records and stale waiting records in aggregate.
SELECT
    'pvp_queue_invariants' AS evidence_set,
    COUNT(*) FILTER (
        WHERE status = 'waiting' AND expires_at > CURRENT_TIMESTAMP
    )::bigint AS live_waiting_rows,
    COUNT(*) FILTER (
        WHERE status = 'waiting' AND expires_at <= CURRENT_TIMESTAMP
    )::bigint AS stale_waiting_rows,
    (
        SELECT COUNT(*)::bigint
        FROM (
            SELECT user_id
            FROM public.trivia_pvp_queue
            WHERE status = 'waiting'
            GROUP BY user_id
            HAVING COUNT(*) > 1
        ) AS duplicate_users
    ) AS users_with_multiple_waiting_rows
FROM public.trivia_pvp_queue;

-- 06. PvP grading-session counts. Only mode/status aggregates are returned.
SELECT
    'pvp_sessions_by_status' AS evidence_set,
    status,
    COUNT(*)::bigint AS session_count,
    COUNT(*) FILTER (
        WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
    )::bigint AS past_expiry_count,
    COUNT(*) FILTER (
        WHERE submitted_at IS NOT NULL
    )::bigint AS submitted_at_recorded_count,
    COUNT(*) FILTER (
        WHERE correct_count IS NOT NULL
    )::bigint AS graded_count,
    COALESCE(SUM(entry_cost), 0)::bigint AS recorded_entry_cost
FROM public.trivia_sessions
WHERE mode = 'pvp'
GROUP BY status
ORDER BY status;

-- 07. PvP session entry-state counts expose charged/free inconsistencies without
--     revealing session owners.
SELECT
    'pvp_sessions_by_entry_state' AS evidence_set,
    entry_state,
    COUNT(*)::bigint AS session_count,
    COUNT(*) FILTER (WHERE status = 'open')::bigint AS open_count,
    COUNT(*) FILTER (WHERE status = 'submitted')::bigint AS submitted_count,
    COUNT(*) FILTER (WHERE status = 'expired')::bigint AS expired_count,
    COALESCE(SUM(entry_cost), 0)::bigint AS recorded_entry_cost
FROM public.trivia_sessions
WHERE mode = 'pvp'
GROUP BY entry_state
ORDER BY entry_state;

-- 08. All competitive diamond movements by canonical movement type.
--     Raw reference values and metadata are deliberately omitted.
WITH competitive_transactions AS (
    SELECT
        COALESCE(
            NULLIF(BTRIM(transaction_type), ''),
            NULLIF(BTRIM(type), '')
        ) AS movement_type,
        amount,
        reference_id,
        created_at
    FROM public.diamond_transactions
    WHERE COALESCE(
        NULLIF(BTRIM(transaction_type), ''),
        NULLIF(BTRIM(type), '')
    ) IN (
        'pvp_stake',
        'pvp_refund',
        'pvp_win',
        'pvp_tie_refund',
        'tournament_entry',
        'tournament_entry_refund',
        'tournament_cancel_refund',
        'tournament_prize'
    )
)
SELECT
    'competitive_diamond_transactions' AS evidence_set,
    movement_type,
    COUNT(*)::bigint AS transaction_count,
    COALESCE(SUM(amount), 0)::bigint AS net_amount,
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::bigint AS credited_amount,
    COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)::bigint AS debited_amount,
    COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(reference_id), '') IS NULL
    )::bigint AS missing_reference_count,
    COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(reference_id), '') IS NOT NULL
    )::bigint AS referenced_count,
    MIN(created_at) AS first_created_at,
    MAX(created_at) AS last_created_at
FROM competitive_transactions
GROUP BY movement_type
ORDER BY movement_type;

-- 09. Duplicate idempotency references, aggregated by movement type.
--     The active diamond RPC deduplicates per user/reference, so that exact
--     scope is used here. No user ID or reference value is returned.
WITH competitive_transactions AS (
    SELECT
        COALESCE(
            NULLIF(BTRIM(transaction_type), ''),
            NULLIF(BTRIM(type), '')
        ) AS movement_type,
        user_id,
        reference_id
    FROM public.diamond_transactions
    WHERE COALESCE(
        NULLIF(BTRIM(transaction_type), ''),
        NULLIF(BTRIM(type), '')
    ) IN (
        'pvp_stake',
        'pvp_refund',
        'pvp_win',
        'pvp_tie_refund',
        'tournament_entry',
        'tournament_entry_refund',
        'tournament_cancel_refund',
        'tournament_prize'
    )
      AND NULLIF(BTRIM(reference_id), '') IS NOT NULL
),
duplicate_groups AS (
    SELECT
        movement_type,
        user_id,
        reference_id,
        COUNT(*)::bigint AS row_count
    FROM competitive_transactions
    GROUP BY movement_type, user_id, reference_id
    HAVING COUNT(*) > 1
)
SELECT
    'competitive_duplicate_references' AS evidence_set,
    movement_type,
    COUNT(*)::bigint AS duplicate_user_reference_groups,
    COALESCE(SUM(row_count - 1), 0)::bigint AS duplicate_rows_beyond_first
FROM duplicate_groups
GROUP BY movement_type
ORDER BY movement_type;

-- 10. Tournament lifecycle summary.
SELECT
    'tournament_lifecycle_summary' AS evidence_set,
    COUNT(*)::bigint AS tournament_count,
    COUNT(*) FILTER (
        WHERE status IN ('upcoming', 'registration', 'active')
    )::bigint AS upcoming_or_active_count,
    COUNT(*) FILTER (
        WHERE status IN ('complete', 'completed')
    )::bigint AS completed_count,
    COUNT(*) FILTER (
        WHERE status = 'cancelled'
    )::bigint AS cancelled_count,
    COUNT(*) FILTER (
        WHERE start_time >= CURRENT_TIMESTAMP - INTERVAL '90 days'
    )::bigint AS started_or_scheduled_last_90_days,
    COALESCE(SUM(prize_pool), 0)::bigint AS recorded_prize_pool_total,
    COALESCE(SUM(current_players), 0)::bigint AS recorded_current_players_total,
    MIN(start_time) AS first_start_time,
    MAX(start_time) AS last_start_time
FROM public.trivia_tournaments;

-- 11. Tournament counts by status, including recorded prize-pool totals.
SELECT
    'tournaments_by_status' AS evidence_set,
    status,
    COUNT(*)::bigint AS tournament_count,
    COALESCE(SUM(prize_pool), 0)::bigint AS recorded_prize_pool,
    COALESCE(SUM(current_players), 0)::bigint AS recorded_current_players,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed_at_count,
    MIN(start_time) AS first_start_time,
    MAX(start_time) AS last_start_time
FROM public.trivia_tournaments
GROUP BY status
ORDER BY status;

-- 12. Tournament entries by event status and human/horse classification.
--     This also makes missing ranks or payouts visible without exposing entrants.
WITH classified_entries AS (
    SELECT
        t.status AS tournament_status,
        CASE
            WHEN p.id IS NULL THEN 'missing_profile'
            WHEN COALESCE(p.is_horse, false) THEN 'horse'
            ELSE 'human'
        END AS entrant_type,
        e.rank,
        e.payout,
        e.completed_at
    FROM public.trivia_tournament_entries AS e
    JOIN public.trivia_tournaments AS t ON t.id = e.tournament_id
    LEFT JOIN public.profiles AS p ON p.id = e.user_id
)
SELECT
    'tournament_entries_by_status_and_type' AS evidence_set,
    tournament_status,
    entrant_type,
    COUNT(*)::bigint AS entry_count,
    COUNT(*) FILTER (WHERE rank IS NULL)::bigint AS missing_rank_count,
    COUNT(*) FILTER (WHERE rank IS NOT NULL)::bigint AS ranked_count,
    COUNT(*) FILTER (WHERE payout > 0)::bigint AS paid_entry_count,
    COALESCE(SUM(payout), 0)::bigint AS recorded_payout_total,
    COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::bigint AS completed_entry_count
FROM classified_entries
GROUP BY tournament_status, entrant_type
ORDER BY tournament_status, entrant_type;

-- 13. Reconcile every tournament's persisted counters/pool/payouts in aggregate.
--     No tournament ID or name is returned.
WITH entry_rollup AS (
    SELECT
        tournament_id,
        COUNT(*)::bigint AS entry_count,
        COUNT(*) FILTER (WHERE rank IS NULL)::bigint AS missing_rank_count,
        COALESCE(SUM(payout), 0)::bigint AS payout_total
    FROM public.trivia_tournament_entries
    GROUP BY tournament_id
),
tournament_audit AS (
    SELECT
        t.status,
        COALESCE(e.entry_count, 0) AS entry_count,
        COALESCE(e.missing_rank_count, 0) AS missing_rank_count,
        COALESCE(e.payout_total, 0) AS payout_total,
        COALESCE(t.prize_pool, 0) AS prize_pool,
        COALESCE(t.current_players, 0) AS current_players
    FROM public.trivia_tournaments AS t
    LEFT JOIN entry_rollup AS e ON e.tournament_id = t.id
)
SELECT
    'tournament_reconciliation' AS evidence_set,
    status,
    COUNT(*)::bigint AS tournament_count,
    COUNT(*) FILTER (
        WHERE current_players IS DISTINCT FROM entry_count
    )::bigint AS player_counter_mismatch_count,
    COUNT(*) FILTER (
        WHERE status IN ('complete', 'completed')
          AND missing_rank_count > 0
    )::bigint AS completed_with_missing_ranks_count,
    COUNT(*) FILTER (
        WHERE status IN ('complete', 'completed')
          AND prize_pool > 0
          AND payout_total = 0
    )::bigint AS completed_funded_without_payout_count,
    COUNT(*) FILTER (
        WHERE status IN ('complete', 'completed')
          AND payout_total IS DISTINCT FROM prize_pool
    )::bigint AS completed_pool_payout_mismatch_count,
    COALESCE(SUM(entry_count), 0)::bigint AS entry_count,
    COALESCE(SUM(prize_pool), 0)::bigint AS prize_pool,
    COALESCE(SUM(payout_total), 0)::bigint AS recorded_payout
FROM tournament_audit
GROUP BY status
ORDER BY status;

-- 14. RLS enablement and forced-RLS state for the competitive tables.
SELECT
    'competitive_rls_state' AS evidence_set,
    n.nspname AS table_schema,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'trivia_pvp_stats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY c.relname;

-- 15. Exact RLS policy inventory. Expressions are schema definitions, not data.
SELECT
    'competitive_rls_policies' AS evidence_set,
    schemaname AS table_schema,
    tablename AS table_name,
    policyname AS policy_name,
    permissive,
    ARRAY_TO_STRING(roles, ',') AS roles,
    cmd,
    qual,
    with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'trivia_pvp_stats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY tablename, policyname;

-- 16. Table-level grants visible to browser and service roles.
SELECT
    'competitive_table_grants' AS evidence_set,
    table_schema,
    table_name,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'trivia_pvp_stats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournaments_public',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;

-- 17. Column-level grants catch answer-key or money-field exposures that a
--     table-grant-only audit would miss.
SELECT
    'competitive_column_grants' AS evidence_set,
    table_schema,
    table_name,
    column_name,
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_column_grants
WHERE table_schema = 'public'
  AND table_name IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, column_name, grantee, privilege_type;

-- 18. Function ownership and effective EXECUTE access. Function bodies are not
--     executed; has_function_privilege is a catalog permission check.
SELECT
    'competitive_function_acls' AS evidence_set,
    n.nspname AS function_schema,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
    p.prosecdef AS security_definer,
    p.proconfig AS function_settings,
    p.proacl::text AS explicit_acl,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname::text = ANY (ARRAY[
      'add_diamonds_to_balance',
      'award_trivia_run',
      'award_trivia_run_v2',
      'create_trivia_pvp_session_v2',
      'decide_trivia_pvp_settlement_v1',
      'enter_trivia_tournament_v2',
      'expire_old_queue_entries',
      'fn_trivia_pvp_match_sync_columns',
      'prevent_linked_trivia_pvp_identity_change',
      'prevent_linked_trivia_session_identity_change',
      'sync_trivia_pvp_active_seats',
      'validate_trivia_pvp_session_link',
      'prevent_competitive_evidence_mutation',
      'fn_trivia_pvp_record_result',
      'fn_trivia_round_set_matchup_score',
      'fn_trivia_round_submit_verified_v3',
      'fn_trivia_tournament_add_entry_score',
      'fn_trivia_tournament_payout',
      'record_trivia_pvp_stats_v2',
      'record_trivia_session_answer'
  ]::text[])
ORDER BY p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

-- 19. Critical alias-trigger body and fingerprint. The assignment booleans make
--     the production-vs-replay defect explicit: the approved live definition
--     mirrors score aliases but must not assign participant/session aliases.
SELECT
    'pvp_alias_trigger_function' AS evidence_set,
    p.proname AS function_name,
    MD5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_md5,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]player1_id[[:space:]]*:=' AS assigns_player1_id,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]player2_id[[:space:]]*:=' AS assigns_player2_id,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]challenger_id[[:space:]]*:=' AS assigns_challenger_id,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]opponent_id[[:space:]]*:=' AS assigns_opponent_id,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]player1_score[[:space:]]*:=' AS assigns_player1_score,
    pg_catalog.pg_get_functiondef(p.oid)
        ~ 'NEW[.]player2_score[[:space:]]*:=' AS assigns_player2_score,
    pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_trivia_pvp_match_sync_columns'
ORDER BY pg_catalog.pg_get_function_identity_arguments(p.oid);

-- 20. Trigger inventory proves which function is actually attached and enabled.
SELECT
    'competitive_triggers' AS evidence_set,
    n.nspname AS table_schema,
    c.relname AS table_name,
    t.tgname AS trigger_name,
    CASE t.tgenabled
        WHEN 'O' THEN 'origin'
        WHEN 'D' THEN 'disabled'
        WHEN 'R' THEN 'replica'
        WHEN 'A' THEN 'always'
        ELSE t.tgenabled::text
    END AS enabled_mode,
    pg_catalog.pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
  AND n.nspname = 'public'
  AND c.relname IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY c.relname, t.tgname;

-- 21. Constraint definitions and validation state.
SELECT
    'competitive_constraints' AS evidence_set,
    n.nspname AS table_schema,
    c.relname AS table_name,
    con.conname AS constraint_name,
    CASE con.contype
        WHEN 'c' THEN 'check'
        WHEN 'f' THEN 'foreign_key'
        WHEN 'p' THEN 'primary_key'
        WHEN 'u' THEN 'unique'
        WHEN 'x' THEN 'exclusion'
        ELSE con.contype::text
    END AS constraint_type,
    con.convalidated AS validated,
    con.condeferrable AS deferrable,
    con.condeferred AS initially_deferred,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'trivia_pvp_stats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY c.relname, con.conname;

-- 22. Index inventory, including partial one-active-record/idempotency indexes.
SELECT
    'competitive_indexes' AS evidence_set,
    schemaname AS table_schema,
    tablename AS table_name,
    indexname AS index_name,
    indexdef AS index_definition
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'trivia_pvp_stats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY tablename, indexname;

-- 23. Column contract for the schema-drift-sensitive tables. Defaults and
--     generated-column state are metadata, not row data.
SELECT
    'competitive_column_contract' AS evidence_set,
    table_schema,
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default,
    is_generated,
    generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'trivia_tournament_rounds',
      'diamond_transactions'
  )
ORDER BY table_name, ordinal_position;

-- 24. Realtime publication membership. A new internal containment table must
--     not become a browser subscription surface by accident.
SELECT
    'competitive_publications' AS evidence_set,
    pubname AS publication_name,
    schemaname AS table_schema,
    tablename AS table_name
FROM pg_catalog.pg_publication_tables
WHERE schemaname = 'public'
  AND tablename IN (
      'trivia_pvp_matches',
      'trivia_pvp_queue',
      'trivia_pvp_session_links',
      'trivia_pvp_active_seats',
      'competitive_quarantine',
      'trivia_pvp_settlement_decisions',
      'trivia_sessions',
      'trivia_tournaments',
      'trivia_tournament_entries',
      'diamond_transactions'
  )
ORDER BY pubname, tablename;

-- 25. Compact non-PII postcondition summary. Every boolean is expected true
--     after Phase 1 except publication booleans, which must be false for the
--     three internal-only tables.
SELECT
    'phase1_compact_postconditions' AS evidence_set,
    to_regclass('public.trivia_pvp_session_links') IS NOT NULL AS links_exist,
    to_regclass('public.trivia_pvp_active_seats') IS NOT NULL AS seats_exist,
    to_regclass('public.competitive_quarantine') IS NOT NULL AS quarantine_exists,
    to_regclass('public.trivia_pvp_settlement_decisions') IS NOT NULL AS decisions_exist,
    to_regprocedure('public.decide_trivia_pvp_settlement_v1(uuid,boolean)') IS NOT NULL
        AS atomic_settlement_exists,
    NOT has_table_privilege('anon', 'public.trivia_pvp_matches', 'SELECT')
        AS anon_match_read_denied,
    NOT has_table_privilege('anon', 'public.trivia_pvp_queue', 'SELECT')
        AS anon_queue_read_denied,
    NOT has_table_privilege('authenticated', 'public.trivia_pvp_matches', 'INSERT,UPDATE,DELETE')
        AS browser_match_writes_denied,
    NOT has_table_privilege('authenticated', 'public.trivia_pvp_queue', 'INSERT,UPDATE,DELETE')
        AS browser_queue_writes_denied,
    NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_publication_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'trivia_pvp_session_links',
              'trivia_pvp_active_seats',
              'competitive_quarantine',
              'trivia_pvp_settlement_decisions'
          )
    ) AS internal_tables_not_published;

-- 26. Final one-row aggregate. The Supabase Management API returns the final
--     result set, so keeping this last makes every execution independently
--     timestamped and reviewable even when earlier result sets are suppressed.
SELECT
    'phase1_capture_summary' AS evidence_set,
    (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::text AS captured_at_utc,
    (SELECT COUNT(*) FROM public.trivia_pvp_matches)::bigint AS pvp_matches,
    (SELECT COUNT(*) FROM public.trivia_pvp_matches WHERE status = 'abandoned')::bigint
        AS pvp_abandoned,
    (SELECT COUNT(*) FROM public.trivia_pvp_matches WHERE status IN ('active', 'settling'))::bigint
        AS pvp_open,
    (SELECT COUNT(*) FROM public.trivia_pvp_queue)::bigint AS pvp_queue,
    (SELECT COUNT(*) FROM public.trivia_pvp_queue WHERE status = 'waiting')::bigint
        AS pvp_waiting,
    (SELECT COUNT(*) FROM public.trivia_sessions WHERE mode = 'pvp')::bigint
        AS pvp_sessions,
    (SELECT COUNT(*) FROM public.trivia_tournaments)::bigint AS tournaments,
    (SELECT COUNT(*) FROM public.trivia_tournaments WHERE status IN ('upcoming', 'active'))::bigint
        AS tournaments_open,
    (SELECT COUNT(*) FROM public.trivia_tournament_entries)::bigint AS tournament_entries,
    (SELECT COUNT(*) FROM public.diamond_transactions
      WHERE COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) = 'pvp_refund')::bigint
        AS pvp_refund_rows,
    (SELECT COALESCE(SUM(amount), 0) FROM public.diamond_transactions
      WHERE COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) = 'pvp_refund')::bigint
        AS pvp_refund_net,
    (SELECT COUNT(*) FROM public.diamond_transactions
      WHERE COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) = 'pvp_stake')::bigint
        AS pvp_stake_rows,
    (SELECT COALESCE(SUM(amount), 0) FROM public.diamond_transactions
      WHERE COALESCE(NULLIF(BTRIM(transaction_type), ''), NULLIF(BTRIM(type), '')) = 'pvp_stake')::bigint
        AS pvp_stake_net,
    (SELECT MD5(pg_catalog.pg_get_functiondef(p.oid))
       FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'fn_trivia_pvp_match_sync_columns'
      ORDER BY p.oid
      LIMIT 1) AS trigger_function_md5,
    to_regclass('public.trivia_pvp_session_links') IS NOT NULL AS links_exist,
    to_regclass('public.trivia_pvp_active_seats') IS NOT NULL AS seats_exist,
    to_regclass('public.competitive_quarantine') IS NOT NULL AS quarantine_exists,
    to_regclass('public.trivia_pvp_settlement_decisions') IS NOT NULL AS decisions_exist,
    to_regprocedure('public.decide_trivia_pvp_settlement_v1(uuid,boolean)') IS NOT NULL
        AS atomic_settlement_exists;

COMMIT;
