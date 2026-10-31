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

import { hubProductSchema, hubCollectionSchema, SITE, ORGANIZATION_ID, WEBSITE_ID } from './hubPageSchema.js';
import { POKER_TRIVIA_QUIZ_QUESTIONS } from './quizStructuredData.mjs';

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
  // The indexed Survival page is the live game; /hub/trivia/survival is a
  // noindex redirect shim kept for old bookmarks (AEO phase 3, 2026-09-18).
  'trivia-survival': { path: '/hub/trivia/survival-game', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Survival', '/hub/trivia/survival-game']] },
  'trivia-time-attack': { path: '/hub/trivia/time-attack', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Time Attack', '/hub/trivia/time-attack']] },
  'trivia-mixed': { path: '/hub/trivia/mixed', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Mixed', '/hub/trivia/mixed']] },
  'trivia-pvp': { path: '/hub/trivia/pvp', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Head To Head', '/hub/trivia/pvp']] },
  'trivia-tournaments': { path: '/hub/trivia/tournaments', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Tournaments', '/hub/trivia/tournaments']] },
  'trivia-leaderboard': { path: '/hub/trivia/leaderboard', category: G, trail: [['Hub', '/hub'], ['Trivia', '/hub/trivia'], ['Leaderboard', '/hub/trivia/leaderboard']], collection: true },

  'training-challenges': { path: '/hub/training/challenges', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Challenges', '/hub/training/challenges']] },
  'training-leaderboard': { path: '/hub/training/leaderboard', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Leaderboard', '/hub/training/leaderboard']], collection: true },
  'training-tournaments': { path: '/hub/training/tournaments', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Tournaments', '/hub/training/tournaments']] },
  'training-jarvis': { path: '/hub/training/jarvis', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Jarvis', '/hub/training/jarvis']] },
  'training-hand-history-upload': { path: '/hub/training/hand-history-upload', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Hand History Upload', '/hub/training/hand-history-upload']] },
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

  // Wave 3 (2026-10-31): Personal Assistant Suite, PWA Install & 36 Public Training Tools
  'personal-assistant': { path: '/hub/personal-assistant', category: G, trail: [['Hub', '/hub'], ['Personal Assistant', '/hub/personal-assistant']] },
  'personal-assistant-leaks': { path: '/hub/personal-assistant/leaks', category: G, trail: [['Hub', '/hub'], ['Personal Assistant', '/hub/personal-assistant'], ['Leak Finder', '/hub/personal-assistant/leaks']] },
  'personal-assistant-sandbox': { path: '/hub/personal-assistant/sandbox', category: G, trail: [['Hub', '/hub'], ['Personal Assistant', '/hub/personal-assistant'], ['Scenario Analysis', '/hub/personal-assistant/sandbox']] },
  install: { path: '/hub/install', category: 'UtilitiesApplication', trail: [['Hub', '/hub'], ['Install App', '/hub/install']] },

  'training-autopilot': { path: '/hub/training/autopilot', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Autopilot', '/hub/training/autopilot']] },
  'training-coach-mode': { path: '/hub/training/coach-mode', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Coach Mode', '/hub/training/coach-mode']] },
  'training-community-leaderboard': { path: '/hub/training/community-leaderboard', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Community Leaderboard', '/hub/training/community-leaderboard']], collection: true },
  'training-custom-rake': { path: '/hub/training/custom-rake', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Rake Cost Estimator', '/hub/training/custom-rake']] },
  'training-custom-solve': { path: '/hub/training/custom-solve', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Custom Solve', '/hub/training/custom-solve']] },
  'training-daily-challenge': { path: '/hub/training/daily-challenge', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Daily Challenge', '/hub/training/daily-challenge']] },
  'training-drill-builder': { path: '/hub/training/drill-builder', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Drill Builder', '/hub/training/drill-builder']] },
  'training-famous-finals': { path: '/hub/training/famous-finals', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Famous Finals', '/hub/training/famous-finals']], collection: true },
  'training-final-table-sim': { path: '/hub/training/final-table-sim', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Final Table Simulator', '/hub/training/final-table-sim']] },
  'training-flashcards': { path: '/hub/training/flashcards', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Flashcards', '/hub/training/flashcards']] },
  'training-focus-timer': { path: '/hub/training/focus-timer', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Focus Timer', '/hub/training/focus-timer']] },
  'training-gto-news': { path: '/hub/training/gto-news', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['GTO News', '/hub/training/gto-news']], collection: true },
  'training-gto-preloader': { path: '/hub/training/gto-preloader', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['GTO Preloader', '/hub/training/gto-preloader']] },
  'training-hand-comparison': { path: '/hub/training/hand-comparison', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Hand Comparison', '/hub/training/hand-comparison']] },
  'training-hand-lab': { path: '/hub/training/hand-lab', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Hand Lab', '/hub/training/hand-lab']] },
  'training-icm-simulator': { path: '/hub/training/icm-simulator', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['ICM Simulator', '/hub/training/icm-simulator']] },
  'training-multi-table': { path: '/hub/training/multi-table', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Multi-Table Practice', '/hub/training/multi-table']] },
  'training-multiway-preflop': { path: '/hub/training/multiway-preflop', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Multiway Preflop', '/hub/training/multiway-preflop']] },
  'training-position-mastery': { path: '/hub/training/position-mastery', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Position Mastery', '/hub/training/position-mastery']] },
  'training-preflop-charts': { path: '/hub/training/preflop-charts', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Preflop Reference Charts', '/hub/training/preflop-charts']] },
  'training-qre-explorer': { path: '/hub/training/qre-explorer', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['QRE Explorer', '/hub/training/qre-explorer']] },
  'training-quick-warmup': { path: '/hub/training/quick-warmup', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Quick Warmup', '/hub/training/quick-warmup']] },
  'training-quiz-builder': { path: '/hub/training/quiz-builder', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Quiz Builder', '/hub/training/quiz-builder']] },
  'training-rake-solutions': { path: '/hub/training/rake-solutions', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Rake Sensitivity Explorer', '/hub/training/rake-solutions']] },
  'training-range-builder': { path: '/hub/training/range-builder', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Range Builder', '/hub/training/range-builder']] },
  'training-risk-analyzer': { path: '/hub/training/risk-analyzer', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Risk Of Ruin Analyzer', '/hub/training/risk-analyzer']] },
  'training-scenario-demo': { path: '/hub/training/scenario-demo', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Strategy Concept Tutorial', '/hub/training/scenario-demo']] },
  'training-session-warmup': { path: '/hub/training/session-warmup', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Session Warmup', '/hub/training/session-warmup']] },
  'training-short-deck-trainer': { path: '/hub/training/short-deck-trainer', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Short Deck Trainer', '/hub/training/short-deck-trainer']] },
  'training-skill-tree': { path: '/hub/training/skill-tree', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Poker Skill Tree', '/hub/training/skill-tree']] },
  'training-spot-trainer': { path: '/hub/training/spot-trainer', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Solver Spot Study', '/hub/training/spot-trainer']] },
  'training-study-group-finder': { path: '/hub/training/study-group-finder', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Study Group Finder', '/hub/training/study-group-finder']], collection: true },
  'training-tilt-guard': { path: '/hub/training/tilt-guard', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Tilt Guard', '/hub/training/tilt-guard']] },
  'training-tournament-prep': { path: '/hub/training/tournament-prep', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Tournament Prep Planner', '/hub/training/tournament-prep']] },
  'training-training-feed': { path: '/hub/training/training-feed', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Community Training Feed', '/hub/training/training-feed']], collection: true },
  'training-weakness-scanner': { path: '/hub/training/weakness-scanner', category: G, trail: [['Hub', '/hub'], ['Training', '/hub/training'], ['Weakness Scanner', '/hub/training/weakness-scanner']] },
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

  if (page === 'trivia' || String(page).startsWith('trivia-')) {
    const url = `${SITE}${route.path.startsWith('/') ? '' : '/'}${route.path}`;
    const quizId = `${url}#quiz`;
    nodes.push({
      '@type': 'Quiz',
      '@id': quizId,
      name: `${entry.heading.replace(/^About (The )?/i, '')} Quiz | Smarter.Poker`,
      description,
      url,
      inLanguage: 'en-US',
      publisher: { '@id': ORGANIZATION_ID },
      isPartOf: { '@id': WEBSITE_ID },
      educationalLevel: 'Intermediate',
      hasPart: POKER_TRIVIA_QUIZ_QUESTIONS.map((q, idx) => {
        const questionId = `${quizId}-q${idx + 1}`;
        const accepted = q.answers.find((a) => a.isCorrect);
        const suggested = q.answers.filter((a) => !a.isCorrect);
        return {
          '@type': 'Question',
          '@id': questionId,
          name: q.question,
          eduQuestionType: 'Multiple choice',
          learningResourceType: 'Practice quiz',
          text: q.question,
          acceptedAnswer: accepted
            ? {
                '@type': 'Answer',
                '@id': `${questionId}-ans-correct`,
                text: accepted.text,
                comment: {
                  '@type': 'Comment',
                  text: q.explanation || 'Correct GTO / poker strategy answer.',
                },
              }
            : undefined,
          suggestedAnswer: suggested.map((ans, sIdx) => ({
            '@type': 'Answer',
            '@id': `${questionId}-ans-${sIdx + 1}`,
            text: ans.text,
          })),
        };
      }),
    });
  }

  return { '@context': 'https://schema.org', '@graph': nodes };
}

