-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.3 — TOURNAMENT ENGINE SUPPORT
-- Date: 2026-07-26
--
-- pages/api/trivia/tournament-lifecycle.js, tournament-round-questions.js and
-- tournament-submit-round.js are shipped and waiting on the objects below.
-- Every one of them currently runs a degraded fallback path and logs a loud
-- warning ("fn_trivia_round_set_matchup_score MISSING", "round_started_at
-- unavailable", "rank/payout columns unavailable").
--
-- ── SCHEMA-DRIFT NOTE (read before writing any future ALTER) ────────────────
-- trivia_tournaments / trivia_tournament_entries / trivia_pvp_matches are each
-- defined TWICE in supabase/migrations/archive with incompatible shapes:
--   archive/20260202_trivia_87x_enhancement.sql   -- ran FIRST, so it WON
--   archive/20260202_trivia_phase2_schema.sql     -- CREATE TABLE IF NOT EXISTS
--                                                 -- => silent no-op
-- The 87x definitions are CANONICAL. phase2's richer columns (description,
-- max_players, current_players, rank, payout, correct_count) never existed.
-- Verified by replaying both files in order against a clean PostgreSQL 16:
-- phase2's pvp policies abort with "column player1_id does not exist", which is
-- exactly what production would have shown.
--
-- This migration reconciles forward: it adds whatever is missing under EITHER
-- definition, so an environment built from either file converges here.
--
-- SAFE TO RE-RUN. No manual step required.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. trivia_tournaments — columns + a status CHECK that admits every value
--    the code actually writes and reads
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trivia_tournaments
    ADD COLUMN IF NOT EXISTS description      text,
    ADD COLUMN IF NOT EXISTS max_players      integer,
    ADD COLUMN IF NOT EXISTS current_players  integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tournament_type  text DEFAULT 'bracket',
    ADD COLUMN IF NOT EXISTS current_round    integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_rounds     integer,
    ADD COLUMN IF NOT EXISTS round_deadline   timestamptz,
    ADD COLUMN IF NOT EXISTS winners          jsonb,
    ADD COLUMN IF NOT EXISTS completed_at     timestamptz;

-- THE BUG: phase2's CHECK allowed only ('upcoming','registration','active',
-- 'complete','cancelled'). tournament-lifecycle.js writes status = 'completed'
-- when it finalises, and pages/hub/trivia/tournaments.js:326 queries
-- .in('status', ['completed','cancelled']) for past results. On any environment
-- where that CHECK landed, finalizeTournament's claim UPDATE throws and the
-- tournament can never be paid out. 87x (which won here) declared no CHECK at
-- all, so this also *adds* the missing validation.
ALTER TABLE public.trivia_tournaments DROP CONSTRAINT IF EXISTS trivia_tournaments_status_check;
ALTER TABLE public.trivia_tournaments
    ADD CONSTRAINT trivia_tournaments_status_check CHECK (
        status IN ('upcoming', 'registration', 'active', 'complete', 'completed', 'cancelled')
    ) NOT VALID;
-- NOT VALID then VALIDATE: existing rows are checked without holding an
-- ACCESS EXCLUSIVE lock for the whole scan.
DO $$
BEGIN
    ALTER TABLE public.trivia_tournaments VALIDATE CONSTRAINT trivia_tournaments_status_check;
EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'trivia_tournaments contains an out-of-vocabulary status; constraint left NOT VALID. '
                  'Inspect with: SELECT DISTINCT status FROM trivia_tournaments;';
END $$;

-- Read-only aliases for the phase2 column names. src/components/trivia/
-- TournamentLobby.jsx destructures starts_at/ends_at/max_players/
-- current_players, none of which existed on the 87x table. Generated columns
-- keep that component (and any other phase2-era reader) working without
-- duplicating state. WRITES must still target start_time / end_time.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='trivia_tournaments' AND column_name='starts_at') THEN
        ALTER TABLE public.trivia_tournaments
            ADD COLUMN starts_at timestamptz GENERATED ALWAYS AS (start_time) STORED;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='trivia_tournaments' AND column_name='ends_at') THEN
        ALTER TABLE public.trivia_tournaments
            ADD COLUMN ends_at timestamptz GENERATED ALWAYS AS (end_time) STORED;
    END IF;
