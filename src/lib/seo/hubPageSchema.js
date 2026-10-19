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
 * FAQ schema for pages with authoritative questions and answers.
 */
export function faqSchema(items, path) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const url = absolute(path);
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: items.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: typeof answer === 'string' ? answer.trim() : '',
      },
    })),
  };
}

/**
 * Google Images Licensable ImageObject schema node.
 * Unlocks the "Licensable" badge in Google Images SERPs by declaring
 * contentUrl, license, acquireLicensePage, creditText, copyrightNotice, and creator.
 */
export function licensableImageSchema({
  url,
  contentUrl = `${SITE}/images/og-card.jpg`,
  caption = 'Smarter.Poker Visual Asset',
  acquireLicensePage = `${SITE}/hub/training`,
} = {}) {
  const pageUrl = url ? (url.startsWith('http') ? url : absolute(url)) : SITE;
  const fullContentUrl = contentUrl.startsWith('http') ? contentUrl : absolute(contentUrl);
  return {
    '@type': 'ImageObject',
    '@id': `${pageUrl}#primaryimage`,
    url: fullContentUrl,
    contentUrl: fullContentUrl,
    caption,
    license: `${SITE}/terms`,
    acquireLicensePage: acquireLicensePage.startsWith('http')
      ? acquireLicensePage
      : absolute(acquireLicensePage),
    creditText: 'Smarter.Poker',
    copyrightNotice: 'Copyright Smarter Software Inc.',
    creator: {
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: 'Smarter.Poker',
    },
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
  // Some pages already publish their own BreadcrumbList (the Club Commander
  // family does, through commanderBreadcrumbs). Two of them on one page is
  // one more than the page has.
  withBreadcrumb = true,
  faqs = null,
  image = `${SITE}/images/og-card.jpg`,
}) {
  const url = absolute(path);
  const imageNode = licensableImageSchema({
    url,
    contentUrl: image,
    caption: `${name} - Smarter.Poker`,
    acquireLicensePage: url,
  });
  const nodes = [
    {
      '@type': 'WebPage',
      '@id': `${url}#page`,
      url,
      name,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      inLanguage: 'en-US',
      about: { '@id': `${url}#app` },
      primaryImageOfPage: { '@id': `${url}#primaryimage` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'p'],
      },
      ...(withBreadcrumb ? { breadcrumb: { '@id': `${url}#breadcrumb` } } : {}),
    },
    {
      '@type': ['SoftwareApplication', 'WebApplication'],
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
    imageNode,
    ...(withBreadcrumb ? [breadcrumbSchema(trail)] : []),
  ];

  if (Array.isArray(faqs) && faqs.length > 0) {
    const faqNode = faqSchema(faqs, path);
    if (faqNode) nodes.push(faqNode);
  }

  return nodes;
}

/**
 * A hub page that is an index of other pages rather than a product of its
 * own. CollectionPage is the honest type: claiming SoftwareApplication for
 * a menu would be a claim the page does not support.
 */
export function hubCollectionSchema({ path, name, description, trail, image = `${SITE}/images/og-card.jpg` }) {
  const url = absolute(path);
  const imageNode = licensableImageSchema({
    url,
    contentUrl: image,
    caption: `${name} - Smarter.Poker`,
    acquireLicensePage: url,
  });
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
      primaryImageOfPage: { '@id': `${url}#primaryimage` },
      speakable: {
        '@type': 'SpeakableSpecification',
        cssSelector: ['h1', 'p'],
      },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    imageNode,
    breadcrumbSchema(trail),
  ];
}
