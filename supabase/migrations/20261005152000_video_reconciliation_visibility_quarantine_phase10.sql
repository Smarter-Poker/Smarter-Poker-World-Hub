-- 20261005152000_video_reconciliation_visibility_quarantine_phase10.sql
-- TIER:        2
-- AUTHOR:      Codex
-- AFFECTS:     social_reels, social_reel_reconciliation_quarantine,
--              new visibility snapshot table, guards, and admin aggregate RPC
-- IRREVERSIBLE: no
--
-- WHY:
--   Production review found 160 unresolved Reel identity cases whose 322
--   involved rows were still public. The existing reconciliation function
--   recorded mixed-author/source conflicts, then returned without suppressing
--   them. Quarantine must be a visibility boundary while evidence is reviewed.
--
-- HOW:
--   - records the pre-quarantine public/native-processing flags without
--     changing engagement, authorship, rights evidence, or Reel identity;
--   - hides current and future members of every unresolved quarantine case;
--   - exposes only bounded aggregate counts to the admin operations RPC.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $preflight$
BEGIN
  IF to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.social_reel_reconciliation_quarantine') IS NULL
  THEN
    RAISE EXCEPTION 'preflight: Reel reconciliation tables are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reels'
      AND column_name = 'is_public' AND data_type = 'boolean'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reels'
      AND column_name = 'native_processing_requested' AND data_type = 'boolean'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reels'
      AND column_name = 'id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reel_reconciliation_quarantine'
      AND column_name = 'quarantine_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reel_reconciliation_quarantine'
      AND column_name = 'proposed_canonical_reel_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reel_reconciliation_quarantine'
      AND column_name = 'proposed_alias_reel_ids' AND data_type = 'ARRAY'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_reel_reconciliation_quarantine'
      AND column_name = 'resolved_at'
  ) THEN
    RAISE EXCEPTION 'preflight: Reel visibility quarantine columns are missing or drifted';
  END IF;
  IF to_regprocedure('public.fn_video_reconciliation_quarantine_snapshot()') IS NOT NULL
     OR to_regclass('public.social_reel_reconciliation_visibility') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid IN ('public.social_reels'::regclass,
                         'public.social_reel_reconciliation_quarantine'::regclass)
         AND tgname IN (
           'trg_guard_reel_reconciliation_visibility_insert',
           'trg_guard_reel_reconciliation_visibility_update',
           'trg_suppress_unresolved_reel_reconciliation_quarantine'
         ) AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'preflight: Reel visibility quarantine objects already exist';
  END IF;
END
$preflight$;

CREATE TABLE public.social_reel_reconciliation_visibility (
  quarantine_id uuid NOT NULL
    REFERENCES public.social_reel_reconciliation_quarantine(quarantine_id) ON DELETE RESTRICT,
  reel_id uuid NOT NULL REFERENCES public.social_reels(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED,
  prior_is_public boolean,
  prior_native_processing_requested boolean NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (quarantine_id, reel_id)
  );
ALTER TABLE public.social_reel_reconciliation_visibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_reel_reconciliation_visibility FROM PUBLIC, anon, authenticated, service_role;
CREATE POLICY social_reel_reconciliation_visibility_service_read
  ON public.social_reel_reconciliation_visibility FOR SELECT TO service_role
  USING (true);
GRANT SELECT ON public.social_reel_reconciliation_visibility TO service_role;
CREATE INDEX social_reel_reconciliation_visibility_reel_idx
  ON public.social_reel_reconciliation_visibility(reel_id);

CREATE INDEX social_reel_quarantine_open_canonical_idx
  ON public.social_reel_reconciliation_quarantine(proposed_canonical_reel_id)
  WHERE resolved_at IS NULL AND proposed_canonical_reel_id IS NOT NULL;
CREATE INDEX social_reel_quarantine_open_aliases_gin_idx
  ON public.social_reel_reconciliation_quarantine USING gin(proposed_alias_reel_ids)
  WHERE resolved_at IS NULL;

CREATE FUNCTION public.fn_guard_reel_reconciliation_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_reel_ids uuid[];
  v_reel_id uuid;
BEGIN
  v_reel_ids := array_remove(
    array_append(coalesce(NEW.proposed_alias_reel_ids, ARRAY[]::uuid[]),
                 NEW.proposed_canonical_reel_id),
    NULL::uuid
  );
  IF NEW.resolved_at IS NOT NULL OR cardinality(v_reel_ids) = 0 THEN
    RETURN NEW;
  END IF;

  -- Serialize group admission with the Reel insert/update guard, including
  -- references whose Reel row has not been created yet.
  FOR v_reel_id IN SELECT DISTINCT member.reel_id
    FROM unnest(v_reel_ids) AS member(reel_id)
    ORDER BY member.reel_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'video_reel_reconciliation_visibility:' || v_reel_id::text, 0
    ));
  END LOOP;

  INSERT INTO public.social_reel_reconciliation_visibility(
    quarantine_id, reel_id, prior_is_public, prior_native_processing_requested
  )
  SELECT NEW.quarantine_id, reel.id, reel.is_public, reel.native_processing_requested
  FROM public.social_reels AS reel
  WHERE reel.id = ANY(v_reel_ids)
  ORDER BY reel.id
  ON CONFLICT (quarantine_id, reel_id) DO NOTHING;

  UPDATE public.social_reels
  SET is_public = false,
      native_processing_requested = false
  WHERE id = ANY(v_reel_ids)
    AND (is_public IS DISTINCT FROM false OR native_processing_requested IS DISTINCT FROM false);
  RETURN NEW;
