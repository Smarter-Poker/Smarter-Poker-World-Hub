import {
  BUILT_IN_DIAMOND_PACKAGES,
  loadActiveDiamondPackageCatalog,
} from './diamondPackageCatalog.mjs';
import { marketplaceCopy } from './marketplaceCopy.js';

function comparePackages(left, right) {
  return (
    left.priceCents - right.priceCents ||
    left.diamonds + left.bonus - (right.diamonds + right.bonus) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Project the server-owned checkout catalog into the public storefront shape.
 * The projection contains only public offer data and never serializes a
 * Supabase client, key, database error, or other server-only state.
 */
export function projectDiamondStorefrontPackages(catalog) {
  if (!catalog || typeof catalog !== 'object') return Object.freeze([]);

  const packages = Object.entries(catalog).map(([id, entry]) => {
    const rawDisplayName = typeof entry?.name === 'string' ? entry.name.trim().slice(0, 200) : '';
    // A missing database display_name is normalized to the internal package
    // key upstream. Never expose that checkout identifier as shopper copy.
    const displayName =
      rawDisplayName && rawDisplayName !== id ? marketplaceCopy(rawDisplayName) : 'Diamond Package';
    return Object.freeze({
      id,
      name: displayName,
      diamonds: Number(entry?.diamonds),
      bonus: Number(entry?.bonus || 0),
      price: Number(entry?.price),
      priceCents: Number(entry?.priceCents),
      popular: id === 'standard',
      hasDiscount: Number(entry?.bonus || 0) > 0,
    });
  });

  packages.sort(comparePackages);
  return Object.freeze(packages);
}

export const DIAMOND_STOREFRONT_FALLBACK_PACKAGES =
  projectDiamondStorefrontPackages(BUILT_IN_DIAMOND_PACKAGES);

/**
 * Load and project the exact package authority used by Stripe checkout.
 * Callers choose whether the built-in continuity catalog is acceptable.
 */
export async function loadDiamondStorefrontPackages(supabase, options = {}) {
  const result = await loadActiveDiamondPackageCatalog(supabase, options);
  return Object.freeze({
    packages: projectDiamondStorefrontPackages(result.catalog),
    source: result.source,
    error: result.error || null,
  });
}

export function sameDiamondStorefrontOffer(left, right) {
  return (
    Boolean(left && right) &&
    left.id === right.id &&
    left.name === right.name &&
    left.diamonds === right.diamonds &&
    left.bonus === right.bonus &&
    left.priceCents === right.priceCents
  );
}
