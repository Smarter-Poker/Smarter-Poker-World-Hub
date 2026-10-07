-- =============================================================================
-- 20261005234500_trivia_p12_legacy_tournament_reconciliation.sql
-- =============================================================================
-- TIER:         3 (immutable production-history reconciliation)
-- AUTHOR:       Codex / Trivia Phase 12
-- AFFECTS:      legacy Trivia tournament result snapshots and service-only DTO
-- IRREVERSIBLE: yes (captured evidence is append-only; rollback is forward-only)
--
-- WHY:
--   The legacy tournament tables predate participant_kind and the normalized
--   answer-free v2 result contract. Production has completed pre-v2 test events,
--   including one already quarantined 8-horse / 184-diamond evidence record.
--   Those rows must remain auditable without becoming public-season results and
--   without inventing a rank, payout, refund, or wallet movement.
--
-- HOW:
--   * snapshot every completed pre-v2 tournament and entrant without changing
--     the source tables;
--   * derive participant_kind from the authoritative profile identity at capture;
--   * classify quarantined evidence separately and mark every pre-v2 snapshot as
--     test-era / ineligible for public seasons;
--   * expose a versioned, answer-free DTO through one service-only function;
--   * freeze the snapshots against UPDATE, DELETE, and TRUNCATE.
--
-- MONEY:
--   This migration never calls a wallet or ledger function and never writes a
--   wallet, transaction, journal, settlement, rank, payout, or refund source row.
-- =============================================================================

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('trivia-p12-legacy-tournament-reconciliation', 0)
);

-- -----------------------------------------------------------------------------
-- 1. Pre-flight: fail closed on schema drift or ambiguous historical evidence.
-- -----------------------------------------------------------------------------
DO $preflight$
DECLARE
    v_legacy_settled_count bigint;
BEGIN
    IF pg_catalog.to_regclass('public.trivia_tournaments') IS NULL
       OR pg_catalog.to_regclass('public.trivia_tournament_entries') IS NULL
       OR pg_catalog.to_regclass('public.profiles') IS NULL
       OR pg_catalog.to_regclass('public.competitive_quarantine') IS NULL THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: required legacy tournament, profile, or quarantine table is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'trivia_tournaments'
           AND column_name = 'engine_version'
    ) OR NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'trivia_tournament_entries'
           AND column_name = 'rank'
    ) OR NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'trivia_tournament_entries'
           AND column_name = 'payout'
    ) OR NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'profiles'
           AND column_name = 'is_horse'
    ) THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: required Phase 1/6 reconciliation columns are missing';
    END IF;

    SELECT pg_catalog.count(*)
      INTO v_legacy_settled_count
      FROM public.trivia_tournaments AS tournament
     WHERE tournament.engine_version IS NULL
       AND tournament.status IN ('complete', 'completed');

    IF v_legacy_settled_count > 10000 THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: % legacy settled tournaments exceeds the bounded migration ceiling',
            v_legacy_settled_count;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_tournament_entries AS entry
          JOIN public.trivia_tournaments AS tournament ON tournament.id = entry.tournament_id
          LEFT JOIN public.profiles AS profile ON profile.id = entry.user_id
         WHERE tournament.engine_version IS NULL
           AND tournament.status IN ('complete', 'completed')
           AND (profile.id IS NULL OR profile.is_horse IS NULL)
    ) THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: a legacy settled entrant has no authoritative participant kind';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_tournament_entries AS entry
          JOIN public.trivia_tournaments AS tournament ON tournament.id = entry.tournament_id
         WHERE tournament.engine_version IS NULL
           AND tournament.status IN ('complete', 'completed')
           AND (
               entry.score < 0
               OR entry.correct_count < 0
               OR entry.time_spent < 0
               OR entry.payout < 0
               OR (entry.rank IS NULL AND entry.payout <> 0)
           )
    ) THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: legacy settled result fields are internally inconsistent';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.competitive_quarantine AS quarantine
          JOIN public.trivia_tournaments AS tournament
            ON tournament.id = quarantine.entity_id
          CROSS JOIN LATERAL (
              SELECT pg_catalog.count(*)::integer AS entry_count,
                     pg_catalog.count(*) FILTER (WHERE profile.is_horse IS TRUE)::integer AS horse_count,
                     pg_catalog.count(entry.rank)::integer AS ranked_count,
                     coalesce(pg_catalog.sum(entry.payout), 0)::bigint AS payout_total
                FROM public.trivia_tournament_entries AS entry
                LEFT JOIN public.profiles AS profile ON profile.id = entry.user_id
               WHERE entry.tournament_id = tournament.id
          ) AS audit
         WHERE quarantine.entity_type = 'trivia_tournament'
           AND quarantine.reason_code = 'legacy_8_horse_184_pool_unsettled'
           AND (
               tournament.engine_version IS NOT NULL
               OR tournament.status NOT IN ('complete', 'completed')
               OR tournament.prize_pool <> 184
               OR audit.entry_count <> 8
               OR audit.horse_count <> 8
               OR audit.ranked_count <> 0
               OR audit.payout_total <> 0
           )
    ) THEN
        RAISE EXCEPTION 'trivia_p12 pre-flight failed: quarantined 184-diamond evidence no longer matches its sealed invariant';
    END IF;
