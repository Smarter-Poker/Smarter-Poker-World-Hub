-- =====================================================================
-- Phase 4 correction, part three: creating a responsible-gaming row
-- silently LOOSENED the one protection the operator did not name.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 2 (one function).
--
-- =====================================================================
-- THE DEFECT
-- =====================================================================
--
-- fn_ca_player_rg_set's INSERT branch read:
--
--     coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int, 60)
--
-- The previous correction's own header explains why the column cannot be
-- cleared - "The column is NOT NULL in production, so the honest answer
-- is a refusal" - which was right about the NOT NULL and missed the
-- DEFAULT sitting beside it. Read from production 2026-09-04:
--
--     reality_check_interval_minutes | integer | NOT NULL | default 30
--
-- So an operator creating a row without naming that field got 60 where
-- the platform's own default is 30.
--
-- WHY THAT IS A SECTION 0 RULE 7 VIOLATION AND NOT A TYPO
--
-- A LONGER reality-check interval means FEWER reminders, and this very
-- function classifies exactly that as `:lengthened`, which is to say a
-- LOOSENING. So an operator tightening a deposit limit - the most
-- protective thing they can do - silently halved the frequency of the
-- reality check for the same player, on a protection surface, with no
-- hold, no refusal and nothing said. Rule 7 exists to stop an operator
-- being a bypass of a player's protection; this was the bypass firing
-- without anybody asking for it.
--
-- It has never happened: responsible_gaming_limits holds ZERO rows, so
-- creation is the only path that exists and it has not been walked. That
-- is luck, not design.
--
-- WHY THE SIM MISSED IT
--
-- PHASE4-SIM.sql's create case passes an explicit interval of 30, so the
-- omitted-key create - the ONLY shape this defect has - was never
-- exercised. A probe that always names a field cannot find a bad default
-- for it. The sim gains that case in the same change.
--
-- =====================================================================
-- THE FIX
-- =====================================================================
--
-- Default to 30, matching the column, and ASSERT that the column's
-- default is still 30 so this cannot drift apart again in silence. If
-- somebody changes the table default, this migration's assertion is the
-- thing that tells them a second copy of it exists in here.
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
  v_changed text[] := '{}';
  v_key     text;
  v_num     numeric;
  v_ts      timestamptz;
  v_old     text;
  v_new     text;
  -- The column's own default, mirrored here and asserted below. NOT 60:
  -- a longer interval is fewer reminders, which this function itself
  -- classifies as a loosening.
  c_default_interval constant int := 30;
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
    v_created := true;
  end if;

  if p_patch ? 'reality_check_interval_minutes'
     and nullif(p_patch ->> 'reality_check_interval_minutes', '') is null then
    return jsonb_build_object('ok', false, 'reason', 'reality_check_not_nullable');
  end if;

  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes',
    'reality_check_interval_minutes', 'self_excluded_until', 'cooling_off_until'
  ] loop
    if not (p_patch ? v_key) then
      continue;
    end if;
    v_new := nullif(p_patch ->> v_key, '');
    v_old := case when v_created then null else to_jsonb(v_before) ->> v_key end;

    if v_key in ('self_excluded_until', 'cooling_off_until') then
      if v_new is distinct from v_old
         and (v_new is null or v_old is null
              or v_new::timestamptz is distinct from v_old::timestamptz) then
        v_changed := array_append(v_changed, v_key);
      end if;
    elsif v_new is distinct from v_old
          and (v_new is null or v_old is null
               or v_new::numeric is distinct from v_old::numeric) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;

  if array_length(v_changed, 1) is null then
    return jsonb_build_object('ok', false, 'reason', 'patch_changes_nothing');
  end if;

  foreach v_key in array array[
    'daily_deposit_limit', 'weekly_deposit_limit', 'monthly_deposit_limit',
    'daily_loss_limit', 'session_time_limit_minutes'
  ] loop
    if p_patch ? v_key and not v_created then
      v_num := nullif(p_patch ->> v_key, '')::numeric;
      v_old := to_jsonb(v_before) ->> v_key;
      if v_num is null and v_old is not null then
        v_loosens := array_append(v_loosens, v_key || ':cleared');
      elsif v_num is not null and v_old is not null and v_num > v_old::numeric then
        v_loosens := array_append(v_loosens, v_key || ':raised');
      end if;
    end if;
  end loop;

  if p_patch ? 'reality_check_interval_minutes' and not v_created then
    v_num := nullif(p_patch ->> 'reality_check_interval_minutes', '')::numeric;
    if v_num is not null and v_num > v_before.reality_check_interval_minutes then
      v_loosens := array_append(v_loosens, 'reality_check_interval_minutes:lengthened');
    end if;
  end if;

  foreach v_key in array array['self_excluded_until', 'cooling_off_until'] loop
    if p_patch ? v_key and not v_created then
      v_ts := nullif(p_patch ->> v_key, '')::timestamptz;
      v_old := to_jsonb(v_before) ->> v_key;
      if v_ts is null and v_old is not null then
        v_loosens := array_append(v_loosens, v_key || ':cleared');
      elsif v_ts is not null and v_old is not null and v_ts < v_old::timestamptz then
        v_loosens := array_append(v_loosens, v_key || ':shortened');
      end if;
    end if;
  end loop;

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
    -- THE FIX. The column's default, not a number somebody liked.
    coalesce(nullif(p_patch ->> 'reality_check_interval_minutes', '')::int,
             c_default_interval),
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
      then nullif(p_patch ->> 'reality_check_interval_minutes', '')::int
      else t.reality_check_interval_minutes end,
    self_excluded_until = case when p_patch ? 'self_excluded_until'
      then nullif(p_patch ->> 'self_excluded_until', '')::timestamptz
      else t.self_excluded_until end,
    cooling_off_until = case when p_patch ? 'cooling_off_until'
      then nullif(p_patch ->> 'cooling_off_until', '')::timestamptz
      else t.cooling_off_until end,
    limit_increase_available_at = now() + interval '24 hours',
    updated_at = now()
  returning * into v_after;

  return jsonb_build_object('ok', true, 'limits', to_jsonb(v_after),
                            'before', case when v_created then null else to_jsonb(v_before) end,
                            'changed', to_jsonb(v_changed),
                            'created', v_created);
end;
$$;

revoke all on function public.fn_ca_player_rg_set(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_ca_player_rg_set(uuid, jsonb, uuid)
  to service_role;

do $assert$
declare
  v_default text;
  v_src     text;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'responsible_gaming_limits'
     and column_name = 'reality_check_interval_minutes';

  -- The number is mirrored in two places now - the column and this
  -- function - so the migration refuses to finish if they disagree. That
  -- is the whole point: a silent divergence here LOOSENS a protection.
  if coalesce(v_default, '') <> '30' then
    raise exception 'ASSERT FAILED: the column default is now %, but fn_ca_player_rg_set still creates rows with 30. Change both together or neither.', v_default;
  end if;

  select prosrc into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname = 'fn_ca_player_rg_set';
  if v_src like '%, 60)%' then
    raise exception 'ASSERT FAILED: the 60-minute default is back';
  end if;
  raise notice 'ASSERT OK: creating a limits row uses the column default of 30, which is a tighter reality check than the 60 it used to write.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Do not roll back to the previous body: it writes 60. If this function
-- must go, drop it and remove its caller.
--
-- begin;
--   drop function if exists public.fn_ca_player_rg_set(uuid, jsonb, uuid);
-- commit;
-- =====================================================================
