-- Mirrored from the live database on 2026-07-27. Applied via MCP as migration 20260727230137_revoke_public_execute_on_treasury_functions.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.
-- Follow-up to the previous migration. Revoking from `anon` had no effect on
-- these because the EXECUTE grant is held by PUBLIC, which anon inherits.
-- The correct move is to drop the PUBLIC grant and re-grant only the role that
-- legitimately needs it: club-arena is a browser SPA that calls these with a
-- logged-in session, so `authenticated` is restored and `anon` is not.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fn_apply_credit_payment','fn_horse_fund_from_treasury','fn_horse_seat_from_treasury')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname in ('fn_apply_credit_payment','fn_horse_fund_from_treasury','fn_horse_seat_from_treasury')
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if bad is not null then raise exception 'anon still holds EXECUTE on: %', bad; end if;

  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname in ('fn_apply_credit_payment','fn_horse_fund_from_treasury','fn_horse_seat_from_treasury')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if bad is not null then raise exception 'authenticated lost EXECUTE on: % (would break club-arena)', bad; end if;
end $$;
