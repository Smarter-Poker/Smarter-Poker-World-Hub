-- ============================================================================
-- 20261001221500_social_reel_alias_reconciliation.sql
-- ============================================================================
-- TIER:        3
-- AUTHOR:      Codex
-- AFFECTS:     social_reels, social_likes, social_comments,
--              social_interactions, saved_reels, new reconciliation tables/RPCs
-- IRREVERSIBLE: no
--
-- WHY:
--   Canonical Reel selection was previously a read-time convention. Historical
--   loser UUIDs had no durable winner, and engagement could remain stranded or
--   continue landing on a loser. This additive foundation records immutable
--   aliases and supplies a deliberately conservative, transaction-bound merge.
--
-- HOW:
--   - records every alias, winner, attribution snapshot, operation and refusal;
--   - rejects alias chains, cycles, self-links, mixed keys and attribution drift;
--   - resolves Reel and source-post bookmarks without making hidden rows public;
--   - moves engagement only when no user-level uniqueness collision exists;
--   - recomputes counters from authoritative interaction rows and sums views;
--   - keeps loser rows as hidden tombstones so old UUIDs remain auditable.
-- ============================================================================

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.social_likes') IS NULL
     OR to_regclass('public.social_comments') IS NULL
     OR to_regclass('public.social_interactions') IS NULL
     OR to_regclass('public.saved_reels') IS NULL
  THEN
    RAISE EXCEPTION 'reel reconciliation pre-flight failed: required social tables are missing';
  END IF;

  IF EXISTS (
    SELECT required.table_name, required.column_name
    FROM (VALUES
      ('social_reels', 'id'), ('social_reels', 'author_id'),
      ('social_reels', 'source_post_id'), ('social_reels', 'video_url'),
      ('social_reels', 'original_youtube_url'), ('social_reels', 'youtube_video_id'),
      ('social_reels', 'origin_type'), ('social_reels', 'playback_type'),
      ('social_reels', 'topic'), ('social_reels', 'rights_status'),
      ('social_reels', 'source_asset_id'), ('social_reels', 'canonical_asset_key'),
      ('social_reels', 'is_public'), ('social_reels', 'native_processing_requested'),
      ('social_reels', 'view_count'), ('social_reels', 'like_count'),
      ('social_reels', 'comment_count'), ('social_reels', 'share_count'),
      ('video_transcode_jobs', 'reel_id'), ('video_transcode_jobs', 'status'),
      ('social_likes', 'post_id'), ('social_likes', 'user_id'),
      ('social_comments', 'post_id'), ('social_comments', 'post_source'),
      ('saved_reels', 'reel_id'),
      ('saved_reels', 'user_id'), ('saved_reels', 'source_type'),
      ('social_interactions', 'post_id'), ('social_interactions', 'user_id'),
      ('social_interactions', 'interaction_type'), ('social_interactions', 'metadata')
    ) AS required(table_name, column_name)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = required.table_name
     AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'reel reconciliation pre-flight failed: required columns are missing';
  END IF;
  IF EXISTS (
    SELECT expected.table_name, expected.column_name
    FROM (VALUES
      ('social_reels', 'id', 'uuid'),
      ('social_reels', 'source_post_id', 'uuid'),
      ('social_reels', 'source_asset_id', 'uuid'),
      ('video_transcode_jobs', 'reel_id', 'uuid'),
      ('social_likes', 'post_id', 'uuid'),
      ('social_comments', 'post_id', 'uuid'),
      ('saved_reels', 'reel_id', 'uuid'),
      ('social_interactions', 'post_id', 'uuid'),
      ('social_interactions', 'metadata', 'jsonb')
    ) AS expected(table_name, column_name, data_type)
    JOIN information_schema.columns actual
      ON actual.table_schema = 'public'
     AND actual.table_name = expected.table_name
     AND actual.column_name = expected.column_name
    WHERE actual.data_type IS DISTINCT FROM expected.data_type
  ) THEN
    RAISE EXCEPTION 'reel reconciliation pre-flight failed: required column types drifted';
  END IF;
END
$preflight$;

CREATE TABLE public.social_reel_reconciliations (
  operation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_asset_key text NOT NULL,
  canonical_reel_id uuid NOT NULL REFERENCES public.social_reels(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('applied', 'rolled_back')),
  reason text NOT NULL,
  alias_reel_ids uuid[] NOT NULL,
  request_payload jsonb NOT NULL,
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(alias_reel_ids) > 0),
  CHECK (NOT canonical_reel_id = ANY(alias_reel_ids))
);

CREATE TABLE public.social_reel_reconciliation_quarantine (
  quarantine_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE,
  canonical_asset_key text NOT NULL,
  proposed_canonical_reel_id uuid,
  proposed_alias_reel_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  reason_code text NOT NULL,
  request_payload jsonb NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_operation_id uuid REFERENCES public.social_reel_reconciliations(operation_id) ON DELETE RESTRICT,
  CHECK ((resolved_at IS NULL) = (resolution_operation_id IS NULL))
);

