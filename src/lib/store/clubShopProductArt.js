const CLUB_SHOP_ATLAS = '/images/store-v3/club-shop-product-atlas-v2.webp';

const ATLAS_POSITIONS = Object.freeze({
  'VIP Rail Seat (7 Days)': '0% 0%',
  'Time Bank +30s': '33.333% 0%',
  'Time Bank +60s': '33.333% 0%',
  'Time Bank Bundle (5x)': '66.667% 0%',
  'Time Bank Bundle (+100s)': '66.667% 0%',
  'Midnight Felt Table Skin': '66.667% 50%',
  'Royal Gold Table Skin': '100% 50%',
  'Classic Emote Pack': '0% 100%',
  'Premium Emote Pack': '33.333% 100%',
  'Shark Avatar': '66.667% 100%',
  'Crown Avatar': '100% 100%',
});

const DIRECT_IMAGES = Object.freeze({
  'All Throwables Pack (10)': '/images/marketplace/throwables/all-throwables-access-v1.png',
});

const CATEGORY_ATLAS_POSITIONS = Object.freeze({
  'Time Banks': ATLAS_POSITIONS['Time Bank +60s'],
});

const CATALOG_ART_IDENTITIES = Object.freeze({
  'VIP Rail Seat (7 Days)': ['Exclusive', 'exclusive', 'none'],
  'Time Bank +30s': ['Time Banks', 'time_bank', 'time_bank'],
  'Time Bank +60s': ['Time Banks', 'time_bank', 'time_bank'],
  'Time Bank Bundle (5x)': ['Time Banks', 'time_bank', 'time_bank'],
  'Time Bank Bundle (+100s)': ['Time Banks', 'time_bank', 'time_bank'],
  'Midnight Felt Table Skin': ['Table Skins', 'table_skin', 'table_skin'],
  'Royal Gold Table Skin': ['Table Skins', 'table_skin', 'table_skin'],
  'Classic Emote Pack': ['Emotes', 'emote', 'emote_pack'],
  'Premium Emote Pack': ['Emotes', 'emote', 'emote_pack'],
  'Shark Avatar': ['Avatars', 'avatar', 'avatar'],
  'Crown Avatar': ['Avatars', 'avatar', 'avatar'],
});

function matchesIdentity(item, identity) {
  return Boolean(
    identity &&
    item?.category === identity[0] &&
    item?.item_type === identity[1] &&
    item?.grant_spec?.type === identity[2]
  );
}

/**
 * One art authority for the Club Shop grid and its item-detail routes.
 * Canonical catalog products win over stale stored images. Custom Time Bank
 * offers share the approved Time Bank equipment bay; unknown categories fail
 * closed instead of impersonating a product with an unrelated page hero.
 */
export function resolveClubShopProductArt(item) {
  const name = String(item?.name || '').trim();
  const normalizedName = name.toLocaleLowerCase('en-US');
  const directEntry = Object.entries(DIRECT_IMAGES).find(
    ([catalogName]) => catalogName.toLocaleLowerCase('en-US') === normalizedName
  );
  if (
    directEntry &&
    item?.category === 'Throwables' &&
    item?.item_type === 'throwable' &&
    item?.grant_spec?.type === 'throwable' &&
    Number(item?.grant_spec?.qty) === 10
  ) {
    return { kind: 'image', source: directEntry[1], position: null };
  }
  const atlasEntry = Object.entries(ATLAS_POSITIONS).find(
    ([catalogName]) => catalogName.toLocaleLowerCase('en-US') === normalizedName
  );
  if (atlasEntry && matchesIdentity(item, CATALOG_ART_IDENTITIES[atlasEntry[0]])) {
    return {
      kind: 'atlas',
      source: CLUB_SHOP_ATLAS,
      position: atlasEntry[1],
    };
  }
  const categoryPosition =
    item?.item_type === 'time_bank' && item?.grant_spec?.type === 'time_bank'
      ? CATEGORY_ATLAS_POSITIONS[String(item?.category || '')]
      : null;
  if (categoryPosition) {
    return {
      kind: 'atlas',
      source: CLUB_SHOP_ATLAS,
      position: categoryPosition,
    };
  }
  return {
    kind: 'unavailable',
    source: null,
    position: null,
  };
}

export { ATLAS_POSITIONS, CATEGORY_ATLAS_POSITIONS, CLUB_SHOP_ATLAS, DIRECT_IMAGES };
