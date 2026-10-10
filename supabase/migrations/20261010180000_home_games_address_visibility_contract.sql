-- TIER: 2. AUTHOR: Codex. AFFECTS: three Home Games RPC bodies only.
-- WHY: persisted qualification 38073161185 reproduced SQLSTATE 23514:
-- the creation API accepts public/members but the installed CHECK accepts
-- all/approved/rsvp. Installed calendar and public tournament readers also
-- use obsolete values; the latter lacks a private-parent authorization guard.
-- No data rewrite, CHECK widening, new overload, or additional role grant.
-- IRREVERSIBLE: no. No DROP/type/FK/signature or overload changes.
-- The maintained SQL runner wraps this entire file AND its migration ledger
-- entry in one transaction. Do not apply individual statements separately.
-- Recovery: retain the safe current functions while investigating; restoring
-- the obsolete readers reintroduces private schedule leakage and is unsafe.

DO $migration$
DECLARE
  v_name text;
  v_expected text;
  v_oid oid;
  v_definition text;
  v_original text;
  v_owner oid;
  v_acl aclitem[];
  v_args text;
  v_result text;
  v_constraint text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_constraint FROM pg_constraint
   WHERE conrelid='public.commander_home_games'::regclass
     AND conname='commander_home_games_address_visible_to_check';
  IF v_constraint IS DISTINCT FROM 'CHECK (((address_visible_to IS NULL) OR (address_visible_to = ANY (ARRAY[''all''::text, ''rsvp''::text, ''approved''::text]))))' THEN
    RAISE EXCEPTION 'Home Games persisted visibility CHECK drifted';
  END IF;
  FOR v_name, v_expected IN SELECT * FROM (VALUES
    ('rpc_hg_create_tournament', 'e9b26b2986be88c31be42f0a82c957cc'),
    ('get_user_home_games_calendar', 'b428147c3e109687b4885231aaf0d0c0'),
    ('rpc_hg_list_public_tournaments', 'c53246d40c2f7ea370b9963423adc108')
  ) AS expected(name, hash)
  LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=v_name) <> 1 THEN
      RAISE EXCEPTION 'Home Games RPC overload drift: %', v_name;
    END IF;
    SELECT p.oid, pg_get_functiondef(p.oid), p.proowner, p.proacl,
           pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
      INTO v_oid, v_definition, v_owner, v_acl, v_args, v_result
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=v_name;
    IF md5(v_definition) <> v_expected OR v_owner <> 'postgres'::regrole
       OR (SELECT array_agg(r.rolname || ':' || a.privilege_type || ':' || a.is_grantable::text ORDER BY r.rolname)
             FROM aclexplode(v_acl) a LEFT JOIN pg_roles r ON r.oid=a.grantee)
             IS DISTINCT FROM ARRAY['authenticated:EXECUTE:false','postgres:EXECUTE:false','service_role:EXECUTE:false']
       OR NOT (SELECT prosecdef AND proconfig=ARRAY['search_path=public']
                 FROM pg_proc WHERE oid=v_oid) THEN
      RAISE EXCEPTION 'Home Games RPC catalog contract drifted: %', v_name;
    END IF;
    v_original := v_definition;
    v_definition := replace(v_definition, 'SET search_path TO ''public''',
                           'SET search_path TO ''public'', ''extensions''');

    IF v_name='rpc_hg_create_tournament' THEN
      v_definition := replace(v_definition,
        'NULLIF(trim(p_address), ''''), p_address_visible_to',
        'NULLIF(trim(p_address), ''''), CASE p_address_visible_to WHEN ''public'' THEN ''all'' WHEN ''members'' THEN ''approved'' ELSE p_address_visible_to END');
    ELSIF v_name='get_user_home_games_calendar' THEN
      v_definition := replace(replace(replace(v_definition,
        'g.address_visible_to = ''public''', 'g.address_visible_to = ''all'''),
        'g.address_visible_to = ''members''', 'g.address_visible_to = ''approved'''),
        'g.address_visible_to = ''rsvpd''', 'g.address_visible_to = ''rsvp''');
      -- A yes RSVP survives member removal; it must not authorize an address.
      v_definition := replace(v_definition,
        'AND COALESCE(r.response, '''') = ''yes'' THEN g.address',
        'AND COALESCE(r.response, '''') = ''yes'' AND EXISTS (SELECT 1 FROM commander_home_members am WHERE am.group_id=g.group_id AND am.user_id=p_caller_user_id AND am.status=''approved'') THEN g.address');
      v_definition := replace(v_definition,
        'AND COALESCE(r.response,'''') = ''yes'') THEN true',
        'AND COALESCE(r.response,'''') = ''yes'' AND EXISTS (SELECT 1 FROM commander_home_members am WHERE am.group_id=g.group_id AND am.user_id=p_caller_user_id AND am.status=''approved'')) THEN true');
      v_definition := replace(v_definition, 'CASE ' || chr(10) || '          WHEN',
        'CASE ' || chr(10) || '          WHEN grp.owner_id=p_caller_user_id OR g.host_id=p_caller_user_id THEN g.address' || chr(10) || '          WHEN');
      v_definition := replace(v_definition, '(CASE WHEN g.address_visible_to',
        '(CASE WHEN grp.owner_id=p_caller_user_id OR g.host_id=p_caller_user_id OR g.address_visible_to');
      v_definition := replace(v_definition,
        'CASE WHEN COALESCE(r.response, '''') = ''yes'' THEN g.notes_for_attendees',
        'CASE WHEN COALESCE(r.response, '''') = ''yes'' AND (grp.owner_id=p_caller_user_id OR g.host_id=p_caller_user_id OR EXISTS (SELECT 1 FROM commander_home_members am WHERE am.group_id=g.group_id AND am.user_id=p_caller_user_id AND am.status=''approved'')) THEN g.notes_for_attendees');
      v_definition := replace(v_definition, 'WHERE g.scheduled_date BETWEEN',
        'WHERE grp.is_active IS TRUE' || chr(10) ||
        '       AND (grp.owner_id=p_caller_user_id OR NOT EXISTS (SELECT 1 FROM commander_home_members denied WHERE denied.group_id=g.group_id AND denied.user_id=p_caller_user_id AND denied.status IN (''banned'',''removed'')))' || chr(10) ||
        '       AND g.scheduled_date BETWEEN');
    ELSE
      v_definition := replace(v_definition,
        'WHERE id = p_group_id AND is_active = true',
        'WHERE id = p_group_id AND is_active = true' || chr(10) ||
        '      AND (owner_id=auth.uid() OR NOT EXISTS (SELECT 1 FROM commander_home_members denied WHERE denied.group_id=p_group_id AND denied.user_id=auth.uid() AND denied.status IN (''banned'',''removed'')))' || chr(10) ||
        '      AND (is_private IS FALSE OR owner_id=auth.uid() OR EXISTS (SELECT 1 FROM commander_home_members allowed WHERE allowed.group_id=p_group_id AND allowed.user_id=auth.uid() AND allowed.status=''approved''))');
      v_definition := replace(v_definition, 'g.address_visible_to = ''public''',
                                              'g.address_visible_to = ''all''');
    END IF;
    IF v_definition=v_original THEN RAISE EXCEPTION 'Home Games replacement missing: %', v_name; END IF;
    EXECUTE v_definition;
    IF NOT (SELECT proowner=v_owner AND proacl IS NOT DISTINCT FROM v_acl
        AND pg_get_functiondef(oid)=v_definition
        AND pg_get_function_arguments(oid)=v_args AND pg_get_function_result(oid)=v_result
        AND prosecdef AND proconfig=ARRAY['search_path=public, extensions']
        FROM pg_proc WHERE oid=v_oid) THEN
      RAISE EXCEPTION 'Home Games post-image authorization/signature mismatch: %', v_name;
    END IF;
  END LOOP;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conrelid='public.commander_home_games'::regclass
         AND conname='commander_home_games_address_visible_to_check') IS DISTINCT FROM v_constraint THEN
    RAISE EXCEPTION 'Home Games persisted visibility CHECK changed';
  END IF;
END;
$migration$;

-- SAFE RECOVERY: qualify a new forward body repair against installed definition
-- hashes and unchanged signatures/ACL/CHECK. Retain all three API visibility
-- labels and current-parent/member/address guards. Never restore the unsafe
-- snapshot readers, replay this migration, or rewrite previously persisted rows.