END
$function$;

CREATE FUNCTION public.fn_keep_unresolved_reel_quarantine_private()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_quarantine_id uuid;
BEGIN
  IF NEW.is_public IS DISTINCT FROM false
     OR NEW.native_processing_requested IS DISTINCT FROM false THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'video_reel_reconciliation_visibility:' || NEW.id::text, 0
    ));
    FOR v_quarantine_id IN
      SELECT quarantine.quarantine_id
      FROM public.social_reel_reconciliation_quarantine AS quarantine
      WHERE quarantine.resolved_at IS NULL
        AND (
          quarantine.proposed_canonical_reel_id = NEW.id
          OR quarantine.proposed_alias_reel_ids @> ARRAY[NEW.id]::uuid[]
        )
      ORDER BY quarantine.quarantine_id
    LOOP
      INSERT INTO public.social_reel_reconciliation_visibility(
        quarantine_id, reel_id, prior_is_public, prior_native_processing_requested
      ) VALUES (
        v_quarantine_id, NEW.id, NEW.is_public, NEW.native_processing_requested
      ) ON CONFLICT (quarantine_id, reel_id) DO NOTHING;
    END LOOP;
    IF FOUND THEN
      NEW.is_public := false;
      NEW.native_processing_requested := false;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_guard_reel_reconciliation_visibility_insert
BEFORE INSERT ON public.social_reels
FOR EACH ROW EXECUTE FUNCTION public.fn_keep_unresolved_reel_quarantine_private();
CREATE TRIGGER trg_guard_reel_reconciliation_visibility_update
BEFORE UPDATE OF id, is_public, native_processing_requested ON public.social_reels
FOR EACH ROW EXECUTE FUNCTION public.fn_keep_unresolved_reel_quarantine_private();
CREATE TRIGGER trg_suppress_unresolved_reel_reconciliation_quarantine
AFTER INSERT ON public.social_reel_reconciliation_quarantine
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_reel_reconciliation_visibility();
CREATE TRIGGER trg_suppress_updated_unresolved_reel_reconciliation_quarantine
AFTER UPDATE OF proposed_canonical_reel_id, proposed_alias_reel_ids, resolved_at
ON public.social_reel_reconciliation_quarantine
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_reel_reconciliation_visibility();

-- Existing open cases are captured and suppressed in the same transaction.
-- No engagement, creator, attribution, or legal evidence rows are rewritten.
WITH open_members AS MATERIALIZED (
  SELECT quarantine.quarantine_id, reel.id AS reel_id,
         reel.is_public, reel.native_processing_requested
  FROM public.social_reel_reconciliation_quarantine AS quarantine
  CROSS JOIN LATERAL unnest(
    array_remove(
      array_append(coalesce(quarantine.proposed_alias_reel_ids, ARRAY[]::uuid[]),
                   quarantine.proposed_canonical_reel_id),
      NULL::uuid
    )
  ) AS member(reel_id)
  JOIN public.social_reels AS reel ON reel.id = member.reel_id
  WHERE quarantine.resolved_at IS NULL
  FOR UPDATE OF reel
), captured AS (
  INSERT INTO public.social_reel_reconciliation_visibility(
    quarantine_id, reel_id, prior_is_public, prior_native_processing_requested
  )
  SELECT quarantine_id, reel_id, is_public, native_processing_requested
  FROM open_members
  ON CONFLICT (quarantine_id, reel_id) DO NOTHING
  RETURNING reel_id
)
UPDATE public.social_reels AS reel
SET is_public = false,
    native_processing_requested = false
