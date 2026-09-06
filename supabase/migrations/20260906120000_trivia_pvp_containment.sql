-- ============================================================================
-- 20260906120000_trivia_pvp_containment.sql
-- ============================================================================
-- TIER:         3 (diamond-moving PvP boundary)
-- AUTHOR:       Codex / World Hub Phase 1
-- AFFECTS:      trivia_pvp_queue, trivia_pvp_matches,
--               trivia_pvp_session_links, trivia_pvp_settlement_decisions,
--               competitive_quarantine, trivia_sessions, trivia_tournaments,
--               create_trivia_pvp_session_v2, award_trivia_run[_v2]
-- IRREVERSIBLE: yes (security boundary; emergency rollback is forward-only)
--
-- PvP matchmaking still ran in the browser: an authenticated client could
-- select another waiting player, create the wager-bearing match and mutate
-- both queue rows. Match writes had been revoked in phase 80, which made the
-- shipped flow both unsafe by design and non-functional in practice.
--
-- Containment rules:
--   * browsers may read only their own queue row and participant match rows;
--   * every queue/match mutation is service-role only;
--   * a PvP session is linked through a dedicated relation with one session
--     per match side and global session uniqueness;
--   * escrow + session + binding remain one atomic service-role RPC;
--   * the alias trigger is reduced to score aliases only. Participant ids and
--     session ids are never mirrored into one another;
--   * active seats are normalized behind a unique user constraint so a player
--     cannot occupy two active/settling matches concurrently.
--
-- The application release control remains default-off after this migration.
-- A server-owned matchmaking endpoint is required before enabling it.
-- ============================================================================

BEGIN;

-- Do not wait indefinitely behind gameplay traffic. Both values are local to
-- this transaction and leave the database unchanged if the migration aborts.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
    IF to_regclass('public.trivia_pvp_queue') IS NULL
       OR to_regclass('public.trivia_pvp_matches') IS NULL
       OR to_regclass('public.trivia_sessions') IS NULL
       OR to_regclass('public.diamond_transactions') IS NULL
       OR to_regclass('public.profiles') IS NULL
       OR to_regclass('public.trivia_tournaments') IS NULL
       OR to_regclass('public.trivia_tournament_entries') IS NULL
       OR to_regclass('public.trivia_tournament_rounds') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: required PvP/economy tables are missing';
    END IF;
    IF to_regprocedure('public.add_diamonds_to_balance(uuid,integer,text,text,text)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: atomic diamond RPC is missing';
    END IF;
    IF to_regprocedure('public.award_trivia_run(uuid,integer,integer,integer,integer)') IS NULL
       OR to_regprocedure('public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: trivia award RPC family is missing';
    END IF;
    IF to_regprocedure('public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)') IS NULL
       OR to_regprocedure('public.record_trivia_session_answer(uuid,uuid,uuid,integer)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: generic trivia session RPC family is missing';
    END IF;
    IF to_regprocedure('public.enter_trivia_tournament_v2(uuid,uuid)') IS NULL
       OR to_regprocedure('public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)') IS NULL
       OR to_regprocedure('public.fn_trivia_tournament_payout(uuid)') IS NULL
       OR to_regprocedure('public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)') IS NULL
       OR to_regprocedure('public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: tournament RPC family is missing';
    END IF;
    -- CREATE OR REPLACE is unsafe in the presence of overload drift: PostgREST
    -- could expose a stale signature alongside the hardened one.
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_trivia_pvp_session_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_trivia_session_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_trivia_session_answer') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'award_trivia_run_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'expire_old_queue_entries') <> 1 THEN
        RAISE EXCEPTION 'pre-flight failed: unexpected competitive RPC overload drift';
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 1. Browser roles cannot choose opponents or manufacture wagered matches.
-- --------------------------------------------------------------------------
ALTER TABLE public.trivia_pvp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Refuse to bulldoze a policy installed by a concurrent release. Every
    -- policy this migration is allowed to replace is named explicitly below.
    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_pvp_queue'
           AND policyname <> ALL (ARRAY[
               'Users can see queue entries',
               'Authenticated users can insert queue',
               'Authenticated users can insert',
               'Users can insert own queue entry',
               'Users can view own queue entries',
               'Users can update own queue entries',
               'Users can delete own queue entries',
               'Service role queue access',
               'Users can update own queue entry',
               'Users can delete own queue entry',
               'Waiting queue entries are discoverable',
               'trivia_pvp_queue_select',
               'trivia_pvp_queue_insert',
               'trivia_pvp_queue_update',
               'trivia_pvp_queue_delete',
               'trivia_pvp_queue_select_own',
               'trivia_pvp_queue_service_manage'
           ]::text[])
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: unexpected trivia_pvp_queue policy';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_pvp_matches'
           AND policyname <> ALL (ARRAY[
               'Players can update their matches',
               'Users can update own matches',
               'Users can view own matches',
               'Users can view their matches',
               'Users can create matches',
               'Service role manages pvp matches',
               'Participants can view their matches',
               'Users can insert matches',
               'Users can update their matches',
               'trivia_pvp_matches_select',
               'trivia_pvp_matches_insert',
               'trivia_pvp_matches_update',
               'trivia_pvp_matches_delete',
               'trivia_pvp_matches_select_participant',
               'trivia_pvp_matches_service_manage'
           ]::text[])
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: unexpected trivia_pvp_matches policy';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_sessions'
           AND policyname <> 'trivia_sessions_select_own'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: unexpected trivia_sessions policy';
    END IF;
END $$;

DROP POLICY IF EXISTS "Users can see queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert queue" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can insert own queue entry" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can view own queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can update own queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can delete own queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Service role queue access" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can update own queue entry" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can delete own queue entry" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Waiting queue entries are discoverable" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_select ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_insert ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_update ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_delete ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_select_own ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS trivia_pvp_queue_service_manage ON public.trivia_pvp_queue;

DROP POLICY IF EXISTS "Players can update their matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can update own matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can view own matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can view their matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can create matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Service role manages pvp matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Participants can view their matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can insert matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can update their matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_select ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_insert ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_update ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_delete ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_select_participant ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS trivia_pvp_matches_service_manage ON public.trivia_pvp_matches;

CREATE POLICY trivia_pvp_queue_select_own
    ON public.trivia_pvp_queue FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);
CREATE POLICY trivia_pvp_queue_service_manage
    ON public.trivia_pvp_queue FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY trivia_pvp_matches_select_participant
    ON public.trivia_pvp_matches FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = player1_id
        OR (SELECT auth.uid()) = player2_id
    );
CREATE POLICY trivia_pvp_matches_service_manage
    ON public.trivia_pvp_matches FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS trivia_sessions_select_own ON public.trivia_sessions;
CREATE POLICY trivia_sessions_select_own
    ON public.trivia_sessions FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.trivia_pvp_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trivia_pvp_matches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trivia_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trivia_pvp_queue FROM service_role;
REVOKE ALL ON TABLE public.trivia_pvp_matches FROM service_role;
REVOKE ALL ON TABLE public.trivia_sessions FROM service_role;
-- Table-level REVOKE does not clear grants made directly on a column.
DO $column_acl$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'trivia_pvp_queue', 'trivia_pvp_matches', 'trivia_sessions'
    ] LOOP
        FOR v_column IN
            SELECT a.attname
              FROM pg_attribute AS a
             WHERE a.attrelid = format('public.%I', v_table)::regclass
               AND a.attnum > 0 AND NOT a.attisdropped
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
                v_column, v_table
            );
        END LOOP;
    END LOOP;
END
$column_acl$;
GRANT SELECT ON TABLE public.trivia_pvp_queue TO authenticated;
GRANT SELECT ON TABLE public.trivia_pvp_matches TO authenticated;
GRANT SELECT ON TABLE public.trivia_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_pvp_queue TO service_role;
-- Match deletion would cascade historical child rows. Retention is intentional.
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_pvp_matches TO service_role;
-- Sessions are immutable evidence after creation/submission; no delete path is needed.
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_sessions TO service_role;

-- A browser-callable SECURITY DEFINER sweep was another queue write surface.
REVOKE EXECUTE ON FUNCTION public.expire_old_queue_entries()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_queue_entries() TO service_role;

-- Generic session creation and first-answer binding are service-owned too.
-- Leaving either SECURITY DEFINER RPC executable by a browser would bypass
-- the disabled-mode HTTP boundary and make the table ACLs irrelevant.
REVOKE EXECUTE ON FUNCTION public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_trivia_session_answer(uuid,uuid,uuid,integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.record_trivia_session_answer(uuid,uuid,uuid,integer)
    TO service_role;

-- --------------------------------------------------------------------------
-- 1b. The retired tournament engine is also server-only while its release
--     control is off. A stale RLS policy or column grant must not bypass the
--     disabled HTTP routes and create, score, rank, or pay an entrant.
-- --------------------------------------------------------------------------
ALTER TABLE public.trivia_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_tournament_rounds ENABLE ROW LEVEL SECURITY;

DO $tournament_policy_preflight$
DECLARE
    v_policy record;
BEGIN
    FOR v_policy IN
        SELECT tablename, policyname
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename IN (
               'trivia_tournaments',
               'trivia_tournament_entries',
               'trivia_tournament_rounds'
           )
    LOOP
        IF v_policy.policyname <> ALL (ARRAY[
            'Anyone can view tournaments',
            'Service role manages tournaments',
            'trivia_tournaments_public_select',
            'trivia_tournaments_service_manage',
            'Users can enter tournaments',
            'Users can update own entries',
            'Users can delete own entries',
            'Service role manages tournament entries',
            'trivia_tournament_entries_select_self',
            'trivia_tournament_entries_update_self',
            'trivia_tournament_entries_service_manage',
            'Anyone can view rounds',
            'Service role manages rounds',
            'trivia_tournament_rounds_service_manage'
        ]::text[]) THEN
            RAISE EXCEPTION 'pre-flight failed: unexpected tournament policy %.%',
                v_policy.tablename, v_policy.policyname;
        END IF;
    END LOOP;
END
$tournament_policy_preflight$;

DROP POLICY IF EXISTS "Anyone can view tournaments" ON public.trivia_tournaments;
DROP POLICY IF EXISTS "Service role manages tournaments" ON public.trivia_tournaments;
DROP POLICY IF EXISTS trivia_tournaments_public_select ON public.trivia_tournaments;
DROP POLICY IF EXISTS trivia_tournaments_service_manage ON public.trivia_tournaments;
DROP POLICY IF EXISTS "Users can enter tournaments" ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Users can update own entries" ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Users can delete own entries" ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Service role manages tournament entries" ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS trivia_tournament_entries_select_self ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS trivia_tournament_entries_update_self ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS trivia_tournament_entries_service_manage ON public.trivia_tournament_entries;
DROP POLICY IF EXISTS "Anyone can view rounds" ON public.trivia_tournament_rounds;
DROP POLICY IF EXISTS "Service role manages rounds" ON public.trivia_tournament_rounds;
DROP POLICY IF EXISTS trivia_tournament_rounds_service_manage ON public.trivia_tournament_rounds;

CREATE POLICY trivia_tournaments_service_manage
    ON public.trivia_tournaments FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY trivia_tournament_entries_service_manage
    ON public.trivia_tournament_entries FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY trivia_tournament_rounds_service_manage
    ON public.trivia_tournament_rounds FOR ALL TO service_role
    USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.trivia_tournaments
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_tournament_entries
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_tournament_rounds
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.trivia_tournaments_public
    FROM PUBLIC, anon, authenticated, service_role;

DO $tournament_column_acl$
DECLARE
    v_table text;
    v_column text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'trivia_tournaments',
        'trivia_tournament_entries',
        'trivia_tournament_rounds',
        'trivia_tournaments_public'
    ] LOOP
        FOR v_column IN
            SELECT a.attname
              FROM pg_attribute AS a
             WHERE a.attrelid = format('public.%I', v_table)::regclass
               AND a.attnum > 0 AND NOT a.attisdropped
        LOOP
            EXECUTE format(
                'REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
                v_column, v_table
            );
        END LOOP;
    END LOOP;
END
$tournament_column_acl$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_tournaments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_tournament_entries TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_tournament_rounds TO service_role;
GRANT SELECT ON TABLE public.trivia_tournaments_public TO service_role;

REVOKE EXECUTE ON FUNCTION public.enter_trivia_tournament_v2(uuid,uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enter_trivia_tournament_v2(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)
    TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)
    TO service_role;

ALTER TABLE public.trivia_pvp_matches
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_distinct_players_check;
ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_distinct_players_check
    CHECK (player1_id IS NULL OR player2_id IS NULL OR player1_id <> player2_id)
    NOT VALID;

ALTER TABLE public.trivia_pvp_matches
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_allowed_stake_check;
ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_allowed_stake_check
    CHECK (stake_amount IS NOT NULL AND stake_amount IN (10, 25, 50, 100))
    NOT VALID;

ALTER TABLE public.trivia_pvp_matches
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_winner_participant_check,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_score_bounds_check,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_score_aliases_check,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_status_check,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_settlement_kind_check;
ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_winner_participant_check CHECK (
        winner_id IS NULL
        OR winner_id IS NOT DISTINCT FROM player1_id
        OR winner_id IS NOT DISTINCT FROM player2_id
    ) NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_score_bounds_check CHECK (
        (player1_score IS NULL OR player1_score BETWEEN 0 AND 20)
        AND (player2_score IS NULL OR player2_score BETWEEN 0 AND 20)
        AND (challenger_score IS NULL OR challenger_score BETWEEN 0 AND 20)
        AND (opponent_score IS NULL OR opponent_score BETWEEN 0 AND 20)
    ) NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_score_aliases_check CHECK (
        player1_score IS NOT DISTINCT FROM challenger_score
        AND player2_score IS NOT DISTINCT FROM opponent_score
    ) NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_status_check CHECK (
        status IS NOT NULL AND status IN (
            'pending', 'active', 'settling', 'complete', 'completed',
            'cancelled', 'expired', 'abandoned'
        )
    ) NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_settlement_kind_check CHECK (
        settlement_kind IS NULL OR settlement_kind IN ('win', 'tie', 'refund', 'void')
    ) NOT VALID;

ALTER TABLE public.trivia_pvp_queue
    DROP CONSTRAINT IF EXISTS trivia_pvp_queue_allowed_stake_check;
ALTER TABLE public.trivia_pvp_queue
    ADD CONSTRAINT trivia_pvp_queue_allowed_stake_check
    CHECK (stake_amount IS NOT NULL AND stake_amount IN (10, 25, 50, 100))
    NOT VALID;

ALTER TABLE public.trivia_pvp_queue
    DROP CONSTRAINT IF EXISTS trivia_pvp_queue_status_check;
ALTER TABLE public.trivia_pvp_queue
    ADD CONSTRAINT trivia_pvp_queue_status_check
    CHECK (status IS NOT NULL AND status IN ('waiting', 'matched', 'cancelled', 'expired'))
    NOT VALID;

-- The historical phase-2/phase-80 columns brought automatic auth.users FKs
-- whose CASCADE/SET NULL actions would still fire alongside the new retention
-- keys. Remove those constraints by catalog identity, not guessed names.
DO $drop_legacy_auth_fks$
DECLARE
    v_constraint text;
