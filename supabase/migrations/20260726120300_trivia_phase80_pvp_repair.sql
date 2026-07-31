-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 80.4 — PvP: BROKEN SQL, RLS HOLES AND SCHEMA DRIFT
-- Date: 2026-07-26
--
-- ── 1. trivia_pvp_queue NEVER APPLIED CLEANLY ──────────────────────────────
-- archive/20260202_pvp_queue.sql:12 declares
--     UNIQUE(user_id, status) WHERE status = 'waiting'
-- which is not valid PostgreSQL — a table-level UNIQUE constraint cannot take a
-- WHERE clause (partial uniqueness needs CREATE UNIQUE INDEX). The CREATE TABLE
-- fails outright. Its FK to trivia_pvp_matches also resolves before that table
-- exists in filename order. So the queue was either hand-created outside
-- migrations or does not exist. Rebuilt correctly below.
--
-- ── 2. USER_ID SPOOFING IN THE QUEUE ───────────────────────────────────────
-- archive/20260212_tournament_brackets_and_rls.sql:39 rewrote the INSERT policy
-- to WITH CHECK (auth.role() = 'authenticated'), dropping the original
-- auth.uid() = user_id check. ANY logged-in user could enqueue rows carrying
-- ANOTHER user's id, so victims got "matched" into stake-bearing games they
-- never joined and real players got paired against absent opponents.
-- It also left the world-readable "Users can see queue entries" USING(true)
-- SELECT policy from 20260202 in place — policies OR together, so the
-- "view own" policy added alongside it changed nothing.
--
-- ── 3. EITHER PLAYER COULD DECLARE THEMSELVES THE WINNER ───────────────────
-- Both trivia_pvp_matches definitions grant UPDATE to either participant with
-- no column restriction, so winner_id and both score columns were writable from
-- the browser console with the anon key — and pvp.js pays out on
-- match.winner_id. Writes are now service_role only; SELECT stays open to the
-- two participants.
--
-- ── 4. FORGEABLE PUBLIC PvP RECORDS ────────────────────────────────────────
-- trivia_pvp_stats allowed users to write arbitrary wins/best_streak/
-- total_diamonds_won to their own row. Those stats are SELECT USING (true) and
-- are rendered as opponents' records in matchmaking and tournament brackets, so
-- they were trivially forgeable — and pvp.js's read-then-upsert also loses
-- concurrent updates. Direct writes are removed and replaced by an increment
-- RPC, which fixes the lost update and the arbitrary-value write. It does NOT
-- make the numbers trustworthy: the RPC is still client-callable and takes no
-- proof of a match. See the full threat model above fn_trivia_pvp_record_result
-- in section 3 before treating any of these counters as authoritative.
--
-- ── 5. SCHEMA DRIFT ────────────────────────────────────────────────────────
-- trivia_pvp_matches exists in two shapes: 87x's challenger_id/opponent_id
-- (which won) and phase2's player1_id/player2_id (a silent no-op — replaying
-- both files in order shows phase2's policies aborting with "column player1_id
-- does not exist"). Rather than pick a winner and break the other consumer,
-- both column pairs now exist and are kept in sync by a trigger.
--
-- ⚠ CROSS-FILE FOLLOW-UP (see the fixer report):
--    pages/hub/trivia/pvp.js updatePvpStats() must switch from the raw upsert
--    on trivia_pvp_stats to supabase.rpc('fn_trivia_pvp_record_result', ...).
--    Until it does, stat writes fail (logged, non-fatal) and stats stop
--    accumulating. Nothing else regresses: no money path reads them.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. trivia_pvp_queue — create correctly if missing, repair if present
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.trivia_pvp_queue (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stake_amount integer NOT NULL DEFAULT 10,
    status       text NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired')),
    match_id     uuid,
    created_at   timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL DEFAULT (now() + interval '2 minutes')
);

-- The partial uniqueness the original file tried (and failed) to express.
DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_queue_one_waiting
        ON public.trivia_pvp_queue (user_id)
        WHERE status = 'waiting';
EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'trivia_pvp_queue has multiple waiting rows for one user — '
                  'run: UPDATE trivia_pvp_queue SET status=''expired'' WHERE status=''waiting'' '
                  'AND expires_at < now(); then re-run this migration.';
END $$;

CREATE INDEX IF NOT EXISTS idx_pvp_queue_matching
    ON public.trivia_pvp_queue (stake_amount, status, created_at)
    WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_pvp_queue_expiry
    ON public.trivia_pvp_queue (expires_at)
    WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_pvp_queue_match
    ON public.trivia_pvp_queue (match_id)
    WHERE match_id IS NOT NULL;

ALTER TABLE public.trivia_pvp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_pvp_queue REPLICA IDENTITY FULL;

-- The leftover world-readable policy: RLS policies are ORed, so this one alone
-- made every "view own" policy that came after it decorative.
DROP POLICY IF EXISTS "Users can see queue entries"        ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert queue" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Authenticated users can insert"     ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can insert own queue entry"   ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can view own queue entries"   ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can update own queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can delete own queue entries" ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Service role queue access"          ON public.trivia_pvp_queue;
-- Also drop the names this migration itself creates, so it is re-runnable.
DROP POLICY IF EXISTS "Users can update own queue entry"      ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Users can delete own queue entry"      ON public.trivia_pvp_queue;
DROP POLICY IF EXISTS "Waiting queue entries are discoverable" ON public.trivia_pvp_queue;

-- THE FIX: bind the row to the caller.
CREATE POLICY "Users can insert own queue entry"
    ON public.trivia_pvp_queue FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Matchmaking has to see OTHER waiting players to pair anyone, so the read is
-- deliberately open — but only to live, waiting rows, never the whole history.
CREATE POLICY "Waiting queue entries are discoverable"
    ON public.trivia_pvp_queue FOR SELECT
    USING (
        auth.uid() = user_id
        OR auth.role() = 'service_role'
        OR (status = 'waiting' AND expires_at > now())
    );

