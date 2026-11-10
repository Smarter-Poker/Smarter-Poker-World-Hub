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
      'Hi there - I noticed your poker strategy resource guide still links to PokerStove (pokerstove.com), which is no longer active for modern browser and mobile players. We maintain a 100% free, zero-download Multiway Hold\'em & PLO Equity Calculator and Equilab/PokerStove comparison at https://smarter.poker/tools/poker-odds-calculator (and https://smarter.poker/compare/smarter-poker-vs-equilab) if you want a live drop-in replacement for your readers.',
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
      'Hi - while reading your tournament strategy guide, I spotted a link to SitNGo Wizard (sngwiz.com), which has permanently shut down. We host a free browser-based Malmuth-Harville ICM Calculator (https://smarter.poker/tools/icm-calculator), a Short-Stack Nash Push/Fold Chart (https://smarter.poker/tools/push-fold-calculator), and an updated 2026 ICMIZER comparison (https://smarter.poker/compare/smarter-poker-vs-icmizer) that makes a clean live replacement.',
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
      'Hi - your article on playing online poker with friends still lists BluffAve, which shut down. We maintain an up-to-date, fact-checked comparison of browser and mobile private club apps (including Smarter.Poker Club Arena, PokerNow, PokerBros, PPPoker, and ClubGG) at https://smarter.poker/compare/best-free-poker-apps-with-friends if you would like to update the dead entry.',
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
      'Hi - your tournament short-stack article links to an older push/fold chart URL that no longer loads properly. You can link directly to our free interactive 3BB-20BB Nash Equilibrium Push/Fold Calculator at https://smarter.poker/tools/push-fold-calculator (or embed it directly via https://smarter.poker/tools/embeds) at no cost.',
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
      'Hi - I saw your live poker travel guide and wanted to share our continuously verified US Poker Room & Tournament Series directory (https://smarter.poker/hub/poker-near-me/lobby) along with our Las Vegas (https://smarter.poker/compare/best-poker-rooms-in-las-vegas), Texas (https://smarter.poker/compare/best-poker-rooms-in-texas), and Airport Layover (https://smarter.poker/compare/best-poker-rooms-near-major-airports) benchmarks.',
  },
  {
    id: 'propokertools-oracle',
    legacyToolName: 'ProPokerTools Odds Oracle Web Simulator',
    legacyDomains: ['propokertools.com', 'propokertools.com/simulations'],
    status: 'Legacy Java/Flash web simulator retired; desktop Odds Oracle discontinued',
    category: 'Multiway Hold\'em & Omaha Equity Calculators',
    replacementUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    comparisonUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    recommendedAnchorText: 'Smarter.Poker Multiway Hold\'em & PLO Equity Simulator',
    searchFootprints: [
      '"propokertools.com/simulations" poker',
      '"ProPokerTools" broken link OR alternative',
    ],
    outreachSubject: 'Broken ProPokerTools Simulation Link On Your Strategy Page',
    outreachTemplate:
      'Hi - your Omaha/Hold\'em math guide links to propokertools.com/simulations, which retired its online simulator. You can point readers to our free browser Multiway Equity Calculator (https://smarter.poker/tools/poker-odds-calculator) and Pot Odds & MDF Calculator (https://smarter.poker/tools/pot-odds-calculator) as a modern zero-install replacement.',
  },
  {
    id: 'legacy-pko-bounty-spreadsheets',
    legacyToolName: 'Broken Google Sheets PKO & Mystery Bounty Calculators',
    legacyDomains: ['docs.google.com/spreadsheets'],
    status: 'View-only or deleted community PKO chip conversion spreadsheets',
    category: 'PKO & Mystery Bounty Calculators',
    replacementUrl: 'https://smarter.poker/tools/bounty-calculator',
    comparisonUrl: 'https://smarter.poker/research/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study',
    recommendedAnchorText: 'Smarter.Poker PKO & Mystery Bounty Chip Equity Calculator',
    searchFootprints: [
      '"bounty calculator" poker spreadsheet broken',
      '"PKO chip conversion" calculator poker',
    ],
    outreachSubject: 'Interactive PKO & Mystery Bounty Calculator For Your Tournament Guide',
    outreachTemplate:
      'Hi - I noticed your knockout tournament article references a static bounty conversion sheet. We built an interactive PKO & Mystery Bounty Chip Equity Calculator at https://smarter.poker/tools/bounty-calculator paired with our empirical PKO vs. Mystery Bounty EV study (https://smarter.poker/research/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study) that you can link to or embed for free.',
  },
  {
    id: 'legacy-plo-pot-calculators',
    legacyToolName: 'Retired Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Spreadsheets',
    legacyDomains: ['plocalculator.com', 'omahaplanet.com'],
    status: 'Legacy Flash/spreadsheet PLO pot-size calculators offline or mobile-broken',
    category: 'Pot-Limit Omaha & Bomb Pot Calculators',
    replacementUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    comparisonUrl: 'https://smarter.poker/games/pot-limit-omaha-plo4',
    recommendedAnchorText: 'Smarter.Poker Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator',
    searchFootprints: [
      '"pot limit omaha calculator" broken link OR spreadsheet',
      '"how to calculate pot in PLO" dealer tool',
    ],
    outreachSubject: 'Free Pot-Limit Omaha (PLO) Max Bet & Bomb Pot Calculator For Your Guide',
    outreachTemplate:
      'Hi - while reading your Pot-Limit Omaha guide, I noticed a broken calculator reference. We built a free browser-native PLO Max Bet (3x + Trail) & Double-Board Bomb Pot Calculator at https://smarter.poker/tools/plo-bet-calculator alongside our PLO4/PLO5/PLO6 variant hub (https://smarter.poker/games/pot-limit-omaha-plo4) that your readers can use or embed for free.',
  },
  {
    id: 'legacy-rrop-tda-rule-pdfs',
    legacyToolName: 'Dead Robert\'s Rules Of Poker (RROP) & Outdated TDA Rule PDFs',
    legacyDomains: ['pokercoach.us/robrule', 'homepokertourney.com/roberts-rules-of-poker.htm'],
    status: 'Unindexed or 404 legacy text files and outdated tournament rule links',
    category: 'Official Poker Rules & Casino Floor Rulings',
    replacementUrl: 'https://smarter.poker/rules',
    comparisonUrl: 'https://smarter.poker/learn/poker-hand-rankings',
    recommendedAnchorText: 'Smarter.Poker Official TDA & Robert\'s Rules Of Poker (RROP) Encyclopedia',
    searchFootprints: [
      '"roberts rules of poker" broken link OR 404',
      '"official poker rules" "string bet" OR "side pot" resource page',
    ],
    outreachSubject: 'Searchable 2026 TDA & Robert\'s Rules Of Poker (RROP) Reference For Your Page',
    outreachTemplate:
      'Hi - I spotted an older Robert\'s Rules of Poker link on your home game rules page. We maintain a searchable, mobile-ready 30-rule TDA & Cash Game Floor Rulings Encyclopedia at https://smarter.poker/rules (plus our Official Poker Hand Rankings Cheat Sheet at https://smarter.poker/learn/poker-hand-rankings) if you want an updated live reference.',
  },
  {
    id: 'cardrunners-ev',
    legacyToolName: 'CardRunnersEV (CREV) Legacy Decision-Tree Calculator',
    legacyDomains: ['cardrunnersev.com'],
    status: 'Legacy Windows-only decision-tree software superseded by modern browser GTO tools',
    category: 'Preflop 3-Bet, 4-Bet & SPR Bet-Sizing Calculators',
    replacementUrl: 'https://smarter.poker/tools/3bet-calculator',
    comparisonUrl: 'https://smarter.poker/tools/spr-calculator',
    recommendedAnchorText: 'Smarter.Poker GTO 3-Bet, 4-Bet & SPR Geometric Bet Sizing Calculator',
    searchFootprints: [
      '"cardrunnersev.com" OR "CardRunnersEV" poker tool',
      '"CREV" poker EV calculator alternative',
    ],
    outreachSubject: 'Browser-Native Replacement For Legacy CardRunnersEV (CREV) Link',
    outreachTemplate:
      'Hi - your poker math resource page links to CardRunnersEV (cardrunnersev.com), an older Windows-only tool. We maintain a free browser-native GTO Preflop 3-Bet/4-Bet & MDF Calculator (https://smarter.poker/tools/3bet-calculator) and Stack-To-Pot Ratio (SPR) Geometric Sizing Calculator (https://smarter.poker/tools/spr-calculator) if you want a modern web replacement.',
  },
  {
    id: 'holdemresources-web',
    legacyToolName: 'HoldemResources (HRC) Retired Static Web Nash Charts',
    legacyDomains: ['holdemresources.net/h/web/calculators/nashicm.html', 'holdemresources.net/nashicm'],
    status: 'Legacy static web Nash URLs retired or redirected to paid desktop licensing',
    category: 'Short-Stack Push/Fold & Malmuth-Harville ICM Calculators',
    replacementUrl: 'https://smarter.poker/tools/push-fold-calculator',
    comparisonUrl: 'https://smarter.poker/compare/smarter-poker-vs-holdem-resources-calculator',
    recommendedAnchorText: 'Smarter.Poker Free Push/Fold Nash & ICM Calculator',
    searchFootprints: [
      '"holdemresources.net" "nashicm" poker',
      '"HoldemResources" free web calculator push fold',
    ],
    outreachSubject: 'Updated Link For Retired HoldemResources Web Nash Calculator URL',
    outreachTemplate:
      'Hi - your tournament strategy article links to an older holdemresources.net web calculator URL. You can link directly to our free browser Short-Stack Push/Fold Nash Calculator (https://smarter.poker/tools/push-fold-calculator) and HRC comparison guide (https://smarter.poker/compare/smarter-poker-vs-holdem-resources-calculator) so readers can run calculations without a desktop license.',
  },
  {
    id: 'pokerdope-variance',
    legacyToolName: 'Legacy Standalone Variance & Bankroll Calculators',
    legacyDomains: ['pokerdope.com/poker-variance-calculator'],
    status: 'Static desktop-era layout without mobile embed or Risk-of-Ruin stake guidance',
    category: 'Poker Variance, Downswing & Risk Of Ruin Simulators',
    replacementUrl: 'https://smarter.poker/tools/variance-calculator',
    comparisonUrl: 'https://smarter.poker/tools/bankroll-calculator',
    recommendedAnchorText: 'Smarter.Poker Variance, Confidence Interval & Risk Of Ruin Simulator',
    searchFootprints: [
      '"poker variance calculator" resources page',
      '"risk of ruin calculator" poker bankroll guide',
    ],
    outreachSubject: 'Embeddable Poker Variance & Risk Of Ruin Simulator For Your Bankroll Guide',
    outreachTemplate:
      'Hi - I read your poker bankroll and variance guide and wanted to share our free, mobile-ready Poker Variance & Downswing Simulator (https://smarter.poker/tools/variance-calculator) and Risk of Ruin Calculator (https://smarter.poker/tools/bankroll-calculator), both of which can also be embedded directly via https://smarter.poker/tools/embeds.',
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
    priority: 'High (Software & AI Product Directories)',
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

export const OPEN_DATASET_AND_ACADEMIC_MIRRORS = [
  {
    id: 'zenodo-open-doi',
    platform: 'Zenodo Open-Access Dataset Deposits & DOI Archival',
    domainAuthority: 'Open-Access Dataset Repository (doi.org / zenodo.org)',
    sourceUrl: 'https://smarter.poker/research',
    feedUrl: 'https://smarter.poker/api/feeds/research',
    strategy:
      'Archive the 15 Smarter.Poker empirical research studies and raw CSV/JSON tables as open CC-BY 4.0 dataset releases on Zenodo with persistent doi.org identifiers linking back to https://smarter.poker/research.',
  },
  {
    id: 'huggingface-kaggle-datasets',
    platform: 'HuggingFace Datasets & Kaggle Open Poker Benchmarks',
    domainAuthority: 'Open Machine Learning & Data Repositories (huggingface.co / kaggle.com)',
    sourceUrl: 'https://smarter.poker/learn/hands',
    feedUrl: 'https://smarter.poker/tools/preflop-ranges',
    strategy:
      'Syndicate the 169 Canonical Starting Hand dataset (https://smarter.poker/learn/hands) and 100BB 6-Max GTO Preflop Range matrices (https://smarter.poker/tools/preflop-ranges) with dataset cards pointing to Smarter.Poker.',
  },
  {
    id: 'wikipedia-citation-replacement',
    platform: 'Wikipedia & Wikimedia Dead-Citation Replacements',
    domainAuthority: 'Encyclopedia & Knowledge Graph Citations (en.wikipedia.org / wikidata.org)',
    sourceUrl: 'https://smarter.poker/glossary',
    feedUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    strategy:
      'Propose replacements on Wikipedia talk pages (following WP:COI) where dead citations exist on poker articles (Independent Chip Model, Pot odds, Texas hold \'em starting hands, Cardroom, Rake) using Smarter.Poker empirical studies and mathematical glossary pages.',
  },
];

export const INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS = [
  {
    id: 'mcp-agent-registries',
    channel: 'Official Model Context Protocol (MCP) Server Directories',
    targets: ['smithery.ai', 'glama.ai/mcp/servers', 'mcp.so', 'pulsemcp.com', 'github.com/modelcontextprotocol/servers'],
    canonicalTarget: 'https://smarter.poker/api/mcp',
    valueProposition:
      'Register Smarter.Poker\'s zero-auth 35-tool MCP server, 15 resource templates, and /.well-known/mcp.json so developer directories and AI agent hubs can discover https://smarter.poker.',
  },
  {
    id: 'collegiate-quant-clubs',
    channel: 'University (.edu) Poker, Game Theory, & Quant Trading Clubs',
    targets: ['MIT Pokerbots', 'CMU Computer Poker', 'Stanford Quant & Poker Club', 'UC Berkeley Poker Club', 'Wharton Poker Club'],
    canonicalTarget: 'https://smarter.poker/tools/embeds',
    valueProposition:
      'Provide free zero-script GTO calculator embeds (https://smarter.poker/tools/embeds), BibTeX citations, and Club Arena private tournament hosting for collegiate .edu syllabus and club resource pages.',
  },
  {
    id: 'regional-tourism-guides',
    channel: 'Convention Bureaus, Airport Layover Blogs, & Regional Travel Guides',
    targets: ['Las Vegas Travel Blogs', 'Texas Entertainment Guides', 'Florida Casino Guides', 'Aviation Layover Blogs'],
    canonicalTarget: 'https://smarter.poker/compare/best-poker-rooms-near-major-airports',
    valueProposition:
      'Link regional travel guides to verified state/city cardroom comparisons (https://smarter.poker/compare/best-poker-rooms-in-las-vegas, https://smarter.poker/compare/best-poker-rooms-in-texas, https://smarter.poker/compare/best-poker-rooms-in-florida, https://smarter.poker/poker-rooms/guides/los-angeles-california).',
  },
];

export const BACKLINK_EXECUTION_TODO_CHECKLIST = [
  {
    id: 'unlinked-brand-reclamation',
    priority: 'P0 (Direct Brand Attribution Reclamation)',
    title: 'Unlinked Brand Mention Reclamation Loop',
    searchQuery: '"Smarter.Poker" OR "Smarter Poker" OR "Club Commander" -site:smarter.poker',
    targetLandingUrl: 'https://smarter.poker/about',
    actionPlan:
      'Monitor weekly web and forum mentions of Smarter.Poker, Club Commander, and Poker Near Me that lack a hyperlink, and send a 2-sentence thank-you outreach email supplying the exact canonical URL.',
  },
  {
    id: 'competitor-404-hijacking',
    priority: 'P0 (Immediate Broken-Link Replacement)',
    title: 'Competitor 404 Broken-Backlink Hijacking',
    searchQuery: 'site:pokeratlas.com OR site:bravopokerlive.com OR site:pocketfives.com HTTP 404 inbound links',
    targetLandingUrl: 'https://smarter.poker/compare',
    actionPlan:
      'Export external pages linking to dead 404 URLs on legacy poker directories and training sites, and offer webmasters the live Smarter.Poker calculator, research study, or venue directory equivalent.',
  },
  {
    id: 'annual-cardroom-award-badges',
    priority: 'P1 (Casino & Cardroom Directory Attribution Badges)',
    title: 'Annual Top 50 US Poker Rooms & Regional Card Club Award Badges',
    searchQuery: 'https://smarter.poker/api/seo/badge?type=venue&theme=gold',
    targetLandingUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    actionPlan:
      'Issue verified gold SVG directory badges to poker rooms in Las Vegas, Texas, Florida, and California so venue webmasters can display the badge on their website with a canonical attribution link to our benchmark study.',
  },
  {
    id: 'gaming-cpa-tax-w2g-outreach',
    priority: 'P1 (Finance, Legal & Tax Advisory Resource Links)',
    title: 'Gaming CPA, Tax Attorney & Enrolled Agent Form W-2G Resource Links',
    searchQuery: '"Form W-2G" poker tax accountant resources OR "gambling losses Schedule C"',
    targetLandingUrl: 'https://smarter.poker/features/bankroll-tax-tracker',
    actionPlan:
      'Pitch our free Form W-2G Tax Ledger (https://smarter.poker/features/bankroll-tax-tracker) and W-2G Reporting Benchmark (https://smarter.poker/research/us-poker-player-tax-w2g-reporting-and-session-accounting-benchmark) to CPA firms and tax guides.',
  },
  {
    id: 'casino-dealer-schools',
    priority: 'P1 (Vocational & Hospitality Education Resource Links)',
    title: 'Casino Dealer Schools & Hospitality Career Center Resource Links',
    searchQuery: '"poker dealer school" student resources OR "casino dealing school"',
    targetLandingUrl: 'https://smarter.poker/features/poker-dealer-toke-tracker',
    actionPlan:
      'Provide casino dealing schools and hospitality programs with our free Dealer Toke & Shift Tracker (https://smarter.poker/features/poker-dealer-toke-tracker) and Dealer Toke Benchmark (https://smarter.poker/research/poker-dealer-toke-and-hourly-rate-benchmark).',
  },
  {
    id: 'npm-pypi-open-source-packages',
    priority: 'P1 (Public Developer Package Registries)',
    title: 'Open-Source npmjs.com & pypi.org MCP & Poker Math Package Listings',
    searchQuery: 'npmjs.com / pypi.org @smarter-poker/mcp-connector',
    targetLandingUrl: 'https://smarter.poker/api/mcp',
    actionPlan:
      'Publish lightweight open-source CLI/MCP wrapper packages on npmjs.com and pypi.org whose repository, homepage, and README metadata link to https://smarter.poker and https://smarter.poker/api/mcp.',
  },
  {
    id: 'streamer-obs-chatbot-commands',
    priority: 'P2 (Recurring YouTube Description & Twitch Panel Attribution)',
    title: 'Twitch / YouTube Streamer OBS Overlay & !odds / !icm Chatbot Integration',
    searchQuery: 'poker vloggers twitch streamers live hand analysis',
    targetLandingUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    actionPlan:
      'Supply poker livestreamers and YouTube vloggers with a free Nightbot/StreamElements !odds and !icm command plus transparent OBS equity overlay paired with an attribution link in their video descriptions.',
  },
  {
    id: 'multilingual-international-syndication',
    priority: 'P2 (Global Non-English Poker Portal Syndication)',
    title: 'Multilingual International Poker Portal Syndication (ES, PT, DE, FR, IT, JA)',
    searchQuery: 'calculadora de odds poker / calculadora ICM poker gratis',
    targetLandingUrl: 'https://smarter.poker/tools/embeds',
    actionPlan:
      'Pitch Brazilian, Spanish, Latin American, German, French, Italian, and Japanese poker portals using our localized grounding corpora (https://smarter.poker/llms-es.txt, https://smarter.poker/llms-pt.txt) and free iframe embeds (https://smarter.poker/tools/embeds).',
  },
];

export function getBacklinkOpportunitiesPayload() {
  return {
    generatedAt: '2026-11-10',
    siteOrigin: 'https://smarter.poker',
    embedPortalUrl: 'https://smarter.poker/tools/embeds',
    oneLineWidgetSdkUrl: 'https://smarter.poker/embed-sdk.js',
    oembedEndpointUrl: 'https://smarter.poker/api/seo/oembed',
    badgeApiEndpoint: 'https://smarter.poker/api/seo/badge',
    researchHubUrl: 'https://smarter.poker/research',
    researchJsonFeedUrl: 'https://smarter.poker/api/feeds/research',
    datasetCatalogUrl: 'https://smarter.poker/api/datasets/catalog',
    outreachGeneratorUrl: 'https://smarter.poker/api/seo/outreach-generator',
    streamerChatbotUrl: 'https://smarter.poker/api/stream/cmd',
    comparisonsHubUrl: 'https://smarter.poker/compare',
    counts: {
      deadToolReplacements: DEAD_TOOL_REPLACEMENTS.length,
      directoryTargets: DIRECTORY_NETWORK_TARGETS.length,
      journalistPrAngles: JOURNALIST_PR_ANGLES.length,
      openDatasetMirrors: OPEN_DATASET_AND_ACADEMIC_MIRRORS.length,
      institutionalChannels: INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS.length,
      executionTodoChecklist: BACKLINK_EXECUTION_TODO_CHECKLIST.length,
    },
    deadToolReplacements: DEAD_TOOL_REPLACEMENTS,
    directoryTargets: DIRECTORY_NETWORK_TARGETS,
    journalistPrAngles: JOURNALIST_PR_ANGLES,
    openDatasetMirrors: OPEN_DATASET_AND_ACADEMIC_MIRRORS,
    institutionalChannels: INSTITUTIONAL_AND_ECOSYSTEM_CHANNELS,
    executionTodoChecklist: BACKLINK_EXECUTION_TODO_CHECKLIST,
  };
}