BEGIN
    FOR v_constraint IN
        SELECT DISTINCT c.conname
          FROM pg_constraint AS c
          JOIN LATERAL unnest(c.conkey) AS key(attnum) ON true
          JOIN pg_attribute AS a
            ON a.attrelid = c.conrelid AND a.attnum = key.attnum
         WHERE c.conrelid = 'public.trivia_pvp_matches'::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'auth.users'::regclass
           AND array_length(c.conkey, 1) = 1
           AND a.attname IN (
               'player1_id', 'player2_id', 'winner_id',
               'challenger_id', 'opponent_id'
           )
    LOOP
        EXECUTE format(
            'ALTER TABLE public.trivia_pvp_matches DROP CONSTRAINT %I',
            v_constraint
        );
    END LOOP;
END
$drop_legacy_auth_fks$;

ALTER TABLE public.trivia_pvp_matches
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_player1_profile_fkey,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_player2_profile_fkey,
    DROP CONSTRAINT IF EXISTS trivia_pvp_matches_winner_profile_fkey;
ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_player1_profile_fkey
        FOREIGN KEY (player1_id) REFERENCES public.profiles(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_player2_profile_fkey
        FOREIGN KEY (player2_id) REFERENCES public.profiles(id) ON DELETE RESTRICT NOT VALID,
    ADD CONSTRAINT trivia_pvp_matches_winner_profile_fkey
        FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.trivia_pvp_queue
    DROP CONSTRAINT IF EXISTS trivia_pvp_queue_match_fkey;
ALTER TABLE public.trivia_pvp_queue
    ADD CONSTRAINT trivia_pvp_queue_match_fkey
        FOREIGN KEY (match_id) REFERENCES public.trivia_pvp_matches(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_distinct_players_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_allowed_stake_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_winner_participant_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_score_bounds_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_score_aliases_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_status_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_settlement_kind_check;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_player1_profile_fkey;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_player2_profile_fkey;
ALTER TABLE public.trivia_pvp_matches
    VALIDATE CONSTRAINT trivia_pvp_matches_winner_profile_fkey;
ALTER TABLE public.trivia_pvp_queue
    VALIDATE CONSTRAINT trivia_pvp_queue_allowed_stake_check;
ALTER TABLE public.trivia_pvp_queue
    VALIDATE CONSTRAINT trivia_pvp_queue_status_check;
ALTER TABLE public.trivia_pvp_queue
    VALIDATE CONSTRAINT trivia_pvp_queue_match_fkey;

DROP INDEX IF EXISTS public.idx_pvp_queue_matching;
DROP INDEX IF EXISTS public.idx_pvp_queue_one_waiting;
DROP INDEX IF EXISTS public.idx_pvp_queue_expiry;
DROP INDEX IF EXISTS public.idx_pvp_queue_match;
DROP INDEX IF EXISTS public.idx_pvp_matches_player1;
DROP INDEX IF EXISTS public.idx_pvp_matches_player2;
DROP INDEX IF EXISTS public.idx_pvp_matches_winner;
DROP INDEX IF EXISTS public.idx_pvp_matches_open;

CREATE INDEX idx_pvp_queue_matching
    ON public.trivia_pvp_queue (stake_amount, status, created_at)
    WHERE status = 'waiting';
CREATE UNIQUE INDEX idx_pvp_queue_one_waiting
    ON public.trivia_pvp_queue (user_id)
    WHERE status = 'waiting';
CREATE INDEX idx_pvp_queue_expiry
    ON public.trivia_pvp_queue (expires_at)
    WHERE status = 'waiting';
CREATE INDEX idx_pvp_queue_match
    ON public.trivia_pvp_queue (match_id)
    WHERE match_id IS NOT NULL;
CREATE INDEX idx_pvp_matches_player1
    ON public.trivia_pvp_matches (player1_id);
CREATE INDEX idx_pvp_matches_player2
    ON public.trivia_pvp_matches (player2_id);
CREATE INDEX idx_pvp_matches_winner
    ON public.trivia_pvp_matches (winner_id)
    WHERE winner_id IS NOT NULL;
CREATE INDEX idx_pvp_matches_open
    ON public.trivia_pvp_matches (status, created_at DESC)
    WHERE status IN ('active', 'settling');

-- Keep the live score aliases for backwards-compatible reads, but codify that
-- participant/session ids are never aliases. This replaces the manual live
-- hotfix with a replayable repository contract.
DROP TRIGGER IF EXISTS trg_trivia_pvp_match_sync ON public.trivia_pvp_matches;
CREATE OR REPLACE FUNCTION public.fn_trivia_pvp_match_sync_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.player1_score IS NOT NULL AND NEW.challenger_score IS NOT NULL
           AND NEW.player1_score IS DISTINCT FROM NEW.challenger_score THEN
            RAISE EXCEPTION 'conflicting player-1 score aliases';
        END IF;
        IF NEW.player2_score IS NOT NULL AND NEW.opponent_score IS NOT NULL
           AND NEW.player2_score IS DISTINCT FROM NEW.opponent_score THEN
            RAISE EXCEPTION 'conflicting player-2 score aliases';
        END IF;
        NEW.player1_score    := COALESCE(NEW.player1_score, NEW.challenger_score);
        NEW.challenger_score := COALESCE(NEW.challenger_score, NEW.player1_score);
        NEW.player2_score    := COALESCE(NEW.player2_score, NEW.opponent_score);
        NEW.opponent_score   := COALESCE(NEW.opponent_score, NEW.player2_score);
        RETURN NEW;
    END IF;

    IF NEW.player1_score IS DISTINCT FROM OLD.player1_score
       AND NEW.challenger_score IS DISTINCT FROM OLD.challenger_score
       AND NEW.player1_score IS DISTINCT FROM NEW.challenger_score THEN
        RAISE EXCEPTION 'conflicting player-1 score alias update';
    END IF;
    IF NEW.player2_score IS DISTINCT FROM OLD.player2_score
       AND NEW.opponent_score IS DISTINCT FROM OLD.opponent_score
       AND NEW.player2_score IS DISTINCT FROM NEW.opponent_score THEN
        RAISE EXCEPTION 'conflicting player-2 score alias update';
    END IF;

    IF NEW.player1_score IS DISTINCT FROM OLD.player1_score THEN
        NEW.challenger_score := NEW.player1_score;
    ELSIF NEW.challenger_score IS DISTINCT FROM OLD.challenger_score THEN
        NEW.player1_score := NEW.challenger_score;
    END IF;
    IF NEW.player2_score IS DISTINCT FROM OLD.player2_score THEN
        NEW.opponent_score := NEW.player2_score;
    ELSIF NEW.opponent_score IS DISTINCT FROM OLD.opponent_score THEN
        NEW.player2_score := NEW.opponent_score;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_trivia_pvp_match_sync_columns()
    FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_trivia_pvp_match_sync
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.fn_trivia_pvp_match_sync_columns();

-- A normalized active-seat relation turns the cross-column "one active match
-- per player" invariant into a real unique constraint that remains safe under
-- concurrency. Horses are players and occupy the same durable seat as humans.
CREATE TABLE public.trivia_pvp_active_seats (
    match_id uuid NOT NULL,
    side smallint NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_active_seats_pkey PRIMARY KEY (match_id, side),
    CONSTRAINT trivia_pvp_active_seats_one_match_per_user UNIQUE (user_id),
    CONSTRAINT trivia_pvp_active_seats_side_check CHECK (side IN (1, 2)),
    CONSTRAINT trivia_pvp_active_seats_match_fkey FOREIGN KEY (match_id)
        REFERENCES public.trivia_pvp_matches(id) ON DELETE CASCADE,
    CONSTRAINT trivia_pvp_active_seats_user_fkey FOREIGN KEY (user_id)
        REFERENCES public.profiles(id) ON DELETE RESTRICT
);
ALTER TABLE public.trivia_pvp_active_seats ENABLE ROW LEVEL SECURITY;
CREATE POLICY trivia_pvp_active_seats_service_select
    ON public.trivia_pvp_active_seats FOR SELECT TO service_role
    USING (true);
REVOKE ALL ON TABLE public.trivia_pvp_active_seats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trivia_pvp_active_seats FROM service_role;
GRANT SELECT ON TABLE public.trivia_pvp_active_seats TO service_role;

CREATE OR REPLACE FUNCTION public.sync_trivia_pvp_active_seats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        DELETE FROM public.trivia_pvp_active_seats WHERE match_id = OLD.id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.status IN ('active', 'settling') THEN
        INSERT INTO public.trivia_pvp_active_seats (match_id, side, user_id)
        SELECT NEW.id, candidate.side, candidate.user_id
          FROM (VALUES (1::smallint, NEW.player1_id),
                       (2::smallint, NEW.player2_id)) AS candidate(side, user_id)
          JOIN public.profiles AS profile ON profile.id = candidate.user_id;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_trivia_pvp_active_seats()
    FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_sync_trivia_pvp_active_seats ON public.trivia_pvp_matches;
CREATE TRIGGER trg_sync_trivia_pvp_active_seats
    AFTER INSERT OR UPDATE OR DELETE ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.sync_trivia_pvp_active_seats();

DELETE FROM public.trivia_pvp_active_seats AS seat
 WHERE NOT EXISTS (
    SELECT 1
      FROM public.trivia_pvp_matches AS match
     WHERE match.id = seat.match_id
       AND match.status IN ('active', 'settling')
       AND ((seat.side = 1 AND seat.user_id = match.player1_id)
            OR (seat.side = 2 AND seat.user_id = match.player2_id))
       AND EXISTS (
           SELECT 1 FROM public.profiles AS profile
            WHERE profile.id = seat.user_id
       )
 );
INSERT INTO public.trivia_pvp_active_seats (match_id, side, user_id, created_at)
SELECT m.id, seat.side, seat.user_id, COALESCE(m.created_at, now())
  FROM public.trivia_pvp_matches m
 CROSS JOIN LATERAL (VALUES (1::smallint, m.player1_id),
                            (2::smallint, m.player2_id)) AS seat(side, user_id)
  JOIN public.profiles AS profile ON profile.id = seat.user_id
 WHERE m.status IN ('active', 'settling')
ON CONFLICT (match_id, side) DO UPDATE SET user_id = EXCLUDED.user_id;

-- --------------------------------------------------------------------------
-- 2. Durable, non-reusable match/session binding.
-- --------------------------------------------------------------------------
CREATE TABLE public.trivia_pvp_session_links (
    match_id  uuid NOT NULL,
    side      smallint NOT NULL,
    user_id   uuid NOT NULL,
    session_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_session_links_pkey PRIMARY KEY (match_id, side),
    CONSTRAINT trivia_pvp_session_links_match_user_key UNIQUE (match_id, user_id),
    CONSTRAINT trivia_pvp_session_links_session_key UNIQUE (session_id),
    CONSTRAINT trivia_pvp_session_links_side_check CHECK (side IN (1, 2)),
    CONSTRAINT trivia_pvp_session_links_match_fkey FOREIGN KEY (match_id)
        REFERENCES public.trivia_pvp_matches(id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_session_links_user_fkey FOREIGN KEY (user_id)
        REFERENCES public.profiles(id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_session_links_session_fkey FOREIGN KEY (session_id)
        REFERENCES public.trivia_sessions(id) ON DELETE RESTRICT
);

ALTER TABLE public.trivia_pvp_session_links ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'trivia_pvp_session_links'
           AND policyname <> 'trivia_pvp_session_links_service_manage'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: unexpected trivia_pvp_session_links policy';
    END IF;
END $$;
CREATE POLICY trivia_pvp_session_links_service_select
    ON public.trivia_pvp_session_links FOR SELECT TO service_role
    USING (true);
REVOKE ALL ON TABLE public.trivia_pvp_session_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trivia_pvp_session_links FROM service_role;
GRANT SELECT ON TABLE public.trivia_pvp_session_links TO service_role;
CREATE INDEX idx_trivia_pvp_session_links_user
    ON public.trivia_pvp_session_links (user_id, match_id);

CREATE OR REPLACE FUNCTION public.validate_trivia_pvp_session_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_match public.trivia_pvp_matches%ROWTYPE;
    v_session public.trivia_sessions%ROWTYPE;
    v_reference text;
    v_transaction_count integer;
    v_exact_transaction_count integer;
BEGIN
    SELECT * INTO v_match FROM public.trivia_pvp_matches WHERE id = NEW.match_id;
    SELECT * INTO v_session FROM public.trivia_sessions WHERE id = NEW.session_id;

    IF v_match.id IS NULL THEN
        RAISE EXCEPTION 'pvp session link: match not found';
    END IF;
    IF v_session.id IS NULL THEN
        RAISE EXCEPTION 'pvp session link: session not found';
    END IF;
    IF (NEW.side = 1 AND NEW.user_id IS DISTINCT FROM v_match.player1_id)
       OR (NEW.side = 2 AND NEW.user_id IS DISTINCT FROM v_match.player2_id) THEN
        RAISE EXCEPTION 'pvp session link: participant mismatch';
    END IF;
    IF v_match.status IS NULL
       OR v_match.status NOT IN ('active', 'settling', 'complete', 'completed') THEN
        RAISE EXCEPTION 'pvp session link: match state mismatch';
    END IF;
    IF v_session.user_id IS DISTINCT FROM NEW.user_id
       OR v_session.mode IS DISTINCT FROM 'pvp' THEN
        RAISE EXCEPTION 'pvp session link: session owner/mode mismatch';
    END IF;
    IF v_session.status IS NULL
       OR v_session.status NOT IN ('open', 'submitted', 'expired') THEN
        RAISE EXCEPTION 'pvp session link: session state mismatch';
    END IF;
    IF v_session.entry_state IS DISTINCT FROM 'charged'
       OR v_session.entry_cost IS DISTINCT FROM v_match.stake_amount THEN
        RAISE EXCEPTION 'pvp session link: escrow mismatch';
    END IF;
    IF jsonb_typeof(v_match.questions) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_match.questions) <> 20
       OR array_ndims(v_session.question_ids) IS DISTINCT FROM 1
       OR cardinality(v_session.question_ids) <> 20
       OR array_position(v_session.question_ids, NULL::uuid) IS NOT NULL
       OR (SELECT count(DISTINCT question_id) FROM unnest(v_session.question_ids) AS question_id) <> 20
       OR v_match.questions IS DISTINCT FROM to_jsonb(v_session.question_ids) THEN
        RAISE EXCEPTION 'pvp session link: roster mismatch';
    END IF;
    IF v_session.created_at IS NULL
       OR v_match.created_at IS NULL
       OR v_session.created_at < v_match.created_at - interval '1 second'
       OR v_session.created_at > v_match.created_at + interval '30 minutes' THEN
        RAISE EXCEPTION 'pvp session link: time mismatch';
    END IF;
    IF v_session.expires_at IS NULL
       OR v_session.expires_at < v_session.created_at
       OR v_session.expires_at > v_match.created_at + interval '30 minutes'
       OR NEW.created_at IS NULL
       OR NEW.created_at < v_session.created_at - interval '1 second'
       OR NEW.created_at > v_match.created_at + interval '30 minutes' THEN
        RAISE EXCEPTION 'pvp session link: deadline mismatch';
    END IF;
    IF v_session.status = 'submitted' AND (
        v_session.submitted_at IS NULL
        OR v_session.submitted_at > v_session.expires_at
        OR v_session.submitted_at > v_match.created_at + interval '30 minutes'
        OR v_session.correct_count IS NULL
        OR v_session.correct_count NOT BETWEEN 0 AND 20
    ) THEN
        RAISE EXCEPTION 'pvp session link: submitted result mismatch';
    END IF;

    v_reference := 'pvp_stake_' || NEW.match_id::text || '_' || NEW.user_id::text;
    SELECT count(*),
           count(*) FILTER (
               WHERE d.user_id = NEW.user_id
                 AND d.amount = -v_match.stake_amount
                 AND COALESCE(
                     NULLIF(BTRIM(d.transaction_type), ''),
                     NULLIF(BTRIM(d.type), '')
                 ) = 'pvp_stake'
           )
      INTO v_transaction_count, v_exact_transaction_count
      FROM public.diamond_transactions AS d
     WHERE d.reference_id = v_reference;
    IF v_transaction_count <> 1 OR v_exact_transaction_count <> 1 THEN
        RAISE EXCEPTION 'pvp session link: exact stake transaction missing';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validate_trivia_pvp_session_link()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_validate_trivia_pvp_session_link
    ON public.trivia_pvp_session_links;
CREATE TRIGGER trg_validate_trivia_pvp_session_link
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_session_links
    FOR EACH ROW EXECUTE FUNCTION public.validate_trivia_pvp_session_link();

-- Preserve only provably valid, unambiguous in-flight legacy bindings. If a
-- session id appears in more than one candidate, every use is quarantined by
-- omission rather than accepting whichever row happens to be read first.
WITH raw_candidates AS (
    SELECT m.id AS match_id,
           side_info.side,
           side_info.expected_user_id AS user_id,
           s.id AS session_id,
           s.created_at
      FROM public.trivia_pvp_matches AS m
     CROSS JOIN LATERAL (
        VALUES (1::smallint, m.challenger_id, m.player1_id),
               (2::smallint, m.opponent_id, m.player2_id)
     ) AS side_info(side, legacy_session_id, expected_user_id)
      JOIN public.trivia_sessions AS s ON s.id = side_info.legacy_session_id
     WHERE m.status IN ('active', 'settling', 'complete', 'completed')
       AND s.user_id = side_info.expected_user_id
       AND s.mode = 'pvp'
       AND s.status IN ('open', 'submitted', 'expired')
       AND s.entry_state = 'charged'
       AND s.entry_cost = m.stake_amount
       AND s.created_at >= m.created_at - interval '1 second'
       AND s.created_at <= m.created_at + interval '30 minutes'
       AND s.expires_at IS NOT NULL
       AND s.expires_at >= s.created_at
       AND s.expires_at <= m.created_at + interval '30 minutes'
       AND (
           s.status <> 'submitted'
           OR (
               s.submitted_at IS NOT NULL
               AND s.submitted_at <= s.expires_at
               AND s.submitted_at <= m.created_at + interval '30 minutes'
               AND s.correct_count BETWEEN 0 AND 20
           )
       )
       AND jsonb_typeof(m.questions) = 'array'
       AND jsonb_array_length(m.questions) = 20
       AND array_ndims(s.question_ids) = 1
       AND cardinality(s.question_ids) = 20
       AND array_position(s.question_ids, NULL::uuid) IS NULL
       AND (SELECT count(DISTINCT question_id) FROM unnest(s.question_ids) AS question_id) = 20
       AND m.questions = to_jsonb(s.question_ids)
       AND 1 = (
           SELECT count(*)
             FROM public.diamond_transactions AS d
            WHERE d.reference_id = 'pvp_stake_' || m.id::text || '_' || s.user_id::text
       )
       AND 1 = (
           SELECT count(*)
             FROM public.diamond_transactions AS d
            WHERE d.reference_id = 'pvp_stake_' || m.id::text || '_' || s.user_id::text
              AND d.user_id = s.user_id
              AND d.amount = -m.stake_amount
              AND COALESCE(
                  NULLIF(BTRIM(d.transaction_type), ''),
                  NULLIF(BTRIM(d.type), '')
              ) = 'pvp_stake'
       )
), classified_candidates AS (
    SELECT raw_candidates.*,
           count(*) OVER (PARTITION BY session_id) AS session_use_count,
           count(*) OVER (PARTITION BY match_id, side) AS side_use_count,
           count(*) OVER (PARTITION BY match_id, user_id) AS match_user_use_count
      FROM raw_candidates
)
INSERT INTO public.trivia_pvp_session_links
    (match_id, side, user_id, session_id, created_at)
SELECT match_id, side, user_id, session_id, created_at
  FROM classified_candidates
 WHERE session_use_count = 1
   AND side_use_count = 1
   AND match_user_use_count = 1;

-- --------------------------------------------------------------------------
-- 3. Immutable quarantine and settlement-decision evidence.
-- --------------------------------------------------------------------------
CREATE TABLE public.competitive_quarantine (
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    reason_code text NOT NULL,
    invariant_snapshot jsonb NOT NULL,
    quarantined_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT competitive_quarantine_pkey PRIMARY KEY (entity_type, entity_id),
    CONSTRAINT competitive_quarantine_entity_type_check
        CHECK (entity_type IN ('trivia_pvp_match', 'trivia_tournament')),
    CONSTRAINT competitive_quarantine_reason_check CHECK (
        (entity_type = 'trivia_pvp_match'
         AND reason_code IN (
             'legacy_abandoned_human_horse_refund_incident',
             'ambiguous_legacy_session_binding'
         ))
        OR
        (entity_type = 'trivia_tournament'
         AND reason_code = 'legacy_8_horse_184_pool_unsettled')
    ),
    CONSTRAINT competitive_quarantine_snapshot_object_check
        CHECK (jsonb_typeof(invariant_snapshot) = 'object')
);
ALTER TABLE public.competitive_quarantine ENABLE ROW LEVEL SECURITY;
CREATE POLICY competitive_quarantine_service_select
    ON public.competitive_quarantine FOR SELECT TO service_role USING (true);
REVOKE ALL ON TABLE public.competitive_quarantine FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.competitive_quarantine TO service_role;

-- Select the retained August incident by business invariants. Production is
-- expected to find four rows; a clean replay legitimately finds none.
INSERT INTO public.competitive_quarantine (
    entity_type, entity_id, reason_code, invariant_snapshot
)
SELECT 'trivia_pvp_match', m.id,
       'legacy_abandoned_human_horse_refund_incident',
       jsonb_build_object(
           'status', m.status,
           'player1_id', m.player1_id,
           'player2_id', m.player2_id,
           'stake_amount', m.stake_amount,
           'created_at', m.created_at,
           'completed_at', m.completed_at,
           'settlement_kind', m.settlement_kind,
           'player1_is_horse', p1.is_horse,
           'player2_is_horse', p2.is_horse
       )
  FROM public.trivia_pvp_matches AS m
  JOIN public.profiles AS p1 ON p1.id = m.player1_id
 JOIN public.profiles AS p2 ON p2.id = m.player2_id
 WHERE m.status = 'abandoned'
   AND m.created_at < timestamptz '2026-08-24 00:00:00+00'
   AND (p1.is_horse IS TRUE) <> (p2.is_horse IS TRUE);

-- Select the incomplete historical event by its audited pool, entrant, horse,
-- rank and payout invariants. No payout/refund or tournament row is changed.
INSERT INTO public.competitive_quarantine (
    entity_type, entity_id, reason_code, invariant_snapshot
)
SELECT 'trivia_tournament', t.id,
       'legacy_8_horse_184_pool_unsettled',
       jsonb_build_object(
           'status', t.status,
           'prize_pool', t.prize_pool,
           'entry_count', audit.entry_count,
           'horse_count', audit.horse_count,
           'ranked_count', audit.ranked_count,
           'total_payout', audit.total_payout,
           'winners', t.winners,
           'created_at', t.created_at,
           'completed_at', t.completed_at
       )
  FROM public.trivia_tournaments AS t
  CROSS JOIN LATERAL (
      SELECT count(*)::integer AS entry_count,
             count(*) FILTER (WHERE p.is_horse IS TRUE)::integer AS horse_count,
             count(e.rank)::integer AS ranked_count,
             COALESCE(sum(e.payout), 0)::integer AS total_payout
        FROM public.trivia_tournament_entries AS e
        LEFT JOIN public.profiles AS p ON p.id = e.user_id
       WHERE e.tournament_id = t.id
  ) AS audit
 WHERE t.status IN ('complete', 'completed')
   AND t.created_at < timestamptz '2026-08-28 00:00:00+00'
   AND t.prize_pool = 184
   AND audit.entry_count = 8
   AND audit.horse_count = 8
   AND audit.ranked_count = 0
   AND audit.total_payout = 0;

-- A populated legacy alias that did not survive the strict link backfill is
-- ambiguous evidence, not a session pointer settlement may guess about. Keep
-- the whole match inert until an additive reconciliation migration resolves it.
INSERT INTO public.competitive_quarantine (
    entity_type, entity_id, reason_code, invariant_snapshot
)
SELECT 'trivia_pvp_match', match.id,
       'ambiguous_legacy_session_binding',
       jsonb_build_object(
           'status', match.status,
           'stake_amount', match.stake_amount,
           'created_at', match.created_at,
           'player1_alias_populated', match.challenger_id IS NOT NULL,
           'player2_alias_populated', match.opponent_id IS NOT NULL,
           'player1_link_backfilled', EXISTS (
               SELECT 1 FROM public.trivia_pvp_session_links AS link
                WHERE link.match_id = match.id AND link.side = 1
                  AND link.session_id = match.challenger_id
           ),
           'player2_link_backfilled', EXISTS (
               SELECT 1 FROM public.trivia_pvp_session_links AS link
                WHERE link.match_id = match.id AND link.side = 2
                  AND link.session_id = match.opponent_id
           )
       )
  FROM public.trivia_pvp_matches AS match
 WHERE match.status IN ('active', 'settling', 'complete', 'completed')
   AND (
       (match.challenger_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.trivia_pvp_session_links AS link
            WHERE link.match_id = match.id AND link.side = 1
              AND link.session_id = match.challenger_id
       ))
       OR
       (match.opponent_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.trivia_pvp_session_links AS link
            WHERE link.match_id = match.id AND link.side = 2
              AND link.session_id = match.opponent_id
       ))
   );

CREATE TABLE public.trivia_pvp_settlement_decisions (
    match_id uuid NOT NULL,
    decision_kind text NOT NULL,
    winner_id uuid,
    player1_score integer,
    player2_score integer,
    forfeit boolean NOT NULL DEFAULT false,
    reference_family text NOT NULL,
    side_state jsonb NOT NULL,
    credit_plan jsonb NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_pvp_settlement_decisions_pkey PRIMARY KEY (match_id),
    CONSTRAINT trivia_pvp_settlement_decisions_match_fkey FOREIGN KEY (match_id)
        REFERENCES public.trivia_pvp_matches(id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_settlement_decisions_winner_fkey FOREIGN KEY (winner_id)
        REFERENCES public.profiles(id) ON DELETE RESTRICT,
    CONSTRAINT trivia_pvp_settlement_decisions_kind_check
        CHECK (decision_kind IN ('win', 'tie', 'refund', 'void')),
    CONSTRAINT trivia_pvp_settlement_decisions_winner_check CHECK (
        (decision_kind = 'win' AND winner_id IS NOT NULL)
        OR (decision_kind <> 'win' AND winner_id IS NULL)
    ),
    CONSTRAINT trivia_pvp_settlement_decisions_score_check CHECK (
        (player1_score IS NULL OR player1_score BETWEEN 0 AND 20)
        AND (player2_score IS NULL OR player2_score BETWEEN 0 AND 20)
    ),
    CONSTRAINT trivia_pvp_settlement_decisions_reference_key UNIQUE (reference_family),
    CONSTRAINT trivia_pvp_settlement_decisions_reference_check
        CHECK (reference_family = 'pvp_settlement_' || match_id::text),
    CONSTRAINT trivia_pvp_settlement_decisions_side_state_check
        CHECK (jsonb_typeof(side_state) = 'array' AND jsonb_array_length(side_state) = 2),
    CONSTRAINT trivia_pvp_settlement_decisions_credit_plan_check
        CHECK (jsonb_typeof(credit_plan) = 'array')
);
ALTER TABLE public.trivia_pvp_settlement_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY trivia_pvp_settlement_decisions_service_select
    ON public.trivia_pvp_settlement_decisions FOR SELECT TO service_role USING (true);
REVOKE ALL ON TABLE public.trivia_pvp_settlement_decisions
    FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.trivia_pvp_settlement_decisions TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_competitive_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_entity_type text;
    v_entity_id uuid;
    v_new_entity_id uuid;
BEGIN
    IF TG_TABLE_NAME IN ('competitive_quarantine', 'trivia_pvp_settlement_decisions') THEN
        RAISE EXCEPTION '% evidence is immutable', TG_TABLE_NAME;
    ELSIF TG_TABLE_NAME = 'trivia_pvp_matches' THEN
        v_entity_type := 'trivia_pvp_match';
        v_entity_id := OLD.id;
    ELSIF TG_TABLE_NAME = 'trivia_tournaments' THEN
        v_entity_type := 'trivia_tournament';
        v_entity_id := OLD.id;
    ELSIF TG_TABLE_NAME IN ('trivia_tournament_entries', 'trivia_tournament_rounds') THEN
        v_entity_type := 'trivia_tournament';
        IF TG_OP <> 'INSERT' THEN
            v_entity_id := NULLIF(to_jsonb(OLD) ->> 'tournament_id', '')::uuid;
        END IF;
        IF TG_OP <> 'DELETE' THEN
            v_new_entity_id := NULLIF(to_jsonb(NEW) ->> 'tournament_id', '')::uuid;
        END IF;
    END IF;

    IF v_entity_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.competitive_quarantine AS quarantine
         WHERE quarantine.entity_type = v_entity_type
           AND quarantine.entity_id = v_entity_id
    ) THEN
        RAISE EXCEPTION 'quarantined competitive record is immutable: % %',
            v_entity_type, v_entity_id;
    END IF;
    IF v_new_entity_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.competitive_quarantine AS quarantine
         WHERE quarantine.entity_type = v_entity_type
           AND quarantine.entity_id = v_new_entity_id
    ) THEN
        RAISE EXCEPTION 'quarantined competitive record is immutable: % %',
            v_entity_type, v_new_entity_id;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_competitive_evidence_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_00_guard_quarantined_pvp_match
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();
CREATE TRIGGER trg_00_guard_quarantined_tournament
    BEFORE UPDATE OR DELETE ON public.trivia_tournaments
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();
CREATE TRIGGER trg_00_guard_quarantined_tournament_entry
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_tournament_entries
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();
CREATE TRIGGER trg_00_guard_quarantined_tournament_round
    BEFORE INSERT OR UPDATE OR DELETE ON public.trivia_tournament_rounds
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();
CREATE TRIGGER trg_00_freeze_competitive_quarantine
    BEFORE UPDATE OR DELETE ON public.competitive_quarantine
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();
CREATE TRIGGER trg_00_freeze_pvp_settlement_decision
    BEFORE UPDATE OR DELETE ON public.trivia_pvp_settlement_decisions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_competitive_evidence_mutation();

