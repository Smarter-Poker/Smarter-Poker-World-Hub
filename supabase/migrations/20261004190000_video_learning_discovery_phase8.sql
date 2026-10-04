-- ==========================================================================
-- Phase 8: learning discovery, study continuity, and organic measurement
-- TIER: 2
-- AFFECTS: approved video search documents; study lists/items; progress;
--          learning events and privacy-bounded organic analytics
-- IRREVERSIBLE: no
--
-- UX-05 and SRCH-01..05 need one fail-closed database contract. Search only
-- indexes editorially approved/published, currently playable assets. Personal
-- study state is owner-scoped. Raw measurement is service-owned and contains
-- no IP address, user agent, URL, or free-form client payload.
-- ==========================================================================

BEGIN;

DO $preflight$
BEGIN
  IF to_regclass('public.video_library_videos') IS NULL
     OR to_regclass('public.video_enrichment_records') IS NULL
     OR to_regclass('public.social_reels') IS NULL
     OR to_regclass('public.saved_reels') IS NULL THEN
    RAISE EXCEPTION 'preflight: Phase 4 video library and enrichment records are required';
  END IF;
  IF to_regprocedure('public.fn_is_video_library_asset_eligible(uuid)') IS NULL THEN
    RAISE EXCEPTION 'preflight: video playback eligibility authority is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') THEN
    RAISE EXCEPTION 'preflight: vector extension is required for semantic search';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_reels' AND column_name='source_type')
     OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='social_reels' AND column_name='source_asset_id') THEN
    RAISE EXCEPTION 'preflight: canonical Reel save lineage is required';
  END IF;
END
$preflight$;

CREATE TABLE public.video_learning_search_documents (
  video_id uuid PRIMARY KEY REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  title text NOT NULL,
  creator_name text NOT NULL,
  concepts_text text NOT NULL DEFAULT '',
  chapters_text text NOT NULL DEFAULT '',
  transcript_text text NOT NULL DEFAULT '',
  search_vector tsvector NOT NULL,
  embedding vector(384),
  embedding_model text,
  embedding_updated_at timestamptz,
  editorial_version integer NOT NULL CHECK (editorial_version>0),
  published_at timestamptz,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (embedding_model IS NULL OR length(btrim(embedding_model)) BETWEEN 3 AND 120),
  CHECK ((embedding IS NULL)=(embedding_model IS NULL)),
  CHECK ((embedding IS NULL)=(embedding_updated_at IS NULL))
);
CREATE INDEX video_learning_search_fts_idx ON public.video_learning_search_documents USING gin(search_vector);
CREATE INDEX video_learning_search_recent_idx ON public.video_learning_search_documents(published_at DESC NULLS LAST,video_id);

CREATE TABLE public.video_study_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK(description IS NULL OR length(description)<=500),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,name)
);
CREATE TABLE public.video_study_list_items (
  list_id uuid NOT NULL REFERENCES public.video_study_lists(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  note text CHECK(note IS NULL OR length(note)<=1000),
  start_seconds numeric(10,3) CHECK(start_seconds IS NULL OR start_seconds>=0),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(list_id,video_id)
);
CREATE INDEX video_study_list_items_video_idx ON public.video_study_list_items(video_id,list_id);

CREATE TABLE public.video_learning_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  position_seconds numeric(10,3) NOT NULL DEFAULT 0 CHECK(position_seconds>=0),
  duration_seconds numeric(10,3) CHECK(duration_seconds IS NULL OR duration_seconds>0),
  percent_complete numeric(6,5) NOT NULL DEFAULT 0 CHECK(percent_complete BETWEEN 0 AND 1),
  completed_at timestamptz,
  last_chapter_key text CHECK(last_chapter_key IS NULL OR length(last_chapter_key)<=160),
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,video_id),
  CHECK(duration_seconds IS NULL OR position_seconds<=duration_seconds+5),
  CHECK((completed_at IS NULL) OR percent_complete>=0.9)
);
CREATE INDEX video_learning_progress_continue_idx ON public.video_learning_progress(user_id,last_watched_at DESC)
  WHERE completed_at IS NULL AND position_seconds>0;

