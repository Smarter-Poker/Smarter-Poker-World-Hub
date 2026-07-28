-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728180032_commander_money_atomic_adjustments.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- ─────────────────────────────────────────────────────────────────────────────
-- Club Commander: atomic money adjustments
--
-- Roughly twenty write sites across pages/api/** implement money mutation as
-- read-modify-write:
--     select balance -> compute next in JS -> update balance = next
-- Two concurrent requests both read the old value and the second write erases
-- the first: a double-tapped rebuy takes the cash twice and records it once;
-- ending a session twice refunds the unused minutes twice.
--
-- PostgREST cannot express `UPDATE t SET col = col + :delta RETURNING col`, so
-- each money column gets a SECURITY DEFINER function that does the read and the
-- write in one statement. These are called by server routes holding the service
-- role; EXECUTE is revoked from public/anon/authenticated and granted only to
-- service_role, matching redeem_comps / issue_manual_comp.
--
-- Invariants the JS was supposed to guard are enforced here and raise rather
-- than clamp: a deduction larger than the balance fails loudly and the whole
-- statement rolls back, instead of silently writing a negative or wrapping.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. commander_members: comp_balance / lifetime totals / prepaid minutes.
--    One function covers every member money mutation because several call sites
--    move more than one of these columns in a single update and must not be
--    able to half-apply.
create or replace function public.commander_adjust_member_balances(
  p_member_id       uuid,
  p_comp_delta      numeric default 0,
  p_time_delta      integer default 0,
  p_earned_delta    numeric default 0,
  p_redeemed_delta  numeric default 0
)
returns public.commander_members
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.commander_members;
begin
  if p_member_id is null then
    raise exception 'commander_adjust_member_balances: p_member_id is required'
      using errcode = '22023';
  end if;

  update public.commander_members m
     set comp_balance           = round(coalesce(m.comp_balance, 0) + coalesce(p_comp_delta, 0), 2),
         comp_lifetime_earned   = round(coalesce(m.comp_lifetime_earned, 0) + coalesce(p_earned_delta, 0), 2),
         comp_lifetime_redeemed = round(coalesce(m.comp_lifetime_redeemed, 0) + coalesce(p_redeemed_delta, 0), 2),
         time_balance_minutes   = coalesce(m.time_balance_minutes, 0) + coalesce(p_time_delta, 0),
         updated_at             = now()
   where m.id = p_member_id
  returning m.* into v_row;

  if v_row.id is null then
    raise exception 'commander_adjust_member_balances: member % not found', p_member_id
      using errcode = 'P0002';
  end if;

  if v_row.comp_balance < 0 then
    raise exception 'commander_adjust_member_balances: comp balance for member % would go negative (delta %, balance before %)',
      p_member_id, coalesce(p_comp_delta, 0), v_row.comp_balance - coalesce(p_comp_delta, 0)
      using errcode = 'P0001';
  end if;

  if v_row.time_balance_minutes < 0 then
    raise exception 'commander_adjust_member_balances: prepaid minutes for member % would go negative (delta %, balance before %)',
      p_member_id, coalesce(p_time_delta, 0), v_row.time_balance_minutes - coalesce(p_time_delta, 0)
      using errcode = 'P0001';
  end if;

  if v_row.comp_lifetime_earned < 0 or v_row.comp_lifetime_redeemed < 0 then
    raise exception 'commander_adjust_member_balances: lifetime comp totals for member % would go negative', p_member_id
      using errcode = 'P0001';
  end if;

  return v_row;
end
$fn$;

-- 2. Seating drains the whole prepaid balance onto the session clock. Reading
--    the balance and then setting it to 0 in two statements lets two concurrent
--    seat requests each allocate the full balance — the player gets the minutes
--    twice. Lock, read and zero in one transaction, returning what was claimed
--    so the caller allocates exactly that.
create or replace function public.commander_claim_member_time_minutes(
  p_member_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_claimed integer;
  v_exists  boolean;
begin
  if p_member_id is null then
    raise exception 'commander_claim_member_time_minutes: p_member_id is required'
      using errcode = '22023';
  end if;

  select true, coalesce(m.time_balance_minutes, 0)
    into v_exists, v_claimed
    from public.commander_members m
   where m.id = p_member_id
     for update;

  if not coalesce(v_exists, false) then
    raise exception 'commander_claim_member_time_minutes: member % not found', p_member_id
      using errcode = 'P0002';
  end if;

  if v_claimed < 0 then
    raise exception 'commander_claim_member_time_minutes: member % has a negative prepaid balance (%)',
      p_member_id, v_claimed
      using errcode = 'P0001';
  end if;

  update public.commander_members m
     set time_balance_minutes = 0,
         updated_at           = now()
   where m.id = p_member_id;

  return v_claimed;
end
$fn$;

-- 3. commander_table_sessions.time_added_minutes — minutes bought onto a live
--    table clock. Same defect, same shape.
create or replace function public.commander_adjust_session_added_minutes(
  p_session_id uuid,
  p_delta      integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_new integer;
begin
  if p_session_id is null then
    raise exception 'commander_adjust_session_added_minutes: p_session_id is required'
      using errcode = '22023';
  end if;

  update public.commander_table_sessions s
     set time_added_minutes = coalesce(s.time_added_minutes, 0) + coalesce(p_delta, 0),
         updated_at         = now()
   where s.id = p_session_id
  returning s.time_added_minutes into v_new;

  if v_new is null then
    raise exception 'commander_adjust_session_added_minutes: session % not found', p_session_id
      using errcode = 'P0002';
  end if;

  if v_new < 0 then
    raise exception 'commander_adjust_session_added_minutes: added minutes for session % would go negative (delta %, before %)',
      p_session_id, coalesce(p_delta, 0), v_new - coalesce(p_delta, 0)
      using errcode = 'P0001';
  end if;

  return v_new;
end
$fn$;

-- 4. commander_table_sessions.amount_paid — cash taken against a time-billed
--    session.
create or replace function public.commander_adjust_table_session_payment(
  p_session_id uuid,
  p_delta      numeric
)
returns public.commander_table_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.commander_table_sessions;
begin
  if p_session_id is null then
    raise exception 'commander_adjust_table_session_payment: p_session_id is required'
      using errcode = '22023';
  end if;

  update public.commander_table_sessions s
     set amount_paid = round(coalesce(s.amount_paid, 0) + coalesce(p_delta, 0), 2),
         updated_at  = now()
   where s.id = p_session_id
  returning s.* into v_row;

  if v_row.id is null then
    raise exception 'commander_adjust_table_session_payment: session % not found', p_session_id
      using errcode = 'P0002';
  end if;

  if v_row.amount_paid < 0 then
    raise exception 'commander_adjust_table_session_payment: amount_paid for session % would go negative (delta %, before %)',
      p_session_id, coalesce(p_delta, 0), v_row.amount_paid - coalesce(p_delta, 0)
      using errcode = 'P0001';
  end if;

  return v_row;
end
$fn$;

-- 5. Ending a session twice refunds the unused minutes twice. Atomic arithmetic
--    alone does not fix that — the refund must happen only for the caller that
--    actually performs the active -> ended transition. This claims the
--    transition and returns the row it ended, or NULL if somebody else already
--    ended it, so the loser skips the refund and the auto-comp.
create or replace function public.commander_end_table_session(
  p_session_id uuid,
  p_ended_by   text default null
)
returns public.commander_table_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.commander_table_sessions;
begin
  if p_session_id is null then
    raise exception 'commander_end_table_session: p_session_id is required'
      using errcode = '22023';
  end if;

  update public.commander_table_sessions s
     set status     = 'ended',
         ended_at   = now(),
         ended_by   = coalesce(p_ended_by, s.ended_by),
         updated_at = now()
   where s.id = p_session_id
     and s.status <> 'ended'
  returning s.* into v_row;

  -- v_row.id is NULL when the row was already ended (or does not exist); the
  -- caller treats that as "somebody else ended it" and does not pay out again.
  return v_row;
end
$fn$;

revoke execute on function public.commander_adjust_member_balances(uuid, numeric, integer, numeric, numeric)  from public, anon, authenticated;
revoke execute on function public.commander_claim_member_time_minutes(uuid)                                   from public, anon, authenticated;
revoke execute on function public.commander_adjust_session_added_minutes(uuid, integer)                        from public, anon, authenticated;
revoke execute on function public.commander_adjust_table_session_payment(uuid, numeric)                        from public, anon, authenticated;
revoke execute on function public.commander_end_table_session(uuid, text)                                      from public, anon, authenticated;

grant execute on function public.commander_adjust_member_balances(uuid, numeric, integer, numeric, numeric)    to service_role;
grant execute on function public.commander_claim_member_time_minutes(uuid)                                     to service_role;
grant execute on function public.commander_adjust_session_added_minutes(uuid, integer)                          to service_role;
grant execute on function public.commander_adjust_table_session_payment(uuid, numeric)                          to service_role;
grant execute on function public.commander_end_table_session(uuid, text)                                        to service_role;

-- ── post-condition ───────────────────────────────────────────────────────────
do $post$
declare
  v_expected text[] := array[
    'commander_adjust_member_balances',
    'commander_claim_member_time_minutes',
    'commander_adjust_session_added_minutes',
    'commander_adjust_table_session_payment',
    'commander_end_table_session'
  ];
  v_name text;
  v_oid  oid;
begin
  foreach v_name in array v_expected loop
    select p.oid into v_oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;

    if v_oid is null then
      raise exception 'post-condition failed: function public.% was not created', v_name;
    end if;

    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'post-condition failed: public.% is not SECURITY DEFINER', v_name;
    end if;

    if not ((select coalesce(proconfig, '{}') from pg_proc where oid = v_oid) @> array['search_path=public, pg_temp']) then
      raise exception 'post-condition failed: public.% does not pin search_path (got %)',
        v_name, (select proconfig from pg_proc where oid = v_oid);
    end if;

    if exists (
      select 1
        from pg_proc p, aclexplode(p.proacl) a
        join pg_roles r on r.oid = a.grantee
       where p.oid = v_oid
         and a.privilege_type = 'EXECUTE'
         and r.rolname in ('anon', 'authenticated')
    ) then
      raise exception 'post-condition failed: public.% is executable by anon or authenticated', v_name;
    end if;

    if exists (
      select 1
        from pg_proc p, aclexplode(p.proacl) a
       where p.oid = v_oid
         and a.privilege_type = 'EXECUTE'
         and a.grantee = 0  -- 0 == PUBLIC
    ) then
      raise exception 'post-condition failed: public.% is executable by PUBLIC', v_name;
    end if;

    if not exists (
      select 1
        from pg_proc p, aclexplode(p.proacl) a
        join pg_roles r on r.oid = a.grantee
       where p.oid = v_oid
         and a.privilege_type = 'EXECUTE'
         and r.rolname = 'service_role'
    ) then
      raise exception 'post-condition failed: public.% is not executable by service_role', v_name;
    end if;
  end loop;

  raise notice 'commander_money_atomic_adjustments: all 5 functions present, SECURITY DEFINER, search_path pinned, service_role only';
end
$post$;