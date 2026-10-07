-- Run only inside the caller's explicit transaction after Phase 5 and Phase 6 DDL.
-- Every mutation is fixture-scoped and the caller must ROLLBACK.
SELECT set_config('request.jwt.claim.role','service_role',true);

DO $rehearsal$
DECLARE
  v_candidate public.video_reel_candidates;
  v_master public.video_source_masters;
  v_rendition public.video_native_renditions;
  v_claim public.video_native_renditions;
  v_video_id uuid;
  v_path text;
  v_actor uuid := gen_random_uuid();
  v_rejected boolean := false;
BEGIN
  SELECT * INTO v_candidate FROM public.video_reel_candidates ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_candidate.id IS NULL THEN
    SELECT v.id INTO v_video_id FROM public.video_library_videos v
    LEFT JOIN public.video_reel_candidates c ON c.video_id=v.id WHERE c.id IS NULL ORDER BY v.created_at LIMIT 1;
    IF v_video_id IS NULL THEN RAISE EXCEPTION 'rehearsal requires one video fixture'; END IF;
    INSERT INTO public.video_reel_candidates(video_id) VALUES(v_video_id) RETURNING * INTO v_candidate;
  END IF;

  UPDATE public.video_reel_candidates SET status='approved',playback_mode='native_master',
    clip_start_seconds=0,clip_end_seconds=least(30,coalesce(clip_end_seconds,30)),
    rights_status='owned',native_clip_eligible=true,approved_at=now(),approved_by=v_actor
  WHERE id=v_candidate.id RETURNING * INTO v_candidate;

  v_path := format('%s/%s.source',v_candidate.video_id,gen_random_uuid());
  INSERT INTO public.video_source_upload_tickets(video_id,storage_path,actor_id,byte_size,mime_type) VALUES(v_candidate.video_id,v_path,v_actor,1048576,'video/mp4');
  SELECT * INTO v_master FROM public.fn_register_video_source_master(v_candidate.video_id,v_actor,'owned','ownership','phase6-rollback-rehearsal',
    ARRAY['native_clip'],ARRAY['worldwide'],now(),NULL,
    v_path,repeat('a',64),'video/mp4',1048576,120,1920,1080);

  BEGIN
    v_path := format('%s/%s.source',v_candidate.video_id,gen_random_uuid());
    INSERT INTO public.video_source_upload_tickets(video_id,storage_path,actor_id,byte_size,mime_type) VALUES(v_candidate.video_id,v_path,v_actor,1048576,'video/mp4');
    PERFORM public.fn_register_video_source_master(v_candidate.video_id,v_actor,'owned','ownership','replacement-must-refuse',
      ARRAY['native_clip'],ARRAY['worldwide'],now(),NULL,
      v_path,repeat('b',64),'video/mp4',1048576,120,1920,1080);
  EXCEPTION WHEN OTHERS THEN v_rejected := SQLERRM LIKE '%must be revoked before replacement%'; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'active replacement was not refused'; END IF;

  SELECT * INTO v_rendition FROM public.fn_queue_video_native_rendition(v_candidate.id,v_actor,
    jsonb_build_object('clip_start_seconds',0,'clip_end_seconds',15,'crop_mode','vertical_focus','focus_x',50,'branding',true));
  SELECT * INTO v_claim FROM public.fn_claim_video_native_renditions('phase6-rehearsal',1);
  IF v_claim.id IS DISTINCT FROM v_rendition.id OR v_claim.claim_token IS NULL THEN RAISE EXCEPTION 'bounded claim custody failed'; END IF;

  PERFORM public.fn_revoke_video_source_master(v_candidate.video_id,v_actor,'rehearsal revocation');
  IF (SELECT status FROM public.video_native_renditions WHERE id=v_rendition.id)<>'revoked' THEN RAISE EXCEPTION 'rendition did not revoke'; END IF;
  PERFORM public.fn_confirm_video_source_master_deleted(v_candidate.video_id);
  IF (SELECT status FROM public.video_source_masters WHERE id=v_master.id)<>'deleted' THEN RAISE EXCEPTION 'source deletion was not confirmed'; END IF;

  v_rejected := false;
  BEGIN
    v_path := format('%s/%s.source',v_candidate.video_id,gen_random_uuid());
    INSERT INTO public.video_source_upload_tickets(video_id,storage_path,actor_id,byte_size,mime_type) VALUES(v_candidate.video_id,v_path,v_actor,1048576,'video/mp4');
    PERFORM public.fn_register_video_source_master(v_candidate.video_id,v_actor,'owned','ownership','expired-rights-must-refuse',
      ARRAY['native_clip'],ARRAY['worldwide'],now()-interval '2 days',now()-interval '1 day',
      v_path,repeat('c',64),'video/mp4',1048576,120,1920,1080);
  EXCEPTION WHEN OTHERS THEN v_rejected := SQLERRM LIKE '%active native clipping rights required%'; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'expired rights were not refused'; END IF;

  RAISE NOTICE 'phase6 hostile-state rehearsal passed candidate=%',v_candidate.id;
END $rehearsal$;
