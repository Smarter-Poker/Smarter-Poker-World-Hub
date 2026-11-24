-- =============================================================================
-- 20261124173600_trivia_club_private_tournaments.sql
-- =============================================================================
-- TIER:        2 (additive Club Arena x Trivia Private Club Nights authority)
-- AFFECTS:     public.trivia_club_tournaments,
--              public.trivia_club_tournament_entries,
--              public.trivia_club_tournament_create_v1,
--              public.trivia_club_tournament_list_v1,
--              public.trivia_club_tournament_join_v1,
--              public.trivia_club_tournament_cancel_v1
-- LOCKS:       ZERO locks on existing live tables (no FKs to public.clubs,
--              public.club_members, public.profiles, or auth.users; club and
--              membership authority is enforced atomically inside SECURITY
--              DEFINER RPCs).
-- FINANCIAL:   V1 enforces free-roll bragging-rights club nights only
--              (entry_fee = 0). Paid club escrow (> 0) fails closed until
--              wired to the balanced Phase 2 / Phase 6 trivia ledger journal.
-- IRREVERSIBLE: no (additive tables + functions; see FORWARD ROLLBACK below)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Pre-flight verification (read-only metadata checks; zero table locks)
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_missing text[] := '{}'::text[];
BEGIN
    IF to_regclass('public.clubs') IS NULL THEN v_missing := v_missing || 'clubs'; END IF;
    IF to_regclass('public.club_members') IS NULL THEN v_missing := v_missing || 'club_members'; END IF;
    IF to_regclass('public.profiles') IS NULL THEN v_missing := v_missing || 'profiles'; END IF;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'pre-flight failed: required tables missing: %', array_to_string(v_missing, ', ');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'owner_id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'clubs' AND column_name = 'lifecycle_status'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.clubs missing owner_id or lifecycle_status';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'club_members' AND column_name = 'membership_lifecycle_status'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'club_members' AND column_name = 'role'
    ) THEN
        RAISE EXCEPTION 'pre-flight failed: public.club_members missing role or membership_lifecycle_status';
    END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 2. Private Club Trivia Nights table (RLS enabled, zero direct browser writes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_club_tournaments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id uuid NOT NULL,
    host_user_id uuid NOT NULL,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 80),
    invite_code text NOT NULL UNIQUE CHECK (invite_code ~ '^[A-Z0-9]{8}$'),
    entry_fee integer NOT NULL DEFAULT 0 CHECK (entry_fee IN (0, 10, 25, 50)),
    max_players integer NOT NULL DEFAULT 64 CHECK (max_players BETWEEN 4 AND 256),
    question_count integer NOT NULL DEFAULT 10 CHECK (question_count IN (10, 20)),
    scheduled_start_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'registration' CHECK (status IN ('registration', 'live', 'settled', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournaments_club_start
    ON public.trivia_club_tournaments (club_id, scheduled_start_at DESC);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournaments_status_start
    ON public.trivia_club_tournaments (status, scheduled_start_at ASC);

ALTER TABLE public.trivia_club_tournaments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_club_tournaments FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Private Club Trivia Night entries (references only the new parent table)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_club_tournament_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    club_tournament_id uuid NOT NULL REFERENCES public.trivia_club_tournaments(id) ON DELETE CASCADE,
    user_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
    registered_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (club_tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournament_entries_user
    ON public.trivia_club_tournament_entries (user_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_trivia_club_tournament_entries_active
    ON public.trivia_club_tournament_entries (club_tournament_id)
    WHERE status = 'registered';

ALTER TABLE public.trivia_club_tournament_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trivia_club_tournament_entries FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. RPC: trivia_club_tournament_create_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_create_v1(
    p_host_user_id uuid,
    p_club_id uuid,
    p_title text,
    p_scheduled_start_at timestamptz,
    p_entry_fee integer DEFAULT 0,
    p_max_players integer DEFAULT 64,
    p_question_count integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_title text;
    v_entry_fee integer;
    v_max_players integer;
    v_question_count integer;
    v_club record;
    v_can_host boolean := false;
    v_active_count integer := 0;
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_digest bytea;
    v_code text;
    v_attempt integer;
    v_i integer;
    v_created public.trivia_club_tournaments%ROWTYPE;
    v_host_name text;
BEGIN
    IF p_host_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_id');
    END IF;

    v_title := pg_catalog.btrim(COALESCE(p_title, ''));
    IF pg_catalog.char_length(v_title) < 3 OR pg_catalog.char_length(v_title) > 80 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_title');
    END IF;

    v_entry_fee := COALESCE(p_entry_fee, 0);
    IF v_entry_fee NOT IN (0, 10, 25, 50) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_entry_fee');
    END IF;
    -- Ironclad Phase 2/6 financial safeguard: never accept or deduct diamonds
    -- without a balanced trivia_ledger_debit / escrow journal. V1 supports
    -- free-roll bragging-rights club nights (entry_fee = 0) only.
    IF v_entry_fee <> 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'paid_club_escrow_not_enabled',
            'message', 'Private Club Trivia Nights V1 Supports Free-Roll Bragging-Rights Events Only (0 Diamonds).'
        );
    END IF;

    v_max_players := COALESCE(p_max_players, 64);
    IF v_max_players < 4 OR v_max_players > 256 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_max_players');
    END IF;

    v_question_count := COALESCE(p_question_count, 10);
    IF v_question_count NOT IN (10, 20) THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_question_count');
    END IF;

    IF p_scheduled_start_at IS NULL OR p_scheduled_start_at <= now() + interval '2 minutes' THEN
        RETURN jsonb_build_object('success', false, 'error', 'scheduled_start_must_be_future');
    END IF;
    IF p_scheduled_start_at > now() + interval '30 days' THEN
        RETURN jsonb_build_object('success', false, 'error', 'scheduled_start_too_far');
    END IF;

    SELECT c.id, c.name, c.club_id, c.owner_id, c.lifecycle_status, COALESCE(c.status, 'active') AS status
      INTO v_club
      FROM public.clubs c
     WHERE c.id = p_club_id;

    IF NOT FOUND OR v_club.lifecycle_status IS DISTINCT FROM 'active' OR v_club.status IS DISTINCT FROM 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_not_found');
    END IF;

    IF v_club.owner_id = p_host_user_id THEN
        v_can_host := true;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.club_members cm
             WHERE cm.club_id = p_club_id
               AND cm.user_id = p_host_user_id
               AND cm.membership_lifecycle_status = 'active'
               AND COALESCE(cm.is_active, true) = true
               AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
               AND cm.role IN ('owner', 'co_owner', 'admin')
        ) INTO v_can_host;
    END IF;

    IF NOT v_can_host THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_host_forbidden');
    END IF;

    SELECT count(*)::integer
      INTO v_active_count
      FROM public.trivia_club_tournaments t
     WHERE t.club_id = p_club_id
       AND t.status = 'registration'
       AND t.scheduled_start_at > now();

    IF v_active_count >= 10 THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_active_limit_reached');
    END IF;

    FOR v_attempt IN 1..12 LOOP
        v_digest := pg_catalog.decode(
            pg_catalog.md5(pg_catalog.gen_random_uuid()::text || pg_catalog.clock_timestamp()::text || v_attempt::text),
            'hex'
        );
        v_code := '';
        FOR v_i IN 0..7 LOOP
            v_code := v_code || pg_catalog.substr(v_alphabet, (pg_catalog.get_byte(v_digest, v_i) % 32) + 1, 1);
        END LOOP;

        BEGIN
            INSERT INTO public.trivia_club_tournaments (
                club_id,
                host_user_id,
                title,
                invite_code,
                entry_fee,
                max_players,
                question_count,
                scheduled_start_at,
                status
            ) VALUES (
                p_club_id,
                p_host_user_id,
                v_title,
                v_code,
                v_entry_fee,
                v_max_players,
                v_question_count,
                p_scheduled_start_at,
                'registration'
            )
            RETURNING * INTO v_created;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            IF v_attempt = 12 THEN
                RETURN jsonb_build_object('success', false, 'error', 'invite_code_generation_failed');
            END IF;
        END;
    END LOOP;

    SELECT COALESCE(
        NULLIF(pg_catalog.btrim(p.username), ''),
        NULLIF(pg_catalog.btrim(p.display_name), ''),
        NULLIF(pg_catalog.btrim(p.full_name), ''),
        'Club Host'
    )
      INTO v_host_name
      FROM public.profiles p
     WHERE p.id = p_host_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'tournament', jsonb_build_object(
            'id', v_created.id,
            'clubId', v_created.club_id,
            'clubName', v_club.name,
            'clubCode', v_club.club_id,
            'hostUserId', v_created.host_user_id,
            'hostDisplayName', COALESCE(v_host_name, 'Club Host'),
            'title', v_created.title,
            'inviteCode', v_created.invite_code,
            'entryFee', v_created.entry_fee,
            'maxPlayers', v_created.max_players,
            'questionCount', v_created.question_count,
            'scheduledStartAt', v_created.scheduled_start_at,
            'status', v_created.status,
            'entrantCount', 0,
            'viewerRegistered', false,
            'viewerCanManage', true,
            'createdAt', v_created.created_at
        )
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 5. RPC: trivia_club_tournament_list_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_list_v1(
    p_user_id uuid,
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_limit integer;
    v_clubs jsonb;
    v_items jsonb;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;

    v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

    WITH eligible_clubs AS (
        SELECT
            c.id,
            c.name,
            c.club_id AS club_code,
            COALESCE(c.avatar_url, c.logo_url) AS avatar_url,
            CASE
                WHEN c.owner_id = p_user_id THEN 'owner'
                ELSE COALESCE(cm.role, 'player')
            END AS role,
            (
                c.owner_id = p_user_id
                OR COALESCE(cm.role, 'player') IN ('owner', 'co_owner', 'admin')
            ) AS can_host
        FROM public.clubs c
        LEFT JOIN public.club_members cm
          ON cm.club_id = c.id
         AND cm.user_id = p_user_id
         AND cm.membership_lifecycle_status = 'active'
         AND COALESCE(cm.is_active, true) = true
         AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
        WHERE c.lifecycle_status = 'active'
          AND COALESCE(c.status, 'active') = 'active'
          AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ec.id,
                'name', ec.name,
                'clubCode', ec.club_code,
                'avatarUrl', ec.avatar_url,
                'role', ec.role,
                'canHost', ec.can_host
            )
            ORDER BY ec.can_host DESC, ec.name ASC
        ),
        '[]'::jsonb
    )
      INTO v_clubs
      FROM eligible_clubs ec;

    WITH eligible_clubs AS (
        SELECT
            c.id,
            c.name,
            c.club_id AS club_code,
            (
                c.owner_id = p_user_id
                OR COALESCE(cm.role, 'player') IN ('owner', 'co_owner', 'admin')
            ) AS can_host
        FROM public.clubs c
        LEFT JOIN public.club_members cm
          ON cm.club_id = c.id
         AND cm.user_id = p_user_id
         AND cm.membership_lifecycle_status = 'active'
         AND COALESCE(cm.is_active, true) = true
         AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
        WHERE c.lifecycle_status = 'active'
          AND COALESCE(c.status, 'active') = 'active'
          AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ),
    ranked_tournaments AS (
        SELECT
            t.id,
            t.club_id,
            ec.name AS club_name,
            ec.club_code,
            t.host_user_id,
            COALESCE(
                NULLIF(pg_catalog.btrim(p.username), ''),
                NULLIF(pg_catalog.btrim(p.display_name), ''),
                NULLIF(pg_catalog.btrim(p.full_name), ''),
                'Club Host'
            ) AS host_display_name,
            t.title,
            t.invite_code,
            t.entry_fee,
            t.max_players,
            t.question_count,
            t.scheduled_start_at,
            t.status,
            t.created_at,
            COALESCE(ec_counts.entrant_count, 0) AS entrant_count,
            EXISTS (
                SELECT 1
                  FROM public.trivia_club_tournament_entries ve
                 WHERE ve.club_tournament_id = t.id
                   AND ve.user_id = p_user_id
                   AND ve.status = 'registered'
            ) AS viewer_registered,
            (t.host_user_id = p_user_id OR ec.can_host) AS viewer_can_manage
        FROM public.trivia_club_tournaments t
        JOIN eligible_clubs ec ON ec.id = t.club_id
        LEFT JOIN public.profiles p ON p.id = t.host_user_id
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS entrant_count
              FROM public.trivia_club_tournament_entries e
             WHERE e.club_tournament_id = t.id
               AND e.status = 'registered'
        ) ec_counts ON true
        WHERE t.status IN ('registration', 'live')
           OR t.scheduled_start_at >= now() - interval '14 days'
        ORDER BY
            CASE t.status
                WHEN 'live' THEN 0
                WHEN 'registration' THEN 1
                WHEN 'settled' THEN 2
                ELSE 3
            END ASC,
            t.scheduled_start_at ASC,
            t.created_at DESC
        LIMIT v_limit
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', rt.id,
                'clubId', rt.club_id,
                'clubName', rt.club_name,
                'clubCode', rt.club_code,
                'hostUserId', rt.host_user_id,
                'hostDisplayName', rt.host_display_name,
                'title', rt.title,
                'inviteCode', rt.invite_code,
                'entryFee', rt.entry_fee,
                'maxPlayers', rt.max_players,
                'questionCount', rt.question_count,
                'scheduledStartAt', rt.scheduled_start_at,
                'status', rt.status,
                'entrantCount', rt.entrant_count,
                'viewerRegistered', rt.viewer_registered,
                'viewerCanManage', rt.viewer_can_manage,
                'createdAt', rt.created_at
            )
        ),
        '[]'::jsonb
    )
      INTO v_items
      FROM ranked_tournaments rt;

    RETURN jsonb_build_object(
        'success', true,
        'financialMode', 'freeroll_v1',
        'clubs', COALESCE(v_clubs, '[]'::jsonb),
        'items', COALESCE(v_items, '[]'::jsonb)
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 6. RPC: trivia_club_tournament_join_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_join_v1(
    p_user_id uuid,
    p_club_tournament_id uuid,
    p_action text DEFAULT 'join'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_action text;
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_is_member boolean := false;
    v_existing_status text;
    v_entrant_count integer := 0;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    v_action := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_action, 'join')));
    IF v_action NOT IN ('join', 'leave') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    -- Zero-diamond financial invariant: never settle or deduct paid entry fees
    -- outside the balanced Phase 2/6 ledger journal.
    IF v_tournament.entry_fee <> 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'paid_club_escrow_not_enabled');
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM public.clubs c
          LEFT JOIN public.club_members cm
            ON cm.club_id = c.id
           AND cm.user_id = p_user_id
           AND cm.membership_lifecycle_status = 'active'
           AND COALESCE(cm.is_active, true) = true
           AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
         WHERE c.id = v_tournament.club_id
           AND c.lifecycle_status = 'active'
           AND COALESCE(c.status, 'active') = 'active'
           AND (c.owner_id = p_user_id OR cm.user_id IS NOT NULL)
    ) INTO v_is_member;

    IF NOT v_is_member THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_membership_required');
    END IF;

    IF v_tournament.status <> 'registration' THEN
        RETURN jsonb_build_object('success', false, 'error', 'tournament_not_in_registration');
    END IF;

    SELECT e.status
      INTO v_existing_status
      FROM public.trivia_club_tournament_entries e
     WHERE e.club_tournament_id = p_club_tournament_id
       AND e.user_id = p_user_id;

    IF v_action = 'join' THEN
        IF v_tournament.scheduled_start_at <= now() THEN
            RETURN jsonb_build_object('success', false, 'error', 'registration_closed');
        END IF;

        IF v_existing_status = 'registered' THEN
            SELECT count(*)::integer
              INTO v_entrant_count
              FROM public.trivia_club_tournament_entries e
             WHERE e.club_tournament_id = p_club_tournament_id
               AND e.status = 'registered';

            RETURN jsonb_build_object(
                'success', true,
                'action', 'join',
                'alreadyRegistered', true,
                'clubTournamentId', p_club_tournament_id,
                'viewerRegistered', true,
                'entrantCount', v_entrant_count,
                'maxPlayers', v_tournament.max_players
            );
        END IF;

        SELECT count(*)::integer
          INTO v_entrant_count
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.status = 'registered';

        IF v_entrant_count >= v_tournament.max_players THEN
            RETURN jsonb_build_object('success', false, 'error', 'tournament_full');
        END IF;

        INSERT INTO public.trivia_club_tournament_entries (
            club_tournament_id,
            user_id,
            status,
            registered_at,
            updated_at
        ) VALUES (
            p_club_tournament_id,
            p_user_id,
            'registered',
            now(),
            now()
        )
        ON CONFLICT (club_tournament_id, user_id)
        DO UPDATE SET
            status = 'registered',
            registered_at = now(),
            updated_at = now();

        SELECT count(*)::integer
          INTO v_entrant_count
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.status = 'registered';

        RETURN jsonb_build_object(
            'success', true,
            'action', 'join',
            'alreadyRegistered', false,
            'clubTournamentId', p_club_tournament_id,
            'viewerRegistered', true,
            'entrantCount', v_entrant_count,
            'maxPlayers', v_tournament.max_players
        );
    ELSE
        UPDATE public.trivia_club_tournament_entries
           SET status = 'cancelled',
               updated_at = now()
         WHERE club_tournament_id = p_club_tournament_id
           AND user_id = p_user_id
           AND status = 'registered';

        SELECT count(*)::integer
          INTO v_entrant_count
          FROM public.trivia_club_tournament_entries e
         WHERE e.club_tournament_id = p_club_tournament_id
           AND e.status = 'registered';

        RETURN jsonb_build_object(
            'success', true,
            'action', 'leave',
            'alreadyWithdrawn', (v_existing_status IS NULL OR v_existing_status = 'cancelled'),
            'clubTournamentId', p_club_tournament_id,
            'viewerRegistered', false,
            'entrantCount', v_entrant_count,
            'maxPlayers', v_tournament.max_players
        );
    END IF;
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 7. RPC: trivia_club_tournament_cancel_v1
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_club_tournament_cancel_v1(
    p_host_user_id uuid,
    p_club_tournament_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_tournament public.trivia_club_tournaments%ROWTYPE;
    v_can_cancel boolean := false;
    v_cancelled_entries integer := 0;
BEGIN
    IF p_host_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'authentication_required');
    END IF;
    IF p_club_tournament_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_club_tournament_id');
    END IF;

    SELECT *
      INTO v_tournament
      FROM public.trivia_club_tournaments t
     WHERE t.id = p_club_tournament_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_tournament_not_found');
    END IF;

    IF v_tournament.host_user_id = p_host_user_id THEN
        v_can_cancel := true;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.clubs c
              LEFT JOIN public.club_members cm
                ON cm.club_id = c.id
               AND cm.user_id = p_host_user_id
               AND cm.membership_lifecycle_status = 'active'
               AND COALESCE(cm.is_active, true) = true
               AND COALESCE(cm.status, 'active') IN ('active', 'approved', 'automatic')
               AND cm.role IN ('owner', 'co_owner', 'admin')
             WHERE c.id = v_tournament.club_id
               AND (c.owner_id = p_host_user_id OR cm.user_id IS NOT NULL)
        ) INTO v_can_cancel;
    END IF;

    IF NOT v_can_cancel THEN
        RETURN jsonb_build_object('success', false, 'error', 'club_host_forbidden');
    END IF;

    IF v_tournament.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', true,
            'alreadyCancelled', true,
            'clubTournamentId', p_club_tournament_id,
            'status', 'cancelled',
            'cancelledEntriesCount', 0
        );
    END IF;

    IF v_tournament.status <> 'registration' THEN
        RETURN jsonb_build_object('success', false, 'error', 'cannot_cancel_started_tournament');
    END IF;

    UPDATE public.trivia_club_tournaments
       SET status = 'cancelled',
           updated_at = now()
     WHERE id = p_club_tournament_id;

    UPDATE public.trivia_club_tournament_entries
       SET status = 'cancelled',
           updated_at = now()
     WHERE club_tournament_id = p_club_tournament_id
       AND status = 'registered';

    GET DIAGNOSTICS v_cancelled_entries = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'alreadyCancelled', false,
        'clubTournamentId', p_club_tournament_id,
        'status', 'cancelled',
        'cancelledEntriesCount', v_cancelled_entries
    );
