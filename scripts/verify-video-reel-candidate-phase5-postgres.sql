-- Rollback-only production-schema qualification for the Phase 5 candidate contract.
-- The caller supplies the database connection; this file never persists probe data.
BEGIN;
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $probe$
DECLARE
  c public.video_reel_candidates; retried public.video_reel_candidates;
  done public.video_reel_candidates; reviewed public.video_reel_candidates;
  v public.video_library_videos; e public.video_enrichment_records; s public.content_sources;
  runtime numeric; clip_end numeric; kind text; mode text; embed text; rights text;
  source_key text; creator_key text; topic text; refused boolean;
BEGIN
  SELECT * INTO c FROM public.fn_claim_video_reel_candidate_sources('phase5-rollback-probe',1) LIMIT 1;
  IF c.id IS NULL THEN RAISE EXCEPTION 'probe found no eligible source'; END IF;
  SELECT * INTO v FROM public.video_library_videos WHERE id=c.video_id;
  SELECT * INTO e FROM public.video_enrichment_records WHERE video_id=c.video_id;
  SELECT * INTO s FROM public.content_sources WHERE id::text=v.source_id;
  runtime:=public.fn_video_duration_seconds(v.duration);
  source_key:=coalesce(v.source_id,v.source_name,'unknown');
  creator_key:=coalesce(s.provider_source_id,v.provider_channel_id,v.source_name,'unknown');
  topic:=CASE WHEN coalesce(s.ingest_topic,'')='sports' OR v.type='sports' THEN 'sports'
    WHEN coalesce(s.ingest_topic,'')='casino_slots' OR v.type='slots' THEN 'casino-slots' ELSE 'poker' END;
  rights:=coalesce(s.rights_status,'embed_only');
  kind:=CASE WHEN runtime<=180 OR e.format='short' THEN 'validated_short' ELSE 'metadata_highlight' END;
  clip_end:=CASE WHEN kind='validated_short' THEN runtime ELSE least(floor(runtime),60) END;
  IF v.youtube_video_id ~ '^[A-Za-z0-9_-]{11}$' THEN
    mode:='third_party_embed';
    embed:=format('https://www.youtube-nocookie.com/embed/%s?start=0&end=%s',v.youtube_video_id,clip_end::bigint);
  ELSE mode:='native_master'; embed:=NULL; END IF;

  refused:=false;
  BEGIN
    PERFORM public.fn_finish_video_reel_candidate(c.id,'phase5-rollback-probe',kind,mode,NULL,clip_end,embed,
      'Rollback boundary refusal',jsonb_build_object('probe',true),e.quality_score,source_key,creator_key,topic,rights,mode='native_master');
  EXCEPTION WHEN OTHERS THEN refused:=position('outside source runtime' IN SQLERRM)>0; END;
  IF NOT refused THEN RAISE EXCEPTION 'null boundary did not fail closed'; END IF;

  IF mode='third_party_embed' THEN
    refused:=false;
    BEGIN
      PERFORM public.fn_finish_video_reel_candidate(c.id,'phase5-rollback-probe',kind,mode,0,clip_end,
        replace(embed,'start=0','start=1'),'Rollback embed refusal',jsonb_build_object('probe',true),e.quality_score,
        source_key,creator_key,topic,rights,false);
    EXCEPTION WHEN OTHERS THEN refused:=position('canonical bounded embed' IN SQLERRM)>0; END;
    IF NOT refused THEN RAISE EXCEPTION 'mismatched embed window did not fail closed'; END IF;
  END IF;

  SELECT * INTO c FROM public.fn_fail_video_reel_candidate(c.id,'phase5-rollback-probe','Probe Transport Failure');
  IF c.status<>'generating' OR c.failure_count<>1 OR c.claimed_by IS NOT NULL OR c.next_attempt_at<=now() THEN
    RAISE EXCEPTION 'candidate retry custody mismatch';
  END IF;
  UPDATE public.video_reel_candidates
  SET claimed_at=now(),next_attempt_at=now()+interval '1 hour'
  WHERE status='generating' AND id<>c.id;
  UPDATE public.video_reel_candidates SET next_attempt_at=now()-interval '1 second' WHERE id=c.id;
  SELECT * INTO retried FROM public.fn_claim_video_reel_candidate_sources('phase5-rollback-probe',1) LIMIT 1;
  IF retried.id IS DISTINCT FROM c.id OR retried.failure_count<>1 THEN RAISE EXCEPTION 'candidate retry claim mismatch'; END IF;

  SELECT * INTO done FROM public.fn_finish_video_reel_candidate(c.id,'phase5-rollback-probe',kind,mode,0,clip_end,embed,
    'Rollback probe with complete rationale',jsonb_build_object('probe',true),e.quality_score,
    source_key,creator_key,topic,rights,mode='native_master');
  IF done.status<>'proposed' OR done.source_duration_seconds<>runtime OR done.clip_end_seconds>runtime OR done.failure_count<>0 THEN
    RAISE EXCEPTION 'completed candidate contract mismatch';
  END IF;
  SELECT * INTO reviewed FROM public.fn_review_video_reel_candidate(done.id,gen_random_uuid(),'approve',done.version,NULL);
  IF reviewed.status<>'approved' THEN RAISE EXCEPTION 'review contract mismatch'; END IF;
  refused:=false;
  BEGIN
    PERFORM public.fn_review_video_reel_candidate(reviewed.id,gen_random_uuid(),'reject',reviewed.version,'invalid reversal');
  EXCEPTION WHEN OTHERS THEN refused:=position('cannot be rejected' IN SQLERRM)>0; END;
  IF NOT refused THEN RAISE EXCEPTION 'approved candidate rejection did not fail closed'; END IF;
  RAISE NOTICE 'phase5 rollback probe passed: kind=%, mode=%, runtime=%, end=%',done.selection_kind,done.playback_mode,runtime,clip_end;
END
$probe$;

ROLLBACK;