CREATE TABLE public.video_learning_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  video_id uuid NOT NULL REFERENCES public.video_library_videos(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('impression','play','chapter_start','progress_25','progress_50','progress_75','complete','study_save','search_open')),
  occurred_at timestamptz NOT NULL,
  position_seconds numeric(10,3) CHECK(position_seconds IS NULL OR position_seconds>=0),
  watch_delta_seconds numeric(10,3) NOT NULL DEFAULT 0 CHECK(watch_delta_seconds BETWEEN 0 AND 300),
  discovery_source text NOT NULL CHECK(discovery_source IN ('search','semantic_search','creator','concept','chapter','continue','study_list','direct')),
  organic_qualified boolean NOT NULL DEFAULT false,
  bot_score numeric(4,3) NOT NULL CHECK(bot_score BETWEEN 0 AND 1),
  rejection_code text CHECK(rejection_code IS NULL OR rejection_code IN ('anonymous','unverified_human','bot_score','future_time','stale_time','duplicate_window','ineligible_video')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((organic_qualified AND rejection_code IS NULL) OR (NOT organic_qualified))
);
CREATE UNIQUE INDEX video_learning_events_organic_window_key
  ON public.video_learning_events(user_id,video_id,event_type,(date_bin(interval '30 seconds',occurred_at,timestamptz '2000-01-01')))
  WHERE organic_qualified AND user_id IS NOT NULL;
CREATE INDEX video_learning_events_measure_idx ON public.video_learning_events(created_at DESC,event_type,organic_qualified);

ALTER TABLE public.video_learning_search_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_study_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_study_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_learning_search_public_read ON public.video_learning_search_documents
  FOR SELECT TO anon,authenticated USING(public.fn_is_video_library_asset_eligible(video_id));
CREATE POLICY video_study_lists_owner ON public.video_study_lists FOR ALL TO authenticated
  USING(user_id=(SELECT auth.uid())) WITH CHECK(user_id=(SELECT auth.uid()));
CREATE POLICY video_study_items_owner ON public.video_study_list_items FOR ALL TO authenticated
  USING(EXISTS(SELECT 1 FROM public.video_study_lists l WHERE l.id=list_id AND l.user_id=(SELECT auth.uid())))
  WITH CHECK(EXISTS(SELECT 1 FROM public.video_study_lists l WHERE l.id=list_id AND l.user_id=(SELECT auth.uid())));
CREATE POLICY video_learning_progress_owner ON public.video_learning_progress FOR SELECT TO authenticated
  USING(user_id=(SELECT auth.uid()));

REVOKE ALL ON public.video_learning_search_documents,public.video_study_lists,
  public.video_study_list_items,public.video_learning_progress,public.video_learning_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.video_learning_search_documents TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.video_study_lists,public.video_study_list_items TO authenticated;