WHERE reel.id IN (SELECT reel_id FROM open_members)
  AND (reel.is_public IS DISTINCT FROM false
       OR reel.native_processing_requested IS DISTINCT FROM false);

CREATE FUNCTION public.fn_video_reconciliation_quarantine_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH open_groups AS (
    SELECT quarantine_id, reason_code,
      array_remove(
        array_append(coalesce(proposed_alias_reel_ids, ARRAY[]::uuid[]),
                     proposed_canonical_reel_id),
        NULL::uuid
      ) AS reel_ids
    FROM public.social_reel_reconciliation_quarantine
    WHERE resolved_at IS NULL
  ), members AS (
    SELECT DISTINCT group_row.quarantine_id, group_row.reason_code, member.reel_id
    FROM open_groups AS group_row
    CROSS JOIN LATERAL unnest(group_row.reel_ids) AS member(reel_id)
  ), reason_counts AS (
    SELECT reason_code, count(*)::bigint AS groups
    FROM open_groups
    GROUP BY reason_code
  )
  SELECT jsonb_build_object(
    'openGroups', (SELECT count(*)::bigint FROM open_groups),
    'reelRows', (SELECT count(DISTINCT member.reel_id)::bigint
                 FROM members AS member
                 JOIN public.social_reels AS reel ON reel.id = member.reel_id),
    'suppressedRows', (SELECT count(DISTINCT member.reel_id)::bigint
                       FROM members AS member
                       JOIN public.social_reel_reconciliation_visibility AS visibility
                         ON visibility.quarantine_id = member.quarantine_id
                        AND visibility.reel_id = member.reel_id
                       WHERE visibility.prior_is_public IS TRUE),
    'publicRows', (SELECT count(DISTINCT member.reel_id)::bigint
                   FROM members AS member
                   JOIN public.social_reels AS reel ON reel.id = member.reel_id
                   WHERE reel.is_public IS TRUE),
    'unsafeRows', (SELECT count(DISTINCT member.reel_id)::bigint
                   FROM members AS member
                   JOIN public.social_reels AS reel ON reel.id = member.reel_id
                   WHERE reel.is_public IS TRUE OR reel.native_processing_requested IS TRUE),
    'nativeProcessingRows', (SELECT count(DISTINCT member.reel_id)::bigint
                             FROM members AS member
                             JOIN public.social_reels AS reel ON reel.id = member.reel_id
                             WHERE reel.native_processing_requested IS TRUE),
    'missingSnapshots', (SELECT count(*)::bigint
                         FROM members AS member
                         JOIN public.social_reels AS reel ON reel.id = member.reel_id
                         LEFT JOIN public.social_reel_reconciliation_visibility AS visibility
                           ON visibility.quarantine_id = member.quarantine_id
                          AND visibility.reel_id = member.reel_id
                         WHERE visibility.reel_id IS NULL),
    'missingReelReferences', (SELECT count(*)::bigint
                              FROM members AS member
                              LEFT JOIN public.social_reels AS reel ON reel.id = member.reel_id
                              WHERE reel.id IS NULL),
    'byReason', coalesce((
      SELECT jsonb_agg(jsonb_build_object('reasonCode', reason_code, 'groups', groups)
                       ORDER BY reason_code)
      FROM (
        SELECT CASE WHEN reason_code IN (
          'active_transcode_job', 'existing_alias_chain', 'interaction_collision',
          'like_collision', 'mixed_attribution', 'mixed_author', 'mixed_canonical_key',
          'mixed_media', 'mixed_playback', 'mixed_rights', 'mixed_source_post',
          'mixed_topic', 'missing_reel', 'save_collision'
        ) THEN reason_code ELSE 'other' END AS reason_code, sum(groups)::bigint AS groups
        FROM reason_counts
        GROUP BY 1
      ) AS safe_reason_counts
    ), '[]'::jsonb)
  )
$function$;

REVOKE ALL ON FUNCTION public.fn_guard_reel_reconciliation_visibility()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_keep_unresolved_reel_quarantine_private()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_video_reconciliation_quarantine_snapshot()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_video_reconciliation_quarantine_snapshot()
  TO service_role;

