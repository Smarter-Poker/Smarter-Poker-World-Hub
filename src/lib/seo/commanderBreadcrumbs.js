/**
 * BreadcrumbList schema for the public Club Commander pages.
 *
 * Google shows the breadcrumb trail in place of the raw URL in results, and
 * it tells every crawler that these pages hang off /hub/commander, which is
 * the page that carries the SoftwareApplication schema for the product.
 * One helper so the six sub-pages cannot drift from each other.
 */
const SITE_URL = 'https://smarter.poker';

export function commanderBreadcrumbs(leafName, leafPath) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Smarter.Poker', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Club Commander', item: `${SITE_URL}/hub/commander` },
      { '@type': 'ListItem', position: 3, name: leafName, item: `${SITE_URL}${leafPath}` },
    ],
  };
}
