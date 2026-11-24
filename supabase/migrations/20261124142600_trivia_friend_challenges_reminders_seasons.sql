-- =============================================================================
-- 20261124142600_trivia_friend_challenges_reminders_seasons.sql
-- =============================================================================
-- TIER:        2 (additive social, retention, championship & review authority)
-- AFFECTS:     public.trivia_friend_challenges, public.trivia_nightly_reminders,
--              friend challenge RPCs, nightly reminder RPCs, monthly championship
--              standings RPC, post-settlement question review RPC, and
--              idempotent streak freeze purchase RPC.
-- IRREVERSIBLE: no (additive tables + functions; financial debits flow through
--              existing Phase 2 trivia_ledger_debit / deduct_diamonds authority)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pre-flight verification
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[] := '{}'::text[];
BEGIN
    IF to_regclass('public.trivia_sessions') IS NULL THEN v_missing := v_missing || 'trivia_sessions'; END IF;
    IF to_regclass('public.trivia_session_answers') IS NULL THEN v_missing := v_missing || 'trivia_session_answers'; END IF;
    IF to_regclass('public.trivia_questions') IS NULL THEN v_missing := v_missing || 'trivia_questions'; END IF;
    IF to_regclass('public.trivia_pvp_matches') IS NULL THEN v_missing := v_missing || 'trivia_pvp_matches'; END IF;
    IF to_regclass('public.trivia_pvp_session_links') IS NULL THEN v_missing := v_missing || 'trivia_pvp_session_links'; END IF;
    IF to_regclass('public.trivia_tournaments') IS NULL THEN v_missing := v_missing || 'trivia_tournaments'; END IF;
    IF to_regclass('public.trivia_tournament_entrants') IS NULL THEN v_missing := v_missing || 'trivia_tournament_entrants'; END IF;
    IF to_regclass('public.trivia_tournament_results') IS NULL THEN v_missing := v_missing || 'trivia_tournament_results'; END IF;
    IF to_regclass('public.trivia_tournament_matchups') IS NULL THEN v_missing := v_missing || 'trivia_tournament_matchups'; END IF;
    IF to_regclass('public.trivia_tournament_seats') IS NULL THEN v_missing := v_missing || 'trivia_tournament_seats'; END IF;
    IF to_regclass('public.trivia_user_items') IS NULL THEN v_missing := v_missing || 'trivia_user_items'; END IF;
    IF to_regclass('public.trivia_item_transactions') IS NULL THEN v_missing := v_missing || 'trivia_item_transactions'; END IF;
    IF to_regclass('public.profiles') IS NULL THEN v_missing := v_missing || 'profiles'; END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'pre-flight failed: required tables missing: %', array_to_string(v_missing, ', ');
    END IF;
    IF to_regprocedure('public.trivia_ledger_debit(text,uuid,integer,text,text,text,text,text,jsonb)') IS NULL
       OR to_regprocedure('public.trivia_ledger_switch_enabled(text)') IS NULL THEN
        RAISE EXCEPTION 'pre-flight failed: Phase 2 trivia ledger debit authority is missing';
    END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 2. Direct Friend Challenges table (RLS enabled, no direct browser writes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_friend_challenges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_code text NOT NULL UNIQUE,
    challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    challenged_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    stake_amount integer NOT NULL CHECK (stake_amount IN (10, 25, 50, 100)),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'cancelled', 'expired')),
    match_id uuid REFERENCES public.trivia_pvp_matches(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trivia_friend_challenges_no_self CHECK (
        challenged_user_id IS NULL OR challenged_user_id <> challenger_id
    ),
    CONSTRAINT trivia_friend_challenges_code_format CHECK (
        challenge_code ~ '^[A-Z0-9]{6,16}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_trivia_friend_challenges_challenger
    ON public.trivia_friend_challenges (challenger_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trivia_friend_challenges_challenged
    ON public.trivia_friend_challenges (challenged_user_id, created_at DESC)
    WHERE challenged_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trivia_friend_challenges_open_expires
    ON public.trivia_friend_challenges (status, expires_at)
    WHERE status = 'open';

ALTER TABLE public.trivia_friend_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_friend_challenges FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.trivia_friend_challenges TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Nightly Tournament Reminder Opt-In table (RLS enabled)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_nightly_reminders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tournament_id uuid NOT NULL REFERENCES public.trivia_tournaments(id) ON DELETE CASCADE,
    scheduled_local_date date NOT NULL,
    channel text NOT NULL DEFAULT 'in_app_push' CHECK (channel IN ('in_app_push', 'email', 'web_push')),
    opted_in_at timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    UNIQUE (user_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_nightly_reminders_tournament
    ON public.trivia_nightly_reminders (tournament_id, opted_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_trivia_nightly_reminders_user_date
    ON public.trivia_nightly_reminders (user_id, scheduled_local_date DESC);

ALTER TABLE public.trivia_nightly_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_nightly_reminders FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trivia_nightly_reminders TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Direct Friend Challenge RPCs (atomic, sanitized, owner/service_role only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_create_v1(
    p_user_id uuid,
    p_stake_amount integer,
    p_expires_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_stake integer := COALESCE(p_stake_amount, 25);
    v_ttl integer := LEAST(GREATEST(COALESCE(p_expires_minutes, 30), 5), 1440);
    v_open_count integer := 0;
    v_code text;
    v_attempt integer := 0;
    v_row public.trivia_friend_challenges%ROWTYPE;
    v_display_name text;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF v_stake NOT IN (10, 25, 50, 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_stake_amount');
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
                challenge_code, challenger_id, stake_amount, status, expires_at
            ) VALUES (
                v_code, p_user_id, v_stake, 'open', now() + make_interval(mins => v_ttl)
            )
            RETURNING * INTO v_row;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            IF v_attempt >= 8 THEN
                RETURN jsonb_build_object('success', false, 'error', 'code_generation_failed');
            END IF;
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
            'isOwner', true,
            'canAccept', false
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_get_v1(
    p_challenge_code text,
    p_viewer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
            'isOwner', (p_viewer_id IS NOT NULL AND v_row.challenger_id = p_viewer_id),
            'isChallenged', (p_viewer_id IS NOT NULL AND v_row.challenged_user_id = p_viewer_id),
            'canAccept', (
                v_effective_status = 'open'
                AND (p_viewer_id IS NULL OR v_row.challenger_id <> p_viewer_id)
            )
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_list_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
WITH params AS (
    SELECT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50) AS lim
), rows_base AS (
    SELECT
        c.id,
        c.challenge_code,
        c.stake_amount,
        CASE WHEN c.status = 'open' AND c.expires_at <= now() THEN 'expired' ELSE c.status END AS effective_status,
        c.match_id,
        c.expires_at,
        c.created_at,
        (c.challenger_id = p_user_id) AS is_owner,
        (c.challenged_user_id = p_user_id) AS is_challenged,
        COALESCE(NULLIF(btrim(p1.display_name), ''), NULLIF(btrim(p1.username), ''), NULLIF(btrim(p1.full_name), ''), 'Player') AS challenger_name,
        CASE WHEN c.challenged_user_id IS NOT NULL THEN
            COALESCE(NULLIF(btrim(p2.display_name), ''), NULLIF(btrim(p2.username), ''), NULLIF(btrim(p2.full_name), ''), 'Player')
        ELSE NULL END AS challenged_name
    FROM public.trivia_friend_challenges c
    LEFT JOIN public.profiles p1 ON p1.id = c.challenger_id
    LEFT JOIN public.profiles p2 ON p2.id = c.challenged_user_id
    WHERE p_user_id IS NOT NULL
      AND (c.challenger_id = p_user_id OR c.challenged_user_id = p_user_id)
    ORDER BY c.created_at DESC
    LIMIT (SELECT lim FROM params)
)
SELECT jsonb_build_object(
    'success', true,
    'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id,
            'challengeCode', r.challenge_code,
            'stakeAmount', r.stake_amount,
            'status', r.effective_status,
            'matchId', r.match_id,
            'expiresAt', r.expires_at,
            'createdAt', r.created_at,
            'challengerDisplayName', r.challenger_name,
            'challengedDisplayName', r.challenged_name,
            'isOwner', r.is_owner,
            'isChallenged', r.is_challenged,
            'canAccept', (r.effective_status = 'open' AND NOT r.is_owner)
        ) ORDER BY r.created_at DESC)
        FROM rows_base r
    ), '[]'::jsonb)
);
$function$;

CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_cancel_v1(
    p_user_id uuid,
    p_challenge_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_code text := upper(btrim(COALESCE(p_challenge_code, '')));
    v_row public.trivia_friend_challenges%ROWTYPE;
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
    IF v_row.challenger_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_challenge_owner');
    END IF;
    IF v_row.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'challenge', jsonb_build_object(
                'id', v_row.id,
                'challengeCode', v_row.challenge_code,
                'stakeAmount', v_row.stake_amount,
                'status', v_row.status,
                'expiresAt', v_row.expires_at
            )
        );
    END IF;
    IF v_row.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_not_open', 'status', v_row.status);
    END IF;

    UPDATE public.trivia_friend_challenges
       SET status = 'cancelled', updated_at = now()
     WHERE id = v_row.id
     RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'challenge', jsonb_build_object(
            'id', v_row.id,
            'challengeCode', v_row.challenge_code,
            'stakeAmount', v_row.stake_amount,
            'status', v_row.status,
            'expiresAt', v_row.expires_at
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_accept_v1(
    p_user_id uuid,
    p_challenge_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_code text := upper(btrim(COALESCE(p_challenge_code, '')));
    v_row public.trivia_friend_challenges%ROWTYPE;
    v_challenger_name text;
    v_rules_version text;
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
    IF v_row.status = 'open' AND v_row.expires_at <= now() THEN
        UPDATE public.trivia_friend_challenges
           SET status = 'expired', updated_at = now()
         WHERE id = v_row.id;
        RETURN jsonb_build_object('success', false, 'error', 'challenge_expired');
    END IF;
    IF v_row.status <> 'open' THEN
        RETURN jsonb_build_object('success', false, 'error', 'challenge_not_open', 'status', v_row.status);
    END IF;

    UPDATE public.trivia_friend_challenges
       SET status = 'accepted',
           challenged_user_id = p_user_id,
           updated_at = now()
     WHERE id = v_row.id
     RETURNING * INTO v_row;

    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.username), ''), NULLIF(btrim(p.full_name), ''), 'Player')
      INTO v_challenger_name
      FROM public.profiles p
     WHERE p.id = v_row.challenger_id;

    BEGIN
        SELECT rc.rules_version_id INTO v_rules_version
          FROM public.trivia_rules_current rc
         LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        v_rules_version := NULL;
    END;

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
            'challengerDisplayName', COALESCE(v_challenger_name, 'Player'),
            'isOwner', false,
            'isChallenged', true,
            'canAccept', false
        ),
        'pvpHandoff', jsonb_build_object(
            'stake', v_row.stake_amount,
            'challengeCode', v_row.challenge_code,
            'challengeId', v_row.id,
            'rulesVersion', v_rules_version,
            'quoteEndpoint', '/api/trivia/pvp/quote',
            'joinEndpoint', '/api/trivia/pvp/join',
            'route', '/hub/trivia/pvp?challenge=' || v_row.challenge_code || '&stake=' || v_row.stake_amount::text
        )
    );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. Nightly Tournament Reminder Opt-In RPCs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_nightly_reminder_status_v1(
    p_user_id uuid,
    p_tournament_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_tournament public.trivia_tournaments%ROWTYPE;
    v_reminder public.trivia_nightly_reminders%ROWTYPE;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    IF p_tournament_id IS NOT NULL THEN
        SELECT * INTO v_tournament
          FROM public.trivia_tournaments
         WHERE id = p_tournament_id
           AND schedule_kind = 'public_nightly';
    ELSE
        SELECT * INTO v_tournament
          FROM public.trivia_tournaments
         WHERE schedule_kind = 'public_nightly'
           AND lifecycle_state IN ('scheduled', 'registration', 'held')
           AND start_time >= now() - interval '15 minutes'
         ORDER BY start_time ASC
         LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'tournamentId', NULL,
            'optedIn', false,
            'reminderAvailable', false
        );
    END IF;

    SELECT * INTO v_reminder
      FROM public.trivia_nightly_reminders
     WHERE user_id = p_user_id
       AND tournament_id = v_tournament.id;

    RETURN jsonb_build_object(
        'success', true,
        'reminderAvailable', true,
        'tournamentId', v_tournament.id,
        'tournamentName', v_tournament.name,
        'scheduledLocalDate', v_tournament.scheduled_local_date,
        'startsAt', v_tournament.start_time,
        'reminderLeadMinutes', 15,
        'optedIn', FOUND,
        'channel', COALESCE(v_reminder.channel, 'in_app_push'),
        'optedInAt', v_reminder.opted_in_at,
        'notifiedAt', v_reminder.notified_at
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trivia_nightly_reminder_toggle_v1(
    p_user_id uuid,
    p_tournament_id uuid DEFAULT NULL,
    p_enabled boolean DEFAULT NULL,
    p_channel text DEFAULT 'in_app_push'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_channel text := COALESCE(NULLIF(btrim(p_channel), ''), 'in_app_push');
    v_tournament public.trivia_tournaments%ROWTYPE;
    v_existing public.trivia_nightly_reminders%ROWTYPE;
    v_target_enabled boolean;
    v_saved public.trivia_nightly_reminders%ROWTYPE;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF v_channel NOT IN ('in_app_push', 'email', 'web_push') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_channel');
    END IF;

    IF p_tournament_id IS NOT NULL THEN
        SELECT * INTO v_tournament
          FROM public.trivia_tournaments
         WHERE id = p_tournament_id
           AND schedule_kind = 'public_nightly';
    ELSE
        SELECT * INTO v_tournament
          FROM public.trivia_tournaments
         WHERE schedule_kind = 'public_nightly'
           AND lifecycle_state IN ('scheduled', 'registration', 'held')
           AND start_time >= now() - interval '15 minutes'
         ORDER BY start_time ASC
         LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_upcoming_nightly_tournament');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('trivia_nightly_reminder:' || p_user_id::text || ':' || v_tournament.id::text));

    SELECT * INTO v_existing
      FROM public.trivia_nightly_reminders
     WHERE user_id = p_user_id
       AND tournament_id = v_tournament.id;

    v_target_enabled := CASE
        WHEN p_enabled IS NOT NULL THEN p_enabled
        ELSE NOT FOUND
    END;

    IF v_target_enabled THEN
        INSERT INTO public.trivia_nightly_reminders (
            user_id, tournament_id, scheduled_local_date, channel, opted_in_at
        ) VALUES (
            p_user_id,
            v_tournament.id,
            COALESCE(v_tournament.scheduled_local_date, (v_tournament.start_time AT TIME ZONE 'America/Chicago')::date),
            v_channel,
            now()
        )
        ON CONFLICT (user_id, tournament_id)
        DO UPDATE SET
            channel = EXCLUDED.channel,
            opted_in_at = now()
        RETURNING * INTO v_saved;

        RETURN jsonb_build_object(
            'success', true,
            'tournamentId', v_tournament.id,
            'tournamentName', v_tournament.name,
            'scheduledLocalDate', v_saved.scheduled_local_date,
            'startsAt', v_tournament.start_time,
            'reminderLeadMinutes', 15,
            'optedIn', true,
            'channel', v_saved.channel,
            'optedInAt', v_saved.opted_in_at
        );
    ELSE
        DELETE FROM public.trivia_nightly_reminders
         WHERE user_id = p_user_id
           AND tournament_id = v_tournament.id;

        RETURN jsonb_build_object(
            'success', true,
            'tournamentId', v_tournament.id,
            'tournamentName', v_tournament.name,
            'scheduledLocalDate', COALESCE(v_tournament.scheduled_local_date, (v_tournament.start_time AT TIME ZONE 'America/Chicago')::date),
            'startsAt', v_tournament.start_time,
            'reminderLeadMinutes', 15,
            'optedIn', false,
            'channel', v_channel,
            'optedInAt', NULL
        );
    END IF;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6. Monthly Trivia Championship Standings RPC (America/Chicago, human-only default)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_monthly_championship_standings_v1(
    p_month text DEFAULT NULL,
    p_include_horses boolean DEFAULT false,
    p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_month text := NULLIF(btrim(COALESCE(p_month, '')), '');
    v_include_horses boolean := COALESCE(p_include_horses, false);
    v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_settled_count integer := 0;
    v_items jsonb := '[]'::jsonb;
BEGIN
    IF v_month IS NULL THEN
        v_month := to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM');
    ELSIF v_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_month_format');
    END IF;

    SELECT count(*)::integer INTO v_settled_count
      FROM public.trivia_tournaments t
     WHERE t.schedule_kind = 'public_nightly'
       AND t.lifecycle_state = 'settled'
       AND to_char(t.scheduled_local_date, 'YYYY-MM') = v_month;

    WITH scored AS (
        SELECT
            e.participant_id,
            r.participant_kind,
            r.display_name,
            t.scheduled_local_date,
            r.final_rank,
            r.payout,
            r.correct_total,
            CASE
                WHEN r.final_rank = 1 THEN 100
                WHEN r.final_rank = 2 THEN 75
                WHEN r.final_rank IN (3, 4) THEN 50
                WHEN r.final_rank BETWEEN 5 AND 8 THEN 30
                WHEN r.final_rank BETWEEN 9 AND 16 THEN 15
                WHEN r.payout > 0 THEN 10
                ELSE 5
            END AS event_points
        FROM public.trivia_tournaments t
        JOIN public.trivia_tournament_results r
          ON r.tournament_id = t.id
        JOIN public.trivia_tournament_entrants e
          ON e.id = r.entrant_id
        WHERE t.schedule_kind = 'public_nightly'
          AND t.lifecycle_state = 'settled'
          AND to_char(t.scheduled_local_date, 'YYYY-MM') = v_month
          AND (v_include_horses IS TRUE OR r.participant_kind = 'human')
    ), aggregated AS (
        SELECT
            s.participant_id,
            s.participant_kind,
            (array_agg(s.display_name ORDER BY s.scheduled_local_date DESC))[1] AS display_name,
            sum(s.event_points)::integer AS points,
            count(*) FILTER (WHERE s.final_rank = 1)::integer AS wins,
            count(*) FILTER (WHERE s.payout > 0)::integer AS cashes,
            count(*)::integer AS entries,
            COALESCE(sum(s.payout), 0)::integer AS total_payout,
            min(s.final_rank)::integer AS best_rank,
            COALESCE(sum(s.correct_total), 0)::integer AS correct_total
        FROM scored s
        GROUP BY s.participant_id, s.participant_kind
    ), ranked AS (
        SELECT
            row_number() OVER (
                ORDER BY a.points DESC, a.wins DESC, a.total_payout DESC, a.best_rank ASC, a.correct_total DESC, a.participant_id ASC
            )::integer AS standing_rank,
            a.*
        FROM aggregated a
        ORDER BY standing_rank ASC
        LIMIT v_limit
    )
    SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
            'rank', r.standing_rank,
            'participantId', r.participant_id,
            'participantKind', r.participant_kind,
            'displayName', r.display_name,
            'points', r.points,
            'wins', r.wins,
            'cashes', r.cashes,
            'entries', r.entries,
            'totalPayout', r.total_payout,
            'bestRank', r.best_rank,
            'correctTotal', r.correct_total
        ) ORDER BY r.standing_rank ASC),
        '[]'::jsonb
    )
    INTO v_items
    FROM ranked r;

    RETURN jsonb_build_object(
        'success', true,
        'month', v_month,
        'timezone', 'America/Chicago',
        'includeHorses', v_include_horses,
        'settledTournaments', v_settled_count,
        'pointsSchedule', jsonb_build_object(
            'first', 100,
            'second', 75,
            'semifinalist', 50,
            'top8', 30,
            'top16', 15,
            'cash', 10,
            'entry', 5
        ),
        'items', v_items
    );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 7. Post-Settlement Question Review RPC (strictly blocks active sessions)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_post_settlement_review_v1(
    p_user_id uuid,
    p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_session public.trivia_sessions%ROWTYPE;
    v_has_unresolved_pvp boolean := false;
    v_has_unresolved_tournament boolean := false;
    v_items jsonb := '[]'::jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_session_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_session_id');
    END IF;

    SELECT * INTO v_session
      FROM public.trivia_sessions
     WHERE id = p_session_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'session_not_found');
    END IF;

    IF v_session.user_id IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_your_session');
    END IF;

    -- Strictly refuse answer-key access before session reaches terminal state
    IF v_session.status NOT IN ('submitted', 'completed', 'expired') THEN
        RETURN jsonb_build_object('success', false, 'error', 'review_not_available_before_settlement');
    END IF;

    -- If linked to a PvP match, parent match must also be resolved/settled
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_pvp_session_links l
          JOIN public.trivia_pvp_matches m ON m.id = l.match_id
         WHERE l.session_id = v_session.id
           AND m.status NOT IN ('complete', 'completed', 'cancelled', 'expired', 'abandoned')
    ) INTO v_has_unresolved_pvp;

    IF v_has_unresolved_pvp THEN
        RETURN jsonb_build_object('success', false, 'error', 'review_not_available_before_settlement');
    END IF;

    -- If linked to a nightly tournament seat, parent matchup or tournament must be resolved/settled
    SELECT EXISTS (
        SELECT 1
          FROM public.trivia_tournament_seats ts
          JOIN public.trivia_tournament_matchups mu ON mu.id = ts.matchup_id
          JOIN public.trivia_tournaments t ON t.id = ts.tournament_id
         WHERE ts.session_id = v_session.id
           AND mu.status IS DISTINCT FROM 'resolved'
           AND t.lifecycle_state NOT IN ('settled', 'cancelled')
    ) INTO v_has_unresolved_tournament;

    IF v_has_unresolved_tournament THEN
        RETURN jsonb_build_object('success', false, 'error', 'review_not_available_before_settlement');
    END IF;

    WITH ordered_questions AS (
        SELECT
            ord::integer AS position,
            qid AS question_id
        FROM unnest(COALESCE(v_session.question_ids, ARRAY[]::uuid[])) WITH ORDINALITY AS u(qid, ord)
    ), assembled AS (
        SELECT
            oq.position,
            q.id AS question_id,
            q.question,
            q.options,
            q.correct_index,
            q.explanation,
            q.category,
            q.difficulty,
            COALESCE(
                a.original_index,
                CASE
                    WHEN jsonb_typeof(v_session.answers -> q.id::text) = 'object'
                         AND (v_session.answers -> q.id::text ->> 'd') ~ '^-?[0-9]+$'
                    THEN CASE
                        WHEN (v_session.answers -> q.id::text ->> 'd')::integer >= 0
                             AND jsonb_typeof(v_session.permutations -> q.id::text) = 'array'
                             AND (v_session.answers -> q.id::text ->> 'd')::integer < jsonb_array_length(v_session.permutations -> q.id::text)
                        THEN ((v_session.permutations -> q.id::text) ->> (v_session.answers -> q.id::text ->> 'd')::integer)::integer
                        ELSE (v_session.answers -> q.id::text ->> 'd')::integer
                    END
                    WHEN jsonb_typeof(v_session.answers -> q.id::text) = 'number'
                    THEN (v_session.answers ->> q.id::text)::integer
                    ELSE NULL
                END
            ) AS selected_index,
            a.display_index AS selected_display_index,
            a.outcome,
            a.is_correct AS recorded_is_correct
        FROM ordered_questions oq
        JOIN public.trivia_questions q ON q.id = oq.question_id
        LEFT JOIN public.trivia_session_answers a
          ON a.session_id = v_session.id
         AND a.question_id = oq.question_id
        ORDER BY oq.position ASC
    )
    SELECT COALESCE(
        jsonb_agg(jsonb_build_object(
            'position', r.position,
            'questionId', r.question_id,
            'question', r.question,
            'options', r.options,
            'selectedIndex', r.selected_index,
            'selectedDisplayIndex', r.selected_display_index,
            'correctIndex', r.correct_index,
            'wasCorrect', COALESCE(
                r.recorded_is_correct,
                (r.selected_index IS NOT NULL AND r.selected_index >= 0 AND r.selected_index = r.correct_index)
            ),
            'wasSkipped', (
                r.outcome IN ('skip', 'timeout', 'voided')
                OR r.selected_index IS NULL
                OR r.selected_index < 0
            ),
            'outcome', COALESCE(
                r.outcome,
                CASE
                    WHEN r.selected_index IS NULL OR r.selected_index < 0 THEN 'skipped'
                    WHEN r.selected_index = r.correct_index THEN 'correct'
                    ELSE 'incorrect'
                END
            ),
            'explanation', COALESCE(r.explanation, ''),
            'category', r.category,
            'difficulty', r.difficulty
        ) ORDER BY r.position ASC),
        '[]'::jsonb
    )
    INTO v_items
    FROM assembled r;

    RETURN jsonb_build_object(
        'success', true,
        'sessionId', v_session.id,
        'mode', v_session.mode,
        'status', v_session.status,
        'score', v_session.score,
        'correctCount', v_session.correct_count,
        'totalQuestions', COALESCE(cardinality(v_session.question_ids), 0),
        'submittedAt', v_session.submitted_at,
        'items', v_items
    );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 8. Idempotent Streak Freeze Purchase RPC (25 Diamonds -> +1 streak_shield)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_streak_freeze_purchase_v1(
    p_user_id uuid,
    p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    FREEZE_COST constant integer := 25;
    MAX_FREEZES constant integer := 5;
    ITEM_KEY constant text := 'streak_shield';
    v_clean_key text := btrim(COALESCE(p_request_key, ''));
    v_reference_id text;
    v_existing_tx public.trivia_item_transactions%ROWTYPE;
    v_current_qty integer := 0;
    v_new_qty integer := 0;
    v_balance integer := 0;
    v_debit jsonb;
    v_journal_id uuid := NULL;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF length(v_clean_key) < 8 OR length(v_clean_key) > 128 OR v_clean_key !~ '^[A-Za-z0-9:_-]+$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_request_key');
    END IF;

    v_reference_id := 'trivia_streak_freeze:' || p_user_id::text || ':' || v_clean_key;

    PERFORM pg_advisory_xact_lock(hashtext('trivia_streak_freeze:' || p_user_id::text));

    SELECT COALESCE(quantity, 0) INTO v_current_qty
      FROM public.trivia_user_items
     WHERE user_id = p_user_id
       AND item_type = ITEM_KEY;

    -- Idempotent replay check BEFORE mutable cap checks
    SELECT * INTO v_existing_tx
      FROM public.trivia_item_transactions
     WHERE user_id = p_user_id
       AND reference_id = v_reference_id;

    IF FOUND THEN
        SELECT COALESCE(diamonds, 0)::integer INTO v_balance
          FROM public.profiles
         WHERE id = p_user_id;
        RETURN jsonb_build_object(
            'success', true,
            'replayed', true,
            'itemType', ITEM_KEY,
            'quantity', COALESCE(v_current_qty, v_existing_tx.balance_after),
            'maxQuantity', MAX_FREEZES,
            'diamondsCharged', 0,
            'balance', COALESCE(v_balance, 0),
            'referenceId', v_reference_id
        );
    END IF;

    IF COALESCE(v_current_qty, 0) >= MAX_FREEZES THEN
        SELECT COALESCE(diamonds, 0)::integer INTO v_balance
          FROM public.profiles
         WHERE id = p_user_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'max_streak_freezes_reached',
            'quantity', v_current_qty,
            'maxQuantity', MAX_FREEZES,
            'balance', COALESCE(v_balance, 0)
        );
    END IF;

    IF public.trivia_ledger_switch_enabled('solo_journal') THEN
        v_debit := public.trivia_ledger_debit(
            v_reference_id,
            p_user_id,
            FREEZE_COST,
            'trivia_lifeline',
            'Trivia Streak Freeze',
            'trivia_streak_freeze',
            v_reference_id,
            NULL,
            jsonb_build_object('item_type', ITEM_KEY, 'request_key', v_clean_key)
        );
        IF COALESCE((v_debit ->> 'success')::boolean, false) IS NOT TRUE THEN
            SELECT COALESCE(diamonds, 0)::integer INTO v_balance
              FROM public.profiles
             WHERE id = p_user_id;
            RETURN jsonb_build_object(
                'success', false,
                'error', CASE
                    WHEN v_debit ->> 'error' = 'insufficient_funds' THEN 'insufficient_diamonds'
                    ELSE COALESCE(v_debit ->> 'error', 'debit_failed')
                END,
                'balance', COALESCE(v_balance, 0)
            );
        END IF;
        BEGIN
            v_journal_id := NULLIF(v_debit ->> 'journal_id', '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            v_journal_id := NULL;
        END;
    ELSE
        v_debit := public.deduct_diamonds(
            p_user_id,
            FREEZE_COST,
            'Trivia Streak Freeze',
            'trivia_lifeline',
            'trivia_streak_freeze',
            jsonb_build_object('item_type', ITEM_KEY, 'request_key', v_clean_key),
            v_reference_id,
            0
        );
        IF COALESCE((v_debit ->> 'success')::boolean, false) IS NOT TRUE THEN
            SELECT COALESCE(diamonds, 0)::integer INTO v_balance
              FROM public.profiles
             WHERE id = p_user_id;
            RETURN jsonb_build_object(
                'success', false,
                'error', CASE
                    WHEN lower(COALESCE(v_debit ->> 'error', '')) LIKE '%insufficient%' THEN 'insufficient_diamonds'
                    ELSE COALESCE(v_debit ->> 'error', 'debit_failed')
                END,
                'balance', COALESCE(v_balance, 0)
            );
        END IF;
    END IF;

    INSERT INTO public.trivia_user_items AS i (user_id, item_type, quantity, created_at, updated_at)
    VALUES (p_user_id, ITEM_KEY, 1, now(), now())
    ON CONFLICT (user_id, item_type)
    DO UPDATE SET
        quantity = i.quantity + 1,
        updated_at = now()
    RETURNING quantity INTO v_new_qty;

    INSERT INTO public.trivia_item_transactions (
        user_id, item_type, amount, balance_after, transaction_type, reference_id, metadata
    ) VALUES (
        p_user_id,
        ITEM_KEY,
        1,
        v_new_qty,
        'streak_freeze_purchase',
        v_reference_id,
        jsonb_build_object(
            'cost_diamonds', FREEZE_COST,
            'request_key', v_clean_key,
            'journal_id', v_journal_id
        )
    );

    SELECT COALESCE(diamonds, 0)::integer INTO v_balance
      FROM public.profiles
     WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'replayed', false,
        'itemType', ITEM_KEY,
        'quantity', v_new_qty,
        'maxQuantity', MAX_FREEZES,
        'diamondsCharged', FREEZE_COST,
        'balance', COALESCE(v_balance, 0),
        'referenceId', v_reference_id,
        'journalId', v_journal_id
    );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 9. Strict ACL lockdown (owner + service_role only; zero browser EXECUTE)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_get_v1(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_get_v1(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_list_v1(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_list_v1(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_cancel_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_cancel_v1(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_friend_challenge_accept_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_friend_challenge_accept_v1(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_nightly_reminder_status_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_nightly_reminder_status_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_nightly_reminder_toggle_v1(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_nightly_reminder_toggle_v1(uuid, uuid, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_monthly_championship_standings_v1(text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_monthly_championship_standings_v1(text, boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_post_settlement_review_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_post_settlement_review_v1(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_streak_freeze_purchase_v1(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_streak_freeze_purchase_v1(uuid, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 10. Postconditions
-- -----------------------------------------------------------------------------
DO $postconditions$
DECLARE
    v_fn regprocedure;
    v_tbl regclass;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'public.trivia_friend_challenges'::regclass,
        'public.trivia_nightly_reminders'::regclass
    ] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_tbl) THEN
            RAISE EXCEPTION 'postcondition failed: RLS disabled on %', v_tbl;
        END IF;
        IF has_table_privilege('anon', v_tbl, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('authenticated', v_tbl, 'SELECT,INSERT,UPDATE,DELETE') THEN
            RAISE EXCEPTION 'postcondition failed: browser privilege leak on %', v_tbl;
        END IF;
    END LOOP;

    FOREACH v_fn IN ARRAY ARRAY[
        'public.trivia_friend_challenge_create_v1(uuid,integer,integer)'::regprocedure,
        'public.trivia_friend_challenge_get_v1(text,uuid)'::regprocedure,
        'public.trivia_friend_challenge_list_v1(uuid,integer)'::regprocedure,
        'public.trivia_friend_challenge_cancel_v1(uuid,text)'::regprocedure,
        'public.trivia_friend_challenge_accept_v1(uuid,text)'::regprocedure,
        'public.trivia_nightly_reminder_status_v1(uuid,uuid)'::regprocedure,
        'public.trivia_nightly_reminder_toggle_v1(uuid,uuid,boolean,text)'::regprocedure,
        'public.trivia_monthly_championship_standings_v1(text,boolean,integer)'::regprocedure,
        'public.trivia_post_settlement_review_v1(uuid,uuid)'::regprocedure,
        'public.trivia_streak_freeze_purchase_v1(uuid,text)'::regprocedure
    ] LOOP
        IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_fn)
           OR NOT EXISTS (
                SELECT 1 FROM unnest((SELECT p.proconfig FROM pg_proc p WHERE p.oid = v_fn)) s
                 WHERE s IN ('search_path=', 'search_path=""')
           ) THEN
            RAISE EXCEPTION 'postcondition failed: % is not a fixed-search-path SECURITY DEFINER', v_fn;
        END IF;
        IF has_function_privilege('anon', v_fn, 'EXECUTE')
           OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'postcondition failed: browser role can execute %', v_fn;
        END IF;
        IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
            RAISE EXCEPTION 'postcondition failed: service_role missing EXECUTE on %', v_fn;
        END IF;
    END LOOP;
END
$postconditions$;

NOTIFY pgrst, 'reload schema';

COMMIT;

/* FORWARD ROLLBACK
BEGIN;
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_create_v1(uuid, integer, integer) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_get_v1(text, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_list_v1(uuid, integer) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_cancel_v1(uuid, text) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_friend_challenge_accept_v1(uuid, text) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_nightly_reminder_status_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_nightly_reminder_toggle_v1(uuid, uuid, boolean, text) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_monthly_championship_standings_v1(text, boolean, integer) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_post_settlement_review_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_streak_freeze_purchase_v1(uuid, text) FROM service_role;
DROP FUNCTION IF EXISTS public.trivia_streak_freeze_purchase_v1(uuid, text);
DROP FUNCTION IF EXISTS public.trivia_post_settlement_review_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_monthly_championship_standings_v1(text, boolean, integer);
DROP FUNCTION IF EXISTS public.trivia_nightly_reminder_toggle_v1(uuid, uuid, boolean, text);
DROP FUNCTION IF EXISTS public.trivia_nightly_reminder_status_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_friend_challenge_accept_v1(uuid, text);
DROP FUNCTION IF EXISTS public.trivia_friend_challenge_cancel_v1(uuid, text);
DROP FUNCTION IF EXISTS public.trivia_friend_challenge_list_v1(uuid, integer);
DROP FUNCTION IF EXISTS public.trivia_friend_challenge_get_v1(text, uuid);
DROP FUNCTION IF EXISTS public.trivia_friend_challenge_create_v1(uuid, integer, integer);
DROP TABLE IF EXISTS public.trivia_nightly_reminders;
DROP TABLE IF EXISTS public.trivia_friend_challenges;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
