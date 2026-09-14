CREATE OR REPLACE FUNCTION public.fn_ca_fleet_set_policy(p_scope text, p_scope_id uuid, p_patch jsonb, p_updated_by uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_fields constant text[] := array[
    'enabled','pause_new_seatings','max_horses','max_per_table','occupancy_bias',
    'min_humans_to_seat','stake_bands','variants','schedule','notes'
  ];
  v_key      text;
  v_type     text;
  v_num      numeric;
  v_elem     jsonb;
  v_before   public.ca_horse_fleet_policy%rowtype;
  v_after    public.ca_horse_fleet_policy%rowtype;
  v_created  boolean := false;
  v_material boolean := false;
  v_reasons  jsonb := '[]'::jsonb;
  v_old_cap  numeric;
  v_new_cap  numeric;
  v_old_bias numeric;
  v_new_bias numeric;
  v_had_list boolean;
  v_old_len  int;
  v_new_len  int;
begin
  -- Scope, first, because everything else depends on which row this is.
  if p_scope is null or p_scope not in ('global','club','union') then
    return jsonb_build_object('ok', false, 'error', 'unknown_scope',
      'message', 'scope must be one of global, club, union',
      'scope', p_scope);
  end if;
  if p_scope = 'global' and p_scope_id is not null then
    return jsonb_build_object('ok', false, 'error', 'scope_id_not_allowed',
      'message', 'the global row has no scope_id');
  end if;
  if p_scope <> 'global' and p_scope_id is null then
    return jsonb_build_object('ok', false, 'error', 'scope_id_required',
      'message', 'a club or union row needs a scope_id');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_patch',
      'message', 'p_patch must be a json object');
  end if;
  -- An unattributable policy change is not written down as somebody
  -- else's, and fn_log_admin_action refuses a null actor anyway.
  if p_updated_by is null then
    return jsonb_build_object('ok', false, 'error', 'actor_required',
      'message', 'p_updated_by is required so the change can be audited');
  end if;

  -- Every key must be one this table carries. A typo that silently did
  -- nothing would read on the Policy tab as a change that was applied.
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (c_fields)) then
      return jsonb_build_object('ok', false, 'error', 'unknown_field',
        'message', 'not a policy field', 'field', v_key,
        'known', to_jsonb(c_fields));
    end if;
  end loop;

  -- Type and range, field by field. A json null CLEARS an override and
  -- hands the field back to the wider scope, so null is legal everywhere.
  foreach v_key in array array['enabled','pause_new_seatings'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('boolean','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'boolean', 'got', v_type);
      end if;
    end if;
  end loop;

  foreach v_key in array array['max_horses','max_per_table','min_humans_to_seat'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('number','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'integer', 'got', v_type);
      end if;
      if v_type = 'number' then
        v_num := (p_patch ->> v_key)::numeric;
        if v_num <> trunc(v_num) then
          return jsonb_build_object('ok', false, 'error', 'not_an_integer',
            'field', v_key, 'value', v_num);
        end if;
        if v_num < 0 then
          return jsonb_build_object('ok', false, 'error', 'negative_cap',
            'message', 'a cap is a count of seats and cannot be negative',
            'field', v_key, 'value', v_num);
        end if;
        if v_key = 'min_humans_to_seat' and v_num > 10 then
          return jsonb_build_object('ok', false, 'error', 'min_humans_out_of_range',
            'message', 'no table seats more than ten players, so this rule could never be met',
            'field', v_key, 'value', v_num);
        end if;
      end if;
    end if;
  end loop;

  if p_patch ? 'occupancy_bias' then
    v_type := jsonb_typeof(p_patch -> 'occupancy_bias');
    if v_type not in ('number','null') then
      return jsonb_build_object('ok', false, 'error', 'invalid_type',
        'field', 'occupancy_bias', 'expected', 'number', 'got', v_type);
    end if;
    if v_type = 'number' then
      v_num := (p_patch ->> 'occupancy_bias')::numeric;
      -- Zero or negative is an eviction dressed as arithmetic: it would
      -- take every table target to zero. Above ten is a fat finger.
      if v_num <= 0 or v_num > 10 then
        return jsonb_build_object('ok', false, 'error', 'bias_out_of_range',
          'message', 'occupancy_bias must be greater than 0 and at most 10',
          'field', 'occupancy_bias', 'value', v_num);
      end if;
    end if;
  end if;

  foreach v_key in array array['stake_bands','variants'] loop
    if p_patch ? v_key then
      v_type := jsonb_typeof(p_patch -> v_key);
      if v_type not in ('array','null') then
        return jsonb_build_object('ok', false, 'error', 'invalid_type',
          'field', v_key, 'expected', 'array of strings', 'got', v_type);
      end if;
      if v_type = 'array' then
        for v_elem in select value from jsonb_array_elements(p_patch -> v_key) loop
          if jsonb_typeof(v_elem) <> 'string' then
            return jsonb_build_object('ok', false, 'error', 'invalid_array',
              'field', v_key, 'message', 'every element must be a string',
              'element', v_elem);
          end if;
        end loop;
      end if;
    end if;
  end loop;

  if p_patch ? 'schedule' then
    v_type := jsonb_typeof(p_patch -> 'schedule');
    if v_type not in ('array','null') then
      return jsonb_build_object('ok', false, 'error', 'invalid_type',
        'field', 'schedule', 'expected', 'array of hour ranges', 'got', v_type);
    end if;
    if v_type = 'array' then
      for v_elem in select value from jsonb_array_elements(p_patch -> 'schedule') loop
        if jsonb_typeof(v_elem) <> 'object'
           or not (v_elem ? 'start_hour') or not (v_elem ? 'end_hour')
           or jsonb_typeof(v_elem -> 'start_hour') <> 'number'
           or jsonb_typeof(v_elem -> 'end_hour') <> 'number' then
          return jsonb_build_object('ok', false, 'error', 'invalid_schedule',
            'message', 'each entry needs numeric start_hour and end_hour',
            'entry', v_elem);
        end if;
        if (v_elem ->> 'start_hour')::numeric < 0 or (v_elem ->> 'start_hour')::numeric > 23
           or (v_elem ->> 'end_hour')::numeric < 0 or (v_elem ->> 'end_hour')::numeric > 23 then
          return jsonb_build_object('ok', false, 'error', 'invalid_schedule',
            'message', 'hours are UTC and run 0 to 23. start greater than end wraps midnight',
            'entry', v_elem);
        end if;
      end loop;
    end if;
  end if;

  if p_patch ? 'notes' and jsonb_typeof(p_patch -> 'notes') not in ('string','null') then
    return jsonb_build_object('ok', false, 'error', 'invalid_type',
      'field', 'notes', 'expected', 'string', 'got', jsonb_typeof(p_patch -> 'notes'));
  end if;

  -- The row as it stands, for the audit and for the materiality test.
  select * into v_before
  from public.ca_horse_fleet_policy
  where scope = p_scope
    and scope_key = coalesce(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_created := v_before.scope is null;

  -- MATERIALITY, exactly as contract section 0 words it.
  if p_patch ? 'enabled'
     and coalesce((p_patch ->> 'enabled')::boolean, true) is distinct from coalesce(v_before.enabled, true) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('enabled_changed'::text);
  end if;
  -- Pausing new seatings is disabling the fleet for that scope by
  -- another name, so it is held to the same standard.
  if p_patch ? 'pause_new_seatings'
     and coalesce((p_patch ->> 'pause_new_seatings')::boolean, false) is distinct from coalesce(v_before.pause_new_seatings, false) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('pause_changed'::text);
  end if;
  foreach v_key in array array['max_horses','max_per_table'] loop
    if p_patch ? v_key then
      v_old_cap := case v_key when 'max_horses' then v_before.max_horses else v_before.max_per_table end;
      v_new_cap := case when jsonb_typeof(p_patch -> v_key) = 'null' then null
                        else (p_patch ->> v_key)::numeric end;
      -- Setting or clearing a cap that did not exist is a change from
      -- unlimited, which has no percentage. It is material.
      if (v_old_cap is null) <> (v_new_cap is null) then
        v_material := true;
        v_reasons := v_reasons || to_jsonb((v_key || '_set_or_cleared')::text);
      elsif v_old_cap is not null and v_new_cap is not null then
        if v_old_cap = 0 then
          if v_new_cap <> 0 then
            v_material := true;
            v_reasons := v_reasons || to_jsonb((v_key || '_changed_from_zero')::text);
          end if;
        -- AN ABSOLUTE FLOOR UNDER THE PERCENTAGE (review M-7). Each patch is
        -- compared against the row as it stands, so a run of sub-25-percent
        -- cuts is a run of non-material changes and takes a club from 100
        -- horses to 3 with no approval. A cap this low is a stand-down
        -- whatever the step size that reached it. The complete fix also
        -- measures the WALK - the greatest cap this scope carried inside the
        -- approval TTL, from admin_audit_log's before_state - and that half is
        -- deliberately not in this phase; the floor closes the proved case.
        elsif v_new_cap <= 5 and v_new_cap < v_old_cap then
          v_material := true;
          v_reasons := v_reasons || to_jsonb((v_key || '_cut_to_a_floor')::text);
        elsif abs(v_new_cap - v_old_cap) / v_old_cap > 0.25 then
          v_material := true;
          v_reasons := v_reasons || to_jsonb((v_key || '_moved_more_than_25_percent')::text);
        end if;
      end if;
    end if;
  end loop;

  -- FIVE MORE FIELDS THAT CAN STOP THE FLEET SEATING (review H-1), in the
  -- same order and under the same reason strings as fleetPolicyMateriality in
  -- src/lib/horses/fleetPolicy.js. Each of these was below the line while
  -- being able to stop every table on the platform taking a horse: a global
  -- bias of 0.1 scales every seat target to a tenth, a min_humans_to_seat of
  -- 10 can never be met because ten seats is the widest table, and a band,
  -- variant or schedule restriction narrows eligibility to nothing. That is
  -- disabling the fleet for that scope by another name, so it is held to the
  -- same standard.
  if p_patch ? 'occupancy_bias' then
    v_old_bias := coalesce(v_before.occupancy_bias, 1.0);
    v_new_bias := coalesce(case when jsonb_typeof(p_patch -> 'occupancy_bias') = 'null' then null
                                else (p_patch ->> 'occupancy_bias')::numeric end, 1.0);
    if v_new_bias <= 0.5 and v_new_bias < v_old_bias then
      v_material := true;
      v_reasons := v_reasons || to_jsonb('occupancy_bias_cut_below_half'::text);
    elsif v_old_bias > 0 and abs(v_new_bias - v_old_bias) / v_old_bias > 0.25 then
      v_material := true;
      v_reasons := v_reasons || to_jsonb('occupancy_bias_moved_more_than_25_percent'::text);
    end if;
  end if;

  -- Raising the human minimum withholds seating from tables that qualified a
  -- moment ago. Lowering it gives seats back, which needs no second operator.
  if p_patch ? 'min_humans_to_seat'
     and coalesce(case when jsonb_typeof(p_patch -> 'min_humans_to_seat') = 'null' then null
                       else (p_patch ->> 'min_humans_to_seat')::numeric end, 0)
         > coalesce(v_before.min_humans_to_seat, 0) then
    v_material := true;
    v_reasons := v_reasons || to_jsonb('min_humans_to_seat_raised'::text);
  end if;

  -- A restriction is measured against NO restriction: null is "this scope
  -- withholds nothing", so adding a list where there was none is a narrowing
  -- however long the list is, and a shorter list is a narrowing too. Widening
  -- or clearing gives the fleet back seats it could not take.
  foreach v_key in array array['stake_bands','variants','schedule'] loop
    if p_patch ? v_key then
      v_had_list := case v_key
                      when 'stake_bands' then v_before.stake_bands is not null
                      when 'variants'    then v_before.variants is not null
                      else v_before.schedule is not null
                           and jsonb_typeof(v_before.schedule) = 'array'
                    end;
      v_old_len := case when not v_had_list then null
                        when v_key = 'stake_bands' then coalesce(array_length(v_before.stake_bands, 1), 0)
                        when v_key = 'variants'    then coalesce(array_length(v_before.variants, 1), 0)
                        else jsonb_array_length(v_before.schedule) end;
      v_new_len := case when jsonb_typeof(p_patch -> v_key) <> 'array' then null
                        else jsonb_array_length(p_patch -> v_key) end;
      if v_new_len is not null and (v_old_len is null or v_new_len < v_old_len) then
        v_material := true;
        v_reasons := v_reasons || to_jsonb((v_key || '_narrowed')::text);
      end if;
    end if;
  end loop;

  -- The upsert. Every column is named, so a NEW club row leaves the
  -- fields the patch did not mention as NULL and inherits them from the
  -- wider scope. On an existing row only the named keys move.
  insert into public.ca_horse_fleet_policy as t (
    scope, scope_id, enabled, pause_new_seatings, max_horses, max_per_table,
    occupancy_bias, min_humans_to_seat, stake_bands, variants, schedule,
    notes, updated_by, updated_at
  ) values (
    p_scope,
    p_scope_id,
    case when p_patch ? 'enabled' then (p_patch ->> 'enabled')::boolean else null end,
    case when p_patch ? 'pause_new_seatings' then (p_patch ->> 'pause_new_seatings')::boolean else null end,
    case when p_patch ? 'max_horses' then (p_patch ->> 'max_horses')::int else null end,
    case when p_patch ? 'max_per_table' then (p_patch ->> 'max_per_table')::int else null end,
    case when p_patch ? 'occupancy_bias' then (p_patch ->> 'occupancy_bias')::numeric else null end,
    case when p_patch ? 'min_humans_to_seat' then (p_patch ->> 'min_humans_to_seat')::int else null end,
    case when p_patch ? 'stake_bands' and jsonb_typeof(p_patch -> 'stake_bands') = 'array'
         then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'stake_bands'))
         else null end,
    case when p_patch ? 'variants' and jsonb_typeof(p_patch -> 'variants') = 'array'
         then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'variants'))
         else null end,
    case when p_patch ? 'schedule' and jsonb_typeof(p_patch -> 'schedule') = 'array'
         then p_patch -> 'schedule' else null end,
    case when p_patch ? 'notes' then p_patch ->> 'notes' else null end,
    p_updated_by,
    now()
  )
  on conflict (scope, scope_key) do update set
    enabled            = case when p_patch ? 'enabled' then (p_patch ->> 'enabled')::boolean else t.enabled end,
    pause_new_seatings = case when p_patch ? 'pause_new_seatings' then (p_patch ->> 'pause_new_seatings')::boolean else t.pause_new_seatings end,
    max_horses         = case when p_patch ? 'max_horses' then (p_patch ->> 'max_horses')::int else t.max_horses end,
    max_per_table      = case when p_patch ? 'max_per_table' then (p_patch ->> 'max_per_table')::int else t.max_per_table end,
    occupancy_bias     = case when p_patch ? 'occupancy_bias' then (p_patch ->> 'occupancy_bias')::numeric else t.occupancy_bias end,
    min_humans_to_seat = case when p_patch ? 'min_humans_to_seat' then (p_patch ->> 'min_humans_to_seat')::int else t.min_humans_to_seat end,
    stake_bands        = case when p_patch ? 'stake_bands'
                              then case when jsonb_typeof(p_patch -> 'stake_bands') = 'array'
                                        then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'stake_bands'))
                                        else null end
                              else t.stake_bands end,
    variants           = case when p_patch ? 'variants'
                              then case when jsonb_typeof(p_patch -> 'variants') = 'array'
                                        then (select array_agg(value #>> '{}') from jsonb_array_elements(p_patch -> 'variants'))
                                        else null end
                              else t.variants end,
    schedule           = case when p_patch ? 'schedule'
                              then case when jsonb_typeof(p_patch -> 'schedule') = 'array'
                                        then p_patch -> 'schedule' else null end
                              else t.schedule end,
    notes              = case when p_patch ? 'notes' then p_patch ->> 'notes' else t.notes end,
    updated_by         = p_updated_by,
    updated_at         = now()
  returning * into v_after;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_updated_by,
      p_action        := 'fleet.set_policy',
      p_target_type   := 'fleet_policy',
      -- THE SAME TARGET ID THE ROUTE USES (review M-2). fleet-admin.js files
      -- its own fleet.set_policy row under policyTargetId(), which is 'global'
      -- for the global row and '<scope>:<uuid>' otherwise. This function used
      -- to write 'global:global' for the global row, so a trail lookup on
      -- fn_ca_operator_audit_trail - which filters on an exact target_id -
      -- found one of the two rows and silently omitted the other, and the one
      -- it omitted carried the before and after snapshots.
      p_target_id     := case when p_scope = 'global' then 'global'
                              else p_scope || ':' || p_scope_id::text end,
      p_details       := jsonb_build_object(
                           'patch', p_patch,
                           'reason', p_reason,
                           'created', v_created,
                           'material', v_material,
                           'material_reasons', v_reasons
                         ),
      p_before_state  := case when v_created then null else to_jsonb(v_before) end,
      p_after_state   := to_jsonb(v_after),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := null
    );
  exception when others then
    raise notice 'fn_ca_fleet_set_policy audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'scope', p_scope,
    'scope_id', p_scope_id,
    'created', v_created,
    'material', v_material,
    'material_reasons', v_reasons,
    'before', case when v_created then null else to_jsonb(v_before) end,
    'after', to_jsonb(v_after),
    -- What the ENGINE will now read. fn_ca_fleet_policy_effective is
    -- keyed by club, so a club write echoes that club's merged policy
    -- and a global or union write echoes the global view. effective_for
    -- says which, so the console never renders a global answer under a
    -- union heading.
    'effective_for', case when p_scope = 'club' then 'club:' || p_scope_id::text else 'global' end,
    'effective', case when p_scope = 'club' then public.fn_ca_fleet_policy_effective(p_scope_id)
                      else public.fn_ca_fleet_policy_effective(null) end
  );
end
$function$