EXCEPTION WHEN others THEN
    RAISE WARNING 'starts_at/ends_at aliases skipped: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_trivia_tournaments_status_start
    ON public.trivia_tournaments (status, start_time);
CREATE INDEX IF NOT EXISTS idx_trivia_tournaments_completed
    ON public.trivia_tournaments (completed_at DESC)
    WHERE completed_at IS NOT NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. trivia_tournament_entries — every column the engine writes
-- ───────────────────────────────────────────────────────────────────────────
--   round_started_at  tournament-round-questions.js:164 stamps it so the submit
--                     route can measure a REAL play duration. Without it every
--                     player's time pinned at the 1800s cap and the
--                     score-then-time tie-break was meaningless.
--   rank / payout     finalizeTournament writes them per entrant; nothing in
--                     the schema had them, so final standings were unrecorded.
--   correct_count     phase2 declared it, 87x did not.
--   eliminated_round /
--   seed_number       added by 20260212_tournament_brackets_and_rls.sql; kept
--                     here so a phase2-shaped environment also converges.

ALTER TABLE public.trivia_tournament_entries
    ADD COLUMN IF NOT EXISTS round_started_at timestamptz,
    ADD COLUMN IF NOT EXISTS rank             integer,
    ADD COLUMN IF NOT EXISTS payout           integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS correct_count    integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS eliminated_round integer,
    ADD COLUMN IF NOT EXISTS seed_number      integer,
    ADD COLUMN IF NOT EXISTS completed_at     timestamptz,
    ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS joined_at        timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS time_spent       integer NOT NULL DEFAULT 0;

