-- Mirrored from the live database on 2026-07-28. Applied via MCP as migration 20260728014141_add_commander_tables_to_realtime_publication.
-- Recorded here so a fresh 'supabase db reset' replays it and cannot silently reopen what it closed.

-- ═══════════════════════════════════════════════════════════════════════
-- Commander subscribes to 20 tables over Realtime. Only 6 were members of
-- the `supabase_realtime` publication, so the other 14 bindings could
-- never fire — the screens looked wired and silently never updated.
--
-- Publication membership is NOT an authorization grant. Realtime evaluates
-- the subscriber's RLS on every change before delivering it, so adding a
-- table here exposes nothing that a client could not already SELECT.
--
-- Only tables whose existing RLS actually permits a browser client to read
-- are added. Publishing a table nobody can SELECT would generate WAL
-- traffic and deliver nothing, which is worse than leaving it out.
--
-- ADDED (browser-reachable SELECT policy verified):
--   commander_tables             authenticated USING (true)
--   commander_venue_settings     PUBLIC USING (true)
--   commander_time_clock         PUBLIC USING (true)
--   club_arena_messages          PUBLIC USING (true)
--   commander_dealers            PUBLIC, scoped to the caller's staff venues
--   commander_incidents          PUBLIC, scoped to the caller's staff venues
--   commander_promotions         PUBLIC, active rows or the caller's venues
--   commander_staff              PUBLIC, own row or active staff
--   commander_club_announcements PUBLIC, scoped to group membership
--   club_arena_audit_logs        PUBLIC, own rows or admin
--
-- DELIBERATELY NOT ADDED — these carry a deny-all RLS policy
-- (`USING (false)` for `authenticated`) or are service-role-only, so a
-- browser subscription can never receive a row no matter what is
-- published. They are service-role-only tables by design and their
-- screens must keep using the API routes:
--   commander_floor_calls, commander_table_sessions,
--   commander_dealer_rotations, commander_streams, commander_members
--
-- That last group matters operationally. `commander_floor_calls` being
-- deny-all means FloorCallAlert's realtime path cannot deliver to a
-- browser at all — the 20-second poll added in the previous phase is not
-- a safety net behind realtime, it is the only live path. Recorded rather
-- than "fixed", because opening those tables to browser reads is an
-- authorization decision, not a wiring one.
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  added int := 0;
  targets text[] := ARRAY[
    'commander_tables','commander_venue_settings','commander_time_clock',
    'club_arena_messages','commander_dealers','commander_incidents',
    'commander_promotions','commander_staff','commander_club_announcements',
    'club_arena_audit_logs'];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.'||t) IS NULL THEN
      RAISE EXCEPTION 'target table public.% does not exist', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr
      JOIN pg_publication pub ON pub.oid = pr.prpubid
      WHERE pub.pubname = 'supabase_realtime'
        AND pr.prrelid = ('public.'||t)::regclass
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      added := added + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'added % table(s) to supabase_realtime', added;
END $$;

-- Post-condition: all ten must be members, and the five deliberately
-- excluded must NOT have been swept in.
DO $$
DECLARE
  missing text := '';
  wrongly_added text := '';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'commander_tables','commander_venue_settings','commander_time_clock',
    'club_arena_messages','commander_dealers','commander_incidents',
    'commander_promotions','commander_staff','commander_club_announcements',
    'club_arena_audit_logs']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_publication pub ON pub.oid = pr.prpubid
      WHERE pub.pubname='supabase_realtime' AND pr.prrelid = ('public.'||t)::regclass
    ) THEN missing := missing || t || ' '; END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY[
    'commander_floor_calls','commander_table_sessions',
    'commander_dealer_rotations','commander_streams','commander_members']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_publication pub ON pub.oid = pr.prpubid
      WHERE pub.pubname='supabase_realtime' AND pr.prrelid = ('public.'||t)::regclass
    ) THEN wrongly_added := wrongly_added || t || ' '; END IF;
  END LOOP;

  IF missing <> '' OR wrongly_added <> '' THEN
    RAISE EXCEPTION 'post-condition failed. missing: [%]; wrongly added: [%]', missing, wrongly_added;
  END IF;
END $$;
