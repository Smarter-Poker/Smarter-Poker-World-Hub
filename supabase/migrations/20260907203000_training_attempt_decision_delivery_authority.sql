-- Seal every delivered decision to one attempt/hand/decision slot. Initial
-- decisions are owned by training_attempt_hands; later streets use the
-- continuation table below. Stable served receipts keep those immutable
-- snapshots answerable after the mutable cache is refreshed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.training_attempt_decision_slots (
  attempt_id uuid NOT NULL REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  hand_ordinal smallint NOT NULL,
  decision_ordinal smallint NOT NULL,
  snapshot_key text NOT NULL REFERENCES public.training_question_snapshots(snapshot_key) ON DELETE RESTRICT,
  parent_snapshot_key text NOT NULL REFERENCES public.training_question_snapshots(snapshot_key) ON DELETE RESTRICT,
  parent_submission_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, hand_ordinal, decision_ordinal),
  FOREIGN KEY (attempt_id, hand_ordinal)
    REFERENCES public.training_attempt_hands(attempt_id, hand_ordinal) ON DELETE CASCADE,
  CONSTRAINT training_attempt_decision_slots_decision_check CHECK (decision_ordinal BETWEEN 2 AND 8),
  CONSTRAINT training_attempt_decision_slots_parent_submission_check
    CHECK (char_length(parent_submission_id) BETWEEN 1 AND 180),
  CONSTRAINT training_attempt_decision_slots_child_parent_check
    CHECK (snapshot_key <> parent_snapshot_key)
);

CREATE INDEX IF NOT EXISTS training_attempt_decision_slots_snapshot_idx
  ON public.training_attempt_decision_slots(snapshot_key);

ALTER TABLE public.training_attempt_decision_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_attempt_decision_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_attempt_decision_slots TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.training_attempt_decision_slots FROM service_role;

CREATE OR REPLACE FUNCTION public.fn_training_reject_decision_slot_update_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_SLOT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS training_attempt_decision_slots_immutable_v1
  ON public.training_attempt_decision_slots;
CREATE TRIGGER training_attempt_decision_slots_immutable_v1
  BEFORE UPDATE ON public.training_attempt_decision_slots
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_reject_decision_slot_update_v1();

-- The predecessor release wrote a random request key before it created the
-- attempt, so there is no truthful migration-time join from that event to an
-- attempt slot. Preserve rolling-deploy sessions through a deliberately
-- bounded compatibility window instead. The service may promote a legacy
-- event only after the API has verified the still-live HMAC receipt; the RPC
-- independently requires the exact old random-key event, manifest snapshot,
-- owner, checksum, receipt timestamps, and (for continuations) prior answer.
CREATE TABLE IF NOT EXISTS public.training_delivery_authority_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  applied_at timestamptz NOT NULL,
  legacy_accept_until timestamptz NOT NULL,
  CONSTRAINT training_delivery_authority_cutover_window_check
    CHECK (legacy_accept_until > applied_at)
);

INSERT INTO public.training_delivery_authority_cutover (
  singleton, applied_at, legacy_accept_until
) VALUES (
  true, clock_timestamp(), clock_timestamp() + interval '7 days'
)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.training_delivery_authority_cutover ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_delivery_authority_cutover FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_training_reject_delivery_cutover_mutation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_DELIVERY_AUTHORITY_CUTOVER_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS training_delivery_authority_cutover_immutable_v1
  ON public.training_delivery_authority_cutover;
CREATE TRIGGER training_delivery_authority_cutover_immutable_v1
  BEFORE UPDATE OR DELETE ON public.training_delivery_authority_cutover
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_reject_delivery_cutover_mutation_v1();

-- This expansion remains rollback-compatible indefinitely: it does not change
-- the answer validator. The first new attempt-scoped served event records an
-- append-only deployment attestation for the later protected contract PR's
-- production gate. Legacy promotion deliberately cannot write this proof.
CREATE TABLE IF NOT EXISTS public.training_delivery_authority_attestations (
  contract_version text PRIMARY KEY,
  first_attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  evidence_event_key text NOT NULL,
  evidence_kind text NOT NULL,
  CONSTRAINT training_delivery_authority_attestation_version_check
    CHECK (contract_version = 'training-attempt-decision-authority-v1'),
  CONSTRAINT training_delivery_authority_attestation_event_check
    CHECK (char_length(evidence_event_key) BETWEEN 1 AND 260),
  CONSTRAINT training_delivery_authority_attestation_kind_check
    CHECK (evidence_kind = 'attempt_scoped_serve')
);