CREATE TABLE public.social_reel_aliases (
  alias_reel_id uuid PRIMARY KEY REFERENCES public.social_reels(id) ON DELETE RESTRICT,
  canonical_reel_id uuid NOT NULL REFERENCES public.social_reels(id) ON DELETE RESTRICT,
  canonical_asset_key text NOT NULL,
  alias_source_post_id uuid,
  reason text NOT NULL,
  reconciliation_operation_id uuid NOT NULL
    REFERENCES public.social_reel_reconciliations(operation_id) ON DELETE RESTRICT,
  original_author_id uuid NOT NULL,
  original_origin_type text,
  original_rights_status text,
  original_source_asset_id uuid,
  original_youtube_video_id text,
  original_youtube_url text,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias_reel_id <> canonical_reel_id),
  CHECK (length(btrim(canonical_asset_key)) > 0)
);

CREATE TABLE public.social_reel_reconciliation_moves (
  operation_id uuid NOT NULL
    REFERENCES public.social_reel_reconciliations(operation_id) ON DELETE RESTRICT,
  relation_name text NOT NULL CHECK (relation_name IN (
    'social_reels', 'social_likes', 'social_comments',
    'social_interactions', 'saved_reels'
  )),
  row_id uuid NOT NULL,
  original_reel_id uuid NOT NULL,
  canonical_reel_id uuid NOT NULL,
  original_payload jsonb NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, relation_name, row_id)
);

CREATE INDEX idx_social_reel_aliases_canonical
  ON public.social_reel_aliases(canonical_reel_id);
CREATE INDEX idx_social_reel_aliases_source_post
  ON public.social_reel_aliases(alias_source_post_id)
  WHERE alias_source_post_id IS NOT NULL;
CREATE INDEX idx_social_reel_quarantine_open
  ON public.social_reel_reconciliation_quarantine(discovered_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.social_reel_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reel_reconciliation_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reel_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_reel_reconciliation_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY social_reel_reconciliations_service_only
  ON public.social_reel_reconciliations FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY social_reel_quarantine_service_only
  ON public.social_reel_reconciliation_quarantine FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY social_reel_aliases_service_only
  ON public.social_reel_aliases FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY social_reel_moves_service_only
  ON public.social_reel_reconciliation_moves FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.social_reel_reconciliations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.social_reel_reconciliation_quarantine FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.social_reel_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.social_reel_reconciliation_moves FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.social_reel_reconciliations TO service_role;
GRANT SELECT ON public.social_reel_reconciliation_quarantine TO service_role;
GRANT SELECT ON public.social_reel_aliases TO service_role;
GRANT SELECT ON public.social_reel_reconciliation_moves TO service_role;

CREATE OR REPLACE FUNCTION public.fn_guard_social_reel_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_alias public.social_reels%ROWTYPE;
  v_winner public.social_reels%ROWTYPE;
BEGIN
  SELECT * INTO v_alias FROM public.social_reels WHERE id = NEW.alias_reel_id FOR KEY SHARE;
  SELECT * INTO v_winner FROM public.social_reels WHERE id = NEW.canonical_reel_id FOR KEY SHARE;

  IF v_alias.id IS NULL OR v_winner.id IS NULL THEN
    RAISE EXCEPTION 'reel alias endpoints must exist';
  END IF;
  IF NEW.alias_reel_id = NEW.canonical_reel_id THEN
    RAISE EXCEPTION 'a Reel cannot alias itself';
  END IF;
  IF v_alias.canonical_asset_key IS NULL
     OR v_alias.canonical_asset_key IS DISTINCT FROM v_winner.canonical_asset_key
     OR NEW.canonical_asset_key IS DISTINCT FROM v_winner.canonical_asset_key
  THEN
    RAISE EXCEPTION 'reel alias endpoints must share one canonical asset key';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.social_reel_aliases
    WHERE alias_reel_id = NEW.canonical_reel_id
  ) OR EXISTS (
    SELECT 1 FROM public.social_reel_aliases
    WHERE canonical_reel_id = NEW.alias_reel_id
  ) THEN
    RAISE EXCEPTION 'reel alias chains and winner cycles are forbidden';
  END IF;
  IF NEW.alias_source_post_id IS DISTINCT FROM v_alias.source_post_id
     OR NEW.original_author_id IS DISTINCT FROM v_alias.author_id
     OR NEW.original_origin_type IS DISTINCT FROM v_alias.origin_type
     OR NEW.original_rights_status IS DISTINCT FROM v_alias.rights_status
     OR NEW.original_source_asset_id IS DISTINCT FROM v_alias.source_asset_id
     OR NEW.original_youtube_video_id IS DISTINCT FROM v_alias.youtube_video_id
     OR NEW.original_youtube_url IS DISTINCT FROM v_alias.original_youtube_url
  THEN
    RAISE EXCEPTION 'reel alias attribution snapshot drifted';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_guard_social_reel_alias
