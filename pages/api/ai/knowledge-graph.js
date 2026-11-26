/**
 * Phase 42 (Wave 2 Phase 8 of 16): Unified JSON-LD Knowledge Graph Endpoint
 *
 * Route: /api/ai/knowledge-graph (also served at /knowledge-graph.jsonld)
 *
 * Emits the complete, interlinked Schema.org @graph for Smarter.Poker:
 * - Organization (#organization) with publishing, verification, and corrections policies
 * - WebSite (#website) with SearchAction
 * - 15 SoftwareApplication nodes for every free platform vertical
 * - 4 Dataset nodes for live poker venues, daily tournaments, series, and home games
 * - DefinedTermSet for the poker glossary
 * - CollectionPage for the 40-lesson strategy curriculum
 * - CollectionPage for the 20-hand starting hand encyclopedia
 * - 4 Report + Dataset nodes for first-party poker industry research
 */
import { GLOSSARY_TERMS } from '../../../src/content/glossary/terms.js';
import { LESSONS, LEARN_CATEGORIES } from '../../../src/content/learn/lessons.js';
import { STARTING_HANDS } from '../../../src/content/learn/hands.js';
import { RESEARCH_REPORTS } from '../../../src/content/research/reports.js';
import { COMPARE_PAGES, AS_OF } from '../../../src/content/compare/pages.js';
import { POKER_RULES, RULES_AS_OF } from '../../../src/content/rules/rules.js';
import { POKER_VARIANTS, GAMES_AS_OF } from '../../../src/content/games/variants.js';
import { POKER_MARKET_GUIDES, MARKET_GUIDES_AS_OF } from '../../../src/content/guides/markets.js';
import { HAND_MATCHUPS, MATCHUPS_AS_OF } from '../../../src/content/learn/matchups.js';
import { SERIES_GUIDES, SERIES_GUIDES_AS_OF } from '../../../src/content/guides/seriesGuides.js';
import { POKER_POSITIONS, POSITIONS_AS_OF } from '../../../src/content/learn/positions.js';
import { POKER_STAKES, STAKES_AS_OF } from '../../../src/content/learn/stakes.js';
import { FAMOUS_HANDS, FAMOUS_HANDS_AS_OF } from '../../../src/content/learn/famousHands.js';
import { POKER_ROADMAPS, ROADMAPS_AS_OF } from '../../../src/content/learn/roadmaps.js';
import { PLAYER_ARCHETYPES, PLAYER_TYPES_AS_OF } from '../../../src/content/learn/playerTypes.js';
import { BOARD_TEXTURES, BOARD_TEXTURES_AS_OF } from '../../../src/content/learn/boardTextures.js';
import { US_POKER_STATES, STATES_AS_OF } from '../../../src/content/guides/states.js';
import { INTERNATIONAL_POKER_GUIDES, INTERNATIONAL_GUIDES_AS_OF } from '../../../src/content/guides/internationalMarkets.js';
import { SCHEMA_ROUTES } from '../../../src/lib/seo/summarySchema.js';
import { getHubPageSummaries } from '../../../src/lib/seo/hubPageSummariesData.js';
import { TRAINING_LIBRARY } from '../../../src/data/TRAINING_LIBRARY.js';

const SITE = 'https://smarter.poker';