-- loadEntries() orders by created_at to derive seeding; make that ordered read
-- and the "who is still alive" filter index-backed.
CREATE INDEX IF NOT EXISTS idx_tournament_entries_seeding
    ON public.trivia_tournament_entries (tournament_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_alive
    ON public.trivia_tournament_entries (tournament_id)
    WHERE eliminated_round IS NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. trivia_tournament_rounds — question_ids + the uniqueness createRound
--    already assumes
-- ───────────────────────────────────────────────────────────────────────────
--   question_ids   resolveRoundRoster() (tournament-lifecycle.js:174) prefers
--                  round.question_ids and only falls back to slicing
--                  tournament.questions. createRound() inserts WITH the column
--                  and retries WITHOUT it on error — so today every round takes
--                  the retry path and rounds 2+ can serve overlapping rosters.
--   UNIQUE         the module header states "Round rows additionally carry a
--                  UNIQUE-by-convention (tournament_id, round_number) so a
--                  duplicate insert is detected and treated as already done".
--                  It was never actually declared, so two concurrent ticks
--                  could each open a round for the same number.

ALTER TABLE public.trivia_tournament_rounds
    ADD COLUMN IF NOT EXISTS question_ids jsonb DEFAULT '[]'::jsonb;

DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trivia_tournament_rounds_unique
        ON public.trivia_tournament_rounds (tournament_id, round_number);
EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'Duplicate (tournament_id, round_number) rows exist in '
                  'trivia_tournament_rounds — dedup them, then re-run this migration.';
END $$;

-- FK had no index: every bracket load seq-scanned the rounds table.
CREATE INDEX IF NOT EXISTS idx_trivia_tournament_rounds_tournament
    ON public.trivia_tournament_rounds (tournament_id, round_number);
CREATE INDEX IF NOT EXISTS idx_trivia_tournament_rounds_open
    ON public.trivia_tournament_rounds (deadline)
    WHERE status = 'active';

COMMENT ON COLUMN public.trivia_tournament_rounds.question_ids IS
    'Phase 80 — authoritative per-round question roster (JSON array of '
    'trivia_questions.id). Read by resolveRoundRoster() in '
    'pages/api/trivia/tournament-lifecycle.js; both the serving route and the '
    'grading route must agree on it, which is why it is stored, not derived.';


-- ───────────────────────────────────────────────────────────────────────────
-- 4. trivia_tournament_notifications — FK index for the polling UI
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trivia_tourn_notif_user
    ON public.trivia_tournament_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_tourn_notif_unread
    ON public.trivia_tournament_notifications (user_id, created_at DESC)
    WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_trivia_tourn_notif_tournament
    ON public.trivia_tournament_notifications (tournament_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 5. current_players — keep the field size accurate without a read-modify-write
-- ───────────────────────────────────────────────────────────────────────────
-- tournament-enter.js:90 notes "trivia_tournaments has NO max_entries /
-- current_entries columns ... the prior cap-check was silently dead" and works
-- around it with a COUNT per entry. With the column above plus this trigger the
-- count is maintained transactionally and a cap can be enforced.

CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_sync_player_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.trivia_tournaments
           SET current_players = COALESCE(current_players, 0) + 1
         WHERE id = NEW.tournament_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.trivia_tournaments
           SET current_players = GREATEST(COALESCE(current_players, 1) - 1, 0)
         WHERE id = OLD.tournament_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_trivia_tournament_player_count ON public.trivia_tournament_entries;
CREATE TRIGGER trg_trivia_tournament_player_count
    AFTER INSERT OR DELETE ON public.trivia_tournament_entries
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trivia_tournament_sync_player_count();

-- Backfill so the counter is correct from the first tick.
UPDATE public.trivia_tournaments t
   SET current_players = c.n
  FROM (SELECT tournament_id, COUNT(*)::int AS n
          FROM public.trivia_tournament_entries GROUP BY tournament_id) c
 WHERE c.tournament_id = t.id
   AND t.current_players IS DISTINCT FROM c.n;


-- ───────────────────────────────────────────────────────────────────────────
-- 6. fn_trivia_round_set_matchup_score — the lost-update fix
-- ───────────────────────────────────────────────────────────────────────────
--
-- Called by pages/api/trivia/tournament-submit-round.js claimMatchupSlot():
--     sb.rpc('fn_trivia_round_set_matchup_score', {
--         p_round_id, p_user_id, p_score, p_time
--     })
-- and the response is read as:
--     applied       = data?.applied !== false
--     matchup       = data?.matchup
--     winnerDecided = data?.winner_decided === true
--
-- Without this function the route falls back to read-mutate-write on the whole
-- matchups array, which two concurrent submissions erase for each other. THE
-- ROW LOCK IS THE POINT: SELECT ... FOR UPDATE serialises every writer of a
-- round, so the read-modify-write of the JSONB happens inside a critical
-- section. Claiming a slot is also the idempotency gate for the entire submit
-- path — one submission per (entrant, round), enforced here, not in JS.

CREATE OR REPLACE FUNCTION public.fn_trivia_round_set_matchup_score(
    p_round_id uuid,
    p_user_id  uuid,
    p_score    integer,
    p_time     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_matchups  jsonb;
    v_status    text;
    v_len       integer;
    v_idx       integer := -1;
    v_m         jsonb;
    v_is_p1     boolean;
    v_my_score  text;
    v_my_time   text;
    v_opp_score_key text;
    v_opp_time_key  text;
    v_opp_id_key    text;
    v_opp_id    text;
    v_opp_score numeric;
    v_opp_time  numeric;
    v_winner    text;
    v_decided   boolean := false;
    v_score     integer := GREATEST(COALESCE(p_score, 0), 0);
    v_time      integer := GREATEST(COALESCE(p_time, 0), 0);
    i           integer;
BEGIN
    -- Only the server may write a score. Every caller is /api/trivia/
    -- tournament-submit-round, which holds the service-role key.
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;
    IF p_round_id IS NULL OR p_user_id IS NULL THEN
        RETURN jsonb_build_object('applied', false, 'error', 'bad_arguments', 'matchup', NULL);
    END IF;

    -- ── THE LOCK ────────────────────────────────────────────────────────
    SELECT r.matchups, r.status
      INTO v_matchups, v_status
      FROM public.trivia_tournament_rounds r
     WHERE r.id = p_round_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('applied', false, 'error', 'round_not_found', 'matchup', NULL);
    END IF;
    IF v_status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'round_not_active', 'matchup', NULL);
    END IF;
    IF v_matchups IS NULL OR jsonb_typeof(v_matchups) <> 'array' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'no_matchups', 'matchup', NULL);
    END IF;

    -- ── LOCATE THIS PLAYER'S MATCHUP ────────────────────────────────────
    v_len := jsonb_array_length(v_matchups);
    FOR i IN 0 .. GREATEST(v_len - 1, 0) LOOP
        v_m := v_matchups -> i;
        IF v_m IS NOT NULL
           AND ( (v_m ->> 'player1_id') = p_user_id::text
              OR (v_m ->> 'player2_id') = p_user_id::text ) THEN
            v_idx := i;
            EXIT;
        END IF;
    END LOOP;

    IF v_idx < 0 THEN
        RETURN jsonb_build_object('applied', false, 'error', 'not_in_round', 'matchup', NULL);
    END IF;
    IF COALESCE((v_m ->> 'is_bye')::boolean, false) THEN
        RETURN jsonb_build_object('applied', false, 'error', 'bye_round', 'matchup', v_m);
    END IF;

    v_is_p1 := ((v_m ->> 'player1_id') = p_user_id::text);
    IF v_is_p1 THEN
        v_my_score := 'player1_score'; v_my_time := 'player1_time';
        v_opp_score_key := 'player2_score'; v_opp_time_key := 'player2_time'; v_opp_id_key := 'player2_id';
    ELSE
        v_my_score := 'player2_score'; v_my_time := 'player2_time';
        v_opp_score_key := 'player1_score'; v_opp_time_key := 'player1_time'; v_opp_id_key := 'player1_id';
    END IF;

    -- ── ALREADY CLAIMED? (idempotent resubmit) ──────────────────────────
    -- A missing key yields SQL NULL; an explicit JSON null yields 'null'.
    -- Both mean "not yet played"; anything else means the slot is filled.
    IF COALESCE(jsonb_typeof(v_m -> v_my_score), 'null') <> 'null' THEN
        RETURN jsonb_build_object('applied', false, 'error', 'already_submitted', 'matchup', v_m);
    END IF;

    -- ── WRITE THE SLOT ──────────────────────────────────────────────────
    v_m := jsonb_set(v_m, ARRAY[v_my_score], to_jsonb(v_score), true);
    v_m := jsonb_set(v_m, ARRAY[v_my_time],  to_jsonb(v_time),  true);

    -- ── DECIDE THE WINNER WHEN BOTH SCORES ARE IN ───────────────────────
    v_opp_id := v_m ->> v_opp_id_key;
    IF v_opp_id IS NOT NULL
       AND COALESCE(jsonb_typeof(v_m -> v_opp_score_key), 'null') <> 'null' THEN

        v_opp_score := (v_m ->> v_opp_score_key)::numeric;
        BEGIN
            v_opp_time := (v_m ->> v_opp_time_key)::numeric;
        EXCEPTION WHEN others THEN
            v_opp_time := NULL;
        END;

        IF v_score > v_opp_score THEN
            v_winner := p_user_id::text;
        ELSIF v_opp_score > v_score THEN
            v_winner := v_opp_id;
        ELSIF v_opp_time IS NOT NULL AND v_time <> v_opp_time THEN
            v_winner := CASE WHEN v_time < v_opp_time THEN p_user_id::text ELSE v_opp_id END;
        ELSE
            -- Exact tie. Deterministic AND slot-independent: the ids are sorted
            -- first, so the outcome cannot depend on which slot a player landed
            -- in (always awarding player2 was a real, diamond-bearing bias).
            v_winner := CASE
                WHEN (get_byte(
                        decode(md5(LEAST(p_user_id::text, v_opp_id) || '|' ||
                                   GREATEST(p_user_id::text, v_opp_id) || '|' ||
                                   p_round_id::text), 'hex'), 0) % 2) = 0
                THEN LEAST(p_user_id::text, v_opp_id)
                ELSE GREATEST(p_user_id::text, v_opp_id)
            END;
        END IF;

        v_m := jsonb_set(v_m, ARRAY['winner_id'], to_jsonb(v_winner), true);
        v_decided := true;
    END IF;

    UPDATE public.trivia_tournament_rounds
       SET matchups = jsonb_set(v_matchups, ARRAY[v_idx::text], v_m, true)
     WHERE id = p_round_id;

    RETURN jsonb_build_object(
        'applied',        true,
        'matchup',        v_m,
        'match_index',    v_idx,
        'winner_decided', v_decided
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_round_set_matchup_score(uuid, uuid, integer, integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_round_set_matchup_score(uuid, uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.fn_trivia_round_set_matchup_score(uuid, uuid, integer, integer) IS
    'Phase 80 — race-free tournament round submission. Locks the round row '
    '(SELECT ... FOR UPDATE), patches exactly one element of the matchups JSONB '
    'array, and derives winner_id when both slots are filled. Returns '
    '{applied, matchup, match_index, winner_decided}; applied=false with a '
    'matchup means the slot was already claimed (idempotent resubmit). '
    'Consumed by pages/api/trivia/tournament-submit-round.js.';


-- ───────────────────────────────────────────────────────────────────────────
-- 7. fn_trivia_tournament_add_entry_score — cumulative totals in one statement
-- ───────────────────────────────────────────────────────────────────────────
-- Called by tournament-submit-round.js addEntryTotals(). The JS fallback does a
-- read-modify-write; this replaces it with a single atomic UPDATE.

CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_add_entry_score(
    p_entry_id uuid,
    p_score    integer,
    p_time     integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_score integer;
    v_time  integer;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;

    UPDATE public.trivia_tournament_entries
       SET score        = COALESCE(score, 0)      + GREATEST(COALESCE(p_score, 0), 0),
           time_spent   = COALESCE(time_spent, 0) + GREATEST(COALESCE(p_time, 0), 0),
           completed_at = now()
     WHERE id = p_entry_id
     RETURNING score, time_spent INTO v_score, v_time;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'entry_not_found');
    END IF;

    RETURN jsonb_build_object('success', true, 'score', v_score, 'time_spent', v_time);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_add_entry_score(uuid, integer, integer) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_tournament_add_entry_score(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.fn_trivia_tournament_add_entry_score(uuid, integer, integer) IS
    'Phase 80 — atomic cumulative score/time accumulation for a tournament '
    'entry. Replaces the read-modify-write fallback in '
    'pages/api/trivia/tournament-submit-round.js addEntryTotals().';


-- ───────────────────────────────────────────────────────────────────────────
-- 8. fn_trivia_tournament_payout — close the prize-pool sink
-- ───────────────────────────────────────────────────────────────────────────
-- tournament-lifecycle.js finalizeTournament() already implements the schedule
-- and the per-user reference_id dedup in JS, so this function is the SAFETY NET
-- for the case the lifecycle cron is not running: it locks the tournament,
-- ranks entries, writes rank/payout and credits winners in ONE transaction.
-- It is service-role only and idempotent (a tournament already 'completed' with
-- payouts written is a no-op).

CREATE OR REPLACE FUNCTION public.fn_trivia_tournament_payout(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_status   text;
    v_pool     integer;
    v_name     text;
    v_n        integer;
    v_pcts     integer[];
    v_paid     integer := 0;
    v_rows     jsonb   := '[]'::jsonb;
    v_amount   integer;
    v_remain   integer;
    r          record;
    v_res      jsonb;
    v_has_rpc  boolean;
BEGIN
    IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'service_role required';
    END IF;

    SELECT t.status, COALESCE(t.prize_pool, 0), t.name
      INTO v_status, v_pool, v_name
      FROM public.trivia_tournaments t
     WHERE t.id = p_tournament_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_found');
    END IF;
    IF v_status NOT IN ('active', 'complete', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_payable', 'status', v_status);
    END IF;

    -- TRUE idempotency. A settled tournament has its pool drained (either by
    -- this function or by finalizeTournament() in tournament-lifecycle.js) and
    -- its standings recorded. Re-running from here would recompute every payout
    -- against a ZERO pool and then overwrite entries.rank / entries.payout and
    -- trivia_tournaments.winners with all-zero rows — destroying the settlement
    -- record while the diamonds stay (correctly) deduped by reference_id.
    -- Report the recorded standings instead of rewriting them.
    IF v_status IN ('complete', 'completed') THEN
        SELECT COALESCE(t.winners, '[]'::jsonb) INTO v_rows
          FROM public.trivia_tournaments t WHERE t.id = p_tournament_id;
        RETURN jsonb_build_object(
            'success', true, 'deduped', true, 'status', v_status,
            'prize_pool', v_pool, 'paid', 0, 'standings', v_rows
        );
    END IF;

    SELECT COUNT(*)::int INTO v_n
      FROM public.trivia_tournament_entries e WHERE e.tournament_id = p_tournament_id;
    IF v_n = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_entrants');
    END IF;

    -- Must mirror prizeSchedule() in pages/api/trivia/tournament-lifecycle.js.
    v_pcts := CASE
        WHEN v_n <= 2  THEN ARRAY[100]
        WHEN v_n <= 3  THEN ARRAY[70,30]
        WHEN v_n <= 7  THEN ARRAY[55,30,15]
        WHEN v_n <= 15 THEN ARRAY[45,25,16,14]
        WHEN v_n <= 31 THEN ARRAY[38,22,14,10,9,7]
        ELSE                ARRAY[32,20,13,10,8,7,5,5]
    END;

    v_has_rpc := EXISTS (
        SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'add_diamonds_to_balance'
    );

    v_remain := v_pool;
    FOR r IN
        SELECT e.id, e.user_id,
               row_number() OVER (
                   ORDER BY COALESCE(e.eliminated_round, 2147483647) DESC,
                            COALESCE(e.score, 0) DESC,
                            COALESCE(e.time_spent, 0) ASC,
                            e.user_id
               )::int AS rnk
          FROM public.trivia_tournament_entries e
         WHERE e.tournament_id = p_tournament_id
    LOOP
        v_amount := CASE
            WHEN r.rnk <= array_length(v_pcts, 1)
            THEN (v_pool * v_pcts[r.rnk]) / 100
            ELSE 0
        END;
        -- Any rounding remainder goes to first place so the pool balances
        -- exactly: never over-pays, never leaks diamonds.
        IF r.rnk = 1 THEN
            v_amount := v_amount + (v_pool - (
                SELECT COALESCE(SUM((v_pool * p) / 100), 0)
                  FROM unnest(v_pcts) AS p
            ));
        END IF;

        UPDATE public.trivia_tournament_entries
           SET rank = r.rnk, payout = v_amount
         WHERE id = r.id;

        IF v_amount > 0 AND v_has_rpc THEN
            EXECUTE 'SELECT public.add_diamonds_to_balance($1,$2,$3,$4,$5)'
               INTO v_res
              USING r.user_id, v_amount, 'tournament_prize',
                    'Tournament prize - ' || COALESCE(v_name, 'trivia tournament') || ' (rank ' || r.rnk || ')',
                    'trivia_tourn_payout_' || p_tournament_id::text || '_' || r.user_id::text;
            IF COALESCE((v_res ->> 'success')::boolean, false) THEN
                v_paid := v_paid + v_amount;
            END IF;
        END IF;

        v_rows := v_rows || jsonb_build_object('rank', r.rnk, 'user_id', r.user_id, 'payout', v_amount);
    END LOOP;

    UPDATE public.trivia_tournaments
       SET status       = 'completed',
           completed_at = COALESCE(completed_at, now()),
           winners      = v_rows,
           prize_pool   = 0
     WHERE id = p_tournament_id;

    RETURN jsonb_build_object(
        'success', true, 'entrants', v_n, 'prize_pool', v_pool,
        'paid', v_paid, 'standings', v_rows
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_tournament_payout(uuid) TO service_role;

COMMENT ON FUNCTION public.fn_trivia_tournament_payout(uuid) IS
    'Phase 80 — single-transaction tournament settlement: locks the tournament, '
    'ranks entries (deepest run, then score DESC, then time ASC), writes '
    'rank/payout, credits winners through add_diamonds_to_balance with a stable '
    'reference_id (so a re-run cannot double-pay), zeroes prize_pool and marks '
    'the tournament completed. Ops safety net for '
    'pages/api/trivia/tournament-lifecycle.js finalizeTournament().';
