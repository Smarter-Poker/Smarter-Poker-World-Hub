/**
 * Deterministic Internal Link Equity Mesh (Tier 8 SEO Architecture)
 * =================================================================
 * Pure zero-dependency resolvers that wire every /compare/[slug] page and every
 * /tools/odds/[matchup] page into verified on-disk Smarter.Poker calculators,
 * positional preflop matrices, leak diagnostics, and sibling equity matchups.
 *
 * House style: Title Case copy, zero em/en dashes, zero banned gold, zero
 * unsubstantiated venue wording. Every returned route corresponds to a real
 * Next.js page file on disk.
 */

const CORE_COMPARE_DESTINATIONS = Object.freeze({
  icm: Object.freeze({
    href: '/tools/icm-calculator',
    eyebrow: 'Matched Free Tool',
    label: 'Free Tournament ICM Calculator',
    description: 'Compute Exact Bubble Factors, Payout Jumps, And Final Table Stack Equity Free.',
  }),
  odds: Object.freeze({
    href: '/tools/poker-odds-calculator',
    eyebrow: 'Matched Free Tool',
    label: 'Multi-Variant Poker Odds Calculator',
    description: 'Run Instant Holdem, PLO4, And PLO5 Multiway Equity Simulations In Your Browser.',
  }),
  rangesBtn: Object.freeze({
    href: '/tools/preflop-ranges/btn',
    eyebrow: 'Matched Free Solver Matrix',
    label: 'BTN 13x13 GTO Preflop Range Matrix',
    description: 'Inspect Free 169-Hand Button Open, 3-Bet, And Defense Frequencies Across Stack Depths.',
  }),
  nearMe: Object.freeze({
    href: '/hub/poker-near-me',
    eyebrow: 'Matched Live Directory',
    label: 'Live Poker Near Me Room Finder',
    description: 'Browse Live Cash Games, Daily Tournaments, And Poker Rooms Nationwide Free.',
  }),
  bankroll: Object.freeze({
    href: '/tools/bankroll-calculator',
    eyebrow: 'Matched Free Tool',
    label: 'Poker Bankroll & Risk Of Ruin Calculator',
    description: 'Model Required Buy-Ins, Downswing Risk, And Session Variance Without Subscriptions.',
  }),
});

const UNIVERSAL_COMPARE_LINKS = Object.freeze([
  Object.freeze({
    href: '/tools/gto-leak-finder',
    eyebrow: '60-Second Diagnostic',
    label: 'Free GTO Poker Leak Finder',
    description: 'Pinpoint Your Biggest Preflop And Postflop EV Leaks Across Five Core Spots.',
  }),
  Object.freeze({
    href: '/hub/training',
    eyebrow: 'Interactive GTO Arena',
    label: '107 Free GTO Poker Training Games',
    description: 'Drill Preflop Ranges, C-Bet Textures, And Tournament Push-Fold Spots Daily.',
  }),
]);

const MATCHUP_PREFLOP_TARGETS = Object.freeze({
  btn: Object.freeze({
    href: '/tools/preflop-ranges/btn',
    eyebrow: 'Positional Solver Chart',
    label: 'BTN 13x13 GTO Preflop Ranges',
    description: 'Check Exact Button Opening, 3-Bet Defense, And 4-Bet Frequencies For This Spot.',
    kind: 'tool',
  }),
  co: Object.freeze({
    href: '/tools/preflop-ranges/co',
    eyebrow: 'Positional Solver Chart',
    label: 'CO 13x13 GTO Preflop Ranges',
    description: 'Check Exact Cutoff Opening, 3-Bet Calling, And 4-Bet Value Ranges For This Spot.',
    kind: 'tool',
  }),
});

const MATCHUP_LEAK_FINDER_LINK = Object.freeze({
  href: '/tools/gto-leak-finder',
  eyebrow: '60-Second Diagnostic',
  label: 'Free GTO Poker Leak Finder',
  description: 'Test Your Preflop And Postflop Decisions Across Five Solver-Backed Spots.',
  kind: 'tool',
});

export const VERIFIED_MESH_STATIC_ROUTES = Object.freeze([
  '/tools/icm-calculator',
  '/tools/poker-odds-calculator',
  '/tools/preflop-ranges/btn',
  '/tools/preflop-ranges/co',
  '/hub/poker-near-me',
  '/tools/bankroll-calculator',
  '/tools/gto-leak-finder',
  '/hub/training',
]);

const COMPARE_MATCHERS = Object.freeze([
  {
    pattern: /(?:icmizer|holdem-resources|icm|push-fold|bounty)/i,
    target: CORE_COMPARE_DESTINATIONS.icm,
  },
  {
    pattern: /(?:flopzilla|equilab|plo4-vs-plo5|poker-odds|club-apps|pokerbros|pppoker|clubgg|friends|private-online-poker-club)/i,
    target: CORE_COMPARE_DESTINATIONS.odds,
  },
  {
    pattern: /(?:pokeratlas|bravo|hendon-mob|tablecaptain|poker-room|poker-rooms|bellagio|aria|commerce-casino|bicycle|wynn|venetian|borgata|parx)/i,
    target: CORE_COMPARE_DESTINATIONS.nearMe,
  },
  {
    pattern: /(?:bankroll|pokertracker|holdem-manager)/i,
    target: CORE_COMPARE_DESTINATIONS.bankroll,
  },
  {
    pattern: /(?:gto-wizard|piosolver|monkersolver|pokercode|pokercoaching|run-it-once|upswing|cardschat|gto-poker-trainers)/i,
    target: CORE_COMPARE_DESTINATIONS.rangesBtn,
  },
]);

