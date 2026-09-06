-- 20260906101639_ca_phase5_integrity_cases_and_review_queue.sql
--
-- World Hub does not contain scripts/new-migration.mjs. This version was reserved
-- by an equivalent collision-aware Node algorithm against this tree, origin/main,
-- every fetched ref and its migration history, and every sibling World Hub worktree.
-- It selected the first free UTC second, 20260906101639, after 0 collision bump(s).
--
-- WHAT THIS CHANGES, AND WHY:
-- Phase 5 integrity cases, append-only evidence, sanction decisions, honest detector
-- health, and a grouped queue that ranks money-flow evidence ahead of timing-only
-- evidence without excluding horses.

BEGIN;

SET LOCAL lock_timeout = '3s';

-- A sorted, duplicate-free subject list gives one canonical representation for
-- a case. It also lets a GIN containment lookup find a pair without teaching the
-- case which participant was called A by a detector.
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_normalize_subjects(p_subject_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT array_agg(DISTINCT x ORDER BY x)
    FROM unnest(p_subject_ids) AS u(x)
   WHERE x IS NOT NULL;
$fn$;

CREATE TABLE IF NOT EXISTS public.ca_integrity_cases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_ids       uuid[] NOT NULL,
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'open',
  severity          text NOT NULL DEFAULT 'medium',
  opened_by         uuid NOT NULL,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  assigned_to       uuid,
  decision          text,
  decision_note     text,
  decided_by        uuid,
  decided_at        timestamptz,
  closed_by         uuid,
  closed_at         timestamptz,
  close_note        text,
  open_op_id        text NOT NULL,
  open_payload_hash text NOT NULL,
  version           integer NOT NULL DEFAULT 1,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ca_integrity_cases_subjects_bounded CHECK (
    cardinality(subject_ids) BETWEEN 1 AND 32
    AND subject_ids = public.fn_ca_integrity_normalize_subjects(subject_ids)
  ),
  CONSTRAINT ca_integrity_cases_kind_known CHECK (
    kind IN ('collusion', 'chip_dumping', 'multi_accounting', 'bot_or_rta', 'abuse', 'other')
  ),
  CONSTRAINT ca_integrity_cases_status_known CHECK (
    status IN ('open', 'investigating', 'decided', 'closed')
  ),
  CONSTRAINT ca_integrity_cases_severity_known CHECK (
    severity IN ('low', 'medium', 'high')
  ),
  CONSTRAINT ca_integrity_cases_decision_known CHECK (
    decision IS NULL OR decision IN ('no_action', 'warned', 'restricted', 'confiscated')
  ),
  CONSTRAINT ca_integrity_cases_decision_complete CHECK (
    (decision IS NULL AND decision_note IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR
    (decision IS NOT NULL AND decision_note IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT ca_integrity_cases_status_matches_decision CHECK (
    (status IN ('open', 'investigating') AND decision IS NULL)
    OR
    (status IN ('decided', 'closed') AND decision IS NOT NULL)
  ),
  CONSTRAINT ca_integrity_cases_close_complete CHECK (
    (status <> 'closed' AND closed_by IS NULL AND closed_at IS NULL AND close_note IS NULL)
    OR
    (status = 'closed' AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND close_note IS NOT NULL)
  ),
  CONSTRAINT ca_integrity_cases_version_positive CHECK (version > 0),
  CONSTRAINT ca_integrity_cases_open_op_bounded CHECK (
    length(btrim(open_op_id)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ca_integrity_cases_decision_note_bounded CHECK (
    decision_note IS NULL OR length(decision_note) BETWEEN 1 AND 4000
  ),
  CONSTRAINT ca_integrity_cases_close_note_bounded CHECK (
    close_note IS NULL OR length(close_note) BETWEEN 1 AND 4000
  )
);

COMMENT ON TABLE public.ca_integrity_cases IS
  'Stable Admin Phase 5 cases. A detector never opens or decides one. subject_ids includes horses and humans under the same rules.';

CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_cases_open_op_uq
  ON public.ca_integrity_cases (open_op_id);
CREATE INDEX IF NOT EXISTS ca_integrity_cases_active_queue_idx
  ON public.ca_integrity_cases (status, severity, opened_at DESC, id);
CREATE INDEX IF NOT EXISTS ca_integrity_cases_assignee_idx
  ON public.ca_integrity_cases (assigned_to, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ca_integrity_cases_subjects_gin
  ON public.ca_integrity_cases USING gin (subject_ids);

CREATE TABLE IF NOT EXISTS public.ca_integrity_case_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            uuid NOT NULL REFERENCES public.ca_integrity_cases(id) ON DELETE RESTRICT,
  item_type          text NOT NULL,
  item_ref           text,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_hash      text NOT NULL,
  added_by           uuid NOT NULL,
  added_at           timestamptz NOT NULL DEFAULT now(),
  op_id              text NOT NULL,
  payload_hash       text NOT NULL,
  retracts_item_id   uuid REFERENCES public.ca_integrity_case_items(id) ON DELETE RESTRICT,
  retraction_reason  text,
  CONSTRAINT ca_integrity_case_items_type_known CHECK (
    item_type IN (
      'collusion_row', 'collusion_signal', 'flag', 'hand', 'restriction',
      'note', 'observation', 'pair_snapshot', 'retraction', 'assignment',
      'decision', 'closure', 'sanction'
    )
  ),
  CONSTRAINT ca_integrity_case_items_ref_shape CHECK (
    (item_type IN ('note', 'pair_snapshot', 'assignment', 'decision', 'closure', 'sanction') AND item_ref IS NULL)
    OR
    (item_type IN ('collusion_row', 'collusion_signal', 'flag', 'hand', 'restriction', 'observation') AND item_ref IS NOT NULL)
    OR
    (item_type = 'retraction' AND item_ref IS NOT NULL)
  ),
  CONSTRAINT ca_integrity_case_items_retraction_shape CHECK (
    (item_type = 'retraction' AND retracts_item_id IS NOT NULL
      AND retraction_reason IS NOT NULL AND length(retraction_reason) BETWEEN 1 AND 2000)
    OR
    (item_type <> 'retraction' AND retracts_item_id IS NULL AND retraction_reason IS NULL)
  ),
  CONSTRAINT ca_integrity_case_items_op_bounded CHECK (
    length(btrim(op_id)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ca_integrity_case_items_detail_bounded CHECK (
    octet_length(detail::text) <= 524288
  )
);

COMMENT ON TABLE public.ca_integrity_case_items IS
  'Immutable case evidence and case-history events. A correction is a new retraction row; UPDATE and DELETE are rejected.';

CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_case_items_op_uq
  ON public.ca_integrity_case_items (op_id);
CREATE INDEX IF NOT EXISTS ca_integrity_case_items_case_time_idx
  ON public.ca_integrity_case_items (case_id, added_at, id);
CREATE INDEX IF NOT EXISTS ca_integrity_case_items_source_idx
  ON public.ca_integrity_case_items (item_type, item_ref);
CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_case_items_source_once_uq
  ON public.ca_integrity_case_items (case_id, item_type, item_ref)
  WHERE item_ref IS NOT NULL AND item_type <> 'retraction';
CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_case_items_one_retraction_uq
  ON public.ca_integrity_case_items (retracts_item_id)
  WHERE retracts_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_item_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'INTEGRITY_EVIDENCE_IMMUTABLE: append a retraction row instead';
END;
$fn$;

DROP TRIGGER IF EXISTS ca_integrity_case_items_immutable ON public.ca_integrity_case_items;
CREATE TRIGGER ca_integrity_case_items_immutable
  BEFORE UPDATE OR DELETE ON public.ca_integrity_case_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_ca_integrity_case_item_immutable();

CREATE TABLE IF NOT EXISTS public.ca_integrity_sanctions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id              uuid NOT NULL REFERENCES public.ca_integrity_cases(id) ON DELETE RESTRICT,
  subject_id           uuid NOT NULL,
  kind                 text NOT NULL,
  state                text NOT NULL,
  amount               numeric(20,2),
  asset                text,
  restriction_id       uuid REFERENCES public.ca_player_restrictions(id) ON DELETE RESTRICT,
  approval_id          uuid REFERENCES public.ca_operator_approvals(id) ON DELETE RESTRICT,
  money_operation_id   text,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash         text NOT NULL,
  proposed_by          uuid NOT NULL,
  proposed_at          timestamptz NOT NULL DEFAULT now(),
  applied_by           uuid,
  applied_at           timestamptz,
  reversed_by          uuid,
  reversed_at          timestamptz,
  reversal_reason      text,
  note                 text,
  op_id                text NOT NULL,
  CONSTRAINT ca_integrity_sanctions_kind_known CHECK (
    kind IN ('warning', 'restriction', 'confiscation')
  ),
  CONSTRAINT ca_integrity_sanctions_state_known CHECK (
    state IN ('proposed', 'pending_approval', 'approved', 'applied', 'reversed', 'failed')
  ),
  CONSTRAINT ca_integrity_sanctions_money_shape CHECK (
    (kind = 'confiscation' AND amount IS NOT NULL AND amount > 0 AND asset IS NOT NULL)
    OR
    (kind <> 'confiscation' AND amount IS NULL AND asset IS NULL)
  ),
  CONSTRAINT ca_integrity_sanctions_restriction_shape CHECK (
    (kind = 'restriction' AND restriction_id IS NOT NULL)
    OR
    (kind <> 'restriction' AND restriction_id IS NULL)
  ),
  CONSTRAINT ca_integrity_sanctions_approval_shape CHECK (
    kind <> 'confiscation' OR approval_id IS NOT NULL
  ),
  CONSTRAINT ca_integrity_sanctions_applied_shape CHECK (
    (state IN ('applied', 'reversed') AND applied_by IS NOT NULL AND applied_at IS NOT NULL)
    OR
    (state NOT IN ('applied', 'reversed') AND applied_by IS NULL AND applied_at IS NULL)
  ),
  CONSTRAINT ca_integrity_sanctions_reversal_shape CHECK (
    (state = 'reversed' AND reversed_by IS NOT NULL AND reversed_at IS NOT NULL
      AND reversal_reason IS NOT NULL)
    OR
    (state <> 'reversed' AND reversed_by IS NULL AND reversed_at IS NULL
      AND reversal_reason IS NULL)
  ),
  CONSTRAINT ca_integrity_sanctions_op_bounded CHECK (
    length(btrim(op_id)) BETWEEN 8 AND 200
  ),
  CONSTRAINT ca_integrity_sanctions_note_bounded CHECK (
    note IS NULL OR length(note) BETWEEN 1 AND 4000
  )
);

COMMENT ON TABLE public.ca_integrity_sanctions IS
  'Append-only sanction decision ledger. Confiscation is recorded as approved but never applied here; this migration contains no chip movement.';

CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_sanctions_op_uq
  ON public.ca_integrity_sanctions (op_id);
CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_sanctions_approval_uq
  ON public.ca_integrity_sanctions (approval_id) WHERE approval_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_sanctions_restriction_uq
  ON public.ca_integrity_sanctions (restriction_id) WHERE restriction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_integrity_sanctions_money_operation_uq
  ON public.ca_integrity_sanctions (money_operation_id) WHERE money_operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ca_integrity_sanctions_case_time_idx
  ON public.ca_integrity_sanctions (case_id, proposed_at DESC, id);
CREATE INDEX IF NOT EXISTS ca_integrity_sanctions_subject_time_idx
  ON public.ca_integrity_sanctions (subject_id, proposed_at DESC, id);

ALTER TABLE public.ca_integrity_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_integrity_case_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ca_integrity_sanctions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ca_integrity_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_integrity_case_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ca_integrity_sanctions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ca_integrity_cases TO service_role;
GRANT SELECT, INSERT ON TABLE public.ca_integrity_case_items TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ca_integrity_sanctions TO service_role;

-- Existing source tables are large and continuously written. A lock wait is
-- bounded and index creation failure leaves an honest but slower queue rather
-- than blocking the detector or aborting the additive schema.
DO $indexes$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_collusion_tracking_open_canonical '
      || 'ON public.collusion_tracking '
      || '((least(player_a, player_b)), (greatest(player_a, player_b)), pattern_type, window_end DESC) '
      || 'INCLUDE (id, suspicion_score, created_at) '
      || 'WHERE status = ''open'' AND player_b IS NOT NULL';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'idx_collusion_tracking_open_canonical not created: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ca_collusion_signals_canonical '
      || 'ON public.ca_collusion_signals '
      || '((least(user_a, user_b)), (greatest(user_a, user_b)), detected_at DESC) '
      || 'INCLUDE (id, window_days, hands_together, gross_flow, net_flow, direction_ratio, both_cert)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'idx_ca_collusion_signals_canonical not created: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_anti_cheat_flags_open_review '
      || 'ON public.anti_cheat_flags (severity, flagged_at DESC, id) '
      || 'WHERE status = ''open''';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'idx_anti_cheat_flags_open_review not created: %', SQLERRM;
  END;
END
$indexes$;

-- JSON action fields have changed names over time. These parsers fail closed
-- on one malformed action rather than failing the whole bounded timing sample.
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_action_user(p_action jsonb)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text;
BEGIN
  v := coalesce(p_action ->> 'user_id', p_action ->> 'userId',
                p_action ->> 'player_id', p_action ->> 'playerId');
  IF v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v::uuid;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_action_time(p_action jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v text;
  n numeric;
BEGIN
  v := coalesce(p_action ->> 'timestamp', p_action ->> 'ts',
                p_action ->> 'time', p_action ->> 'created_at');
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  IF v ~ '^[0-9]+([.][0-9]+)?$' THEN
    n := v::numeric;
    RETURN to_timestamp(CASE WHEN n > 100000000000 THEN n / 1000 ELSE n END);
  END IF;
  RETURN v::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_json_numeric(p_value jsonb, p_key text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE v text;
BEGIN
  v := p_value ->> p_key;
  IF v IS NULL OR v !~ '^-?[0-9]+([.][0-9]+)?$' THEN RETURN NULL; END IF;
  RETURN v::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_audit(
  p_actor       uuid,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_details     jsonb,
  p_before      jsonb,
  p_after       jsonb,
  p_ip_address  text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL,
  p_request_id  text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := p_action,
    p_target_type   := p_target_type,
    p_target_id     := p_target_id,
    p_details       := coalesce(p_details, '{}'::jsonb),
    p_before_state  := p_before,
    p_after_state   := p_after,
    p_ip_address    := p_ip_address,
    p_user_agent    := p_user_agent,
    p_request_id    := p_request_id
  );
END;
$fn$;

-- One health response covers every source the queue reads. The worker health
-- remains intact under `worker`, including the deliberately sticky historical
-- gap. Separate daily database scans are reported beside it, never inferred.
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_detector_health(
  p_stale_after_minutes integer DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cadence       integer := least(greatest(coalesce(p_stale_after_minutes, 30), 1), 1440);
  v_measured      timestamptz := clock_timestamp();
  v_worker        jsonb;
  v_latest_cron   jsonb;
  v_daily         jsonb := '{}'::jsonb;
  v_tracking      jsonb;
  v_signals       jsonb;
  v_errors        jsonb := '[]'::jsonb;
  v_state         text;
BEGIN
  BEGIN
    v_worker := public.fn_ca_collusion_detector_health(v_cadence);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'integrity worker health unavailable: %', SQLERRM;
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('source', 'collusion_worker_health', 'code', 'SOURCE_UNAVAILABLE'));
  END;

  BEGIN
    SELECT to_jsonb(e)
      INTO v_latest_cron
      FROM public.cron_execution_log e
     WHERE replace(lower(e.job_name), '_', '-') = 'collusion-scan'
     ORDER BY e.started_at DESC, e.id DESC
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'integrity cron execution health unavailable: %', SQLERRM;
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('source', 'cron_execution_log', 'code', 'SOURCE_UNAVAILABLE'));
  END;

  BEGIN
    EXECUTE $sql$
      SELECT coalesce(jsonb_object_agg(q.source_key, q.payload), '{}'::jsonb)
        FROM (
          SELECT CASE j.jobname
                   WHEN 'ca-collusion-daily' THEN 'chip_flow'
                   WHEN 'ca-duel-pairing-daily' THEN 'duel_pairing'
                 END AS source_key,
                 jsonb_build_object(
                   'job_name', j.jobname,
                   'active', j.active,
                   'status', d.status,
                   'started_at', d.start_time,
                   'finished_at', d.end_time,
                   'return_message', d.return_message
                 ) AS payload
            FROM cron.job j
            LEFT JOIN LATERAL (
              SELECT r.status, r.start_time, r.end_time, r.return_message
                FROM cron.job_run_details r
               WHERE r.jobid = j.jobid
               ORDER BY r.runid DESC
               LIMIT 1
            ) d ON true
           WHERE j.jobname IN ('ca-collusion-daily', 'ca-duel-pairing-daily')
        ) q
       WHERE q.source_key IS NOT NULL
    $sql$ INTO v_daily;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'integrity pg_cron health unavailable: %', SQLERRM;
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('source', 'pg_cron_daily_scans', 'code', 'SOURCE_UNAVAILABLE'));
  END;

  BEGIN
    SELECT jsonb_build_object(
             'newest_at', max(c.created_at),
             'total', count(*)::bigint,
             'total_open', count(*) FILTER (WHERE coalesce(c.status, 'open') = 'open')::bigint
           )
      INTO v_tracking
      FROM public.collusion_tracking c;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'integrity collusion_tracking health unavailable: %', SQLERRM;
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('source', 'collusion_tracking', 'code', 'SOURCE_UNAVAILABLE'));
  END;

  BEGIN
    SELECT jsonb_build_object(
             'newest_at', max(s.detected_at),
             'total', count(*)::bigint,
             'chip_flow_rows', count(*) FILTER (WHERE s.detail ->> 'signal' IS NULL)::bigint,
             'duel_pairing_rows', count(*) FILTER (
               WHERE s.detail ->> 'signal' = 'duel_repeat_pairing')::bigint
           )
      INTO v_signals
      FROM public.ca_collusion_signals s;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'integrity ca_collusion_signals health unavailable: %', SQLERRM;
    v_errors := v_errors || jsonb_build_array(
      jsonb_build_object('source', 'ca_collusion_signals', 'code', 'SOURCE_UNAVAILABLE'));
  END;

  v_state := CASE
    WHEN v_worker IS NULL THEN 'unknown'
    WHEN coalesce(v_worker ->> 'status', 'unknown') <> 'live' THEN 'degraded'
    WHEN coalesce((v_worker ->> 'stale')::boolean, true) THEN 'degraded'
    WHEN jsonb_array_length(v_errors) > 0 THEN 'degraded'
    WHEN NOT (v_daily ? 'chip_flow') OR NOT (v_daily ? 'duel_pairing') THEN 'degraded'
    ELSE 'live'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'state', v_state,
    'measured_at', v_measured,
    'worker', v_worker,
    'latest_cron', v_latest_cron,
    'daily_scans', coalesce(v_daily, '{}'::jsonb),
    'sources', jsonb_build_object(
      'collusion_tracking', v_tracking,
      'ca_collusion_signals', v_signals),
    'source_errors', v_errors);
END;
$fn$;

-- The review queue is one row per canonical unordered pair. It retains every
-- detector observation and its original direction, then orders unlike evidence
-- by an explainable tier instead of pretending their scores share a scale.
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_queue(
  p_include_horses boolean DEFAULT true,
  p_composition    text DEFAULT 'all',
  p_tier           text DEFAULT NULL,
  p_pattern        text DEFAULT NULL,
  p_as_of          timestamptz DEFAULT now(),
  p_limit          integer DEFAULT 50,
  p_cursor         jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_include     boolean := coalesce(p_include_horses, true);
  v_composition text := lower(coalesce(nullif(btrim(p_composition), ''), 'all'));
  v_tier        text := lower(nullif(btrim(coalesce(p_tier, '')), ''));
  v_pattern     text := upper(nullif(btrim(coalesce(p_pattern, '')), ''));
  v_as_of       timestamptz := least(coalesce(p_as_of, now()), now());
  v_limit       integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_health      jsonb;
  v_result      jsonb;
BEGIN
  IF v_composition NOT IN ('all', 'horse_horse', 'horse_human', 'human_human') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_COMPOSITION',
                              'message', 'Unknown participant composition');
  END IF;
  IF v_tier IS NOT NULL AND v_tier NOT IN (
    'active_case', 'multiple_signals', 'seven_day_money_flow',
    'chip_dump', 'other_non_timing', 'timing_only', 'money_flow'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER',
                              'message', 'Unknown integrity queue tier');
  END IF;
  IF v_pattern IS NOT NULL AND v_pattern NOT IN (
    'TIMING_CORRELATION', 'CHIP_DUMP', 'SOFT_PLAY', 'WIN_RATE_ANOMALY',
    'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PATTERN',
                              'message', 'Unknown detector pattern');
  END IF;

  IF p_cursor IS NOT NULL AND NOT (
    p_cursor ?& array[
      'tier_rank', 'distinct_window_count', 'absolute_net_flow',
      'gross_flow', 'sample_size', 'last_seen',
      'player_a_id', 'player_b_id'
    ]
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The queue cursor is incomplete');
  END IF;

  v_health := public.fn_ca_integrity_detector_health(30);

  WITH source_rows AS MATERIALIZED (
    SELECT
      least(c.player_a, c.player_b) AS player_a_id,
      greatest(c.player_a, c.player_b) AS player_b_id,
      'collusion_tracking'::text AS detector_source,
      c.id::text AS source_id,
      upper(c.pattern_type) AS pattern,
      c.created_at AS observed_at,
      c.suspicion_score::numeric AS source_score,
      greatest(
        coalesce(public.fn_ca_integrity_json_numeric(c.evidence, 'hands'), 0),
        coalesce(public.fn_ca_integrity_json_numeric(c.evidence, 'hands_together'), 0),
        coalesce(public.fn_ca_integrity_json_numeric(c.evidence, 'head_to_head_pots'), 0),
        coalesce(public.fn_ca_integrity_json_numeric(c.evidence, 'total_adjacent_actions'), 0),
        coalesce(public.fn_ca_integrity_json_numeric(c.evidence, 'mutual_checkdowns'), 0)
      ) AS sample_size,
      CASE WHEN upper(c.pattern_type) = 'CHIP_DUMP'
        THEN public.fn_ca_integrity_json_numeric(c.evidence, 'pot_volume') END AS gross_flow,
      NULL::numeric AS net_flow,
      coalesce(to_jsonb(c) ->> 'window_start', c.created_at::text)
        || '/' || coalesce(to_jsonb(c) ->> 'window_end', c.created_at::text) AS window_key,
      jsonb_build_object(
        'reported_player_a', c.player_a,
        'reported_player_b', c.player_b,
        'meaning', CASE WHEN upper(c.pattern_type) = 'CHIP_DUMP'
          THEN 'player_a is the dominant loser and player_b is the dominant winner'
          ELSE 'detector-reported order; canonical pair order is separate' END
      ) AS direction,
      coalesce(c.evidence, '{}'::jsonb) AS evidence
    FROM public.collusion_tracking c
    WHERE coalesce(c.status, 'open') = 'open'
      AND c.player_b IS NOT NULL
      AND c.created_at <= v_as_of

    UNION ALL

    SELECT
      least(s.user_a, s.user_b) AS player_a_id,
      greatest(s.user_a, s.user_b) AS player_b_id,
      'ca_collusion_signals'::text AS detector_source,
      s.id::text AS source_id,
      CASE WHEN s.detail ->> 'signal' = 'duel_repeat_pairing'
        THEN 'DUEL_REPEAT_PAIRING' ELSE 'CHIP_FLOW_7D' END AS pattern,
      s.detected_at AS observed_at,
      round(s.direction_ratio * 100, 2) AS source_score,
      s.hands_together::numeric AS sample_size,
      s.gross_flow,
      abs(s.net_flow) AS net_flow,
      coalesce(s.detail ->> 'since', s.detected_at::text)
        || '/' || s.detected_at::text AS window_key,
      jsonb_build_object(
        'receiver_id', s.user_a,
        'sender_id', s.user_b,
        'meaning', CASE WHEN s.detail ->> 'signal' = 'duel_repeat_pairing'
          THEN 'user_a is the dominant winner; hands_together means heads-up duels and direction_ratio means win share'
          ELSE 'user_a is the net receiver; hands_together means hands and direction_ratio means net-flow concentration' END
      ) AS direction,
      coalesce(s.detail, '{}'::jsonb) || jsonb_build_object(
        'hands_together', s.hands_together,
        'gross_flow', s.gross_flow,
        'net_flow', s.net_flow,
        'direction_ratio', s.direction_ratio,
        'both_cert', s.both_cert) AS evidence
    FROM public.ca_collusion_signals s
    WHERE s.detected_at <= v_as_of
      AND s.detected_at >= v_as_of - make_interval(
        days => least(greatest(coalesce(s.window_days, 7), 1), 30) + 1)
  ), grouped AS MATERIALIZED (
    SELECT
      r.player_a_id,
      r.player_b_id,
      count(*)::integer AS observation_count,
      count(DISTINCT r.detector_source || ':' || r.window_key)::integer AS distinct_window_count,
      count(DISTINCT r.detector_source)::integer AS source_count,
      count(DISTINCT r.pattern)::integer AS pattern_count,
      array_agg(DISTINCT r.detector_source ORDER BY r.detector_source) AS detector_sources,
      array_agg(DISTINCT r.pattern ORDER BY r.pattern) AS patterns,
      min(r.observed_at) AS first_seen,
      max(r.observed_at) AS last_seen,
      max(r.source_score) AS max_score,
      max(r.sample_size) AS sample_size,
      max(r.gross_flow) AS gross_flow,
      max(abs(r.net_flow)) AS absolute_net_flow,
      bool_or(r.pattern IN ('CHIP_DUMP', 'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING')) AS has_money,
      bool_or(r.detector_source = 'ca_collusion_signals') AS has_seven_day,
      bool_or(r.pattern = 'CHIP_DUMP') AS has_chip_dump,
      bool_or(r.pattern NOT IN (
        'TIMING_CORRELATION', 'CHIP_DUMP', 'CHIP_FLOW_7D', 'DUEL_REPEAT_PAIRING')) AS has_non_timing,
      jsonb_agg(jsonb_build_object(
        'source', r.detector_source,
        'source_id', r.source_id,
        'pattern', r.pattern,
        'observed_at', r.observed_at,
        'score', r.source_score,
        'gross_flow', r.gross_flow,
        'net_flow', r.net_flow,
        'window_key', r.window_key,
        'direction', r.direction,
        'evidence', r.evidence
      ) ORDER BY r.observed_at DESC, r.detector_source, r.source_id) AS evidence
    FROM source_rows r
    GROUP BY r.player_a_id, r.player_b_id
  ), decorated AS MATERIALIZED (
    SELECT
      g.*,
      coalesce((to_jsonb(pa) ->> 'is_horse')::boolean, false) AS a_horse,
      coalesce((to_jsonb(pb) ->> 'is_horse')::boolean, false) AS b_horse,
      coalesce(to_jsonb(pa) ->> 'display_name', to_jsonb(pa) ->> 'username', g.player_a_id::text) AS player_a_name,
      coalesce(to_jsonb(pb) ->> 'display_name', to_jsonb(pb) ->> 'username', g.player_b_id::text) AS player_b_name,
      CASE
        WHEN coalesce((to_jsonb(pa) ->> 'is_horse')::boolean, false)
         AND coalesce((to_jsonb(pb) ->> 'is_horse')::boolean, false) THEN 'horse_horse'
        WHEN coalesce((to_jsonb(pa) ->> 'is_horse')::boolean, false)
          OR coalesce((to_jsonb(pb) ->> 'is_horse')::boolean, false) THEN 'horse_human'
        ELSE 'human_human'
      END AS composition,
      (SELECT count(*)::integer
         FROM public.anti_cheat_flags f
        WHERE f.player_id IN (g.player_a_id, g.player_b_id)
          AND coalesce(f.status, 'open') = 'open') AS open_flag_count
    FROM grouped g
    LEFT JOIN public.profiles pa ON pa.id = g.player_a_id
    LEFT JOIN public.profiles pb ON pb.id = g.player_b_id
  ), ranked AS MATERIALIZED (
    SELECT d.*,
      linked.case_summary,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 1
        WHEN d.source_count > 1 OR d.pattern_count > 1 THEN 2
        WHEN d.has_seven_day THEN 3
        WHEN d.has_chip_dump THEN 4
        WHEN d.has_non_timing OR d.open_flag_count > 0 THEN 5
        ELSE 6
      END AS tier_rank,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 'active_case'
        WHEN d.source_count > 1 OR d.pattern_count > 1 THEN 'multiple_signals'
        WHEN d.has_seven_day THEN 'seven_day_money_flow'
        WHEN d.has_chip_dump THEN 'chip_dump'
        WHEN d.has_non_timing OR d.open_flag_count > 0 THEN 'other_non_timing'
        ELSE 'timing_only'
      END AS tier,
      CASE
        WHEN linked.case_summary IS NOT NULL THEN 'This pair is attached to an active operator case.'
        WHEN d.source_count > 1 THEN 'More than one independent detector source reported this pair.'
        WHEN d.pattern_count > 1 THEN 'More than one independent detector pattern reported this pair.'
        WHEN d.has_seven_day THEN 'A seven-day chip-flow or duel-repeat detector reported this pair.'
        WHEN d.has_chip_dump THEN 'The incremental detector reported a chip-dump pattern.'
        WHEN d.has_non_timing THEN 'A non-timing behavioral signal reported this pair.'
        WHEN d.open_flag_count > 0 THEN 'One or both participants has an unresolved anti-cheat flag.'
        ELSE 'Timing correlation only. Horses share deterministic HorseLogic, so correlation is expected to be elevated.'
      END AS tier_reason
    FROM decorated d
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object(
        'id', c.id,
        'status', c.status,
        'severity', c.severity,
        'assigned_to', c.assigned_to,
        'opened_at', c.opened_at,
        'version', c.version) AS case_summary
      FROM public.ca_integrity_cases c
      WHERE c.status IN ('open', 'investigating')
        AND c.subject_ids @> ARRAY[d.player_a_id, d.player_b_id]::uuid[]
      ORDER BY c.opened_at DESC, c.id
      LIMIT 1
    ) linked ON true
  ), selected AS MATERIALIZED (
    SELECT r.*
    FROM ranked r
    WHERE (v_include OR (NOT r.a_horse AND NOT r.b_horse))
      AND (v_composition = 'all' OR r.composition = v_composition)
      AND (v_tier IS NULL OR r.tier = v_tier OR (v_tier = 'money_flow' AND r.has_money))
      AND (v_pattern IS NULL OR v_pattern = ANY(r.patterns))
      AND (
        p_cursor IS NULL OR
        ROW(
          r.tier_rank,
          -r.distinct_window_count,
          -coalesce(r.absolute_net_flow, -1),
          -coalesce(r.gross_flow, -1),
          -coalesce(r.sample_size, 0),
          -extract(epoch FROM r.last_seen),
          r.player_a_id,
          r.player_b_id
        ) > ROW(
          (p_cursor ->> 'tier_rank')::integer,
          -(p_cursor ->> 'distinct_window_count')::integer,
          -coalesce((p_cursor ->> 'absolute_net_flow')::numeric, -1),
          -coalesce((p_cursor ->> 'gross_flow')::numeric, -1),
          -coalesce((p_cursor ->> 'sample_size')::numeric, 0),
          -extract(epoch FROM (p_cursor ->> 'last_seen')::timestamptz),
          (p_cursor ->> 'player_a_id')::uuid,
          (p_cursor ->> 'player_b_id')::uuid
        )
      )
  ), page AS MATERIALIZED (
    SELECT s.*, row_number() OVER (
      ORDER BY s.tier_rank, s.distinct_window_count DESC,
        s.absolute_net_flow DESC NULLS LAST, s.gross_flow DESC NULLS LAST,
        s.sample_size DESC NULLS LAST,
        s.last_seen DESC, s.player_a_id, s.player_b_id
    ) AS rn
    FROM selected s
    ORDER BY s.tier_rank, s.distinct_window_count DESC,
      s.absolute_net_flow DESC NULLS LAST, s.gross_flow DESC NULLS LAST,
      s.sample_size DESC NULLS LAST,
      s.last_seen DESC, s.player_a_id, s.player_b_id
    LIMIT v_limit + 1
  ), payload AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'queue_key', p.player_a_id::text || ':' || p.player_b_id::text,
      'player_a_id', p.player_a_id,
      'player_b_id', p.player_b_id,
      'player_a_name', p.player_a_name,
      'player_b_name', p.player_b_name,
      'player_a_is_horse', p.a_horse,
      'player_b_is_horse', p.b_horse,
      'composition', p.composition,
      'tier', p.tier,
      'tier_rank', p.tier_rank,
      'tier_reason', p.tier_reason,
      'observation_count', p.observation_count,
      'distinct_window_count', p.distinct_window_count,
      'source_count', p.source_count,
      'pattern_count', p.pattern_count,
      'detector_sources', p.detector_sources,
      'patterns', p.patterns,
      'first_seen', p.first_seen,
      'last_seen', p.last_seen,
      'max_score', p.max_score,
      'sample_size', p.sample_size,
      'gross_flow', p.gross_flow,
      'absolute_net_flow', p.absolute_net_flow,
      'open_flag_count', p.open_flag_count,
      'case', p.case_summary,
      'evidence', p.evidence,
      'disclosure', 'Queue priority is review order, not a verdict.'
    ) ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb) AS rows,
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object(
        'tier_rank', z.tier_rank,
        'distinct_window_count', z.distinct_window_count,
        'absolute_net_flow', z.absolute_net_flow,
        'gross_flow', z.gross_flow,
        'sample_size', z.sample_size,
        'last_seen', z.last_seen,
        'player_a_id', z.player_a_id,
        'player_b_id', z.player_b_id)
      FROM page z WHERE z.rn = v_limit
    ) END AS next_cursor
    FROM page p
  ), totals AS (
    SELECT jsonb_build_object(
      'groups', (SELECT count(*)::bigint FROM ranked),
      'observations', (SELECT count(*)::bigint FROM source_rows),
      'filtered_groups', (SELECT count(*)::bigint FROM selected),
      'by_tier', coalesce((SELECT jsonb_object_agg(x.tier, x.n)
        FROM (SELECT tier, count(*)::bigint AS n FROM ranked GROUP BY tier) x), '{}'::jsonb),
      'by_pattern', coalesce((SELECT jsonb_object_agg(x.pattern, x.n)
        FROM (SELECT pattern, count(*)::bigint AS n
          FROM ranked r CROSS JOIN LATERAL unnest(r.patterns) pattern GROUP BY pattern) x), '{}'::jsonb),
      'by_composition', coalesce((SELECT jsonb_object_agg(x.composition, x.n)
        FROM (SELECT composition, count(*)::bigint AS n FROM ranked GROUP BY composition) x), '{}'::jsonb),
      'by_source', coalesce((SELECT jsonb_object_agg(x.detector_source, x.n)
        FROM (SELECT detector_source, count(*)::bigint AS n
          FROM source_rows GROUP BY detector_source) x), '{}'::jsonb)
    ) AS value
  )
  SELECT jsonb_build_object(
    'ok', true,
    'state', CASE
      WHEN coalesce(v_health ->> 'state', 'unknown') = 'unknown' THEN 'unknown'
      WHEN (SELECT count(*) FROM selected) > 0 THEN 'review_available'
      WHEN coalesce(v_health #>> '{worker,newest_finding_at}', '') = ''
       AND coalesce((v_health #>> '{sources,ca_collusion_signals,total}')::bigint, 0) = 0
        THEN 'nothing_produced'
      ELSE 'nothing_to_review' END,
    'queue_state', CASE
      WHEN coalesce(v_health ->> 'state', 'unknown') = 'unknown' THEN 'unknown'
      WHEN (SELECT count(*) FROM selected) > 0 THEN 'review_available'
      WHEN coalesce(v_health #>> '{worker,newest_finding_at}', '') = ''
       AND coalesce((v_health #>> '{sources,ca_collusion_signals,total}')::bigint, 0) = 0
        THEN 'nothing_produced'
      ELSE 'nothing_to_review' END,
    'rows', payload.rows,
    'groups', payload.rows,
    'totals', totals.value,
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'next_cursor', payload.next_cursor,
    'health', v_health,
    'ranking', jsonb_build_object(
      'tiers', jsonb_build_array(
        'active_case', 'multiple_signals', 'seven_day_money_flow',
        'chip_dump', 'other_non_timing', 'timing_only'),
      'rule', 'Lexicographic review priority; unlike detector scores are never blended.'),
    'disclosure', jsonb_build_array(
      'Horses are players and are included by default.',
      'Queue priority is review order, not a verdict.',
      'Horse timing correlation is elevated by shared deterministic HorseLogic.',
      'Repeated raw observations are grouped by canonical unordered pair.'
    )
  ) INTO v_result
  FROM payload CROSS JOIN totals;

  RETURN v_result;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The queue cursor is invalid',
                              'state', 'unknown', 'queue_state', 'unknown',
                              'health', v_health, 'as_of', v_as_of,
                              'measured_at', clock_timestamp());
  WHEN OTHERS THEN
    RAISE NOTICE 'fn_ca_integrity_queue source error: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'code', 'QUEUE_SOURCE_ERROR',
                              'message', 'One or more integrity queue sources could not be read',
                              'state', 'unknown', 'queue_state', 'unknown',
                              'health', v_health, 'as_of', v_as_of,
                              'measured_at', clock_timestamp());
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case      jsonb;
  v_items     jsonb;
  v_sanctions jsonb;
BEGIN
  IF p_case_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_ID_REQUIRED',
                              'message', 'A case id is required');
  END IF;

  SELECT to_jsonb(c) INTO v_case
    FROM public.ca_integrity_cases c
   WHERE c.id = p_case_id;

  IF v_case IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND',
                              'message', 'Integrity case not found',
                              'state', 'not_found', 'case_id', p_case_id);
  END IF;

  SELECT coalesce(jsonb_agg(
           to_jsonb(i) || jsonb_build_object(
             'retracted', EXISTS (
               SELECT 1 FROM public.ca_integrity_case_items r
                WHERE r.retracts_item_id = i.id),
             'retraction', (
               SELECT to_jsonb(r) FROM public.ca_integrity_case_items r
                WHERE r.retracts_item_id = i.id LIMIT 1))
           ORDER BY i.added_at, i.id), '[]'::jsonb)
    INTO v_items
    FROM public.ca_integrity_case_items i
   WHERE i.case_id = p_case_id;

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.proposed_at, s.id), '[]'::jsonb)
    INTO v_sanctions
    FROM public.ca_integrity_sanctions s
   WHERE s.case_id = p_case_id;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'found',
    'case', v_case,
    'items', v_items,
    'sanctions', v_sanctions,
    'measured_at', clock_timestamp());
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_pairs(
  p_include_horses boolean DEFAULT true,
  p_composition    text DEFAULT 'all',
  p_as_of          timestamptz DEFAULT now(),
  p_limit          integer DEFAULT 50,
  p_cursor         jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_queue jsonb;
BEGIN
  v_queue := public.fn_ca_integrity_queue(
    p_include_horses => coalesce(p_include_horses, true),
    p_composition => p_composition,
    p_tier => 'money_flow',
    p_pattern => NULL,
    p_as_of => p_as_of,
    p_limit => p_limit,
    p_cursor => p_cursor);

  IF coalesce((v_queue ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_queue;
  END IF;
  RETURN v_queue || jsonb_build_object(
    'pairs', v_queue -> 'groups',
    'matrix', v_queue -> 'groups',
    'view', 'money_flow');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_flags(
  p_as_of          timestamptz DEFAULT now(),
  p_limit          integer DEFAULT 50,
  p_cursor         jsonb DEFAULT NULL,
  p_include_horses boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_as_of   timestamptz := least(coalesce(p_as_of, now()), now());
  v_limit   integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_include boolean := coalesce(p_include_horses, true);
  v_rows    jsonb;
  v_total   bigint;
  v_next    jsonb;
BEGIN
  IF p_cursor IS NOT NULL AND NOT (p_cursor ?& array['flagged_at', 'id']) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The flag cursor is incomplete');
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT
      f.*,
      coalesce((to_jsonb(p) ->> 'is_horse')::boolean, false) AS player_is_horse,
      coalesce(to_jsonb(p) ->> 'display_name', to_jsonb(p) ->> 'username', f.player_id::text) AS player_name,
      (SELECT count(*)::integer FROM public.anti_cheat_events e
        WHERE e.player_id = f.player_id
          AND e.created_at <= v_as_of
          AND e.created_at >= v_as_of - interval '30 days') AS event_count_30d,
      (SELECT to_jsonb(e) FROM public.anti_cheat_events e
        WHERE e.player_id = f.player_id AND e.created_at <= v_as_of
        ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS latest_event
    FROM public.anti_cheat_flags f
    LEFT JOIN public.profiles p ON p.id = f.player_id
    WHERE coalesce(f.status, 'open') = 'open'
      AND f.flagged_at <= v_as_of
  ), selected AS MATERIALIZED (
    SELECT s.*
    FROM scoped s
    WHERE (v_include OR NOT s.player_is_horse)
      AND (p_cursor IS NULL OR ROW(s.flagged_at, s.id) < ROW(
        (p_cursor ->> 'flagged_at')::timestamptz,
        (p_cursor ->> 'id')::uuid))
  ), page AS MATERIALIZED (
    SELECT s.*, row_number() OVER (ORDER BY s.flagged_at DESC, s.id DESC) AS rn
    FROM selected s
    ORDER BY s.flagged_at DESC, s.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    coalesce(jsonb_agg(
      (to_jsonb(p) - 'rn') ORDER BY p.rn) FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    (SELECT count(*)::bigint FROM scoped),
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object('flagged_at', z.flagged_at, 'id', z.id)
      FROM page z WHERE z.rn = v_limit) END
    INTO v_rows, v_total, v_next
    FROM page p;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE WHEN v_total > 0 THEN 'review_available' ELSE 'nothing_to_review' END,
    'flags', v_rows,
    'rows', v_rows,
    'total', v_total,
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'next_cursor', v_next);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                            'message', 'The flag cursor is invalid', 'state', 'unknown');
WHEN OTHERS THEN
  RAISE NOTICE 'fn_ca_integrity_flags source error: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'code', 'FLAGS_SOURCE_ERROR',
                            'message', 'The anti-cheat source could not be read', 'state', 'unknown');
END;
$fn$;

-- Investigator hand search is bounded twice: the RPC returns at most 50 rows
-- and only examines the newest 500 candidate rows before applying JSON player
-- filters. `truncated` makes that coverage limit explicit.
CREATE OR REPLACE FUNCTION public.fn_ca_integrity_hands(
  p_player_id       uuid DEFAULT NULL,
  p_pair_player_id  uuid DEFAULT NULL,
  p_as_of           timestamptz DEFAULT now(),
  p_limit           integer DEFAULT 25,
  p_cursor          jsonb DEFAULT NULL,
  p_include_horses  boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_as_of      timestamptz := least(coalesce(p_as_of, now()), now());
  v_limit      integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_candidate  integer := 500;
  v_rows       jsonb;
  v_next       jsonb;
  v_match      bigint;
BEGIN
  IF p_pair_player_id IS NOT NULL AND p_player_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_ID_REQUIRED',
                              'message', 'A primary player is required for pair search');
  END IF;
  IF p_cursor IS NOT NULL AND NOT (p_cursor ?& array['created_at', 'id']) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                              'message', 'The hand cursor is incomplete');
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT h.id, h.table_id, h.tournament_id, h.hand_number, h.game_variant,
           h.pot_size, h.big_blind, h.small_blind, h.players, h.winners,
           h.actions, h.created_at
    FROM public.hand_history h
    WHERE h.created_at <= v_as_of
      AND (p_cursor IS NULL OR ROW(h.created_at, h.id) < ROW(
        (p_cursor ->> 'created_at')::timestamptz,
        (p_cursor ->> 'id')::uuid))
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT v_candidate
  ), matched AS MATERIALIZED (
    SELECT c.*
    FROM candidates c
    WHERE (p_player_id IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(c.players, '[]'::jsonb)) x
       WHERE coalesce(x ->> 'user_id', x ->> 'userId', x ->> 'id') = p_player_id::text))
      AND (p_pair_player_id IS NULL OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(c.players, '[]'::jsonb)) x
       WHERE coalesce(x ->> 'user_id', x ->> 'userId', x ->> 'id') = p_pair_player_id::text))
  ), page AS MATERIALIZED (
    SELECT m.*, row_number() OVER (ORDER BY m.created_at DESC, m.id DESC) AS rn
    FROM matched m
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    coalesce(jsonb_agg((to_jsonb(p) - 'rn') ORDER BY p.rn)
      FILTER (WHERE p.rn <= v_limit), '[]'::jsonb),
    (SELECT count(*)::bigint FROM matched),
    CASE WHEN count(*) > v_limit THEN (
      SELECT jsonb_build_object('created_at', z.created_at, 'id', z.id)
      FROM page z WHERE z.rn = v_limit) END
    INTO v_rows, v_match, v_next
    FROM page p;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE WHEN v_match > 0 THEN 'hands_available' ELSE 'nothing_to_review' END,
    'hands', v_rows,
    'rows', v_rows,
    'matched_in_sample', v_match,
    'candidate_cap', v_candidate,
    'truncated', true,
    'include_horses', coalesce(p_include_horses, true),
    'as_of', v_as_of,
    'measured_at', clock_timestamp(),
    'next_cursor', v_next,
    'coverage_note', 'Search examines the newest 500 candidate hands per page before player filters.');
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CURSOR',
                            'message', 'The hand cursor is invalid', 'state', 'unknown');
