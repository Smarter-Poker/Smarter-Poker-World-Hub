-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_seed_club_shop_starter_catalog.sql
-- Tier 1 (data-only, no schema changes). Applied to production 2026-08-19 via
-- Supabase MCP apply_migration as `seed_club_shop_starter_catalog`.
--
-- WHY: The Club Arena marketplace rebuild (2026-08-19) shipped a fully wired
-- storefront, but club_shop_items contained a single placeholder row
-- ("Test Item") so the store rendered empty/fake. This seeds a sensible
-- starter catalog for every existing club so the shop is functional on day
-- one. Club owners can hide/delete/extend via the Manage tab (now wired to
-- /api/club-arena/manage-shop).
--
-- Idempotent: skips any (club, item name) that already exists.
-- Rollback: DELETE FROM club_shop_items WHERE description LIKE '%[starter]%';
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Retire the placeholder row (keep it for purchase-history FK integrity).
UPDATE club_shop_items
SET is_active = false
WHERE name = 'Test Item';

-- 2) Seed the starter catalog for every club.
WITH catalog(name, description, price, category, item_type) AS (
  VALUES
    ('Time Bank +30s',            'Adds 30 seconds of extra decision time at the table. [starter]',                2000,   'Time Banks',  'time_bank'),
    ('Time Bank Bundle (5x)',     'Five 30-second time bank extensions at a bundle discount. [starter]',           8000,   'Time Banks',  'time_bank'),
    ('Midnight Felt Table Skin',  'Sleek dark-blue felt with subtle card-suit pattern. [starter]',                 25000,  'Table Skins', 'table_skin'),
    ('Royal Gold Table Skin',     'Gold-trimmed premium felt for players with style. [starter]',                   50000,  'Table Skins', 'table_skin'),
    ('Tomato Pack (10)',          'Ten throwable tomatoes. Aim responsibly. [starter]',                            1500,   'Throwables',  'throwable'),
    ('Snowball Pack (10)',        'Ten throwable snowballs to cool down a heater. [starter]',                      1500,   'Throwables',  'throwable'),
    ('Golden Egg (3)',            'Three rare golden egg throwables for big moments. [starter]',                   5000,   'Throwables',  'throwable'),
    ('Classic Emote Pack',        'A set of classic table emotes: GG, Nice Hand, Ouch, and more. [starter]',       3000,   'Emotes',      'emote'),
    ('Premium Emote Pack',        'Animated premium emotes to express every cooler and hero call. [starter]',      10000,  'Emotes',      'emote'),
    ('Shark Avatar',              'Show the table who the predator is. [starter]',                                 15000,  'Avatars',     'avatar'),
    ('Crown Avatar',              'A golden crown avatar for club royalty. [starter]',                             15000,  'Avatars',     'avatar'),
    ('VIP Rail Seat (7 days)',    'Exclusive: featured spot on the club rail list for a week. [starter]',          100000, 'Exclusive',   'exclusive')
)
INSERT INTO club_shop_items (club_id, name, description, price, category, image_url, is_active, item_type)
SELECT c.id, cat.name, cat.description, cat.price, cat.category, NULL, true, cat.item_type
FROM clubs c
CROSS JOIN catalog cat
WHERE NOT EXISTS (
  SELECT 1 FROM club_shop_items existing
  WHERE existing.club_id = c.id AND existing.name = cat.name
);

-- 3) Assert: every club now has an active catalog.
DO $$
DECLARE
  bare_clubs integer;
BEGIN
  SELECT count(*) INTO bare_clubs
  FROM clubs c
  WHERE NOT EXISTS (
    SELECT 1 FROM club_shop_items i WHERE i.club_id = c.id AND i.is_active = true
  );
  IF bare_clubs > 0 THEN
    RAISE EXCEPTION 'Seed failed: % club(s) still have no active shop items', bare_clubs;
  END IF;
END $$;
