-- ══════════════════════════════════════════════════════════════════════
--  PHASE 16A: HOME GROUP ↔ CLUB COMMANDER VENUE BRIDGE
-- ══════════════════════════════════════════════════════════════════════
--
--  THE PRODUCT VISION
--
--    The host announces the night: push notification goes to every
--    follower of the home group — "Game starts at 7PM, reserve your
--    seat now." A follower taps the push → lands on the Table Tablet
--    view for that specific game → sees the 9-max poker table →
--    picks an open seat → it locks with their name. Every other
--    follower watching the page sees the seat flip to "reserved
--    (Jenna)" in real time. When the host hits "Start Game," all
--    reserved seats become "occupied" (playing). Followers who don't
--    attend get the live spectator view — who's at the table, who's
--    on break — like a mini streaming dashboard for the home game.
--
--  THE BRIDGE
--
--    Every Club Commander tool — Table Tablet, seating, tournament
--    clock, Live Games feed — hangs off poker_venues.id (integer).
--    Home groups have zero linkage to that tree today; they live in
--    an entirely separate data island (commander_home_groups +
--    commander_home_games).
--
--    Rather than refactor every venue-scoped Commander tool to also
--    accept a home_group_id (polymorphism everywhere), this migration
--    introduces SHADOW venue + table rows per home group. Existing
--    tooling "just works" because it still sees a venue_id (int) +
--    table_id (uuid) — just with is_suppressed=true so PNM won't
--    surface it and the public never sees it.
--
--  WHAT THIS MIGRATION DOES
--
--    1. poker_venues.home_group_id (uuid, unique, FK CASCADE) — 1:1
--       link back to the home group.
--    2. poker_venues.commander_home_table_id (uuid) — denormalized
--       pointer to the default table for fast lookup.
--    3. fn_home_group_sync_venue(group_id) — upserts the shadow venue
--       AND its default commander_tables row. Idempotent. Called
--       whenever a group is created or its core attributes change.
--    4. AFTER INSERT / AFTER UPDATE OF (name, max_players, city, state)
--       triggers on commander_home_groups that call the sync fn.
--    5. Backfill loop runs the sync fn for every existing group.
--
--  PNM / SOCIAL PAGES ISOLATION
--
--    venue_type='home_group' does NOT collide with the existing
--    ck_poker_venues_not_home_game CHECK constraint (which blocks
--    'home_game'/'homegame'/'home-game' only).
--
--    Every shadow venue is created with is_suppressed=true. The Live
--    Games spectator endpoint and the Table Tablet endpoint both
--    need to respect that flag OR explicitly key off home_group_id
--    to retrieve the venue — that hardening lives in Phase 16D.
--
--    PNM is already leak-free: ck_poker_venues_not_home_game + any
--    existing is_suppressed filter in /api/poker/venues ensures home
--    groups cannot be discovered via "find a poker room near me."
--
--  SMOKE-TEST EVIDENCE (this session)
--
--    Backfill of 2 existing groups:
--      Saturday Night Poker Club → venue_id=3442, table fa636b9e…
--                                  max_seats=9 (matches max_players)
--      High Rollers Home Game    → venue_id=3443, table 13e41160…
--                                  max_seats=6
--
--    UPDATE trigger: changed group.max_players 9→8, table.max_seats
--    followed to 8 within the same transaction. Restored to 9.
--
--    INSERT trigger: new throwaway group "Phase16A Smoke Test Group"
--    (max_players=7) auto-got venue_id=3444 and a new 7-max table.
--
--    DELETE cascade: removing the smoke-test group wiped its venue
--    + table. Final counts: 2 groups, 2 shadow venues, 2 shadow
--    tables — all accounted for.
--
--  WHAT'S NEXT (Phase 16 Chunks B/C/D)
--
--    B. Reservation RPCs: fn_home_start_game (creates commander_games
--       + seats), fn_home_reserve_seat (concurrency-safe), fn_home_
--       release_seat, fn_home_confirm_all_reservations (host flips
--       reserved → occupied at game-start time).
--
--    C. Push broadcast: /api/commander/home-games/[id]/announce which
--       fans out to social_page_followers via OneSignal, with the
--       deeplink to the Table Tablet view for this game.
--
--    D. Table Tablet live view: /hub/home-games/{slug}/live with
--       Supabase Realtime subscription on commander_seats
--       (game_id=X) so every watching follower sees reservations
--       stream in instantly.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE poker_venues
    ADD COLUMN IF NOT EXISTS home_group_id uuid,
    ADD COLUMN IF NOT EXISTS commander_home_table_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ux_poker_venues_home_group_id
    ON poker_venues (home_group_id) WHERE home_group_id IS NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_poker_venues_home_group'
    ) THEN
        ALTER TABLE poker_venues
        ADD CONSTRAINT fk_poker_venues_home_group
        FOREIGN KEY (home_group_id) REFERENCES commander_home_groups(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_home_group_sync_venue(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_group       commander_home_groups%ROWTYPE;
    v_venue_id    integer;
    v_table_id    uuid;
    v_max_seats   integer;
BEGIN
    SELECT * INTO v_group FROM commander_home_groups WHERE id = p_group_id;
    IF v_group.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'group not found');
    END IF;

    v_max_seats := GREATEST(COALESCE(v_group.max_players, 9), 2);

    SELECT id INTO v_venue_id FROM poker_venues WHERE home_group_id = p_group_id;

    IF v_venue_id IS NULL THEN
        INSERT INTO poker_venues (
            name, venue_type, city, state, country,
            is_active, is_suppressed, commander_enabled,
            home_group_id, source
        ) VALUES (
            v_group.name, 'home_group',
            COALESCE(v_group.city, 'Unknown'),
            COALESCE(v_group.state, 'NA'),
            'US',
            true, true, true,
            p_group_id, 'home_group_shadow'
        ) RETURNING id INTO v_venue_id;
    ELSE
        UPDATE poker_venues
           SET name  = v_group.name,
               city  = COALESCE(v_group.city, city),
               state = COALESCE(v_group.state, state),
               is_active = true,
               is_suppressed = true,
               commander_enabled = true
         WHERE id = v_venue_id;
    END IF;

    SELECT id INTO v_table_id
      FROM commander_tables
     WHERE venue_id = v_venue_id AND table_number = 1
     LIMIT 1;

    IF v_table_id IS NULL THEN
        INSERT INTO commander_tables (
            venue_id, table_number, table_name, max_seats, status
        ) VALUES (
            v_venue_id, 1, 'Table 1', v_max_seats, 'available'
        ) RETURNING id INTO v_table_id;
    ELSE
        UPDATE commander_tables SET max_seats = v_max_seats WHERE id = v_table_id;
    END IF;

    UPDATE poker_venues SET commander_home_table_id = v_table_id WHERE id = v_venue_id;

    RETURN jsonb_build_object(
        'success', true, 'group_id', p_group_id,
        'venue_id', v_venue_id, 'table_id', v_table_id, 'max_seats', v_max_seats
    );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_home_group_sync_venue(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION fn_trg_home_group_sync_venue()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM fn_home_group_sync_venue(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_home_group_sync_venue_ins ON commander_home_groups;
CREATE TRIGGER trg_home_group_sync_venue_ins
AFTER INSERT ON commander_home_groups
FOR EACH ROW EXECUTE FUNCTION fn_trg_home_group_sync_venue();

DROP TRIGGER IF EXISTS trg_home_group_sync_venue_upd ON commander_home_groups;
CREATE TRIGGER trg_home_group_sync_venue_upd
AFTER UPDATE OF name, max_players, city, state ON commander_home_groups
FOR EACH ROW
WHEN (
    OLD.name IS DISTINCT FROM NEW.name
 OR OLD.max_players IS DISTINCT FROM NEW.max_players
 OR OLD.city IS DISTINCT FROM NEW.city
 OR OLD.state IS DISTINCT FROM NEW.state
)
EXECUTE FUNCTION fn_trg_home_group_sync_venue();

DO $$
DECLARE g RECORD; result jsonb;
BEGIN
    FOR g IN SELECT id, name FROM commander_home_groups LOOP
        result := fn_home_group_sync_venue(g.id);
        RAISE NOTICE 'Backfilled %: %', g.name, result;
    END LOOP;
END $$;