const VERTICAL_APPLICATIONS = [
  {
    id: 'poker-near-me',
    name: 'Smarter.Poker Live Poker Near Me Directory',
    category: 'SportsApplication',
    url: `${SITE}/features/poker-near-me`,
    description: 'Real-Time Directory Of 324+ Verified Live Poker Rooms, 4,500+ Weekly Daily Tournaments, WSOP/WPT/MSPT Series And GPS Roadtrip Routing.',
  },
  {
    id: 'bankroll-tax-tracker',
    name: 'Smarter.Poker Bankroll & Form W-2G Tax Ledger',
    category: 'FinanceApplication',
    url: `${SITE}/features/bankroll-tax-tracker`,
    description: 'Free Cloud Poker Bankroll Accounting, Session Win-Rate Analytics, Receipt OCR And IRS Form W-2G / Schedule C Export.',
  },
  {
    id: 'poker-dealer-toke-tracker',
    name: 'Smarter.Poker Dealer Toke Tracker & Shift Scheduler',
    category: 'FinanceApplication',
    url: `${SITE}/features/poker-dealer-toke-tracker`,
    description: 'Free Casino And Cardroom Dealer Down Tracking, Hourly Tip Analytics, Shift Scheduling And Tax Income Reporting.',
  },
  {
    id: 'poker-ai-coach',
    name: 'Smarter.Poker Jarvis & PokerBrain AI Tactical Coach',
    category: 'EducationalApplication',
    url: `${SITE}/features/poker-ai-coach`,
    description: 'Conversational Plain-English Poker Hand Analysis, Leak Detection And GTO Solver Baseline Coaching.',
  },
  {
    id: 'virtual-poker-sandbox',
    name: 'Smarter.Poker Virtual Table Sandbox & Runout Simulator',
    category: 'GameApplication',
    url: `${SITE}/features/virtual-poker-sandbox`,
    description: 'Interactive Multiway Poker Equity Sandbox Supporting Holdem, PLO4, PLO5 And PLO6 Scenario Simulation.',
  },
  {
    id: 'club-commander',
    name: 'Club Commander Live Poker Room Management Suite',
    category: 'BusinessApplication',
    url: `${SITE}/features/club-commander`,
    description: 'Free Cloud Poker Room Floor Software With Digital Waitlists, Multi-Screen TV Displays, SMS Seat Calls And Tournament Clocks.',
  },
  {
    id: 'poker-messenger-video-calls',
    name: 'Smarter.Poker Live Messenger & WebRTC Video Table Calls',
    category: 'CommunicationApplication',
    url: `${SITE}/features/poker-messenger-video-calls`,
    description: 'In-Browser Multi-Peer Video And Audio Poker Table Communication With Zero App Downloads.',
  },
  {
    id: 'poker-trivia',
    name: 'Smarter.Poker Multiplayer Poker Trivia & Brain Training',
    category: 'GameApplication',
    url: `${SITE}/features/poker-trivia`,
    description: '10,000+ Poker Rules, Math And History Trivia Challenges Across Survival And Blitz Modes.',
  },
  {
    id: 'poker-training-games',
    name: 'Smarter.Poker GTO Training Games & Decision Drills',
    category: 'EducationalApplication',
    url: `${SITE}/features/poker-training-games`,
    description: '107 Interactive GTO Scenario Drills Across Cash Games, Tournaments And Spins Graded By Solver EV Loss.',
  },
  {
    id: 'home-poker-games',
    name: 'Smarter.Poker Verified Home Poker Game Directory',
    category: 'SocialNetworkingApplication',
    url: `${SITE}/features/home-poker-games`,
    description: 'Community Directory And Host Management Tools For Private Home Poker Games Across North America.',
  },
  {
    id: 'interactive-video-coaching',
    name: 'Smarter.Poker Interactive Video Coaching Masterclasses',
    category: 'EducationalApplication',
    url: `${SITE}/features/interactive-video-coaching`,
    description: 'Curated Poker Coaching Courses Enhanced With Mid-Hand Pause Decision Quizzes.',
  },
  {
    id: 'private-poker-clubs',
    name: 'Smarter.Poker Club Arena Private Poker Clubs & Unions',
    category: 'GameApplication',
    url: `${SITE}/features/private-poker-clubs`,
    description: 'Zero-Markup Cloud Hosting For Private Online Poker Clubs, Multi-Club Unions And Automated Rakeback Ledgers.',
  },
  {
    id: 'poker-reels-social-feed',
    name: 'Smarter.Poker Social Reels & Hand Highlight Network',
    category: 'SocialNetworkingApplication',
    url: `${SITE}/features/poker-reels-social-feed`,
    description: 'Short-Form Poker Video Feed With Hand History Tagging And Creator Rewards.',
  },
  {
    id: 'preflop-charts-matrix',
    name: 'Smarter.Poker 100BB 6-Max GTO Preflop Range Matrix',
    category: 'EducationalApplication',
    url: `${SITE}/features/preflop-charts-matrix`,
    description: 'Interactive 169-Hand GTO Preflop Opening, 3-Bet And 4-Bet Equilibrium Matrices.',
  },
  {
    id: 'poker-equity-calculators',
    name: 'Smarter.Poker 52-Tool Multiway Odds, ICM & Bankroll Calculator Suite (70 MCP Tools & 44 Streamer Commands)',
    category: 'UtilitiesApplication',
    url: `${SITE}/features/poker-equity-calculators`,
    description: '52 Free Browser Calculators, 70 Zero-Auth MCP Tools, And 44 Streamer Bot Commands For Multiway Holdem/PLO Equity, Tournament ICM/Chop Payouts, Pairwise Bubble Factors, Mystery Bounties, Variance, Tax W-2G, Staking And Isolation Sizing.',
  },
];