END
$preflight$;

-- -----------------------------------------------------------------------------
-- 2. Immutable reconciliation image. Source rows are referenced, never updated.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trivia_legacy_tournament_snapshots_v1 (
    tournament_id uuid PRIMARY KEY
        REFERENCES public.trivia_tournaments(id) ON DELETE RESTRICT,
    contract_version text NOT NULL
        CHECK (contract_version = 'trivia-legacy-tournament-results/1'),
    source_status text NOT NULL CHECK (source_status IN ('complete', 'completed')),
    source_name text NOT NULL,
    source_started_at timestamptz NOT NULL,
    source_completed_at timestamptz,
    source_created_at timestamptz NOT NULL,
    entry_fee integer NOT NULL CHECK (entry_fee >= 0),
    prize_pool integer NOT NULL CHECK (prize_pool >= 0),
    entry_count integer NOT NULL CHECK (entry_count >= 0),
    human_count integer NOT NULL CHECK (human_count >= 0),
    horse_count integer NOT NULL CHECK (horse_count >= 0),
    ranked_count integer NOT NULL CHECK (ranked_count >= 0),
    total_payout bigint NOT NULL CHECK (total_payout >= 0),
    classification text NOT NULL CHECK (classification IN ('test_era', 'quarantined')),
    public_season_eligible boolean NOT NULL DEFAULT false
        CHECK (public_season_eligible IS FALSE),
    exclusion_reason text NOT NULL CHECK (
        exclusion_reason IN ('pre_v2_test_event', 'legacy_8_horse_184_pool_unsettled')
    ),
    captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    CHECK (entry_count = human_count + horse_count),
    CHECK (ranked_count <= entry_count),
    CHECK (
        (classification = 'quarantined'
         AND exclusion_reason = 'legacy_8_horse_184_pool_unsettled')
        OR
        (classification = 'test_era'
         AND exclusion_reason = 'pre_v2_test_event')
    )
);

CREATE TABLE IF NOT EXISTS public.trivia_legacy_tournament_result_rows_v1 (
    tournament_id uuid NOT NULL
        REFERENCES public.trivia_legacy_tournament_snapshots_v1(tournament_id) ON DELETE RESTRICT,
    source_entry_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    participant_kind text NOT NULL CHECK (participant_kind IN ('human', 'horse')),
    display_name text NOT NULL CHECK (pg_catalog.length(display_name) BETWEEN 1 AND 80),
    final_rank integer CHECK (final_rank IS NULL OR final_rank >= 1),
    score integer NOT NULL CHECK (score >= 0),
    correct_count integer NOT NULL CHECK (correct_count >= 0),
    time_spent integer NOT NULL CHECK (time_spent >= 0),
    payout integer NOT NULL CHECK (payout >= 0),
    result_state text NOT NULL CHECK (result_state IN ('ranked', 'unranked_evidence')),
    captured_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    PRIMARY KEY (tournament_id, source_entry_id),
    UNIQUE (source_entry_id),
    CHECK ((result_state = 'ranked') = (final_rank IS NOT NULL)),
    CHECK (payout = 0 OR final_rank IS NOT NULL)
);

