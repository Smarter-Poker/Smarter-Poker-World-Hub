-- =====================================================================
-- Phase 4 correction: fn_ca_player_rg_set could not classify two of its
-- seven fields, and failed loudly when it tried.
-- Project kuklfnapbkmacvwxktbh. Tier 2 (one function replaced).
--
-- WHAT WAS WRONG
-- The loosening list is a text[], and two of the three places that
-- append to it appended a bare quoted literal:
--
--     v_loosens := v_loosens || 'reality_check_interval_minutes:lengthened';
--
-- An untyped literal on the right of || makes Postgres resolve the
-- operator as anyarray || anyarray and try to PARSE the string as an
-- array literal, which fails:
--
--     ERROR: malformed array literal: "reality_check_interval_minutes:lengthened"
--     DETAIL: Array value must start with "{" or dimension information.
--
-- The three appends inside the FOREACH loops happened to work, because
-- there the right side is the parenthesised expression (v_key || ':raised')
-- which is already typed text, so the anyarray || anyelement form won.
-- So five of the seven fields classified correctly and two blew up: the
-- reality-check interval, and neither exclusion timestamp.
--
-- WHY IT MATTERS RATHER THAN BEING A TYPO
-- Those two are the RESPONSIBLE GAMING fields. An operator lengthening a
-- player's reality-check interval, or shortening a self-exclusion, is
-- doing the single thing PHASE4-CONTRACTS section 0 rule 7 exists to
-- hold: "an operator is not a bypass of a player's protection". Instead
-- of being held, the call raised 22P02 out of the RPC, which the route
-- would have scrubbed into a generic failure. The protection would have
-- read as "something went wrong", and the obvious next move for an
-- operator who wanted it done is the SQL console.
--
-- It never reached production: PHASE4-SIM.sql caught it on the first
-- run, before the route or the panel existed. This is what 11.5 means
-- by wanting the error message rather than the side effects.
--
-- THE FIX
-- array_append everywhere, which is unambiguous by construction and
-- cannot be re-broken by somebody adding a fourth field the same way.
-- Nothing else in the function changes: same signature, same rules,
-- same audit.
-- =====================================================================

begin;

set local lock_timeout = '3s';

