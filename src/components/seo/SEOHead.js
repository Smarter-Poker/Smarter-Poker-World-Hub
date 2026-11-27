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
import SharedSEOHead, { schemas } from '@smarter-poker/commander-shared/components/seo/SEOHead';
import { productOgImage } from '../../lib/seo/productOgImage';

const SOLVED_SPOT_QUERY_SCHEMAS = {
  'pot-odds-calculator': ['pot', 'bet', 'outs', 'street'],
  'outs-calculator': ['outs', 'street', 'pot', 'call'],
  'icm-calculator': ['stacks', 'payouts', 'save'],
  'chop-calculator': ['stacks', 'payouts', 'save'],
  'variance-calculator': ['wr', 'sd', 'winrate', 'stddev', 'hands', 'hph', 'bb'],
  'poker-tax-calculator': ['wins', 'losses', 'winnings', 'status', 'expenses', 'other', 'tourney', 'stateTax', 'seTax'],
  'staking-calculator': ['package', 'buyins', 'markup', 'sold', 'share', 'cashes', 'roi'],
  'iso-calculator': ['bb', 'limpers', 'pos', 'oop', 'stack', 'env'],
  'home-game-kit': ['format', 'players', 'set', 'preset', 'buyin', 'stack'],
  'push-fold-calculator': ['stack', 'bb', 'pos', 'ante'],
  'bankroll-calculator': ['wr', 'sd', 'bi', 'dollars', 'winrate', 'stddev', 'ror', 'stake'],
  'bounty-calculator': ['startStack', 'startBounty', 'targetBounty', 'bountyVal', 'pot', 'call', 'format'],
  'poker-winrate-calculator': ['profit', 'bb', 'hours', 'hph', 'won', 'hands'],
  'winrate-calculator': ['profit', 'bb', 'hours', 'hph', 'won', 'hands'],
  'side-pot-calculator': ['stacks', 'deadMoney', 'dead'],
  'spr-calculator': ['pot', 'stack'],
  'plo-bet-calculator': ['pot', 'bet', 'trail', 'hero', 'bomb', 'call', 'calls'],
  'plo-calculator': ['pot', 'bet', 'trail', 'calls'],
  'rake-calculator': ['bb', 'pct', 'rakePct', 'cap', 'promo', 'hph', 'pots', 'time', 'timeFee', 'vpip', 'avgPot'],
  '3bet-calculator': ['open', 'callers', 'stack', 'pos', 'ip3b', 'oop3b'],
  'blind-structure-calculator': ['players', 'hours', 'stack', 'mins', 'ante'],
  'payout-calculator': ['entries', 'rebuys', 'buyIn', 'buyin', 'fee', 'added', 'preset', 'paidPct'],
  'tournament-payout-calculator': ['entries', 'rebuys', 'buyIn', 'buyin', 'fee', 'added', 'preset', 'paidPct'],
  'poker-odds-calculator': ['game', 'board', 'hands'],
  'board-texture-analyzer': ['flop', 'scenario'],
  'm-ratio-calculator': ['stack', 'sb', 'bb', 'ante', 'players', 'avg'],
  'satellite-calculator': ['total', 'seats', 'value', 'rem', 'hero', 'bb'],
  'session-planner': ['stake', 'wr', 'hrs', 'sess', 'wks', 'comp', 'exp'],
  'straddle-calculator': ['blinds', 'type', 'stack', 'vpip', 'ante', 'players', 'fmt'],
  'promo-ev-calculator': ['pool', 'qual', 'loser', 'winner', 'table', 'drop', 'hh'],
  'who-wins-calculator': ['board', 'p1', 'p2'],
  'hand-converter': ['stakes', 'stack', 'hero', 'villain', 'cards', 'flop'],
  'mixed-game-placards': ['preset', 'orbit', 'hand'],
  'poker-iq-test': ['score', 'ans'],
  'format-quiz': ['hours', 'br', 'var', 'focus', 'env'],
  'preflop-ranges': ['pos', 'action', 'depth'],
  'geometric-bet-calculator': ['pot', 'stack', 'mode'],
  'late-reg-calculator': ['buyin', 'rake', 'entries', 'rem', 'bb', 'roi'],
  'mtt-grind-planner': ['mtts', 'abi', 'bullets', 'field', 'roi', 'br'],
  'plo-outs-calculator': ['wrap', 'outs', 'nut', 'pot', 'bet'],
  'poker-trip-planner': ['days', 'flight', 'hotel', 'food', 'buyins', 'bullets', 'roi', 'chrs', 'crate'],
  'shot-clock': ['primary', 'bank'],
  'table-selection-calculator': ['stake', 'recs', 'depth', 'straddle', 'bomb', 'rake'],
  'winrate-confidence-calculator': ['mode', 'wr', 'sd', 'hands', 'hph'],
  'multiway-all-in-calculator': ['p1', 'p2', 'p3', 'eq1', 'eq2', 'eq3', 'dead'],
  'mystery-bounty-tracker': ['pool', 'topBounty', 'envelopes', 'players', 'startChips', 'fee'],
  'bubble-factor-calculator': ['s1', 's2', 's3', 's4', 'p1', 'p2', 'p3', 'p4'],
  'bluff-catching-calculator': ['pot', 'bet', 'valueCombos', 'bluffCombos', 'blockerPct'],
  'multi-street-ev-calculator': ['pot', 'fBet', 'fFold', 'tBet', 'tFold', 'rBet', 'rFold', 'eq'],
  'heads-up-push-fold-calculator': ['bb', 'role', 'ante'],
  'blind-vs-blind-calculator': ['bb', 'action', 'sizing'],
  'shot-taking-calculator': ['bankroll', 'baseBb', 'shotBb', 'stopLossBi', 'wrBase', 'wrShot'],
  'warmup-cooldown-routine': ['game', 'duration', 'tiltScore', 'focusScore'],
  'home-game-director': ['players', 'buyin', 'rebuys', 'addons', 'stack', 'levelMins'],
};

