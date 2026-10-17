import { breadcrumbSchema, ORGANIZATION_ID, WEBSITE_ID } from '../seo/hubPageSchema.js';

export const VIP_URL = 'https://smarter.poker/hub/vip-membership';
export const VIP_TERMS = {
  monthly: { label: 'Monthly', days: 30, unitCode: 'MON', unitText: 'Month' },
  yearly: { label: 'Yearly', days: 365, unitCode: 'ANN', unitText: 'Year' },
  lifetime: { label: 'Lifetime', days: null },
};

export function vipGiftTerms(plan) {
  const { days } = VIP_TERMS[plan];
  return days
    ? `${days} Days Of VIP. Starts On Redemption. One-Time Gift. No Automatic Renewal.`
    : 'Lifetime VIP Access. Starts On Redemption. One-Time Gift. No Expiry Or Renewal.';
}

export function vipMembershipTerms(plan) {
  const { days, unitText } = VIP_TERMS[plan];
  return days
    ? `VIP ${VIP_TERMS[plan].label}. Card: Renews Every ${unitText}. Cancel Anytime. Diamonds: One-Time ${days}-Day Term. Extends Existing Access.`
    : 'VIP Lifetime. One Payment With Card Or Diamonds. Lifetime Access. No Expiry Or Renewal.';
}

// Product includes offered services in Schema.org. Keep each gift distinct from
// the recurring membership; only the latter has a per-month/per-year price.
// Diamonds are promotional credits, never a USD Offer or an invented ISO code.
export function vipStructuredData(catalog) {
  const ref = (id) => ({ '@id': `${VIP_URL}#${id}` });
  const products = [];
  const catalogs = [false, true].map((gift) => {
    const offers = [];
    for (const [plan, term] of Object.entries(VIP_TERMS)) {
      const entry = catalog[plan];
      const amount = Math.round(Number(entry?.price) * 100);
      if (!Number.isSafeInteger(amount) || amount <= 0) continue;
      const id = `${gift ? 'gift' : 'membership'}-${plan}`;
      const name = `Smarter.Poker VIP ${term.label}${gift ? ' Gift Card' : ''}`;
      const terms = gift ? vipGiftTerms(plan) : vipMembershipTerms(plan);
      const description = `${terms}${gift ? ' You Must Be Accepted Friends Before Sending A Gift.' : ''}`;
      const recurring = !gift && term.days !== null;
      const offer = {
        '@type': 'Offer', ...ref(`${id}-card-offer`), name: `${name} With Card`,
        url: `https://smarter.poker${vipProductPath(plan, gift)}`,
        price: (amount / 100).toFixed(2), priceCurrency: 'USD',
        availability: 'https://schema.org/OnlineOnly',
        description, seller: { '@id': ORGANIZATION_ID }, itemOffered: ref(id),
        priceSpecification: {
          '@type': recurring ? 'UnitPriceSpecification' : 'PriceSpecification',
          price: (amount / 100).toFixed(2), priceCurrency: 'USD',
          ...(recurring ? { referenceQuantity: {
            '@type': 'QuantitativeValue', value: 1, unitCode: term.unitCode, unitText: term.unitText,
          } } : {}),
        },
      };
      const cardReady = entry.cardCheckoutReady === true;
      const diamondReady = entry.diamondCheckoutReady === true;
      products.push({
        '@type': 'Product', ...ref(id), name,
        url: offer.url, image: 'https://smarter.poker/images/store-v3/vip-hero.webp',
        description, brand: { '@type': 'Brand', name: 'Smarter.Poker' },
        category: gift ? 'Digital VIP Gift Card' : 'VIP Membership',
        ...(cardReady ? { offers: offer } : {}),
        ...(diamondReady ? { additionalProperty: {
          '@type': 'PropertyValue', name: 'Alternative One-Time Diamond Payment',
          value: amount, unitText: 'Smarter.Poker Diamonds',
          description: gift ? vipGiftTerms(plan) : vipMembershipTerms(plan),
        } } : {}),
      });
      if (cardReady) offers.push(ref(`${id}-card-offer`));
    }
    return { '@type': 'OfferCatalog', ...ref(gift ? 'gift-catalog' : 'membership-catalog'),
      name: gift ? 'Gift A VIP' : 'VIP Membership Plans', numberOfItems: offers.length, itemListElement: offers };
  });
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': ORGANIZATION_ID, name: 'Smarter.Poker', url: 'https://smarter.poker/' },
    { '@type': 'WebSite', '@id': WEBSITE_ID, name: 'Smarter.Poker', url: 'https://smarter.poker/', publisher: { '@id': ORGANIZATION_ID } },
    { '@type': 'CollectionPage', ...ref('page'), url: VIP_URL,
      name: 'VIP Membership And Gift A VIP | Smarter.Poker',
      description: 'Monthly, Yearly And Lifetime VIP Memberships And One-Time Gift Cards For Accepted Friends. Pay With Card Or Diamonds.',
      inLanguage: 'en-US', isPartOf: { '@id': WEBSITE_ID },
      breadcrumb: ref('breadcrumb'), mainEntity: catalogs.map((item) => ({ '@id': item['@id'] })),
      about: products.map((item) => ({ '@id': item['@id'] })),
    },
    breadcrumbSchema([['Hub', '/hub'], ['VIP Membership', '/hub/vip-membership']]),
    ...catalogs, ...products,
  ] };
}

/** Canonical routes and SSR props share a strict allowlist, never a query price. */
export function vipProductPath(plan, gift = false) {
  if (typeof plan !== 'string' || !Object.hasOwn(VIP_TERMS, plan)) return null;
  return `/hub/vip-membership/${gift ? 'gift/' : ''}${plan}`;
}

export function vipProductPageProps({ params, res }, gift = false) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (typeof params?.plan !== 'string' || !vipProductPath(params.plan, gift)) return { notFound: true };
  return { props: { vipProduct: { plan: params.plan, gift } } };
}

export function vipProductStructuredData(catalog, plan, gift = false) {
  const path = vipProductPath(plan, gift);
  if (!path) return null;
  const graph = vipStructuredData(catalog)['@graph'];
  const product = graph.find(item => item['@id'] === `${VIP_URL}#${gift ? 'gift' : 'membership'}-${plan}`);
  if (!product) return null;
  const url = `https://smarter.poker${path}`;
  const id = `${url}#product`;
  const item = { ...product, '@id': id, url, mainEntityOfPage: { '@id': `${url}#page` },
    ...(product.offers ? { offers: { ...product.offers, '@id': `${url}#card-offer`, url, itemOffered: { '@id': id } } } : {}) };
  const breadcrumb = breadcrumbSchema([['Hub', '/hub'], ['VIP Membership', '/hub/vip-membership'],
    [`${VIP_TERMS[plan].label} VIP${gift ? ' Gift Card' : ''}`, path]]);
  return { '@context': 'https://schema.org', '@graph': [
    ...graph.filter(node => ['Organization', 'WebSite'].includes(node['@type'])),
    { '@type': 'WebPage', '@id': `${url}#page`, url, name: `${item.name} | Smarter.Poker`,
      description: item.description, inLanguage: 'en-US', isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': id }, breadcrumb: { '@id': breadcrumb['@id'] } },
    breadcrumb, item,
  ] };
}