-- Once a side is bound, participant, stake and roster identity are immutable.
CREATE OR REPLACE FUNCTION public.prevent_linked_trivia_pvp_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_decision public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_has_link boolean;
    v_has_funding boolean;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('pending', 'active')
           OR NEW.winner_id IS NOT NULL OR NEW.settlement_kind IS NOT NULL THEN
            RAISE EXCEPTION 'new PvP match must start pending/active and unsettled';
        END IF;
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.trivia_pvp_session_links WHERE match_id = OLD.id
    ) INTO v_has_link;
    IF (v_has_link OR OLD.status <> 'pending') AND (
        NEW.player1_id IS DISTINCT FROM OLD.player1_id
        OR NEW.player2_id IS DISTINCT FROM OLD.player2_id
        OR NEW.stake_amount IS DISTINCT FROM OLD.stake_amount
        OR NEW.questions IS DISTINCT FROM OLD.questions
    ) THEN
        RAISE EXCEPTION 'linked PvP match identity is immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('active', 'cancelled', 'expired', 'abandoned'))
        OR (OLD.status = 'active' AND NEW.status IN ('settling', 'cancelled', 'expired', 'abandoned'))
        OR (OLD.status = 'settling' AND NEW.status IN ('complete', 'completed'))
    ) THEN
        RAISE EXCEPTION 'invalid PvP match transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'active'
       AND NEW.status IN ('cancelled', 'expired', 'abandoned') THEN
        SELECT v_has_link OR EXISTS (
            SELECT 1
              FROM public.diamond_transactions AS d
             WHERE d.reference_id IN (
                 'pvp_stake_' || OLD.id::text || '_' || OLD.player1_id::text,
                 'pvp_stake_' || OLD.id::text || '_' || OLD.player2_id::text
             )
        ) INTO v_has_funding;
        IF v_has_funding THEN
            RAISE EXCEPTION 'funded PvP match must pass through an immutable settlement decision';
        END IF;
    END IF;

    IF OLD.status IN ('complete', 'completed', 'cancelled', 'expired', 'abandoned')
       AND (
           NEW.winner_id IS DISTINCT FROM OLD.winner_id
           OR NEW.player1_score IS DISTINCT FROM OLD.player1_score
           OR NEW.player2_score IS DISTINCT FROM OLD.player2_score
           OR NEW.challenger_score IS DISTINCT FROM OLD.challenger_score
           OR NEW.opponent_score IS DISTINCT FROM OLD.opponent_score
           OR NEW.settlement_kind IS DISTINCT FROM OLD.settlement_kind
           OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       ) THEN
        RAISE EXCEPTION 'terminal PvP outcome is immutable';
    END IF;

    SELECT * INTO v_decision
      FROM public.trivia_pvp_settlement_decisions
     WHERE match_id = OLD.id;
    IF FOUND THEN
        IF NEW.winner_id IS DISTINCT FROM v_decision.winner_id
           OR NEW.player1_score IS DISTINCT FROM v_decision.player1_score
           OR NEW.player2_score IS DISTINCT FROM v_decision.player2_score
           OR NEW.settlement_kind IS DISTINCT FROM v_decision.decision_kind THEN
            RAISE EXCEPTION 'PvP match outcome differs from immutable settlement decision';
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND NEW.status IN ('settling', 'complete', 'completed') THEN
        RAISE EXCEPTION 'PvP settlement decision is required before claiming/finalizing';
    END IF;

    IF NEW.status IN ('complete', 'completed') AND NEW.completed_at IS NULL THEN
        RAISE EXCEPTION 'completed PvP match requires completed_at';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_linked_trivia_pvp_identity_change()
    FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_prevent_linked_trivia_pvp_identity_change
    ON public.trivia_pvp_matches;
