CREATE OR REPLACE FUNCTION public.fn_ca_operator_has_second_approver(p_requested_by uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_enforce boolean := false;
  v_count   int := 0;
begin
  select coalesce(enforce_named_roles, false) into v_enforce
  from public.ca_operator_policy where id limit 1;

  -- A named grant always makes somebody a nominated approver. A legacy
  -- role holder counts while enforcement is off, which is why the alone
  -- rule never fires in production today: there are three legacy
  -- operators and any two of them are four eyes. Under enforcement a
  -- legacy account is described by its grants when it has any, and keeps
  -- the legacy set when it has none - the exact rule
  -- fn_ca_operator_permissions applies (review finding M-2) - and it
  -- always holds admin.manage, the recovery floor 20260903140000 gave it.
  select count(*) into v_count
  from (
    select g.user_id
    from public.ca_operator_grants g
    join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
    where g.revoked_at is null
      and rp.permission = p_permission
      and (p_requested_by is null or g.user_id <> p_requested_by)
    union
    select p.id
    from public.profiles p
    join public.ca_operator_roles r on r.key = p.role and r.is_legacy
    join public.ca_operator_role_permissions rp on rp.role_key = r.key
    where rp.permission = p_permission
      and (p_requested_by is null or p.id <> p_requested_by)
      and (
        not v_enforce
        or p_permission = 'admin.manage'
        or not exists (
          select 1
          from public.ca_operator_grants g
          where g.user_id = p.id
            and g.revoked_at is null
        )
      )
  ) candidates;

  return v_count > 0;
end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_decide_approval(p_approval_id uuid, p_decision text, p_decided_by uuid, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row        public.ca_operator_approvals%rowtype;
  v_policy     public.ca_operator_policy%rowtype;
  v_permission text;
  v_decision   text;
  v_alone      boolean := false;
  v_self       boolean := false;
  v_withdraw   boolean := false;
  v_holds      boolean := false;
begin
  v_decision := lower(coalesce(p_decision, ''));
  if v_decision in ('approve', 'approved') then
    v_decision := 'approved';
  elsif v_decision in ('reject', 'rejected') then
    v_decision := 'rejected';
  else
    raise exception 'fn_ca_operator_decide_approval: decision must be approve or reject, got %', p_decision;
  end if;

  select * into v_row from public.ca_operator_approvals where id = p_approval_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'approval_not_found', 'reason', 'approval_not_found', 'approval_id', p_approval_id);
  end if;

  if v_row.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'already_decided', 'reason', 'already_decided', 'status', v_row.status, 'approval_id', p_approval_id);
  end if;

  -- An expired request is closed here rather than left to a sweeper, so
  -- the refusal and the state change cannot disagree.
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    update public.ca_operator_approvals set status = 'expired' where id = p_approval_id;
    return jsonb_build_object('ok', false, 'error', 'expired', 'reason', 'expired', 'status', 'expired', 'approval_id', p_approval_id);
  end if;

  v_permission := case v_row.kind
                    when 'cashout' then 'cashier.write'
                    when 'fleet_policy' then 'fleet.write'
                    when 'sanction' then 'moderation.write'
                    else 'money.write'
                  end;

  -- THE PERMISSION CHECK (20260903140000, review finding M-2). It sits
  -- AFTER the not-found, already-decided and expired branches on purpose:
  -- a decision on a dead row should say the row is dead, not hide that
  -- behind an authorisation error the operator cannot act on. A
  -- withdrawal needs it too: the requester held it to raise the row.
  v_holds := coalesce(public.fn_ca_operator_permissions(p_decided_by) -> 'permissions', '[]'::jsonb)
             ? v_permission;

  if not coalesce(v_holds, false) then
    return jsonb_build_object(
      'ok', false,
      'error', 'permission_denied',
      'reason', 'permission_denied',
      'required_permission', v_permission,
      'status', v_row.status,
      'approval_id', p_approval_id
    );
  end if;

  select * into v_policy from public.ca_operator_policy where id limit 1;

  v_self := p_decided_by is not null and v_row.requested_by is not null and p_decided_by = v_row.requested_by;

  -- A WITHDRAWAL IS NOT A SELF APPROVAL (review finding L-12). The four
  -- eyes rule exists so nobody approves their own money move; it has
  -- nothing to say about the requester cancelling one. A reject by the
  -- requester of their own pending row goes through, ends `rejected`
  -- exactly as a second operator's refusal would, and is filed under its
  -- own action name so the trail can tell the two apart.
  v_withdraw := v_self and v_decision = 'rejected';

  if v_self and not v_withdraw then
    v_alone := not public.fn_ca_operator_has_second_approver(v_row.requested_by, v_permission);
    if not (v_alone and coalesce(v_policy.allow_self_approve_when_alone, true)) then
      return jsonb_build_object(
        'ok', false,
        'error', 'self_approval_refused',
        'reason', 'self_approval_refused',
        'status', v_row.status,
        'approval_id', p_approval_id
      );
    end if;
  end if;

  update public.ca_operator_approvals
    set status = v_decision,
        decided_by = p_decided_by,
        decided_at = now(),
        blocked_reason = case when v_self and v_alone then 'no_second_approver' else blocked_reason end,
        result = coalesce(result, '{}'::jsonb)
                 || jsonb_build_object(
                      'decision_note', p_note,
                      'self_approved_alone', v_self and v_alone,
                      'withdrawn', v_withdraw
                    )
  where id = p_approval_id
  returning * into v_row;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_decided_by,
      p_action        := case when v_withdraw then 'operator.withdraw_approval' else 'operator.decide_approval' end,
      p_target_type   := coalesce(v_row.target_type, 'operator_approval'),
      p_target_id     := coalesce(v_row.target_id, p_approval_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', p_approval_id,
                           'kind', v_row.kind,
                           'decision', v_decision,
                           'note', p_note,
                           'permission', v_permission,
                           'self_approved_alone', v_self and v_alone,
                           'alone_rule_applied', v_self and v_alone,
                           'withdrawn', v_withdraw
                         ),
      p_before_state  := jsonb_build_object('status', 'pending'),
      p_after_state   := jsonb_build_object('status', v_decision, 'decided_by', p_decided_by),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := v_row.request_id
    );
  exception when others then
    raise notice 'fn_ca_operator_decide_approval audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'approval_id', p_approval_id,
    'status', v_decision,
    'self_approved_alone', v_self and v_alone,
    'withdrawn', v_withdraw
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.fn_log_admin_action(p_admin_user_id uuid, p_action text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb, p_before_state jsonb DEFAULT NULL::jsonb, p_after_state jsonb DEFAULT NULL::jsonb, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_request_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_role text;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_user_id required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
    RAISE EXCEPTION 'action required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_admin_user_id;

  INSERT INTO public.admin_audit_log (
    admin_user_id, action, target_type, target_id,
    details, before_state, after_state,
    ip_address, user_agent, actor_role, request_id
  ) VALUES (
    p_admin_user_id, p_action, p_target_type, p_target_id,
    COALESCE(p_details, '{}'::jsonb), p_before_state, p_after_state,
    p_ip_address, p_user_agent, v_role, p_request_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_permissions(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile_role  text;
  v_is_legacy     boolean := false;
  v_enforce       boolean := false;
  v_legacy        text[]  := '{}';
  v_granted       text[]  := '{}';
  v_granted_roles text[]  := '{}';
  v_permissions   text[]  := '{}';
  v_roles         text[]  := '{}';
  v_source        text;
  v_floor         boolean := false;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'role', null, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb,
      'source', 'none', 'admin_manage_floor', false
    );
  end if;

  select coalesce(pol.enforce_named_roles, false)
    into v_enforce
  from public.ca_operator_policy pol
  where pol.id
  limit 1;

  select p.role into v_profile_role
  from public.profiles as p
  where p.id = p_user_id
  limit 1;

  -- Only a role that exists in the table and is flagged legacy gets the
  -- automatic set. An unknown profiles.role contributes nothing.
  if v_profile_role is not null then
    select exists (
      select 1 from public.ca_operator_roles r
      where r.key = v_profile_role and r.is_legacy
    ) into v_is_legacy;

    select coalesce(array_agg(rp.permission order by rp.permission), '{}')
      into v_legacy
    from public.ca_operator_role_permissions rp
    join public.ca_operator_roles r on r.key = rp.role_key
    where r.key = v_profile_role
      and r.is_legacy;
  end if;

  select coalesce(array_agg(distinct rp.permission), '{}'),
         coalesce(array_agg(distinct g.role_key), '{}')
    into v_granted, v_granted_roles
  from public.ca_operator_grants g
  join public.ca_operator_role_permissions rp on rp.role_key = g.role_key
  where g.user_id = p_user_id
    and g.revoked_at is null;

  if v_enforce and array_length(v_granted_roles, 1) is not null then
    v_permissions := v_granted;
    v_roles       := v_granted_roles;
    v_source      := 'granted';
  else
    select coalesce(array_agg(distinct u.perm), '{}'::text[])
      into v_permissions
    from (
      select l.perm from unnest(v_legacy) as l(perm)
      union
      select g.perm from unnest(v_granted) as g(perm)
    ) u
    where u.perm is not null;

    select coalesce(array_agg(distinct y.role_key), '{}'::text[])
      into v_roles
    from (
      select v_profile_role as role_key
      where array_length(v_legacy, 1) is not null
      union
      select g.role_key from unnest(v_granted_roles) as g(role_key)
    ) y
    where y.role_key is not null;

    if array_length(v_legacy, 1) is not null and array_length(v_granted_roles, 1) is not null then
      v_source := 'both';
    elsif array_length(v_legacy, 1) is not null then
      v_source := 'legacy';
    elsif array_length(v_granted_roles, 1) is not null then
      v_source := 'granted';
    else
      v_source := 'none';
    end if;
  end if;

  -- THE RECOVERY HATCH (review finding H-4). An account whose
  -- profiles.role is a LEGACY role ALWAYS keeps admin.manage, whatever
  -- enforce_named_roles says and whatever grants it holds. Without this,
  -- granting a god `read_only` and flipping enforcement drops that god
  -- from 21 permissions to 6, admin.manage among the 15 lost, and
  -- admin.manage is the only permission that can flip enforcement back:
  -- the platform would be locked out of its own policy panel with direct
  -- SQL as the only way back in. This is purely ADDITIVE. It can widen a
  -- permission set and can never narrow one, so it cannot breach
  -- contract section 0, and it leaves `roles` and `source` describing
  -- exactly what was granted so the Staff tab still tells the truth.
  if v_is_legacy and not (coalesce(v_permissions, '{}'::text[]) @> array['admin.manage']) then
    v_permissions := coalesce(v_permissions, '{}'::text[]) || 'admin.manage'::text;
    v_floor := true;
  end if;

  -- NO AUDIT ROW IS WRITTEN HERE, DELIBERATELY. This is a READ, it runs
  -- on every console request behind a 30 second cache, and the route that
  -- called it already files one audit row for the request itself. See
  -- WHY PERMISSION RESOLUTION DOES NOT AUDIT ITSELF in 20260903120000.
  return jsonb_build_object(
    'role', v_profile_role,
    'roles', to_jsonb(coalesce(v_roles, '{}'::text[])),
    'permissions', to_jsonb(coalesce(v_permissions, '{}'::text[])),
    'source', v_source,
    -- Additive key. True when the line above put admin.manage back for a
    -- legacy account that enforcement would otherwise have stripped it
    -- from, so the console can say why it is there.
    'admin_manage_floor', v_floor
  );
end
$function$
;
