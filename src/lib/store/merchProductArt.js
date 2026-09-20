import { MERCHANDISE } from '../../data/diamondStoreData';

const UNSHIPPED_MERCH_IMAGES = new Set([
  '/merch/card-protector-gold.jpg',
  '/merch/card-protector-black.jpg',
  '/merch/hoodie-neural.jpg',
  '/merch/tshirt-gto.jpg',
  '/merch/hat-diamond.jpg',
  '/merch/deck-premium.jpg',
  '/merch/chip-set-100.jpg',
  '/merch/chip-set-500.jpg',
]);

export const LEGACY_MERCH_ATLAS = '/images/merch/neural-steel/legacy-tabletop-atlas.webp';

const LEGACY_MERCH_ATLAS_POSITIONS = new Map([
  ['card-protector-gold', '0% center'],
  ['card-protector-black', '33.333% center'],
  ['deck-premium', '66.667% center'],
  ['chip-set-100', '100% center'],
  ['chip-set-500', '100% center'],
]);

const REVIEWED_MERCH_IMAGES = new Map(
  MERCHANDISE.filter(
    (item) => item?.id && item?.image && !UNSHIPPED_MERCH_IMAGES.has(item.image)
  ).map((item) => [String(item.id), String(item.image)])
);

/**
 * Resolve only art reviewed for this exact catalog id. Catalog-supplied URLs
 * are deliberately not trusted as product photography at the render edge.
 */
export function resolveReviewedMerchArt(productId) {
  const id = typeof productId === 'string' ? productId.trim() : '';
  if (!id) return { image: null, atlasPosition: null, reviewed: false };
  const image = REVIEWED_MERCH_IMAGES.get(id) || null;
  const atlasPosition = LEGACY_MERCH_ATLAS_POSITIONS.get(id) || null;
  return {
    image: image || (atlasPosition ? LEGACY_MERCH_ATLAS : null),
    atlasPosition,
    reviewed: Boolean(image || atlasPosition),
  };
}