CREATE TRIGGER trg_prevent_linked_trivia_pvp_identity_change
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_matches
    FOR EACH ROW EXECUTE FUNCTION public.prevent_linked_trivia_pvp_identity_change();

CREATE OR REPLACE FUNCTION public.prevent_linked_trivia_session_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_link public.trivia_pvp_session_links%ROWTYPE;
    v_match_created_at timestamptz;
BEGIN
    SELECT * INTO v_link
      FROM public.trivia_pvp_session_links
     WHERE session_id = OLD.id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF (
        NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.mode IS DISTINCT FROM OLD.mode
        OR NEW.question_ids IS DISTINCT FROM OLD.question_ids
        OR NEW.permutations IS DISTINCT FROM OLD.permutations
        OR NEW.entry_cost IS DISTINCT FROM OLD.entry_cost
        OR NEW.entry_state IS DISTINCT FROM OLD.entry_state
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    ) THEN
        RAISE EXCEPTION 'linked PvP session identity is immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        OLD.status = 'open' AND NEW.status IN ('submitted', 'expired')
    ) THEN
        RAISE EXCEPTION 'invalid linked PvP session transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'submitted' AND (
        NEW.answers IS DISTINCT FROM OLD.answers
        OR NEW.correct_count IS DISTINCT FROM OLD.correct_count
        OR NEW.score IS DISTINCT FROM OLD.score
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.diamonds_awarded IS DISTINCT FROM OLD.diamonds_awarded
        OR (
            OLD.settlement_result IS NOT NULL
            AND NEW.settlement_result IS DISTINCT FROM OLD.settlement_result
        )
    ) THEN
        RAISE EXCEPTION 'submitted linked PvP session result is immutable';
    END IF;
    IF OLD.status = 'expired' AND (
        NEW.answers IS DISTINCT FROM OLD.answers
        OR NEW.correct_count IS DISTINCT FROM OLD.correct_count
        OR NEW.score IS DISTINCT FROM OLD.score
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.diamonds_awarded IS DISTINCT FROM OLD.diamonds_awarded
        OR NEW.settlement_result IS DISTINCT FROM OLD.settlement_result
    ) THEN
        RAISE EXCEPTION 'expired linked PvP session result is immutable';
    END IF;

    SELECT created_at INTO v_match_created_at
      FROM public.trivia_pvp_matches
     WHERE id = v_link.match_id;
    IF (
        NEW.status IS NULL
        OR NEW.status NOT IN ('open', 'submitted', 'expired')
        OR (
            NEW.status = 'submitted'
            AND (
                NEW.submitted_at IS NULL
                OR NEW.expires_at IS NULL
                OR NEW.submitted_at > NEW.expires_at
                OR NEW.submitted_at > v_match_created_at + interval '30 minutes'
                OR NEW.correct_count IS NULL
                OR NEW.correct_count < 0
                OR NEW.correct_count > 20
            )
        )
    ) THEN
        RAISE EXCEPTION 'linked PvP session result is invalid';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_linked_trivia_session_identity_change()
    FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_prevent_linked_trivia_session_identity_change
    ON public.trivia_sessions;
CREATE TRIGGER trg_prevent_linked_trivia_session_identity_change
    BEFORE UPDATE ON public.trivia_sessions
    FOR EACH ROW EXECUTE FUNCTION public.prevent_linked_trivia_session_identity_change();

