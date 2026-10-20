-- TIER: 3. One bounded initial profile lock; no producer retry or mode change.
-- WHY: Oct20 19:13:24 exact natural hand publication failed55P03 before INSERT.
-- NOWAIT rejected legitimate transient contention. Historical blocker identity
-- is UNKNOWN; retain full final financial lock, wait at most two seconds once.
-- Preserve author serialization, exact replay, freshness, modes/model, rewards.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid='public.publish_horse_grounded_hand(uuid,bigint,text,text,text,text,text,jsonb)'::regprocedure;
 IF md5(p.prosrc)<>'20d4d8a001ff184164a7bd9f6a59678a'
 OR NOT p.prosecdef OR pg_get_userbyid(p.proowner)<>'postgres'
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, extensions']
 OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 OR has_function_privilege('anon',p.oid,'EXECUTE')
 OR has_function_privilege('authenticated',p.oid,'EXECUTE') THEN
  RAISE EXCEPTION 'Grounded profile lock baseline/authority drift: do not replace';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.publish_horse_grounded_hand(
 p_author_id uuid,p_review_id bigint,p_content text,p_phrase_norm text,
 p_semantic_key text,p_frame_key text,p_publication_key text,p_brief jsonb
) RETURNS TABLE(social_post_id uuid,created boolean,reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions
AS $function$
DECLARE
 v_existing public.social_posts%ROWTYPE;
 v_review public.horse_hand_reviews%ROWTYPE;
 v_post uuid; v_lock text; v_field text;
 v_previous_lock_timeout text; v_profile_found boolean;
 v_phrase text:=btrim(regexp_replace(regexp_replace(regexp_replace(lower(split_part(p_content,E'\n',1)),
  'https?://\S+','','g'),'[^a-z0-9\s]','','g'),'\s+',' ','g'));
 v_hash text:=md5(jsonb_build_array(p_author_id,p_review_id,p_content,p_phrase_norm,p_semantic_key,p_frame_key,p_publication_key,p_brief)::text);
BEGIN
 IF coalesce(auth.role()::text,'')<>'service_role' THEN
  RAISE EXCEPTION 'grounded hand requires service role' USING ERRCODE='42501'; END IF;
 IF p_author_id IS NULL OR p_review_id IS NULL OR p_review_id<=0
 OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 2000
 OR p_content ~* '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
 OR p_phrase_norm IS NULL OR p_phrase_norm='' OR p_phrase_norm IS DISTINCT FROM v_phrase
 OR p_semantic_key IS NULL OR p_semantic_key !~ '^grounded:hand:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 OR p_frame_key IS NULL OR p_frame_key !~ '^frame:voice:(big_win|bad_beat|river_aggression|big_fold|cooler|stackoff|tough_spot|grind):[0-9]{1,2}$'
 OR p_publication_key IS NULL OR p_publication_key !~ ('^fleet:'||p_author_id::text||':[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$')
 OR jsonb_typeof(p_brief) IS DISTINCT FROM 'object' OR length(p_brief::text)>32768
 OR p_brief->>'kind' IS DISTINCT FROM 'hand' OR p_brief->>'domain' IS DISTINCT FROM 'poker'
 OR p_brief->>'source' IS DISTINCT FROM 'club arena'
 OR p_brief->>'title' IS DISTINCT FROM 'a hand from the tables'
 OR p_brief->'people' IS DISTINCT FROM '[]'::jsonb OR p_brief->'teams' IS DISTINCT FROM '[]'::jsonb
 OR p_brief->'amounts' IS DISTINCT FROM '[]'::jsonb
 OR p_brief->'isQuestion' IS DISTINCT FROM 'false'::jsonb
 OR p_brief->>'tone' NOT IN ('admiring','analytical') OR p_brief->>'tone' IS NULL
 OR p_brief->'confidence' IS DISTINCT FROM '1'::jsonb
 OR p_brief->'builtFrom' IS DISTINCT FROM '["horse_hand_reviews"]'::jsonb THEN
  RAISE EXCEPTION 'invalid grounded hand publication input' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_brief->'concepts') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'invalid hand brief concepts' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_brief->'concepts') NOT BETWEEN 1 AND 3
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_brief->'concepts') x WHERE jsonb_typeof(x)<>'string' OR length(x::text)>160)
 OR split_part(p_frame_key,':',3) IS DISTINCT FROM p_brief->'concepts'->>0 THEN
  RAISE EXCEPTION 'invalid hand brief concepts' USING ERRCODE='22023'; END IF;

 -- Same namespace as maintained video/news publishers: no cross-mode race.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('publish-horse-video-author:'||p_author_id::text,0));
 FOR v_lock IN SELECT DISTINCT k FROM unnest(ARRAY[
  'publish-horse-news-slot:'||p_publication_key,
  'publish-horse-video-phrase:'||p_phrase_norm,
  'publish-horse-video-phrase:'||p_semantic_key,
  'publish-horse-video-phrase:'||p_frame_key]) k ORDER BY k LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock,0));
 END LOOP;
 SELECT * INTO v_existing FROM public.social_posts WHERE metadata->>'publication_key'=p_publication_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.metadata->>'publication_contract'='horse_grounded_hand_v1'
  AND v_existing.metadata->>'publication_input_hash'=v_hash THEN
   IF v_existing.author_id IS DISTINCT FROM p_author_id OR v_existing.content IS DISTINCT FROM p_content
   OR v_existing.content_type IS DISTINCT FROM 'text' OR v_existing.origin_type IS DISTINCT FROM 'horse'
   OR NOT EXISTS(SELECT 1 FROM public.post_briefs WHERE post_id=v_existing.id AND kind='hand' AND domain='poker')
   OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_phrase_norm,p_semantic_key,p_frame_key]) k WHERE NOT EXISTS(
    SELECT 1 FROM public.horse_phrase_ledger l WHERE l.post_id=v_existing.id AND l.horse_id=p_author_id AND l.phrase_norm=k)) THEN
    RAISE EXCEPTION 'incomplete grounded hand publication receipt' USING ERRCODE='23514'; END IF;
   RETURN QUERY SELECT v_existing.id,false,'already_published'::text; RETURN;
  END IF;
  RETURN QUERY SELECT NULL::uuid,false,'duplicate_slot'::text; RETURN;
 END IF;
 -- One bounded acquisition, never a publication retry. Acquire the reward's
 -- final profile lock before shared configuration gates; preserve caller budget.
 v_previous_lock_timeout:=current_setting('lock_timeout');
 BEGIN
  PERFORM set_config('lock_timeout',CASE
   WHEN v_previous_lock_timeout='0' THEN '2s'
   WHEN current_setting('lock_timeout')::interval>interval '2 seconds' THEN '2s'
   ELSE v_previous_lock_timeout END,true);
  PERFORM 1 FROM public.profiles p
   WHERE p.id=p_author_id AND p.is_horse IS TRUE AND p.status='active'
   AND p.horse_status='available' AND p.avatar_url IS NOT NULL FOR UPDATE;
  v_profile_found:=FOUND;
  PERFORM set_config('lock_timeout',v_previous_lock_timeout,true);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('lock_timeout',v_previous_lock_timeout,true);
  RAISE;
 END;
 IF NOT v_profile_found THEN RAISE EXCEPTION 'grounded author inactive' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.content_authors ca WHERE ca.profile_id=p_author_id
  AND ca.is_active IS TRUE FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'grounded author inactive' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.content_settings FOR SHARE;
 IF (SELECT count(*) FROM public.content_settings)<>1 OR NOT EXISTS(SELECT 1 FROM public.content_settings WHERE engine_enabled IS TRUE AND auto_publish IS TRUE) THEN
  RAISE EXCEPTION 'grounded master gate disabled' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.caption_model_budget_settings FOR SHARE;
 IF (SELECT count(*) FROM public.caption_model_budget_settings)<>1 OR NOT EXISTS(SELECT 1 FROM public.caption_model_budget_settings WHERE enabled IS FALSE AND daily_budget_microusd=0) THEN
  RAISE EXCEPTION 'grounded zero model budget gate failed' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.horse_post_modes WHERE mode='grounded_hand' AND enabled IS TRUE AND approved_at IS NOT NULL AND nullif(btrim(approved_by),'') IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'grounded hand mode not approved/enabled' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_review FROM public.horse_hand_reviews WHERE id=p_review_id AND horse_user_id=p_author_id
 AND review_status='auto_reviewed' AND played_at>=now()-interval '7 days' AND played_at<=now() FOR SHARE NOWAIT;
 IF NOT FOUND OR v_review.hand_id IS NULL THEN RAISE EXCEPTION 'grounded own hand source unavailable' USING ERRCODE='42501'; END IF;
 IF p_semantic_key IS DISTINCT FROM 'grounded:hand:'||v_review.hand_id::text THEN
  RAISE EXCEPTION 'grounded semantic key does not match actual hand' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.hand_history WHERE id=v_review.hand_id AND ended_at IS NOT NULL AND ended_at<=now() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'grounded hand is not completed' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.social_posts WHERE author_id=p_author_id AND coalesce(is_deleted,false)=false AND created_at>=now()-interval '20 hours') THEN
  RETURN QUERY SELECT NULL::uuid,false,'posted_recently'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_semantic_key AND
  (used_at>='2026-09-29T00:00:00Z'::timestamptz OR used_at>=now()-interval '48 hours' OR(horse_id=p_author_id AND used_at>=now()-interval '90 days'))) THEN
  RETURN QUERY SELECT NULL::uuid,false,'source_used'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_phrase_norm AND
  (used_at>='2026-09-29T00:00:00Z'::timestamptz OR used_at>=now()-interval '48 hours' OR(horse_id=p_author_id AND used_at>=now()-interval '90 days'))) THEN
  RETURN QUERY SELECT NULL::uuid,false,'phrase_used'::text; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_frame_key AND used_at>=now()-interval '3 hours') THEN
  RETURN QUERY SELECT NULL::uuid,false,'frame_used'::text; RETURN; END IF;
 INSERT INTO public.social_posts(author_id,content,content_type,media_urls,visibility,audience_mode,topic,topics,origin_type,metadata)
 VALUES(p_author_id,p_content,'text','[]'::jsonb,'public','public','poker',ARRAY['poker','hand'],'horse',
 jsonb_build_object('scheduler','fleet','clip_type','poker','grounded',true,'grounded_type','hand',
 'hand_review_id',p_review_id::text,'hand_id',v_review.hand_id,'phrase_norm',p_phrase_norm,'semantic_key',p_semantic_key,
 'frame_key',p_frame_key,'publication_key',p_publication_key,'publication_contract','horse_grounded_hand_v1','publication_input_hash',v_hash)) RETURNING id INTO v_post;
 INSERT INTO public.horse_phrase_ledger(phrase_norm,horse_id,post_id) SELECT DISTINCT k,p_author_id,v_post FROM unnest(ARRAY[p_phrase_norm,p_semantic_key,p_frame_key]) k;
 INSERT INTO public.post_briefs(post_id,kind,domain,sport,title,source,people,teams,concepts,amounts,topic,tone,is_question,confidence,summary,built_from)
 VALUES(v_post,'hand','poker',NULL,p_brief->>'title','club arena',ARRAY[]::text[],ARRAY[]::text[],
 ARRAY(SELECT jsonb_array_elements_text(p_brief->'concepts')),ARRAY[]::text[],NULL,p_brief->>'tone',false,1,p_brief->>'title',ARRAY['horse_hand_reviews']);
 RETURN QUERY SELECT v_post,true,'published'::text;
