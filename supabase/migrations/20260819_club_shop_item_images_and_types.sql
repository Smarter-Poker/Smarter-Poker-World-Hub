-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_club_shop_item_images_and_types.sql
-- Tier 1 (data-only). Applied to production 2026-08-19 via Supabase MCP as
-- `club_shop_item_images_and_types`.
--
-- WHY: The starter catalog seeded earlier today shipped without artwork
-- (image_url NULL -> placeholder glyph in the store grid). This attaches the
-- new SVG covers under /hub/club-arena/images/shop/ and backfills item_type
-- from category for any rows missing it (the manage-shop API now sets
-- item_type on create/update going forward).
--
-- Idempotent: only touches rows where image_url IS NULL / item_type IS NULL.
-- Rollback: UPDATE club_shop_items SET image_url = NULL
--           WHERE image_url LIKE '/hub/club-arena/images/shop/%';
-- ═══════════════════════════════════════════════════════════════════════════

WITH art(name, url) AS (
  VALUES
    ('Time Bank +30s',           '/hub/club-arena/images/shop/time-bank-30s.svg'),
    ('Time Bank Bundle (5x)',    '/hub/club-arena/images/shop/time-bank-bundle.svg'),
    ('Midnight Felt Table Skin', '/hub/club-arena/images/shop/table-skin-midnight.svg'),
    ('Royal Gold Table Skin',    '/hub/club-arena/images/shop/table-skin-royal-gold.svg'),
    ('Tomato Pack (10)',         '/hub/club-arena/images/shop/throwable-tomato.svg'),
    ('Snowball Pack (10)',       '/hub/club-arena/images/shop/throwable-snowball.svg'),
    ('Golden Egg (3)',           '/hub/club-arena/images/shop/throwable-golden-egg.svg'),
    ('Classic Emote Pack',       '/hub/club-arena/images/shop/emote-pack-classic.svg'),
    ('Premium Emote Pack',       '/hub/club-arena/images/shop/emote-pack-premium.svg'),
    ('Shark Avatar',             '/hub/club-arena/images/shop/avatar-shark.svg'),
    ('Crown Avatar',             '/hub/club-arena/images/shop/avatar-crown.svg'),
    ('VIP Rail Seat (7 days)',   '/hub/club-arena/images/shop/exclusive-vip-rail.svg')
)
UPDATE club_shop_items i
SET image_url = art.url
FROM art
WHERE i.name = art.name
  AND i.image_url IS NULL;

-- Backfill item_type from category where missing
UPDATE club_shop_items
SET item_type = CASE category
  WHEN 'Time Banks'  THEN 'time_bank'
  WHEN 'Table Skins' THEN 'table_skin'
  WHEN 'Throwables'  THEN 'throwable'
  WHEN 'Emotes'      THEN 'emote'
  WHEN 'Avatars'     THEN 'avatar'
  WHEN 'Exclusive'   THEN 'exclusive'
  ELSE item_type
END
WHERE item_type IS NULL;
