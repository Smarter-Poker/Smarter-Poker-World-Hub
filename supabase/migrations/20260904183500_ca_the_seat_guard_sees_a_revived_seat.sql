-- =====================================================================
-- Phase 4 correction, part two: the seat guard learns about the revive
-- path. Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 3 migration.
--
-- THIS IS THE HALF THAT NEEDS A LOCK, AND THAT IS THE ONLY REASON IT IS
-- A SEPARATE FILE. The reasoning, the production measurements and the
-- defect it closes are all in 20260904183000, which fixed everything
-- that could be fixed without one.
--
-- In one paragraph: almost every seating on this platform is an UPDATE,
-- not an INSERT. Three of the five sanctioned seat creators revive a
-- vacated row (`SET left_at = NULL ... WHERE left_at IS NOT NULL`) and
-- only INSERT as a fallback, and 299,475 of 300,453 table_seats rows
-- carry a non-null left_at and are therefore revivable. A BEFORE INSERT
-- guard is unreachable for essentially every seat at any table somebody
-- has ever left.
--
-- APPLYING THIS FILE
-- CREATE TRIGGER takes ACCESS EXCLUSIVE on table_seats. Under normal
-- play the lock is refused within its 3s timeout, every time. Apply it
-- inside the :55 MAINTENANCE BREAK (CLAUDE.md section 13), when every
-- table is parked at a hand boundary and the platform is frozen.
--
-- DO NOT raise the lock_timeout to get past this. A long ACCESS
-- EXCLUSIVE wait on table_seats queues every seat, every buy-in and
-- every cash-out behind it - that is an outage, not a migration.
-- =====================================================================

begin;

set local lock_timeout = '3s';

-- The revive path. A SEPARATE trigger with a WHEN clause, so Postgres
-- evaluates the condition without calling the function: an ordinary
-- stack or sit-out update during a hand costs nothing at all.
--
-- The condition is "a seat that is becoming occupied": left_at going
-- null (the revive the three RPCs do), or the occupant changing while
-- the seat stays live. It deliberately does NOT fire when left_at is
-- already null and user_id is unchanged, which is every in-play write.
drop trigger if exists zz_restriction_seat_revive_guard on public.table_seats;
create trigger zz_restriction_seat_revive_guard
  before update of user_id, left_at on public.table_seats
  for each row
  when (new.left_at is null
        and (old.left_at is not null or old.user_id is distinct from new.user_id))
  execute function public.fn_ca_refuse_restricted_entry('cash');


do $assert$
declare
  v_n     int;
  v_first text;
begin
  select (t.tgtype & 16) into v_n from pg_trigger t
    join pg_class c on c.oid = t.tgrelid and c.relname = 'table_seats'
   where t.tgname = 'zz_restriction_seat_revive_guard';
  if coalesce(v_n, 0) = 0 then
    raise exception 'ASSERT FAILED: the revive guard does not fire on UPDATE';
  end if;
  raise notice 'ASSERT OK: the revive guard is attached and fires on UPDATE.';

  -- The freeze guards must still speak first: a platform freeze and a
  -- restriction are different refusals and the freeze is the one already
  -- in progress.
  select t.tgname into v_first from pg_trigger t
    join pg_class c on c.oid = t.tgrelid and c.relname = 'table_seats'
   where not t.tgisinternal and t.tgname like 'zz_%'
   order by t.tgname limit 1;
  if v_first not like 'zz_freeze%' then
    raise exception 'ASSERT FAILED: the first zz_ trigger on table_seats is %, not a freeze guard', v_first;
  end if;
  raise notice 'ASSERT OK: % still fires before the restriction guards.', v_first;

  if (select restrictions_enforced from public.ca_operator_policy limit 1) is not false then
    raise exception 'ASSERT FAILED: enforcement is not false';
  end if;
  raise notice 'ASSERT OK: enforcement is still off. The guard observes.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- begin;
--   set local lock_timeout = '5s';
--   drop trigger if exists zz_restriction_seat_revive_guard on public.table_seats;
-- commit;
--
-- Dropping it does not "make things safe": it returns the seat guard to
-- being unreachable for 99.7% of seats while continuing to report itself
-- as attached. If the revive guard is causing a problem, turn
-- ca_operator_policy.restrictions_enforced off - the guard then only
-- writes observations - before considering this.
-- =====================================================================