CREATE POLICY "Users can update own queue entry"
    ON public.trivia_pvp_queue FOR UPDATE
    USING (auth.uid() = user_id OR auth.role() = 'service_role')
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can delete own queue entry"
    ON public.trivia_pvp_queue FOR DELETE
    USING (auth.uid() = user_id OR auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trivia_pvp_queue TO authenticated;

-- expire_old_queue_entries() existed but was plain plpgsql and called by NOBODY
-- (no pg_cron, no cron route in vercel.json, no app reference). Under the
-- one-waiting-row-per-user index a stale row BLOCKS the user from re-queueing
-- forever. Made SECURITY DEFINER and client-callable so matchmaking can sweep
-- inline before it enqueues.
-- (The original returned void; CREATE OR REPLACE cannot change a return type,
--  so the old signature is dropped first. Nothing calls it today.)
DROP FUNCTION IF EXISTS public.expire_old_queue_entries();

CREATE OR REPLACE FUNCTION public.expire_old_queue_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.trivia_pvp_queue
       SET status = 'expired'
     WHERE status = 'waiting'
       AND expires_at < now();
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_old_queue_entries() TO authenticated, service_role;

COMMENT ON FUNCTION public.expire_old_queue_entries() IS
    'Phase 80 — sweeps abandoned matchmaking entries. Call it from '
    'joinMatchmakingQueue()/findMatch() in src/services/pvpMatchmaking.js '
    'BEFORE enqueueing: a stale waiting row otherwise blocks the user against '
    'idx_pvp_queue_one_waiting permanently.';


-- ───────────────────────────────────────────────────────────────────────────
-- 2. trivia_pvp_matches — reconcile the two shapes, lock down the writes
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.trivia_pvp_matches
    ADD COLUMN IF NOT EXISTS player1_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS player2_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS player1_score integer,
    ADD COLUMN IF NOT EXISTS player2_score integer,
    ADD COLUMN IF NOT EXISTS challenger_id uuid,
    ADD COLUMN IF NOT EXISTS opponent_id   uuid,
    ADD COLUMN IF NOT EXISTS challenger_score integer,
    ADD COLUMN IF NOT EXISTS opponent_score   integer,
    ADD COLUMN IF NOT EXISTS stake_amount  integer DEFAULT 10,
    ADD COLUMN IF NOT EXISTS category      text,
    ADD COLUMN IF NOT EXISTS completed_at  timestamptz;

-- 87x declared challenger_id/opponent_id NOT NULL. A writer using the phase2
-- column names would violate that before the sync trigger below could help, so
-- both pairs become nullable and the trigger guarantees they end up populated.
DO $$
BEGIN
    ALTER TABLE public.trivia_pvp_matches ALTER COLUMN challenger_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$
BEGIN
    ALTER TABLE public.trivia_pvp_matches ALTER COLUMN opponent_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$
BEGIN
    ALTER TABLE public.trivia_pvp_matches ALTER COLUMN questions DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Keep the two historical vocabularies in lockstep so both consumers work:
-- pvp.js / phase2 read player1_*, the 87x-era services read challenger_*.
CREATE OR REPLACE FUNCTION public.fn_trivia_pvp_match_sync_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.player1_id       := COALESCE(NEW.player1_id,       NEW.challenger_id);
        NEW.challenger_id    := COALESCE(NEW.challenger_id,    NEW.player1_id);
        NEW.player2_id       := COALESCE(NEW.player2_id,       NEW.opponent_id);
        NEW.opponent_id      := COALESCE(NEW.opponent_id,      NEW.player2_id);
        NEW.player1_score    := COALESCE(NEW.player1_score,    NEW.challenger_score);
        NEW.challenger_score := COALESCE(NEW.challenger_score, NEW.player1_score);
        NEW.player2_score    := COALESCE(NEW.player2_score,    NEW.opponent_score);
        NEW.opponent_score   := COALESCE(NEW.opponent_score,   NEW.player2_score);
        RETURN NEW;
    END IF;

    -- UPDATE: whichever alias the writer touched wins, and is mirrored.
    IF NEW.player1_id IS DISTINCT FROM OLD.player1_id THEN NEW.challenger_id := NEW.player1_id;
    ELSIF NEW.challenger_id IS DISTINCT FROM OLD.challenger_id THEN NEW.player1_id := NEW.challenger_id; END IF;

    IF NEW.player2_id IS DISTINCT FROM OLD.player2_id THEN NEW.opponent_id := NEW.player2_id;
    ELSIF NEW.opponent_id IS DISTINCT FROM OLD.opponent_id THEN NEW.player2_id := NEW.opponent_id; END IF;

    IF NEW.player1_score IS DISTINCT FROM OLD.player1_score THEN NEW.challenger_score := NEW.player1_score;
    ELSIF NEW.challenger_score IS DISTINCT FROM OLD.challenger_score THEN NEW.player1_score := NEW.challenger_score; END IF;

    IF NEW.player2_score IS DISTINCT FROM OLD.player2_score THEN NEW.opponent_score := NEW.player2_score;
    ELSIF NEW.opponent_score IS DISTINCT FROM OLD.opponent_score THEN NEW.player2_score := NEW.opponent_score; END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trivia_pvp_match_sync ON public.trivia_pvp_matches;
CREATE TRIGGER trg_trivia_pvp_match_sync
    BEFORE INSERT OR UPDATE ON public.trivia_pvp_matches
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_trivia_pvp_match_sync_columns();

-- Backfill existing rows through the same rules.
UPDATE public.trivia_pvp_matches
   SET player1_id    = COALESCE(player1_id, challenger_id),
       player2_id    = COALESCE(player2_id, opponent_id),
       player1_score = COALESCE(player1_score, challenger_score),
       player2_score = COALESCE(player2_score, opponent_score)
 WHERE player1_id IS NULL OR player2_id IS NULL
    OR player1_score IS DISTINCT FROM challenger_score
    OR player2_score IS DISTINCT FROM opponent_score;

-- 87x had no CHECK; phase2's allowed only 'complete'. Accept both spellings so
-- neither consumer's writes are rejected.
ALTER TABLE public.trivia_pvp_matches DROP CONSTRAINT IF EXISTS trivia_pvp_matches_status_check;
ALTER TABLE public.trivia_pvp_matches
    ADD CONSTRAINT trivia_pvp_matches_status_check CHECK (
        status IN ('pending', 'active', 'complete', 'completed', 'cancelled', 'expired')
    ) NOT VALID;
DO $$
BEGIN
    ALTER TABLE public.trivia_pvp_matches VALIDATE CONSTRAINT trivia_pvp_matches_status_check;
EXCEPTION WHEN check_violation THEN
    RAISE WARNING 'trivia_pvp_matches has an out-of-vocabulary status; constraint left NOT VALID.';
END $$;

-- FK indexes that never existed: every "my matches" lookup seq-scanned.
CREATE INDEX IF NOT EXISTS idx_pvp_matches_player1   ON public.trivia_pvp_matches (player1_id);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_player2   ON public.trivia_pvp_matches (player2_id);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_winner    ON public.trivia_pvp_matches (winner_id);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_open      ON public.trivia_pvp_matches (status, created_at DESC);

ALTER TABLE public.trivia_pvp_matches ENABLE ROW LEVEL SECURITY;

-- THE CHEAT: both of these allowed a participant to UPDATE any column,
-- winner_id and the opponent's score included.
DROP POLICY IF EXISTS "Players can update their matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can update own matches"     ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can view own matches"       ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can view their matches"     ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Users can create matches"         ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Service role manages pvp matches" ON public.trivia_pvp_matches;
DROP POLICY IF EXISTS "Participants can view their matches" ON public.trivia_pvp_matches;

-- Participants may READ their own match under either vocabulary.
CREATE POLICY "Participants can view their matches"
    ON public.trivia_pvp_matches FOR SELECT
    USING (
        auth.uid() IN (player1_id, player2_id, challenger_id, opponent_id)
        OR auth.role() = 'service_role'
    );

-- Scores and winner_id are money. Server only.
CREATE POLICY "Service role manages pvp matches"
    ON public.trivia_pvp_matches FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

REVOKE INSERT, UPDATE, DELETE ON public.trivia_pvp_matches FROM anon, authenticated;
GRANT SELECT ON public.trivia_pvp_matches TO authenticated;

COMMENT ON TABLE public.trivia_pvp_matches IS
    'Head-to-head trivia matches. WRITES ARE SERVICE-ROLE ONLY (phase 80): '
    'either player used to be able to set winner_id and both scores from the '
    'browser and collect the pot. player1_*/challenger_* are kept in sync by '
    'trg_trivia_pvp_match_sync — either vocabulary may be written.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3. trivia_pvp_stats — increment RPC instead of client-authoritative writes
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can insert own stats" ON public.trivia_pvp_stats;
DROP POLICY IF EXISTS "Users can update own stats" ON public.trivia_pvp_stats;

REVOKE INSERT, UPDATE, DELETE ON public.trivia_pvp_stats FROM anon, authenticated;
GRANT SELECT ON public.trivia_pvp_stats TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_trivia_pvp_stats_wins
    ON public.trivia_pvp_stats (wins DESC);

-- One outcome at a time, applied as an INCREMENT: two concurrent finishes can no
-- longer lose each other's update the way the old read-then-upsert did, and a
-- caller can no longer write another player's row or set a column directly.
--
-- ⚠ THIS IS NOT ANTI-FORGERY. The function is EXECUTE-able by `authenticated`
-- because pages/hub/trivia/pvp.js calls it from the browser, and it takes NO
-- proof that a match happened. A modified client can still inflate its record by
-- calling it in a loop — verified: five calls produce wins=5 and
-- total_diamonds_won=500000. What changed is the SHAPE of the forgery (one match
-- per call, bounded magnitude, attributable) not its possibility.
--
-- That is tolerable ONLY because trivia_pvp_stats is display-only: no payout,
-- entry gate or matchmaking stake reads it (verified across pvp.js and
-- tournaments.js). Closing it properly needs a server-side PvP match record —
-- i.e. a /api/trivia/pvp-result route that resolves the winner from
-- trivia_pvp_matches (now service-role-write-only, see section 2) and calls this
-- function with the service role, after which the grant to `authenticated`
-- should be revoked. Until then, do not surface these numbers as anything a
-- player can win something with.
CREATE OR REPLACE FUNCTION public.fn_trivia_pvp_record_result(
    p_outcome  text,
    p_diamonds integer DEFAULT 0,
    p_user_id  uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid;
    v_d    integer := LEAST(GREATEST(COALESCE(p_diamonds, 0), 0), 100000);
    v_row  public.trivia_pvp_stats%ROWTYPE;
BEGIN
    IF (SELECT auth.role()) = 'service_role' THEN
        v_user := COALESCE(p_user_id, (SELECT auth.uid()));
    ELSE
        -- A client may only record ITS OWN result, whatever it passes.
        v_user := (SELECT auth.uid());
    END IF;
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
    END IF;
    IF p_outcome IS NULL OR p_outcome NOT IN ('win', 'loss', 'tie') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_outcome');
    END IF;

    INSERT INTO public.trivia_pvp_stats AS s (
        user_id, wins, losses, ties, win_streak, best_streak,
        total_diamonds_won, total_diamonds_lost, updated_at
    )
    VALUES (
        v_user,
        CASE WHEN p_outcome = 'win'  THEN 1 ELSE 0 END,
        CASE WHEN p_outcome = 'loss' THEN 1 ELSE 0 END,
        CASE WHEN p_outcome = 'tie'  THEN 1 ELSE 0 END,
        CASE WHEN p_outcome = 'win'  THEN 1 ELSE 0 END,
        CASE WHEN p_outcome = 'win'  THEN 1 ELSE 0 END,
        CASE WHEN p_outcome = 'win'  THEN v_d ELSE 0 END,
        CASE WHEN p_outcome = 'loss' THEN v_d ELSE 0 END,
        now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        wins       = s.wins   + CASE WHEN p_outcome = 'win'  THEN 1 ELSE 0 END,
        losses     = s.losses + CASE WHEN p_outcome = 'loss' THEN 1 ELSE 0 END,
        ties       = s.ties   + CASE WHEN p_outcome = 'tie'  THEN 1 ELSE 0 END,
        -- A tie continues the streak; a loss resets it.
        win_streak = CASE
                        WHEN p_outcome = 'win'  THEN s.win_streak + 1
                        WHEN p_outcome = 'loss' THEN 0
                        ELSE s.win_streak
                     END,
        best_streak = GREATEST(
                        s.best_streak,
                        CASE WHEN p_outcome = 'win' THEN s.win_streak + 1 ELSE s.win_streak END
                      ),
        total_diamonds_won  = s.total_diamonds_won  + CASE WHEN p_outcome = 'win'  THEN v_d ELSE 0 END,
        total_diamonds_lost = s.total_diamonds_lost + CASE WHEN p_outcome = 'loss' THEN v_d ELSE 0 END,
        updated_at = now()
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'success', true,
        'wins', v_row.wins, 'losses', v_row.losses, 'ties', v_row.ties,
        'win_streak', v_row.win_streak, 'best_streak', v_row.best_streak
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trivia_pvp_record_result(text, integer, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.fn_trivia_pvp_record_result(text, integer, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_trivia_pvp_record_result(text, integer, uuid) IS
    'Phase 80 — atomic, non-forgeable PvP stat increment. Replaces the '
    'read-then-upsert in pages/hub/trivia/pvp.js updatePvpStats(): call it as '
    'supabase.rpc(''fn_trivia_pvp_record_result'', { p_outcome, p_diamonds }). '
    'A client cannot choose the magnitude of the change, only report one match.';