GRANT SELECT ON public.video_learning_progress TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.video_learning_search_documents,public.video_study_lists,
  public.video_study_list_items,public.video_learning_progress,public.video_learning_events TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.video_learning_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.fn_refresh_video_learning_search_document(p_video_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_enrichment_records; v public.video_library_videos;
  v_chapters text; v_vector tsvector;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' AND pg_trigger_depth()=0 THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.video_enrichment_records WHERE video_id=p_video_id;
  SELECT * INTO v FROM public.video_library_videos WHERE id=p_video_id;
  IF r.video_id IS NULL OR v.id IS NULL OR r.workflow_state NOT IN ('approved','published')
     OR NOT public.fn_is_video_library_asset_eligible(p_video_id) THEN
    DELETE FROM public.video_learning_search_documents WHERE video_id=p_video_id;
    RETURN false;
  END IF;
  SELECT coalesce(string_agg(concat_ws(' ',c->>'title',c->>'label',c->>'summary'),' '),'') INTO v_chapters
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.chapters)='array' THEN r.chapters ELSE '[]'::jsonb END) c;
  v_vector:=setweight(to_tsvector('english',coalesce(nullif(r.editorial_title,''),v.title,'')),'A')
    ||setweight(to_tsvector('english',coalesce(v.source_name,'')),'A')
    ||setweight(to_tsvector('english',coalesce(array_to_string(r.concepts,' '),'')),'B')
    ||setweight(to_tsvector('english',v_chapters),'B')
    ||setweight(to_tsvector('english',coalesce(r.transcript_text,'')),'C');
  INSERT INTO public.video_learning_search_documents(video_id,title,creator_name,concepts_text,chapters_text,transcript_text,search_vector,editorial_version,published_at,indexed_at)
  VALUES(p_video_id,coalesce(nullif(r.editorial_title,''),v.title),v.source_name,array_to_string(r.concepts,' '),v_chapters,coalesce(r.transcript_text,''),v_vector,r.version,v.published_at,now())
  ON CONFLICT(video_id) DO UPDATE SET title=excluded.title,creator_name=excluded.creator_name,
    concepts_text=excluded.concepts_text,chapters_text=excluded.chapters_text,transcript_text=excluded.transcript_text,
    search_vector=excluded.search_vector,editorial_version=excluded.editorial_version,published_at=excluded.published_at,
    embedding=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding ELSE NULL END,
    embedding_model=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding_model ELSE NULL END,
    embedding_updated_at=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding_updated_at ELSE NULL END,indexed_at=now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_video_learning_embedding(p_video_id uuid,p_editorial_version integer,p_embedding vector(384),p_model text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  UPDATE public.video_learning_search_documents SET embedding=p_embedding,embedding_model=left(btrim(p_model),120),embedding_updated_at=now()
  WHERE video_id=p_video_id AND editorial_version=p_editorial_version AND p_embedding IS NOT NULL AND length(btrim(p_model)) BETWEEN 3 AND 120;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.fn_sync_video_learning_search_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  PERFORM public.fn_refresh_video_learning_search_document(CASE WHEN TG_OP='DELETE' THEN OLD.video_id ELSE NEW.video_id END);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_sync_video_learning_search_document
AFTER INSERT OR UPDATE OR DELETE ON public.video_enrichment_records
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_video_learning_search_document();

CREATE OR REPLACE FUNCTION public.search_video_learning(p_query text,p_query_embedding vector(384) DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS TABLE(video_id uuid,title text,creator_name text,concepts text,chapters text,rank real,semantic_distance real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions AS $$
  WITH q AS (SELECT websearch_to_tsquery('english',left(btrim(coalesce(p_query,'')),200)) query)
  SELECT d.video_id,d.title,d.creator_name,d.concepts_text,d.chapters_text,
    (ts_rank_cd(d.search_vector,q.query)*0.7 + CASE WHEN p_query_embedding IS NULL OR d.embedding IS NULL THEN 0 ELSE (1-(d.embedding<=>p_query_embedding))*0.3 END)::real,
    CASE WHEN p_query_embedding IS NULL OR d.embedding IS NULL THEN NULL ELSE (d.embedding<=>p_query_embedding)::real END
  FROM public.video_learning_search_documents d CROSS JOIN q
  WHERE public.fn_is_video_library_asset_eligible(d.video_id)
    AND (
      btrim(coalesce(p_query,''))=''
      OR d.search_vector@@q.query
      OR (p_query_embedding IS NOT NULL AND d.embedding IS NOT NULL)
    )
  ORDER BY 6 DESC,d.published_at DESC NULLS LAST,d.video_id LIMIT greatest(1,least(coalesce(p_limit,20),50))
$$;

CREATE OR REPLACE FUNCTION public.upsert_video_learning_progress(p_video_id uuid,p_position_seconds numeric,p_duration_seconds numeric,p_chapter_key text DEFAULT NULL)
RETURNS public.video_learning_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); r public.video_learning_progress; pct numeric;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF p_position_seconds<0 OR p_duration_seconds<=0 OR p_position_seconds>p_duration_seconds+5 OR NOT public.fn_is_video_library_asset_eligible(p_video_id) THEN RAISE EXCEPTION 'invalid or ineligible progress'; END IF;
  pct:=least(1,p_position_seconds/p_duration_seconds);
  INSERT INTO public.video_learning_progress(user_id,video_id,position_seconds,duration_seconds,percent_complete,completed_at,last_chapter_key,last_watched_at,updated_at)
  VALUES(u,p_video_id,p_position_seconds,p_duration_seconds,pct,CASE WHEN pct>=.9 THEN now() END,left(p_chapter_key,160),now(),now())
  ON CONFLICT(user_id,video_id) DO UPDATE SET
    percent_complete=greatest(video_learning_progress.percent_complete,excluded.percent_complete),
    position_seconds=CASE WHEN excluded.percent_complete>=video_learning_progress.percent_complete THEN excluded.position_seconds ELSE video_learning_progress.position_seconds END,
    duration_seconds=CASE WHEN excluded.percent_complete>=video_learning_progress.percent_complete THEN excluded.duration_seconds ELSE video_learning_progress.duration_seconds END,
    completed_at=CASE WHEN greatest(video_learning_progress.percent_complete,excluded.percent_complete)>=.9 THEN coalesce(video_learning_progress.completed_at,now()) ELSE NULL END,
    last_chapter_key=excluded.last_chapter_key,last_watched_at=now(),updated_at=now() RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.set_video_learning_reel_saved(p_video_id uuid,p_reel_id uuid,p_saved boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE u uuid:=auth.uid(); list_uuid uuid;
BEGIN
  IF u IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.fn_is_video_library_asset_eligible(p_video_id)
     OR NOT EXISTS(SELECT 1 FROM public.social_reels r WHERE r.id=p_reel_id AND r.source_asset_id=p_video_id AND r.is_public=true)
  THEN RAISE EXCEPTION 'invalid or ineligible Reel study target'; END IF;
  INSERT INTO public.video_study_lists(user_id,name,description)
  VALUES(u,'Study Queue','Lessons saved from Video Library and Reels.')
  ON CONFLICT(user_id,name) DO NOTHING;
  SELECT id INTO list_uuid FROM public.video_study_lists WHERE user_id=u AND name='Study Queue';
  IF p_saved THEN
    INSERT INTO public.video_study_list_items(list_id,video_id) VALUES(list_uuid,p_video_id)
    ON CONFLICT(list_id,video_id) DO NOTHING;
    INSERT INTO public.saved_reels(user_id,reel_id,source_type) VALUES(u,p_reel_id,'reel')
    ON CONFLICT(user_id,reel_id) DO NOTHING;
  ELSE
    DELETE FROM public.video_study_list_items WHERE list_id=list_uuid AND video_id=p_video_id;
    DELETE FROM public.saved_reels WHERE user_id=u AND reel_id=p_reel_id;
  END IF;
  RETURN p_saved;
END $$;

CREATE OR REPLACE FUNCTION public.record_video_learning_event(p_event_id uuid,p_user_id uuid,p_video_id uuid,p_session_id uuid,p_event_type text,p_occurred_at timestamptz,p_position_seconds numeric,p_watch_delta_seconds numeric,p_discovery_source text,p_verified_human boolean,p_bot_score numeric)
RETURNS TABLE(accepted boolean,organic_qualified boolean,rejection_code text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE qualified boolean; rejection text; inserted boolean;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  IF p_event_id IS NULL OR p_video_id IS NULL OR p_session_id IS NULL OR p_event_type NOT IN ('impression','play','chapter_start','progress_25','progress_50','progress_75','complete','study_save','search_open') OR p_discovery_source NOT IN ('search','semantic_search','creator','concept','chapter','continue','study_list','direct') OR p_bot_score NOT BETWEEN 0 AND 1 OR coalesce(p_watch_delta_seconds,0) NOT BETWEEN 0 AND 300 THEN RAISE EXCEPTION 'invalid learning event'; END IF;
  rejection:=CASE WHEN NOT public.fn_is_video_library_asset_eligible(p_video_id) THEN 'ineligible_video' WHEN p_user_id IS NULL THEN 'anonymous' WHEN NOT coalesce(p_verified_human,false) THEN 'unverified_human' WHEN p_bot_score>.2 THEN 'bot_score' WHEN p_occurred_at>now()+interval '5 minutes' THEN 'future_time' WHEN p_occurred_at<now()-interval '7 days' THEN 'stale_time' WHEN EXISTS(SELECT 1 FROM public.video_learning_events e WHERE e.user_id=p_user_id AND e.video_id=p_video_id AND e.event_type=p_event_type AND e.occurred_at>=p_occurred_at-interval '30 seconds' AND e.occurred_at<=p_occurred_at+interval '30 seconds' AND e.organic_qualified) THEN 'duplicate_window' END;
  qualified:=rejection IS NULL;
  INSERT INTO public.video_learning_events(event_id,user_id,video_id,session_id,event_type,occurred_at,position_seconds,watch_delta_seconds,discovery_source,organic_qualified,bot_score,rejection_code)
  VALUES(p_event_id,p_user_id,p_video_id,p_session_id,p_event_type,p_occurred_at,p_position_seconds,coalesce(p_watch_delta_seconds,0),p_discovery_source,qualified,p_bot_score,rejection)
  ON CONFLICT DO NOTHING;
  inserted:=FOUND;
  IF NOT inserted AND NOT EXISTS(SELECT 1 FROM public.video_learning_events WHERE event_id=p_event_id) THEN
    qualified:=false; rejection:='duplicate_window';
    INSERT INTO public.video_learning_events(event_id,user_id,video_id,session_id,event_type,occurred_at,position_seconds,watch_delta_seconds,discovery_source,organic_qualified,bot_score,rejection_code)
    VALUES(p_event_id,p_user_id,p_video_id,p_session_id,p_event_type,p_occurred_at,p_position_seconds,coalesce(p_watch_delta_seconds,0),p_discovery_source,false,p_bot_score,rejection)
    ON CONFLICT DO NOTHING;
    inserted:=FOUND;
  END IF;
  RETURN QUERY SELECT inserted,qualified,rejection;
END $$;

REVOKE ALL ON FUNCTION public.fn_refresh_video_learning_search_document(uuid),public.fn_set_video_learning_embedding(uuid,integer,vector,text),public.search_video_learning(text,vector,integer),public.upsert_video_learning_progress(uuid,numeric,numeric,text),public.set_video_learning_reel_saved(uuid,uuid,boolean),public.record_video_learning_event(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,text,boolean,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_video_learning_search_document() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_refresh_video_learning_search_document(uuid),public.fn_set_video_learning_embedding(uuid,integer,vector,text),public.record_video_learning_event(uuid,uuid,uuid,uuid,text,timestamptz,numeric,numeric,text,boolean,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_video_learning(text,vector,integer) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_video_learning_progress(uuid,numeric,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.set_video_learning_reel_saved(uuid,uuid,boolean) TO authenticated,service_role;

INSERT INTO public.video_learning_search_documents(video_id,title,creator_name,concepts_text,chapters_text,transcript_text,search_vector,editorial_version,published_at,indexed_at)
SELECT r.video_id,coalesce(nullif(r.editorial_title,''),v.title),v.source_name,
  array_to_string(r.concepts,' '),chapter_text.value,coalesce(r.transcript_text,''),
  setweight(to_tsvector('english',coalesce(nullif(r.editorial_title,''),v.title,'')),'A')
    ||setweight(to_tsvector('english',coalesce(v.source_name,'')),'A')
    ||setweight(to_tsvector('english',coalesce(array_to_string(r.concepts,' '),'')),'B')
    ||setweight(to_tsvector('english',chapter_text.value),'B')
    ||setweight(to_tsvector('english',coalesce(r.transcript_text,'')),'C'),
  r.version,v.published_at,now()
FROM public.video_enrichment_records r
JOIN public.video_library_videos v ON v.id=r.video_id
CROSS JOIN LATERAL (
  SELECT coalesce(string_agg(concat_ws(' ',c->>'title',c->>'label',c->>'summary'),' '),'') value
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.chapters)='array' THEN r.chapters ELSE '[]'::jsonb END) c
) chapter_text
WHERE r.workflow_state IN ('approved','published') AND public.fn_is_video_library_asset_eligible(r.video_id)
ON CONFLICT(video_id) DO NOTHING;

DO $postapply$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.video_learning_events'::regclass) THEN RAISE EXCEPTION 'post-apply: learning event RLS missing'; END IF;
  IF has_table_privilege('authenticated','public.video_learning_events','INSERT') THEN RAISE EXCEPTION 'post-apply: clients can forge learning events'; END IF;
  IF NOT has_function_privilege('authenticated','public.upsert_video_learning_progress(uuid,numeric,numeric,text)','EXECUTE') THEN RAISE EXCEPTION 'post-apply: authenticated progress RPC unavailable'; END IF;
  IF NOT has_function_privilege('authenticated','public.set_video_learning_reel_saved(uuid,uuid,boolean)','EXECUTE') THEN RAISE EXCEPTION 'post-apply: atomic Reel study RPC unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.video_enrichment_records'::regclass AND tgname='trg_sync_video_learning_search_document' AND NOT tgisinternal) THEN RAISE EXCEPTION 'post-apply: approved search synchronization trigger missing'; END IF;
END
$postapply$;

COMMIT;

-- ROLLBACK: ship a new forward migration. Revoke/drop the six Phase 8 RPCs,
-- then drop the five Phase 8 tables in reverse dependency order.
