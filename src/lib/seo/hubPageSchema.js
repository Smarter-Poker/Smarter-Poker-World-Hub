/**
 * HUB PAGE SCHEMA - one builder, so every hub product page says the same
 * thing in the same shape.
 *
 * AEO PHASE 3 (2026-09-17). Measured on production with every script
 * stripped, the four largest product pages on the site carried thousands of
 * server-rendered words each and not one line of structured data:
 *
 *   /hub                      200 words   0 ld+json
 *   /hub/training           1,843 words   0 ld+json
 *   /hub/home-games           229 words   0 ld+json
 *   /hub/bankroll-manager     211 words   0 ld+json
 *
 * Words tell an engine what a page says. Schema tells it what the page IS,
 * who publishes it and where it sits, and that is what decides whether an
 * answer cites the page or paraphrases it without a link. /hub/commander
 * and /hub/commander/faq already did this by hand, and they are the two
 * pages that came back clean in the audit, so this is that pattern made
 * shared instead of copied.
 *
 * Every node here carries a stable @id and points at the site-wide
 * Organization and WebSite nodes that SEOHead publishes, so a hub page
 * joins one entity graph rather than starting a fifth.
 */

export const SITE = 'https://smarter.poker';
export const ORGANIZATION_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;

const absolute = (path) => `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;

/**
 * A BreadcrumbList from an ordered trail of [name, path] pairs. The trail
 * always starts at the site root, because a crawler that arrives on a deep
 * page from a sitemap has no other way to learn where it is.
 */
export function breadcrumbSchema(trail) {
  const items = [['Smarter.Poker', '/'], ...trail];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${absolute(items[items.length - 1][1])}#breadcrumb`,
    itemListElement: items.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: absolute(path),
    })),
  };
}

/**
 * A hub page that IS a product: the trainer, the bankroll manager, the home
 * games directory. Ships the page, the application it hosts and the trail.
 */
export function hubProductSchema({
  path,
  name,
  description,
  applicationCategory = 'GameApplication',
  applicationSubCategory = 'Poker',
  trail,
}) {
  const url = absolute(path);
  return [
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      inLanguage: 'en-US',
      about: { '@id': `${url}#app` },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${url}#app`,
      name,
      url,
      description,
      applicationCategory,
      applicationSubCategory,
      operatingSystem: 'Web, iOS, Android',
      isAccessibleForFree: true,
      inLanguage: 'en',
      publisher: { '@id': ORGANIZATION_ID },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    breadcrumbSchema(trail),
  ];
}

/**
 * A hub page that is an index of other pages rather than a product of its
 * own. CollectionPage is the honest type: claiming SoftwareApplication for
 * a menu would be a claim the page does not support.
 */
export function hubCollectionSchema({ path, name, description, trail }) {
  const url = absolute(path);
  return [
    {
      '@type': 'CollectionPage',
      '@id': `${url}#page`,
      url,
      name,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      inLanguage: 'en-US',
      about: { '@id': ORGANIZATION_ID },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    breadcrumbSchema(trail),
  ];
}