-- --------------------------------------------------------------------------
-- 4. Deadline-safe grading and atomic escrow/session/link RPC.
-- --------------------------------------------------------------------------
-- award_trivia_run_v2 locks the session and delegates its one status-changing
-- statement to this function. Put the deadline predicate on that UPDATE itself:
-- an application-side timestamp check cannot close the submit/expiry race.
CREATE OR REPLACE FUNCTION public.award_trivia_run(
    p_session_id uuid, p_score integer, p_correct integer,
    p_total integer, p_diamonds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_score integer := GREATEST(0, COALESCE(p_score, 0));
    v_correct integer := GREATEST(0, COALESCE(p_correct, 0));
    v_total integer := GREATEST(0, COALESCE(p_total, 0));
    v_award integer := GREATEST(0, COALESCE(p_diamonds, 0));
    v_result jsonb;
    v_now timestamptz;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'missing_session_id');
    END IF;
    IF v_correct > v_total THEN
        RETURN jsonb_build_object('success', false, 'error', 'correct_exceeds_total');
    END IF;

    -- One sampled wall-clock instant is used by both assignment and predicate;
    -- separate VOLATILE calls could straddle the exact deadline.
    v_now := clock_timestamp();
    UPDATE public.trivia_sessions
       SET status = 'submitted', submitted_at = v_now, score = v_score,
           correct_count = v_correct, diamonds_awarded = v_award
     WHERE id = p_session_id
       AND status = 'open'
       AND expires_at IS NOT NULL
       AND expires_at >= v_now
     RETURNING * INTO v_session;

    IF NOT FOUND THEN
        SELECT * INTO v_session
          FROM public.trivia_sessions
         WHERE id = p_session_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
        END IF;
        v_now := clock_timestamp();
        IF v_session.status = 'open'
           AND (v_session.expires_at IS NULL OR v_session.expires_at < v_now) THEN
            UPDATE public.trivia_sessions
               SET status = 'expired'
             WHERE id = p_session_id
               AND status = 'open'
               AND (expires_at IS NULL OR expires_at < v_now);
            RETURN jsonb_build_object(
                'success', false,
                'error', 'session_expired',
                'expires_at', v_session.expires_at,
                'deadline_missing', v_session.expires_at IS NULL
            );
        END IF;
        RETURN jsonb_build_object('success', false, 'error',
            CASE WHEN v_session.status = 'submitted' THEN 'already_submitted' ELSE 'session_closed' END);
    END IF;

    IF v_award > 0 THEN
        SELECT public.add_diamonds_to_balance(
            v_session.user_id, v_award, 'trivia_run',
            'Trivia run reward (' || COALESCE(v_session.mode, 'unknown') || ')',
            'trivia_session_' || p_session_id::text
        ) INTO v_result;
        IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE
           AND COALESCE((v_result ->> 'duplicate')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'trivia payout rejected: %', COALESCE(v_result ->> 'error', 'unknown');
        END IF;
    END IF;
    RETURN jsonb_build_object(
        'success', true, 'session_id', p_session_id, 'score', v_score,
        'correct_count', v_correct, 'diamonds_awarded', v_award,
        'deduped', COALESCE((v_result ->> 'duplicate')::boolean, false),
        'new_balance', v_result -> 'new_balance'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.award_trivia_run(uuid,integer,integer,integer,integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_trivia_run(uuid,integer,integer,integer,integer)
    TO service_role;
ALTER FUNCTION public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)
    SET search_path TO public, extensions;

CREATE OR REPLACE FUNCTION public.create_trivia_pvp_session_v2(
    p_session_id uuid, p_match_id uuid, p_user_id uuid,
    p_question_ids uuid[], p_permutations jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_m public.trivia_pvp_matches%ROWTYPE;
    v_existing uuid;
    v_side smallint;
    v_stake integer;
    v_charge jsonb;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_session_id IS NULL OR p_match_id IS NULL OR p_user_id IS NULL
       OR array_ndims(p_question_ids) IS DISTINCT FROM 1
       OR cardinality(p_question_ids) <> 20
       OR array_position(p_question_ids, NULL::uuid) IS NOT NULL
       OR (SELECT count(DISTINCT question_id) FROM unnest(p_question_ids) AS question_id) <> 20
       OR jsonb_typeof(COALESCE(p_permutations, '{}'::jsonb)) <> 'object' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_session');
    END IF;

    SELECT * INTO v_m
      FROM public.trivia_pvp_matches
     WHERE id = p_match_id
     FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'match_not_found'); END IF;
    IF EXISTS (
        SELECT 1 FROM public.competitive_quarantine
         WHERE entity_type = 'trivia_pvp_match' AND entity_id = p_match_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_quarantined');
    END IF;
    IF v_m.status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_active');
    END IF;
    IF v_m.player1_id IS NULL OR v_m.player2_id IS NULL
       OR v_m.player1_id = v_m.player2_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_match_players');
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles AS profile
         WHERE profile.id = v_m.player1_id
    ) OR NOT EXISTS (
        SELECT 1 FROM public.profiles AS profile
         WHERE profile.id = v_m.player2_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_match_players');
    END IF;
    IF v_m.stake_amount IS NULL OR v_m.stake_amount NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_match_stake');
    END IF;
    IF v_m.created_at IS NULL OR v_m.created_at > now() + interval '1 minute'
       OR v_m.created_at < now() - interval '30 minutes' THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_expired');
    END IF;
    IF jsonb_typeof(v_m.questions) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_m.questions) <> 20
       OR v_m.questions IS DISTINCT FROM to_jsonb(p_question_ids) THEN
        RETURN jsonb_build_object('success', false, 'error', 'roster_mismatch');
    END IF;

    IF p_user_id = v_m.player1_id THEN v_side := 1;
    ELSIF p_user_id = v_m.player2_id THEN v_side := 2;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'not_your_match'); END IF;
    SELECT session_id INTO v_existing
      FROM public.trivia_pvp_session_links
     WHERE match_id = p_match_id AND side = v_side;
    IF FOUND THEN
        IF EXISTS (
            SELECT 1 FROM public.trivia_pvp_session_links
             WHERE match_id = p_match_id AND side = v_side AND user_id = p_user_id
        ) THEN
            RETURN jsonb_build_object('success', true, 'duplicate', true, 'session_id', v_existing);
        END IF;
        RETURN jsonb_build_object('success', false, 'error', 'session_link_conflict');
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_pvp_session_links WHERE session_id = p_session_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_id_reused');
    END IF;
    IF EXISTS (SELECT 1 FROM public.trivia_sessions WHERE id = p_session_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_id_conflict');
    END IF;

    v_stake := v_m.stake_amount;
    SELECT public.add_diamonds_to_balance(
        p_user_id, -v_stake, 'pvp_stake',
        'PvP stake - match ' || p_match_id::text,
        'pvp_stake_' || p_match_id::text || '_' || p_user_id::text
    ) INTO v_charge;
    IF v_charge IS NULL
       OR (COALESCE((v_charge ->> 'success')::boolean, false) IS NOT TRUE
           AND COALESCE((v_charge ->> 'duplicate')::boolean, false) IS NOT TRUE) THEN
        RETURN jsonb_build_object('success', false, 'error',
            COALESCE(v_charge ->> 'error', 'insufficient_diamonds'));
    END IF;

    INSERT INTO public.trivia_sessions (
        id, user_id, mode, question_ids, permutations, status,
        entry_cost, entry_state, created_at, expires_at
    ) VALUES (
        p_session_id, p_user_id, 'pvp', p_question_ids,
        COALESCE(p_permutations, '{}'::jsonb), 'open',
        v_stake, 'charged', clock_timestamp(),
        v_m.created_at + interval '30 minutes'
    );
    INSERT INTO public.trivia_pvp_session_links (
        match_id, side, user_id, session_id, created_at
    ) VALUES (
        p_match_id, v_side, p_user_id, p_session_id, clock_timestamp()
    );

    RETURN jsonb_build_object(
        'success', true, 'duplicate', false, 'session_id', p_session_id,
        'new_balance', v_charge -> 'new_balance'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)
    TO service_role;

-- --------------------------------------------------------------------------
-- 5. One locked, immutable settlement decision and reference family.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_trivia_pvp_settlement_v1(
    p_match_id uuid,
    p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_match public.trivia_pvp_matches%ROWTYPE;
    v_existing public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_link1 public.trivia_pvp_session_links%ROWTYPE;
    v_link2 public.trivia_pvp_session_links%ROWTYPE;
    v_session1 public.trivia_sessions%ROWTYPE;
    v_session2 public.trivia_sessions%ROWTYPE;
    v_has_link1 boolean := false;
    v_has_link2 boolean := false;
    v_p1_is_horse boolean;
    v_p2_is_horse boolean;
    v_p1_charged boolean := false;
    v_p2_charged boolean := false;
    v_p1_submitted boolean := false;
    v_p2_submitted boolean := false;
    v_p1_correct integer;
    v_p2_correct integer;
    v_txn_count integer;
    v_exact_txn_count integer;
    v_stake integer;
    v_total_pot integer;
    v_rake integer;
    v_winner_payout integer;
    v_kind text;
    v_winner_id uuid;
    v_forfeit boolean := false;
    v_reference_family text;
    v_side_state jsonb;
    v_credit_plan jsonb := '[]'::jsonb;
    v_credit jsonb;
    v_credit_result jsonb;
    v_credited_amount integer := 0;
    v_credit_count integer := 0;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_match_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'invalid_match_id'
        );
    END IF;

    -- The match lock serializes decision creation. Lock children in stable side
    -- order before reading them so submit/expiry and link creation cannot race
    -- the decision snapshot.
    SELECT * INTO v_match
      FROM public.trivia_pvp_matches
     WHERE id = p_match_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'match_not_found'
        );
    END IF;

    SELECT * INTO v_existing
      FROM public.trivia_pvp_settlement_decisions
     WHERE match_id = p_match_id;
    IF FOUND THEN
        IF v_match.status NOT IN ('complete', 'completed') THEN
            RAISE EXCEPTION
                'settlement invariant failed: decision exists for non-terminal match % (%)',
                p_match_id, v_match.status;
        END IF;
        RETURN jsonb_build_object(
            'success', true,
            'state', 'replay',
            'replayed', true,
            'match_id', p_match_id,
            'match_status', v_match.status,
            'credit_count', jsonb_array_length(v_existing.credit_plan),
            'credited_amount', (
                SELECT COALESCE(sum((credit.value ->> 'amount')::integer), 0)::integer
                  FROM jsonb_array_elements(v_existing.credit_plan) AS credit(value)
            ),
            'decision', jsonb_build_object(
                'kind', v_existing.decision_kind,
                'forfeit', v_existing.forfeit,
                'winner_id', v_existing.winner_id,
                'player1_score', v_existing.player1_score,
                'player2_score', v_existing.player2_score,
                'reference_family', v_existing.reference_family,
                'sides', v_existing.side_state,
                'credits', v_existing.credit_plan
            )
        );
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.competitive_quarantine
         WHERE entity_type = 'trivia_pvp_match' AND entity_id = p_match_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'match_quarantined'
        );
    END IF;
    IF v_match.status NOT IN ('active', 'settling') THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', CASE
                WHEN v_match.status IN ('complete', 'completed')
                    THEN 'terminal_match_missing_decision'
                ELSE 'match_not_settleable'
            END
        );
    END IF;
    IF COALESCE(p_force, false)
       AND (v_match.created_at IS NULL
            OR v_match.created_at > clock_timestamp() - interval '30 minutes') THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'match_not_stale'
        );
    END IF;
    IF v_match.player1_id IS NULL OR v_match.player2_id IS NULL
       OR v_match.player1_id = v_match.player2_id
       OR v_match.stake_amount IS NULL
       OR v_match.stake_amount NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'invalid_match'
        );
    END IF;

    SELECT p1.is_horse IS TRUE, p2.is_horse IS TRUE
      INTO v_p1_is_horse, v_p2_is_horse
      FROM public.profiles AS p1
      CROSS JOIN public.profiles AS p2
     WHERE p1.id = v_match.player1_id
       AND p2.id = v_match.player2_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'invalid_match_players'
        );
    END IF;

    IF jsonb_typeof(v_match.questions) IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_match.questions) <> 20
       OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements(v_match.questions) AS question(value)
            WHERE jsonb_typeof(question.value) IS DISTINCT FROM 'string'
               OR (question.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       )
       OR (SELECT count(DISTINCT question.value #>> '{}')
             FROM jsonb_array_elements(v_match.questions) AS question(value)) <> 20 THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'invalid_match_roster'
        );
    END IF;

    PERFORM link.match_id
      FROM public.trivia_pvp_session_links AS link
     WHERE link.match_id = p_match_id
     ORDER BY link.side
     FOR UPDATE OF link;
    PERFORM session.id
      FROM public.trivia_pvp_session_links AS link
      JOIN public.trivia_sessions AS session ON session.id = link.session_id
     WHERE link.match_id = p_match_id
     ORDER BY link.side
     FOR UPDATE OF session;

    SELECT * INTO v_link1
      FROM public.trivia_pvp_session_links
     WHERE match_id = p_match_id AND side = 1;
    v_has_link1 := FOUND;
    IF v_has_link1 THEN
        SELECT * INTO v_session1 FROM public.trivia_sessions WHERE id = v_link1.session_id;
        IF NOT FOUND
           OR v_link1.user_id IS DISTINCT FROM v_match.player1_id
           OR v_session1.user_id IS DISTINCT FROM v_match.player1_id
           OR v_session1.mode IS DISTINCT FROM 'pvp'
           OR v_session1.status NOT IN ('open', 'submitted', 'expired')
           OR v_session1.entry_state IS DISTINCT FROM 'charged'
           OR v_session1.entry_cost IS DISTINCT FROM v_match.stake_amount
           OR array_ndims(v_session1.question_ids) IS DISTINCT FROM 1
           OR cardinality(v_session1.question_ids) <> 20
           OR array_position(v_session1.question_ids, NULL::uuid) IS NOT NULL
           OR (SELECT count(DISTINCT question_id)
                 FROM unnest(v_session1.question_ids) AS question_id) <> 20
           OR v_match.questions IS DISTINCT FROM to_jsonb(v_session1.question_ids)
           OR v_session1.created_at IS NULL
           OR v_match.created_at IS NULL
           OR v_session1.created_at < v_match.created_at - interval '1 second'
           OR v_session1.created_at > v_match.created_at + interval '30 minutes'
           OR v_session1.expires_at IS NULL
           OR v_session1.expires_at < v_session1.created_at
           OR v_session1.expires_at > v_match.created_at + interval '30 minutes'
           OR (v_session1.status = 'submitted' AND (
               v_session1.submitted_at IS NULL
               OR v_session1.submitted_at > v_session1.expires_at
               OR v_session1.correct_count IS NULL
               OR v_session1.correct_count NOT BETWEEN 0 AND 20
           )) THEN
            RETURN jsonb_build_object(
                'success', false, 'state', 'rejected', 'match_id', p_match_id,
                'error', 'player1_session_invalid'
            );
        END IF;
        v_p1_submitted := v_session1.status = 'submitted';
        v_p1_correct := CASE WHEN v_p1_submitted THEN v_session1.correct_count ELSE NULL END;
    END IF;

    SELECT count(*), count(*) FILTER (
               WHERE d.user_id = v_match.player1_id
                 AND d.amount = -v_match.stake_amount
                 AND COALESCE(
                     NULLIF(BTRIM(d.transaction_type), ''),
                     NULLIF(BTRIM(d.type), '')
                 ) = 'pvp_stake'
           )
      INTO v_txn_count, v_exact_txn_count
      FROM public.diamond_transactions AS d
     WHERE d.reference_id =
           'pvp_stake_' || p_match_id::text || '_' || v_match.player1_id::text;
    IF v_txn_count NOT IN (0, 1) OR v_txn_count <> v_exact_txn_count THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'player1_stake_invalid'
        );
    END IF;
    v_p1_charged := v_txn_count = 1;
    IF v_has_link1 AND NOT v_p1_charged THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'player1_stake_missing'
        );
    END IF;

    SELECT * INTO v_link2
      FROM public.trivia_pvp_session_links
     WHERE match_id = p_match_id AND side = 2;
    v_has_link2 := FOUND;
    IF v_has_link2 THEN
        SELECT * INTO v_session2 FROM public.trivia_sessions WHERE id = v_link2.session_id;
        IF NOT FOUND
           OR v_link2.user_id IS DISTINCT FROM v_match.player2_id
           OR v_session2.user_id IS DISTINCT FROM v_match.player2_id
           OR v_session2.mode IS DISTINCT FROM 'pvp'
           OR v_session2.status NOT IN ('open', 'submitted', 'expired')
           OR v_session2.entry_state IS DISTINCT FROM 'charged'
           OR v_session2.entry_cost IS DISTINCT FROM v_match.stake_amount
           OR array_ndims(v_session2.question_ids) IS DISTINCT FROM 1
           OR cardinality(v_session2.question_ids) <> 20
           OR array_position(v_session2.question_ids, NULL::uuid) IS NOT NULL
           OR (SELECT count(DISTINCT question_id)
                 FROM unnest(v_session2.question_ids) AS question_id) <> 20
           OR v_match.questions IS DISTINCT FROM to_jsonb(v_session2.question_ids)
           OR v_session2.created_at IS NULL
           OR v_match.created_at IS NULL
           OR v_session2.created_at < v_match.created_at - interval '1 second'
           OR v_session2.created_at > v_match.created_at + interval '30 minutes'
           OR v_session2.expires_at IS NULL
           OR v_session2.expires_at < v_session2.created_at
           OR v_session2.expires_at > v_match.created_at + interval '30 minutes'
           OR (v_session2.status = 'submitted' AND (
               v_session2.submitted_at IS NULL
               OR v_session2.submitted_at > v_session2.expires_at
               OR v_session2.correct_count IS NULL
               OR v_session2.correct_count NOT BETWEEN 0 AND 20
           )) THEN
            RETURN jsonb_build_object(
                'success', false, 'state', 'rejected', 'match_id', p_match_id,
                'error', 'player2_session_invalid'
            );
        END IF;
        v_p2_submitted := v_session2.status = 'submitted';
        v_p2_correct := CASE WHEN v_p2_submitted THEN v_session2.correct_count ELSE NULL END;
    END IF;

    SELECT count(*), count(*) FILTER (
               WHERE d.user_id = v_match.player2_id
                 AND d.amount = -v_match.stake_amount
                 AND COALESCE(
                     NULLIF(BTRIM(d.transaction_type), ''),
                     NULLIF(BTRIM(d.type), '')
                 ) = 'pvp_stake'
           )
      INTO v_txn_count, v_exact_txn_count
      FROM public.diamond_transactions AS d
     WHERE d.reference_id =
           'pvp_stake_' || p_match_id::text || '_' || v_match.player2_id::text;
    IF v_txn_count NOT IN (0, 1) OR v_txn_count <> v_exact_txn_count THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'player2_stake_invalid'
        );
    END IF;
    v_p2_charged := v_txn_count = 1;
    IF v_has_link2 AND NOT v_p2_charged THEN
        RETURN jsonb_build_object(
            'success', false, 'state', 'rejected', 'match_id', p_match_id,
            'error', 'player2_stake_missing'
        );
    END IF;

    IF v_p1_submitted AND v_p2_submitted THEN
        IF v_p1_correct > v_p2_correct THEN
            v_kind := 'win'; v_winner_id := v_match.player1_id;
        ELSIF v_p2_correct > v_p1_correct THEN
            v_kind := 'win'; v_winner_id := v_match.player2_id;
        ELSE
            v_kind := 'tie';
        END IF;
    ELSIF NOT COALESCE(p_force, false) THEN
        RETURN jsonb_build_object(
            'success', true,
            'state', 'pending',
            'replayed', false,
            'match_id', p_match_id,
            'pending_reason', CASE
                WHEN v_p1_submitted OR v_p2_submitted THEN 'opponent_not_finished'
                ELSE 'match_not_finished'
            END
        );
    ELSIF v_p1_submitted OR v_p2_submitted THEN
        IF v_p1_submitted THEN
            IF v_p2_charged THEN
                v_kind := 'win'; v_winner_id := v_match.player1_id; v_forfeit := true;
            ELSIF v_p1_charged THEN
                v_kind := 'refund';
            ELSE
                v_kind := 'void';
            END IF;
        ELSE
            IF v_p1_charged THEN
                v_kind := 'win'; v_winner_id := v_match.player2_id; v_forfeit := true;
            ELSIF v_p2_charged THEN
                v_kind := 'refund';
            ELSE
                v_kind := 'void';
            END IF;
        END IF;
    ELSIF v_p1_charged OR v_p2_charged THEN
        v_kind := 'refund';
    ELSE
        v_kind := 'void';
    END IF;

    v_stake := v_match.stake_amount;
    v_total_pot := v_stake * 2;
    v_rake := floor(v_total_pot * 0.10)::integer;
    v_winner_payout := v_total_pot - v_rake;
    IF v_kind = 'win' AND v_winner_id IS NOT NULL THEN
        v_credit_plan := v_credit_plan || jsonb_build_array(jsonb_build_object(
            'user_id', v_winner_id,
            'amount', v_winner_payout,
            'transaction_type', 'pvp_win',
            'description', 'PvP match won - ' || v_winner_payout::text
                || ' diamonds payout (pot ' || v_total_pot::text
                || ', rake ' || v_rake::text || ')',
            'reference_id', 'pvp_match_win_' || p_match_id::text
        ));
    ELSIF v_kind = 'tie' THEN
        IF v_p1_charged THEN
            v_credit_plan := v_credit_plan || jsonb_build_array(jsonb_build_object(
                'user_id', v_match.player1_id, 'amount', v_stake,
                'transaction_type', 'pvp_refund',
                'description', 'PvP tie - ' || v_stake::text || ' diamonds returned',
                'reference_id', 'pvp_tie_refund_' || p_match_id::text || '_' || v_match.player1_id::text
            ));
        END IF;
        IF v_p2_charged THEN
            v_credit_plan := v_credit_plan || jsonb_build_array(jsonb_build_object(
                'user_id', v_match.player2_id, 'amount', v_stake,
                'transaction_type', 'pvp_refund',
                'description', 'PvP tie - ' || v_stake::text || ' diamonds returned',
                'reference_id', 'pvp_tie_refund_' || p_match_id::text || '_' || v_match.player2_id::text
            ));
        END IF;
    ELSIF v_kind = 'refund' THEN
        IF v_p1_charged THEN
            v_credit_plan := v_credit_plan || jsonb_build_array(jsonb_build_object(
                'user_id', v_match.player1_id, 'amount', v_stake,
                'transaction_type', 'pvp_refund',
                'description', 'PvP match not completed - ' || v_stake::text || ' diamond stake refunded',
                'reference_id', 'pvp_refund_' || p_match_id::text || '_' || v_match.player1_id::text
            ));
        END IF;
        IF v_p2_charged THEN
            v_credit_plan := v_credit_plan || jsonb_build_array(jsonb_build_object(
                'user_id', v_match.player2_id, 'amount', v_stake,
                'transaction_type', 'pvp_refund',
                'description', 'PvP match not completed - ' || v_stake::text || ' diamond stake refunded',
                'reference_id', 'pvp_refund_' || p_match_id::text || '_' || v_match.player2_id::text
            ));
        END IF;
    END IF;

    v_side_state := jsonb_build_array(
        jsonb_build_object(
            'side', 1, 'user_id', v_match.player1_id,
            'session_id', CASE WHEN v_has_link1 THEN v_link1.session_id ELSE NULL END,
            'is_horse', v_p1_is_horse, 'charged', v_p1_charged,
            'submitted', v_p1_submitted, 'correct_count', v_p1_correct
        ),
        jsonb_build_object(
            'side', 2, 'user_id', v_match.player2_id,
            'session_id', CASE WHEN v_has_link2 THEN v_link2.session_id ELSE NULL END,
            'is_horse', v_p2_is_horse, 'charged', v_p2_charged,
            'submitted', v_p2_submitted, 'correct_count', v_p2_correct
        )
    );
    v_reference_family := 'pvp_settlement_' || p_match_id::text;

    INSERT INTO public.trivia_pvp_settlement_decisions (
        match_id, decision_kind, winner_id, player1_score, player2_score,
        forfeit, reference_family, side_state, credit_plan
    ) VALUES (
        p_match_id, v_kind, v_winner_id, v_p1_correct, v_p2_correct,
        v_forfeit, v_reference_family, v_side_state, v_credit_plan
    );

    UPDATE public.trivia_pvp_matches
       SET status = 'settling',
           settlement_kind = v_kind,
           winner_id = v_winner_id,
           player1_score = v_p1_correct,
           player2_score = v_p2_correct
     WHERE id = p_match_id;

    -- The decision, every wallet mutation, its diamond_transactions receipt,
    -- and the terminal match transition share this function's transaction.
    -- A wallet rejection raises, rolling all of them back together. A retry
    -- can therefore only see no decision (and recompute under the same locks)
    -- or a fully completed decision; partial payment is not a durable state.
    FOR v_credit IN
        SELECT value FROM jsonb_array_elements(v_credit_plan)
    LOOP
        SELECT public.add_diamonds_to_balance(
            (v_credit ->> 'user_id')::uuid,
            (v_credit ->> 'amount')::integer,
            v_credit ->> 'transaction_type',
            v_credit ->> 'description',
            v_credit ->> 'reference_id'
        ) INTO v_credit_result;

        IF COALESCE((v_credit_result ->> 'success')::boolean, false) IS NOT TRUE
           OR COALESCE((v_credit_result ->> 'duplicate')::boolean, false) IS TRUE
           OR (v_credit_result ->> 'amount')::integer
                IS DISTINCT FROM (v_credit ->> 'amount')::integer
           OR COALESCE((v_credit_result ->> 'multiplier')::numeric, 0) <> 1 THEN
            RAISE EXCEPTION 'atomic PvP credit rejected for match % reference %: %',
                p_match_id, v_credit ->> 'reference_id',
                COALESCE(v_credit_result::text, 'null');
        END IF;

        v_credited_amount := v_credited_amount + (v_credit ->> 'amount')::integer;
        v_credit_count := v_credit_count + 1;
    END LOOP;

    UPDATE public.trivia_pvp_matches
       SET status = 'complete',
           completed_at = clock_timestamp()
     WHERE id = p_match_id
       AND status = 'settling';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'atomic PvP terminal transition failed for match %', p_match_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'state', 'decided',
        'replayed', false,
        'match_id', p_match_id,
        'match_status', 'complete',
        'credit_count', v_credit_count,
        'credited_amount', v_credited_amount,
        'decision', jsonb_build_object(
            'kind', v_kind,
            'forfeit', v_forfeit,
            'winner_id', v_winner_id,
            'player1_score', v_p1_correct,
            'player2_score', v_p2_correct,
            'reference_family', v_reference_family,
            'sides', v_side_state,
            'credits', v_credit_plan
        )
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.decide_trivia_pvp_settlement_v1(uuid,boolean)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_trivia_pvp_settlement_v1(uuid,boolean)
    TO service_role;