export * from '@smarter-poker/commander-shared/components/seo/SEOHead';

export { PRODUCT_OG_IMAGES, productOgImage } from '../../lib/seo/productOgImage';

export const ORGANIZATION_SAME_AS = [
  'https://github.com/Smarter-Poker',
  'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
  'https://github.com/Smarter-Poker/smarter-poker-mcp',
  'https://twitter.com/SmarterPoker',
  'https://x.com/SmarterPoker',
  'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
  'https://doi.org/10.5281/zenodo.24115647',
  'https://doi.org/10.5281/zenodo.24115636',
  'https://doi.org/10.5281/zenodo.24115447',
  'https://doi.org/10.5281/zenodo.24115452',
  'https://doi.org/10.5281/zenodo.24115453',
  'https://doi.org/10.5281/zenodo.24115454',
  'https://doi.org/10.5281/zenodo.24095048',
  'https://doi.org/10.5281/zenodo.24095056',
  'https://zenodo.org/records/24115647',
  'https://zenodo.org/records/24115636',
  'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
];

/**
 * The founder, linked from the Organization node and the About page.
 * Owner-stated facts (2026-11-09): founded October 2025. The LinkedIn link
 * gives site visitors a way to connect with the founder, which is also what
 * lets LinkedIn create the Smarter.Poker company page.
 */
export const FOUNDER = Object.freeze({
  name: 'Daniel Bekavac',
  firstName: 'Daniel',
  linkedin: 'https://www.linkedin.com/in/daniel-bekavac-78060944a/',
});

if (schemas && schemas.organization) {
  schemas.organization.sameAs = ORGANIZATION_SAME_AS;
  schemas.organization.foundingDate = '2025-10';
  schemas.organization.founder = {
    '@type': 'Person',
    '@id': 'https://smarter.poker/about#founder',
    name: FOUNDER.name,
    jobTitle: 'Founder',
    sameAs: [FOUNDER.linkedin],
  };
}

/**
 * Ensure every Article, NewsArticle, TechArticle, or BlogPosting node rendered
 * through SEOHead carries an absolute Google Rich Results compliant `image`
 * (defaulting to the page's resolved Open Graph image when omitted).
 */