BEFORE INSERT OR UPDATE ON public.social_reel_aliases
FOR EACH ROW EXECUTE FUNCTION public.fn_guard_social_reel_alias();

CREATE OR REPLACE FUNCTION public.fn_canonicalize_social_reel_engagement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_target uuid;
BEGIN
  IF TG_TABLE_NAME = 'saved_reels' THEN
    SELECT canonical_reel_id INTO v_target
    FROM public.social_reel_aliases WHERE alias_reel_id = NEW.reel_id;
    IF v_target IS NOT NULL THEN
      NEW.reel_id := v_target;
      NEW.source_type := 'reel';
    END IF;
  ELSE
    SELECT canonical_reel_id INTO v_target
    FROM public.social_reel_aliases WHERE alias_reel_id = NEW.post_id;
    IF v_target IS NOT NULL THEN
      NEW.post_id := v_target;
      IF TG_TABLE_NAME = 'social_comments' THEN
        NEW.post_source := 'social_reels';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_00_canonicalize_reel_alias_like
BEFORE INSERT OR UPDATE OF post_id ON public.social_likes
FOR EACH ROW EXECUTE FUNCTION public.fn_canonicalize_social_reel_engagement();
CREATE TRIGGER trg_00_canonicalize_reel_alias_comment
BEFORE INSERT OR UPDATE OF post_id ON public.social_comments
FOR EACH ROW EXECUTE FUNCTION public.fn_canonicalize_social_reel_engagement();
CREATE TRIGGER trg_00_canonicalize_reel_alias_interaction
BEFORE INSERT OR UPDATE OF post_id ON public.social_interactions
FOR EACH ROW EXECUTE FUNCTION public.fn_canonicalize_social_reel_engagement();
CREATE TRIGGER trg_00_canonicalize_reel_alias_save
BEFORE INSERT OR UPDATE OF reel_id ON public.saved_reels
FOR EACH ROW EXECUTE FUNCTION public.fn_canonicalize_social_reel_engagement();

