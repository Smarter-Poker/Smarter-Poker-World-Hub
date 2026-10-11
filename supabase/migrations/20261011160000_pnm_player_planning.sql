-- TIER: 3. AUTHOR: Codex PNM Phase 5. AFFECTS: private player plans and receipts.
-- WHY: Device-only trips and whole-document preference replacement cannot
-- provide account ownership, durable acknowledgments or concurrent patch safety.
-- HOW: Additive own-user tables, validated JWT-bound atomic RPCs and CAS.
-- IRREVERSIBLE: no; rollback disables new writes and preserves private data.
-- The maintained installer supplies the outer SQL+ledger transaction.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF to_regclass('public.pnm_player_plans') IS NOT NULL THEN
    RAISE EXCEPTION 'player planning already installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='profiles' AND column_name='poker_near_me_preferences' AND data_type='jsonb') THEN
    RAISE EXCEPTION 'PNM preference owner missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='profiles' AND column_name='updated_at' AND data_type='timestamp with time zone') THEN
    RAISE EXCEPTION 'Profile timestamp owner missing';
  END IF;
  IF md5(pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure))<>'ec87ba2762c979448bc99124d0824d86' THEN
    RAISE EXCEPTION 'Shared preference predecessor changed';
  END IF;
END $$;

CREATE TABLE public.pnm_player_plans (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('search','trip')),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  document jsonb NOT NULL CHECK(jsonb_typeof(document)='object' AND octet_length(document::text)<=16384),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX pnm_player_plans_account ON public.pnm_player_plans(user_id,kind,created_at DESC,id);
CREATE TABLE public.pnm_player_plan_operations (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK(octet_length(payload::text)<=20000),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.pnm_player_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnm_player_plan_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pnm_player_plans,public.pnm_player_plan_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.pnm_player_plans,public.pnm_player_plan_operations TO authenticated;
GRANT ALL ON public.pnm_player_plans,public.pnm_player_plan_operations TO service_role;
CREATE POLICY pnm_plans_own_read ON public.pnm_player_plans FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY pnm_planning_receipts_own_read ON public.pnm_player_plan_operations FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION public.pnm_validate_player_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,extensions AS $$
DECLARE v jsonb; k text; n numeric; d1 date; d2 date;
BEGIN
  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>16384
    OR p_document->'schemaVersion' IS DISTINCT FROM '1'::jsonb THEN
    RAISE EXCEPTION 'Invalid player document' USING ERRCODE='22023';
  END IF;
  IF p_kind='search' THEN
    IF p_document-ARRAY['schemaVersion','query','filters','location']<>'{}'::jsonb
      OR NOT p_document ?& ARRAY['query','filters','location']
      OR jsonb_typeof(p_document->'query') IS DISTINCT FROM 'string' OR length(p_document->>'query')>200 OR p_document->>'query' ~ '[[:cntrl:]]'
      OR jsonb_typeof(p_document->'filters') IS DISTINCT FROM 'object'
      OR (p_document->'filters')-ARRAY['state','game','stakes','date','type']<>'{}'::jsonb
      OR NOT (p_document->'filters' ?& ARRAY['state','game','stakes','date','type']) THEN
      RAISE EXCEPTION 'Invalid saved search' USING ERRCODE='22023';
    END IF;
    FOR k,v IN SELECT key,value FROM jsonb_each(p_document->'filters') LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>(CASE WHEN k='state' THEN 2 ELSE 40 END) OR v#>>'{}' ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION 'Invalid saved filter' USING ERRCODE='22023';
      END IF;
    END LOOP;
    IF p_document#>>'{filters,state}' !~ '^([A-Z]{2})?$' THEN RAISE EXCEPTION 'Invalid state' USING ERRCODE='22023'; END IF;
    IF p_document#>>'{filters,type}' NOT IN ('all','venues','live','tournaments','series','tours','home-games') THEN
      RAISE EXCEPTION 'Invalid saved search type' USING ERRCODE='22023';
    END IF;
    IF p_document->'location'<>'null'::jsonb THEN
      IF jsonb_typeof(p_document->'location') IS DISTINCT FROM 'object'
        OR (p_document->'location')-ARRAY['city','state']<>'{}'::jsonb
        OR NOT(p_document->'location' ?& ARRAY['city','state'])
        OR jsonb_typeof(p_document#>'{location,city}') IS DISTINCT FROM 'string'
        OR jsonb_typeof(p_document#>'{location,state}') IS DISTINCT FROM 'string'
        OR length(p_document#>>'{location,city}')>100 OR length(p_document#>>'{location,state}')>2
        OR p_document#>>'{location,city}' ~ '[[:cntrl:]]' OR p_document#>>'{location,state}' !~ '^([A-Z]{2})?$' THEN
        RAISE EXCEPTION 'Invalid coarse search location' USING ERRCODE='22023';
      END IF;
    END IF;
  ELSIF p_kind='trip' THEN
    IF p_document-ARRAY['schemaVersion','origin','destination','waypoints','corridorMi','dateRange','venueIds','seriesIds']<>'{}'::jsonb
      OR NOT p_document ?& ARRAY['origin','destination','waypoints','corridorMi','dateRange']
      OR jsonb_typeof(p_document->'origin') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_document->'destination') IS DISTINCT FROM 'string'
      OR length(btrim(p_document->>'origin')) NOT BETWEEN 1 AND 160
      OR length(btrim(p_document->>'destination')) NOT BETWEEN 1 AND 160
      OR length(p_document->>'origin')>160 OR length(p_document->>'destination')>160
      OR p_document->>'origin' ~ '[[:cntrl:]]' OR p_document->>'destination' ~ '[[:cntrl:]]'
      OR jsonb_typeof(p_document->'waypoints') IS DISTINCT FROM 'array'
      OR p_document->'corridorMi' NOT IN ('25'::jsonb,'50'::jsonb,'100'::jsonb)
      OR jsonb_typeof(p_document->'dateRange') IS DISTINCT FROM 'object'
      OR (p_document->'dateRange')-ARRAY['start','end']<>'{}'::jsonb
      OR NOT(p_document->'dateRange' ?& ARRAY['start','end']) THEN
      RAISE EXCEPTION 'Invalid trip' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_document->'waypoints')>8 THEN RAISE EXCEPTION 'Too many waypoints' USING ERRCODE='22023'; END IF;
    FOR v IN SELECT value FROM jsonb_array_elements(p_document->'waypoints') LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(btrim(v#>>'{}')) NOT BETWEEN 1 AND 160 OR length(v#>>'{}')>160 OR v#>>'{}' ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION 'Invalid waypoint' USING ERRCODE='22023';
      END IF;
    END LOOP;
    FOR k,v IN SELECT key,value FROM jsonb_each(p_document->'dateRange') LOOP
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='22023'; END IF;
      IF v#>>'{}'<>'' THEN
        IF v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='22023'; END IF;
        BEGIN n:=extract(year FROM (v#>>'{}')::date); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid date' USING ERRCODE='22023'; END;
      END IF;
    END LOOP;
    IF (p_document#>>'{dateRange,start}'='')<>(p_document#>>'{dateRange,end}'='') THEN RAISE EXCEPTION 'Incomplete dates' USING ERRCODE='22023'; END IF;
    IF p_document#>>'{dateRange,start}'<>'' THEN
      d1:=(p_document#>>'{dateRange,start}')::date;d2:=(p_document#>>'{dateRange,end}')::date;
      IF d1>d2 THEN RAISE EXCEPTION 'Reversed dates' USING ERRCODE='22023'; END IF;
    END IF;
    FOREACH k IN ARRAY ARRAY['venueIds','seriesIds'] LOOP
    IF p_document ? k THEN
      IF jsonb_typeof(p_document->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid public references' USING ERRCODE='22023'; END IF;
      IF jsonb_array_length(p_document->k)>50 THEN RAISE EXCEPTION 'Too many public references' USING ERRCODE='22023'; END IF;
      FOR v IN SELECT value FROM jsonb_array_elements(p_document->k) LOOP
        IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid venue reference' USING ERRCODE='22023'; END IF;
        n:=(v#>>'{}')::numeric;
        IF n<1 OR n>9007199254740991 OR trunc(n)<>n THEN RAISE EXCEPTION 'Invalid venue reference' USING ERRCODE='22023'; END IF;
      END LOOP;
    END IF;
    END LOOP;
  ELSE RAISE EXCEPTION 'Invalid plan kind' USING ERRCODE='22023'; END IF;
END $$;

CREATE FUNCTION public.pnm_player_plan_operation(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  RETURN(SELECT result FROM public.pnm_player_plan_operations WHERE user_id=auth.uid() AND request_id=p_request_id);
END $$;

CREATE FUNCTION public.pnm_mutate_player_plan(p_request_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor uuid:=auth.uid(); ident uuid; existing public.pnm_player_plans%ROWTYPE; receipt public.pnm_player_plan_operations%ROWTYPE; result jsonb; action text; v_kind text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>20000
    OR p_payload-ARRAY['id','action','kind','name','document','expected_revision']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid plan request' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pnm-planning:'||actor::text,0));
  SELECT * INTO receipt FROM public.pnm_player_plan_operations WHERE user_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.payload<>jsonb_build_object('kind','plan','request',p_payload) THEN RAISE EXCEPTION 'Operation payload changed' USING ERRCODE='PT409'; END IF;
    RETURN receipt.result;
  END IF;
  BEGIN ident:=(p_payload->>'id')::uuid; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid plan identity' USING ERRCODE='22023'; END;
  IF ident IS NULL THEN RAISE EXCEPTION 'Plan identity required' USING ERRCODE='22023'; END IF;
  action:=p_payload->>'action';v_kind:=p_payload->>'kind';
  IF action NOT IN ('create','update','delete') OR action IS NULL THEN RAISE EXCEPTION 'Invalid plan action' USING ERRCODE='22023'; END IF;
  SELECT * INTO existing FROM public.pnm_player_plans WHERE id=ident AND user_id=actor FOR UPDATE;
  IF action='create' THEN
    IF FOUND OR EXISTS(SELECT 1 FROM public.pnm_player_plans WHERE id=ident) THEN RAISE EXCEPTION 'Plan identity unavailable' USING ERRCODE='PT409'; END IF;
    IF v_kind NOT IN ('search','trip') OR v_kind IS NULL THEN RAISE EXCEPTION 'Invalid kind' USING ERRCODE='22023'; END IF;
    IF (SELECT count(*) FROM public.pnm_player_plans WHERE user_id=actor AND kind=v_kind)>=(CASE v_kind WHEN 'search' THEN 50 ELSE 20 END) THEN
      RAISE EXCEPTION 'Saved plan limit reached' USING ERRCODE='22023'; END IF;
  ELSE
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE='P0002'; END IF;
    IF jsonb_typeof(p_payload->'expected_revision') IS DISTINCT FROM 'number' OR p_payload->>'expected_revision' !~ '^[1-9][0-9]{0,15}$' THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023'; END IF;
    IF existing.revision<>(p_payload->>'expected_revision')::bigint THEN RAISE EXCEPTION 'Plan changed' USING ERRCODE='PT409'; END IF;
    IF action='update' AND v_kind IS DISTINCT FROM existing.kind THEN RAISE EXCEPTION 'Plan kind cannot change' USING ERRCODE='22023'; END IF;
  END IF;
  IF action<>'delete' THEN
    IF jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string' OR length(btrim(p_payload->>'name')) NOT BETWEEN 1 AND 80 OR length(p_payload->>'name')>80 OR p_payload->>'name' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid plan name' USING ERRCODE='22023'; END IF;
    PERFORM public.pnm_validate_player_document(v_kind,p_payload->'document');
    IF action='create' THEN INSERT INTO public.pnm_player_plans(id,user_id,kind,name,document) VALUES(ident,actor,v_kind,btrim(p_payload->>'name'),p_payload->'document') RETURNING * INTO existing;
    ELSE UPDATE public.pnm_player_plans SET name=btrim(p_payload->>'name'),document=p_payload->'document',revision=revision+1,updated_at=clock_timestamp() WHERE id=ident AND user_id=actor RETURNING * INTO existing; END IF;
    result:=jsonb_build_object('operation_id',p_request_id,'action',action,'plan',to_jsonb(existing)-'user_id');
  ELSE
    DELETE FROM public.pnm_player_plans WHERE id=ident AND user_id=actor;
    result:=jsonb_build_object('operation_id',p_request_id,'action','delete','id',ident);
  END IF;
  INSERT INTO public.pnm_player_plan_operations(user_id,request_id,payload,result) VALUES(actor,p_request_id,jsonb_build_object('kind','plan','request',p_payload),result);
  RETURN result;
END $$;

CREATE FUNCTION public.pnm_patch_preferences(p_request_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE actor uuid:=auth.uid(); receipt public.pnm_player_plan_operations%ROWTYPE; preferences jsonb; result jsonb; k text; v jsonb; n numeric;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR octet_length(p_patch::text)>2048 OR p_patch='{}'::jsonb
    OR p_patch-ARRAY['geofenceAlerts','locationEnabled','showNewcomerFriendly','locationPromptDismissed','manualLocation','lastLocation','lastLocationCity','lastLocationState','locationEnabledAt']<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid preferences patch' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('pnm-planning:'||actor::text,0));
  SELECT * INTO receipt FROM public.pnm_player_plan_operations WHERE user_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF receipt.payload<>jsonb_build_object('kind','preferences','request',p_patch) THEN RAISE EXCEPTION 'Operation payload changed' USING ERRCODE='PT409'; END IF;
    RETURN receipt.result;
  END IF;
  FOR k,v IN SELECT key,value FROM jsonb_each(p_patch) LOOP
    IF k IN ('geofenceAlerts','locationEnabled','showNewcomerFriendly','locationPromptDismissed','manualLocation') THEN
      IF jsonb_typeof(v) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid preference toggle' USING ERRCODE='22023'; END IF;
    ELSIF k='lastLocation' THEN
      IF v<>'null'::jsonb THEN
        IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v-ARRAY['lat','lng']<>'{}'::jsonb OR NOT v ?& ARRAY['lat','lng'] OR jsonb_typeof(v->'lat') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'lng') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid location' USING ERRCODE='22023'; END IF;
        IF (v->>'lat')::numeric NOT BETWEEN -90 AND 90 OR (v->>'lng')::numeric NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE='22023'; END IF;
      END IF;
    ELSE
      IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>(CASE k WHEN 'lastLocationCity' THEN 100 WHEN 'lastLocationState' THEN 100 ELSE 40 END) OR v#>>'{}' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid preference value' USING ERRCODE='22023'; END IF;
      IF k='locationEnabledAt' THEN
        IF v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN RAISE EXCEPTION 'Invalid location time' USING ERRCODE='22023'; END IF;
        BEGIN PERFORM(v#>>'{}')::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid location time' USING ERRCODE='22023'; END;
      END IF;
    END IF;
  END LOOP;
  SELECT poker_near_me_preferences INTO preferences FROM public.profiles WHERE id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found' USING ERRCODE='P0002'; END IF;
  IF jsonb_typeof(preferences) IS DISTINCT FROM 'object' THEN preferences:='{}'::jsonb; END IF;
  preferences:=preferences||p_patch;
  UPDATE public.profiles SET poker_near_me_preferences=preferences,updated_at=clock_timestamp() WHERE id=actor;
  result:=jsonb_build_object('operation_id',p_request_id,'action','preferences','preferences',preferences);
  INSERT INTO public.pnm_player_plan_operations(user_id,request_id,payload,result) VALUES(actor,p_request_id,jsonb_build_object('kind','preferences','request',p_patch),result);
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.pnm_validate_player_document(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.pnm_mutate_player_plan(uuid,jsonb),public.pnm_player_plan_operation(uuid),public.pnm_patch_preferences(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pnm_mutate_player_plan(uuid,jsonb),public.pnm_player_plan_operation(uuid),public.pnm_patch_preferences(uuid,jsonb) TO authenticated;
DO $$ BEGIN
  IF md5(pg_get_functiondef('public.update_page_preferences(uuid,text,jsonb)'::regprocedure))<>'ec87ba2762c979448bc99124d0824d86' THEN RAISE EXCEPTION 'Shared preference owner changed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('pnm_mutate_player_plan','pnm_player_plan_operation','pnm_patch_preferences') AND (NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=public, extensions'])) THEN RAISE EXCEPTION 'Player planning security invariant failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.pnm_player_plans'::regclass,'public.pnm_player_plan_operations'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'Player planning RLS missing'; END IF;
END $$;
-- ROLLBACK: submit as a NEW qualified migration; retain private user data.
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.pnm_mutate_player_plan(uuid,jsonb),public.pnm_patch_preferences(uuid,jsonb) FROM authenticated;
-- COMMIT;