/**
 * Resolve 3 deterministic, verified on-disk internal links for any
 * /compare/[slug] comparison page:
 *   1. Exact matched Smarter.Poker calculator or live hub destination
 *   2. /tools/gto-leak-finder
 *   3. /hub/training
 */
export function resolveCompareLinkMesh(slug) {
  const normalized = String(slug || '').trim().toLowerCase();
  let primary = CORE_COMPARE_DESTINATIONS.rangesBtn;

  for (const rule of COMPARE_MATCHERS) {
    if (rule.pattern.test(normalized)) {
      primary = rule.target;
      break;
    }
  }

  return [
    { ...primary },
    { ...UNIVERSAL_COMPARE_LINKS[0] },
    { ...UNIVERSAL_COMPARE_LINKS[1] },
  ];
}

function selectMatchupPreflopTarget(matchup) {
  const category = String(matchup?.category || '').trim().toLowerCase();
  const slug = String(matchup?.slug || '').trim().toLowerCase();
  if (
    category.includes('overpair') ||
    category.includes('dominated') ||
    /^aa-vs-|^kk-vs-|^qq-vs-/.test(slug)
  ) {
    return MATCHUP_PREFLOP_TARGETS.co;
  }
  return MATCHUP_PREFLOP_TARGETS.btn;
}

/**
 * Resolve deterministic internal link mesh for any /tools/odds/[matchup] page:
 *   - Matched preflop range link (/tools/preflop-ranges/btn or /tools/preflop-ranges/co)
 *   - /tools/gto-leak-finder
 *   - Up to 4 related sibling /tools/odds/<slug> matchups (same game/category,
 *     excluding self, deterministic order)
 */
export function resolveMatchupLinkMesh(matchup, allMatchups = []) {
  const currentSlug = String(matchup?.slug || '').trim().toLowerCase();
  const currentGame = String(matchup?.game || '').trim().toLowerCase();
  const currentCategory = String(matchup?.category || '').trim().toLowerCase();

  const preflopLink = { ...selectMatchupPreflopTarget(matchup) };
  const leakFinderLink = { ...MATCHUP_LEAK_FINDER_LINK };
  const toolLinks = [preflopLink, leakFinderLink];

  const pool = Array.isArray(allMatchups) ? allMatchups : [];
  const sameGamePool = pool.filter((item) => {
    if (!item || typeof item.slug !== 'string') return false;
    const itemSlug = item.slug.trim().toLowerCase();
    if (!itemSlug || itemSlug === currentSlug) return false;
    if (currentGame && String(item.game || '').trim().toLowerCase() !== currentGame) {
      return false;
    }
    return true;
  });

  const bySlugAsc = (a, b) => String(a.slug).localeCompare(String(b.slug));
  const sameCategory = sameGamePool
    .filter((item) => currentCategory && String(item.category || '').trim().toLowerCase() === currentCategory)
    .sort(bySlugAsc);
  const otherCategorySameGame = sameGamePool
    .filter((item) => !currentCategory || String(item.category || '').trim().toLowerCase() !== currentCategory)
    .sort(bySlugAsc);

  const orderedCandidates = [...sameCategory, ...otherCategorySameGame];
  const seenSlugs = new Set();
  const siblingLinks = [];

  for (const item of orderedCandidates) {
    const cleanSlug = String(item.slug).trim();
    if (!cleanSlug || seenSlugs.has(cleanSlug)) continue;
    seenSlugs.add(cleanSlug);
    const eqA = Number.isFinite(Number(item.equityA)) ? `${Number(item.equityA).toFixed(2)}%` : '';
    const eqB = Number.isFinite(Number(item.equityB)) ? `${Number(item.equityB).toFixed(2)}%` : '';
    const handA = String(item.handA || '').trim();
    const handB = String(item.handB || '').trim();
    const gameLabel = String(item.gameLabel || '').trim() || 'Poker';
    siblingLinks.push({
      href: `/tools/odds/${cleanSlug}`,
      slug: cleanSlug,
      eyebrow: gameLabel,
      label: `${handA} Vs ${handB} Odds`,
      description: eqA && eqB ? `${eqA} Vs ${eqB} Preflop Equity Breakdown.` : `${gameLabel} Preflop Equity Breakdown.`,
      kind: 'sibling',
    });
    if (siblingLinks.length >= 4) break;
  }

  return {
    toolLinks,
    siblingLinks,
    links: [...toolLinks, ...siblingLinks],
  };
}
