-- Concurrent operation keys must pass the same identity and status checks.
DO $guard$
DECLARE v_definition text;
BEGIN
  SELECT md5(pg_get_functiondef('public.fn_ca_operator_request_approval(text,jsonb,uuid,numeric,text,text,text,text,text,text)'::regprocedure)) INTO v_definition;
  IF v_definition NOT IN ('39852af5c49ee43cf13e154b9b7543dd', 'a8699a8b1ebebda4b4ae012698117494') THEN
    RAISE EXCEPTION 'Operator approval definition drift: %', v_definition;
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.fn_ca_operator_request_approval(p_kind text, p_payload jsonb, p_requested_by uuid, p_amount numeric, p_asset text, p_target_type text, p_target_id text, p_reason text, p_op_id text, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_policy         public.ca_operator_policy%rowtype;
  v_threshold      numeric;
  v_permission     text;
  v_required       boolean := false;
  v_alone          boolean := false;
  v_blocked        text;
  v_status         text;
  v_expires        timestamptz;
  v_id             uuid;
  v_existing       public.ca_operator_approvals%rowtype;
  v_replay         boolean := false;
  v_retry_failed   boolean := false;
  v_mismatch       text[]  := '{}';
begin
  if p_kind is null or p_kind not in ('mint','burn','fund_club','cashout','fleet_policy','sanction') then
    raise exception 'fn_ca_operator_request_approval: unknown kind %', p_kind;
  end if;

  -- Exactly once starts here, not at execution: a retried request with
  -- the same op_id must return the row it already made, never a second
  -- queue entry that a second operator could approve independently.
  if p_op_id is not null then
    -- Serialize creation as well as replay: an absent row cannot be row-locked.
    perform pg_advisory_xact_lock(hashtextextended('ca_operator_approval:' || p_op_id, 0));
    select * into v_existing from public.ca_operator_approvals where op_id = p_op_id for update;
    if found then
      v_replay := true;
    end if;
  end if;

  if v_replay then
    -- ---------------------------------------------------------------
    -- IS THIS EVEN THE SAME OPERATION? (review finding B-3)
    -- ---------------------------------------------------------------
    -- The old body returned the stored row without ever looking at the
    -- parameters, so an approved 500-chip request for one club could be
    -- replayed as 999999 to another club and come back required:false.
    -- IS DISTINCT FROM, so a null matches a null and 500 matches 500.0.
    -- This runs BEFORE the status branch: a laundered replay must not be
    -- able to reach the "cleared to proceed" answer at all.
    if v_existing.kind is distinct from p_kind then
      v_mismatch := v_mismatch || 'kind'::text;
    end if;
    if v_existing.amount is distinct from p_amount then
      v_mismatch := v_mismatch || 'amount'::text;
    end if;
    if v_existing.asset is distinct from p_asset then
      v_mismatch := v_mismatch || 'asset'::text;
    end if;
    if v_existing.target_type is distinct from p_target_type then
      v_mismatch := v_mismatch || 'target_type'::text;
    end if;
    if v_existing.target_id is distinct from p_target_id then
      v_mismatch := v_mismatch || 'target_id'::text;
    end if;

    if array_length(v_mismatch, 1) is not null then
      return jsonb_build_object(
        'ok', false,
        'refused', true,
        -- required stays TRUE on every refusal. approvals.js ANDs this
        -- with its own cached decision, so a refusal that said false
        -- would read as "go" to a caller not yet taught to read `ok`.
        'required', true,
        'error', 'payload_mismatch',
        'reason', 'payload_mismatch',
        'mismatch', to_jsonb(v_mismatch),
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true
      );
    end if;

    -- A pending row that has aged out is closed HERE rather than left to
    -- answer required:true forever, and rather than waiting for somebody
    -- to attempt a decision on it (review finding M-5). The row and the
    -- answer can then never disagree.
    if v_existing.status = 'pending'
       and v_existing.expires_at is not null
       and v_existing.expires_at <= now() then
      update public.ca_operator_approvals
        set status = 'expired'
      where id = v_existing.id
      returning * into v_existing;
    end if;

    -- ---------------------------------------------------------------
    -- WHAT EACH STORED STATUS MEANS (review finding B-2)
    -- ---------------------------------------------------------------
    -- The old body answered required := (status = 'pending'), so
    -- 'rejected' and 'expired' both came back required:false and the
    -- caller moved the money against a refused request.
    if v_existing.status in ('approved', 'auto_approved') then
      -- Cleared to proceed and not yet executed. The only two statuses
      -- that may answer false.
      return jsonb_build_object(
        'ok', true,
        'required', false,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', false
      );
    elsif v_existing.status = 'executed' then
      -- Already done. required:false with already_executed:true, on
      -- purpose and not a refusal: the money RPC's own op_id claim is
      -- what replays from here (fn_ca_mint returns the original result
      -- rather than minting again), so the caller's idempotency does the
      -- work. Refusing would turn a dropped response on a completed mint
      -- into an operator error and invite a manual retry.
      return jsonb_build_object(
        'ok', true,
        'required', false,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', true
      );
    elsif v_existing.status = 'pending' then
      return jsonb_build_object(
        'ok', true,
        'required', true,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true,
        'already_executed', false
      );
    elsif v_existing.status in ('rejected', 'expired') then
      -- A human said no, or the request timed out. Either way this
      -- operation does not proceed under this key. The route maps
      -- refused:true onto a 403 or 409; a caller that only reads
      -- `required` sees true and returns the 202 pending body, which
      -- moves no money either.
      return jsonb_build_object(
        'ok', false,
        'refused', true,
        'required', true,
        'error', case when v_existing.status = 'rejected'
                      then 'approval_rejected' else 'approval_expired' end,
        'reason', case when v_existing.status = 'rejected'
                       then 'approval_rejected' else 'approval_expired' end,
        'approval_id', v_existing.id,
        'status', v_existing.status,
        'blocked_reason', v_existing.blocked_reason,
        'idempotent', true
      );
    else
      -- 'failed'. The previous attempt moved no money, so the operator
      -- is entitled to try again, and this is a FRESH request: the
      -- policy is read again and the threshold applied again. op_id is
      -- unique, so the existing row is re-opened in place below rather
      -- than duplicated.
      v_retry_failed := true;
    end if;
  end if;

  select * into v_policy from public.ca_operator_policy where id limit 1;
  if not found then
    -- No policy row means no configured control, and the safety rule
    -- says an absent control never blocks a move that works today.
    v_policy.approvals_enabled := false;
    v_policy.allow_self_approve_when_alone := true;
    v_policy.approval_ttl_minutes := 1440;
  end if;

  v_permission := case p_kind
                    when 'cashout' then 'cashier.write'
                    when 'fleet_policy' then 'fleet.write'
                    when 'sanction' then 'moderation.write'
                    else 'money.write'
                  end;

  v_threshold := case p_kind
                   when 'cashout' then coalesce(v_policy.cashout_threshold, 0)
                   when 'fund_club' then coalesce(v_policy.fund_threshold, 0)
                   when 'mint' then coalesce(v_policy.mint_threshold, 0)
                   when 'burn' then coalesce(v_policy.mint_threshold, 0)
                   else 0
                 end;

  if not coalesce(v_policy.approvals_enabled, false) then
    v_required := false;
  elsif p_amount is null then
    -- A kind with no amount (fleet_policy, sanction) has nothing to
    -- compare against a threshold, so with approvals on it always asks.
    v_required := true;
  else
    -- >= AND NOT > (review finding H-2). src/lib/horses/approvals.js
    -- gates at `amt < threshold` (so >= asks), the module comment says
    -- so, the console copy an operator reads says so and the test
    -- asserts it. requireApproval ANDs the two answers, so the looser
    -- one won: a threshold of exactly 1000 let 1000 through unwatched.
    v_required := p_amount >= v_threshold;
  end if;

  if v_required then
    v_alone := not public.fn_ca_operator_has_second_approver(p_requested_by, v_permission);
    if v_alone then
      -- Always recorded, whichever way the rule falls, so the trail
      -- shows the platform was short handed at this moment.
      v_blocked := 'no_second_approver';
      if coalesce(v_policy.allow_self_approve_when_alone, true) then
        v_required := false;
      end if;
    end if;
  end if;

  if v_required then
    v_status  := 'pending';
    v_expires := now() + make_interval(mins => coalesce(v_policy.approval_ttl_minutes, 1440));
  else
    v_status  := 'auto_approved';
    v_expires := null;
  end if;

  if v_retry_failed then
    -- Re-open the failed row under its own key rather than insert a
    -- second row the unique index would reject.
    update public.ca_operator_approvals
      set status         = v_status,
          requested_by   = p_requested_by,
          requested_at   = now(),
          amount         = p_amount,
          asset          = p_asset,
          target_type    = p_target_type,
          target_id      = p_target_id,
          reason         = p_reason,
          payload        = coalesce(p_payload, '{}'::jsonb),
          blocked_reason = v_blocked,
          request_id     = p_request_id,
          expires_at     = v_expires,
          executed_at    = null,
          decided_by     = case when v_status = 'auto_approved' and v_alone then p_requested_by end,
          decided_at     = case when v_status = 'auto_approved' and v_alone then now() end
    where id = v_existing.id
    returning id into v_id;
  else
    insert into public.ca_operator_approvals (
      kind, status, requested_by, amount, asset, target_type, target_id,
      reason, payload, op_id, blocked_reason, request_id, expires_at,
      decided_by, decided_at
    ) values (
      p_kind, v_status, p_requested_by, p_amount, p_asset, p_target_type, p_target_id,
      p_reason, coalesce(p_payload, '{}'::jsonb), p_op_id, v_blocked, p_request_id, v_expires,
      -- decided_by is the requester ONLY when the alone rule let them
      -- stand in for a second operator. A plain auto_approved row (the
      -- normal case today, approvals off) has no decider, and saying it
      -- had one would put a self approval in the trail that never
      -- happened.
      case when v_status = 'auto_approved' and v_alone then p_requested_by end,
      -- AND NEITHER DOES IT HAVE A DECISION TIME (review finding L-4).
      -- The old body stamped decided_at = now() on every auto_approved
      -- row, decider or not, which reads to anyone querying the table
      -- later as a decision that happened and whose decider was lost.
      case when v_status = 'auto_approved' and v_alone then now() end
    )
    -- The check above and this insert used to be two statements with
    -- nothing between them but hope (review finding M-3): two requests
    -- with the same op_id both missed the SELECT, both inserted, and the
    -- second raised 23505, which approvals.js reads as "the approval
    -- could not be recorded" and turns into a 503 on what should be a
    -- 202. The partial unique index resolves it now, and the loser
    -- re-reads the winner's row below.
    on conflict (op_id) where op_id is not null do nothing
    returning id into v_id;

    if v_id is null then
      -- A legacy writer may not take the advisory lock. Lock its committed
      -- winner before replay so it cannot disappear between these statements.
      select * into v_existing from public.ca_operator_approvals
        where op_id = p_op_id for update;
      if not found then
        raise exception 'fn_ca_operator_request_approval: op_id % conflicted but no row can be read', p_op_id;
      end if;
      -- Re-enter the one identity/status validator. The row lock guarantees
      -- this is a replay, so recursion is bounded to one additional call.
      return public.fn_ca_operator_request_approval(
        p_kind, p_payload, p_requested_by, p_amount, p_asset,
        p_target_type, p_target_id, p_reason, p_op_id, p_request_id
      ) || jsonb_build_object('raced', true);
    end if;
  end if;

  begin
    perform public.fn_log_admin_action(
      p_admin_user_id := p_requested_by,
      p_action        := 'operator.request_approval',
      p_target_type   := coalesce(p_target_type, 'operator_approval'),
      p_target_id     := coalesce(p_target_id, v_id::text),
      p_details       := jsonb_build_object(
                           'approval_id', v_id,
                           'kind', p_kind,
                           'amount', p_amount,
                           'asset', p_asset,
                           'threshold', v_threshold,
                           'required', v_required,
                           'status', v_status,
                           'blocked_reason', v_blocked,
                           'alone_rule_applied', v_alone and not v_required,
                           'approvals_enabled', coalesce(v_policy.approvals_enabled, false),
                           'retried_after_failure', v_retry_failed,
                           'op_id', p_op_id
                         ),
      p_before_state  := null,
      p_after_state   := jsonb_build_object('status', v_status, 'expires_at', v_expires),
      p_ip_address    := null,
      p_user_agent    := null,
      p_request_id    := p_request_id
    );
  exception when others then
    raise notice 'fn_ca_operator_request_approval audit failed: %', sqlerrm;
  end;

  return jsonb_build_object(
    'ok', true,
    'required', v_required,
    'approval_id', v_id,
    'status', v_status,
    'blocked_reason', v_blocked,
    'idempotent', false,
    'already_executed', false,
    'retried_after_failure', v_retry_failed
  );
end
$function$;

REVOKE ALL ON FUNCTION public.fn_ca_operator_request_approval(text,jsonb,uuid,numeric,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ca_operator_request_approval(text,jsonb,uuid,numeric,text,text,text,text,text,text) TO service_role;