ALTER TABLE public.trivia_legacy_tournament_snapshots_v1 OWNER TO postgres;
ALTER TABLE public.trivia_legacy_tournament_result_rows_v1 OWNER TO postgres;

CREATE INDEX IF NOT EXISTS trivia_legacy_tournament_snapshots_v1_visibility_idx
    ON public.trivia_legacy_tournament_snapshots_v1
       (public_season_eligible, source_completed_at DESC, tournament_id);
CREATE INDEX IF NOT EXISTS trivia_legacy_tournament_result_rows_v1_rank_idx
    ON public.trivia_legacy_tournament_result_rows_v1
       (tournament_id, final_rank, source_entry_id);
CREATE INDEX IF NOT EXISTS trivia_legacy_tournament_result_rows_v1_kind_idx
    ON public.trivia_legacy_tournament_result_rows_v1
       (tournament_id, participant_kind, final_rank, source_entry_id);

WITH legacy_settled AS (
    SELECT tournament.id,
           tournament.status,
           tournament.name,
           tournament.start_time,
           tournament.completed_at,
           tournament.created_at,
           coalesce(tournament.entry_fee, 0)::integer AS entry_fee,
           coalesce(tournament.prize_pool, 0)::integer AS prize_pool,
           quarantine.reason_code,
           pg_catalog.count(entry.id)::integer AS entry_count,
           pg_catalog.count(*) FILTER (
               WHERE entry.id IS NOT NULL AND profile.is_horse IS FALSE
           )::integer AS human_count,
           pg_catalog.count(*) FILTER (
               WHERE entry.id IS NOT NULL AND profile.is_horse IS TRUE
           )::integer AS horse_count,
           pg_catalog.count(entry.rank)::integer AS ranked_count,
           coalesce(pg_catalog.sum(entry.payout), 0)::bigint AS total_payout
      FROM public.trivia_tournaments AS tournament
      LEFT JOIN public.trivia_tournament_entries AS entry
        ON entry.tournament_id = tournament.id
      LEFT JOIN public.profiles AS profile ON profile.id = entry.user_id
      LEFT JOIN public.competitive_quarantine AS quarantine
        ON quarantine.entity_type = 'trivia_tournament'
       AND quarantine.entity_id = tournament.id
     WHERE tournament.engine_version IS NULL
       AND tournament.status IN ('complete', 'completed')
     GROUP BY tournament.id, tournament.status, tournament.name,
              tournament.start_time, tournament.completed_at, tournament.created_at,
              tournament.entry_fee, tournament.prize_pool, quarantine.reason_code
)
INSERT INTO public.trivia_legacy_tournament_snapshots_v1 (
    tournament_id, contract_version, source_status, source_name,
    source_started_at, source_completed_at, source_created_at,
    entry_fee, prize_pool, entry_count, human_count, horse_count,
    ranked_count, total_payout, classification, public_season_eligible,
    exclusion_reason
)
SELECT legacy.id,
       'trivia-legacy-tournament-results/1',
       legacy.status,
       legacy.name,
       legacy.start_time,
       legacy.completed_at,
       legacy.created_at,
       legacy.entry_fee,
       legacy.prize_pool,
       legacy.entry_count,
       legacy.human_count,
       legacy.horse_count,
       legacy.ranked_count,
       legacy.total_payout,
       CASE WHEN legacy.reason_code = 'legacy_8_horse_184_pool_unsettled'
            THEN 'quarantined' ELSE 'test_era' END,
       false,
       CASE WHEN legacy.reason_code = 'legacy_8_horse_184_pool_unsettled'
            THEN 'legacy_8_horse_184_pool_unsettled' ELSE 'pre_v2_test_event' END
  FROM legacy_settled AS legacy
ON CONFLICT (tournament_id) DO NOTHING;

