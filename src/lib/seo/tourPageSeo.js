/**
 * SERVER SIDE IDENTITY FOR A TOUR PAGE (AEO phase 3, 2026-09-18).
 *
 * /hub/tours/[code] guarded its whole render with
 *
 *     if (!router.isReady) return null;
 *
 * router.isReady is false on the server for a statically optimised page, so
 * that branch is the one every crawler got. All 29 tour routes in the
 * sitemap answered 200 with 20,764 bytes of framework shell, no title, no
 * description, no canonical, no h1 and zero words of text.
 *
 * Everything here is plain JS with no JSX, no React and no JSON import, so
 * getServerSideProps and a law test running under plain node can both import
 * it. The bundled registry is read by the page, which is already a webpack
 * module, and handed in: a JSON import here would need an import attribute
 * that node and webpack spell differently.
 */

const SUFFIX = ' | Smarter.Poker';
/** A result cuts at about 60 characters. The brand suffix is part of that. */
const TITLE_BUDGET = 60;

export const TOUR_TYPE_LABELS = {
  major: 'Major Tour',
  circuit: 'Circuit',
  regional: 'Regional Tour',
  high_roller: 'High Roller Series',
  grassroots: 'Grassroots Tour',
  charity: 'Charity Series',
};

/**
 * The title, chosen so it survives a result rather than being cut. The
 * longest registry name is "Ladies International Poker Series" at 33
 * characters, which blows the budget with any suffix at all, so the
 * candidates step down instead of one template being forced to fit.
 */
export function tourTitle({ code, name }) {
  const safeCode = String(code || '').trim().toUpperCase();
  const label = (name || '').trim();
  const candidates = label
    ? [
      `${label}: Stops And Schedule`,
      `${label} Poker Schedule`,
      `${label}`,
      `${safeCode} Poker Tour Schedule`,
    ]
    : [`${safeCode} Poker Tour Schedule`];
  for (const candidate of candidates) {
    if (candidate.length + SUFFIX.length <= TITLE_BUDGET) return candidate;
  }
  return `${safeCode} Poker Tour`;
}

export function tourDescription({ code, name, type }) {
  const safeCode = String(code || '').trim().toUpperCase();
  const label = (name || '').trim() || `The ${safeCode} Poker Tour`;
  const kind = TOUR_TYPE_LABELS[type] || 'Poker Tour';
  // Kept near 160 characters, which is roughly what a result will show. The
  // longest tour name in the registry is 33 characters.
  return `${label}, A ${kind} Tracked On Smarter.Poker: Every Stop, The Events At Each One, `
    + 'Buy Ins, Start Times, And Results As They Land. Free To Read.';
}

export function tourCanonical(code) {
  return `/hub/tours/${encodeURIComponent(String(code || '').trim().toUpperCase())}`;
}

/**
 * A tour is a recurring real world event series, so the page is described as
 * a CollectionPage over its stops rather than as an application.
 */
export function tourSchema({ code, name, type, website }) {
  const site = 'https://smarter.poker';
  const path = tourCanonical(code);
  const safeCode = String(code || '').trim().toUpperCase();
  const label = (name || '').trim() || `${safeCode} Poker Tour`;
  const trail = [
    ['Smarter.Poker', '/'],
    ['Hub', '/hub'],
    ['Poker Tours', '/hub/poker-tours'],
    [label, path],
  ];
  const nodes = [
    {
      '@type': 'CollectionPage',
      '@id': `${site}${path}#page`,
      url: `${site}${path}`,
      name: `${tourTitle({ code, name })}${SUFFIX}`,
      description: tourDescription({ code, name, type }),
      isPartOf: { '@id': `${site}/#website` },
      about: { '@id': `${site}${path}#tour` },
      breadcrumb: { '@id': `${site}${path}#breadcrumb` },
    },
    {
      '@type': 'SportsOrganization',
      '@id': `${site}${path}#tour`,
      name: label,
      alternateName: safeCode,
      sport: 'Poker',
      ...(website ? { url: website } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${site}${path}#breadcrumb`,
      itemListElement: trail.map(([itemName, itemPath], i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: itemName,
        item: `${site}${itemPath}`,
      })),
    },
  ];
  return nodes;
}

/**
 * Everything the page needs to describe itself before any data arrives.
 * `name` may be null: the registry ships 25 tours and the sitemap carries
 * more than that, because Supabase holds some the bundle does not.
 */
export function tourSeo(code, registryEntry, dbName, dbType) {
  const safeCode = String(code || '').trim().toUpperCase();
  const reg = registryEntry || null;
  const name = (dbName || reg?.tour_name || '').trim() || null;
  const type = dbType || reg?.tour_type || null;
  return {
    code: safeCode,
    name,
    type,
    website: reg?.official_website || null,
    title: tourTitle({ code: safeCode, name }),
    description: tourDescription({ code: safeCode, name, type }),
    canonical: tourCanonical(safeCode),
  };
}
