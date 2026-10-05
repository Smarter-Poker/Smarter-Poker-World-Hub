-- Phase 3 registry compatibility: admit canonical sports assets and publish
-- them through the existing fail-closed managed Video Library bridge.
BEGIN;

DO $preflight$
DECLARE
  v_constraint text;
  v_asset text;
  v_fresh text;
  v_publish text;
BEGIN
  SELECT pg_get_constraintdef(oid, true)
  INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.video_library_videos'::regclass
    AND conname = 'video_library_videos_type_check';

  SELECT pg_get_functiondef('public.fn_is_video_library_asset_eligible(uuid)'::regprocedure)
    INTO v_asset;
  SELECT pg_get_functiondef('public.fn_has_fresh_public_youtube_verification(text)'::regprocedure)
    INTO v_fresh;
  SELECT pg_get_functiondef('public.publish_video_library_reel(text, uuid, text)'::regprocedure)
    INTO v_publish;

  IF v_constraint NOT LIKE '%ARRAY[''cash''::text, ''tournament''::text, ''slots''::text]%'
     OR v_asset NOT LIKE '%v.type IN (''cash'', ''tournament'', ''slots'')%'
     OR v_fresh NOT LIKE '%verified_asset.type IN (''cash'', ''tournament'', ''slots'')%'
     OR v_publish NOT LIKE '%v_asset.type NOT IN (''cash'', ''tournament'', ''slots'')%'
     OR v_publish NOT LIKE '%CASE WHEN v_asset.type = ''slots'' THEN ''slots'' ELSE ''poker'' END%'
     OR v_publish NOT LIKE '%WHEN v_asset.type = ''slots'' THEN ARRAY[''slots'']::text[]%'
  THEN
    RAISE EXCEPTION 'pre-flight failed: installed Video Library type contract drifted';
  END IF;
END
$preflight$;

ALTER TABLE public.video_library_videos
  DROP CONSTRAINT video_library_videos_type_check;
ALTER TABLE public.video_library_videos
  ADD CONSTRAINT video_library_videos_type_check
  CHECK (type IN ('cash', 'tournament', 'slots', 'sports'));

DO $replace_functions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.fn_is_video_library_asset_eligible(uuid)'::regprocedure)
    INTO v_definition;
  v_definition := replace(
    v_definition,
    'v.type IN (''cash'', ''tournament'', ''slots'')',
    'v.type IN (''cash'', ''tournament'', ''slots'', ''sports'')'
  );
  v_definition := replace(
    v_definition,
    'managed poker and slots library assets',
    'managed poker, slots, and sports library assets'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.fn_has_fresh_public_youtube_verification(text)'::regprocedure)
    INTO v_definition;
  v_definition := replace(
    v_definition,
    'verified_asset.type IN (''cash'', ''tournament'', ''slots'')',
    'verified_asset.type IN (''cash'', ''tournament'', ''slots'', ''sports'')'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.publish_video_library_reel(text, uuid, text)'::regprocedure)
    INTO v_definition;
  v_definition := replace(
    v_definition,
    'v_asset.type NOT IN (''cash'', ''tournament'', ''slots'')',
    'v_asset.type NOT IN (''cash'', ''tournament'', ''slots'', ''sports'')'
  );
  v_definition := replace(
    v_definition,
    'only cash, tournament, and slots videos may be published as library Reels',
    'only cash, tournament, slots, and sports videos may be published as library Reels'
  );
  v_definition := replace(
    v_definition,
    'CASE WHEN v_asset.type = ''slots'' THEN ''slots'' ELSE ''poker'' END',
    'CASE WHEN v_asset.type IN (''slots'', ''sports'') THEN v_asset.type ELSE ''poker'' END'
  );
  v_definition := replace(
    v_definition,
    'WHEN v_asset.type = ''slots'' THEN ARRAY[''slots'']::text[]',
    'WHEN v_asset.type IN (''slots'', ''sports'') THEN ARRAY[v_asset.type]::text[]'
  );
  v_definition := replace(
    v_definition,
    'fresh verified poker and slots library embeds',
    'fresh verified poker, slots, and sports library embeds'
  );
  EXECUTE v_definition;
END
$replace_functions$;

DO $postflight$
DECLARE
  v_constraint text;
  v_asset text;
  v_fresh text;
  v_publish text;
BEGIN
  SELECT pg_get_constraintdef(oid, true)
  INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.video_library_videos'::regclass
    AND conname = 'video_library_videos_type_check';
  SELECT pg_get_functiondef('public.fn_is_video_library_asset_eligible(uuid)'::regprocedure)
    INTO v_asset;
  SELECT pg_get_functiondef('public.fn_has_fresh_public_youtube_verification(text)'::regprocedure)
    INTO v_fresh;
  SELECT pg_get_functiondef('public.publish_video_library_reel(text, uuid, text)'::regprocedure)
    INTO v_publish;

  IF v_constraint NOT LIKE '%''sports''::text%'
     OR v_asset NOT LIKE '%v.type IN (''cash'', ''tournament'', ''slots'', ''sports'')%'
     OR v_fresh NOT LIKE '%verified_asset.type IN (''cash'', ''tournament'', ''slots'', ''sports'')%'
     OR v_publish NOT LIKE '%v_asset.type NOT IN (''cash'', ''tournament'', ''slots'', ''sports'')%'
     OR v_publish NOT LIKE '%v_asset.type IN (''slots'', ''sports'') THEN v_asset.type%'
     OR v_publish NOT LIKE '%ARRAY[v_asset.type]::text[]%'
  THEN
    RAISE EXCEPTION 'post-apply failed: sports library contract is incomplete';
  END IF;

  IF has_function_privilege('anon',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.publish_video_library_reel(text, uuid, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'post-apply failed: publisher grants changed';
  END IF;
END
$postflight$;

COMMIT;