create or replace function public.fn_ca_player_rg_set(
  p_user_id uuid,
  p_patch   jsonb,
  p_actor   uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before  public.responsible_gaming_limits;
  v_after   public.responsible_gaming_limits;
  v_created boolean := false;
  v_loosens text[] := '{}';
  v_key     text;
  v_num     numeric;
  v_ts      timestamptz;
begin
  if p_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'actor_required');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'patch_required');
  end if;

  select * into v_before
    from public.responsible_gaming_limits where user_id = p_user_id;

  if not found then
    -- No row means no limits at all, which is the loosest a player can
    -- be. Creating one can only tighten, so there is nothing to hold.
    v_created := true;
  end if;

  -- LOWER is tighter for the money and time caps.
  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes'
  ] loop
    if p_patch ? v_key then
      v_num := nullif(p_patch ->> v_key, '')::numeric;
      if not v_created then
        if v_num is null and (to_jsonb(v_before) ->> v_key) is not null then
          v_loosens := array_append(v_loosens, v_key || ':cleared');
        elsif v_num is not null and (to_jsonb(v_before) ->> v_key) is not null
              and v_num > (to_jsonb(v_before) ->> v_key)::numeric then
          v_loosens := array_append(v_loosens, v_key || ':raised');
        end if;
      end if;
    end if;
  end loop;

  -- SHORTER is tighter for the reality check, because a shorter interval
  -- means MORE reminders. Reading this one the same way round as the
  -- money limits would classify "remind me less often" as a tighten,
  -- which is backwards and is the kind of mistake that only shows up in
  -- somebody's worst month.
  if p_patch ? 'reality_check_interval_minutes' then
    v_num := nullif(p_patch ->> 'reality_check_interval_minutes', '')::numeric;
    if not v_created and v_num is not null
       and v_num > v_before.reality_check_interval_minutes then
      v_loosens := array_append(v_loosens, 'reality_check_interval_minutes:lengthened');
    end if;
  end if;

  -- LATER is tighter for the two exclusions.
  foreach v_key in array array['self_excluded_until', 'cooling_off_until'] loop
    if p_patch ? v_key then
      v_ts := nullif(p_patch ->> v_key, '')::timestamptz;
      if not v_created then
        if v_ts is null and (to_jsonb(v_before) ->> v_key) is not null then
          v_loosens := array_append(v_loosens, v_key || ':cleared');
        elsif v_ts is not null and (to_jsonb(v_before) ->> v_key) is not null
              and v_ts < (to_jsonb(v_before) ->> v_key)::timestamptz then
          v_loosens := array_append(v_loosens, v_key || ':shortened');
        end if;
      end if;
    end if;
  end loop;

  -- Refused WHOLE. Half-applying would silently keep the loosening the
  -- operator wanted and drop the tightening, or the reverse, and neither
  -- is what anybody asked for.
  if array_length(v_loosens, 1) is not null
     and not v_created
     and now() < v_before.limit_increase_available_at then
    return jsonb_build_object(
      'ok', false,
      'reason', 'loosening_is_held',
      'held_until', v_before.limit_increase_available_at,
      'loosens', to_jsonb(v_loosens));
  end if;

  insert into public.responsible_gaming_limits as t (
    user_id, daily_deposit_limit, weekly_deposit_limit, monthly_deposit_limit,
    daily_loss_limit, session_time_limit_minutes, reality_check_interval_minutes,
    self_excluded_until, cooling_off_until, limit_increase_available_at, updated_at
  ) values (
    p_user_id,
    nullif(p_patch ->> 'daily_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'weekly_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'monthly_deposit_limit', '')::numeric,
    nullif(p_patch ->> 'daily_loss_limit', '')::numeric,
    nullif(p_patch ->> 'session_time_limit_minutes', '')::int,
    coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int, 60),
    nullif(p_patch ->> 'self_excluded_until', '')::timestamptz,
    nullif(p_patch ->> 'cooling_off_until', '')::timestamptz,
    now() + interval '24 hours',
    now()
  )
  on conflict (user_id) do update set
    daily_deposit_limit = case when p_patch ? 'daily_deposit_limit'
      then nullif(p_patch ->> 'daily_deposit_limit', '')::numeric
      else t.daily_deposit_limit end,
    weekly_deposit_limit = case when p_patch ? 'weekly_deposit_limit'
      then nullif(p_patch ->> 'weekly_deposit_limit', '')::numeric
      else t.weekly_deposit_limit end,
    monthly_deposit_limit = case when p_patch ? 'monthly_deposit_limit'
      then nullif(p_patch ->> 'monthly_deposit_limit', '')::numeric
      else t.monthly_deposit_limit end,
    daily_loss_limit = case when p_patch ? 'daily_loss_limit'
      then nullif(p_patch ->> 'daily_loss_limit', '')::numeric
      else t.daily_loss_limit end,
    session_time_limit_minutes = case when p_patch ? 'session_time_limit_minutes'
      then nullif(p_patch ->> 'session_time_limit_minutes', '')::int
      else t.session_time_limit_minutes end,
    reality_check_interval_minutes = case when p_patch ? 'reality_check_interval_minutes'
      then coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int,
                    t.reality_check_interval_minutes)
      else t.reality_check_interval_minutes end,
    self_excluded_until = case when p_patch ? 'self_excluded_until'
      then nullif(p_patch ->> 'self_excluded_until', '')::timestamptz
      else t.self_excluded_until end,
    cooling_off_until = case when p_patch ? 'cooling_off_until'
      then nullif(p_patch ->> 'cooling_off_until', '')::timestamptz
      else t.cooling_off_until end,
    -- A tighten moves the hold forward. The player just became more
    -- protected; loosening that waits, exactly as it does when they do
    -- it themselves.
    limit_increase_available_at = now() + interval '24 hours',
    updated_at = now()
  returning * into v_after;

  perform public.fn_log_admin_action(
    p_admin_user_id := p_actor,
    p_action        := 'player.rg_set',
    p_target_type   := 'profile',
    p_target_id     := p_user_id::text,
    p_details       := jsonb_build_object('patch', p_patch, 'created', v_created),
    p_before_state  := case when v_created then null else to_jsonb(v_before) end,
    p_after_state   := to_jsonb(v_after));

  return jsonb_build_object('ok', true, 'limits', to_jsonb(v_after),
                            'created', v_created);
end;
$$;

revoke all on function public.fn_ca_player_rg_set(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_ca_player_rg_set(uuid, jsonb, uuid)
  to service_role;

do $assert$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'fn_ca_player_rg_set';

  if v_src ~ 'v_loosens\s*:=\s*v_loosens\s*\|\|' then
    raise exception 'ASSERT FAILED: the || form is back. Use array_append.';
  end if;
  if (length(v_src) - length(replace(v_src, 'array_append', ''))) / 12 <> 5 then
    raise exception 'ASSERT FAILED: expected 5 array_append calls, one per classified direction';
  end if;
  raise notice 'ASSERT OK: every loosening classification appends with array_append.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- There is nothing to roll back to that is better than this. The
-- previous body of this function raised 22P02 on two of its seven
-- fields, so restoring it would restore a protection that reports
-- "something went wrong" instead of holding. If this function must go,
-- drop it and remove its caller:
--
-- begin;
--   drop function if exists public.fn_ca_player_rg_set(uuid, jsonb, uuid);
-- commit;
-- =====================================================================
