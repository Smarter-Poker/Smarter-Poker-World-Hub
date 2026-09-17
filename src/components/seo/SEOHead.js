/**
 * World Hub SEOHead: the shared component, plus the product share card.
 *
 * DISCOVERABILITY PHASE 6 (2026-09-17). Every page shared the one site card
 * (og-card.jpg), so a Club Commander link on Facebook, X, iMessage or Slack
 * showed the generic Smarter.Poker poster and nothing said "Club Commander".
 * A page under /hub/commander now defaults to the Club Commander card unless
 * it names its own image. The default is decided here, in the one wrapper
 * every page imports, so the 37 Club Commander pages cannot drift. Poker
 * Arena's card is set in its own app (Smarter-Poker-Club-Arena src/lib/seo.ts)
 * and served from /images/og-poker-arena.jpg here.
 */
import { useRouter } from 'next/router';
import SharedSEOHead from '@smarter-poker/commander-shared/components/seo/SEOHead';
import { productOgImage } from '../../lib/seo/productOgImage';

export * from '@smarter-poker/commander-shared/components/seo/SEOHead';

export { PRODUCT_OG_IMAGES, productOgImage } from '../../lib/seo/productOgImage';

function usePathname() {
  try {
    // Pages router: the route pattern (dynamic segments unexpanded), which is
    // what the prefix match needs. Null outside a router context (tests).
    return useRouter()?.pathname;
  } catch {
    return undefined;
  }
}

export default function SEOHead(props) {
  const pathname = usePathname();
  const ogImage = props.ogImage || productOgImage(pathname);
  return <SharedSEOHead {...props} ogImage={ogImage} />;
}