DO $postflight$
BEGIN
  IF to_regclass('public.social_reel_reconciliation_visibility') IS NULL
     OR to_regprocedure('public.fn_video_reconciliation_quarantine_snapshot()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_index
       WHERE indexrelid = 'public.social_reel_reconciliation_visibility_reel_idx'::regclass
         AND indisvalid AND indisready
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.social_reels'::regclass
         AND tgname = 'trg_guard_reel_reconciliation_visibility_insert'
         AND tgenabled <> 'D' AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.social_reels'::regclass
         AND tgname = 'trg_guard_reel_reconciliation_visibility_update'
         AND tgenabled <> 'D' AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.social_reel_reconciliation_quarantine'::regclass
         AND tgname = 'trg_suppress_unresolved_reel_reconciliation_quarantine'
         AND tgenabled <> 'D' AND NOT tgisinternal
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.social_reel_reconciliation_quarantine'::regclass
         AND tgname = 'trg_suppress_updated_unresolved_reel_reconciliation_quarantine'
         AND tgenabled <> 'D' AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'postflight: Reel quarantine visibility triggers are missing or disabled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_reel_reconciliation_quarantine AS quarantine
    CROSS JOIN LATERAL unnest(
      array_remove(
        array_append(coalesce(quarantine.proposed_alias_reel_ids, ARRAY[]::uuid[]),
                     quarantine.proposed_canonical_reel_id),
        NULL::uuid
      )
    ) AS member(reel_id)
    JOIN public.social_reels AS reel ON reel.id = member.reel_id
    WHERE quarantine.resolved_at IS NULL
      AND (reel.is_public IS TRUE OR reel.native_processing_requested IS TRUE)
  ) THEN
    RAISE EXCEPTION 'postflight: an unresolved quarantined Reel remains public or eligible for native processing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.social_reel_reconciliation_quarantine AS quarantine
    CROSS JOIN LATERAL unnest(
      array_remove(
        array_append(coalesce(quarantine.proposed_alias_reel_ids, ARRAY[]::uuid[]),
                     quarantine.proposed_canonical_reel_id),
        NULL::uuid
      )
    ) AS member(reel_id)
    JOIN public.social_reels AS reel ON reel.id = member.reel_id
    LEFT JOIN public.social_reel_reconciliation_visibility AS visibility
      ON visibility.quarantine_id = quarantine.quarantine_id
     AND visibility.reel_id = reel.id
    WHERE quarantine.resolved_at IS NULL AND visibility.reel_id IS NULL
  ) THEN
    RAISE EXCEPTION 'postflight: an unresolved Reel has no pre-quarantine visibility snapshot';
  END IF;

  IF has_table_privilege('anon', 'public.social_reel_reconciliation_visibility', 'SELECT')
     OR has_table_privilege('authenticated', 'public.social_reel_reconciliation_visibility', 'SELECT')
     OR has_table_privilege('anon', 'public.social_reel_reconciliation_visibility', 'INSERT')
     OR has_table_privilege('authenticated', 'public.social_reel_reconciliation_visibility', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.social_reel_reconciliation_visibility', 'SELECT')
     OR has_table_privilege('service_role', 'public.social_reel_reconciliation_visibility', 'INSERT')
     OR has_table_privilege('service_role', 'public.social_reel_reconciliation_visibility', 'UPDATE')
     OR has_table_privilege('service_role', 'public.social_reel_reconciliation_visibility', 'DELETE')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.social_reel_reconciliation_visibility'::regclass)
     OR has_function_privilege('anon', 'public.fn_video_reconciliation_quarantine_snapshot()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_video_reconciliation_quarantine_snapshot()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.fn_video_reconciliation_quarantine_snapshot()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_guard_reel_reconciliation_visibility()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_guard_reel_reconciliation_visibility()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_guard_reel_reconciliation_visibility()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_keep_unresolved_reel_quarantine_private()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_keep_unresolved_reel_quarantine_private()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.fn_keep_unresolved_reel_quarantine_private()', 'EXECUTE')
     OR NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'social_reel_reconciliation_visibility'
         AND policyname = 'social_reel_reconciliation_visibility_service_read'
         AND cmd = 'SELECT' AND roles = ARRAY['service_role']::name[]
     )
  THEN
    RAISE EXCEPTION 'postflight: Reel quarantine visibility access boundary is invalid';
  END IF;
END
$postflight$;

NOTIFY pgrst, 'reload schema';
COMMIT;