END;
$fn$;

-- -----------------------------------------------------------------------------
-- 8. Explicit function ACLs ({postgres=X/postgres,service_role=X/postgres})
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.trivia_club_tournament_create_v1(uuid, uuid, text, timestamptz, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_create_v1(uuid, uuid, text, timestamptz, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_list_v1(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_list_v1(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_join_v1(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_join_v1(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.trivia_club_tournament_cancel_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trivia_club_tournament_cancel_v1(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. Postconditions
-- -----------------------------------------------------------------------------
DO $postconditions$
DECLARE
    v_fn regprocedure;
    v_tbl regclass;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY[
        'public.trivia_club_tournaments'::regclass,
        'public.trivia_club_tournament_entries'::regclass
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
        'public.trivia_club_tournament_create_v1(uuid,uuid,text,timestamptz,integer,integer,integer)'::regprocedure,
        'public.trivia_club_tournament_list_v1(uuid,integer)'::regprocedure,
        'public.trivia_club_tournament_join_v1(uuid,uuid,text)'::regprocedure,
        'public.trivia_club_tournament_cancel_v1(uuid,uuid)'::regprocedure
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
REVOKE ALL ON FUNCTION public.trivia_club_tournament_cancel_v1(uuid, uuid) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_join_v1(uuid, uuid, text) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_list_v1(uuid, integer) FROM service_role;
REVOKE ALL ON FUNCTION public.trivia_club_tournament_create_v1(uuid, uuid, text, timestamptz, integer, integer, integer) FROM service_role;
DROP FUNCTION IF EXISTS public.trivia_club_tournament_cancel_v1(uuid, uuid);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_join_v1(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_list_v1(uuid, integer);
DROP FUNCTION IF EXISTS public.trivia_club_tournament_create_v1(uuid, uuid, text, timestamptz, integer, integer, integer);
DROP TABLE IF EXISTS public.trivia_club_tournament_entries;
DROP TABLE IF EXISTS public.trivia_club_tournaments;
NOTIFY pgrst, 'reload schema';
COMMIT;
*/
