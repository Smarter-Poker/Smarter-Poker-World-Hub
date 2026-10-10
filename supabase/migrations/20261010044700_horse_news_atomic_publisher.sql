-- TIER: 2; AUTHOR: Codex; AFFECTS: one service-only news publication RPC.
-- WHY: approved hourly horse news exhausted its finite opinion pool. Fresh
-- source-attributed headlines need the same durable dedup rules, but the old
-- post/asset/phrase/brief writes were separate requests with partial outcomes.
-- HOW: qualify identity/gates, serialize existing cadence and reuse windows,
-- then write the post and all ledgers/brief in one transaction. No enablement,
-- model spending, history rewrite, scheduler or personal-hand claim is added.
-- Qualification: horse-news-atomic-publisher-postgres.test.mjs (real PG17).
-- Install outside :50-:03 UTC; exact source once, never replay.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
  IF to_regclass('public.content_asset_use') IS NULL
     OR to_regclass('public.horse_phrase_ledger') IS NULL
     OR to_regclass('public.post_briefs') IS NULL THEN
    RAISE EXCEPTION 'horse news publication ledgers are absent';
  END IF;
END $preflight$;

CREATE FUNCTION public.publish_horse_news_post(
  p_author_id uuid, p_content text, p_link_url text, p_link_title text,
  p_link_description text, p_link_image text, p_link_site_name text,
  p_news_type text, p_publication_key text, p_asset_key text,
  p_phrase_norm text, p_semantic_key text, p_brief jsonb
) RETURNS TABLE(social_post_id uuid, created boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $function$
DECLARE
  v_post_id uuid;
  v_lock text;
  v_field text;
  v_existing public.social_posts%ROWTYPE;
  v_phrase text := btrim(regexp_replace(regexp_replace(regexp_replace(
    lower(split_part(p_content, E'\n', 1)), 'https?://\S+', '', 'g'),
    '[^a-z0-9\s]', '', 'g'), '\s+', ' ', 'g'));
  v_host text;
  v_path text;
  v_hash text := md5(jsonb_build_array(p_author_id,p_content,p_link_url,
    p_link_title,p_link_description,p_link_image,p_link_site_name,p_news_type,
    p_publication_key,p_asset_key,p_phrase_norm,p_semantic_key,p_brief)::text);
BEGIN
  IF coalesce(auth.role()::text,'') <> 'service_role' THEN
    RAISE EXCEPTION 'horse news publication requires service role' USING ERRCODE='42501';
  END IF;
  IF p_author_id IS NULL OR p_news_type IS NULL OR p_news_type NOT IN ('poker','sports')
    OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 2000
    OR p_link_title IS NULL OR char_length(btrim(p_link_title)) NOT BETWEEN 1 AND 600
    OR p_link_site_name IS NULL OR char_length(btrim(p_link_site_name)) NOT BETWEEN 1 AND 180
    OR p_link_url IS NULL OR length(p_link_url)>4096
    OR p_link_url !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
    OR (p_link_image IS NOT NULL AND (length(p_link_image)>4096 OR p_link_image !~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'))
    OR (p_link_description IS NOT NULL AND length(p_link_description)>2000)
    OR p_publication_key IS NULL OR p_publication_key !~ (
      '^fleet:'||p_author_id::text||':[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$')
    OR p_phrase_norm IS NULL OR p_phrase_norm='' OR p_phrase_norm IS DISTINCT FROM v_phrase
    OR p_semantic_key IS NULL OR length(p_semantic_key) NOT BETWEEN 1 AND 4096
    OR p_semantic_key ~ '[[:cntrl:]]'
    OR jsonb_typeof(p_brief) IS DISTINCT FROM 'object' OR length(p_brief::text)>32768
    OR p_brief->>'kind' IS DISTINCT FROM 'link'
    OR p_brief->>'domain' IS DISTINCT FROM p_news_type
    OR jsonb_typeof(p_brief->'confidence') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_brief->'isQuestion') IS DISTINCT FROM 'boolean'
    OR nullif(p_brief->>'tone','') IS NULL THEN
    RAISE EXCEPTION 'invalid horse news publication input' USING ERRCODE='22023';
  END IF;
  FOREACH v_field IN ARRAY ARRAY['people','teams','concepts','amounts','builtFrom'] LOOP
    IF jsonb_typeof(p_brief->v_field) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid horse news brief array' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_brief->v_field)>100 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_brief->v_field) e
      WHERE jsonb_typeof(e) IS DISTINCT FROM 'string' OR length(e::text)>1000) THEN
      RAISE EXCEPTION 'invalid horse news brief array member' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF (p_brief->>'confidence')::numeric NOT BETWEEN 0 AND 1 THEN
    RAISE EXCEPTION 'invalid horse news confidence' USING ERRCODE='22023';
  END IF;
  v_host := lower(substring(p_link_url from '^https?://([^/]+)'));
  v_path := regexp_replace(split_part(split_part(regexp_replace(p_link_url,
    '^https?://[^/]+', ''),'?',1),'#',1),'/+$','');
  IF p_asset_key IS DISTINCT FROM 'url:'||v_host||v_path THEN
    RAISE EXCEPTION 'horse news asset does not match link' USING ERRCODE='22023';
  END IF;

  -- Share the existing atomic video author lock: news/video cannot race the
  -- same 20-hour cadence. Exact phrases share its namespace as well.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'publish-horse-video-author:'||p_author_id::text,0));
  FOR v_lock IN SELECT DISTINCT k FROM unnest(ARRAY[
    'publish-horse-news-slot:'||p_publication_key,
    'publish-horse-video-asset:'||p_asset_key,
    'publish-horse-video-phrase:'||p_phrase_norm,
    'publish-horse-video-phrase:'||p_semantic_key]) k ORDER BY k LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock,0));
  END LOOP;

  -- A lost acknowledgement is resolved by exact durable operation identity,
  -- before cadence/reuse checks. An incomplete or changed retry is never success.
  SELECT * INTO v_existing FROM public.social_posts
  WHERE metadata->>'publication_key'=p_publication_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.metadata->>'publication_contract'='horse_news_atomic_v1'
       AND v_existing.metadata->>'publication_input_hash'=v_hash THEN
      IF NOT EXISTS(SELECT 1 FROM public.content_asset_use WHERE post_id=v_existing.id
        AND horse_id=p_author_id AND asset_key=p_asset_key)
        OR NOT EXISTS(SELECT 1 FROM public.post_briefs WHERE post_id=v_existing.id)
        OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_phrase_norm,p_semantic_key]) k
          WHERE NOT EXISTS(SELECT 1 FROM public.horse_phrase_ledger l
            WHERE l.post_id=v_existing.id AND l.horse_id=p_author_id AND l.phrase_norm=k)) THEN
        RAISE EXCEPTION 'incomplete horse news publication receipt' USING ERRCODE='23514';
      END IF;
      RETURN QUERY SELECT v_existing.id,false,'already_published'::text; RETURN;
    END IF;
    RETURN QUERY SELECT NULL::uuid,false,'duplicate_slot'::text; RETURN;
  END IF;
  PERFORM 1 FROM public.content_settings FOR SHARE;
  IF (SELECT count(*) FROM public.content_settings)<>1 OR NOT EXISTS (
    SELECT 1 FROM public.content_settings WHERE engine_enabled IS TRUE AND auto_publish IS TRUE) THEN
    RAISE EXCEPTION 'horse news master gate disabled' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.horse_post_modes WHERE mode=p_news_type||'_news'
    AND enabled IS TRUE AND approved_at IS NOT NULL AND nullif(btrim(approved_by),'') IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'horse news mode not approved/enabled' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles p JOIN public.content_authors ca ON ca.profile_id=p.id
    WHERE p.id=p_author_id AND p.is_horse IS TRUE AND p.status='active'
      AND p.horse_status='available' AND ca.is_active IS TRUE FOR SHARE OF p,ca;
  IF NOT FOUND THEN RAISE EXCEPTION 'horse news author inactive' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.social_posts WHERE author_id=p_author_id
    AND coalesce(is_deleted,false)=false AND created_at>=now()-interval '20 hours') THEN
    RETURN QUERY SELECT NULL::uuid,false,'posted_recently'::text; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.content_asset_use WHERE asset_key=p_asset_key
    AND (horse_id=p_author_id OR used_at>=now()-interval '30 days')) THEN
    RETURN QUERY SELECT NULL::uuid,false,'asset_used'::text; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm IN(p_phrase_norm,p_semantic_key)
    AND (used_at>=now()-interval '48 hours' OR (horse_id=p_author_id AND used_at>=now()-interval '90 days'))) THEN
    RETURN QUERY SELECT NULL::uuid,false,'phrase_used'::text; RETURN;
  END IF;
  INSERT INTO public.social_posts(author_id,content,content_type,media_urls,visibility,audience_mode,
    link_url,link_title,link_description,link_image,link_site_name,topic,topics,origin_type,metadata)
  VALUES(p_author_id,p_content,'link','[]'::jsonb,'public','public',p_link_url,p_link_title,
    p_link_description,p_link_image,p_link_site_name,p_news_type,ARRAY[p_news_type,'news'],'horse',
    jsonb_build_object('scheduler','fleet','news_type',p_news_type,'publication_key',p_publication_key,
      'publication_contract','horse_news_atomic_v1','publication_input_hash',v_hash)) RETURNING id INTO v_post_id;
  INSERT INTO public.content_asset_use(asset_key,horse_id,post_id) VALUES(p_asset_key,p_author_id,v_post_id);
  INSERT INTO public.horse_phrase_ledger(phrase_norm,horse_id,post_id)
    SELECT DISTINCT k,p_author_id,v_post_id FROM unnest(ARRAY[p_phrase_norm,p_semantic_key]) k;
  INSERT INTO public.post_briefs(post_id,kind,domain,sport,title,source,people,teams,concepts,amounts,
    topic,tone,is_question,confidence,summary,built_from)
  VALUES(v_post_id,'link',p_news_type,p_brief->>'sport',p_brief->>'title',p_brief->>'source',
    ARRAY(SELECT jsonb_array_elements_text(p_brief->'people')),
    ARRAY(SELECT jsonb_array_elements_text(p_brief->'teams')),
    ARRAY(SELECT jsonb_array_elements_text(p_brief->'concepts')),
    ARRAY(SELECT jsonb_array_elements_text(p_brief->'amounts')),
    p_brief->>'topic',p_brief->>'tone',(p_brief->>'isQuestion')::boolean,
    (p_brief->>'confidence')::numeric,p_brief->>'title',
    ARRAY(SELECT DISTINCT jsonb_array_elements_text(p_brief->'builtFrom')));
  RETURN QUERY SELECT v_post_id,true,'published'::text;
END $function$;
REVOKE ALL ON FUNCTION public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)
  TO service_role;
DO $post$
BEGIN
  IF NOT has_function_privilege('service_role','public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'horse news service-only grant assertion failed';
  END IF;
END $post$;
COMMIT;
-- SAFE RECOVERY (NEW migration, preserve all committed rows):
-- BEGIN;
-- DROP FUNCTION public.publish_horse_news_post(uuid,text,text,text,text,text,text,text,text,text,text,text,jsonb) RESTRICT;
-- COMMIT;
