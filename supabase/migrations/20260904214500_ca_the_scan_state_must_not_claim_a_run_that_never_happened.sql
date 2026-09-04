-- =====================================================================
-- The scan state claimed a successful run that never happened.
-- Project kuklfnapbkmacvwxktbh (Postgres 17). Tier 2.
--
-- WHAT WAS WRONG
--
-- 20260904210000's assertion block PROVES the advance rule by calling
-- fn_ca_collusion_scan_advance twice - once with a rewound timestamp,
-- once with a future one - and checking the mark refuses both. That is
-- the right thing to assert. But `advance` also sets last_success_at,
-- so the assertions left the state reporting a successful scan at the
-- moment the migration applied.
--
-- The consequence is precisely the thing PHASE5-CONTRACTS section 0
-- rule 1 exists to prevent: fn_ca_collusion_detector_health answered
--
--     "status": "live", "stale": false
--
-- for a detector that had not run since 2026-09-03 and whose fixed code
-- was still in a pull request. The one honest field in the same payload
-- contradicted it - newest_finding_at was 2026-08-28 - and an operator
-- reading a green light does not go looking for the field that
-- disagrees with it.
--
-- A detector that has never run must read `never_run`, not `live`. That
-- is not a cosmetic difference: `never_run` sends somebody to look, and
-- `live` sends them away.
--
-- THE FIX
--
-- Clear the three fields the assertions wrote, so health tells the
-- truth until the fixed scan genuinely completes one. last_window_end
-- is LEFT ALONE - it is the mark, it was seeded deliberately at
-- now() - 30 minutes, and moving it back would hand the first real run
-- an unbounded catch-up.
--
-- WHY THE ORIGINAL MIGRATION IS NOT EDITED. It is applied and
-- registered; a change to an applied migration is a new migration, not
-- an edit. The assertion pattern is corrected here for anybody who
-- copies it: an assertion that exercises a WRITE must undo what it
-- wrote, or the proof becomes a lie about state.
-- =====================================================================

begin;

set local lock_timeout = '3s';

update public.ca_collusion_scan_state
   set last_success_at    = null,
       last_duration_ms   = null,
       last_scanned_hands = null,
       last_findings      = null,
       last_budget_hit    = false,
       updated_at         = now();

do $assert$
declare
  v_health jsonb;
begin
  v_health := public.fn_ca_collusion_detector_health();

  -- The whole point. Until the fixed scan runs, health must say so.
  if (v_health ->> 'status') <> 'never_run' then
    raise exception 'ASSERT FAILED: health says %, but no scan has completed since the fix. A green light nobody earned is worse than a red one.',
      v_health ->> 'status';
  end if;
  if (v_health ->> 'stale') <> 'true' then
    raise exception 'ASSERT FAILED: a detector that has never run is not fresh';
  end if;
  raise notice 'ASSERT OK: health reports never_run, which is the truth until the fixed scan completes one.';

  -- And the mark must NOT have been rewound: the first real run stays
  -- bounded.
  if (select last_window_end from public.ca_collusion_scan_state limit 1)
     < now() - interval '2 hours' then
    raise exception 'ASSERT FAILED: the mark was moved backwards, so the first run would face an unbounded catch-up';
  end if;
  raise notice 'ASSERT OK: the mark is untouched, so the first run reads a short window.';
end
$assert$;

commit;

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- There is nothing to roll back to that is better: the prior state
-- asserted a successful run that never occurred. If this must be
-- undone, set last_success_at to a timestamp you can actually justify.
-- =====================================================================
