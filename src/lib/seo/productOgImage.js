/**
 * The share card for a product's pages (discoverability phase 6, 2026-09-17).
 * Pure, so the discoverability law test can import it without a router;
 * src/components/seo/SEOHead.js applies it to the current route.
 */
export const PRODUCT_OG_IMAGES = Object.freeze([
  { prefix: '/hub/commander', image: 'https://smarter.poker/images/og-club-commander.jpg' },
]);

/** The product card for a Next.js route pathname, or undefined for the site card. */
export function productOgImage(pathname) {
  if (typeof pathname !== 'string') return undefined;
  const hit = PRODUCT_OG_IMAGES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return hit ? hit.image : undefined;
}
