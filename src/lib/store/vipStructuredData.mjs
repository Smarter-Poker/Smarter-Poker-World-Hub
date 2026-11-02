import { formatStoreUsd } from './wholeDollarPrice.mjs';
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
        price: String(amount / 100), priceCurrency: 'USD',
        availability: 'https://schema.org/OnlineOnly',
        description, seller: { '@id': ORGANIZATION_ID }, itemOffered: ref(id),
        priceSpecification: {
          '@type': recurring ? 'UnitPriceSpecification' : 'PriceSpecification',
          price: String(amount / 100), priceCurrency: 'USD',
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

/** Public search copy shares the same catalog and access terms as checkout. */
export function vipProductContent(catalog, plan, gift = false) {
  if (!vipProductPath(plan, gift)) return null;
  const entry = catalog[plan];
  const cents = Math.round(Number(entry?.price) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  const term = VIP_TERMS[plan];
  const price = `$${formatStoreUsd(cents / 100)}`;
  const diamonds = cents.toLocaleString('en-US');
  const heading = `${term.label} VIP ${gift ? 'Gift Card' : 'Membership'}`;
  const terms = gift ? vipGiftTerms(plan) : vipMembershipTerms(plan);
  const descriptions = gift ? {
    monthly: `Gift 30 Days Of Smarter.Poker VIP For ${price} Or ${diamonds} Diamonds. Send To An Accepted Friend. Access Starts On Redemption, With No Automatic Renewal.`,
    yearly: `Give An Accepted Friend 365 Days Of Smarter.Poker VIP For ${price} Or ${diamonds} Diamonds. One-Time Gift; Access Starts On Redemption, With No Auto-Renewal.`,
    lifetime: `Give Lifetime Smarter.Poker VIP To An Accepted Friend For ${price} Or ${diamonds} Diamonds. One Payment, No Expiry. Your Friend Chooses When To Redeem.`,
  } : {
    monthly: `Monthly Poker VIP: ${price}/Month By Card Or ${diamonds} Diamonds For 30 Days. Get Premium Training And Club Arena Features. Card Renews Monthly; Cancel Anytime.`,
    yearly: `Yearly Poker VIP: ${price}/Year By Card Or ${diamonds} Diamonds For 365 Days. Premium Training And Club Arena Benefits. Card Renews Yearly; Cancel Anytime.`,
    lifetime: `Lifetime Poker VIP For ${price} Or ${diamonds} Diamonds. One Payment, No Expiry Or Renewal. Unlock Premium Training And Lifetime Club Arena Benefits.`,
  };
  const introductions = gift ? {
    monthly: 'Give A Friend A Month To Explore Premium Poker Training And VIP Table Features. Their 30 Days Start When They Redeem The Gift.',
    yearly: 'Give An Accepted Friend A Full 365 Days Of Premium Training And Club Arena Benefits. Pay Once; They Choose When To Start.',
    lifetime: 'Give An Accepted Friend VIP Access That Never Expires. This Gift Unlocks Lifetime Membership After They Redeem It, Without Recurring Billing.',
  } : {
    monthly: 'Choose Flexible Monthly Access To Premium Poker Training And Club Arena Features, With Card Or Diamonds.',
    yearly: 'Choose A Year Of Premium Poker Training And Club Arena Benefits With One Annual Card Payment Or A 365-Day Diamond Term.',
    lifetime: 'Make One Payment For VIP Access With No Expiry. Lifetime Membership Covers Premium Poker Training And Club Arena Benefits On The Same Account.',
  };
  const summaries = gift ? {
    monthly: 'A Monthly Gift Is A Shorter VIP Term For A Friend Who Wants To Try The Premium Tools. The Recipient Chooses When To Redeem, And Is Never Enrolled In A Subscription.',
    yearly: 'A Yearly Gift Gives Your Friend A 365-Day VIP Term Without Recurring Charges. It Includes The Same Platform And Club Arena Benefits As Yearly Membership.',
    lifetime: 'A Lifetime Gift Grants Membership With No Expiry After Redemption. Your Friend Receives The Lifetime Benefits Listed Below, And No Future Renewal Payment Is Required.',
  } : {
    monthly: 'Monthly VIP Suits Players Who Want A Shorter Commitment. Card Billing Renews Each Month Until You Cancel. A Diamond Purchase Is A One-Time 30-Day Term That Extends Existing Access.',
    yearly: 'Yearly VIP Suits Players Planning A Longer Period Of Training And Table Access. Card Billing Renews Each Year Until You Cancel. A Diamond Purchase Adds A One-Time 365-Day Term.',
    lifetime: 'Lifetime VIP Suits Players Who Want Ongoing Access Without Renewals. The Included Training Tools And Lifetime Table Benefits Stay Unlocked For The Membership, With No Expiry Date.',
  };
  return {
    title: `${gift ? `${term.label} VIP Gift Card For Poker Players` : `${term.label} Poker VIP Membership`} | Smarter.Poker`,
    heading, description: descriptions[plan], intro: introductions[plan],
    sectionHeading: gift ? `How The ${term.label} VIP Gift Works` : `Choosing ${term.label} VIP`,
    summary: summaries[plan], terms,
    faqs: [
      { q: gift ? 'When Does My Friend\'s VIP Access Start?' : 'What Are The Payment And Access Terms?', a: terms },
      gift
        ? { q: 'Who Can Receive This VIP Gift?', a: 'You Must Be Accepted Friends With The Recipient Before Sending. Choose Your Friend And Review The Gift Before Continuing To Card Checkout Or Confirming A Diamond Payment.' }
        : { q: plan === 'lifetime' ? 'Does Lifetime VIP Renew Or Expire?' : `Does ${term.label} VIP Renew Automatically?`, a: plan === 'lifetime' ? 'No. Lifetime VIP Is One Payment With Card Or Diamonds And Has No Expiry Or Automatic Renewal.' : `Card Purchases Renew Every ${term.unitText} Until You Cancel. Diamond Purchases Are One-Time ${term.days}-Day Terms. Cancel Card Renewal In The VIP Command Center; Paid Access Continues Through The End Of Your Period.` },
      { q: gift ? 'Can An Unredeemed VIP Gift Be Returned?' : 'What Does This Membership Include?', a: gift ? 'An Available, Unredeemed Gift Can Be Returned To The Sender Through Gift History Using The Original Payment Method. A Redeemed Gift Cannot Be Returned Through That Action.' : 'The Premium Training, Platform Tools And Club Arena Features Listed On This Page. Tournament Buy-Ins And Entry Fees Remain Separate And Are Charged Normally.' },
    ],
    relatedLinks: [false, true].flatMap(isGift => Object.entries(VIP_TERMS).map(([key, value]) => ({
      href: vipProductPath(key, isGift), label: `${value.label} VIP ${isGift ? 'Gift Card' : 'Membership'}`,
    }))).filter(link => link.href !== vipProductPath(plan, gift)),
  };
}

export function vipProductStructuredData(catalog, plan, gift = false) {
  const path = vipProductPath(plan, gift);
  if (!path) return null;
  const graph = vipStructuredData(catalog)['@graph'];
  const product = graph.find(item => item['@id'] === `${VIP_URL}#${gift ? 'gift' : 'membership'}-${plan}`);
  if (!product) return null;
  const url = `https://smarter.poker${path}`;
  const content = vipProductContent(catalog, plan, gift);
  const id = `${url}#product`;
  const item = { ...product, '@id': id, url, mainEntityOfPage: { '@id': `${url}#page` },
    ...(product.offers ? { offers: { ...product.offers, '@id': `${url}#card-offer`, url, itemOffered: { '@id': id } } } : {}) };
  const breadcrumb = breadcrumbSchema([['Hub', '/hub'], ['VIP Membership', '/hub/vip-membership'],
    [`${VIP_TERMS[plan].label} VIP${gift ? ' Gift Card' : ''}`, path]]);
  return { '@context': 'https://schema.org', '@graph': [
    ...graph.filter(node => ['Organization', 'WebSite'].includes(node['@type'])),
    { '@type': 'WebPage', '@id': `${url}#page`, url, name: content.title,
      description: content.description, inLanguage: 'en-US', isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': id }, breadcrumb: { '@id': breadcrumb['@id'] } },
    breadcrumb, item,
  ] };
}
