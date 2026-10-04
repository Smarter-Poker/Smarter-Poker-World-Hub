-- Phase 8 follow-up: every currently playable managed catalog video must be
-- searchable even before optional editorial enrichment has been approved.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_refresh_video_learning_search_document(p_video_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE r public.video_enrichment_records; v public.video_library_videos;
  v_title text; v_concepts text; v_chapters text:=''; v_transcript text:='';
  v_version integer:=1; v_vector tsvector;
BEGIN
  IF coalesce(auth.role()::text,'')<>'service_role' AND pg_trigger_depth()=0 THEN RAISE EXCEPTION 'service role required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.video_library_videos WHERE id=p_video_id;
  IF v.id IS NULL OR NOT public.fn_is_video_library_asset_eligible(p_video_id) THEN
    DELETE FROM public.video_learning_search_documents WHERE video_id=p_video_id;
    RETURN false;
  END IF;
  SELECT * INTO r FROM public.video_enrichment_records WHERE video_id=p_video_id;
  v_title:=v.title;
  SELECT coalesce(string_agg(tag,' '),'') INTO v_concepts
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v.tags)='array' THEN v.tags ELSE '[]'::jsonb END) tag;
  IF r.video_id IS NOT NULL AND r.workflow_state IN ('approved','published') THEN
    v_title:=coalesce(nullif(r.editorial_title,''),v.title);
    v_concepts:=coalesce(array_to_string(r.concepts,' '),v_concepts);
    SELECT coalesce(string_agg(concat_ws(' ',c->>'title',c->>'label',c->>'summary'),' '),'') INTO v_chapters
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.chapters)='array' THEN r.chapters ELSE '[]'::jsonb END) c;
    v_transcript:=coalesce(r.transcript_text,'');
    v_version:=r.version;
  END IF;
  v_vector:=setweight(to_tsvector('english',coalesce(v_title,'')),'A')
    ||setweight(to_tsvector('english',coalesce(v.source_name,'')),'A')
    ||setweight(to_tsvector('english',coalesce(v_concepts,'')),'B')
    ||setweight(to_tsvector('english',coalesce(v_chapters,'')),'B')
    ||setweight(to_tsvector('english',coalesce(v_transcript,'')),'C');
  INSERT INTO public.video_learning_search_documents(video_id,title,creator_name,concepts_text,chapters_text,transcript_text,search_vector,editorial_version,published_at,indexed_at)
  VALUES(p_video_id,v_title,v.source_name,v_concepts,v_chapters,v_transcript,v_vector,v_version,v.published_at,now())
  ON CONFLICT(video_id) DO UPDATE SET title=excluded.title,creator_name=excluded.creator_name,
    concepts_text=excluded.concepts_text,chapters_text=excluded.chapters_text,transcript_text=excluded.transcript_text,
    search_vector=excluded.search_vector,editorial_version=excluded.editorial_version,published_at=excluded.published_at,
    embedding=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding ELSE NULL END,
    embedding_model=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding_model ELSE NULL END,
    embedding_updated_at=CASE WHEN video_learning_search_documents.editorial_version=excluded.editorial_version THEN video_learning_search_documents.embedding_updated_at ELSE NULL END,indexed_at=now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fn_sync_video_learning_catalog_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  PERFORM public.fn_refresh_video_learning_search_document(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS trg_sync_video_learning_catalog_document ON public.video_library_videos;
CREATE TRIGGER trg_sync_video_learning_catalog_document
AFTER INSERT OR UPDATE OF youtube_video_id,source_name,type,title,tags,published_at,availability_status,embeddable,availability_checked_at OR DELETE
ON public.video_library_videos FOR EACH ROW EXECUTE FUNCTION public.fn_sync_video_learning_catalog_document();

REVOKE ALL ON FUNCTION public.fn_sync_video_learning_catalog_document() FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO public.video_learning_search_documents(video_id,title,creator_name,concepts_text,chapters_text,transcript_text,search_vector,editorial_version,published_at,indexed_at)
SELECT v.id,v.title,v.source_name,tags_text.value,'','',
  setweight(to_tsvector('english',coalesce(v.title,'')),'A')
    ||setweight(to_tsvector('english',coalesce(v.source_name,'')),'A')
    ||setweight(to_tsvector('english',tags_text.value),'B'),
  1,v.published_at,now()
FROM public.video_library_videos v
CROSS JOIN LATERAL (
  SELECT coalesce(string_agg(tag,' '),'') value
  FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v.tags)='array' THEN v.tags ELSE '[]'::jsonb END) tag
) tags_text
WHERE public.fn_is_video_library_asset_eligible(v.id)
ON CONFLICT(video_id) DO NOTHING;

DO $postapply$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.video_library_videos'::regclass AND tgname='trg_sync_video_learning_catalog_document' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'post-apply: catalog search synchronization trigger missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.video_library_videos v WHERE public.fn_is_video_library_asset_eligible(v.id) AND NOT EXISTS(SELECT 1 FROM public.video_learning_search_documents d WHERE d.video_id=v.id)) THEN
    RAISE EXCEPTION 'post-apply: eligible catalog rows are missing search documents';
  END IF;
END
$postapply$;

COMMIT;

-- ROLLBACK: ship a forward migration that restores the Phase 8 enrichment-only
-- refresh function and removes trg_sync_video_learning_catalog_document.
