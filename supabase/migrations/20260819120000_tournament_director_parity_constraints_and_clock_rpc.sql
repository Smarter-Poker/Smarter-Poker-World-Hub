-- Tournament Director Parity: Constraint Repairs + Atomic Clock Write RPC
-- Applied To Production Via Supabase MCP apply_migration On 2026-08-19.
--
-- 1) commander_tournament_entries.status: code emits 'alternate' (waitlist) and
--    'cashed' (paid ITM finisher) but the CHECK rejected them. Both added.
-- 2) commander_tournaments.tournament_type: the archived 20260215 migration adding
--    'pko' was never applied to production (verified live). 'pko' and 'deepstack' added.
-- 3) commander_clock_write(): single-statement atomic write of settings.clock_state
--    plus optional status/current_level/actual_start/ended_at. Replaces the
--    read-modify-write of the whole settings blob in clock.js, floor-view.js,
--    hand-for-hand.js, message.js and final-table.js, which lost updates when
--    two TD tablets acted at once.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM commander_tournament_entries
             WHERE status NOT IN ('registered','seated','active','eliminated','winner','bagged','alternate','cashed')) THEN
    RAISE EXCEPTION 'commander_tournament_entries has status values outside the new allowed set';
  END IF;
  IF EXISTS (SELECT 1 FROM commander_tournaments
             WHERE tournament_type NOT IN ('freezeout','rebuy','bounty','satellite','shootout','turbo','hyper','pko','deepstack')) THEN
    RAISE EXCEPTION 'commander_tournaments has tournament_type values outside the new allowed set';
  END IF;
END $$;

ALTER TABLE commander_tournament_entries DROP CONSTRAINT commander_tournament_entries_status_check;
ALTER TABLE commander_tournament_entries ADD CONSTRAINT commander_tournament_entries_status_check
  CHECK (status = ANY (ARRAY['registered'::text,'seated'::text,'active'::text,'eliminated'::text,'winner'::text,'bagged'::text,'alternate'::text,'cashed'::text]));

ALTER TABLE commander_tournaments DROP CONSTRAINT commander_tournaments_tournament_type_check;
ALTER TABLE commander_tournaments ADD CONSTRAINT commander_tournaments_tournament_type_check
  CHECK (tournament_type = ANY (ARRAY['freezeout'::text,'rebuy'::text,'bounty'::text,'satellite'::text,'shootout'::text,'turbo'::text,'hyper'::text,'pko'::text,'deepstack'::text]));

CREATE OR REPLACE FUNCTION commander_clock_write(
  p_tournament_id uuid,
  p_clock_state jsonb,
  p_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  UPDATE commander_tournaments SET
    settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{clock_state}', COALESCE(p_clock_state, 'null'::jsonb)),
    status = COALESCE(p_updates->>'status', status),
    current_level = COALESCE((p_updates->>'current_level')::integer, current_level),
    actual_start = COALESCE((p_updates->>'actual_start')::timestamptz, actual_start),
    ended_at = COALESCE((p_updates->>'ended_at')::timestamptz, ended_at),
    updated_at = now()
  WHERE id = p_tournament_id
  RETURNING to_jsonb(commander_tournaments.*) INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Tournament % not found', p_tournament_id;
  END IF;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION commander_clock_write(uuid, jsonb, jsonb) FROM anon, authenticated;

-- Post-Apply Assertions
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'commander_clock_write') <> 1 THEN
    RAISE EXCEPTION 'commander_clock_write not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commander_tournaments_tournament_type_check'
      AND pg_get_constraintdef(oid) LIKE '%pko%'
  ) THEN
    RAISE EXCEPTION 'tournament_type check missing pko';
  END IF;
END $$;

-- ROLLBACK (Tier 3 Record):
-- DROP FUNCTION IF EXISTS commander_clock_write(uuid, jsonb, jsonb);
-- ALTER TABLE commander_tournament_entries DROP CONSTRAINT commander_tournament_entries_status_check;
-- ALTER TABLE commander_tournament_entries ADD CONSTRAINT commander_tournament_entries_status_check
--   CHECK (status = ANY (ARRAY['registered','seated','active','eliminated','winner','bagged']));
-- ALTER TABLE commander_tournaments DROP CONSTRAINT commander_tournaments_tournament_type_check;
-- ALTER TABLE commander_tournaments ADD CONSTRAINT commander_tournaments_tournament_type_check
--   CHECK (tournament_type = ANY (ARRAY['freezeout','rebuy','bounty','satellite','shootout','turbo','hyper']));