INSERT INTO public.trivia_legacy_tournament_result_rows_v1 (
    tournament_id, source_entry_id, participant_id, participant_kind,
    display_name, final_rank, score, correct_count, time_spent, payout,
    result_state
)
SELECT entry.tournament_id,
       entry.id,
       entry.user_id,
       CASE WHEN profile.is_horse IS TRUE THEN 'horse' ELSE 'human' END,
       pg_catalog.left(
           coalesce(
               nullif(pg_catalog.btrim(profile.display_name), ''),
               nullif(pg_catalog.btrim(profile.username), ''),
               'Player'
           ),
           80
       ),
       entry.rank,
       coalesce(entry.score, 0),
       coalesce(entry.correct_count, 0),
       coalesce(entry.time_spent, 0),
       coalesce(entry.payout, 0),
       CASE WHEN entry.rank IS NULL THEN 'unranked_evidence' ELSE 'ranked' END
  FROM public.trivia_tournament_entries AS entry
  JOIN public.trivia_tournaments AS tournament ON tournament.id = entry.tournament_id
  JOIN public.trivia_legacy_tournament_snapshots_v1 AS snapshot
    ON snapshot.tournament_id = tournament.id
  JOIN public.profiles AS profile ON profile.id = entry.user_id
 WHERE tournament.engine_version IS NULL
   AND tournament.status IN ('complete', 'completed')
ON CONFLICT (tournament_id, source_entry_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Freeze the evidence image and expose one answer-free service DTO.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    RAISE EXCEPTION 'trivia Phase 12 legacy tournament snapshots are immutable; ship a forward migration';
END
$function$;

ALTER FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_trivia_legacy_tournament_snapshots_v1_append_only
    ON public.trivia_legacy_tournament_snapshots_v1;
CREATE TRIGGER trg_trivia_legacy_tournament_snapshots_v1_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_legacy_tournament_snapshots_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_trivia_legacy_tournament_snapshots_v1_no_truncate
    ON public.trivia_legacy_tournament_snapshots_v1;
CREATE TRIGGER trg_trivia_legacy_tournament_snapshots_v1_no_truncate
    BEFORE TRUNCATE ON public.trivia_legacy_tournament_snapshots_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_trivia_legacy_tournament_result_rows_v1_append_only
    ON public.trivia_legacy_tournament_result_rows_v1;
CREATE TRIGGER trg_trivia_legacy_tournament_result_rows_v1_append_only
    BEFORE UPDATE OR DELETE ON public.trivia_legacy_tournament_result_rows_v1
    FOR EACH ROW EXECUTE FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation();

DROP TRIGGER IF EXISTS trg_trivia_legacy_tournament_result_rows_v1_no_truncate
    ON public.trivia_legacy_tournament_result_rows_v1;
CREATE TRIGGER trg_trivia_legacy_tournament_result_rows_v1_no_truncate
    BEFORE TRUNCATE ON public.trivia_legacy_tournament_result_rows_v1
    FOR EACH STATEMENT EXECUTE FUNCTION public.trivia_p12_forbid_legacy_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.trivia_legacy_tournament_results_v1(
    p_tournament_id uuid,
    p_offset integer DEFAULT 0,
    p_limit integer DEFAULT 50,
    p_kind text DEFAULT NULL,
    p_include_excluded boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
WITH params AS (
    SELECT greatest(coalesce(p_offset, 0), 0) AS result_offset,
           least(greatest(coalesce(p_limit, 50), 1), 200) AS result_limit,
           p_kind AS participant_kind,
           p_kind IS NULL OR p_kind IN ('human', 'horse') AS valid_kind
), any_snapshot AS (
    SELECT snapshot.*
      FROM public.trivia_legacy_tournament_snapshots_v1 AS snapshot
     WHERE snapshot.tournament_id = p_tournament_id
), visible_snapshot AS (
    SELECT snapshot.*
      FROM any_snapshot AS snapshot
     WHERE snapshot.public_season_eligible IS TRUE
        OR coalesce(p_include_excluded, false) IS TRUE
), filtered_results AS (
    SELECT result.*
      FROM public.trivia_legacy_tournament_result_rows_v1 AS result,
           params
     WHERE result.tournament_id = p_tournament_id
       AND (params.participant_kind IS NULL OR result.participant_kind = params.participant_kind)
)
SELECT CASE
    WHEN NOT (SELECT valid_kind FROM params) THEN
        pg_catalog.jsonb_build_object('success', false, 'error', 'invalid_participant_kind')
    WHEN NOT EXISTS (SELECT 1 FROM any_snapshot) THEN
        pg_catalog.jsonb_build_object('success', false, 'error', 'legacy_tournament_not_found')
    WHEN NOT EXISTS (SELECT 1 FROM visible_snapshot) THEN
        pg_catalog.jsonb_build_object(
            'success', false,
            'error', 'excluded_from_public_seasons',
            'tournamentId', p_tournament_id
        )
    ELSE (
        SELECT pg_catalog.jsonb_build_object(
            'success', true,
            'contract', snapshot.contract_version,
            'tournamentId', snapshot.tournament_id,
            'source', 'legacy-v1',
            'status', snapshot.source_status,
            'name', snapshot.source_name,
            'startedAt', snapshot.source_started_at,
            'completedAt', snapshot.source_completed_at,
            'entryFee', snapshot.entry_fee,
            'prizePool', snapshot.prize_pool,
            'entrantCount', snapshot.entry_count,
            'participantKinds', pg_catalog.jsonb_build_object(
                'human', snapshot.human_count,
                'horse', snapshot.horse_count
            ),
            'rankedCount', snapshot.ranked_count,
            'totalPayout', snapshot.total_payout,
            'classification', snapshot.classification,
            'publicSeasonEligible', snapshot.public_season_eligible,
            'exclusionReason', snapshot.exclusion_reason,
            'total', (SELECT pg_catalog.count(*) FROM filtered_results),
            'offset', (SELECT result_offset FROM params),
            'limit', (SELECT result_limit FROM params),
            'items', coalesce((
                SELECT pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                        'displayName', page.display_name,
                        'participantKind', page.participant_kind,
                        'rank', page.final_rank,
                        'score', page.score,
                        'correctCount', page.correct_count,
                        'timeSpent', page.time_spent,
                        'payout', page.payout,
                        'resultState', page.result_state
                    )
                    ORDER BY page.final_rank NULLS LAST, page.source_entry_id
                )
                  FROM (
                      SELECT result.*
                        FROM filtered_results AS result
                       ORDER BY result.final_rank NULLS LAST, result.source_entry_id
                       OFFSET (SELECT result_offset FROM params)
                       LIMIT (SELECT result_limit FROM params)
                  ) AS page
            ), '[]'::jsonb)
        )
          FROM visible_snapshot AS snapshot
    )
