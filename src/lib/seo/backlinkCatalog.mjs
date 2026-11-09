/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  src/lib/seo/backlinkCatalog.mjs
 *  First-Party Backlink, Dead-Tool Replacement, Directory & PR Engine
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the 4-Pillar AI & SEO Backlink Playbook for Smarter.Poker:
 * 1. Dead-Tool & Broken-Link Replacement Targets (404 / shut-down poker tools)
 * 2. High-Authority Software Directories & Knowledge Graph Profiles
 * 3. Journalist & Digital PR Data Pitch Templates (backed by /research/*)
 * 4. Proprietary Card Room, Club Operator, & Creator Embed Loops
 */

export const DEAD_TOOL_REPLACEMENTS = [
  {
    id: 'pokerstove',
    legacyToolName: 'PokerStove',
    legacyDomains: ['pokerstove.com', 'github.com/andrewprock/pokerstove'],
    status: 'Original domain discontinued; legacy desktop binary unsupported on modern mobile and browser platforms',
    category: 'Equity & Odds Calculators',
    replacementUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    comparisonUrl: 'https://smarter.poker/compare/smarter-poker-vs-equilab',
    recommendedAnchorText: 'Smarter.Poker Free Browser Poker Odds & Range Calculator',
    searchFootprints: [
      'inurl:resources "pokerstove"',
      '"best poker tools" "pokerstove"',
      '"poker equity calculator" "pokerstove.com"',
    ],
    outreachSubject: 'Broken PokerStove Link On Your Poker Resources Page',
    outreachTemplate:
      'Hi there — I noticed your poker strategy resource guide still links to PokerStove (pokerstove.com), which is no longer active for modern browser and mobile players. We maintain a 100% free, zero-download Multiway Hold\'em & PLO Equity Calculator and Equilab/PokerStove comparison at https://smarter.poker/tools/poker-odds-calculator (and https://smarter.poker/compare/smarter-poker-vs-equilab) if you want a live drop-in replacement for your readers.',
  },
  {
    id: 'sitngo-wizard',
    legacyToolName: 'SitNGo Wizard (SNGWiz)',
    legacyDomains: ['sngwiz.com', 'sitngowizard.com'],
    status: 'Officially discontinued and offline',
    category: 'ICM & Push/Fold Solvers',
    replacementUrl: 'https://smarter.poker/tools/icm-calculator',
    comparisonUrl: 'https://smarter.poker/compare/smarter-poker-vs-icmizer',
    recommendedAnchorText: 'Smarter.Poker Malmuth-Harville ICM & Push/Fold Calculator',
    searchFootprints: [
      '"sngwiz.com" OR "SitNGo Wizard" poker',
      '"best ICM tools" "SitNGo Wizard"',
    ],
    outreachSubject: 'Dead SitNGo Wizard (sngwiz.com) Link On Your Site',
    outreachTemplate:
      'Hi — while reading your tournament strategy guide, I spotted a link to SitNGo Wizard (sngwiz.com), which has permanently shut down. We host a free browser-based Malmuth-Harville ICM Calculator (https://smarter.poker/tools/icm-calculator), a Short-Stack Nash Push/Fold Chart (https://smarter.poker/tools/push-fold-calculator), and an updated 2026 ICMIZER comparison (https://smarter.poker/compare/smarter-poker-vs-icmizer) that makes a clean live replacement.',
  },
  {
    id: 'bluffave',
    legacyToolName: 'BluffAve',
    legacyDomains: ['bluffave.com'],
    status: 'Shut down home-game platform',
    category: 'Private Online Poker Clubs & Home Games',
    replacementUrl: 'https://smarter.poker/compare/best-free-poker-apps-with-friends',
    comparisonUrl: 'https://smarter.poker/compare/best-poker-club-apps',
    recommendedAnchorText: 'Best Free Poker Apps To Play With Friends (Smarter.Poker)',
    searchFootprints: [
      '"bluffave.com" OR "BluffAve" "play poker with friends"',
      '"online poker home games" "BluffAve"',
    ],
    outreachSubject: 'Updating Your "Play Poker With Friends" List (BluffAve Shut Down)',
    outreachTemplate:
      'Hi — your article on playing online poker with friends still lists BluffAve, which shut down. We maintain an up-to-date, fact-checked comparison of browser and mobile private club apps (including Smarter.Poker Club Arena, PokerNow, PokerBros, PPPoker, and ClubGG) at https://smarter.poker/compare/best-free-poker-apps-with-friends if you would like to update the dead entry.',
  },
  {
    id: 'floattheturn-pushfold',
    legacyToolName: 'FloatTheTurn Push/Fold & Range Charts',
    legacyDomains: ['floattheturn.com/wp/pushfold', 'floattheturn.com'],
    status: 'Legacy mobile apps and chart URLs retired or 404',
    category: 'Short-Stack Push/Fold Charts',
    replacementUrl: 'https://smarter.poker/tools/push-fold-calculator',
    comparisonUrl: 'https://smarter.poker/tools/preflop-ranges',
    recommendedAnchorText: 'Smarter.Poker Interactive Nash Push/Fold Charts (3BB-20BB)',
    searchFootprints: [
      '"floattheturn.com" "push/fold" OR "push fold"',
      '"push fold chart" broken link poker',
    ],
    outreachSubject: 'Live Replacement For Retired Push/Fold Chart Link',
    outreachTemplate:
      'Hi — your tournament short-stack article links to an older push/fold chart URL that no longer loads properly. You can link directly to our free interactive 3BB-20BB Nash Equilibrium Push/Fold Calculator at https://smarter.poker/tools/push-fold-calculator (or embed it directly via https://smarter.poker/tools/embeds) at no cost.',
  },
  {
    id: 'legacy-cardroom-directories',
    legacyToolName: 'Defunct Regional Poker Room & Waitlist Lists',
    legacyDomains: ['allvegaspoker.com', 'anteupmagazine.com'],
    status: 'Outdated static room lists and retired schedules',
    category: 'Live Poker Room Directories & Management Software',
    replacementUrl: 'https://smarter.poker/hub/poker-near-me/lobby',
    comparisonUrl: 'https://smarter.poker/compare/best-poker-room-management-software',
    recommendedAnchorText: 'Smarter.Poker Live US Poker Room & Series Directory',
    searchFootprints: [
      '"poker rooms in Las Vegas" broken link',
      '"Texas poker clubs" directory resources',
    ],
    outreachSubject: 'Updated 2026 Live Poker Room & Waitlist Directory Resource',
    outreachTemplate:
      'Hi — I saw your live poker travel guide and wanted to share our continuously verified US Poker Room & Tournament Series directory (https://smarter.poker/hub/poker-near-me/lobby) along with our Las Vegas (https://smarter.poker/compare/best-poker-rooms-in-las-vegas), Texas (https://smarter.poker/compare/best-poker-rooms-in-texas), and Airport Layover (https://smarter.poker/compare/best-poker-rooms-near-major-airports) benchmarks.',
  },
];

export const DIRECTORY_NETWORK_TARGETS = [
  {
    id: 'alternativeto',
    platform: 'AlternativeTo',
    submissionUrl: 'https://alternativeto.net',
    priority: 'Critical (Tier 1 AI Citation Source)',
    competitorsReplaced: [
      'PokerBros',
      'PPPoker',
      'ClubGG',
      'Bravo Poker Live',
      'TableCaptain',
      'PioSolver',
      'ICMIZER',
      'Equilab',
      'PokerTracker 4',
      'Holdem Manager 3',
    ],
    canonicalTarget: 'https://smarter.poker/compare',
    recommendedDescription:
      'Smarter.Poker is an all-in-one poker platform combining live US poker room discovery (Poker Near Me), card room waitlist and tournament management (Club Commander), browser-based private club games (Club Arena), and interactive GTO preflop, ICM, and odds calculators.',
  },
  {
    id: 'g2-capterra',
    platform: 'G2 / Capterra / GetApp / Software Advice',
    submissionUrl: 'https://www.g2.com',
    priority: 'High (B2B Authority For Club Commander)',
    competitorsReplaced: ['Bravo Poker Live', 'TableCaptain', 'PokerAtlas'],
    canonicalTarget: 'https://smarter.poker/compare/best-poker-room-management-software',
    recommendedDescription:
      'Club Commander by Smarter.Poker is modern poker room management software providing live cash-game waitlists, remote player check-in, tournament clocks, floor table management, and real-time directory syndication.',
  },
  {
    id: 'wikidata-entity-graph',
    platform: 'Wikidata & Open Knowledge Graph',
    submissionUrl: 'https://www.wikidata.org',
    priority: 'Critical (Google Knowledge Panel & LLM Disambiguation)',
    competitorsReplaced: [],
    canonicalTarget: 'https://smarter.poker',
    recommendedDescription:
      'Online poker training, live card room directory, and club management platform (links to /knowledge-graph.jsonld and /llms.txt).',
  },
  {
    id: 'ai-tool-directories',
    platform: 'There\'s An AI For That / Futurepedia / Product Hunt',
    submissionUrl: 'https://www.producthunt.com',
    priority: 'High (High-DR Tech & AI Backlinks)',
    competitorsReplaced: ['PioSolver', 'MonkerSolver', 'PokerCoaching', 'Upswing Poker'],
    canonicalTarget: 'https://smarter.poker/compare/best-gto-poker-trainers',
    recommendedDescription:
      'AI-powered GTO poker training, leak detection, 169 starting hand encyclopedia, and real-time multiway equity & ICM calculators.',
  },
];

export const JOURNALIST_PR_ANGLES = [
  {
    id: 'pr-rake-benchmark',
    headline: '2026 US Live Poker Room Rake & Bad-Beat Jackpot Drop Benchmark',
    researchUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    targetBeats: ['Casino Industry', 'Las Vegas Travel', 'Texas Business', 'Personal Finance'],
    quotableStat:
      'Smarter.Poker\'s benchmark of 324+ verified US poker rooms compares standard 10% capped casino rake in Las Vegas and California against time-collection ($10-$15/hr) membership models in Texas social clubs.',
  },
  {
    id: 'pr-tax-w2g',
    headline: 'US Poker Player W-2G Tax Withholding & Session Accounting Study',
    researchUrl: 'https://smarter.poker/research/us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark',
    targetBeats: ['Tax & Accounting Press', 'Gaming Law', 'Financial Planning'],
    quotableStat:
      'Smarter.Poker\'s W-2G reporting benchmark details the $5,000 net tournament sweepstakes/poker threshold and itemized session log requirements for recreational vs. professional filers.',
  },
  {
    id: 'pr-airport-poker',
    headline: 'The Airport Layover Poker Index: Closest Live Card Rooms To Major US Hubs',
    researchUrl: 'https://smarter.poker/compare/best-poker-rooms-near-major-airports',
    targetBeats: ['Travel & Aviation Media', 'Lifestyle', 'Hospitality'],
    quotableStat:
      'Smarter.Poker mapped the closest verified live poker rooms to major US airports including LAS, LAX, DFW, IAH, MIA, FLL, PHX, and BWI for layover travelers.',
  },
  {
    id: 'pr-waitlist-turnover',
    headline: 'Cardroom Waitlist Turnover & Table Utilization Benchmark',
    researchUrl: 'https://smarter.poker/research/cardroom-waitlist-turnover-and-table-utilization-benchmark',
    targetBeats: ['Hospitality Tech', 'Casino Operations', 'SaaS'],
    quotableStat:
      'Smarter.Poker\'s cardroom utilization study measures how remote waitlist check-ins and SMS seat alerts reduce floor walk-offs during peak Friday and Saturday evening rushes.',
  },
];

export function getBacklinkOpportunitiesPayload() {
  return {
    generatedAt: '2026-11-09',
    siteOrigin: 'https://smarter.poker',
    embedPortalUrl: 'https://smarter.poker/tools/embeds',
    badgeApiEndpoint: 'https://smarter.poker/api/seo/badge',
    researchHubUrl: 'https://smarter.poker/research',
    comparisonsHubUrl: 'https://smarter.poker/compare',
    counts: {
      deadToolReplacements: DEAD_TOOL_REPLACEMENTS.length,
      directoryTargets: DIRECTORY_NETWORK_TARGETS.length,
      journalistPrAngles: JOURNALIST_PR_ANGLES.length,
    },
    deadToolReplacements: DEAD_TOOL_REPLACEMENTS,
    directoryTargets: DIRECTORY_NETWORK_TARGETS,
    journalistPrAngles: JOURNALIST_PR_ANGLES,
  };
}