ALTER TABLE public.training_delivery_authority_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_delivery_authority_attestations
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS training_delivery_authority_attestations_immutable_v1
  ON public.training_delivery_authority_attestations;
CREATE TRIGGER training_delivery_authority_attestations_immutable_v1
  BEFORE UPDATE OR DELETE ON public.training_delivery_authority_attestations
  FOR EACH ROW EXECUTE FUNCTION public.fn_training_reject_delivery_cutover_mutation_v1();

CREATE OR REPLACE FUNCTION public.fn_training_register_continuation_slot_v1(
  p_attempt_id uuid,
  p_user_id uuid,
  p_hand_ordinal integer,
  p_decision_ordinal integer,
  p_snapshot_key text,
  p_parent_snapshot_key text,
  p_parent_submission_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_attempt public.training_attempts%ROWTYPE;
  v_parent public.training_answers%ROWTYPE;
  v_candidate public.training_question_snapshots%ROWTYPE;
  v_winner public.training_attempt_decision_slots%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL
     OR p_user_id IS NULL
     OR coalesce(p_hand_ordinal, 0) NOT BETWEEN 1 AND 100
     OR coalesce(p_decision_ordinal, 0) NOT BETWEEN 2 AND 8
     OR nullif(btrim(p_snapshot_key), '') IS NULL
     OR nullif(btrim(p_parent_snapshot_key), '') IS NULL
     OR nullif(btrim(p_parent_submission_id), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_CONTINUATION_SLOT_INPUT_INVALID';
  END IF;

  SELECT * INTO v_attempt FROM public.training_attempts
  WHERE id = p_attempt_id FOR SHARE;
  IF NOT FOUND OR v_attempt.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_ATTEMPT_MISMATCH';
  END IF;
  IF v_attempt.status <> 'open' OR v_attempt.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_NOT_OPEN';
  END IF;

  SELECT * INTO v_parent FROM public.training_answers
  WHERE user_id = p_user_id
    AND submission_id = p_parent_submission_id
    AND attempt_id = p_attempt_id
    AND hand_ordinal = p_hand_ordinal
    AND decision_ordinal = p_decision_ordinal - 1
    AND snapshot_key = p_parent_snapshot_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED';
  END IF;

  SELECT * INTO v_candidate FROM public.training_question_snapshots
  WHERE snapshot_key = p_snapshot_key;
  IF NOT FOUND
     OR v_candidate.game_id <> v_attempt.game_id
     OR v_candidate.level <> v_attempt.level THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_SNAPSHOT_MISMATCH';
  END IF;

  INSERT INTO public.training_attempt_decision_slots (
    attempt_id, hand_ordinal, decision_ordinal, snapshot_key,
    parent_snapshot_key, parent_submission_id
  ) VALUES (
    p_attempt_id, p_hand_ordinal, p_decision_ordinal, p_snapshot_key,
    p_parent_snapshot_key, p_parent_submission_id
  ) ON CONFLICT (attempt_id, hand_ordinal, decision_ordinal) DO NOTHING;

  SELECT * INTO v_winner FROM public.training_attempt_decision_slots
  WHERE attempt_id = p_attempt_id
    AND hand_ordinal = p_hand_ordinal
    AND decision_ordinal = p_decision_ordinal;
  IF NOT FOUND OR v_winner.snapshot_key IS DISTINCT FROM p_snapshot_key THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_SLOT_SNAPSHOT_MISMATCH';
  END IF;
  IF v_winner.parent_snapshot_key IS DISTINCT FROM p_parent_snapshot_key
     OR v_winner.parent_submission_id <> p_parent_submission_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_CONTINUATION_SLOT_PARENT_MISMATCH';
  END IF;

  RETURN jsonb_build_object(
    'attemptId', v_winner.attempt_id,
    'handOrdinal', v_winner.hand_ordinal,
    'decisionOrdinal', v_winner.decision_ordinal,
    'snapshotKey', v_winner.snapshot_key,
    'parentSnapshotKey', v_winner.parent_snapshot_key,
    'parentSubmissionId', v_winner.parent_submission_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_authorize_attempt_decision_v1(
  p_attempt_id uuid,
  p_user_id uuid,
  p_hand_ordinal integer,
  p_decision_ordinal integer,
  p_snapshot_key text,
  p_question_id text,
  p_policy_checksum text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_expected_snapshot text;
  v_snapshot public.training_question_snapshots%ROWTYPE;
  v_event public.training_question_events%ROWTYPE;
  v_event_key text;
BEGIN
  IF p_attempt_id IS NULL
     OR p_user_id IS NULL
     OR coalesce(p_hand_ordinal, 0) NOT BETWEEN 1 AND 100
     OR coalesce(p_decision_ordinal, 0) NOT BETWEEN 1 AND 8
     OR coalesce(p_snapshot_key, '') !~ '^[0-9a-f]{64}$'
     OR nullif(btrim(p_question_id), '') IS NULL
     OR coalesce(p_policy_checksum, '') !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_DECISION_AUTHORITY_INPUT_INVALID');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.training_attempts a
    WHERE a.id = p_attempt_id
      AND a.user_id = p_user_id
      AND a.status = 'open'
      AND a.expires_at > now()
  ) THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_DECISION_ATTEMPT_MISMATCH');
  END IF;

  IF p_decision_ordinal = 1 THEN
    SELECT h.snapshot_key INTO v_expected_snapshot
    FROM public.training_attempt_hands h
    WHERE h.attempt_id = p_attempt_id AND h.hand_ordinal = p_hand_ordinal;
  ELSE
    SELECT s.snapshot_key INTO v_expected_snapshot
    FROM public.training_attempt_decision_slots s
    WHERE s.attempt_id = p_attempt_id
      AND s.hand_ordinal = p_hand_ordinal
      AND s.decision_ordinal = p_decision_ordinal;
  END IF;
  IF v_expected_snapshot IS NULL OR v_expected_snapshot <> p_snapshot_key THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_DECISION_SLOT_MISMATCH');
  END IF;

  SELECT * INTO v_snapshot FROM public.training_question_snapshots
  WHERE snapshot_key = p_snapshot_key;
  IF NOT FOUND
     OR v_snapshot.source_question_id <> p_question_id
     OR lower(coalesce(v_snapshot.question_data ->> 'policyChecksum', '')) <> lower(p_policy_checksum) THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_DECISION_SNAPSHOT_MISMATCH');
  END IF;

  v_event_key := 'training-attempt:' || p_attempt_id::text
    || ':hand:' || p_hand_ordinal::text || ':decision:' || p_decision_ordinal::text;
  SELECT * INTO v_event FROM public.training_question_events e
  WHERE e.event_type = 'served' AND e.event_key = v_event_key;
  IF NOT FOUND
     OR v_event.question_id <> p_question_id
     OR v_event.user_id IS DISTINCT FROM p_user_id
     OR v_event.policy_checksum <> lower(p_policy_checksum)
     OR v_event.metadata ->> 'snapshotKey' IS DISTINCT FROM p_snapshot_key
     OR v_event.metadata ->> 'attemptId' IS DISTINCT FROM p_attempt_id::text
     OR v_event.metadata ->> 'handOrdinal' IS DISTINCT FROM p_hand_ordinal::text
     OR v_event.metadata ->> 'decisionOrdinal' IS DISTINCT FROM p_decision_ordinal::text THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_DECISION_NOT_SERVED');
  END IF;
  RETURN jsonb_build_object('authorized', true, 'eventKey', v_event_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_promote_legacy_signed_decision_v1(
  p_attempt_id uuid,
  p_user_id uuid,
  p_hand_ordinal integer,
  p_decision_ordinal integer,
  p_snapshot_key text,
  p_question_id text,
  p_policy_checksum text,
  p_receipt_id text,
  p_receipt_issued_at bigint,
  p_receipt_expires_at bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_cutover public.training_delivery_authority_cutover%ROWTYPE;
  v_attempt public.training_attempts%ROWTYPE;
  v_hand public.training_attempt_hands%ROWTYPE;
  v_snapshot public.training_question_snapshots%ROWTYPE;
  v_parent public.training_answers%ROWTYPE;
  v_slot public.training_attempt_decision_slots%ROWTYPE;
  v_legacy_event public.training_question_events%ROWTYPE;
  v_replay_parent_answer public.training_answers%ROWTYPE;
  v_existing public.training_question_events%ROWTYPE;
  v_replay_parent_proof boolean := false;
  v_event_key text;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_inserted boolean := false;
BEGIN
  IF p_attempt_id IS NULL
     OR p_user_id IS NULL
     OR coalesce(p_hand_ordinal, 0) NOT BETWEEN 1 AND 100
     OR coalesce(p_decision_ordinal, 0) NOT BETWEEN 1 AND 8
     OR coalesce(p_snapshot_key, '') !~ '^[0-9a-f]{64}$'
     OR nullif(btrim(p_question_id), '') IS NULL
     OR coalesce(p_policy_checksum, '') !~ '^[0-9a-f]{64}$'
     -- Every predecessor receipt omitted receiptId and therefore used
     -- node:crypto randomUUID(). Stable training-attempt:* identifiers belong
     -- to the new delivery protocol and must never enter this compatibility
     -- path when their scoped serve receipt is absent.
     OR coalesce(p_receipt_id, '')
       !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR coalesce(p_receipt_issued_at, 0) <= 0
     OR coalesce(p_receipt_expires_at, 0) <= 0 THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID');
  END IF;

  v_issued_at := to_timestamp(p_receipt_issued_at);
  v_expires_at := to_timestamp(p_receipt_expires_at);
  IF v_issued_at > clock_timestamp() + interval '60 seconds'
     OR v_expires_at <= clock_timestamp()
     OR v_expires_at < v_issued_at + interval '60 seconds'
     OR v_expires_at > v_issued_at + interval '24 hours' THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_RECEIPT_TIME_INVALID');
  END IF;

  SELECT * INTO v_cutover
  FROM public.training_delivery_authority_cutover
  WHERE singleton = true;
  IF NOT FOUND OR clock_timestamp() > v_cutover.legacy_accept_until THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_WINDOW_CLOSED');
  END IF;
  SELECT * INTO v_attempt
  FROM public.training_attempts
  WHERE id = p_attempt_id
  FOR SHARE;
  IF NOT FOUND
     OR v_attempt.user_id IS DISTINCT FROM p_user_id
     OR v_attempt.status <> 'open'
     OR v_attempt.expires_at <= clock_timestamp()
     OR v_attempt.started_at > v_issued_at + interval '5 minutes' THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_ATTEMPT_MISMATCH');
  END IF;

  SELECT * INTO v_hand
  FROM public.training_attempt_hands
  WHERE attempt_id = p_attempt_id AND hand_ordinal = p_hand_ordinal;
  IF NOT FOUND OR v_hand.created_at > v_issued_at + interval '5 minutes' THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_HAND_MISMATCH');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_answers answer
    WHERE answer.attempt_id = p_attempt_id
      AND answer.hand_ordinal = p_hand_ordinal
      AND answer.decision_ordinal = p_decision_ordinal
  ) THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED');
  END IF;

  SELECT * INTO v_snapshot
  FROM public.training_question_snapshots
  WHERE snapshot_key = p_snapshot_key;
  IF NOT FOUND
     OR v_snapshot.game_id IS DISTINCT FROM v_attempt.game_id
     OR v_snapshot.level IS DISTINCT FROM v_attempt.level
     OR v_snapshot.source_question_id IS DISTINCT FROM p_question_id
     OR lower(coalesce(v_snapshot.question_data ->> 'policyChecksum', ''))
       IS DISTINCT FROM lower(p_policy_checksum) THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_SNAPSHOT_MISMATCH');
  END IF;

  -- Direct predecessor routes used a bare randomUUID request key. The shared
  -- persistCanonicalTrainingQuestions helper appended :0 (and :1 for the
  -- second half of a 100-question batch). Accept only those exact historical
  -- shapes. Initial-decision recovery/reissue may sign the immutable manifest
  -- hours after its original event, so that event may correlate with either
  -- the signed receipt or the immutable hand registration. Continuations were
  -- always persisted immediately before signing and remain receipt-correlated.
  SELECT * INTO v_legacy_event
  FROM public.training_question_events e
  WHERE e.event_type = 'served'
    AND e.question_id = p_question_id
    AND e.user_id IS NOT DISTINCT FROM p_user_id
    AND e.policy_checksum = lower(p_policy_checksum)
    AND coalesce(e.metadata ->> 'requestKey', '')
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(:[01])?$'
    AND e.event_key = (e.metadata ->> 'requestKey') || ':'
      || encode(extensions.digest(e.question_id, 'sha256'), 'hex')
    AND (
      e.occurred_at BETWEEN v_issued_at - interval '15 minutes'
        AND v_issued_at + interval '15 minutes'
      OR (
        p_decision_ordinal = 1
        AND e.occurred_at BETWEEN v_hand.created_at - interval '15 minutes'
          AND v_hand.created_at + interval '15 minutes'
      )
    )
  ORDER BY least(
    abs(extract(epoch FROM (e.occurred_at - v_issued_at))),
    CASE WHEN p_decision_ordinal = 1
      THEN abs(extract(epoch FROM (e.occurred_at - v_hand.created_at)))
      ELSE 'Infinity'::double precision
    END
  ), e.event_key
  LIMIT 1;

  -- The predecessor replay branch created a new immutable replay attempt and
  -- signed it without writing a new served event. Do not fabricate one: the
  -- exact completed parent mistake is the durable replay eligibility proof.
  IF NOT FOUND
     AND p_decision_ordinal = 1
     AND v_attempt.session_kind = 'replay'
     AND v_attempt.practice_only IS TRUE
     AND v_attempt.parent_attempt_id IS NOT NULL THEN
    SELECT answer.* INTO v_replay_parent_answer
    FROM public.training_answers answer
    JOIN public.training_attempts parent ON parent.id = v_attempt.parent_attempt_id
    WHERE answer.attempt_id = parent.id
      AND answer.user_id = p_user_id
      AND answer.decision_ordinal = 1
      AND answer.snapshot_key = p_snapshot_key
      AND answer.question_id = p_question_id
      AND answer.is_correct IS FALSE
      AND parent.user_id = p_user_id
      AND parent.game_id = v_attempt.game_id
      AND parent.level = v_attempt.level
      AND parent.status = 'completed'
    ORDER BY answer.answered_at DESC, answer.id
    LIMIT 1;
    v_replay_parent_proof := FOUND;
  END IF;
  IF NOT FOUND AND v_replay_parent_proof IS NOT TRUE THEN
    RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_EVENT_MISSING');
  END IF;

  IF p_decision_ordinal = 1 THEN
    IF v_hand.snapshot_key IS DISTINCT FROM p_snapshot_key THEN
      RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_SLOT_MISMATCH');
    END IF;
  ELSE
    SELECT * INTO v_parent
    FROM public.training_answers
    WHERE attempt_id = p_attempt_id
      AND user_id = p_user_id
      AND hand_ordinal = p_hand_ordinal
      AND decision_ordinal = p_decision_ordinal - 1;
    IF NOT FOUND
       OR v_parent.snapshot_key IS NULL
       OR v_parent.snapshot_key = p_snapshot_key
       OR v_parent.submission_id IS NULL
       OR v_parent.answered_at > v_issued_at + interval '5 minutes' THEN
      RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_PARENT_MISMATCH');
    END IF;

    INSERT INTO public.training_attempt_decision_slots (
      attempt_id, hand_ordinal, decision_ordinal, snapshot_key,
      parent_snapshot_key, parent_submission_id, created_at
    ) VALUES (
      p_attempt_id, p_hand_ordinal, p_decision_ordinal, p_snapshot_key,
      v_parent.snapshot_key, v_parent.submission_id, v_issued_at
    ) ON CONFLICT (attempt_id, hand_ordinal, decision_ordinal) DO NOTHING;

    SELECT * INTO v_slot
    FROM public.training_attempt_decision_slots
    WHERE attempt_id = p_attempt_id
      AND hand_ordinal = p_hand_ordinal
      AND decision_ordinal = p_decision_ordinal;
    IF NOT FOUND
       OR v_slot.snapshot_key IS DISTINCT FROM p_snapshot_key
       OR v_slot.parent_snapshot_key IS DISTINCT FROM v_parent.snapshot_key
       OR v_slot.parent_submission_id IS DISTINCT FROM v_parent.submission_id THEN
      RETURN jsonb_build_object('authorized', false, 'code', 'TRAINING_LEGACY_PROMOTION_SLOT_MISMATCH');
    END IF;
  END IF;

  v_event_key := 'training-attempt:' || p_attempt_id::text
    || ':hand:' || p_hand_ordinal::text || ':decision:' || p_decision_ordinal::text;
  INSERT INTO public.training_question_events (
    event_type, event_key, question_id, user_id, is_correct,
    policy_checksum, metadata, occurred_at
  ) VALUES (
    'served', v_event_key, p_question_id, p_user_id, NULL,
    lower(p_policy_checksum),
    jsonb_strip_nulls(jsonb_build_object(
      'attemptId', p_attempt_id,
      'handOrdinal', p_hand_ordinal,
      'decisionOrdinal', p_decision_ordinal,
      'snapshotKey', p_snapshot_key,
      'legacySignedReceiptRecovery', true,
      'legacyReceiptId', p_receipt_id,
      'legacyReceiptIssuedAt', p_receipt_issued_at,
      'legacyReceiptExpiresAt', p_receipt_expires_at,
      'legacyProofKind', CASE WHEN v_replay_parent_proof
        THEN 'replay_parent_answer' ELSE 'predecessor_served_event' END,
      'migratedFromEventKey', CASE WHEN v_replay_parent_proof
        THEN NULL ELSE v_legacy_event.event_key END,
      'legacyReplayParentSubmissionId', CASE WHEN v_replay_parent_proof
        THEN v_replay_parent_answer.submission_id ELSE NULL END,
      'promotedAt', clock_timestamp()
    )),
    coalesce(v_legacy_event.occurred_at, v_hand.created_at)
  ) ON CONFLICT (event_type, event_key) DO NOTHING;
  v_inserted := FOUND;

  SELECT * INTO v_existing
  FROM public.training_question_events e
  WHERE e.event_type = 'served' AND e.event_key = v_event_key;
  IF NOT FOUND
     OR v_existing.question_id IS DISTINCT FROM p_question_id
     OR v_existing.user_id IS DISTINCT FROM p_user_id
     OR v_existing.policy_checksum IS DISTINCT FROM lower(p_policy_checksum)
     OR v_existing.metadata ->> 'snapshotKey' IS DISTINCT FROM p_snapshot_key
     OR v_existing.metadata ->> 'attemptId' IS DISTINCT FROM p_attempt_id::text
     OR v_existing.metadata ->> 'handOrdinal' IS DISTINCT FROM p_hand_ordinal::text
     OR v_existing.metadata ->> 'decisionOrdinal' IS DISTINCT FROM p_decision_ordinal::text THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_LEGACY_PROMOTION_EVENT_CONFLICT';
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'promoted', v_inserted,
    'eventKey', v_event_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_training_attempt_record_served_batch_v1(
  p_attempt_id uuid,
  p_user_id uuid,
  p_deliveries jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_delivery jsonb;
  v_attempt public.training_attempts%ROWTYPE;
  v_hand integer;
  v_decision integer;
  v_snapshot_key text;
  v_question_id text;
  v_checksum text;
  v_expected_snapshot text;
  v_snapshot public.training_question_snapshots%ROWTYPE;
  v_existing public.training_question_events%ROWTYPE;
  v_event_key text;
  v_count integer := 0;
  v_slots text[] := ARRAY[]::text[];
BEGIN
  IF p_attempt_id IS NULL
     OR p_user_id IS NULL
     OR coalesce(jsonb_typeof(p_deliveries), '') <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_ATTEMPT_SERVE_AUDIT_INVALID';
  END IF;
  IF jsonb_array_length(p_deliveries) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_ATTEMPT_SERVE_AUDIT_INVALID';
  END IF;
  SELECT * INTO v_attempt FROM public.training_attempts a
  WHERE a.id = p_attempt_id FOR SHARE;
  IF NOT FOUND OR v_attempt.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_SERVE_OWNER_MISMATCH';
  END IF;
  IF v_attempt.status <> 'open' OR v_attempt.expires_at <= now() THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_NOT_OPEN';
  END IF;

  FOR v_delivery IN SELECT value FROM jsonb_array_elements(p_deliveries)
  LOOP
    v_hand := (v_delivery ->> 'handOrdinal')::integer;
    v_decision := (v_delivery ->> 'decisionOrdinal')::integer;
    v_snapshot_key := v_delivery ->> 'snapshotKey';
    v_question_id := v_delivery ->> 'questionId';
    v_checksum := lower(v_delivery ->> 'policyChecksum');
    IF coalesce(v_hand, 0) NOT BETWEEN 1 AND 100
       OR coalesce(v_decision, 0) NOT BETWEEN 1 AND 8
       OR coalesce(v_snapshot_key, '') !~ '^[0-9a-f]{64}$'
       OR nullif(btrim(v_question_id), '') IS NULL
       OR coalesce(v_checksum, '') !~ '^[0-9a-f]{64}$'
       OR (v_hand::text || ':' || v_decision::text) = ANY(v_slots) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_ATTEMPT_SERVE_AUDIT_INVALID';
    END IF;
    v_slots := array_append(v_slots, v_hand::text || ':' || v_decision::text);

    IF EXISTS (
      SELECT 1 FROM public.training_answers answer
      WHERE answer.attempt_id = p_attempt_id
        AND answer.hand_ordinal = v_hand
        AND answer.decision_ordinal = v_decision
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED';
    END IF;

    IF v_decision = 1 THEN
      SELECT h.snapshot_key INTO v_expected_snapshot FROM public.training_attempt_hands h
      WHERE h.attempt_id = p_attempt_id AND h.hand_ordinal = v_hand;
    ELSE
      SELECT s.snapshot_key INTO v_expected_snapshot FROM public.training_attempt_decision_slots s
      WHERE s.attempt_id = p_attempt_id
        AND s.hand_ordinal = v_hand AND s.decision_ordinal = v_decision;
    END IF;
    IF v_expected_snapshot IS NULL OR v_expected_snapshot <> v_snapshot_key THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_SERVE_SLOT_MISMATCH';
    END IF;

    SELECT * INTO v_snapshot FROM public.training_question_snapshots
    WHERE snapshot_key = v_snapshot_key;
    IF NOT FOUND
       OR v_snapshot.source_question_id <> v_question_id
       OR lower(coalesce(v_snapshot.question_data ->> 'policyChecksum', '')) <> v_checksum THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_SERVE_SNAPSHOT_MISMATCH';
    END IF;

    v_event_key := 'training-attempt:' || p_attempt_id::text
      || ':hand:' || v_hand::text || ':decision:' || v_decision::text;
    SELECT * INTO v_existing FROM public.training_question_events e
    WHERE e.event_type = 'served' AND e.event_key = v_event_key;
    IF FOUND AND (
      v_existing.question_id <> v_question_id
      OR v_existing.user_id IS DISTINCT FROM p_user_id
      OR v_existing.policy_checksum <> v_checksum
      OR v_existing.metadata ->> 'snapshotKey' IS DISTINCT FROM v_snapshot_key
      OR v_existing.metadata ->> 'attemptId' IS DISTINCT FROM p_attempt_id::text
      OR v_existing.metadata ->> 'handOrdinal' IS DISTINCT FROM v_hand::text
      OR v_existing.metadata ->> 'decisionOrdinal' IS DISTINCT FROM v_decision::text
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TRAINING_ATTEMPT_SERVE_EVENT_MISMATCH';
    END IF;

    PERFORM public.fn_training_cache_record_event(
      'served', v_event_key, v_question_id, p_user_id, NULL,
      jsonb_build_object(
        'attemptId', p_attempt_id,
        'handOrdinal', v_hand,
        'decisionOrdinal', v_decision,
        'snapshotKey', v_snapshot_key
      ),
      now(), v_checksum
    );
    v_count := v_count + 1;
  END LOOP;
  INSERT INTO public.training_delivery_authority_attestations (
    contract_version, first_attested_at, evidence_event_key, evidence_kind
  ) VALUES (
    'training-attempt-decision-authority-v1', clock_timestamp(),
    v_event_key, 'attempt_scoped_serve'
  ) ON CONFLICT (contract_version) DO NOTHING;
  RETURN jsonb_build_object('questionCount', v_count);
END;
$$;

-- Expansion-compatible cache accounting. A predecessor answer still follows
-- its existing validator path. When its immutable attempt snapshot refers to
-- a policy that has since left the mutable cache, preserve the answer event
-- without incrementing counters on a replacement policy.
CREATE OR REPLACE FUNCTION public.fn_training_answer_cache_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_checksum text := lower(nullif(NEW.evidence_metadata ->> 'policyChecksum', ''));
  v_existing public.training_question_events%ROWTYPE;
  v_event_key text := 'training-answer:' || NEW.id::text;
BEGIN
  IF v_checksum IS NULL THEN RETURN NEW; END IF;
  IF v_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'training_answer_invalid_policy_checksum';
  END IF;
  IF NEW.attempt_id IS NULL OR EXISTS (
    SELECT 1 FROM public.training_question_cache c
    WHERE c.question_id = NEW.question_id
      AND c.quality_status IN ('active', 'active_fallback')
      AND c.policy_checksum = v_checksum
  ) THEN
    PERFORM public.fn_training_cache_record_event(
      'answered', v_event_key, NEW.question_id, NEW.user_id, NEW.is_correct,
      jsonb_build_object(
        'answerId', NEW.id, 'submissionId', NEW.submission_id,
        'classification', NEW.classification, 'solverVerified', NEW.solver_verified
      ), coalesce(NEW.answered_at, now()), v_checksum
    );
    RETURN NEW;
  END IF;

  INSERT INTO public.training_question_events (
    event_type, event_key, question_id, user_id, is_correct,
    policy_checksum, metadata, occurred_at
  ) VALUES (
    'answered', v_event_key, NEW.question_id, NEW.user_id, NEW.is_correct,
    v_checksum,
    jsonb_build_object(
      'answerId', NEW.id, 'submissionId', NEW.submission_id,
      'classification', NEW.classification, 'solverVerified', NEW.solver_verified,
      'immutableSnapshotRecovery', true, 'snapshotKey', NEW.snapshot_key
    ), coalesce(NEW.answered_at, now())
  ) ON CONFLICT (event_type, event_key) DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO v_existing FROM public.training_question_events e
    WHERE e.event_type = 'answered' AND e.event_key = v_event_key;
    IF NOT FOUND OR v_existing.question_id <> NEW.question_id
       OR v_existing.user_id IS DISTINCT FROM NEW.user_id
       OR v_existing.is_correct IS DISTINCT FROM NEW.is_correct
       OR v_existing.policy_checksum <> v_checksum THEN
      RAISE EXCEPTION 'training_cache_event_binding_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_training_register_continuation_slot_v1(uuid, uuid, integer, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_authorize_attempt_decision_v1(uuid, uuid, integer, integer, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_promote_legacy_signed_decision_v1(uuid, uuid, integer, integer, text, text, text, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_attempt_record_served_batch_v1(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_reject_decision_slot_update_v1()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_training_reject_delivery_cutover_mutation_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_training_answer_cache_event()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_training_register_continuation_slot_v1(uuid, uuid, integer, integer, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_authorize_attempt_decision_v1(uuid, uuid, integer, integer, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_promote_legacy_signed_decision_v1(uuid, uuid, integer, integer, text, text, text, text, bigint, bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_training_attempt_record_served_batch_v1(uuid, uuid, jsonb)
  TO service_role;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.training_attempt_decision_slots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_attempt_decision_slots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_attempt_decision_slots', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.training_attempt_decision_slots', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_attempt_decision_slots', 'INSERT')
     OR has_table_privilege('service_role', 'public.training_attempt_decision_slots', 'UPDATE')
     OR has_table_privilege('service_role', 'public.training_attempt_decision_slots', 'DELETE') THEN
    RAISE EXCEPTION 'TRAINING_CONTINUATION_SLOT_PRIVILEGE_DRIFT';
  END IF;
  IF has_table_privilege('anon', 'public.training_delivery_authority_cutover', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_delivery_authority_cutover', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_cutover', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_cutover', 'INSERT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_cutover', 'UPDATE')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_cutover', 'DELETE') THEN
    RAISE EXCEPTION 'TRAINING_DELIVERY_AUTHORITY_CUTOVER_PRIVILEGE_DRIFT';
  END IF;
  IF has_table_privilege('anon', 'public.training_delivery_authority_attestations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.training_delivery_authority_attestations', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_attestations', 'SELECT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_attestations', 'INSERT')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_attestations', 'UPDATE')
     OR has_table_privilege('service_role', 'public.training_delivery_authority_attestations', 'DELETE') THEN
    RAISE EXCEPTION 'TRAINING_DELIVERY_AUTHORITY_ATTESTATION_PRIVILEGE_DRIFT';
  END IF;
  IF has_function_privilege('anon',
       'public.fn_training_register_continuation_slot_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_authorize_attempt_decision_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_promote_legacy_signed_decision_v1(uuid,uuid,integer,integer,text,text,text,text,bigint,bigint)', 'EXECUTE')
     OR has_function_privilege('anon',
       'public.fn_training_attempt_record_served_batch_v1(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_register_continuation_slot_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_authorize_attempt_decision_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_promote_legacy_signed_decision_v1(uuid,uuid,integer,integer,text,text,text,text,bigint,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.fn_training_attempt_record_served_batch_v1(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_register_continuation_slot_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_authorize_attempt_decision_v1(uuid,uuid,integer,integer,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_promote_legacy_signed_decision_v1(uuid,uuid,integer,integer,text,text,text,text,bigint,bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.fn_training_attempt_record_served_batch_v1(uuid,uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TRAINING_DECISION_AUTHORITY_FUNCTION_PRIVILEGE_DRIFT';
  END IF;
END;
$$;

COMMIT;