END
$function$;

ALTER FUNCTION public.trivia_legacy_tournament_results_v1(uuid, integer, integer, text, boolean)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trivia_legacy_tournament_results_v1(uuid, integer, integer, text, boolean)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_legacy_tournament_results_v1(uuid, integer, integer, text, boolean)
    TO service_role;

ALTER TABLE public.trivia_legacy_tournament_snapshots_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_legacy_tournament_snapshots_v1 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_legacy_tournament_result_rows_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trivia_legacy_tournament_result_rows_v1 FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.trivia_legacy_tournament_snapshots_v1
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.trivia_legacy_tournament_result_rows_v1
    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.trivia_legacy_tournament_snapshots_v1 IS
    'Immutable Phase 12 classification and aggregate snapshot for completed pre-v2 Trivia tournaments. All rows are excluded from public seasons.';
COMMENT ON TABLE public.trivia_legacy_tournament_result_rows_v1 IS
    'Immutable answer-free Phase 12 participant/result snapshot. Contains no question roster, option, answer, grading oracle, wallet mutation, or inferred settlement.';
COMMENT ON FUNCTION public.trivia_legacy_tournament_results_v1(uuid, integer, integer, text, boolean) IS
    'Service-only answer-free legacy result DTO. Excluded test/quarantine records require an explicit internal include flag.';

-- -----------------------------------------------------------------------------
-- 4. Post-apply assertions: source parity, preserved quarantine, ACL and freeze.
-- -----------------------------------------------------------------------------
DO $postapply$
DECLARE
    v_expected_tournaments bigint;
    v_expected_entries bigint;
    v_actual_tournaments bigint;
    v_actual_entries bigint;
    v_function_oid oid;