export function buildKnowledgeGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'Smarter.Poker',
        alternateName: ['Smarter Poker', 'Club Commander', 'Poker Near Me'],
        url: SITE,
        logo: `${SITE}/images/logo.png`,
        description:
          'Smarter.Poker Is The Premier Poker Training, Live Venue Discovery And Club Management Platform Offering 100+ GTO Training Games, 52 Free Poker Calculators, 70 Zero-Auth MCP Tools, 44 Streamer Bot Commands, 324+ Verified Live Poker Rooms, 4,500+ Weekly Tournaments And Free Cloud Tools.',
        foundingDate: '2025-10',
        publishingPrinciples: `${SITE}/editorial-standards`,
        verificationFactCheckingPolicy: `${SITE}/verification-methodology`,
        correctionsPolicy: `${SITE}/editorial-standards#corrections`,
        knowsAbout: [
          'Game Theory Optimal (GTO) Poker Strategy',
          'Texas Holdem And Pot-Limit Omaha Equity Calculation',
          'Independent Chip Model (ICM) Tournament Mathematics',
          'Live Casino Poker Room Directories And Tournament Series',
          'Poker Bankroll Accounting And IRS Form W-2G Tax Reporting',
          'Casino Poker Room Floor Management And Waitlists',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: SITE,
        name: 'Smarter.Poker',
        publisher: { '@id': `${SITE}/#organization` },
        inLanguage: ['en-US', 'es', 'pt', 'de', 'fr'],
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE}/hub/poker-near-me/lobby?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      ...VERTICAL_APPLICATIONS.map((app) => ({
        '@type': 'SoftwareApplication',
        '@id': `${app.url}#software`,
        name: app.name,
        applicationCategory: app.category,
        operatingSystem: 'Web, iOS, Android, macOS, Windows',
        url: app.url,
        description: app.description,
        publisher: { '@id': `${SITE}/#organization` },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      })),
      {
        '@type': 'Dataset',
        '@id': `${SITE}/hub/poker-near-me/venues#dataset`,
        name: 'North American Verified Live Poker Room Directory Dataset',
        description: 'Structured Directory Of 324+ Active Casino Poker Rooms, Cardrooms And Social Poker Clubs Across The United States And Canada.',
        url: `${SITE}/hub/poker-near-me/venues`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': `${SITE}/#organization` },
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/api/ai/venues` },
          { '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: `${SITE}/hub/poker-near-me/venues.md` },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${SITE}/hub/daily-tournaments#dataset`,
        name: 'North American Daily Poker Tournament Schedule Dataset',
        description: 'Recurring Weekly And Daily Live Poker Tournament Schedules, Buy-Ins, Blind Levels And Guarantees Across 324+ Venues.',
        url: `${SITE}/hub/daily-tournaments`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': `${SITE}/#organization` },
        distribution: [
          { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${SITE}/api/ai/tournaments` },
          { '@type': 'DataDownload', encodingFormat: 'text/markdown', contentUrl: `${SITE}/hub/daily-tournaments.md` },
        ],
      },
      {
        '@type': 'DefinedTermSet',
        '@id': `${SITE}/glossary#termset`,
        name: 'Smarter.Poker Official Poker Strategy & Rules Glossary',
        url: `${SITE}/glossary`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: GLOSSARY_TERMS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn#curriculum`,
        name: 'Smarter.Poker 40-Lesson Answer-First GTO Strategy Curriculum',
        url: `${SITE}/learn`,
        publisher: { '@id': `${SITE}/#organization` },
        about: LEARN_CATEGORIES,
        numberOfItems: LESSONS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/hands#encyclopedia`,
        name: 'Smarter.Poker Starting Hand Encyclopedia',
        url: `${SITE}/learn/hands`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: STARTING_HANDS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/compare#comparisons`,
        name: 'Smarter.Poker Primary-Source Competitor Comparison Matrix',
        url: `${SITE}/compare`,
        dateModified: AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: COMPARE_PAGES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/rules#encyclopedia`,
        name: 'Smarter.Poker Official Poker Rules & Casino Floor Rulings Encyclopedia (TDA & RROP)',
        url: `${SITE}/rules`,
        dateModified: RULES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_RULES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/games#variants`,
        name: 'Smarter.Poker Poker Variants & Mixed Games Encyclopedia',
        url: `${SITE}/games`,
        dateModified: GAMES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_VARIANTS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-rooms/guides#markets`,
        name: 'Smarter.Poker US Regional Live Poker Market Strategy Guides',
        url: `${SITE}/poker-rooms/guides`,
        dateModified: MARKET_GUIDES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_MARKET_GUIDES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/matchups#matchups`,
        name: 'Smarter.Poker 25 Pre-Flop Hand-Vs-Hand Equity Matchup Encyclopedia',
        url: `${SITE}/learn/matchups`,
        dateModified: MATCHUPS_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: HAND_MATCHUPS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-series/guides#series-guides`,
        name: 'Smarter.Poker 10 Major Poker Series Strategy, Structure & Bankroll Guides',
        url: `${SITE}/poker-series/guides`,
        dateModified: SERIES_GUIDES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: SERIES_GUIDES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/positions#positions`,
        name: 'Smarter.Poker 9-Seat Poker Position Strategy Encyclopedia',
        url: `${SITE}/learn/positions`,
        dateModified: POSITIONS_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_POSITIONS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/stakes#stakes`,
        name: 'Smarter.Poker Stake Level & Move-Up Readiness Authority Hub',
        url: `${SITE}/learn/stakes`,
        dateModified: STAKES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_STAKES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/famous-hands#famous-hands`,
        name: 'Smarter.Poker Famous Historic Poker Hands & GTO Solver Archive',
        url: `${SITE}/learn/famous-hands`,
        dateModified: FAMOUS_HANDS_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: FAMOUS_HANDS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/roadmaps#roadmaps`,
        name: 'Smarter.Poker 90-Day Structured Poker Player Progression Roadmaps',
        url: `${SITE}/learn/roadmaps`,
        dateModified: ROADMAPS_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: POKER_ROADMAPS.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/player-types#player-types`,
        name: 'Smarter.Poker 8 Poker Player Archetypes & Exploitative Strategy Hub',
        url: `${SITE}/learn/player-types`,
        dateModified: PLAYER_TYPES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: PLAYER_ARCHETYPES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/board-textures#board-textures`,
        name: 'Smarter.Poker 12 Canonical Flop Board Textures & GTO C-Bet Encyclopedia',
        url: `${SITE}/learn/board-textures`,
        dateModified: BOARD_TEXTURES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: BOARD_TEXTURES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-rooms/states#states`,
        name: `Smarter.Poker ${US_POKER_STATES.length} US State & DC Poker Legality, Tax Withholding & Room Directory`,
        url: `${SITE}/poker-rooms/states`,
        dateModified: STATES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: US_POKER_STATES.length,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-rooms/international#international`,
        name: 'Smarter.Poker 10 International Live Poker Destinations & Global Casino Authority Guide',
        url: `${SITE}/poker-rooms/international`,
        dateModified: INTERNATIONAL_GUIDES_AS_OF,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: INTERNATIONAL_POKER_GUIDES.length,
      },
      {
        '@type': 'HowTo',
        '@id': `${SITE}/poker-rooms/first-time-guide#guide`,
        name: 'First-Time Live Poker Room Etiquette, Tipping & Check-In Guide',
        description:
          'Step-By-Step Casino Poker Room Check-In Procedure, TDA Floor Rules, Dealer Tipping Standards And Table Etiquette For First-Time Live Players.',
        url: `${SITE}/poker-rooms/first-time-guide`,
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE}/press#press-kit`,
        name: 'Smarter.Poker Official Media & Press Fact Sheet (52 Calculators, 70 MCP Tools & 44 Commands)',
        description:
          'Verified 2026 Industry Benchmarks, CC-BY 4.0 Open Datasets, Academic Citations (BibTeX/APA), 52 Free Poker Calculators, 70 Zero-Auth MCP Tools And 44 Streamer Bot Commands.',
        url: `${SITE}/press`,
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/tools#calculators`,
        name: 'Smarter.Poker 52 Free Interactive Poker Math, ICM, Tax & Strategy Calculators',
        url: `${SITE}/tools`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 52,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/formulas#formulas`,
        name: 'Smarter.Poker 15 Quantitative Poker Math Formulas & LaTeX Proofs Encyclopedia',
        url: `${SITE}/learn/formulas`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 15,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/tournament-stages#stages`,
        name: 'Smarter.Poker 8-Stage Multi-Table Tournament (MTT) Strategy Playbook',
        url: `${SITE}/learn/tournament-stages`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 8,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/leaks#leaks`,
        name: 'Smarter.Poker 12 Common Poker Leaks & BB/100 EV Cures Diagnostic Hub',
        url: `${SITE}/learn/leaks`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 12,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/hud-stats#hud-stats`,
        name: 'Smarter.Poker 15 Poker HUD Statistics GTO 6-Max & 9-Max Benchmark Hub',
        url: `${SITE}/learn/hud-stats`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 15,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/learn/poker-myths-debunked#myths`,
        name: 'Smarter.Poker 15 Poker Myths Debunked With Solver Equilibrium Proof',
        url: `${SITE}/learn/poker-myths-debunked`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 15,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-rooms/corridors#corridors`,
        name: 'Smarter.Poker 10 US Airport & Metro Border Live Poker Travel Corridors',
        url: `${SITE}/poker-rooms/corridors`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 10,
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/poker-rooms/by-game#by-game`,
        name: 'Smarter.Poker Live Poker Rooms By Game Variant Directory (6 Variants)',
        url: `${SITE}/poker-rooms/by-game`,
        publisher: { '@id': `${SITE}/#organization` },
        numberOfItems: 6,
      },
      {
        '@type': 'Report',
        '@id': `${SITE}/research/annual-state-of-poker-2026#whitepaper`,
        headline: '2026 Annual State Of Live & Online Poker Whitepaper',
        url: `${SITE}/research/annual-state-of-poker-2026`,
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'Dataset',
        '@id': `${SITE}/facts#facts-ledger`,
        name: 'Smarter.Poker Atomic Poker Facts & AI Citation Ledger',
        url: `${SITE}/facts`,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': `${SITE}/#organization` },
      },
      ...RESEARCH_REPORTS.map((r) => ({
        '@type': 'Report',
        '@id': `${SITE}/research/${r.slug}#report`,
        headline: r.title,
        description: r.summary || r.description,
        url: `${SITE}/research/${r.slug}`,
        datePublished: r.publishedDate || r.published,
        dateModified: r.modifiedDate || r.updated,
        publisher: { '@id': `${SITE}/#organization` },
      })),
      {
        '@type': 'ItemList',
        '@id': `${SITE}/hub/training#simulator-catalog`,
        name: 'Smarter.Poker Interactive World Hub Tools & GTO Simulators Catalog',
        description:
          'Complete Directory Of Public Interactive Poker Simulators, Leak Scanners, ICM Calculators, Range Builders And Training Drills In The Smarter.Poker World Hub.',
        url: `${SITE}/features`,
        numberOfItems: Object.keys(SCHEMA_ROUTES).length + TRAINING_LIBRARY.length,
        itemListElement: Object.entries(SCHEMA_ROUTES).map(([key, route], idx) => {
          const summaries = getHubPageSummaries();
          const entry = summaries[key];
          const title = entry ? entry.heading.replace(/^About (The )?/i, '') : key;
          return {
            '@type': 'ListItem',
            position: idx + 1,
            name: title,
            url: `${SITE}${route.path}`,
            description: entry?.lead || '',
          };
        }),
      },
    ],
  };
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const graph = buildKnowledgeGraph();
  res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'index, follow, max-snippet:-1');
  return res.status(200).send(JSON.stringify(graph, null, 2));
}
