CREATE OR REPLACE FUNCTION public.fn_ca_player_restrict(p_user_id uuid, p_scope text, p_reason_code text, p_note text, p_expires_at timestamp with time zone, p_actor uuid, p_approval_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row      public.ca_player_restrictions;
  v_existing public.ca_player_restrictions;
  v_is_horse boolean;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'user_required');
  end if;

  select is_horse into v_is_horse from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'player_not_found');
  end if;

  -- expires_at is the clock, status is only the intent. A row that has
  -- run out does not bind, so it must not block either - the console
  -- renders it Expired and told the operator to lift an active one.
  select * into v_existing
    from public.ca_player_restrictions
   where user_id = p_user_id and scope = p_scope and status = 'active'
     and (expires_at is null or expires_at > now())
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'already_restricted',
      'restriction_id', v_existing.id,
      'applied_at', v_existing.applied_at);
  end if;

  -- The partial unique index has the same blind spot by construction: it
  -- keys on status alone. So a run-out row that the sweep has not
  -- reached yet is retired HERE, in the same transaction, rather than
  -- raising a unique violation the operator cannot act on.
  update public.ca_player_restrictions
     set status = 'expired'
   where user_id = p_user_id and scope = p_scope and status = 'active'
     and expires_at is not null and expires_at <= now();

  insert into public.ca_player_restrictions
    (user_id, scope, reason_code, reason_note, expires_at, applied_by, approval_id)
  values
    (p_user_id, p_scope, p_reason_code, nullif(btrim(coalesce(p_note, '')), ''),
     p_expires_at, p_actor, p_approval_id)
  returning * into v_row;

  -- NO fn_log_admin_action HERE. The route audits, and it is the only
  -- half that knows the ip, the user agent and the request id that
  -- Phase 1's audit contract requires on every row. Two writers meant
  -- two rows per event and two different answers to "what changed".
  return jsonb_build_object('ok', true, 'restriction', to_jsonb(v_row),
                            'is_horse', coalesce(v_is_horse, false));
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ca_player_lift_restriction(p_id uuid, p_actor uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before public.ca_player_restrictions;
  v_after  public.ca_player_restrictions;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;

  select * into v_before from public.ca_player_restrictions where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_before.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active',
                              'status', v_before.status);
  end if;

  update public.ca_player_restrictions
     set status    = 'lifted',
         lifted_by = p_actor,
         lifted_at = now(),
         lift_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
  returning * into v_after;

  return jsonb_build_object('ok', true, 'restriction', to_jsonb(v_after),
                            'before', to_jsonb(v_before));
end;
$function$;

