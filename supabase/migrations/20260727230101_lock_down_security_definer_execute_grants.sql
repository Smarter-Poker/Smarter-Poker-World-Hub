-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727230101_lock_down_security_definer_execute_grants.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- 2026-07-27 security hardening.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which the
-- anon and authenticated roles inherit and PostgREST exposes at
-- /rest/v1/rpc/*. Several SECURITY DEFINER functions were therefore reachable
-- by callers who should never have been able to invoke them.
--
-- Group 1 is my own responsibility: functions created earlier in this audit
-- whose EXECUTE grants I failed to restrict. Two of them (issue_manual_comp,
-- redeem_comps) move real comp balances and were callable by anon.
-- All of them are invoked exclusively from server routes using the service
-- role, so removing anon + authenticated is behaviour-preserving.

revoke all on function public.issue_manual_comp(integer, uuid, numeric, text, uuid) from public, anon, authenticated;
revoke all on function public.redeem_comps(integer, uuid, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.increment_table_hands(uuid) from public, anon, authenticated;
revoke all on function public.update_leaderboard_rankings(uuid) from public, anon, authenticated;
revoke all on function public.increment_home_game_stats(uuid) from public, anon, authenticated;
revoke all on function public.record_health_metric(integer, text, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.increment_cache_served(uuid) from public, anon, authenticated;
revoke all on function public.fn_get_all_identity_unread_counts(uuid) from public, anon, authenticated;
revoke all on function public.record_promo_wagering(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.close_table_session(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.update_table_stats(uuid, numeric) from public, anon, authenticated;
revoke all on function public.fn_increment_agent_player_count(uuid, uuid, integer) from public, anon, authenticated;

-- Group 2: pre-existing money-movement functions that carry no internal
-- auth.uid() check. club-arena is a browser SPA that calls these directly with
-- a logged-in session, so `authenticated` MUST be preserved — but `anon` has
-- no legitimate path to them and is removed. The missing *internal*
-- authorization is deliberately NOT invented here; it is reported instead.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fn_apply_credit_payment','fn_horse_fund_from_treasury','fn_horse_seat_from_treasury')
  loop
    execute format('revoke all on function %s from anon', r.sig);
  end loop;
end $$;

-- Group 3: the two functions gating Club Commander access took the user id as
-- a parameter and trusted it. The server-side caller (pages/api/check-access.js)
-- derives it from a validated Bearer token, so that path was never exploitable
-- — but any authenticated user could call these directly over PostgREST with
-- someone else's uuid and enumerate whether that person owns venues, plus
-- their venue ids, club names and home-group names.
--
-- Non-service callers are now forced onto their own identity. The service role
-- (used by the API route) keeps the ability to ask about any user.

create or replace function public.has_commander_access(p_user_id uuid)
returns boolean
language plpgsql stable security definer set search_path = 'public'
as $function$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_uid  uuid := auth.uid();
  v_target uuid := p_user_id;
begin
  if v_role <> 'service_role' then
    if v_uid is null then return false; end if;   -- anon: nothing to see
    v_target := v_uid;                            -- callers may only ask about themselves
  end if;

  return
    exists (select 1 from clubs where owner_id = v_target) or
    exists (select 1 from commander_subscriptions where owner_id = v_target) or
    exists (
      select 1 from commander_staff
      where (user_id = v_target or linked_user_id = v_target)
        and role in ('owner','manager')
        and venue_id is not null
    ) or
    exists (select 1 from commander_home_groups where owner_id = v_target);
end
$function$;

create or replace function public.get_commander_access_details(p_user_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = 'public'
as $function$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_uid  uuid := auth.uid();
  v_target uuid := p_user_id;
  v_result jsonb;
begin
  if v_role <> 'service_role' then
    if v_uid is null then
      return jsonb_build_object('hasAccess', false, 'isClubOwner', false,
        'hasSubscription', false, 'isVenueStaffOwner', false, 'isVenueStaffManager', false,
        'isHomeGroupOwner', false, 'venueIds', '[]'::jsonb, 'subscriptionVenueIds', '[]'::jsonb,
        'clubs', '[]'::jsonb, 'homeGroups', '[]'::jsonb);
    end if;
    v_target := v_uid;
  end if;

  with
    cs as (
      select venue_id, role from commander_staff
      where (user_id = v_target or linked_user_id = v_target) and venue_id is not null
    ),
    sub as (select venue_id from commander_subscriptions where owner_id = v_target),
    cl  as (select id, club_id, name from clubs where owner_id = v_target),
    hg  as (select id, name from commander_home_groups where owner_id = v_target)
  select jsonb_build_object(
    'hasAccess', (exists(select 1 from cl) or exists(select 1 from sub)
                  or exists(select 1 from cs where role in ('owner','manager'))
                  or exists(select 1 from hg)),
    'isClubOwner',          exists(select 1 from cl),
    'hasSubscription',      exists(select 1 from sub),
    'isVenueStaffOwner',    exists(select 1 from cs where role = 'owner'),
    'isVenueStaffManager',  exists(select 1 from cs where role = 'manager'),
    'isHomeGroupOwner',     exists(select 1 from hg),
    'venueIds',             coalesce((select jsonb_agg(distinct venue_id) from cs), '[]'::jsonb),
    'subscriptionVenueIds', coalesce((select jsonb_agg(venue_id) from sub), '[]'::jsonb),
    'clubs',                coalesce((select jsonb_agg(jsonb_build_object('id', id, 'club_id', club_id, 'name', name)) from cl), '[]'::jsonb),
    'homeGroups',           coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from hg), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$function$;

-- Post-conditions
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('issue_manual_comp','redeem_comps','increment_cache_served',
                      'fn_get_all_identity_unread_counts','record_promo_wagering',
                      'update_table_stats','close_table_session')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if bad is not null then raise exception 'anon still holds EXECUTE on: %', bad; end if;
end $$;