BEGIN
    SELECT pg_catalog.count(*)
      INTO v_expected_tournaments
      FROM public.trivia_tournaments AS tournament
     WHERE tournament.engine_version IS NULL
       AND tournament.status IN ('complete', 'completed');

    SELECT pg_catalog.count(*)
      INTO v_expected_entries
      FROM public.trivia_tournament_entries AS entry
      JOIN public.trivia_tournaments AS tournament ON tournament.id = entry.tournament_id
     WHERE tournament.engine_version IS NULL
       AND tournament.status IN ('complete', 'completed');

    SELECT pg_catalog.count(*) INTO v_actual_tournaments
      FROM public.trivia_legacy_tournament_snapshots_v1;
    SELECT pg_catalog.count(*) INTO v_actual_entries
      FROM public.trivia_legacy_tournament_result_rows_v1;

    IF v_actual_tournaments <> v_expected_tournaments
       OR v_actual_entries <> v_expected_entries THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: source/snapshot cardinality mismatch (%/% tournaments, %/% entries)',
            v_actual_tournaments, v_expected_tournaments, v_actual_entries, v_expected_entries;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_legacy_tournament_snapshots_v1 AS snapshot
          JOIN public.trivia_tournaments AS tournament ON tournament.id = snapshot.tournament_id
          CROSS JOIN LATERAL (
              SELECT pg_catalog.count(*)::integer AS entry_count,
                     pg_catalog.count(*) FILTER (WHERE profile.is_horse IS FALSE)::integer AS human_count,
                     pg_catalog.count(*) FILTER (WHERE profile.is_horse IS TRUE)::integer AS horse_count,
                     pg_catalog.count(entry.rank)::integer AS ranked_count,
                     coalesce(pg_catalog.sum(entry.payout), 0)::bigint AS payout_total
                FROM public.trivia_tournament_entries AS entry
                JOIN public.profiles AS profile ON profile.id = entry.user_id
               WHERE entry.tournament_id = tournament.id
          ) AS source
         WHERE snapshot.entry_count IS DISTINCT FROM source.entry_count
            OR snapshot.human_count IS DISTINCT FROM source.human_count
            OR snapshot.horse_count IS DISTINCT FROM source.horse_count
            OR snapshot.ranked_count IS DISTINCT FROM source.ranked_count
            OR snapshot.total_payout IS DISTINCT FROM source.payout_total
            OR snapshot.entry_fee IS DISTINCT FROM coalesce(tournament.entry_fee, 0)
            OR snapshot.prize_pool IS DISTINCT FROM coalesce(tournament.prize_pool, 0)
    ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: aggregate snapshot does not match immutable source evidence';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_legacy_tournament_result_rows_v1 AS result
          JOIN public.trivia_tournament_entries AS entry ON entry.id = result.source_entry_id
          JOIN public.profiles AS profile ON profile.id = entry.user_id
         WHERE result.tournament_id IS DISTINCT FROM entry.tournament_id
            OR result.participant_id IS DISTINCT FROM entry.user_id
            OR result.participant_kind IS DISTINCT FROM
               CASE WHEN profile.is_horse IS TRUE THEN 'horse' ELSE 'human' END
            OR result.final_rank IS DISTINCT FROM entry.rank
            OR result.score IS DISTINCT FROM coalesce(entry.score, 0)
            OR result.correct_count IS DISTINCT FROM coalesce(entry.correct_count, 0)
            OR result.time_spent IS DISTINCT FROM coalesce(entry.time_spent, 0)
            OR result.payout IS DISTINCT FROM coalesce(entry.payout, 0)
    ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: participant/result snapshot differs from source evidence';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_legacy_tournament_snapshots_v1 AS snapshot
          LEFT JOIN public.competitive_quarantine AS quarantine
            ON quarantine.entity_type = 'trivia_tournament'
           AND quarantine.entity_id = snapshot.tournament_id
         WHERE snapshot.public_season_eligible IS NOT FALSE
            OR snapshot.classification IS DISTINCT FROM
               CASE WHEN quarantine.reason_code = 'legacy_8_horse_184_pool_unsettled'
                    THEN 'quarantined' ELSE 'test_era' END
            OR snapshot.exclusion_reason IS DISTINCT FROM
               CASE WHEN quarantine.reason_code = 'legacy_8_horse_184_pool_unsettled'
                    THEN 'legacy_8_horse_184_pool_unsettled' ELSE 'pre_v2_test_event' END
    ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: public-season exclusion classification drifted';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.trivia_legacy_tournament_snapshots_v1 AS snapshot
         WHERE snapshot.classification = 'quarantined'
           AND (
               snapshot.prize_pool <> 184
               OR snapshot.entry_count <> 8
               OR snapshot.horse_count <> 8
               OR snapshot.human_count <> 0
               OR snapshot.ranked_count <> 0
               OR snapshot.total_payout <> 0
               OR EXISTS (
                   SELECT 1
                     FROM public.trivia_legacy_tournament_result_rows_v1 AS result
                    WHERE result.tournament_id = snapshot.tournament_id
                      AND (result.final_rank IS NOT NULL OR result.payout <> 0)
               )
           )
    ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: quarantined 184-diamond event was altered or inferred';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class AS relation
         WHERE relation.oid IN (
             'public.trivia_legacy_tournament_snapshots_v1'::pg_catalog.regclass,
             'public.trivia_legacy_tournament_result_rows_v1'::pg_catalog.regclass
         )
           AND (
               relation.relowner::pg_catalog.regrole::text <> 'postgres'
               OR relation.relrowsecurity IS NOT TRUE
               OR relation.relforcerowsecurity IS NOT TRUE
           )
    ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: snapshot owner/RLS contract is not sealed';
    END IF;

    IF pg_catalog.has_table_privilege('anon', 'public.trivia_legacy_tournament_snapshots_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.trivia_legacy_tournament_snapshots_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', 'public.trivia_legacy_tournament_snapshots_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('anon', 'public.trivia_legacy_tournament_result_rows_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('authenticated', 'public.trivia_legacy_tournament_result_rows_v1', 'SELECT')
       OR pg_catalog.has_table_privilege('service_role', 'public.trivia_legacy_tournament_result_rows_v1', 'SELECT') THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: direct application-table reads remain possible';
    END IF;

    IF (SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_trigger
         WHERE tgrelid IN (
             'public.trivia_legacy_tournament_snapshots_v1'::pg_catalog.regclass,
             'public.trivia_legacy_tournament_result_rows_v1'::pg_catalog.regclass
         )
           AND NOT tgisinternal
           AND tgname IN (
               'trg_trivia_legacy_tournament_snapshots_v1_append_only',
               'trg_trivia_legacy_tournament_snapshots_v1_no_truncate',
               'trg_trivia_legacy_tournament_result_rows_v1_append_only',
               'trg_trivia_legacy_tournament_result_rows_v1_no_truncate'
           )) <> 4 THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: immutable snapshot triggers are incomplete';
    END IF;

    v_function_oid := pg_catalog.to_regprocedure(
        'public.trivia_legacy_tournament_results_v1(uuid,integer,integer,text,boolean)'
    );
    IF v_function_oid IS NULL
       OR NOT pg_catalog.has_function_privilege(
           'service_role',
           'public.trivia_legacy_tournament_results_v1(uuid,integer,integer,text,boolean)',
           'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
           'anon',
           'public.trivia_legacy_tournament_results_v1(uuid,integer,integer,text,boolean)',
           'EXECUTE'
       )
       OR pg_catalog.has_function_privilege(
           'authenticated',
           'public.trivia_legacy_tournament_results_v1(uuid,integer,integer,text,boolean)',
           'EXECUTE'
       )
       OR NOT EXISTS (
           SELECT 1
             FROM pg_catalog.pg_proc AS procedure
            WHERE procedure.oid = v_function_oid
              AND procedure.prosecdef IS TRUE
              AND procedure.proowner::pg_catalog.regrole::text = 'postgres'
              AND 'search_path=""' = ANY(procedure.proconfig)
       ) THEN
        RAISE EXCEPTION 'trivia_p12 post-apply failed: service-only DTO authority is not sealed';
    END IF;
END
$postapply$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- ROLLBACK / FORWARD-FIX CONTRACT
-- =============================================================================
-- This reconciliation is intentionally irreversible. Never drop or rewrite the
-- source tables, snapshots, quarantine row, ranks, payouts, or audit history.
-- If a consumer must be withdrawn, ship a NEW migration that revokes EXECUTE on
-- trivia_legacy_tournament_results_v1 while retaining both snapshot tables. A
-- classification or DTO correction must be a new versioned table/function and
-- must preserve this v1 image. There is no wallet/ledger rollback because this
-- migration performs no wallet/ledger movement.
