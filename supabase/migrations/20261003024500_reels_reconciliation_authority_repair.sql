BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.reconcile_social_reel_duplicates(text,uuid,uuid[],text,uuid)') IS NULL
     OR to_regprocedure('public.reconcile_social_reel_duplicates_phase2_unsafe(text,uuid,uuid[],text,uuid)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'reels authority repair preflight failed: unexpected reconciliation function state';
  END IF;
END
$preflight$;

-- Retain the installed Phase 2 implementation behind a service-only internal
-- name. The replacement boundary below locks the exact interaction tables and
-- applies the predicates used by their installed partial unique indexes before
-- delegating to the already-qualified move/ledger implementation.
ALTER FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid)
  RENAME TO reconcile_social_reel_duplicates_phase2_unsafe;

-- Repair the installed implementation before the public wrapper delegates to
-- it. Refuse installation if the exact predecessor source has drifted.
DO $repair_installed_collision_gate$
DECLARE
  v_source text;
  v_repaired text;
  v_old text := $old_gate$WHEN EXISTS \(\s+SELECT 1 FROM public\.social_interactions\s+WHERE post_id = ANY\(v_ids\)\s+GROUP BY user_id, interaction_type, COALESCE\(metadata, '\{\}'::jsonb\)\s+HAVING count\(\*\) > 1\s+\) THEN 'interaction_collision'$old_gate$;
  v_new text := $new_gate$WHEN EXISTS (
      SELECT 1 FROM public.social_interactions
      WHERE post_id = ANY(v_ids) AND interaction_type IN ('bookmark', 'report')
      GROUP BY user_id, interaction_type HAVING count(*) > 1
    ) THEN 'interaction_collision'
    WHEN EXISTS (
      SELECT 1 FROM public.social_interactions
      WHERE post_id = ANY(v_ids) AND interaction_type = 'comment_like'
        AND metadata ->> 'comment_id' IS NOT NULL
      GROUP BY user_id, (metadata ->> 'comment_id') HAVING count(*) > 1
    ) THEN 'interaction_collision'$new_gate$;
BEGIN
  SELECT p.prosrc INTO v_source
  FROM pg_proc p
  WHERE p.oid = to_regprocedure(
    'public.reconcile_social_reel_duplicates_phase2_unsafe(text,uuid,uuid[],text,uuid)'
  );
  IF v_source IS NULL OR regexp_count(v_source, v_old) <> 1 THEN
    RAISE EXCEPTION 'reels authority repair refused: installed collision gate drifted';
  END IF;
  v_repaired := regexp_replace(v_source, v_old, v_new);
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(p_canonical_asset_key text, p_canonical_reel_id uuid, p_alias_reel_ids uuid[], p_reason text, p_operation_id uuid DEFAULT gen_random_uuid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS %L',
    v_repaired
  );
END
$repair_installed_collision_gate$;

REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(text, uuid, uuid[], text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(text, uuid, uuid[], text, uuid)
  TO service_role;

CREATE FUNCTION public.reconcile_social_reel_duplicates(
  p_canonical_asset_key text,
  p_canonical_reel_id uuid,
  p_alias_reel_ids uuid[],
  p_reason text,
  p_operation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids uuid[];
  v_reason text;
  v_request jsonb;
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
  PERFORM pg_advisory_xact_lock(
    hashtextextended('reel-reconcile-operation:' || p_operation_id::text, 0)
  );
  -- Immutable operation replay remains owned by the installed implementation.
  IF EXISTS (SELECT 1 FROM public.social_reel_reconciliations WHERE operation_id = p_operation_id)
     OR EXISTS (SELECT 1 FROM public.social_reel_reconciliation_quarantine WHERE operation_id = p_operation_id)
  THEN
    RETURN public.reconcile_social_reel_duplicates_phase2_unsafe(
      p_canonical_asset_key, p_canonical_reel_id, p_alias_reel_ids, p_reason, p_operation_id
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('reel-reconcile:' || p_canonical_asset_key, 0));
  LOCK TABLE public.social_likes, public.social_comments,
             public.social_interactions, public.saved_reels
    IN SHARE ROW EXCLUSIVE MODE;
  PERFORM 1 FROM public.social_reels WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;

  v_reason := CASE
    -- These predicates intentionally mirror the installed partial unique
    -- indexes. Bookmark/report metadata is not part of identity.
    WHEN EXISTS (
      SELECT 1 FROM public.social_interactions
      WHERE post_id = ANY(v_ids) AND interaction_type IN ('bookmark', 'report')
      GROUP BY user_id, interaction_type HAVING count(*) > 1
    ) THEN 'interaction_collision'
    -- A comment like is unique per user/comment, not per complete metadata blob.
    WHEN EXISTS (
      SELECT 1 FROM public.social_interactions
      WHERE post_id = ANY(v_ids) AND interaction_type = 'comment_like'
        AND metadata ->> 'comment_id' IS NOT NULL
      GROUP BY user_id, (metadata ->> 'comment_id') HAVING count(*) > 1
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
      jsonb_build_object('authority_repair', '20261003024500', 'index_exact', true)
    ) ON CONFLICT (operation_id) DO NOTHING;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id, 'applied', false,
      'reason', v_reason, 'canonical_reel_id', p_canonical_reel_id
    );
  END IF;

  RETURN public.reconcile_social_reel_duplicates_phase2_unsafe(
    p_canonical_asset_key, p_canonical_reel_id, p_alias_reel_ids, p_reason, p_operation_id
  );
END
$function$;

-- Owners remove an entire canonical group through one locked server operation.
-- Historical rows and aliases remain as tombstones; no physical delete occurs.
CREATE FUNCTION public.remove_owned_social_reel(p_reel_id uuid, p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_canonical_id uuid;
  v_asset_key text;
  v_ids uuid[];
  v_rows integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_reel_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'remove_owned_social_reel: Reel and owner are required';
  END IF;

  SELECT canonical_asset_key INTO v_asset_key
  FROM public.social_reels WHERE id = p_reel_id;
  IF NULLIF(btrim(v_asset_key), '') IS NULL THEN
    RAISE EXCEPTION 'remove_owned_social_reel: Reel not found or canonical key missing';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('reel-reconcile:' || v_asset_key, 0));

  SELECT a.canonical_reel_id INTO v_canonical_id
  FROM public.social_reel_aliases a
  WHERE a.alias_reel_id = p_reel_id OR a.canonical_reel_id = p_reel_id
  ORDER BY (a.alias_reel_id = p_reel_id) DESC, a.alias_reel_id
  LIMIT 1;
  v_canonical_id := COALESCE(v_canonical_id, p_reel_id);

  SELECT array_agg(candidate.id ORDER BY candidate.id) INTO v_ids
  FROM (
    SELECT v_canonical_id AS id
    UNION
    SELECT a.alias_reel_id FROM public.social_reel_aliases a
    WHERE a.canonical_reel_id = v_canonical_id
  ) candidate;

  IF EXISTS (
    SELECT 1 FROM public.social_reels
    WHERE id = ANY(v_ids) AND canonical_asset_key IS DISTINCT FROM v_asset_key
  ) THEN
    RAISE EXCEPTION 'remove_owned_social_reel: mixed canonical group';
  END IF;

  PERFORM 1 FROM public.social_reels
  WHERE id = ANY(v_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_rows FROM public.social_reels WHERE id = ANY(v_ids);
  IF v_rows <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'remove_owned_social_reel: alias group changed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.social_reels WHERE id = ANY(v_ids) AND author_id IS DISTINCT FROM p_owner_id) THEN
    RAISE EXCEPTION 'remove_owned_social_reel: owner mismatch';
  END IF;

  UPDATE public.social_reels
  SET is_public = false,
      is_deleted = true,
      native_processing_requested = false
  WHERE id = ANY(v_ids) AND author_id = p_owner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'remove_owned_social_reel: incomplete group update';
  END IF;

  RETURN jsonb_build_object('removed', v_rows, 'canonical_reel_id', v_canonical_id);
END
$function$;

-- Browser callers no longer mutate derived counters. Only trusted server
-- paths may execute the compatibility functions while event-backed callers
-- finish converging on authoritative row counts.
REVOKE ALL ON FUNCTION public.increment_reel_count(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decrement_reel_count(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_reel_count(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrement_reel_count(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_owned_social_reel(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_owned_social_reel(uuid, uuid) TO service_role;

DO $postapply$
BEGIN
  IF has_function_privilege('anon', 'public.increment_reel_count(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.increment_reel_count(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.decrement_reel_count(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.decrement_reel_count(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.remove_owned_social_reel(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.remove_owned_social_reel(uuid,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'reels authority repair post-apply failed: public execution leaked';
  END IF;
END
$postapply$;

COMMIT;

-- Guarded emergency rollback (execute deliberately, never through migration replay):
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- REVOKE ALL ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid) FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid);
-- ALTER FUNCTION public.reconcile_social_reel_duplicates_phase2_unsafe(text, uuid, uuid[], text, uuid) RENAME TO reconcile_social_reel_duplicates;
-- GRANT EXECUTE ON FUNCTION public.reconcile_social_reel_duplicates(text, uuid, uuid[], text, uuid) TO service_role;
-- REVOKE ALL ON FUNCTION public.remove_owned_social_reel(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
-- DROP FUNCTION public.remove_owned_social_reel(uuid, uuid);
-- COMMIT;