COMMENT ON FUNCTION public.decide_trivia_pvp_settlement_v1(uuid,boolean) IS
    'Service-only atomic PvP settlement. Locks inputs, persists one immutable outcome, '
    'writes every wallet receipt, and closes the match in one transaction; replay returns '
    'that exact completed decision.';

-- Stats are downstream of the immutable decision. Refund/void is not a played
-- tie, and an uncharged absent participant must never receive phantom stats.
CREATE OR REPLACE FUNCTION public.record_trivia_pvp_stats_v2(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_match public.trivia_pvp_matches%ROWTYPE;
    v_decision public.trivia_pvp_settlement_decisions%ROWTYPE;
    v_side record;
    v_outcome text;
    v_stake integer;
    v_net_win integer;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    SELECT * INTO v_match
      FROM public.trivia_pvp_matches
     WHERE id = p_match_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_found');
    END IF;
    IF v_match.status NOT IN ('complete', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'match_not_complete');
    END IF;
    IF v_match.stats_recorded_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'deduped', true);
    END IF;
    SELECT * INTO v_decision
      FROM public.trivia_pvp_settlement_decisions
     WHERE match_id = p_match_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'settlement_decision_missing');
    END IF;

    v_stake := v_match.stake_amount;
    v_net_win := GREATEST(
        (v_stake * 2 - floor(v_stake * 2 * 0.10)::integer) - v_stake,
        0
    );
    UPDATE public.trivia_pvp_matches
       SET stats_recorded_at = clock_timestamp()
     WHERE id = p_match_id;

    IF v_decision.decision_kind IN ('win', 'tie') THEN
        FOR v_side IN
            SELECT (side.value ->> 'user_id')::uuid AS user_id
              FROM jsonb_array_elements(v_decision.side_state) AS side(value)
             WHERE COALESCE((side.value ->> 'charged')::boolean, false)
        LOOP
            v_outcome := CASE
                WHEN v_decision.decision_kind = 'tie' THEN 'tie'
                WHEN v_decision.winner_id = v_side.user_id THEN 'win'
                ELSE 'loss'
            END;
            INSERT INTO public.trivia_pvp_stats AS stats (
                user_id, wins, losses, ties, win_streak, best_streak,
                total_diamonds_won, total_diamonds_lost, updated_at
            ) VALUES (
                v_side.user_id,
                CASE WHEN v_outcome = 'win' THEN 1 ELSE 0 END,
                CASE WHEN v_outcome = 'loss' THEN 1 ELSE 0 END,
                CASE WHEN v_outcome = 'tie' THEN 1 ELSE 0 END,
                CASE WHEN v_outcome = 'win' THEN 1 ELSE 0 END,
                CASE WHEN v_outcome = 'win' THEN 1 ELSE 0 END,
                CASE WHEN v_outcome = 'win' THEN v_net_win ELSE 0 END,
                CASE WHEN v_outcome = 'loss' THEN v_stake ELSE 0 END,
                clock_timestamp()
            ) ON CONFLICT (user_id) DO UPDATE SET
                wins = stats.wins + CASE WHEN v_outcome = 'win' THEN 1 ELSE 0 END,
                losses = stats.losses + CASE WHEN v_outcome = 'loss' THEN 1 ELSE 0 END,
                ties = stats.ties + CASE WHEN v_outcome = 'tie' THEN 1 ELSE 0 END,
                win_streak = CASE
                    WHEN v_outcome = 'win' THEN stats.win_streak + 1
                    WHEN v_outcome = 'loss' THEN 0
                    ELSE stats.win_streak
                END,
                best_streak = GREATEST(
                    stats.best_streak,
                    CASE WHEN v_outcome = 'win' THEN stats.win_streak + 1 ELSE stats.win_streak END
                ),
                total_diamonds_won = stats.total_diamonds_won
                    + CASE WHEN v_outcome = 'win' THEN v_net_win ELSE 0 END,
                total_diamonds_lost = stats.total_diamonds_lost
                    + CASE WHEN v_outcome = 'loss' THEN v_stake ELSE 0 END,
                updated_at = clock_timestamp();
        END LOOP;
    END IF;
    RETURN jsonb_build_object('success', true, 'deduped', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_trivia_pvp_stats_v2(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_trivia_pvp_stats_v2(uuid) TO service_role;

-- --------------------------------------------------------------------------
-- 6. Post-apply least-privilege and exact-schema assertions.
-- --------------------------------------------------------------------------
DO $acl_assertions$
DECLARE
    v_table text;
    v_column text;
BEGIN
    IF EXISTS (
        SELECT 1
          FROM unnest(ARRAY[
              'trivia_pvp_queue', 'trivia_pvp_matches',
              'trivia_sessions',
              'trivia_tournaments', 'trivia_tournament_entries',
              'trivia_tournament_rounds',
              'trivia_pvp_active_seats', 'trivia_pvp_session_links',
              'trivia_pvp_settlement_decisions', 'competitive_quarantine'
          ]) AS expected(table_name)
          JOIN pg_class AS c ON c.oid = format('public.%I', expected.table_name)::regclass
         WHERE c.relrowsecurity IS NOT TRUE
    ) THEN
        RAISE EXCEPTION 'post-apply failed: required RLS is disabled';
    END IF;

    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'trivia_pvp_queue') <> 2
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'trivia_pvp_queue' AND policyname = 'trivia_pvp_queue_select_own'
            AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[])
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'trivia_pvp_queue' AND policyname = 'trivia_pvp_queue_service_manage'
            AND cmd = 'ALL' AND roles = ARRAY['service_role']::name[])
       OR (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'trivia_pvp_matches') <> 2
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'trivia_pvp_matches'
            AND policyname = 'trivia_pvp_matches_select_participant'
            AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[])
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'trivia_pvp_matches'
            AND policyname = 'trivia_pvp_matches_service_manage'
            AND cmd = 'ALL' AND roles = ARRAY['service_role']::name[])
       OR (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'trivia_sessions') <> 1
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
            AND tablename = 'trivia_sessions'
            AND policyname = 'trivia_sessions_select_own'
            AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[]) THEN
        RAISE EXCEPTION 'post-apply failed: queue/match/session policy set drifted';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (VALUES
              ('trivia_tournaments', 'trivia_tournaments_service_manage'),
              ('trivia_tournament_entries', 'trivia_tournament_entries_service_manage'),
              ('trivia_tournament_rounds', 'trivia_tournament_rounds_service_manage')
          ) AS expected(table_name, policy_name)
         WHERE (SELECT count(*) FROM pg_policies AS policy
                 WHERE policy.schemaname = 'public'
                   AND policy.tablename = expected.table_name) <> 1
            OR NOT EXISTS (
                SELECT 1 FROM pg_policies AS policy
                 WHERE policy.schemaname = 'public'
                   AND policy.tablename = expected.table_name
                   AND policy.policyname = expected.policy_name
                   AND policy.cmd = 'ALL'
                   AND policy.roles = ARRAY['service_role']::name[]
                   AND policy.permissive = 'PERMISSIVE'
                   AND policy.qual = 'true'
                   AND policy.with_check = 'true'
            )
    ) THEN
        RAISE EXCEPTION 'post-apply failed: tournament policy set drifted';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM (VALUES
              ('trivia_pvp_active_seats', 'trivia_pvp_active_seats_service_select'),
              ('trivia_pvp_session_links', 'trivia_pvp_session_links_service_select'),
              ('trivia_pvp_settlement_decisions', 'trivia_pvp_settlement_decisions_service_select'),
              ('competitive_quarantine', 'competitive_quarantine_service_select')
          ) AS expected(table_name, policy_name)
         WHERE (SELECT count(*) FROM pg_policies AS policy
                 WHERE policy.schemaname = 'public'
                   AND policy.tablename = expected.table_name) <> 1
            OR NOT EXISTS (
                SELECT 1 FROM pg_policies AS policy
                 WHERE policy.schemaname = 'public'
                   AND policy.tablename = expected.table_name
                   AND policy.policyname = expected.policy_name
                   AND policy.cmd = 'SELECT'
                   AND policy.roles = ARRAY['service_role']::name[]
            )
    ) THEN
        RAISE EXCEPTION 'post-apply failed: internal-table policy set drifted';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.trivia_pvp_queue', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.trivia_pvp_matches', 'SELECT')
       OR has_table_privilege('anon', 'public.trivia_pvp_queue', 'SELECT')
       OR has_table_privilege('anon', 'public.trivia_pvp_matches', 'SELECT')
       OR has_table_privilege('anon', 'public.trivia_pvp_queue', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_pvp_queue', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_pvp_matches', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_pvp_matches', 'INSERT,UPDATE,DELETE')
       OR NOT has_table_privilege('authenticated', 'public.trivia_sessions', 'SELECT')
       OR has_table_privilege('anon', 'public.trivia_sessions', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_sessions', 'INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_tournaments', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_tournaments', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_tournament_entries', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_tournament_entries', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_tournament_rounds', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('authenticated', 'public.trivia_tournament_rounds', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.trivia_tournaments_public', 'SELECT')
       OR has_table_privilege('authenticated', 'public.trivia_tournaments_public', 'SELECT')
       OR has_any_column_privilege('anon', 'public.trivia_tournaments_public',
                                   'SELECT,INSERT,UPDATE,REFERENCES')
       OR has_any_column_privilege('authenticated', 'public.trivia_tournaments_public',
                                   'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'post-apply failed: browser queue/match/session ACL is not exact';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.trivia_pvp_queue', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_queue', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_queue', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_queue', 'DELETE')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_matches', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_matches', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.trivia_pvp_matches', 'UPDATE')
       OR has_table_privilege('service_role', 'public.trivia_pvp_matches', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('service_role', 'public.trivia_sessions', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.trivia_sessions', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.trivia_sessions', 'UPDATE')
       OR has_table_privilege('service_role', 'public.trivia_sessions', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('service_role', 'public.trivia_tournaments', 'SELECT,INSERT,UPDATE')
       OR has_table_privilege('service_role', 'public.trivia_tournaments', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('service_role', 'public.trivia_tournament_entries', 'SELECT,INSERT,UPDATE')
       OR has_table_privilege('service_role', 'public.trivia_tournament_entries', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('service_role', 'public.trivia_tournament_rounds', 'SELECT,INSERT,UPDATE')
       OR has_table_privilege('service_role', 'public.trivia_tournament_rounds', 'DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR NOT has_table_privilege('service_role', 'public.trivia_tournaments_public', 'SELECT') THEN
        RAISE EXCEPTION 'post-apply failed: service queue/match/session ACL is not exact';
    END IF;

    FOREACH v_table IN ARRAY ARRAY[
        'trivia_pvp_active_seats', 'trivia_pvp_session_links',
        'trivia_pvp_settlement_decisions', 'competitive_quarantine'
    ] LOOP
        IF NOT has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('service_role', format('public.%I', v_table),
                                  'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           OR has_any_column_privilege('anon', format('public.%I', v_table),
                                       'SELECT,INSERT,UPDATE,REFERENCES')
           OR has_any_column_privilege('authenticated', format('public.%I', v_table),
                                       'SELECT,INSERT,UPDATE,REFERENCES') THEN
            RAISE EXCEPTION 'post-apply failed: internal ACL drift on %', v_table;
        END IF;
    END LOOP;

    -- Prove no column-level grant bypasses the table-level browser write revoke.
    FOREACH v_table IN ARRAY ARRAY[
        'trivia_pvp_queue', 'trivia_pvp_matches', 'trivia_sessions',
        'trivia_tournaments', 'trivia_tournament_entries',
        'trivia_tournament_rounds'
    ] LOOP
        FOR v_column IN
            SELECT a.attname FROM pg_attribute AS a
             WHERE a.attrelid = format('public.%I', v_table)::regclass
               AND a.attnum > 0 AND NOT a.attisdropped
        LOOP
            IF has_column_privilege('anon', format('public.%I', v_table), v_column,
                                    'INSERT,UPDATE,REFERENCES')
               OR has_column_privilege('authenticated', format('public.%I', v_table), v_column,
                                       'INSERT,UPDATE,REFERENCES') THEN
                RAISE EXCEPTION 'post-apply failed: browser column ACL drift on %.%',
                    v_table, v_column;
            END IF;
        END LOOP;
    END LOOP;
END
$acl_assertions$;

DO $constraint_assertions$
DECLARE
    v_name text;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'trivia_pvp_matches_distinct_players_check',
        'trivia_pvp_matches_allowed_stake_check',
        'trivia_pvp_matches_winner_participant_check',
        'trivia_pvp_matches_score_bounds_check',
        'trivia_pvp_matches_score_aliases_check',
        'trivia_pvp_matches_status_check',
        'trivia_pvp_matches_settlement_kind_check',
        'trivia_pvp_matches_player1_profile_fkey',
        'trivia_pvp_matches_player2_profile_fkey',
        'trivia_pvp_matches_winner_profile_fkey',
        'trivia_pvp_queue_allowed_stake_check',
        'trivia_pvp_queue_status_check',
        'trivia_pvp_queue_match_fkey'
    ] LOOP
        IF (SELECT count(*) FROM pg_constraint
             WHERE conname = v_name AND connamespace = 'public'::regnamespace
               AND convalidated) <> 1 THEN
            RAISE EXCEPTION 'post-apply failed: missing/unvalidated constraint %', v_name;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
          FROM pg_constraint AS c
          JOIN LATERAL unnest(c.conkey) AS key(attnum) ON true
          JOIN pg_attribute AS a
            ON a.attrelid = c.conrelid AND a.attnum = key.attnum
         WHERE c.conrelid = 'public.trivia_pvp_matches'::regclass
           AND c.contype = 'f'
           AND c.confrelid = 'auth.users'::regclass
           AND a.attname IN (
               'player1_id', 'player2_id', 'winner_id',
               'challenger_id', 'opponent_id'
           )
    ) THEN
        RAISE EXCEPTION 'post-apply failed: legacy auth.users PvP FK remains';
    END IF;

    IF (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.trivia_pvp_active_seats'::regclass) <> 5
       OR (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.trivia_pvp_session_links'::regclass) <> 7
       OR (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.competitive_quarantine'::regclass) <> 4
       OR (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'public.trivia_pvp_settlement_decisions'::regclass) <> 10
       OR EXISTS (SELECT 1 FROM pg_constraint
           WHERE conrelid IN (
               'public.trivia_pvp_active_seats'::regclass,
               'public.trivia_pvp_session_links'::regclass,
               'public.competitive_quarantine'::regclass,
               'public.trivia_pvp_settlement_decisions'::regclass
           ) AND NOT convalidated) THEN
        RAISE EXCEPTION 'post-apply failed: internal-table constraint set drifted';
    END IF;

    IF (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.trivia_pvp_active_seats'::regclass
            AND attnum > 0 AND NOT attisdropped) <> 4
       OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.trivia_pvp_session_links'::regclass
            AND attnum > 0 AND NOT attisdropped) <> 5
       OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.competitive_quarantine'::regclass
            AND attnum > 0 AND NOT attisdropped) <> 5
       OR (SELECT count(*) FROM pg_attribute WHERE attrelid = 'public.trivia_pvp_settlement_decisions'::regclass
            AND attnum > 0 AND NOT attisdropped) <> 10 THEN
        RAISE EXCEPTION 'post-apply failed: internal-table column set drifted';
    END IF;
END
$constraint_assertions$;

DO $index_assertions$
DECLARE
    v_name text;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'idx_pvp_queue_matching', 'idx_pvp_queue_one_waiting',
        'idx_pvp_queue_expiry', 'idx_pvp_queue_match',
        'idx_pvp_matches_player1', 'idx_pvp_matches_player2',
        'idx_pvp_matches_winner', 'idx_pvp_matches_open',
        'idx_trivia_pvp_session_links_user'
    ] LOOP
        IF to_regclass('public.' || v_name) IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM pg_index
                WHERE indexrelid = to_regclass('public.' || v_name)
                  AND indisvalid AND indisready
           ) THEN
            RAISE EXCEPTION 'post-apply failed: missing/invalid index %', v_name;
        END IF;
    END LOOP;
    IF NOT (SELECT indisunique FROM pg_index
             WHERE indexrelid = 'public.idx_pvp_queue_one_waiting'::regclass)
       OR (SELECT pg_get_expr(indpred, indrelid) FROM pg_index
            WHERE indexrelid = 'public.idx_pvp_queue_one_waiting'::regclass)
            IS DISTINCT FROM '(status = ''waiting''::text)'
       OR (SELECT pg_get_indexdef(indexrelid) FROM pg_index
            WHERE indexrelid = 'public.idx_pvp_queue_matching'::regclass)
            NOT LIKE '%(stake_amount, status, created_at)%'
       OR (SELECT pg_get_indexdef(indexrelid) FROM pg_index
            WHERE indexrelid = 'public.idx_pvp_matches_open'::regclass)
            NOT LIKE '%(status, created_at DESC)%'
       OR (SELECT pg_get_indexdef(indexrelid) FROM pg_index
            WHERE indexrelid = 'public.idx_trivia_pvp_session_links_user'::regclass)
            NOT LIKE '%(user_id, match_id)%' THEN
        RAISE EXCEPTION 'post-apply failed: named index definition drifted';
    END IF;
END
$index_assertions$;

DO $function_assertions$
DECLARE
    v_name text;
    v_signature text;
BEGIN
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'expire_old_queue_entries') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_trivia_session_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_trivia_session_answer') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'award_trivia_run') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'award_trivia_run_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'create_trivia_pvp_session_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'decide_trivia_pvp_settlement_v1') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_trivia_pvp_stats_v2') <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: RPC overload drift';
    END IF;

    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'enter_trivia_tournament_v2') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'fn_trivia_tournament_add_entry_score') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'fn_trivia_tournament_payout') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'record_trivia_tournament_question_results_v3') <> 1
       OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'fn_trivia_round_submit_verified_v3') <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: tournament RPC overload drift';
    END IF;

    FOREACH v_signature IN ARRAY ARRAY[
        'public.fn_trivia_pvp_match_sync_columns()',
        'public.sync_trivia_pvp_active_seats()',
        'public.validate_trivia_pvp_session_link()',
        'public.prevent_competitive_evidence_mutation()',
        'public.prevent_linked_trivia_pvp_identity_change()',
        'public.prevent_linked_trivia_session_identity_change()',
        'public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)',
        'public.award_trivia_run(uuid,integer,integer,integer,integer)',
        'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)',
        'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)',
        'public.decide_trivia_pvp_settlement_v1(uuid,boolean)',
        'public.record_trivia_pvp_stats_v2(uuid)'
    ] LOOP
        IF to_regprocedure(v_signature) IS NULL
           OR NOT EXISTS (
               SELECT 1 FROM pg_proc
                WHERE oid = to_regprocedure(v_signature)
                  AND prosecdef
                  AND proconfig @> ARRAY['search_path=public, extensions']::text[]
           ) THEN
            RAISE EXCEPTION 'post-apply failed: function/search_path drift on %', v_signature;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
          FROM (VALUES
              ('public.record_trivia_session_answer(uuid,uuid,uuid,integer)', 'search_path=public'),
              ('public.enter_trivia_tournament_v2(uuid,uuid)', 'search_path=public, extensions'),
              ('public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)', 'search_path=""'),
              ('public.fn_trivia_tournament_payout(uuid)', 'search_path=""'),
              ('public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)', 'search_path=public'),
              ('public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)', 'search_path=public')
          ) AS expected(signature, setting)
          LEFT JOIN pg_proc AS function
            ON function.oid = to_regprocedure(expected.signature)
         WHERE function.oid IS NULL
            OR function.prosecdef IS NOT TRUE
            OR function.proconfig IS NULL
            OR NOT function.proconfig @> ARRAY[expected.setting]::text[]
    ) THEN
        RAISE EXCEPTION 'post-apply failed: retained function/search_path drift';
    END IF;

    FOREACH v_signature IN ARRAY ARRAY[
        'public.expire_old_queue_entries()',
        'public.create_trivia_session_v2(uuid,uuid,text,uuid[],jsonb,uuid)',
        'public.record_trivia_session_answer(uuid,uuid,uuid,integer)',
        'public.award_trivia_run(uuid,integer,integer,integer,integer)',
        'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)',
        'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)',
        'public.decide_trivia_pvp_settlement_v1(uuid,boolean)',
        'public.record_trivia_pvp_stats_v2(uuid)',
        'public.enter_trivia_tournament_v2(uuid,uuid)',
        'public.fn_trivia_tournament_add_entry_score(uuid,integer,integer)',
        'public.fn_trivia_tournament_payout(uuid)',
        'public.record_trivia_tournament_question_results_v3(uuid,uuid,jsonb)',
        'public.fn_trivia_round_submit_verified_v3(uuid,uuid,integer,integer,jsonb)'
    ] LOOP
        IF has_function_privilege('anon', v_signature, 'EXECUTE')
           OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
           OR NOT has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
            RAISE EXCEPTION 'post-apply failed: RPC ACL drift on %', v_signature;
        END IF;
    END LOOP;

    FOREACH v_signature IN ARRAY ARRAY[
        'public.fn_trivia_pvp_match_sync_columns()',
        'public.sync_trivia_pvp_active_seats()',
        'public.validate_trivia_pvp_session_link()',
        'public.prevent_competitive_evidence_mutation()',
        'public.prevent_linked_trivia_pvp_identity_change()',
        'public.prevent_linked_trivia_session_identity_change()'
    ] LOOP
        IF has_function_privilege('anon', v_signature, 'EXECUTE')
           OR has_function_privilege('authenticated', v_signature, 'EXECUTE')
           OR has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
            RAISE EXCEPTION 'post-apply failed: trigger function callable directly: %', v_signature;
        END IF;
    END LOOP;

    IF (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.award_trivia_run(uuid,integer,integer,integer,integer)'::regprocedure)
            NOT LIKE '%expires_at >= v_now%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.award_trivia_run_v2(uuid,integer,integer,integer,integer,integer)'::regprocedure)
            NOT LIKE '%public.award_trivia_run(p_session_id%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.decide_trivia_pvp_settlement_v1(uuid,boolean)'::regprocedure)
            NOT LIKE '%INSERT INTO public.trivia_pvp_settlement_decisions%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.decide_trivia_pvp_settlement_v1(uuid,boolean)'::regprocedure)
            NOT LIKE '%FOR UPDATE OF session%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.decide_trivia_pvp_settlement_v1(uuid,boolean)'::regprocedure)
            NOT LIKE '%public.add_diamonds_to_balance(%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.decide_trivia_pvp_settlement_v1(uuid,boolean)'::regprocedure)
            NOT LIKE '%SET status = ''complete''%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.record_trivia_pvp_stats_v2(uuid)'::regprocedure)
            NOT LIKE '%v_decision.decision_kind IN (''win'', ''tie'')%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.sync_trivia_pvp_active_seats()'::regprocedure)
            LIKE '%is_horse%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb)'::regprocedure)
            LIKE '%horse_session_forbidden%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.decide_trivia_pvp_settlement_v1(uuid,boolean)'::regprocedure)
            SIMILAR TO '%(horse_stake_present|horse_session_link_present)%'
       OR (SELECT prosrc FROM pg_proc
         WHERE oid = 'public.record_trivia_pvp_stats_v2(uuid)'::regprocedure)
            LIKE '%AND NOT COALESCE((side.value ->> ''is_horse'')%' THEN
        RAISE EXCEPTION 'post-apply failed: critical function semantic assertion failed';
    END IF;