CREATE OR REPLACE FUNCTION public.increment_reel_count(p_reel_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_target uuid;
BEGIN
  IF p_field IS NULL OR NOT (p_field = ANY(ARRAY['like_count','comment_count','share_count','view_count']::text[])) THEN
    RAISE EXCEPTION 'increment_reel_count: invalid field %', p_field;
  END IF;
  SELECT COALESCE(a.canonical_reel_id, p_reel_id) INTO v_target
  FROM (SELECT 1) seed
  LEFT JOIN public.social_reel_aliases a ON a.alias_reel_id = p_reel_id;
  EXECUTE format(
    'UPDATE public.social_reels SET %I = GREATEST(COALESCE(%I, 0) + 1, 0) WHERE id = $1',
    p_field, p_field
  ) USING v_target;
END
$function$;

CREATE OR REPLACE FUNCTION public.decrement_reel_count(p_reel_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_target uuid;
BEGIN
  IF p_field IS NULL OR NOT (p_field = ANY(ARRAY['like_count','comment_count','share_count','view_count']::text[])) THEN
    RAISE EXCEPTION 'decrement_reel_count: invalid field %', p_field;
  END IF;
  SELECT COALESCE(a.canonical_reel_id, p_reel_id) INTO v_target
  FROM (SELECT 1) seed
  LEFT JOIN public.social_reel_aliases a ON a.alias_reel_id = p_reel_id;
  EXECUTE format(
    'UPDATE public.social_reels SET %I = GREATEST(COALESCE(%I, 0) - 1, 0) WHERE id = $1',
    p_field, p_field
  ) USING v_target;
END
$function$;

CREATE OR REPLACE FUNCTION public.resolve_social_reel_reference(p_reference_id uuid)
RETURNS TABLE(
  requested_id uuid,
  canonical_reel_id uuid,
  alias_reel_id uuid,
  redirected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
  WITH candidates AS (
    SELECT a.canonical_reel_id, a.alias_reel_id, 1 AS priority
    FROM public.social_reel_aliases a
    WHERE a.alias_reel_id = p_reference_id
       OR a.alias_source_post_id = p_reference_id
    UNION ALL
    SELECT COALESCE(a.canonical_reel_id, r.id), a.alias_reel_id, 2
    FROM public.social_reels r
    LEFT JOIN public.social_reel_aliases a ON a.alias_reel_id = r.id
    WHERE r.id = p_reference_id OR r.source_post_id = p_reference_id
  ), unambiguous AS (
    SELECT min(canonical_reel_id::text)::uuid AS canonical_reel_id
    FROM candidates
    HAVING count(DISTINCT canonical_reel_id) = 1
  )
  SELECT p_reference_id, u.canonical_reel_id,
         min(c.alias_reel_id::text) FILTER (
           WHERE c.alias_reel_id = p_reference_id
         )::uuid,
         u.canonical_reel_id IS DISTINCT FROM p_reference_id
  FROM unambiguous u
  JOIN candidates c ON c.canonical_reel_id = u.canonical_reel_id
  GROUP BY u.canonical_reel_id
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_social_reel_duplicates(
  p_canonical_asset_key text,
  p_canonical_reel_id uuid,
  p_alias_reel_ids uuid[],
  p_reason text,
  p_operation_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids uuid[];
  v_rows integer;
  v_views bigint;
  v_before jsonb;
  v_after jsonb;
  v_reason text;
  v_request jsonb;
  v_existing_request jsonb;
  v_existing_status text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_operation_id IS NULL OR p_canonical_reel_id IS NULL
     OR NULLIF(btrim(p_canonical_asset_key), '') IS NULL
     OR NULLIF(btrim(p_reason), '') IS NULL
     OR p_alias_reel_ids IS NULL OR cardinality(p_alias_reel_ids) = 0
     OR array_position(p_alias_reel_ids, NULL) IS NOT NULL
     OR p_canonical_reel_id = ANY(p_alias_reel_ids)
  THEN
    RAISE EXCEPTION 'invalid Reel reconciliation request';
  END IF;

  SELECT array_agg(DISTINCT id ORDER BY id) INTO v_ids
  FROM unnest(array_append(p_alias_reel_ids, p_canonical_reel_id)) AS ids(id);
  IF cardinality(v_ids) <> cardinality(p_alias_reel_ids) + 1 THEN
    RAISE EXCEPTION 'duplicate alias IDs are not allowed';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO p_alias_reel_ids
  FROM unnest(p_alias_reel_ids) AS aliases(id);
  v_request := jsonb_build_object(
    'mode', 'consolidate',
    'canonical_asset_key', p_canonical_asset_key,
    'canonical_reel_id', p_canonical_reel_id,
    'alias_reel_ids', to_jsonb(p_alias_reel_ids),
    'reason', btrim(p_reason)
  );

  -- Serialize both exact-operation replays and same-key reconciliation attempts.
  -- The operation lock must precede replay reads so two concurrent invocations
  -- cannot independently observe an unused operation ID.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('reel-reconcile-operation:' || p_operation_id::text, 0)
  );

  SELECT request_payload, status INTO v_existing_request, v_existing_status
  FROM public.social_reel_reconciliations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing_request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'operation ID replay mismatch';
    END IF;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id, 'applied', v_existing_status = 'applied',
      'reason', CASE WHEN v_existing_status = 'applied' THEN 'already_applied' ELSE 'already_rolled_back' END,
      'canonical_reel_id', p_canonical_reel_id
    );
  END IF;
  SELECT request_payload INTO v_existing_request
  FROM public.social_reel_reconciliation_quarantine
  WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing_request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'operation ID replay mismatch';
    END IF;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id, 'applied', false,
      'reason', 'already_quarantined', 'canonical_reel_id', p_canonical_reel_id
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('reel-reconcile:' || p_canonical_asset_key, 0));
  -- Freeze the engagement ownership set while it is snapshotted and moved so
  -- every changed row has an exact, rollback-capable ledger entry.
  LOCK TABLE public.social_likes, public.social_comments,
             public.social_interactions, public.saved_reels
    IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.social_reels WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_rows FROM public.social_reels WHERE id = ANY(v_ids);

  v_reason := CASE
    WHEN v_rows <> cardinality(v_ids) THEN 'missing_reel'
    WHEN EXISTS (SELECT 1 FROM public.social_reel_aliases WHERE alias_reel_id = ANY(v_ids) OR canonical_reel_id = ANY(p_alias_reel_ids)) THEN 'existing_alias_chain'
    WHEN EXISTS (SELECT 1 FROM public.social_reels WHERE id = ANY(v_ids) AND canonical_asset_key IS DISTINCT FROM p_canonical_asset_key) THEN 'mixed_canonical_key'
    WHEN (SELECT count(DISTINCT author_id) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_author'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(source_post_id), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_source_post'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(video_url), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_media'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(playback_type), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_playback'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(rights_status), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_rights'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(topic), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_topic'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(youtube_video_id), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_attribution'
    WHEN (SELECT count(DISTINCT COALESCE(to_jsonb(original_youtube_url), 'null'::jsonb)) FROM public.social_reels WHERE id = ANY(v_ids)) <> 1 THEN 'mixed_attribution'
    WHEN EXISTS (SELECT 1 FROM public.video_transcode_jobs WHERE reel_id = ANY(p_alias_reel_ids) AND status IN ('queued','processing','running')) THEN 'active_transcode_job'
    WHEN EXISTS (
      SELECT 1 FROM public.social_likes
      WHERE post_id = ANY(v_ids)
      GROUP BY user_id HAVING count(*) > 1
    ) THEN 'like_collision'
    WHEN EXISTS (
      SELECT 1 FROM public.saved_reels
      WHERE reel_id = ANY(v_ids)
      GROUP BY user_id HAVING count(*) > 1
    ) THEN 'save_collision'
    WHEN EXISTS (
      SELECT 1 FROM public.social_interactions
      WHERE post_id = ANY(v_ids)
      GROUP BY user_id, interaction_type, COALESCE(metadata, '{}'::jsonb)
      HAVING count(*) > 1
    ) THEN 'interaction_collision'
    ELSE NULL
  END;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.social_reel_reconciliation_quarantine(
      operation_id, canonical_asset_key, proposed_canonical_reel_id,
      proposed_alias_reel_ids, reason_code, request_payload, details
    ) VALUES (
      p_operation_id, p_canonical_asset_key, p_canonical_reel_id,
      p_alias_reel_ids, v_reason, v_request,
      jsonb_build_object('requested_reason', p_reason, 'locked_rows', v_rows)
    ) ON CONFLICT (operation_id) DO NOTHING;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id, 'applied', false,
      'reason', v_reason, 'canonical_reel_id', p_canonical_reel_id
    );
  END IF;

  SELECT jsonb_build_object(
    'reels', COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb),
    'likes', (SELECT count(*) FROM public.social_likes WHERE post_id = ANY(v_ids)),
    'comments', (SELECT count(*) FROM public.social_comments WHERE post_id = ANY(v_ids)),
    'saves', (SELECT count(*) FROM public.saved_reels WHERE reel_id = ANY(v_ids)),
    'interactions', (SELECT count(*) FROM public.social_interactions WHERE post_id = ANY(v_ids))
  ) INTO v_before
  FROM public.social_reels r WHERE r.id = ANY(v_ids);

  SELECT COALESCE(sum(view_count), 0) INTO v_views
  FROM public.social_reels WHERE id = ANY(v_ids);

  INSERT INTO public.social_reel_reconciliations(
    operation_id, canonical_asset_key, canonical_reel_id, status, reason,
    alias_reel_ids, request_payload, before_snapshot, after_snapshot
  ) VALUES (
    p_operation_id, p_canonical_asset_key, p_canonical_reel_id, 'applied',
    p_reason, p_alias_reel_ids, v_request, v_before, '{}'::jsonb
  );

  INSERT INTO public.social_reel_reconciliation_moves(
    operation_id, relation_name, row_id, original_reel_id,
    canonical_reel_id, original_payload
  )
  SELECT p_operation_id, 'social_reels', r.id, r.id,
         p_canonical_reel_id, to_jsonb(r)
  FROM public.social_reels r WHERE r.id = ANY(v_ids)
  UNION ALL
  SELECT p_operation_id, 'social_likes', l.id, l.post_id,
         p_canonical_reel_id, to_jsonb(l)
  FROM public.social_likes l WHERE l.post_id = ANY(p_alias_reel_ids)
  UNION ALL
  SELECT p_operation_id, 'social_comments', c.id, c.post_id,
         p_canonical_reel_id, to_jsonb(c)
  FROM public.social_comments c WHERE c.post_id = ANY(p_alias_reel_ids)
  UNION ALL
  SELECT p_operation_id, 'social_interactions', i.id, i.post_id,
         p_canonical_reel_id, to_jsonb(i)
  FROM public.social_interactions i WHERE i.post_id = ANY(p_alias_reel_ids)
  UNION ALL
  SELECT p_operation_id, 'saved_reels', s.id, s.reel_id,
         p_canonical_reel_id, to_jsonb(s)
  FROM public.saved_reels s WHERE s.reel_id = ANY(p_alias_reel_ids);

  INSERT INTO public.social_reel_aliases(
    alias_reel_id, canonical_reel_id, canonical_asset_key, alias_source_post_id,
    reason, reconciliation_operation_id, original_author_id,
    original_origin_type, original_rights_status, original_source_asset_id,
    original_youtube_video_id, original_youtube_url
  )
  SELECT r.id, p_canonical_reel_id, p_canonical_asset_key, r.source_post_id,
         p_reason, p_operation_id, r.author_id, r.origin_type,
         r.rights_status, r.source_asset_id, r.youtube_video_id,
         r.original_youtube_url
  FROM public.social_reels r WHERE r.id = ANY(p_alias_reel_ids)
  ORDER BY r.id;

  UPDATE public.social_likes SET post_id = p_canonical_reel_id WHERE post_id = ANY(p_alias_reel_ids);
  UPDATE public.social_comments SET post_id = p_canonical_reel_id WHERE post_id = ANY(p_alias_reel_ids);
  UPDATE public.social_interactions SET post_id = p_canonical_reel_id WHERE post_id = ANY(p_alias_reel_ids);
  UPDATE public.saved_reels SET reel_id = p_canonical_reel_id, source_type = 'reel'
  WHERE reel_id = ANY(p_alias_reel_ids);

  UPDATE public.social_reels
  SET is_public = false,
      native_processing_requested = false,
      view_count = 0,
      like_count = 0,
      comment_count = 0,
      share_count = 0
  WHERE id = ANY(p_alias_reel_ids);

  UPDATE public.social_reels winner
  SET view_count = v_views,
      like_count = (SELECT count(*) FROM public.social_likes WHERE post_id = p_canonical_reel_id),
      comment_count = (SELECT count(*) FROM public.social_comments WHERE post_id = p_canonical_reel_id),
      share_count = (SELECT count(*) FROM public.social_interactions WHERE post_id = p_canonical_reel_id AND interaction_type = 'share')
  WHERE winner.id = p_canonical_reel_id;

  SELECT jsonb_build_object(
    'canonical_reel', to_jsonb(r),
    'reels', (SELECT COALESCE(jsonb_agg(to_jsonb(all_reels) ORDER BY all_reels.id), '[]'::jsonb)
              FROM public.social_reels all_reels WHERE all_reels.id = ANY(v_ids)),
    'alias_count', (SELECT count(*) FROM public.social_reel_aliases WHERE reconciliation_operation_id = p_operation_id),
    'likes', (SELECT count(*) FROM public.social_likes WHERE post_id = p_canonical_reel_id),
    'comments', (SELECT count(*) FROM public.social_comments WHERE post_id = p_canonical_reel_id),
    'saves', (SELECT count(*) FROM public.saved_reels WHERE reel_id = p_canonical_reel_id),
    'interactions', (SELECT count(*) FROM public.social_interactions WHERE post_id = p_canonical_reel_id),
    'like_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM public.social_likes l WHERE l.post_id = p_canonical_reel_id),
    'comment_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) FROM public.social_comments c WHERE c.post_id = p_canonical_reel_id),
    'saved_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM public.saved_reels s WHERE s.reel_id = p_canonical_reel_id),
    'interaction_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM public.social_interactions i WHERE i.post_id = p_canonical_reel_id),
    'move_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.relation_name, m.row_id), '[]'::jsonb)
                  FROM public.social_reel_reconciliation_moves m WHERE m.operation_id = p_operation_id)
  ) INTO v_after FROM public.social_reels r WHERE r.id = p_canonical_reel_id;

  UPDATE public.social_reel_reconciliations
  SET after_snapshot = v_after
  WHERE operation_id = p_operation_id;

  IF (SELECT count(*) FROM public.social_reel_aliases WHERE reconciliation_operation_id = p_operation_id) <> cardinality(p_alias_reel_ids)
     OR EXISTS (SELECT 1 FROM public.social_reels WHERE id = ANY(p_alias_reel_ids) AND is_public)
     OR EXISTS (SELECT 1 FROM public.social_likes WHERE post_id = ANY(p_alias_reel_ids))
     OR EXISTS (SELECT 1 FROM public.social_comments WHERE post_id = ANY(p_alias_reel_ids))
     OR EXISTS (SELECT 1 FROM public.social_interactions WHERE post_id = ANY(p_alias_reel_ids))
     OR EXISTS (SELECT 1 FROM public.saved_reels WHERE reel_id = ANY(p_alias_reel_ids))
  THEN
    RAISE EXCEPTION 'reel reconciliation post-apply invariant failed';
  END IF;

  RETURN jsonb_build_object(
    'operation_id', p_operation_id, 'applied', true,
    'reason', p_reason, 'canonical_reel_id', p_canonical_reel_id,
    'alias_count', cardinality(p_alias_reel_ids)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rollback_social_reel_reconciliation(
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_record public.social_reel_reconciliations%ROWTYPE;
  v_current jsonb;
  v_alias_ids uuid[];
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  SELECT * INTO v_record
  FROM public.social_reel_reconciliations
  WHERE operation_id = p_operation_id
  FOR UPDATE;
  IF v_record.operation_id IS NULL THEN
    RAISE EXCEPTION 'reconciliation operation not found';
  END IF;
  IF v_record.status = 'rolled_back' THEN
    RETURN jsonb_build_object('operation_id', p_operation_id, 'rolled_back', true, 'reason', 'already_rolled_back');
  END IF;
  v_alias_ids := v_record.alias_reel_ids;
  PERFORM pg_advisory_xact_lock(hashtextextended('reel-reconcile:' || v_record.canonical_asset_key, 0));
  LOCK TABLE public.social_likes, public.social_comments,
             public.social_interactions, public.saved_reels
    IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.social_reels
  WHERE id = v_record.canonical_reel_id OR id = ANY(v_alias_ids)
  ORDER BY id FOR UPDATE;

  SELECT jsonb_build_object(
    'canonical_reel', to_jsonb(r),
    'reels', (SELECT COALESCE(jsonb_agg(to_jsonb(all_reels) ORDER BY all_reels.id), '[]'::jsonb)
              FROM public.social_reels all_reels
              WHERE all_reels.id = v_record.canonical_reel_id OR all_reels.id = ANY(v_alias_ids)),
    'alias_count', (SELECT count(*) FROM public.social_reel_aliases WHERE reconciliation_operation_id = p_operation_id),
    'likes', (SELECT count(*) FROM public.social_likes WHERE post_id = v_record.canonical_reel_id),
    'comments', (SELECT count(*) FROM public.social_comments WHERE post_id = v_record.canonical_reel_id),
    'saves', (SELECT count(*) FROM public.saved_reels WHERE reel_id = v_record.canonical_reel_id),
    'interactions', (SELECT count(*) FROM public.social_interactions WHERE post_id = v_record.canonical_reel_id),
    'like_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]'::jsonb) FROM public.social_likes l WHERE l.post_id = v_record.canonical_reel_id),
    'comment_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id), '[]'::jsonb) FROM public.social_comments c WHERE c.post_id = v_record.canonical_reel_id),
    'saved_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb) FROM public.saved_reels s WHERE s.reel_id = v_record.canonical_reel_id),
    'interaction_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.id), '[]'::jsonb) FROM public.social_interactions i WHERE i.post_id = v_record.canonical_reel_id),
    'move_rows', (SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.relation_name, m.row_id), '[]'::jsonb)
                  FROM public.social_reel_reconciliation_moves m WHERE m.operation_id = p_operation_id)
  ) INTO v_current
  FROM public.social_reels r WHERE r.id = v_record.canonical_reel_id;

  IF v_current IS DISTINCT FROM v_record.after_snapshot THEN
    RAISE EXCEPTION 'rollback refused: involved Reel, engagement, or move ledger changed after reconciliation';
  END IF;
  IF (SELECT count(*) FROM public.social_reel_reconciliation_moves
      WHERE operation_id = p_operation_id AND relation_name = 'social_reels')
       <> cardinality(v_alias_ids) + 1
     OR EXISTS (
       SELECT 1 FROM unnest(array_append(v_alias_ids, v_record.canonical_reel_id)) expected(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.social_reel_reconciliation_moves move
         WHERE move.operation_id = p_operation_id
           AND move.relation_name = 'social_reels'
           AND move.row_id = expected.id
           AND move.original_reel_id = expected.id
           AND move.canonical_reel_id = v_record.canonical_reel_id
       )
     )
  THEN
    RAISE EXCEPTION 'rollback refused: move ledger identity drifted';
  END IF;
  IF (SELECT count(*) FROM public.social_reel_aliases WHERE reconciliation_operation_id = p_operation_id)
       <> cardinality(v_alias_ids)
  THEN
    RAISE EXCEPTION 'rollback refused: alias ledger drifted';
  END IF;

  DELETE FROM public.social_reel_aliases
  WHERE reconciliation_operation_id = p_operation_id;

  UPDATE public.social_likes row
  SET post_id = move.original_reel_id
  FROM public.social_reel_reconciliation_moves move
  WHERE move.operation_id = p_operation_id
    AND move.relation_name = 'social_likes'
    AND row.id = move.row_id;
  UPDATE public.social_comments row
  SET post_id = move.original_reel_id,
      post_source = move.original_payload ->> 'post_source'
  FROM public.social_reel_reconciliation_moves move
  WHERE move.operation_id = p_operation_id
    AND move.relation_name = 'social_comments'
    AND row.id = move.row_id;
  UPDATE public.social_interactions row
  SET post_id = move.original_reel_id
  FROM public.social_reel_reconciliation_moves move
  WHERE move.operation_id = p_operation_id
    AND move.relation_name = 'social_interactions'
    AND row.id = move.row_id;
  UPDATE public.saved_reels row
  SET reel_id = move.original_reel_id,
      source_type = move.original_payload ->> 'source_type'
  FROM public.social_reel_reconciliation_moves move
  WHERE move.operation_id = p_operation_id
    AND move.relation_name = 'saved_reels'
    AND row.id = move.row_id;

  UPDATE public.social_reels row
  SET is_public = (move.original_payload ->> 'is_public')::boolean,
      native_processing_requested = (move.original_payload ->> 'native_processing_requested')::boolean,
      view_count = (move.original_payload ->> 'view_count')::integer,
      like_count = (move.original_payload ->> 'like_count')::integer,
      comment_count = (move.original_payload ->> 'comment_count')::integer,
      share_count = (move.original_payload ->> 'share_count')::integer
  FROM public.social_reel_reconciliation_moves move
  WHERE move.operation_id = p_operation_id
    AND move.relation_name = 'social_reels'
    AND row.id = move.row_id;

  UPDATE public.social_reel_reconciliations
  SET status = 'rolled_back'
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'operation_id', p_operation_id, 'rolled_back', true,
    'canonical_reel_id', v_record.canonical_reel_id,
    'alias_count', cardinality(v_alias_ids)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.fn_guard_social_reel_alias() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_canonicalize_social_reel_engagement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_social_reel_reference(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_social_reel_reconciliation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_social_reel_reference(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_social_reel_reconciliation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_reel_count(uuid, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.decrement_reel_count(uuid, text) TO authenticated, anon, service_role;

DO $postapply$
BEGIN
  IF to_regclass('public.social_reel_aliases') IS NULL
     OR to_regclass('public.social_reel_reconciliations') IS NULL
     OR to_regclass('public.social_reel_reconciliation_quarantine') IS NULL
     OR to_regclass('public.social_reel_reconciliation_moves') IS NULL
     OR to_regprocedure('public.resolve_social_reel_reference(uuid)') IS NULL
     OR to_regprocedure('public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)') IS NULL
     OR to_regprocedure('public.rollback_social_reel_reconciliation(uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'reel reconciliation post-apply failed: required objects are missing';
  END IF;
  IF has_function_privilege('anon', 'public.resolve_social_reel_reference(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.resolve_social_reel_reference(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'reel reconciliation post-apply failed: public execution leaked';
  END IF;
END
$postapply$;

COMMIT;

-- ROLLBACK (install as a NEW migration). This schema-only rollback deliberately
-- refuses after the first reconciliation; at that point a separate evidence-
-- pinned data rollback must restore each operation's before_snapshot first.
-- BEGIN;
-- DO $rollback_guard$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM public.social_reel_aliases)
--      OR EXISTS (SELECT 1 FROM public.social_reel_reconciliations)
--      OR EXISTS (SELECT 1 FROM public.social_reel_reconciliation_quarantine)
--   THEN
--     RAISE EXCEPTION 'rollback refused: Reel reconciliation state exists';
--   END IF;
-- END
-- $rollback_guard$;
-- DROP FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid);
-- DROP FUNCTION public.rollback_social_reel_reconciliation(uuid);
-- DROP FUNCTION public.resolve_social_reel_reference(uuid);
-- DROP TRIGGER trg_00_canonicalize_reel_alias_like ON public.social_likes;
-- DROP TRIGGER trg_00_canonicalize_reel_alias_comment ON public.social_comments;
-- DROP TRIGGER trg_00_canonicalize_reel_alias_interaction ON public.social_interactions;
-- DROP TRIGGER trg_00_canonicalize_reel_alias_save ON public.saved_reels;
-- DROP FUNCTION public.fn_canonicalize_social_reel_engagement();
-- DROP TRIGGER trg_guard_social_reel_alias ON public.social_reel_aliases;
-- DROP FUNCTION public.fn_guard_social_reel_alias();
-- DROP TABLE public.social_reel_aliases;
-- DROP TABLE public.social_reel_reconciliation_moves;
-- DROP TABLE public.social_reel_reconciliation_quarantine;
-- DROP TABLE public.social_reel_reconciliations;
-- CREATE OR REPLACE FUNCTION public.increment_reel_count(p_reel_id uuid, p_field text)
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
-- AS $restore_increment$
-- BEGIN
--   IF p_field IS NULL OR NOT (p_field = ANY(ARRAY['like_count','comment_count','share_count','view_count']::text[])) THEN
--     RAISE EXCEPTION 'increment_reel_count: invalid field %', p_field;
--   END IF;
--   EXECUTE format(
--     'UPDATE public.social_reels SET %I = GREATEST(COALESCE(%I, 0) + 1, 0) WHERE id = $1',
--     p_field, p_field
--   ) USING p_reel_id;
-- END
-- $restore_increment$;
-- CREATE OR REPLACE FUNCTION public.decrement_reel_count(p_reel_id uuid, p_field text)
-- RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
-- AS $restore_decrement$
-- BEGIN
--   IF p_field IS NULL OR NOT (p_field = ANY(ARRAY['like_count','comment_count','share_count','view_count']::text[])) THEN
--     RAISE EXCEPTION 'decrement_reel_count: invalid field %', p_field;
--   END IF;
--   EXECUTE format(
--     'UPDATE public.social_reels SET %I = GREATEST(COALESCE(%I, 0) - 1, 0) WHERE id = $1',
--     p_field, p_field
--   ) USING p_reel_id;
-- END
-- $restore_decrement$;
-- GRANT EXECUTE ON FUNCTION public.increment_reel_count(uuid, text) TO authenticated, anon, service_role;
-- GRANT EXECUTE ON FUNCTION public.decrement_reel_count(uuid, text) TO authenticated, anon, service_role;
-- COMMIT;