const ARTICLE_SCHEMA_TYPES = new Set(['Article', 'NewsArticle', 'TechArticle', 'BlogPosting']);

function toAbsoluteMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `https://smarter.poker${trimmed}`;
  return trimmed;
}

function enrichArticleNodeImage(node, defaultImage, imageMetadata) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
  const rawType = node['@type'];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (!types.some((t) => ARTICLE_SCHEMA_TYPES.has(t))) return node;

  if (node.image) {
    if (typeof node.image === 'string' && node.image.startsWith('/')) {
      return { ...node, image: toAbsoluteMediaUrl(node.image) };
    }
    return node;
  }

  const fallbackUrl = toAbsoluteMediaUrl(defaultImage) || 'https://smarter.poker/images/og-default.png';
  return {
    ...node,
    image: {
      '@type': 'ImageObject',
      url: fallbackUrl,
      width: imageMetadata?.width || 1200,
      height: imageMetadata?.height || 630,
    },
  };
}

export function enrichArticleJsonLdImages(jsonLd, defaultImage, imageMetadata) {
  if (!jsonLd) return jsonLd;
  if (typeof jsonLd === 'object' && !Array.isArray(jsonLd) && Array.isArray(jsonLd['@graph'])) {
    return {
      ...jsonLd,
      '@graph': enrichArticleJsonLdImages(jsonLd['@graph'], defaultImage, imageMetadata),
    };
  }
  if (Array.isArray(jsonLd)) {
    return jsonLd.map((node) => enrichArticleNodeImage(node, defaultImage, imageMetadata));
  }
  return enrichArticleNodeImage(jsonLd, defaultImage, imageMetadata);
}

/**
 * Normalize a JSON-LD graph array so that:
 * 1. Child nodes inside @graph never carry a redundant @context key.
 * 2. Any @graph that references https://smarter.poker/#organization or
 *    https://smarter.poker/#website by @id includes the target entity node
 *    when not already present in the array.
 */
export function normalizeJsonLdGraph(jsonLd) {
  if (jsonLd && typeof jsonLd === 'object' && !Array.isArray(jsonLd) && Array.isArray(jsonLd['@graph'])) {
    return {
      ...jsonLd,
      '@context': jsonLd['@context'] || 'https://schema.org',
      '@graph': normalizeJsonLdGraph(jsonLd['@graph']),
    };
  }
  if (!Array.isArray(jsonLd)) return jsonLd;
  const cleaned = jsonLd
    .filter(Boolean)
    .map((node) => {
      if (node && typeof node === 'object' && !Array.isArray(node) && '@context' in node) {
        const { '@context': _removedContext, ...rest } = node;
        return rest;
      }
      return node;
    });
  const serialized = JSON.stringify(cleaned);
  const hasOrgNode = cleaned.some((n) => n && n['@id'] === 'https://smarter.poker/#organization');
  const hasWebsiteNode = cleaned.some((n) => n && n['@id'] === 'https://smarter.poker/#website');
  const prefix = [];
  const needsWebsite = !hasWebsiteNode && serialized.includes('https://smarter.poker/#website');
  if (!hasOrgNode && (needsWebsite || serialized.includes('https://smarter.poker/#organization'))) {
    const { '@context': _orgCtx, ...orgNode } = schemas.organization;
    prefix.push(orgNode);
  }
  if (needsWebsite) {
    const { '@context': _webCtx, ...websiteNode } = schemas.website;
    prefix.push(websiteNode);
  }
  return prefix.length > 0 ? [...prefix, ...cleaned] : cleaned;
}

function usePathname() {
  try {
    // Pages router: the route pattern (dynamic segments unexpanded), which is
    // what the prefix match needs. Null outside a router context (tests).
    return useRouter()?.pathname;
  } catch {
    return undefined;
  }
}

import Head from 'next/head';
import { shareImageMetadata } from '../../lib/seo/shareImageMetadata.mjs';

