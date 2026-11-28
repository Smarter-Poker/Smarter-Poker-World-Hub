-- ═══════════════════════════════════════════════════════════════════════
-- 20261128120000_gto_chart_study_is_awarded.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:         3  (new RPC that issues currency, new table with RLS)
-- AUTHOR:       Claude (session_01Gw7aDqHttuYE7SQAL8CeNn), 2026-11-28
-- AFFECTS:      public.chart_study_sessions (new),
--               public.fn_chart_study_event(uuid, text, uuid, text) (new)
-- IRREVERSIBLE: no  (rollback section at the bottom)
--
-- WHY:
--   gto_chart_study (5 diamonds, max 2 per day, counts toward the daily cap,
--   active = true in diamond_reward_catalog since 2026-07-31) is advertised to
--   players: Club Arena's Diamond Earn page offers "Study A Chart - Complete An
--   Eligible GTO Chart Study Session" and links /hub/training/preflop-charts.
--   It has never paid: zero gto_chart_study rows in diamond_transactions, and
--   DiamondRewardService.onChartStudy has no caller.
--   20260909001800_first_training_session_reward_is_awarded.sql recorded why:
--   its verifyNote requires "a server-recorded study session of sufficient
--   dwell time" and no dwell tracking existed. This builds that, so the reward
--   the platform already prices and advertises is payable. Price and cap are
--   NOT changed here: award_diamonds_v2 reads them from the catalog.
--
-- HOW:
--   * chart_study_sessions: one row per study session on the 6-Max 100BB
--     Preflop Range Browser. Every time value is the server's now(); the
--     client never sends a duration.
--   * fn_chart_study_event(user, event, session, chart), service_role only.
--     The API route resolves the user from the request's JWT
--     (supabase.auth.getUser) and passes it in.
--       start  - opens a session (and closes any still-open one for the user).
--       ping   - credits active time: the gap since the last credited ping,
--                capped at 30 s, and only when the gap is at least 10 s. The
--                page pings every 20 s while visible and recently used, so a
--                closed tab or an idle screen stops earning. Records the chart
--                being studied (scenario:position, validated against the
--                browser's own scenarios and positions).
--       finish - credits a final ping and settles the session if unpaid.
--       status - today's paid count, for the page's readout.
--   * THE THRESHOLD ("sufficient dwell time" made concrete): 180 s of active
--     study AND at least 3 distinct charts, within 30 minutes of the start.
--     The catalog text says "study a preflop range chart for a full session";
--     three minutes across three charts is a real study session on this tool
--     and cannot be met by leaving the page open.
--   * When the threshold is met the session calls award_diamonds_v2 ONCE with
--     reference_id gto_chart_study_<user>_<session>. That function owns the
--     amount, the multiplier, max_per_day = 2, the daily/monthly caps, the
--     issuance freeze and reference-id idempotency, so a retried or raced call
--     cannot pay twice. The session row records the result either way.
--   * Abuse bounds: one open session per user, at most 40 starts per Chicago
--     day, at most 30 recorded charts per session.
--   * RLS: a player may read their own sessions; nobody writes the table
--     except this function.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. PRE-FLIGHT
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.diamond_reward_catalog
         WHERE action_key = 'gto_chart_study' AND active = true
           AND diamonds = 5 AND max_per_day = 2
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: gto_chart_study catalog row is not the advertised 5 x 2/day active row';
    END IF;
    IF to_regprocedure('public.award_diamonds_v2(uuid,text,text,text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: award_diamonds_v2 is missing';
    END IF;
END $$;

-- 2. THE TABLE
CREATE TABLE IF NOT EXISTS public.chart_study_sessions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at        timestamptz NOT NULL DEFAULT now(),
    last_ping_at      timestamptz NOT NULL DEFAULT now(),
    active_seconds    integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
    charts            text[] NOT NULL DEFAULT '{}',
    ping_count        integer NOT NULL DEFAULT 0 CHECK (ping_count >= 0),
    award_state       text NOT NULL DEFAULT 'studying'
                      CHECK (award_state IN ('studying', 'awarded', 'not_awarded')),
    award_reason      text,
    awarded_diamonds  integer,
    award_result      jsonb,
    settled_at        timestamptz
);

CREATE INDEX IF NOT EXISTS chart_study_sessions_user_started_idx
    ON public.chart_study_sessions (user_id, started_at DESC);

ALTER TABLE public.chart_study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chart_study_sessions_read_own ON public.chart_study_sessions;
CREATE POLICY chart_study_sessions_read_own ON public.chart_study_sessions
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.chart_study_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chart_study_sessions TO authenticated;
GRANT ALL ON public.chart_study_sessions TO service_role;

-- 3. THE FUNCTION
CREATE OR REPLACE FUNCTION public.fn_chart_study_event(
    p_user_id    uuid,
    p_event      text,
    p_session_id uuid DEFAULT NULL,
    p_chart      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    c_min_active      constant integer  := 180;
    c_min_charts      constant integer  := 3;
    c_credit_cap      constant integer  := 30;
    c_min_gap         constant integer  := 10;
    c_session_max     constant interval := interval '30 minutes';
    c_starts_per_day  constant integer  := 40;
    c_max_charts      constant integer  := 30;
    c_max_per_day     constant integer  := 2;
    c_chart_pattern   constant text     := '^(rfi|vs3bet|bb_defense):(UTG|MP|HJ|CO|BTN|SB)$';

    v_now         timestamptz := now();
    v_today       date := (now() AT TIME ZONE 'America/Chicago')::date;
    v_day_start   timestamptz;
    v_day_end     timestamptz;
    v_chart       text;
    v_session     public.chart_study_sessions%ROWTYPE;
    v_gap         numeric;
    v_award       jsonb;
    v_starts      integer;
    v_paid_today  integer;
BEGIN
    v_day_start := v_today::timestamp AT TIME ZONE 'America/Chicago';
    v_day_end   := (v_today + 1)::timestamp AT TIME ZONE 'America/Chicago';

    IF p_user_id IS NULL OR p_event NOT IN ('start', 'ping', 'finish', 'status') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
    END IF;

    -- One study writer per user at a time.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('fn_chart_study_event'),
        pg_catalog.hashtext(p_user_id::text)
    );

    v_chart := CASE
        WHEN p_chart IS NOT NULL AND p_chart ~ c_chart_pattern THEN p_chart
        ELSE NULL
    END;

    IF p_event = 'start' THEN
        SELECT count(*)::int INTO v_starts
          FROM public.chart_study_sessions
         WHERE user_id = p_user_id
           AND started_at >= v_day_start AND started_at < v_day_end;
        IF v_starts >= c_starts_per_day THEN
            p_event := 'status';
        ELSE
            UPDATE public.chart_study_sessions
               SET award_state = 'not_awarded', award_reason = 'superseded', settled_at = v_now
             WHERE user_id = p_user_id AND award_state = 'studying';
            INSERT INTO public.chart_study_sessions (user_id, started_at, last_ping_at, charts)
            VALUES (p_user_id, v_now, v_now,
                    CASE WHEN v_chart IS NULL THEN '{}'::text[] ELSE ARRAY[v_chart] END)
            RETURNING * INTO v_session;
        END IF;

    ELSIF p_event IN ('ping', 'finish') THEN
        SELECT * INTO v_session
          FROM public.chart_study_sessions
         WHERE id = p_session_id AND user_id = p_user_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'reason', 'unknown_session');
        END IF;

        IF v_session.award_state = 'studying' THEN
            IF v_now - v_session.started_at > c_session_max THEN
                UPDATE public.chart_study_sessions
                   SET award_state = 'not_awarded', award_reason = 'expired', settled_at = v_now
                 WHERE id = v_session.id
                RETURNING * INTO v_session;
            ELSE
                v_gap := extract(epoch FROM (v_now - v_session.last_ping_at));
                IF v_gap >= c_min_gap THEN
                    v_session.active_seconds := v_session.active_seconds + LEAST(floor(v_gap)::int, c_credit_cap);
                    v_session.last_ping_at := v_now;
                    v_session.ping_count := v_session.ping_count + 1;
                END IF;
                IF v_chart IS NOT NULL
                   AND NOT (v_chart = ANY (v_session.charts))
                   AND cardinality(v_session.charts) < c_max_charts THEN
                    v_session.charts := v_session.charts || v_chart;
                END IF;

                UPDATE public.chart_study_sessions
                   SET active_seconds = v_session.active_seconds,
                       last_ping_at   = v_session.last_ping_at,
                       ping_count     = v_session.ping_count,
                       charts         = v_session.charts
                 WHERE id = v_session.id;

                IF v_session.active_seconds >= c_min_active
                   AND cardinality(v_session.charts) >= c_min_charts THEN
                    v_award := public.award_diamonds_v2(
                        p_user_id,
                        'gto_chart_study',
                        'gto_chart_study_' || p_user_id::text || '_' || v_session.id::text,
                        v_session.id::text,
                        jsonb_build_object(
                            'source', 'fn_chart_study_event',
                            'session_id', v_session.id,
                            'active_seconds', v_session.active_seconds,
                            'charts', to_jsonb(v_session.charts)
                        )
                    );
                    UPDATE public.chart_study_sessions
                       SET award_state      = CASE WHEN COALESCE((v_award ->> 'success')::boolean, false)
                                                   THEN 'awarded' ELSE 'not_awarded' END,
                           award_reason     = v_award ->> 'reason',
                           awarded_diamonds = COALESCE((v_award ->> 'awarded')::int, 0),
                           award_result     = v_award,
                           settled_at       = v_now
                     WHERE id = v_session.id
                    RETURNING * INTO v_session;
                ELSIF p_event = 'finish' THEN
                    UPDATE public.chart_study_sessions
                       SET award_state = 'not_awarded', award_reason = 'ended_before_threshold', settled_at = v_now
                     WHERE id = v_session.id
                    RETURNING * INTO v_session;
                END IF;
            END IF;
        END IF;
    END IF;

    SELECT count(*)::int INTO v_paid_today
      FROM public.diamond_transactions t
     WHERE t.user_id = p_user_id
       AND t.transaction_type = 'gto_chart_study'
       AND t.amount > 0
       AND t.created_at >= v_day_start AND t.created_at < v_day_end;

    RETURN jsonb_build_object(
        'ok', true,
        'event', p_event,
        'session_id', v_session.id,
        'state', v_session.award_state,
        'reason', v_session.award_reason,
        'active_seconds', COALESCE(v_session.active_seconds, 0),
        'charts', COALESCE(cardinality(v_session.charts), 0),
        'awarded_diamonds', v_session.awarded_diamonds,
        'min_active_seconds', c_min_active,
        'min_charts', c_min_charts,
        'paid_today', v_paid_today,
        'max_per_day', c_max_per_day
    );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_chart_study_event(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_chart_study_event(uuid, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.fn_chart_study_event(uuid, text, uuid, text) IS
    'Server-recorded GTO chart study sessions; pays gto_chart_study once per qualifying session through award_diamonds_v2. Service role only; the API resolves the user from the JWT.';

-- 4. POST-APPLY ASSERTIONS
DO $$
BEGIN
    IF to_regprocedure('public.fn_chart_study_event(uuid,text,uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'post-apply: fn_chart_study_event missing';
    END IF;
    IF has_function_privilege('anon', 'public.fn_chart_study_event(uuid,text,uuid,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_chart_study_event(uuid,text,uuid,text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'post-apply: fn_chart_study_event must be service_role only';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chart_study_sessions'::regclass) THEN
        RAISE EXCEPTION 'post-apply: RLS is off on chart_study_sessions';
    END IF;
    IF has_table_privilege('authenticated', 'public.chart_study_sessions', 'INSERT')
       OR has_table_privilege('authenticated', 'public.chart_study_sessions', 'UPDATE') THEN
        RAISE EXCEPTION 'post-apply: players must not write chart_study_sessions';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (paste as a new migration to undo; paid diamonds stay paid)
-- ═══════════════════════════════════════════════════════════════════════
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_chart_study_event(uuid, text, uuid, text);
-- DROP TABLE IF EXISTS public.chart_study_sessions;
-- COMMIT;
