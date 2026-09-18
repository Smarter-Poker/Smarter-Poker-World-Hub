/**
 * SUMMARY SCHEMA - the graph for a hub page, built from the copy that page
 * already shows (AEO phase 3, 2026-09-17).
 *
 * Twenty five of the routes HubPageSummary serves had copy and a title and
 * no structured data at all, because each page would have had to build its
 * own, and twenty five hand-written graphs is twenty five chances to drift.
 *
 * The name and the description are read from the summary entry, not written
 * again here: the heading with "About " removed, and the lead. A page cannot
 * end up saying one thing to a reader and another to an engine, because
 * there is only one copy of the sentence.
 *
 * Keys absent from this map are the pages that already publish their own
 * jsonLd through SEOHead. Two graphs on one page is one more than the page
 * has.
 *
 * Plain JavaScript, no JSX, so the law can import it and read what it
 * actually produces rather than pattern matching the source.
 */

// The extension is explicit so node can import this module directly: the law
// reads what it produces rather than pattern matching the source.
import { hubProductSchema, hubCollectionSchema } from './hubPageSchema.js';

const G = 'GameApplication';
export const SCHEMA_ROUTES = {
  // The Club Commander family already ships commanderBreadcrumbs, so these
  // add the page and the application and leave the trail alone.
  'commander-venues': { path: '/hub/commander/venues', category: 'BusinessApplication', breadcrumb: false },
  'commander-tournaments': { path: '/hub/commander/tournaments', category: 'BusinessApplication', breadcrumb: false },
  'commander-home-games': { path: '/hub/commander/home-games', category: 'BusinessApplication', breadcrumb: false },
  'commander-leagues': { path: '/hub/commander/leagues', category: 'BusinessApplication', breadcrumb: false },

  trivia: { path: '/hub/trivia', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia']], collection: true },
  'trivia-endless': { path: '/hub/trivia/endless', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Endless', '/hub/trivia/endless']] },
  'trivia-survival': { path: '/hub/trivia/survival', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Survival', '/hub/trivia/survival']] },
  'trivia-time-attack': { path: '/hub/trivia/time-attack', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Time Attack', '/hub/trivia/time-attack']] },
  'trivia-mixed': { path: '/hub/trivia/mixed', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Mixed', '/hub/trivia/mixed']] },
  'trivia-pvp': { path: '/hub/trivia/pvp', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Head To Head', '/hub/trivia/pvp']] },
  'trivia-tournaments': { path: '/hub/trivia/tournaments', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Tournaments', '/hub/trivia/tournaments']] },
  'trivia-leaderboard': { path: '/hub/trivia/leaderboard', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Leaderboard', '/hub/trivia/leaderboard']], collection: true },

  'training-challenges': { path: '/hub/training/challenges', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Challenges', '/hub/training/challenges']] },
  'training-leaderboard': { path: '/hub/training/leaderboard', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Leaderboard', '/hub/training/leaderboard']], collection: true },
  'training-tournaments': { path: '/hub/training/tournaments', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Tournaments', '/hub/training/tournaments']] },
  'training-jarvis': { path: '/hub/training/jarvis', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Jarvis', '/hub/training/jarvis']] },
  // 'training-solutions' is NOT here: the page builds its own graph now,
  // with the same @id. Two of the same node is the one thing this map
  // must never cause (AEO phase 3, 2026-09-17).

  reels: { path: '/hub/reels', category: 'SocialNetworkingApplication', trail: [['Hub', '/hub'], ['Reels', '/hub/reels']] },
  lives: { path: '/hub/lives', category: 'SocialNetworkingApplication', trail: [['Hub', '/hub'], ['Lives', '/hub/lives']] },
  'social-pages': { path: '/hub/social-pages', trail: [['Hub', '/hub'], ['Community Pages', '/hub/social-pages']], collection: true },
  pages: { path: '/hub/pages', trail: [['Hub', '/hub'], ['Pages', '/hub/pages']], collection: true },
  leaderboards: { path: '/hub/leaderboards', trail: [['Hub', '/hub'], ['Leaderboards', '/hub/leaderboards']], collection: true },
  promotions: { path: '/hub/promotions', trail: [['Hub', '/hub'], ['Promotions', '/hub/promotions']], collection: true },
  help: { path: '/hub/help', trail: [['Hub', '/hub'], ['Help', '/hub/help']], collection: true },
  'news-sources': { path: '/hub/news/sources', trail: [['Hub', '/hub'], ['News', '/hub/news'], ['Sources', '/hub/news/sources']], collection: true },
};

/**
 * The graph for one page, built from the copy that page already shows. A
 * CollectionPage for an index, a WebPage plus the application for a product.
 */
export function summarySchema(page, entry) {
  const route = SCHEMA_ROUTES[page];
  if (!route || !entry) return null;
  const name = `${entry.heading.replace(/^About (The )?/i, '')} | Smarter.Poker`;
  const description = entry.lead;
  const trail = route.trail || [['Hub', '/hub']];
  const nodes = route.collection
    ? hubCollectionSchema({ path: route.path, name, description, trail })
    : hubProductSchema({
        path: route.path,
        name,
        description,
        applicationCategory: route.category || 'GameApplication',
        trail,
        withBreadcrumb: route.breadcrumb !== false,
      });
  return { '@context': 'https://schema.org', '@graph': nodes };
}