export default function SEOHead(props) {
  const pathname = usePathname();
  let routerQuery = {};
  try {
    routerQuery = useRouter()?.query || {};
  } catch {
    routerQuery = {};
  }
  let solvedSpotOgImage = null;
  if (!props.ogImage && pathname && typeof pathname === 'string') {
    const cleanPath = pathname.split('?')[0].replace(/\/+$/, '');
    if (cleanPath.startsWith('/tools/')) {
      const slug = cleanPath.replace('/tools/', '').toLowerCase();
      const keys = SOLVED_SPOT_QUERY_SCHEMAS[slug];
      if (keys && routerQuery && typeof routerQuery === 'object') {
        const params = new URLSearchParams();
        params.set('tool', slug);
        let matched = 0;
        for (const k of keys) {
          const raw = routerQuery[k];
          const val = Array.isArray(raw) ? raw[0] : raw;
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            params.set(k, String(val).trim().slice(0, 120));
            matched += 1;
          }
        }
        if (matched > 0) {
          solvedSpotOgImage = `https://smarter.poker/api/og/tool-card?${params.toString()}`;
        }
      }
    }
  }
  const baseOgImage = props.ogImage || productOgImage(pathname);
  const ogImage = solvedSpotOgImage || baseOgImage;
  const imageMetadata = shareImageMetadata(ogImage);
  const { geoRegion, geoPlacename, geoPosition, markdownUrl, calendarUrl } = props;

  // Auto-resolve markdownUrl for known routes that serve clean .md representations.
  // Never emit unexpanded Next.js dynamic route brackets (e.g. [state], [slug]) to crawlers.
  let resolvedMarkdownUrl = markdownUrl;
  const safeMarkdownFallback = (pathCandidate) =>
    typeof pathCandidate === 'string' && !/\[[^\]]+\]/.test(pathCandidate)
      ? `https://smarter.poker${pathCandidate}.md`
      : undefined;
  if (!resolvedMarkdownUrl && typeof pathname === 'string') {
    const rawCanon = typeof props.canonical === 'string'
      ? (props.canonical.startsWith('http') ? props.canonical : `https://smarter.poker${props.canonical}`)
      : null;
    const cleanCanon = rawCanon && !/\[[^\]]+\]/.test(rawCanon) ? rawCanon : null;
    if (pathname.startsWith('/features/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/features') {
      resolvedMarkdownUrl = 'https://smarter.poker/features.md';
    } else if (pathname.startsWith('/compare/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/compare') {
      resolvedMarkdownUrl = 'https://smarter.poker/compare.md';
    } else if (pathname.startsWith('/glossary/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/glossary') {
      resolvedMarkdownUrl = 'https://smarter.poker/glossary.md';
    } else if (pathname.startsWith('/learn/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/learn') {
      resolvedMarkdownUrl = 'https://smarter.poker/learn.md';
    } else if (pathname === '/tools/embeds') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/embeds.md';
    } else if (pathname === '/tools' || pathname === '/tools/index') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools.md';
    } else if (
      pathname === '/tools/pot-odds-calculator' ||
      pathname === '/tools/bankroll-calculator' ||
      pathname === '/tools/push-fold-calculator' ||
      pathname === '/tools/bounty-calculator' ||
      pathname === '/tools/poker-winrate-calculator' ||
      pathname === '/tools/side-pot-calculator' ||
      pathname === '/tools/blind-structure-calculator' ||
      pathname === '/tools/spr-calculator' ||
      pathname === '/tools/plo-bet-calculator' ||
      pathname === '/tools/payout-calculator' ||
      pathname === '/tools/rake-calculator' ||
      pathname === '/tools/3bet-calculator' ||
      pathname === '/tools/chop-calculator' ||
      pathname === '/tools/variance-calculator' ||
      pathname === '/tools/outs-calculator' ||
      pathname === '/tools/poker-tax-calculator' ||
      pathname === '/tools/staking-calculator' ||
      pathname === '/tools/iso-calculator' ||
      pathname === '/tools/home-game-kit' ||
      pathname === '/tools/format-quiz' ||
      pathname === '/tools/board-texture-analyzer' ||
      pathname === '/tools/m-ratio-calculator' ||
      pathname === '/tools/session-planner' ||
      pathname === '/tools/straddle-calculator' ||
      pathname === '/tools/hand-converter' ||
      pathname === '/tools/satellite-calculator' ||
      pathname === '/tools/promo-ev-calculator' ||
      pathname === '/tools/who-wins-calculator' ||
      pathname === '/tools/mixed-game-placards' ||
      pathname === '/tools/poker-iq-test' ||
      pathname === '/tools/geometric-bet-calculator' ||
      pathname === '/tools/late-reg-calculator' ||
      pathname === '/tools/mtt-grind-planner' ||
      pathname === '/tools/plo-outs-calculator' ||
      pathname === '/tools/poker-trip-planner' ||
      pathname === '/tools/shot-clock' ||
      pathname === '/tools/table-selection-calculator' ||
      pathname === '/tools/winrate-confidence-calculator' ||
      pathname === '/tools/multiway-all-in-calculator' ||
      pathname === '/tools/mystery-bounty-tracker' ||
      pathname === '/tools/bubble-factor-calculator' ||
      pathname === '/tools/bluff-catching-calculator' ||
      pathname === '/tools/multi-street-ev-calculator' ||
      pathname === '/tools/heads-up-push-fold-calculator' ||
      pathname === '/tools/blind-vs-blind-calculator' ||
      pathname === '/tools/shot-taking-calculator' ||
      pathname === '/tools/warmup-cooldown-routine' ||
      pathname === '/tools/home-game-director' ||
      pathname === '/rules' ||
      pathname.startsWith('/rules/') ||
      pathname === '/games' ||
      pathname.startsWith('/games/') ||
      pathname === '/poker-rooms' ||
      pathname === '/poker-rooms/guides' ||
      pathname.startsWith('/poker-rooms/guides/') ||
      pathname === '/poker-rooms/states' ||
      pathname.startsWith('/poker-rooms/states/') ||
      pathname === '/poker-rooms/international' ||
      pathname.startsWith('/poker-rooms/international/') ||
      pathname === '/poker-rooms/comps-and-tipping-guide' ||
      pathname === '/poker-rooms/first-time-guide' ||
      pathname === '/poker-series/guides' ||
      pathname.startsWith('/poker-series/guides/') ||
      pathname === '/press' ||
      pathname === '/search'
    ) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/tools/poker-odds-calculator' || pathname === '/hub/poker-tools') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/poker-odds-calculator.md';
    } else if (pathname === '/hub/venues/[id]' || /^\/hub\/venues\/[^/]+$/.test(pathname)) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : undefined;
    } else if (pathname === '/hub/series/[id]' || /^\/hub\/series\/[^/]+$/.test(pathname)) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : undefined;
    } else if (pathname === '/hub/tours/[code]' || /^\/hub\/tours\/[^/]+$/.test(pathname)) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : undefined;
    } else if (pathname === '/research' || pathname.startsWith('/research/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/editorial-standards') {
      resolvedMarkdownUrl = 'https://smarter.poker/editorial-standards.md';
    } else if (pathname === '/verification-methodology') {
      resolvedMarkdownUrl = 'https://smarter.poker/verification-methodology.md';
    } else if (pathname === '/tools/icm-calculator' || pathname === '/hub/training/icm-calculator') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/icm-calculator.md';
    } else if (pathname === '/tools/preflop-ranges' || pathname === '/tools/preflop-ranges/index') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/preflop-ranges.md';
    } else if (pathname === '/tools/preflop-ranges/[position]' || pathname.startsWith('/tools/preflop-ranges/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : 'https://smarter.poker/tools/preflop-ranges.md';
    } else if (pathname === '/about') {
      resolvedMarkdownUrl = 'https://smarter.poker/about.md';
    } else if (pathname === '/freerolls' || pathname === '/hub/freerolls') {
      resolvedMarkdownUrl = 'https://smarter.poker/freerolls.md';
    } else if (pathname === '/hub/messenger') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/messenger.md';
    } else if (pathname === '/hub/home-games') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/home-games.md';
    } else if (pathname === '/hub/poker-near-me' || pathname === '/hub/poker-near-me/lobby') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me.md';
    } else if (pathname === '/hub/club-arena') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/club-arena.md';
    } else if (pathname === '/hub/reels' || pathname === '/hub/social-media') {
      if (!props.noindex && (!cleanCanon || !cleanCanon.includes('?id='))) {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/reels.md';
      }
    } else if (pathname === '/hub/preflop-charts') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/preflop-charts.md';
    } else if (pathname === '/hub/video-library') {
      if (!props.noindex && (!cleanCanon || !cleanCanon.includes('/hub/video-library/watch/'))) {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/video-library.md';
      }
    } else if (
      pathname === '/hub/video-library/watch/[videoId]/[[...slug]]' ||
      pathname.startsWith('/hub/video-library/watch/')
    ) {
      if (!props.noindex && cleanCanon) {
        resolvedMarkdownUrl = `${cleanCanon}.md`;
      }
    } else if (pathname === '/hub') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub.md';
    } else if (pathname === '/hub/bankroll-manager') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/bankroll-manager.md';
    } else if (pathname === '/hub/commander') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/commander.md';
    } else if (pathname === '/hub/training') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/training.md';
    } else if (pathname === '/hub/trivia') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/trivia.md';
    } else if (pathname === '/hub/training/jarvis') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/training/jarvis.md';
    } else if (pathname === '/hub/training/equity-calculator') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/poker-odds-calculator.md';
    } else if (pathname === '/hub/personal-assistant' || pathname.startsWith('/hub/personal-assistant/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/hub/install') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/install.md';
    } else if (pathname === '/hub/vip-membership/compare') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/vip-membership/compare.md';
    } else if (/^\/hub\/training\/[a-z0-9-]+$/.test(pathname)) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (/^\/hub\/trivia\/[a-z0-9-]+$/.test(pathname)) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (
      pathname === '/hub/commander/venues' ||
      pathname === '/hub/commander/tournaments' ||
      pathname === '/hub/commander/home-games' ||
      pathname === '/hub/commander/leagues' ||
      pathname === '/hub/commander/faq' ||
      pathname === '/hub/commander/responsible-gaming'
    ) {
      resolvedMarkdownUrl = `https://smarter.poker${pathname}.md`;
    } else if (
      pathname === '/hub/vip-membership' ||
      pathname.startsWith('/hub/vip-membership/') ||
      pathname === '/hub/diamond-store' ||
      pathname === '/hub/smarter-rewards' ||
      pathname === '/hub/merch-store' ||
      pathname === '/hub/club-shop' ||
      pathname === '/hub/tournaments/this-weekend' ||
      pathname === '/hub/preflop-charts/leaderboard' ||
      pathname === '/hub/preflop-charts/tutorial' ||
      pathname === '/hub/news' ||
      pathname === '/hub/news/sources' ||
      pathname === '/hub/leaderboards' ||
      pathname === '/hub/promotions' ||
      pathname === '/hub/lives' ||
      pathname === '/hub/help' ||
      pathname === '/hub/pages' ||
      pathname === '/hub/social-pages' ||
      pathname === '/terms' ||
      pathname === '/privacy' ||
      pathname === '/legal/official-rules' ||
      pathname === '/hub/home-games/in' ||
      pathname === '/hub/home-games/near-me' ||
      pathname.startsWith('/hub/home-games/in/') ||
      pathname === '/hub/home-games/[slug]'
    ) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    } else if (pathname === '/hub/daily-tournaments') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/daily-tournaments.md';
    } else if (pathname === '/hub/events-calendar') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/events-calendar.md';
    } else if (pathname === '/hub/poker-tours') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-tours.md';
    } else if (pathname === '/hub/poker-series') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-series.md';
    } else if (pathname === '/hub/poker-near-me/[pnmTab]') {
      if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/venues') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me/venues.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/daily-tournaments') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/daily-tournaments.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/events-calendar') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/events-calendar.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/poker-tours' || cleanCanon === 'https://smarter.poker/hub/poker-near-me/tours') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-tours.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/poker-series' || cleanCanon === 'https://smarter.poker/hub/poker-near-me/series') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-series.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/live-games') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me/live-games.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/map') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me/map.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/roadtrip') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me/roadtrip.md';
      } else if (cleanCanon === 'https://smarter.poker/hub/poker-near-me/alerts') {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me/alerts.md';
      } else {
        resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me.md';
      }
    } else if (pathname === '/hub/poker-near-me/in' || pathname.startsWith('/hub/poker-near-me/in/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : safeMarkdownFallback(pathname);
    }
  }
  if (resolvedMarkdownUrl && /\[[^\]]+\]/.test(resolvedMarkdownUrl)) {
    resolvedMarkdownUrl = undefined;
  }

  // Auto-resolve calendarUrl for known routes that serve clean .ics calendar feeds
  const cleanCanonForCal = typeof props.canonical === 'string' && props.canonical.startsWith('http')
    ? props.canonical.replace(/\/$/, '')
    : typeof props.canonical === 'string' && props.canonical.startsWith('/')
    ? `https://smarter.poker${props.canonical.replace(/\/$/, '')}`
    : null;
  let resolvedCalendarUrl = calendarUrl;
  if (!resolvedCalendarUrl && typeof pathname === 'string') {
    if (pathname === '/freerolls' || pathname === '/hub/freerolls') {
      resolvedCalendarUrl = 'https://smarter.poker/freerolls.ics';
    } else if (pathname === '/hub/tours/[code]' || /^\/hub\/tours\/[^/]+$/.test(pathname)) {
      if (!props.noindex && cleanCanonForCal) {
        resolvedCalendarUrl = `${cleanCanonForCal}.ics`;
      }
    }
  }

  const normalizedJsonLd = props.jsonLd
    ? enrichArticleJsonLdImages(normalizeJsonLdGraph(props.jsonLd), ogImage, imageMetadata)
    : props.jsonLd;

  return (
    <SharedSEOHead {...props} ogImage={ogImage} jsonLd={normalizedJsonLd}>
      {imageMetadata.type && <meta key="og-image-type" property="og:image:type" content={imageMetadata.type} />}
      {imageMetadata.width && <meta key="og-image-width" property="og:image:width" content={String(imageMetadata.width)} />}
      {imageMetadata.height && <meta key="og-image-height" property="og:image:height" content={String(imageMetadata.height)} />}
      {geoRegion && <meta key="geo-region" name="geo.region" content={geoRegion} />}
      {geoPlacename && <meta key="geo-placename" name="geo.placename" content={geoPlacename} />}
      {geoPosition && (
        <>
          <meta key="geo-position" name="geo.position" content={geoPosition} />
          <meta key="icbm" name="ICBM" content={geoPosition.replace(';', ', ')} />
        </>
      )}
      {resolvedMarkdownUrl && (
        <link
          key="alternate-markdown"
          rel="alternate"
          type="text/markdown"
          title="Markdown"
          href={resolvedMarkdownUrl}
        />
      )}
      {resolvedCalendarUrl && (
        <link
          key="alternate-calendar"
          rel="alternate"
          type="text/calendar"
          title="iCalendar Schedule"
          href={resolvedCalendarUrl}
        />
      )}
      {!props.noindex && (
        <link
          key="alternate-json-feed"
          rel="alternate"
          type="application/feed+json"
          title="Smarter.Poker Research & Tools JSON Feed"
          href="https://smarter.poker/api/feeds/research"
        />
      )}
      {!props.noindex && cleanCanonForCal && (
        <link
          key="alternate-oembed"
          rel="alternate"
          type="application/json+oembed"
          title="Smarter.Poker oEmbed Profile"
          href={`https://smarter.poker/api/seo/oembed?url=${encodeURIComponent(cleanCanonForCal)}&format=json`}
        />
      )}
      {!props.noindex && (
        <link
          key="opensearch-description"
          rel="search"
          type="application/opensearchdescription+xml"
          title="Smarter.Poker Search"
          href="https://smarter.poker/opensearch.xml"
        />
      )}
      {props.children}
    </SharedSEOHead>
  );
}