END
$function_assertions$;

DO $trigger_assertions$
DECLARE
    v_table regclass;
    v_trigger text;
    v_function regprocedure;
BEGIN
    FOR v_table, v_trigger, v_function IN
        SELECT expected.table_name::regclass,
               expected.trigger_name,
               expected.function_name::regprocedure
          FROM (VALUES
            ('public.trivia_pvp_matches', 'trg_trivia_pvp_match_sync',
             'public.fn_trivia_pvp_match_sync_columns()'),
            ('public.trivia_pvp_matches', 'trg_sync_trivia_pvp_active_seats',
             'public.sync_trivia_pvp_active_seats()'),
            ('public.trivia_pvp_matches', 'trg_00_guard_quarantined_pvp_match',
             'public.prevent_competitive_evidence_mutation()'),
            ('public.trivia_pvp_matches', 'trg_prevent_linked_trivia_pvp_identity_change',
             'public.prevent_linked_trivia_pvp_identity_change()'),
            ('public.trivia_pvp_session_links', 'trg_validate_trivia_pvp_session_link',
             'public.validate_trivia_pvp_session_link()'),
            ('public.trivia_sessions', 'trg_prevent_linked_trivia_session_identity_change',
             'public.prevent_linked_trivia_session_identity_change()'),
            ('public.trivia_tournaments', 'trg_00_guard_quarantined_tournament',
             'public.prevent_competitive_evidence_mutation()'),
            ('public.trivia_tournament_entries', 'trg_00_guard_quarantined_tournament_entry',
             'public.prevent_competitive_evidence_mutation()'),
            ('public.trivia_tournament_rounds', 'trg_00_guard_quarantined_tournament_round',
             'public.prevent_competitive_evidence_mutation()'),
            ('public.competitive_quarantine', 'trg_00_freeze_competitive_quarantine',
             'public.prevent_competitive_evidence_mutation()'),
            ('public.trivia_pvp_settlement_decisions', 'trg_00_freeze_pvp_settlement_decision',
             'public.prevent_competitive_evidence_mutation()')
          ) AS expected(table_name, trigger_name, function_name)
    LOOP
        IF (SELECT count(*) FROM pg_trigger
             WHERE tgrelid = v_table AND tgname = v_trigger
               AND NOT tgisinternal AND tgenabled = 'O'
               AND tgfoid = v_function) <> 1 THEN
            RAISE EXCEPTION 'post-apply failed: trigger drift %.%', v_table, v_trigger;
        END IF;
    END LOOP;

    -- Compare the complete non-internal inventory, including the two retained
    -- projection triggers. This detects an unexpected extra trigger as well as
    -- timing/event drift on a correctly named trigger.
    IF EXISTS (
        WITH expected(table_name, trigger_name, function_name, trigger_type) AS (
            VALUES
                ('trivia_pvp_matches', 'trg_trivia_pvp_match_sync',
                 'fn_trivia_pvp_match_sync_columns', 23::smallint),
                ('trivia_pvp_matches', 'trg_sync_trivia_pvp_active_seats',
                 'sync_trivia_pvp_active_seats', 29::smallint),
                ('trivia_pvp_matches', 'trg_00_guard_quarantined_pvp_match',
                 'prevent_competitive_evidence_mutation', 27::smallint),
                ('trivia_pvp_matches', 'trg_prevent_linked_trivia_pvp_identity_change',
                 'prevent_linked_trivia_pvp_identity_change', 23::smallint),
                ('trivia_pvp_session_links', 'trg_validate_trivia_pvp_session_link',
                 'validate_trivia_pvp_session_link', 23::smallint),
                ('trivia_sessions', 'trg_prevent_linked_trivia_session_identity_change',
                 'prevent_linked_trivia_session_identity_change', 19::smallint),
                ('trivia_sessions', 'trg_trivia_session_stats_v3',
                 'trg_finalize_trivia_session_stats_v3', 17::smallint),
                ('trivia_tournaments', 'trg_00_guard_quarantined_tournament',
                 'prevent_competitive_evidence_mutation', 27::smallint),
                ('trivia_tournament_entries', 'trg_00_guard_quarantined_tournament_entry',
                 'prevent_competitive_evidence_mutation', 31::smallint),
                ('trivia_tournament_entries', 'trg_trivia_tournament_player_count',
                 'fn_trivia_tournament_sync_player_count', 13::smallint),
                ('trivia_tournament_rounds', 'trg_00_guard_quarantined_tournament_round',
                 'prevent_competitive_evidence_mutation', 31::smallint),
                ('competitive_quarantine', 'trg_00_freeze_competitive_quarantine',
                 'prevent_competitive_evidence_mutation', 27::smallint),
                ('trivia_pvp_settlement_decisions', 'trg_00_freeze_pvp_settlement_decision',
                 'prevent_competitive_evidence_mutation', 27::smallint)
        ), actual AS (
            SELECT relation.relname::text AS table_name,
                   trigger.tgname::text AS trigger_name,
                   function.proname::text AS function_name,
                   trigger.tgtype AS trigger_type
              FROM pg_trigger AS trigger
              JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
              JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
              JOIN pg_proc AS function ON function.oid = trigger.tgfoid
             WHERE namespace.nspname = 'public'
               AND relation.relname IN (
                   'trivia_pvp_matches', 'trivia_pvp_session_links',
                   'trivia_sessions', 'trivia_tournaments',
                   'trivia_tournament_entries', 'trivia_tournament_rounds',
                   'competitive_quarantine', 'trivia_pvp_settlement_decisions'
               )
               AND NOT trigger.tgisinternal
               AND trigger.tgenabled = 'O'
        )
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
        UNION ALL
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    ) THEN
        RAISE EXCEPTION 'post-apply failed: complete trigger inventory drifted';
    END IF;