END $function$;

-- CREATE OR REPLACE preserves existing owner and ACL; no reward definition changed.
DO $postflight$
BEGIN
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='publish_horse_grounded_hand')<>1 THEN
  RAISE EXCEPTION 'Grounded RPC overload drift'; END IF;
END $postflight$;
COMMIT;
-- ROLLBACK: paste below into a NEW qualified migration, never replay history.
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.publish_horse_grounded_hand(
--  p_author_id uuid,p_review_id bigint,p_content text,p_phrase_norm text,
--  p_semantic_key text,p_frame_key text,p_publication_key text,p_brief jsonb
-- ) RETURNS TABLE(social_post_id uuid,created boolean,reason text)
-- LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions
-- AS $function$
-- DECLARE
--  v_existing public.social_posts%ROWTYPE;
--  v_review public.horse_hand_reviews%ROWTYPE;
--  v_post uuid; v_lock text; v_field text;
--  v_phrase text:=btrim(regexp_replace(regexp_replace(regexp_replace(lower(split_part(p_content,E'\n',1)),
--   'https?://\S+','','g'),'[^a-z0-9\s]','','g'),'\s+',' ','g'));
--  v_hash text:=md5(jsonb_build_array(p_author_id,p_review_id,p_content,p_phrase_norm,p_semantic_key,p_frame_key,p_publication_key,p_brief)::text);
-- BEGIN
--  IF coalesce(auth.role()::text,'')<>'service_role' THEN
--   RAISE EXCEPTION 'grounded hand requires service role' USING ERRCODE='42501'; END IF;
--  IF p_author_id IS NULL OR p_review_id IS NULL OR p_review_id<=0
--  OR p_content IS NULL OR char_length(btrim(p_content)) NOT BETWEEN 1 AND 2000
--  OR p_content ~* '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
--  OR p_phrase_norm IS NULL OR p_phrase_norm='' OR p_phrase_norm IS DISTINCT FROM v_phrase
--  OR p_semantic_key IS NULL OR p_semantic_key !~ '^grounded:hand:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
--  OR p_frame_key IS NULL OR p_frame_key !~ '^frame:voice:(big_win|bad_beat|river_aggression|big_fold|cooler|stackoff|tough_spot|grind):[0-9]{1,2}$'
--  OR p_publication_key IS NULL OR p_publication_key !~ ('^fleet:'||p_author_id::text||':[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}$')
--  OR jsonb_typeof(p_brief) IS DISTINCT FROM 'object' OR length(p_brief::text)>32768
--  OR p_brief->>'kind' IS DISTINCT FROM 'hand' OR p_brief->>'domain' IS DISTINCT FROM 'poker'
--  OR p_brief->>'source' IS DISTINCT FROM 'club arena'
--  OR p_brief->>'title' IS DISTINCT FROM 'a hand from the tables'
--  OR p_brief->'people' IS DISTINCT FROM '[]'::jsonb OR p_brief->'teams' IS DISTINCT FROM '[]'::jsonb
--  OR p_brief->'amounts' IS DISTINCT FROM '[]'::jsonb
--  OR p_brief->'isQuestion' IS DISTINCT FROM 'false'::jsonb
--  OR p_brief->>'tone' NOT IN ('admiring','analytical') OR p_brief->>'tone' IS NULL
--  OR p_brief->'confidence' IS DISTINCT FROM '1'::jsonb
--  OR p_brief->'builtFrom' IS DISTINCT FROM '["horse_hand_reviews"]'::jsonb THEN
--   RAISE EXCEPTION 'invalid grounded hand publication input' USING ERRCODE='22023'; END IF;
--  IF jsonb_typeof(p_brief->'concepts') IS DISTINCT FROM 'array' THEN
--   RAISE EXCEPTION 'invalid hand brief concepts' USING ERRCODE='22023'; END IF;
--  IF jsonb_array_length(p_brief->'concepts') NOT BETWEEN 1 AND 3
--  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_brief->'concepts') x WHERE jsonb_typeof(x)<>'string' OR length(x::text)>160)
--  OR split_part(p_frame_key,':',3) IS DISTINCT FROM p_brief->'concepts'->>0 THEN
--   RAISE EXCEPTION 'invalid hand brief concepts' USING ERRCODE='22023'; END IF;
-- 
--  -- Same namespace as maintained video/news publishers: no cross-mode race.
--  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('publish-horse-video-author:'||p_author_id::text,0));
--  FOR v_lock IN SELECT DISTINCT k FROM unnest(ARRAY[
--   'publish-horse-news-slot:'||p_publication_key,
--   'publish-horse-video-phrase:'||p_phrase_norm,
--   'publish-horse-video-phrase:'||p_semantic_key,
--   'publish-horse-video-phrase:'||p_frame_key]) k ORDER BY k LOOP
--   PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock,0));
--  END LOOP;
--  SELECT * INTO v_existing FROM public.social_posts WHERE metadata->>'publication_key'=p_publication_key FOR UPDATE;
--  IF FOUND THEN
--   IF v_existing.metadata->>'publication_contract'='horse_grounded_hand_v1'
--   AND v_existing.metadata->>'publication_input_hash'=v_hash THEN
--    IF v_existing.author_id IS DISTINCT FROM p_author_id OR v_existing.content IS DISTINCT FROM p_content
--    OR v_existing.content_type IS DISTINCT FROM 'text' OR v_existing.origin_type IS DISTINCT FROM 'horse'
--    OR NOT EXISTS(SELECT 1 FROM public.post_briefs WHERE post_id=v_existing.id AND kind='hand' AND domain='poker')
--    OR EXISTS(SELECT 1 FROM unnest(ARRAY[p_phrase_norm,p_semantic_key,p_frame_key]) k WHERE NOT EXISTS(
--     SELECT 1 FROM public.horse_phrase_ledger l WHERE l.post_id=v_existing.id AND l.horse_id=p_author_id AND l.phrase_norm=k)) THEN
--     RAISE EXCEPTION 'incomplete grounded hand publication receipt' USING ERRCODE='23514'; END IF;
--    RETURN QUERY SELECT v_existing.id,false,'already_published'::text; RETURN;
--   END IF;
--   RETURN QUERY SELECT NULL::uuid,false,'duplicate_slot'::text; RETURN;
--  END IF;
--  PERFORM 1 FROM public.content_settings FOR SHARE;
--  IF (SELECT count(*) FROM public.content_settings)<>1 OR NOT EXISTS(SELECT 1 FROM public.content_settings WHERE engine_enabled IS TRUE AND auto_publish IS TRUE) THEN
--   RAISE EXCEPTION 'grounded master gate disabled' USING ERRCODE='42501'; END IF;
--  PERFORM 1 FROM public.caption_model_budget_settings FOR SHARE;
--  IF (SELECT count(*) FROM public.caption_model_budget_settings)<>1 OR NOT EXISTS(SELECT 1 FROM public.caption_model_budget_settings WHERE enabled IS FALSE AND daily_budget_microusd=0) THEN
--   RAISE EXCEPTION 'grounded zero model budget gate failed' USING ERRCODE='42501'; END IF;
--  PERFORM 1 FROM public.horse_post_modes WHERE mode='grounded_hand' AND enabled IS TRUE AND approved_at IS NOT NULL AND nullif(btrim(approved_by),'') IS NOT NULL FOR SHARE;
--  IF NOT FOUND THEN RAISE EXCEPTION 'grounded hand mode not approved/enabled' USING ERRCODE='42501'; END IF;
--  -- Ordinary post rewards need this final profile lock. Never upgrade after INSERT.
--  PERFORM 1 FROM public.profiles p JOIN public.content_authors ca ON ca.profile_id=p.id
--  WHERE p.id=p_author_id AND p.is_horse IS TRUE AND p.status='active' AND p.horse_status='available'
--  AND p.avatar_url IS NOT NULL AND ca.is_active IS TRUE FOR UPDATE OF p NOWAIT FOR SHARE OF ca NOWAIT;
--  IF NOT FOUND THEN RAISE EXCEPTION 'grounded author inactive' USING ERRCODE='42501'; END IF;
--  SELECT * INTO v_review FROM public.horse_hand_reviews WHERE id=p_review_id AND horse_user_id=p_author_id
--  AND review_status='auto_reviewed' AND played_at>=now()-interval '7 days' AND played_at<=now() FOR SHARE NOWAIT;
--  IF NOT FOUND OR v_review.hand_id IS NULL THEN RAISE EXCEPTION 'grounded own hand source unavailable' USING ERRCODE='42501'; END IF;
--  IF p_semantic_key IS DISTINCT FROM 'grounded:hand:'||v_review.hand_id::text THEN
--   RAISE EXCEPTION 'grounded semantic key does not match actual hand' USING ERRCODE='22023'; END IF;
--  PERFORM 1 FROM public.hand_history WHERE id=v_review.hand_id AND ended_at IS NOT NULL AND ended_at<=now() FOR SHARE NOWAIT;
--  IF NOT FOUND THEN RAISE EXCEPTION 'grounded hand is not completed' USING ERRCODE='42501'; END IF;
--  IF EXISTS(SELECT 1 FROM public.social_posts WHERE author_id=p_author_id AND coalesce(is_deleted,false)=false AND created_at>=now()-interval '20 hours') THEN
--   RETURN QUERY SELECT NULL::uuid,false,'posted_recently'::text; RETURN; END IF;
--  IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_semantic_key AND
--   (used_at>='2026-09-29T00:00:00Z'::timestamptz OR used_at>=now()-interval '48 hours' OR(horse_id=p_author_id AND used_at>=now()-interval '90 days'))) THEN
--   RETURN QUERY SELECT NULL::uuid,false,'source_used'::text; RETURN; END IF;
--  IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_phrase_norm AND
--   (used_at>='2026-09-29T00:00:00Z'::timestamptz OR used_at>=now()-interval '48 hours' OR(horse_id=p_author_id AND used_at>=now()-interval '90 days'))) THEN
--   RETURN QUERY SELECT NULL::uuid,false,'phrase_used'::text; RETURN; END IF;
--  IF EXISTS(SELECT 1 FROM public.horse_phrase_ledger WHERE phrase_norm=p_frame_key AND used_at>=now()-interval '3 hours') THEN
--   RETURN QUERY SELECT NULL::uuid,false,'frame_used'::text; RETURN; END IF;
--  INSERT INTO public.social_posts(author_id,content,content_type,media_urls,visibility,audience_mode,topic,topics,origin_type,metadata)
--  VALUES(p_author_id,p_content,'text','[]'::jsonb,'public','public','poker',ARRAY['poker','hand'],'horse',
--  jsonb_build_object('scheduler','fleet','clip_type','poker','grounded',true,'grounded_type','hand',
--  'hand_review_id',p_review_id::text,'hand_id',v_review.hand_id,'phrase_norm',p_phrase_norm,'semantic_key',p_semantic_key,
--  'frame_key',p_frame_key,'publication_key',p_publication_key,'publication_contract','horse_grounded_hand_v1','publication_input_hash',v_hash)) RETURNING id INTO v_post;
--  INSERT INTO public.horse_phrase_ledger(phrase_norm,horse_id,post_id) SELECT DISTINCT k,p_author_id,v_post FROM unnest(ARRAY[p_phrase_norm,p_semantic_key,p_frame_key]) k;
--  INSERT INTO public.post_briefs(post_id,kind,domain,sport,title,source,people,teams,concepts,amounts,topic,tone,is_question,confidence,summary,built_from)
--  VALUES(v_post,'hand','poker',NULL,p_brief->>'title','club arena',ARRAY[]::text[],ARRAY[]::text[],
--  ARRAY(SELECT jsonb_array_elements_text(p_brief->'concepts')),ARRAY[]::text[],NULL,p_brief->>'tone',false,1,p_brief->>'title',ARRAY['horse_hand_reviews']);
--  RETURN QUERY SELECT v_post,true,'published'::text;
-- END $function$;
-- COMMIT;
