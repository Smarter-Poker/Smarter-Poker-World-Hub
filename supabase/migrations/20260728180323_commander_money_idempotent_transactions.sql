-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728180323_commander_money_idempotent_transactions.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- ─────────────────────────────────────────────────────────────────────────────
-- Club Commander: idempotent money transactions
--
-- Each function writes its ledger row and applies its balance change inside one
-- transaction, with the ledger insert FIRST. When a client-supplied
-- idempotency_key collides with the partial unique index, unique_violation is
-- caught, the sub-block's savepoint is rolled back (so no balance moved) and
-- the ORIGINAL transaction is returned with replayed = true. A retry is
-- therefore indistinguishable from the first call, which is the point.
--
-- p_idempotency_key NULL keeps the previous at-least-once behaviour, so callers
-- that do not send a key are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Cash-game session buy-in ──────────────────────────────────────────────
-- NOTE: commander_buyin_transactions.venue_id is uuid while
-- commander_player_sessions.venue_id is integer. The route has always passed
-- the integer straight through, so PostgREST rejected every insert and no
-- buy-in has ever been logged (the table has 0 rows). venue_id is nullable, so
-- this writes the row without it rather than continuing to drop the row
-- entirely; the column type mismatch is reported separately and not changed
-- here, because altering a live column is out of scope for this migration.
create or replace function public.commander_txn_session_buyin(
  p_session_id       uuid,
  p_amount           numeric,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_session public.commander_player_sessions;
  v_txn     public.commander_buyin_transactions;
  v_total   integer;
begin
  if p_session_id is null then
    raise exception 'commander_txn_session_buyin: p_session_id is required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'commander_txn_session_buyin: p_amount must be a positive number (got %)', p_amount
      using errcode = '22023';
  end if;

  select * into v_session from public.commander_player_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'commander_txn_session_buyin: session % not found', p_session_id using errcode = 'P0002';
  end if;
  if v_session.status is distinct from 'active' then
    raise exception 'commander_txn_session_buyin: session % is not active (status %)', p_session_id, v_session.status
      using errcode = 'P0001';
  end if;

  begin
    insert into public.commander_buyin_transactions
      (session_id, player_id, amount, transaction_type, idempotency_key)
    values
      (p_session_id, v_session.player_id, p_amount, 'buyin', p_idempotency_key)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn
      from public.commander_buyin_transactions
     where idempotency_key = p_idempotency_key;
    if v_txn.id is null then raise; end if;
    select * into v_session from public.commander_player_sessions where id = p_session_id;
    return jsonb_build_object(
      'replayed', true,
      'session', to_jsonb(v_session),
      'transaction', to_jsonb(v_txn),
      'new_total', v_session.total_buyin
    );
  end;

  update public.commander_player_sessions s
     set total_buyin = coalesce(s.total_buyin, 0) + round(p_amount)::integer
   where s.id = p_session_id
  returning s.total_buyin into v_total;

  if v_total < 0 then
    raise exception 'commander_txn_session_buyin: total_buyin for session % would go negative', p_session_id
      using errcode = 'P0001';
  end if;

  select * into v_session from public.commander_player_sessions where id = p_session_id;

  return jsonb_build_object(
    'replayed', false,
    'session', to_jsonb(v_session),
    'transaction', to_jsonb(v_txn),
    'new_total', v_total
  );
end
$fn$;

-- ── 2. Tournament rebuy ───────────────────────────────────────────────────────
-- The max-rebuys check moves into the UPDATE predicate, so two concurrent
-- rebuys can no longer both read rebuy_count = max - 1 and both be allowed.
create or replace function public.commander_txn_tournament_rebuy(
  p_entry_id         uuid,
  p_tournament_id    uuid,
  p_chips            integer,
  p_max_rebuys       integer,
  p_level            integer default 0,
  p_venue_id         integer default null,
  p_amount           numeric default 0,
  p_player_name      text    default null,
  p_processed_by     uuid    default null,
  p_idempotency_key  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry public.commander_tournament_entries;
  v_txn   public.commander_cash_transactions;
begin
  if p_entry_id is null or p_tournament_id is null then
    raise exception 'commander_txn_tournament_rebuy: p_entry_id and p_tournament_id are required'
      using errcode = '22023';
  end if;
  if p_chips is null or p_chips <= 0 then
    raise exception 'commander_txn_tournament_rebuy: p_chips must be positive (got %)', p_chips
      using errcode = '22023';
  end if;

  if coalesce(p_amount, 0) > 0 then
    begin
      insert into public.commander_cash_transactions
        (venue_id, player_name, type, amount, payment_method, processed_by, notes, idempotency_key)
      values
        (p_venue_id, coalesce(p_player_name, 'Unknown'), 'buy_in', p_amount, 'cash', p_processed_by,
         'Tournament Rebuy: ' || coalesce(p_player_name, 'Unknown') || ' (ID: ' || p_entry_id::text || ')',
         p_idempotency_key)
      returning * into v_txn;
    exception when unique_violation then
      select * into v_txn from public.commander_cash_transactions where idempotency_key = p_idempotency_key;
      if v_txn.id is null then raise; end if;
      select * into v_entry from public.commander_tournament_entries where id = p_entry_id;
      return jsonb_build_object('replayed', true, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
    end;
  end if;

  update public.commander_tournament_entries e
     set current_chips = coalesce(e.current_chips, 0) + p_chips,
         rebuy_count   = coalesce(e.rebuy_count, 0) + 1,
         status        = 'active',
         metadata      = coalesce(e.metadata, '{}'::jsonb)
                         || jsonb_build_object('last_rebuy_at', now(), 'last_rebuy_level', p_level)
   where e.id = p_entry_id
     and e.tournament_id = p_tournament_id
     and e.status is distinct from 'eliminated'
     and coalesce(e.rebuy_count, 0) < coalesce(p_max_rebuys, 999)
  returning e.* into v_entry;

  if v_entry.id is null then
    -- Nothing was updated. Say which precondition failed rather than returning a
    -- silent success, and roll the ledger insert back with the exception.
    select * into v_entry from public.commander_tournament_entries
     where id = p_entry_id and tournament_id = p_tournament_id;
    if v_entry.id is null then
      raise exception 'commander_txn_tournament_rebuy: entry % not found in tournament %', p_entry_id, p_tournament_id
        using errcode = 'P0002';
    elsif v_entry.status = 'eliminated' then
      raise exception 'commander_txn_tournament_rebuy: entry % is eliminated', p_entry_id using errcode = 'P0001';
    else
      raise exception 'commander_txn_tournament_rebuy: entry % has reached the maximum of % rebuys',
        p_entry_id, coalesce(p_max_rebuys, 999) using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('replayed', false, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
end
$fn$;

-- ── 3. Tournament add-on ───────────────────────────────────────────────────────
-- addon_taken is a one-time flag; checking it in JS and setting it in a second
-- statement let two concurrent add-ons both pass the check and both add chips.
-- The flag check is now the UPDATE predicate.
create or replace function public.commander_txn_tournament_addon(
  p_entry_id         uuid,
  p_tournament_id    uuid,
  p_chips            integer,
  p_venue_id         integer default null,
  p_amount           numeric default 0,
  p_player_name      text    default null,
  p_processed_by     uuid    default null,
  p_idempotency_key  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_entry public.commander_tournament_entries;
  v_txn   public.commander_cash_transactions;
begin
  if p_entry_id is null or p_tournament_id is null then
    raise exception 'commander_txn_tournament_addon: p_entry_id and p_tournament_id are required'
      using errcode = '22023';
  end if;
  if p_chips is null or p_chips <= 0 then
    raise exception 'commander_txn_tournament_addon: p_chips must be positive (got %)', p_chips
      using errcode = '22023';
  end if;

  if coalesce(p_amount, 0) > 0 then
    begin
      insert into public.commander_cash_transactions
        (venue_id, player_name, type, amount, payment_method, processed_by, notes, idempotency_key)
      values
        (p_venue_id, coalesce(p_player_name, 'Unknown'), 'buy_in', p_amount, 'cash', p_processed_by,
         'Tournament Add-on: ' || coalesce(p_player_name, 'Unknown') || ' (ID: ' || p_entry_id::text || ')',
         p_idempotency_key)
      returning * into v_txn;
    exception when unique_violation then
      select * into v_txn from public.commander_cash_transactions where idempotency_key = p_idempotency_key;
      if v_txn.id is null then raise; end if;
      select * into v_entry from public.commander_tournament_entries where id = p_entry_id;
      return jsonb_build_object('replayed', true, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
    end;
  end if;

  update public.commander_tournament_entries e
     set current_chips = coalesce(e.current_chips, 0) + p_chips,
         addon_taken   = true,
         metadata      = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object('addon_at', now())
   where e.id = p_entry_id
     and e.tournament_id = p_tournament_id
     and e.status in ('active', 'seated')
     and coalesce(e.addon_taken, false) = false
  returning e.* into v_entry;

  if v_entry.id is null then
    select * into v_entry from public.commander_tournament_entries
     where id = p_entry_id and tournament_id = p_tournament_id;
    if v_entry.id is null then
      raise exception 'commander_txn_tournament_addon: entry % not found in tournament %', p_entry_id, p_tournament_id
        using errcode = 'P0002';
    elsif coalesce(v_entry.addon_taken, false) then
      raise exception 'commander_txn_tournament_addon: entry % has already taken their add-on', p_entry_id
        using errcode = 'P0001';
    else
      raise exception 'commander_txn_tournament_addon: entry % must be active to take an add-on (status %)',
        p_entry_id, v_entry.status using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object('replayed', false, 'entry', to_jsonb(v_entry), 'transaction', to_jsonb(v_txn));
end
$fn$;

-- ── 4. Prepaid time purchase ─────────────────────────────────────────────────
-- p_session_id non-null means the buyer is seated: the minutes go onto the table
-- clock and the standing balance is unchanged (a strict transfer). Otherwise the
-- minutes are credited to the member's balance.
create or replace function public.commander_txn_member_time_purchase(
  p_member_id        uuid,
  p_minutes          integer,
  p_session_id       uuid    default null,
  p_venue_id         bigint  default null,
  p_amount_paid      numeric default null,
  p_payment_method   text    default null,
  p_purchased_by     text    default null,
  p_idempotency_key  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member   public.commander_members;
  v_txn      public.commander_time_purchases;
  v_prev     integer;
  v_new      integer;
  v_seated   boolean := p_session_id is not null;
begin
  if p_member_id is null then
    raise exception 'commander_txn_member_time_purchase: p_member_id is required' using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'commander_txn_member_time_purchase: p_minutes must be positive (got %)', p_minutes
      using errcode = '22023';
  end if;

  select * into v_member from public.commander_members where id = p_member_id;
  if v_member.id is null then
    raise exception 'commander_txn_member_time_purchase: member % not found', p_member_id using errcode = 'P0002';
  end if;
  v_prev := coalesce(v_member.time_balance_minutes, 0);

  begin
    insert into public.commander_time_purchases
      (venue_id, member_id, minutes_purchased, amount_paid, payment_method, purchased_by, idempotency_key)
    values
      (p_venue_id, p_member_id, p_minutes, p_amount_paid, p_payment_method, p_purchased_by, p_idempotency_key)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn from public.commander_time_purchases where idempotency_key = p_idempotency_key;
    if v_txn.id is null then raise; end if;
    select * into v_member from public.commander_members where id = p_member_id;
    return jsonb_build_object(
      'replayed', true,
      'member', to_jsonb(v_member),
      'transaction', to_jsonb(v_txn),
      'previous_balance', coalesce(v_member.time_balance_minutes, 0),
      'new_balance', coalesce(v_member.time_balance_minutes, 0),
      'added_to_active_session', v_seated
    );
  end;

  if v_seated then
    -- Minutes land on the table clock; the standing balance does not move.
    perform public.commander_adjust_session_added_minutes(p_session_id, p_minutes);
    v_new := v_prev;
    update public.commander_members m set updated_at = now() where m.id = p_member_id;
    select * into v_member from public.commander_members where id = p_member_id;
  else
    v_member := public.commander_adjust_member_balances(p_member_id, 0, p_minutes, 0, 0);
    v_new := coalesce(v_member.time_balance_minutes, 0);
  end if;

  return jsonb_build_object(
    'replayed', false,
    'member', to_jsonb(v_member),
    'transaction', to_jsonb(v_txn),
    'previous_balance', v_prev,
    'new_balance', v_new,
    'added_to_active_session', v_seated
  );
end
$fn$;

-- ── 5. Comp award / void ───────────────────────────────────────────────────────
-- Covers all four comp write paths in pages/api/comps/balances.js (membership,
-- free time, dollar award, void) because each moves a different combination of
-- comp_balance / lifetime totals / prepaid minutes and none of them may
-- half-apply against the ledger row.
create or replace function public.commander_txn_award_comp(
  p_member_id        uuid,
  p_venue_id         integer,
  p_log_amount       numeric,
  p_comp_delta       numeric default 0,
  p_time_delta       integer default 0,
  p_earned_delta     numeric default 0,
  p_redeemed_delta   numeric default 0,
  p_type             text    default 'award',
  p_reason           text    default null,
  p_authorized_by    text    default null,
  p_authorized_pin   boolean default false,
  p_processed_by     uuid    default null,
  p_comp_category    text    default null,
  p_notes            text    default null,
  p_idempotency_key  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_member public.commander_members;
  v_txn    public.commander_member_comp_log;
begin
  if p_member_id is null or p_venue_id is null then
    raise exception 'commander_txn_award_comp: p_member_id and p_venue_id are required' using errcode = '22023';
  end if;

  begin
    insert into public.commander_member_comp_log
      (venue_id, member_id, amount, type, reason, authorized_by, authorized_pin,
       processed_by, balance_after, comp_category, notes, idempotency_key)
    values
      (p_venue_id, p_member_id, coalesce(p_log_amount, 0), coalesce(p_type, 'award'), p_reason,
       p_authorized_by, coalesce(p_authorized_pin, false), p_processed_by,
       0, p_comp_category, p_notes, p_idempotency_key)
    returning * into v_txn;
  exception when unique_violation then
    select * into v_txn from public.commander_member_comp_log where idempotency_key = p_idempotency_key;
    if v_txn.id is null then raise; end if;
    select * into v_member from public.commander_members where id = p_member_id;
    return jsonb_build_object('replayed', true, 'member', to_jsonb(v_member), 'transaction', to_jsonb(v_txn));
  end;

  v_member := public.commander_adjust_member_balances(
    p_member_id, p_comp_delta, p_time_delta, p_earned_delta, p_redeemed_delta
  );

  -- balance_after is only knowable once the balance has actually moved.
  update public.commander_member_comp_log l
     set balance_after = v_member.comp_balance
   where l.id = v_txn.id
  returning l.* into v_txn;

  return jsonb_build_object('replayed', false, 'member', to_jsonb(v_member), 'transaction', to_jsonb(v_txn));
end
$fn$;

revoke execute on function public.commander_txn_session_buyin(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public.commander_txn_tournament_rebuy(uuid, uuid, integer, integer, integer, integer, numeric, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.commander_txn_tournament_addon(uuid, uuid, integer, integer, numeric, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.commander_txn_member_time_purchase(uuid, integer, uuid, bigint, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.commander_txn_award_comp(uuid, integer, numeric, numeric, integer, numeric, numeric, text, text, text, boolean, uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.commander_txn_session_buyin(uuid, numeric, text) to service_role;
grant execute on function public.commander_txn_tournament_rebuy(uuid, uuid, integer, integer, integer, integer, numeric, text, uuid, text) to service_role;
grant execute on function public.commander_txn_tournament_addon(uuid, uuid, integer, integer, numeric, text, uuid, text) to service_role;
grant execute on function public.commander_txn_member_time_purchase(uuid, integer, uuid, bigint, numeric, text, text, text) to service_role;
grant execute on function public.commander_txn_award_comp(uuid, integer, numeric, numeric, integer, numeric, numeric, text, text, text, boolean, uuid, text, text, text) to service_role;

-- ── post-condition ───────────────────────────────────────────────────────────
do $post$
declare
  v_expected text[] := array[
    'commander_txn_session_buyin',
    'commander_txn_tournament_rebuy',
    'commander_txn_tournament_addon',
    'commander_txn_member_time_purchase',
    'commander_txn_award_comp'
  ];
  v_name text;
  v_oid  oid;
begin
  foreach v_name in array v_expected loop
    select p.oid into v_oid
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_name;

    if v_oid is null then
      raise exception 'post-condition failed: function public.% was not created', v_name;
    end if;
    if not (select prosecdef from pg_proc where oid = v_oid) then
      raise exception 'post-condition failed: public.% is not SECURITY DEFINER', v_name;
    end if;
    if not ((select coalesce(proconfig, '{}') from pg_proc where oid = v_oid) @> array['search_path=public, pg_temp']) then
      raise exception 'post-condition failed: public.% does not pin search_path', v_name;
    end if;
    if exists (
      select 1 from pg_proc p, aclexplode(p.proacl) a
       where p.oid = v_oid and a.privilege_type = 'EXECUTE' and a.grantee = 0
    ) then
      raise exception 'post-condition failed: public.% is executable by PUBLIC', v_name;
    end if;
    if exists (
      select 1 from pg_proc p, aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
       where p.oid = v_oid and a.privilege_type = 'EXECUTE' and r.rolname in ('anon', 'authenticated')
    ) then
      raise exception 'post-condition failed: public.% is executable by anon or authenticated', v_name;
    end if;
    if not exists (
      select 1 from pg_proc p, aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
       where p.oid = v_oid and a.privilege_type = 'EXECUTE' and r.rolname = 'service_role'
    ) then
      raise exception 'post-condition failed: public.% is not executable by service_role', v_name;
    end if;
  end loop;

  raise notice 'commander_money_idempotent_transactions: all 5 functions present, SECURITY DEFINER, service_role only';
end
$post$;