END
$trigger_assertions$;

DO $data_assertions$
DECLARE
    v_pvp_quarantine_count integer;
    v_tournament_quarantine_count integer;
    v_probe_id uuid;
    v_probe_blocked boolean;
BEGIN
    IF EXISTS (
        (SELECT match.id, seat.side, seat.user_id
           FROM public.trivia_pvp_matches AS match
           CROSS JOIN LATERAL (
               VALUES (1::smallint, match.player1_id),
                      (2::smallint, match.player2_id)
           ) AS seat(side, user_id)
           JOIN public.profiles AS profile ON profile.id = seat.user_id
          WHERE match.status IN ('active', 'settling')
         EXCEPT
         SELECT active.match_id, active.side, active.user_id
           FROM public.trivia_pvp_active_seats AS active)
        UNION ALL
        (SELECT active.match_id, active.side, active.user_id
           FROM public.trivia_pvp_active_seats AS active
         EXCEPT
         SELECT match.id, seat.side, seat.user_id
           FROM public.trivia_pvp_matches AS match
           CROSS JOIN LATERAL (
               VALUES (1::smallint, match.player1_id),
                      (2::smallint, match.player2_id)
           ) AS seat(side, user_id)
           JOIN public.profiles AS profile ON profile.id = seat.user_id
          WHERE match.status IN ('active', 'settling'))
    ) THEN
        RAISE EXCEPTION 'post-apply failed: active-seat projection mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_pvp_session_links AS link
          JOIN public.trivia_pvp_matches AS match ON match.id = link.match_id
          JOIN public.trivia_sessions AS session ON session.id = link.session_id
         WHERE ((link.side = 1 AND link.user_id IS DISTINCT FROM match.player1_id)
                OR (link.side = 2 AND link.user_id IS DISTINCT FROM match.player2_id))
            OR session.user_id IS DISTINCT FROM link.user_id
            OR session.mode IS DISTINCT FROM 'pvp'
            OR session.entry_state IS DISTINCT FROM 'charged'
            OR session.entry_cost IS DISTINCT FROM match.stake_amount
            OR array_ndims(session.question_ids) IS DISTINCT FROM 1
            OR cardinality(session.question_ids) <> 20
            OR array_position(session.question_ids, NULL::uuid) IS NOT NULL
            OR (SELECT count(DISTINCT question_id)
                  FROM unnest(session.question_ids) AS question_id) <> 20
            OR match.questions IS DISTINCT FROM to_jsonb(session.question_ids)
            OR session.expires_at IS NULL
            OR session.expires_at < session.created_at
            OR session.expires_at > match.created_at + interval '30 minutes'
            OR (session.status = 'submitted' AND (
                session.submitted_at IS NULL
                OR session.submitted_at > session.expires_at
                OR session.correct_count NOT BETWEEN 0 AND 20
            ))
            OR (SELECT count(*) FROM public.diamond_transactions AS d
                 WHERE d.reference_id = 'pvp_stake_' || match.id::text || '_' || link.user_id::text) <> 1
            OR (SELECT count(*) FROM public.diamond_transactions AS d
                 WHERE d.reference_id = 'pvp_stake_' || match.id::text || '_' || link.user_id::text
                   AND d.user_id = link.user_id
                   AND d.amount = -match.stake_amount
                   AND COALESCE(NULLIF(BTRIM(d.transaction_type), ''),
                                NULLIF(BTRIM(d.type), '')) = 'pvp_stake') <> 1
    ) THEN
        RAISE EXCEPTION 'post-apply failed: invalid durable PvP session link';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_pvp_settlement_decisions AS decision
          JOIN public.trivia_pvp_matches AS match ON match.id = decision.match_id
         WHERE decision.winner_id IS NOT NULL
               AND decision.winner_id IS DISTINCT FROM match.player1_id
               AND decision.winner_id IS DISTINCT FROM match.player2_id
            OR match.status NOT IN ('complete', 'completed')
            OR match.winner_id IS DISTINCT FROM decision.winner_id
            OR match.player1_score IS DISTINCT FROM decision.player1_score
            OR match.player2_score IS DISTINCT FROM decision.player2_score
            OR match.settlement_kind IS DISTINCT FROM decision.decision_kind
            OR decision.reference_family IS DISTINCT FROM
               'pvp_settlement_' || decision.match_id::text
            OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(decision.credit_plan) AS credit(value)
                 WHERE credit.value ->> 'reference_id' IS NULL
                    OR credit.value ->> 'user_id' IS NULL
                    OR COALESCE((credit.value ->> 'amount')::integer, 0) <= 0
                    OR credit.value ->> 'transaction_type' NOT IN ('pvp_win', 'pvp_refund')
                    OR (SELECT count(*) FROM public.diamond_transactions AS transaction
                         WHERE transaction.reference_id = credit.value ->> 'reference_id'
                           AND transaction.user_id = (credit.value ->> 'user_id')::uuid
                           AND transaction.amount = (credit.value ->> 'amount')::integer
                           AND COALESCE(
                               NULLIF(BTRIM(transaction.transaction_type), ''),
                               NULLIF(BTRIM(transaction.type), '')
                           ) = credit.value ->> 'transaction_type') <> 1
            )
    ) THEN
        RAISE EXCEPTION 'post-apply failed: settlement decision/result mismatch';
    END IF;

    SELECT count(*) INTO v_pvp_quarantine_count
      FROM public.trivia_pvp_matches AS match
      JOIN public.profiles AS p1 ON p1.id = match.player1_id
      JOIN public.profiles AS p2 ON p2.id = match.player2_id
     WHERE match.status = 'abandoned'
       AND match.created_at < timestamptz '2026-08-24 00:00:00+00'
       AND (p1.is_horse IS TRUE) <> (p2.is_horse IS TRUE);
    IF v_pvp_quarantine_count NOT IN (0, 4)
       OR (SELECT count(*) FROM public.competitive_quarantine
            WHERE entity_type = 'trivia_pvp_match'
              AND reason_code = 'legacy_abandoned_human_horse_refund_incident')
            <> v_pvp_quarantine_count
       OR EXISTS (
           SELECT 1
             FROM public.trivia_pvp_matches AS match
             JOIN public.profiles AS p1 ON p1.id = match.player1_id
             JOIN public.profiles AS p2 ON p2.id = match.player2_id
            WHERE match.status = 'abandoned'
              AND match.created_at < timestamptz '2026-08-24 00:00:00+00'
              AND (p1.is_horse IS TRUE) <> (p2.is_horse IS TRUE)
              AND NOT EXISTS (
                  SELECT 1 FROM public.competitive_quarantine AS quarantine
                   WHERE quarantine.entity_type = 'trivia_pvp_match'
                     AND quarantine.entity_id = match.id
                     AND quarantine.reason_code =
                         'legacy_abandoned_human_horse_refund_incident'
              )
       ) THEN
        RAISE EXCEPTION 'post-apply failed: legacy PvP quarantine set is not exactly 0(clean)/4(production)';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_pvp_matches AS match
         WHERE match.status IN ('active', 'settling', 'complete', 'completed')
           AND (
               (match.challenger_id IS NOT NULL AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_pvp_session_links AS link
                    WHERE link.match_id = match.id AND link.side = 1
                      AND link.session_id = match.challenger_id
               ))
               OR
               (match.opponent_id IS NOT NULL AND NOT EXISTS (
                   SELECT 1 FROM public.trivia_pvp_session_links AS link
                    WHERE link.match_id = match.id AND link.side = 2
                      AND link.session_id = match.opponent_id
               ))
           )
           AND NOT EXISTS (
               SELECT 1 FROM public.competitive_quarantine AS quarantine
                WHERE quarantine.entity_type = 'trivia_pvp_match'
                  AND quarantine.entity_id = match.id
                  AND quarantine.reason_code = 'ambiguous_legacy_session_binding'
           )
    ) OR EXISTS (
        SELECT 1
          FROM public.competitive_quarantine AS quarantine
          JOIN public.trivia_pvp_matches AS match ON match.id = quarantine.entity_id
         WHERE quarantine.entity_type = 'trivia_pvp_match'
           AND quarantine.reason_code = 'ambiguous_legacy_session_binding'
           AND NOT (
               match.status IN ('active', 'settling', 'complete', 'completed')
               AND (
                   (match.challenger_id IS NOT NULL AND NOT EXISTS (
                       SELECT 1 FROM public.trivia_pvp_session_links AS link
                        WHERE link.match_id = match.id AND link.side = 1
                          AND link.session_id = match.challenger_id
                   ))
                   OR
                   (match.opponent_id IS NOT NULL AND NOT EXISTS (
                       SELECT 1 FROM public.trivia_pvp_session_links AS link
                        WHERE link.match_id = match.id AND link.side = 2
                          AND link.session_id = match.opponent_id
                   ))
               )
           )
    ) THEN
        RAISE EXCEPTION 'post-apply failed: ambiguous legacy PvP bindings are not exactly quarantined';
    END IF;

    SELECT count(*) INTO v_tournament_quarantine_count
      FROM public.trivia_tournaments AS tournament
     WHERE tournament.status IN ('complete', 'completed')
       AND tournament.created_at < timestamptz '2026-08-28 00:00:00+00'
       AND tournament.prize_pool = 184
       AND (SELECT count(*) FROM public.trivia_tournament_entries AS entry
             WHERE entry.tournament_id = tournament.id) = 8
       AND (SELECT count(*) FROM public.trivia_tournament_entries AS entry
             JOIN public.profiles AS profile ON profile.id = entry.user_id
            WHERE entry.tournament_id = tournament.id AND profile.is_horse IS TRUE) = 8
       AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_entries AS entry
            WHERE entry.tournament_id = tournament.id
              AND (entry.rank IS NOT NULL OR entry.payout <> 0));
    IF v_tournament_quarantine_count NOT IN (0, 1)
       OR (SELECT count(*) FROM public.competitive_quarantine
            WHERE entity_type = 'trivia_tournament') <> v_tournament_quarantine_count
       OR EXISTS (
           SELECT 1
             FROM public.trivia_tournaments AS tournament
            WHERE tournament.status IN ('complete', 'completed')
              AND tournament.created_at < timestamptz '2026-08-28 00:00:00+00'
              AND tournament.prize_pool = 184
              AND (SELECT count(*) FROM public.trivia_tournament_entries AS entry
                    WHERE entry.tournament_id = tournament.id) = 8
              AND (SELECT count(*) FROM public.trivia_tournament_entries AS entry
                    JOIN public.profiles AS profile ON profile.id = entry.user_id
                   WHERE entry.tournament_id = tournament.id AND profile.is_horse IS TRUE) = 8
              AND NOT EXISTS (SELECT 1 FROM public.trivia_tournament_entries AS entry
                   WHERE entry.tournament_id = tournament.id
                     AND (entry.rank IS NOT NULL OR entry.payout <> 0))
              AND NOT EXISTS (
                  SELECT 1 FROM public.competitive_quarantine AS quarantine
                   WHERE quarantine.entity_type = 'trivia_tournament'
                     AND quarantine.entity_id = tournament.id
              )
       ) THEN
        RAISE EXCEPTION 'post-apply failed: historical tournament quarantine set is not exactly 0(clean)/1(production)';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_pvp_settlement_decisions AS decision
          JOIN public.competitive_quarantine AS quarantine
            ON quarantine.entity_type = 'trivia_pvp_match'
           AND quarantine.entity_id = decision.match_id
    ) THEN
        RAISE EXCEPTION 'post-apply failed: quarantined match has settlement decision';
    END IF;

    -- Behavioral proof when the production evidence rows exist: a no-op UPDATE
    -- must still be blocked, and the exception subtransaction leaves no change.
    SELECT entity_id INTO v_probe_id FROM public.competitive_quarantine
     WHERE entity_type = 'trivia_pvp_match' ORDER BY entity_id LIMIT 1;
    IF FOUND THEN
        v_probe_blocked := false;
        BEGIN
            UPDATE public.trivia_pvp_matches SET status = status WHERE id = v_probe_id;
        EXCEPTION WHEN raise_exception THEN
            v_probe_blocked := SQLERRM LIKE 'quarantined competitive record is immutable:%';
        END;
        IF NOT v_probe_blocked THEN
            RAISE EXCEPTION 'post-apply failed: quarantined PvP mutation guard probe failed';
        END IF;
    END IF;
END
$data_assertions$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ============================================================================
-- EMERGENCY ROLLBACK (paste into a NEW forward migration)
-- ============================================================================
-- This migration closes a demonstrated money-moving trust boundary. Its ACLs,
-- evidence quarantine, immutable decisions, durable links, and transaction
-- receipts must not be deleted or made browser-writable during rollback.
-- The safe rollback is therefore containment: keep all four application flags
-- false, revoke the new service entrypoints below, and roll the application
-- back. Re-enable only through a separately reviewed forward migration after
-- every funded match has been reconciled. This SQL is intentionally executable
-- and preserves all historical evidence.
--
-- BEGIN;
-- DO $$
-- BEGIN
--     IF EXISTS (
--         SELECT 1 FROM public.trivia_pvp_matches
--          WHERE status IN ('active', 'settling')
--     ) THEN
--         RAISE EXCEPTION
--             'rollback refused: active/settling PvP matches must be atomically settled or refunded first';
--     END IF;
-- END $$;
-- REVOKE EXECUTE ON FUNCTION
--     public.create_trivia_pvp_session_v2(uuid,uuid,uuid,uuid[],jsonb),
--     public.decide_trivia_pvp_settlement_v1(uuid,boolean),
--     public.record_trivia_pvp_stats_v2(uuid)
-- FROM service_role;
-- COMMENT ON FUNCTION public.decide_trivia_pvp_settlement_v1(uuid,boolean) IS
--     'EMERGENCY CONTAINMENT: execution revoked; retain decisions and receipts';
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