WHEN OTHERS THEN
  RAISE NOTICE 'fn_ca_integrity_hands source error: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'code', 'HANDS_SOURCE_ERROR',
                            'message', 'The hand-history source could not be read', 'state', 'unknown');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_timing(
  p_include_horses boolean DEFAULT true,
  p_as_of          timestamptz DEFAULT now(),
  p_since          timestamptz DEFAULT NULL,
  p_hand_limit     integer DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_as_of      timestamptz := least(coalesce(p_as_of, now()), now());
  v_since      timestamptz;
  v_hand_limit integer := least(greatest(coalesce(p_hand_limit, 200), 10), 500);
  v_histogram  jsonb;
  v_pairs      bigint;
  v_hands      bigint;
  v_actions    bigint;
BEGIN
  v_since := greatest(coalesce(p_since, v_as_of - interval '24 hours'),
                      v_as_of - interval '7 days');
  IF v_since >= v_as_of THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_WINDOW',
                              'message', 'Timing window must begin before as_of');
  END IF;

  WITH sampled_hands AS MATERIALIZED (
    SELECT h.id, h.created_at, h.actions
    FROM public.hand_history h
    WHERE h.created_at >= v_since AND h.created_at <= v_as_of
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT v_hand_limit
  ), action_rows AS MATERIALIZED (
    SELECT h.id AS hand_id,
      a.ordinality,
      public.fn_ca_integrity_action_user(a.value) AS user_id,
      public.fn_ca_integrity_action_time(a.value) AS action_at
    FROM sampled_hands h
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(h.actions, '[]'::jsonb))
      WITH ORDINALITY AS a(value, ordinality)
  ), adjacent AS MATERIALIZED (
    SELECT hand_id, user_id,
      lead(user_id) OVER (PARTITION BY hand_id ORDER BY action_at, ordinality) AS next_user_id,
      action_at,
      lead(action_at) OVER (PARTITION BY hand_id ORDER BY action_at, ordinality) AS next_action_at
    FROM action_rows
    WHERE user_id IS NOT NULL AND action_at IS NOT NULL
  ), intervals AS MATERIALIZED (
    SELECT a.hand_id, a.user_id, a.next_user_id,
      greatest(0, extract(epoch FROM a.next_action_at - a.action_at) * 1000)::numeric AS interval_ms,
      coalesce((to_jsonb(p1) ->> 'is_horse')::boolean, false) AS first_horse,
      coalesce((to_jsonb(p2) ->> 'is_horse')::boolean, false) AS second_horse
    FROM adjacent a
    LEFT JOIN public.profiles p1 ON p1.id = a.user_id
    LEFT JOIN public.profiles p2 ON p2.id = a.next_user_id
    WHERE a.next_user_id IS NOT NULL
      AND a.next_action_at IS NOT NULL
      AND a.user_id <> a.next_user_id
      AND a.next_action_at >= a.action_at
      AND a.next_action_at - a.action_at <= interval '60 seconds'
  ), classified AS MATERIALIZED (
    SELECT i.*,
      CASE WHEN i.first_horse AND i.second_horse THEN 'horse_horse'
           WHEN i.first_horse OR i.second_horse THEN 'horse_human'
           ELSE 'human_human' END AS composition,
      CASE WHEN i.interval_ms < 250 THEN 'under_250ms'
           WHEN i.interval_ms < 500 THEN '250_to_499ms'
           WHEN i.interval_ms < 1000 THEN '500_to_999ms'
           WHEN i.interval_ms < 2000 THEN '1000_to_1999ms'
           ELSE '2000ms_plus' END AS bucket
    FROM intervals i
    WHERE coalesce(p_include_horses, true)
       OR (NOT i.first_horse AND NOT i.second_horse)
  )
  SELECT
    coalesce((
      SELECT jsonb_object_agg(c.composition, c.payload)
      FROM (
        SELECT composition, jsonb_build_object(
          'adjacent_pairs', count(*)::bigint,
          'distinct_hands', count(DISTINCT hand_id)::bigint,
          'median_ms', round(percentile_cont(0.5) WITHIN GROUP (ORDER BY interval_ms)::numeric, 1),
          'under_500ms', count(*) FILTER (WHERE interval_ms < 500)::bigint,
          'buckets', (
            SELECT jsonb_object_agg(b.bucket, b.n)
            FROM (SELECT c2.bucket, count(*)::bigint AS n
              FROM classified c2 WHERE c2.composition = classified.composition
              GROUP BY c2.bucket) b)
        ) AS payload
        FROM classified
        GROUP BY composition
      ) c), '{}'::jsonb),
    (SELECT count(*)::bigint FROM classified),
    (SELECT count(*)::bigint FROM sampled_hands),
    (SELECT count(*)::bigint FROM action_rows)
    INTO v_histogram, v_pairs, v_hands, v_actions;

  RETURN jsonb_build_object(
    'ok', true,
    'state', CASE WHEN v_pairs > 0 THEN 'sample_available' ELSE 'nothing_produced' END,
    'distribution', v_histogram,
    'histogram', v_histogram,
    'coverage', jsonb_build_object(
      'since', v_since,
      'as_of', v_as_of,
      'hand_cap', v_hand_limit,
      'hands_sampled', v_hands,
      'actions_sampled', v_actions,
      'adjacent_pairs', v_pairs,
      'truncated', v_hands >= v_hand_limit),
    'measured_at', clock_timestamp(),
    'disclosure', jsonb_build_array(
      'This is adjacent-action interval evidence, not an RTA verdict.',
      'Horse rows are shown beside human rows because horses share deterministic HorseLogic.',
      'There is no complete human decision-latency table; this view uses a bounded hand-history sample.'
    ));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'fn_ca_integrity_timing source error: %', SQLERRM;
  RETURN jsonb_build_object('ok', false, 'code', 'TIMING_SOURCE_ERROR',
                            'message', 'The timing sample could not be read', 'state', 'unknown',
                            'as_of', v_as_of, 'measured_at', clock_timestamp());
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_open(
  p_subject_ids  uuid[],
  p_kind         text,
  p_severity     text,
  p_note         text,
  p_actor        uuid,
  p_op_id        text,
  p_ip_address   text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL,
  p_request_id   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_subjects uuid[];
  v_payload  jsonb;
  v_hash     text;
  v_case     public.ca_integrity_cases;
  v_count    integer;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;

  v_subjects := public.fn_ca_integrity_normalize_subjects(p_subject_ids);
  IF coalesce(cardinality(v_subjects), 0) NOT BETWEEN 1 AND 32 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SUBJECTS', 'message', 'Cases require between 1 and 32 players');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN (
    'collusion', 'chip_dumping', 'multi_accounting', 'bot_or_rta', 'abuse', 'other') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_KIND', 'message', 'Unknown integrity case kind');
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('low', 'medium', 'high') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEVERITY', 'message', 'Unknown integrity case severity');
  END IF;
  IF p_note IS NOT NULL AND length(btrim(p_note)) NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_NOTE', 'message', 'Case note is too long');
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.profiles p WHERE p.id = ANY(v_subjects);
  IF v_count <> cardinality(v_subjects) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND', 'message', 'One or more players do not exist');
  END IF;

  v_payload := jsonb_build_object(
    'subject_ids', to_jsonb(v_subjects), 'kind', p_kind,
    'severity', p_severity, 'note', nullif(btrim(coalesce(p_note, '')), ''));
  v_hash := md5(v_payload::text);

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.open_op_id = p_op_id;
  IF FOUND THEN
    IF v_case.open_payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT',
                                'message', 'This operation id was used for a different case');
    END IF;
    RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'idempotent', true);
  END IF;

  INSERT INTO public.ca_integrity_cases (
    subject_ids, kind, severity, opened_by, open_op_id, open_payload_hash)
  VALUES (v_subjects, p_kind, p_severity, p_actor, p_op_id, v_hash)
  RETURNING * INTO v_case;

  IF nullif(btrim(coalesce(p_note, '')), '') IS NOT NULL THEN
    INSERT INTO public.ca_integrity_case_items (
      case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
    VALUES (
      v_case.id, 'note', jsonb_build_object('note', btrim(p_note)),
      md5(jsonb_build_object('note', btrim(p_note))::text), p_actor,
      md5('integrity-open-note:' || p_op_id),
      md5(jsonb_build_object('note', btrim(p_note))::text));
  END IF;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_open', 'integrity_case', v_case.id::text,
    jsonb_build_object('op_id', p_op_id), NULL, to_jsonb(v_case),
    p_ip_address, p_user_agent, p_request_id);

  RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_add_item(
  p_case_id       uuid,
  p_item_type     text,
  p_item_ref      text,
  p_detail        jsonb,
  p_actor         uuid,
  p_op_id         text,
  p_ip_address    text DEFAULT NULL,
  p_user_agent    text DEFAULT NULL,
  p_request_id    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case       public.ca_integrity_cases;
  v_item       public.ca_integrity_case_items;
  v_existing   public.ca_integrity_case_items;
  v_annotation jsonb := coalesce(p_detail, '{}'::jsonb);
  v_snapshot   jsonb;
  v_stored     jsonb;
  v_hash       text;
  v_payload    text;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF p_item_type NOT IN (
    'collusion_row', 'collusion_signal', 'flag', 'hand',
    'restriction', 'note', 'observation') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEM_TYPE', 'message', 'Unknown evidence item type');
  END IF;
  IF octet_length(v_annotation::text) > 65536 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DETAIL_TOO_LARGE', 'message', 'Evidence annotation is too large');
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CLOSED', 'message', 'Closed cases cannot receive evidence');
  END IF;

  v_payload := concat_ws('|', p_case_id::text, p_item_type, coalesce(p_item_ref, ''), v_annotation::text);
  v_hash := md5(v_payload);
  SELECT * INTO v_existing FROM public.ca_integrity_case_items i WHERE i.op_id = p_op_id;
  IF FOUND THEN
    IF v_existing.case_id <> p_case_id OR v_existing.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT',
                                'message', 'This operation id was used for different evidence');
    END IF;
    RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_existing), 'idempotent', true);
  END IF;

  IF p_item_type = 'note' THEN
    IF p_item_ref IS NOT NULL OR length(btrim(coalesce(v_annotation ->> 'note', ''))) NOT BETWEEN 1 AND 4000 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_NOTE', 'message', 'A bounded note and no source reference are required');
    END IF;
    v_snapshot := jsonb_build_object('note', btrim(v_annotation ->> 'note'));
  ELSE
    IF p_item_ref IS NULL OR length(p_item_ref) > 200 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ITEM_REF_REQUIRED', 'message', 'A bounded source reference is required');
    END IF;

    SELECT * INTO v_existing FROM public.ca_integrity_case_items i
     WHERE i.case_id = p_case_id AND i.item_type = p_item_type AND i.item_ref = p_item_ref
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVIDENCE_ALREADY_ATTACHED',
                                'message', 'This evidence is already attached', 'item_id', v_existing.id);
    END IF;

    IF p_item_type IN ('collusion_row', 'flag', 'hand', 'restriction')
       AND p_item_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEM_REF', 'message', 'Source reference is invalid');
    END IF;
    IF p_item_type IN ('collusion_signal', 'observation') AND p_item_ref !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ITEM_REF', 'message', 'Source reference is invalid');
    END IF;

    CASE p_item_type
      WHEN 'collusion_row' THEN
        SELECT to_jsonb(c) INTO v_snapshot FROM public.collusion_tracking c
         WHERE c.id = p_item_ref::uuid;
      WHEN 'collusion_signal' THEN
        SELECT to_jsonb(s) INTO v_snapshot FROM public.ca_collusion_signals s
         WHERE s.id = p_item_ref::bigint;
      WHEN 'flag' THEN
        SELECT to_jsonb(f) INTO v_snapshot FROM public.anti_cheat_flags f
         WHERE f.id = p_item_ref::uuid;
      WHEN 'hand' THEN
        SELECT jsonb_build_object(
          'id', h.id, 'table_id', h.table_id, 'tournament_id', h.tournament_id,
          'hand_number', h.hand_number, 'game_variant', h.game_variant,
          'pot_size', h.pot_size, 'big_blind', h.big_blind, 'small_blind', h.small_blind,
          'players', h.players, 'winners', h.winners, 'actions', h.actions,
          'created_at', h.created_at)
          INTO v_snapshot FROM public.hand_history h WHERE h.id = p_item_ref::uuid;
      WHEN 'restriction' THEN
        SELECT to_jsonb(r) INTO v_snapshot FROM public.ca_player_restrictions r
         WHERE r.id = p_item_ref::uuid;
      WHEN 'observation' THEN
        SELECT to_jsonb(o) INTO v_snapshot FROM public.ca_restriction_observations o
         WHERE o.id = p_item_ref::bigint;
    END CASE;

    IF v_snapshot IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVIDENCE_NOT_FOUND', 'message', 'Evidence source not found');
    END IF;
  END IF;

  v_stored := CASE WHEN p_item_type = 'note' THEN v_snapshot
    ELSE jsonb_build_object('source_snapshot', v_snapshot, 'annotation', v_annotation) END;
  IF octet_length(v_stored::text) > 524288 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EVIDENCE_TOO_LARGE', 'message', 'Evidence snapshot exceeds the attachment limit');
  END IF;

  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, item_ref, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (
    p_case_id, p_item_type, CASE WHEN p_item_type = 'note' THEN NULL ELSE p_item_ref END,
    v_stored, md5(v_stored::text), p_actor, p_op_id, v_hash)
  RETURNING * INTO v_item;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_add_item', 'integrity_case', p_case_id::text,
    jsonb_build_object('item_id', v_item.id, 'item_type', p_item_type, 'item_ref', p_item_ref),
    NULL, to_jsonb(v_item), p_ip_address, p_user_agent, p_request_id);

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_retract_item(
  p_case_id       uuid,
  p_item_id       uuid,
  p_reason        text,
  p_actor         uuid,
  p_op_id         text,
  p_ip_address    text DEFAULT NULL,
  p_user_agent    text DEFAULT NULL,
  p_request_id    text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case     public.ca_integrity_cases;
  v_target   public.ca_integrity_case_items;
  v_existing public.ca_integrity_case_items;
  v_item     public.ca_integrity_case_items;
  v_detail   jsonb;
  v_hash     text;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'A bounded retraction reason is required');
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CLOSED', 'message', 'Closed cases cannot change evidence history');
  END IF;

  SELECT * INTO v_target FROM public.ca_integrity_case_items i
   WHERE i.id = p_item_id AND i.case_id = p_case_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ITEM_NOT_FOUND', 'message', 'Case item not found');
  END IF;
  IF v_target.item_type IN ('retraction', 'assignment', 'decision', 'closure', 'sanction') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ITEM_NOT_RETRACTABLE', 'message', 'This history event cannot be retracted');
  END IF;

  v_detail := jsonb_build_object(
    'retracts_item_id', p_item_id,
    'reason', btrim(p_reason),
    'original_snapshot_hash', v_target.snapshot_hash);
  v_hash := md5(concat_ws('|', p_case_id::text, p_item_id::text, btrim(p_reason)));

  SELECT * INTO v_existing FROM public.ca_integrity_case_items i WHERE i.op_id = p_op_id;
  IF FOUND THEN
    IF v_existing.case_id <> p_case_id OR v_existing.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT',
                                'message', 'This operation id was used for another retraction');
    END IF;
    RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_existing), 'idempotent', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.ca_integrity_case_items i WHERE i.retracts_item_id = p_item_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_RETRACTED', 'message', 'This evidence is already retracted');
  END IF;

  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, item_ref, detail, snapshot_hash, added_by, op_id,
    payload_hash, retracts_item_id, retraction_reason)
  VALUES (
    p_case_id, 'retraction', p_item_id::text, v_detail, md5(v_detail::text),
    p_actor, p_op_id, v_hash, p_item_id, btrim(p_reason))
  RETURNING * INTO v_item;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_retract_item', 'integrity_case', p_case_id::text,
    jsonb_build_object('item_id', p_item_id, 'retraction_id', v_item.id),
    to_jsonb(v_target), to_jsonb(v_item), p_ip_address, p_user_agent, p_request_id);

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_assign(
  p_case_id          uuid,
  p_assigned_to      uuid,
  p_actor            uuid,
  p_op_id            text,
  p_expected_version integer DEFAULT NULL,
  p_ip_address       text DEFAULT NULL,
  p_user_agent       text DEFAULT NULL,
  p_request_id       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case public.ca_integrity_cases;
  v_before jsonb;
  v_payload jsonb;
  v_hash text;
  v_event public.ca_integrity_case_items;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  v_payload := jsonb_build_object('case_id', p_case_id, 'assigned_to', p_assigned_to);
  v_hash := md5(v_payload::text);

  SELECT * INTO v_event FROM public.ca_integrity_case_items i WHERE i.op_id = p_op_id;
  IF FOUND THEN
    IF v_event.case_id <> p_case_id OR v_event.item_type <> 'assignment' OR v_event.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation id was used for a different assignment');
    END IF;
    SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id;
    RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CLOSED', 'message', 'A closed case cannot be assigned');
  END IF;
  IF p_expected_version IS NOT NULL AND v_case.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'message', 'The case changed. Reload it before assigning');
  END IF;
  IF p_assigned_to IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_assigned_to
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ASSIGNEE_NOT_FOUND', 'message', 'The assigned operator was not found');
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.ca_integrity_cases c
     SET assigned_to = p_assigned_to,
         status = CASE WHEN c.status = 'open' AND p_assigned_to IS NOT NULL THEN 'investigating' ELSE c.status END,
         version = c.version + 1,
         updated_at = now()
   WHERE c.id = p_case_id
   RETURNING * INTO v_case;

  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (p_case_id, 'assignment', v_payload, v_hash, p_actor, p_op_id, v_hash)
  RETURNING * INTO v_event;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_assign', 'integrity_case', p_case_id::text,
    jsonb_build_object('op_id', p_op_id), v_before, to_jsonb(v_case),
    p_ip_address, p_user_agent, p_request_id);
  RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_decide(
  p_case_id          uuid,
  p_decision         text,
  p_decision_note    text,
  p_actor            uuid,
  p_op_id            text,
  p_expected_version integer DEFAULT NULL,
  p_ip_address       text DEFAULT NULL,
  p_user_agent       text DEFAULT NULL,
  p_request_id       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case public.ca_integrity_cases;
  v_before jsonb;
  v_payload jsonb;
  v_hash text;
  v_event public.ca_integrity_case_items;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('no_action', 'warned', 'restricted', 'confiscated') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DECISION', 'message', 'Unknown case decision');
  END IF;
  IF length(btrim(coalesce(p_decision_note, ''))) NOT BETWEEN 10 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DECISION_NOTE', 'message', 'A decision note of at least ten characters is required');
  END IF;
  v_payload := jsonb_build_object('case_id', p_case_id, 'decision', p_decision, 'decision_note', btrim(p_decision_note));
  v_hash := md5(v_payload::text);

  SELECT * INTO v_event FROM public.ca_integrity_case_items i WHERE i.op_id = p_op_id;
  IF FOUND THEN
    IF v_event.case_id <> p_case_id OR v_event.item_type <> 'decision' OR v_event.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation id was used for a different decision');
    END IF;
    SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id;
    RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status IN ('decided', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_ALREADY_DECIDED', 'message', 'This case already has a decision');
  END IF;
  IF p_expected_version IS NOT NULL AND v_case.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'message', 'The case changed. Reload it before deciding');
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.ca_integrity_cases c
     SET status = 'decided', decision = p_decision, decision_note = btrim(p_decision_note),
         decided_by = p_actor, decided_at = now(), version = c.version + 1, updated_at = now()
   WHERE c.id = p_case_id
   RETURNING * INTO v_case;
  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (p_case_id, 'decision', v_payload, v_hash, p_actor, p_op_id, v_hash)
  RETURNING * INTO v_event;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_decide', 'integrity_case', p_case_id::text,
    jsonb_build_object('op_id', p_op_id), v_before, to_jsonb(v_case),
    p_ip_address, p_user_agent, p_request_id);
  RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_case_close(
  p_case_id          uuid,
  p_close_note       text,
  p_actor            uuid,
  p_op_id            text,
  p_expected_version integer DEFAULT NULL,
  p_ip_address       text DEFAULT NULL,
  p_user_agent       text DEFAULT NULL,
  p_request_id       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case public.ca_integrity_cases;
  v_before jsonb;
  v_payload jsonb;
  v_hash text;
  v_event public.ca_integrity_case_items;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF length(btrim(coalesce(p_close_note, ''))) NOT BETWEEN 10 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CLOSE_NOTE', 'message', 'A closing note of at least ten characters is required');
  END IF;
  v_payload := jsonb_build_object('case_id', p_case_id, 'close_note', btrim(p_close_note));
  v_hash := md5(v_payload::text);

  SELECT * INTO v_event FROM public.ca_integrity_case_items i WHERE i.op_id = p_op_id;
  IF FOUND THEN
    IF v_event.case_id <> p_case_id OR v_event.item_type <> 'closure' OR v_event.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation id was used for a different closure');
    END IF;
    SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id;
    RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_ALREADY_CLOSED', 'message', 'This case is already closed');
  END IF;
  IF v_case.status <> 'decided' OR v_case.decision IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DECISION_REQUIRED', 'message', 'Decide the case before closing it');
  END IF;
  IF p_expected_version IS NOT NULL AND v_case.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VERSION_CONFLICT', 'message', 'The case changed. Reload it before closing');
  END IF;

  v_before := to_jsonb(v_case);
  UPDATE public.ca_integrity_cases c
     SET status = 'closed', closed_by = p_actor, closed_at = now(), close_note = btrim(p_close_note),
         version = c.version + 1, updated_at = now()
   WHERE c.id = p_case_id
   RETURNING * INTO v_case;
  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (p_case_id, 'closure', v_payload, v_hash, p_actor, p_op_id, v_hash)
  RETURNING * INTO v_event;

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.case_close', 'integrity_case', p_case_id::text,
    jsonb_build_object('op_id', p_op_id), v_before, to_jsonb(v_case),
    p_ip_address, p_user_agent, p_request_id);
  RETURN jsonb_build_object('ok', true, 'case', to_jsonb(v_case), 'event', to_jsonb(v_event), 'idempotent', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_ca_integrity_sanction(
  p_case_id        uuid,
  p_subject_id     uuid,
  p_kind           text,
  p_amount         numeric,
  p_restriction_id uuid,
  p_approval_id    uuid,
  p_note           text,
  p_actor          uuid,
  p_op_id          text,
  p_ip_address     text DEFAULT NULL,
  p_user_agent     text DEFAULT NULL,
  p_request_id     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_case public.ca_integrity_cases;
  v_sanction public.ca_integrity_sanctions;
  v_payload jsonb;
  v_hash text;
  v_state text;
BEGIN
  IF p_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED', 'message', 'Operator identity is required');
  END IF;
  IF p_op_id IS NULL OR length(btrim(p_op_id)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OP_ID_REQUIRED', 'message', 'A bounded operation id is required');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('warning', 'restriction', 'confiscation') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SANCTION', 'message', 'Unknown sanction kind');
  END IF;
  IF length(btrim(coalesce(p_note, ''))) NOT BETWEEN 10 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_NOTE', 'message', 'A sanction note of at least ten characters is required');
  END IF;
  IF p_kind = 'confiscation' AND (p_amount IS NULL OR p_amount <= 0 OR p_approval_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPROVAL_REQUIRED', 'message', 'A positive amount and approval are required for confiscation');
  END IF;
  IF p_kind <> 'confiscation' AND (p_amount IS NOT NULL OR p_approval_id IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_MONEY_FIELDS', 'message', 'Only confiscation may carry money approval fields');
  END IF;
  IF p_kind = 'restriction' AND p_restriction_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESTRICTION_REQUIRED', 'message', 'A restriction record is required');
  END IF;
  IF p_kind <> 'restriction' AND p_restriction_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RESTRICTION', 'message', 'Only a restriction sanction may name a restriction');
  END IF;

  v_payload := jsonb_build_object(
    'case_id', p_case_id, 'subject_id', p_subject_id, 'kind', p_kind,
    'amount', p_amount, 'asset', CASE WHEN p_kind = 'confiscation' THEN 'chips' ELSE NULL END,
    'restriction_id', p_restriction_id, 'approval_id', p_approval_id, 'note', btrim(p_note));
  v_hash := md5(v_payload::text);
  SELECT * INTO v_sanction FROM public.ca_integrity_sanctions s WHERE s.op_id = p_op_id;
  IF FOUND THEN
    IF v_sanction.payload_hash <> v_hash THEN
      RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT', 'message', 'This operation id was used for a different sanction');
    END IF;
    RETURN jsonb_build_object('ok', true, 'sanction', to_jsonb(v_sanction), 'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.ca_integrity_cases c WHERE c.id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_NOT_FOUND', 'message', 'Integrity case not found');
  END IF;
  IF v_case.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CASE_CLOSED', 'message', 'A closed case cannot receive a sanction');
  END IF;
  IF NOT (p_subject_id = ANY(v_case.subject_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBJECT_NOT_IN_CASE', 'message', 'That player is not a subject of this case');
  END IF;
  IF p_kind = 'restriction' AND NOT EXISTS (
    SELECT 1 FROM public.ca_player_restrictions r
     WHERE r.id = p_restriction_id AND r.user_id = p_subject_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESTRICTION_NOT_FOUND', 'message', 'That restriction does not belong to this case subject');
  END IF;
  IF p_kind = 'confiscation' AND NOT EXISTS (
    SELECT 1 FROM public.ca_operator_approvals a
     WHERE a.id = p_approval_id AND a.kind = 'sanction' AND a.status = 'approved'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPROVAL_NOT_APPROVED', 'message', 'The confiscation approval is not approved');
  END IF;

  -- Warnings and existing restrictions have already happened elsewhere. A
  -- confiscation is only an approved decision record: this function never
  -- debits chips and deliberately cannot mark it applied.
  v_state := CASE WHEN p_kind = 'confiscation' THEN 'approved' ELSE 'applied' END;
  INSERT INTO public.ca_integrity_sanctions (
    case_id, subject_id, kind, state, amount, asset, restriction_id, approval_id,
    payload, payload_hash, proposed_by, applied_by, applied_at, note, op_id)
  VALUES (
    p_case_id, p_subject_id, p_kind, v_state, p_amount,
    CASE WHEN p_kind = 'confiscation' THEN 'chips' ELSE NULL END,
    p_restriction_id, p_approval_id, v_payload, v_hash, p_actor,
    CASE WHEN v_state = 'applied' THEN p_actor ELSE NULL END,
    CASE WHEN v_state = 'applied' THEN now() ELSE NULL END,
    btrim(p_note), p_op_id)
  RETURNING * INTO v_sanction;

  INSERT INTO public.ca_integrity_case_items (
    case_id, item_type, detail, snapshot_hash, added_by, op_id, payload_hash)
  VALUES (
    p_case_id, 'sanction', jsonb_build_object('sanction_id', v_sanction.id, 'kind', p_kind, 'state', v_state),
    md5(jsonb_build_object('sanction_id', v_sanction.id, 'kind', p_kind, 'state', v_state)::text),
    p_actor, md5('integrity-sanction-event:' || p_op_id), v_hash);

  PERFORM public.fn_ca_integrity_audit(
    p_actor, 'integrity.sanction_propose', 'integrity_case', p_case_id::text,
    jsonb_build_object('op_id', p_op_id, 'kind', p_kind, 'no_chips_moved', p_kind = 'confiscation'),
    NULL, to_jsonb(v_sanction), p_ip_address, p_user_agent, p_request_id);
  RETURN jsonb_build_object(
    'ok', true, 'sanction', to_jsonb(v_sanction), 'idempotent', false,
    'no_chips_moved', p_kind = 'confiscation');
END;
$fn$;

-- Every Phase 5 entry point is server-only. Reads are not audited; mutations
-- write their audit record inside the same transaction as the state change.
REVOKE ALL ON FUNCTION public.fn_ca_integrity_normalize_subjects(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_item_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_action_user(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_action_time(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_json_numeric(jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_audit(uuid, text, text, text, jsonb, jsonb, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_detector_health(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_queue(boolean, text, text, text, timestamptz, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_pairs(boolean, text, timestamptz, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_flags(timestamptz, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_hands(uuid, uuid, timestamptz, integer, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_timing(boolean, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_open(uuid[], text, text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_add_item(uuid, text, text, jsonb, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_retract_item(uuid, uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_assign(uuid, uuid, uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_decide(uuid, text, text, uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_case_close(uuid, text, uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ca_integrity_sanction(uuid, uuid, text, numeric, uuid, uuid, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_detector_health(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_queue(boolean, text, text, text, timestamptz, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_pairs(boolean, text, timestamptz, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_flags(timestamptz, integer, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_hands(uuid, uuid, timestamptz, integer, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_timing(boolean, timestamptz, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_open(uuid[], text, text, text, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_add_item(uuid, text, text, jsonb, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_retract_item(uuid, uuid, text, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_assign(uuid, uuid, uuid, text, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_decide(uuid, text, text, uuid, text, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_case_close(uuid, text, uuid, text, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ca_integrity_sanction(uuid, uuid, text, numeric, uuid, uuid, text, uuid, text, text, text, text) TO service_role;

COMMIT;
