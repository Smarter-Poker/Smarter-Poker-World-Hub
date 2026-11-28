/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Smarter.Poker Open Dataset, Zenodo/DataCite & Wikipedia Citation Catalog
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Powers /api/datasets/catalog and the MCP citation kit:
 * 1. Schema.org DataCatalog & Dataset JSON-LD for Google Dataset Search
 * 2. Zenodo / DataCite (.zenodo.json) & GitHub CITATION.cff academic manifests
 * 3. Wikipedia / MediaWiki ({{cite web}} & {{cite techreport}}) reference templates
 *
 * House style: Title Case, zero em dashes.
 */

import { RESEARCH_REPORTS } from '../../content/research/reports.js';
import { US_POKER_STATES } from '../../content/guides/states.js';
import { POKER_POSITIONS } from '../../content/learn/positions.js';
import { FAMOUS_HANDS } from '../../content/learn/famousHands.js';
import { POKER_STAKES } from '../../content/learn/stakes.js';
import { BOARD_TEXTURES } from '../../content/learn/boardTextures.js';
import { PLAYER_ARCHETYPES } from '../../content/learn/playerTypes.js';
import { INTERNATIONAL_POKER_GUIDES } from '../../content/guides/internationalMarkets.js';
import { VENUE_COUNT_LABEL } from '../venueCount.mjs';

export const ZENODO_RECORDS = [
  {
    id: 'zenodo-24115647',
    doi: '10.5281/zenodo.24115647',
    conceptDoi: '10.5281/zenodo.24095048',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    title: 'Core Open Quantitative Poker Research Datasets (22 CSV & JSON Datasets)',
    datasetCount: 22,
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    id: 'zenodo-24115636',
    doi: '10.5281/zenodo.24115636',
    conceptDoi: '10.5281/zenodo.24095056',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115636',
    zenodoUrl: 'https://zenodo.org/records/24115636',
    title: '55-Tool Model Context Protocol (MCP) Server Archive',
    toolCount: 55,
    swhid: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
  },
  {
    id: 'zenodo-24115447',
    doi: '10.5281/zenodo.24115447',
    conceptDoi: '10.5281/zenodo.24095559',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115447',
    zenodoUrl: 'https://zenodo.org/records/24115447',
    title: 'North American Live Poker Room, Regional Market & Tournament Series Benchmark Dataset',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    id: 'zenodo-24115452',
    doi: '10.5281/zenodo.24115452',
    conceptDoi: '10.5281/zenodo.24095563',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115452',
    zenodoUrl: 'https://zenodo.org/records/24115452',
    title: '100BB 6-Max GTO Preflop Ranges, 169 Starting Hands & 25 Canonical Matchup Benchmarks',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    id: 'zenodo-24115453',
    doi: '10.5281/zenodo.24115453',
    conceptDoi: '10.5281/zenodo.24095596',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115453',
    zenodoUrl: 'https://zenodo.org/records/24115453',
    title: 'Smarter.Poker 55-Tool Model Context Protocol (MCP) Server & OpenAPI 3.1 Specification v1.0.7',
    toolCount: 55,
    swhid: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
  },
  {
    id: 'zenodo-24115454',
    doi: '10.5281/zenodo.24115454',
    conceptDoi: '10.5281/zenodo.24095601',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115454',
    zenodoUrl: 'https://zenodo.org/records/24115454',
    title: 'Official Poker Rules (TDA & RROP), 15 Game Variants & 80-Term Quantitative Glossary Corpus',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
];

export const AUTHORITY_HUB_DATASETS = [
  {
    slug: 'us-state-poker-legality-and-tax-2026',
    title: 'US State-By-State Poker Legality, Tax Withholding & Live Cardroom Benchmark Dataset (2026)',
    shortTitle: 'US State Poker Legality & Tax Benchmarks (2026)',
    category: 'Regulatory & Tax Economics',
    publishedDate: '2026-11-10',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/poker-rooms/states',
    markdownUrl: 'https://smarter.poker/poker-rooms/states.md',
    summary: `State-By-State Legal Status, Minimum Age, State Income Tax Withholding Rates, And Rake Models Across ${US_POKER_STATES.length} Leading US Poker Jurisdictions.`,
    rowCount: US_POKER_STATES.length,
    rows: US_POKER_STATES,
    keyFindings: [
      'Nevada, Texas, And Florida Levy 0.0% State Individual Income Tax On Poker And Tournament Winnings.',
      'Pennsylvania, New Jersey, Michigan, And Nevada Share Regulated Multi-State Online Poker Liquidity Under MSIGA.',
      'Texas Private Membership Card Clubs Operate With 0% Pot Rake Under Hourly Seat-Access Fee Models.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'table-seat-position-gto-benchmarks-2026',
    title: '9-Seat Table Position GTO Raise-First-In (RFI), 3-Bet & Winrate Benchmark Dataset (2026)',
    shortTitle: '9-Seat Table Position GTO Benchmarks (2026)',
    category: 'GTO Preflop & Positional Strategy',
    publishedDate: '2026-11-10',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/learn/positions',
    markdownUrl: 'https://smarter.poker/learn/positions.md',
    summary: `Seat-By-Seat 100BB Raise-First-In (RFI), 3-Bet, Cold-Call, And Expected BB/100 Winrate Benchmarks Across All ${POKER_POSITIONS.length} Canonical Poker Table Positions.`,
    rowCount: POKER_POSITIONS.length,
    rows: POKER_POSITIONS,
    keyFindings: [
      'Raise-First-In (RFI) Frequencies Scale Monotonically From 10.5% Under The Gun (UTG) To 44.5% On The Dealer Button (BTN).',
      'The Dealer Button Generates The Highest Expected Long-Term Winrate At +38.5 BB/100 Due To Absolute Postflop Positional Closure.',
      'Modern GTO Small Blind Strategy Uses A 13.5% Linear 3-Bet-Or-Fold Approach against Open Raises To Avoid Raked Out-Of-Position Multiway Pots.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'famous-historic-poker-hands-solver-2026',
    title: 'Famous Historic Televised & Championship Poker Hands GTO Solver Audit Dataset (2026)',
    shortTitle: 'Famous Historic Poker Hands Solver Dataset (2026)',
    category: 'GTO Solver & Historical Forensics',
    publishedDate: '2026-11-10',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/learn/famous-hands',
    markdownUrl: 'https://smarter.poker/learn/famous-hands.md',
    summary: `Combinatoric Equity, Blocker Removal, Minimum Defense Frequency (MDF), And GTO Solver Verdicts Across ${FAMOUS_HANDS.length} Iconic Televised And WSOP Championship Hands.`,
    rowCount: FAMOUS_HANDS.length,
    rows: FAMOUS_HANDS,
    keyFindings: [
      'Chris Moneymaker\'s 2003 WSOP River All-In Bluff Held The Bare King Of Spades Blocker Against A 36.7% Minimum Defense Frequency Threshold.',
      'In The 2022 Garrett Adelstein (8c 7c) Vs. Robbi Jade Lew (Jc 4h) Turn All-In, 8c 7c Held A 53.4% To 46.6% Mathematical Equity Lead.',
      'Final Table ICM Risk Premiums Add 15% To 22% Extra Required Calling Equity On High-Roller Pay-Jump Bubbles.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'stake-level-bankroll-and-rake-benchmarks-2026',
    title: 'Live & Online Poker Stake-Level Bankroll, Rake Drag & Winrate Benchmark Dataset (2026)',
    shortTitle: 'Stake-Level Bankroll & Rake Benchmarks (2026)',
    category: 'Bankroll & Stake Progression',
    publishedDate: '2026-11-10',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/learn/stakes',
    markdownUrl: 'https://smarter.poker/learn/stakes.md',
    summary: `Recommended 5% Risk-Of-Ruin Bankrolls, Rake Profiles, Hourly Winrate Expectations, And Move-Up Criteria Across ${POKER_STAKES.length} Live And Online Stake Tiers.`,
    rowCount: POKER_STAKES.length,
    rows: POKER_STAKES,
    keyFindings: [
      'Stepping Up From $1/$2 To $2/$5 Live Cash Cuts Relative Rake Cap Drag From 3.0 BB Per Pot Down To 1.2 BB Per Pot.',
      'Live Pot-Limit Omaha ($1/$2/$5 And $5/$5) Requires 40 To 50 Full Buy-Ins Due To Compressed 60/40 All-In Equity Variance.',
      'Live Multi-Table Tournament Grinders Require 100 To 150 Average Buy-Ins Despite Sustaining 35% To 85% ROI In Soft Regional Fields.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'flop-board-textures-gto-cbet-2026',
    title: '12 Canonical Flop Board Textures GTO C-Bet Frequency, Sizing & Check-Raise Dataset (2026)',
    shortTitle: 'Flop Board Textures GTO C-Bet Dataset (2026)',
    category: 'GTO Postflop & Board Texture Analysis',
    publishedDate: '2026-11-24',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/learn/board-textures',
    markdownUrl: 'https://smarter.poker/learn/board-textures.md',
    summary: `Range Advantage, Nut Advantage, Optimal GTO C-Bet Frequency, Bet Sizing, And Check-Raise Benchmarks Across ${BOARD_TEXTURES.length} Canonical No-Limit Hold'em Flop Board Textures.`,
    rowCount: BOARD_TEXTURES.length,
    rows: BOARD_TEXTURES,
    keyFindings: [
      'Static Dry High Flops (A-7-2r And K-7-2r) Support 85% To 96% Small 33% Pot Range Continuation Bets From The In-Position Preflop Raiser.',
      'Low Connected Dynamic Flops (8-7-6 Two-Tone) Shift Nut Advantage To The Big Blind Defender, Forcing The Preflop Raiser To Check 65% To 78% Of Hands.',
      'Low-Paired Textures (7-4-4 Rainbow) Trigger The Highest Big Blind Check-Raise Frequencies In Hold\'em At 19% To 26%.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'poker-player-archetypes-exploits-2026',
    title: '8 Canonical Poker Player Archetypes HUD VPIP/PFR/3-Bet & Exploitative Strategy Dataset (2026)',
    shortTitle: 'Poker Player Archetypes & Exploits Dataset (2026)',
    category: 'Population MDA & Exploitative Strategy',
    publishedDate: '2026-11-24',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/learn/player-types',
    markdownUrl: 'https://smarter.poker/learn/player-types.md',
    summary: `HUD VPIP, PFR, 3-Bet, And WTSD Stat Profiles Plus Preflop, Postflop, And Bet-Sizing Exploits Across ${PLAYER_ARCHETYPES.length} Canonical Live And Online Poker Player Archetypes.`,
    rowCount: PLAYER_ARCHETYPES.length,
    rows: PLAYER_ARCHETYPES,
    keyFindings: [
      'Old Man Coffee (OMC) Profiles Exhibit 8% To 13% VPIP And 0.8% To 1.5% 3-Betting Restricted Almost Exclusively To KK+ And AA.',
      'Loose-Passive Calling Stations (42% To 68% VPIP) Display Inelastic Postflop Calling, Making 75% To 100% Pot Value Sizing Superior To 33% Solver C-Bets.',
      'Standard ABC Tight-Aggressive (TAG) Regulars Under-Bluff River Triple-Barrel Lines By 8% To 12% Compared To GTO Equilibrium.',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
  {
    slug: 'international-poker-destinations-rake-tax-2026',
    title: '10 Premier International Live Poker Destinations Currency, Rake Cap & Gaming Tax Dataset (2026)',
    shortTitle: 'International Poker Destinations Rake & Tax Dataset (2026)',
    category: 'Global Cardroom & Festival Economics',
    publishedDate: '2026-11-24',
    modifiedDate: '2026-11-24',
    canonicalUrl: 'https://smarter.poker/poker-rooms/international',
    markdownUrl: 'https://smarter.poker/poker-rooms/international.md',
    summary: `Table Currencies, Typical Cash Game Stakes, Rake Caps, Flagship Series, And Visitor Gaming Tax Rules Across ${INTERNATIONAL_POKER_GUIDES.length} Premier Global Poker Hubs.`,
    rowCount: INTERNATIONAL_POKER_GUIDES.length,
    rows: INTERNATIONAL_POKER_GUIDES,
    keyFindings: [
      'European Flagship Rooms In London, Barcelona, And Rozvadov Charge 4% To 5% Pot Rake With Higher Caps (£10-£12 Or €10-€20) Compared To US 10% $5-$7 Cap Rooms.',
      'United Kingdom, Monaco, Canada, Australia, Macau, And The Bahamas Levy 0% Casino Cage Withholding Tax On Recreational Poker Winnings.',
      'King\'s Resort Rozvadov (160+ Tables) Operates 100% In Euros (€) While Macau Poker Rooms Operate Exclusively In Hong Kong Dollars (HKD).',
    ],
    doi: '10.5281/zenodo.24115647',
    doiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    zenodoUrl: 'https://zenodo.org/records/24115647',
    collectionDoi: '10.5281/zenodo.24115647',
    collectionDoiUrl: 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: 'https://zenodo.org/records/24115647',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  },
];

export const STATIC_DATASETS = [
  ...RESEARCH_REPORTS.map((study) => ({
    slug: study.slug,
    title: study.title,
    shortTitle: study.shortTitle,
    category: study.category,
    publishedDate: study.publishedDate,
    modifiedDate: study.modifiedDate,
    canonicalUrl: `https://smarter.poker/research/${study.slug}`,
    markdownUrl: `https://smarter.poker/research/${study.slug}.md`,
    summary: study.summary,
    keyFindings: study.keyFindings || [],
    rowCount: study.table?.rows?.length || 0,
    rows: study.table?.rows || [],
    doi: study.doi || null,
    doiUrl: study.doiUrl || null,
    zenodoUrl: study.zenodoUrl || null,
    collectionDoi: study.collectionDoi || '10.5281/zenodo.24115647',
    collectionDoiUrl: study.collectionDoiUrl || 'https://doi.org/10.5281/zenodo.24115647',
    collectionZenodoUrl: study.collectionZenodoUrl || 'https://zenodo.org/records/24115647',
    swhid: study.swhid || 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
  })),
  ...AUTHORITY_HUB_DATASETS,
];

export const WIKIPEDIA_CITATION_TARGETS = [
  {
    id: 'wiki-icm',
    wikipediaArticle: 'Independent Chip Model',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Independent_Chip_Model',
    sectionTarget: 'External links / References',
    canonicalSourceUrl: 'https://smarter.poker/research/tournament-icm-bubble-factor-and-risk-premium-study',
    calculatorUrl: 'https://smarter.poker/tools/icm-calculator',
    citeWebTemplate:
      '{{cite web |title=Tournament ICM Bubble Factor And Risk Premium Study |url=https://smarter.poker/research/tournament-icm-bubble-factor-and-risk-premium-study |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Tournament ICM Bubble Factor And Risk Premium Study |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/tournament-icm-bubble-factor-and-risk-premium-study}}',
  },
  {
    id: 'wiki-pot-odds',
    wikipediaArticle: 'Pot odds',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Pot_odds',
    sectionTarget: 'References / Minimum Defense Frequency',
    canonicalSourceUrl: 'https://smarter.poker/learn/pot-odds',
    calculatorUrl: 'https://smarter.poker/tools/pot-odds-calculator',
    citeWebTemplate:
      '{{cite web |title=Pot Odds, Implied Odds & Minimum Defense Frequency Calculator |url=https://smarter.poker/tools/pot-odds-calculator |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Pot Odds And Equity Mathematical Reference |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/learn/pot-odds}}',
  },
  {
    id: 'wiki-starting-hands',
    wikipediaArticle: "Texas hold 'em starting hands",
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Texas_hold_%27em_starting_hands',
    sectionTarget: 'External links / 169 Starting Hand Matrix',
    canonicalSourceUrl: 'https://smarter.poker/learn/hands',
    calculatorUrl: 'https://smarter.poker/tools/preflop-ranges',
    citeWebTemplate:
      '{{cite web |title=169 Starting Hands Strategy Encyclopedia & GTO Preflop Frequencies |url=https://smarter.poker/learn/hands |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=GTO Solver Equilibrium Vs. Population Leak Frequency Study |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/gto-vs-population-preflop-and-postflop-leak-study}}',
  },
  {
    id: 'wiki-cardroom',
    wikipediaArticle: 'Cardroom',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Cardroom',
    sectionTarget: 'United States / Texas & Las Vegas Cardrooms',
    canonicalSourceUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    calculatorUrl: 'https://smarter.poker/hub/poker-near-me',
    citeWebTemplate:
      '{{cite web |title=US Live Poker Room Rake Caps And Bad Beat Jackpot Benchmark Report |url=https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Cardroom Waitlist Turnover And Table Utilization Benchmark |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/cardroom-waitlist-turnover-and-table-utilization-benchmark}}',
  },
  {
    id: 'wiki-rake',
    wikipediaArticle: 'Rake (poker)',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Rake_(poker)',
    sectionTarget: 'References / Live Casino Rake Benchmarks',
    canonicalSourceUrl: 'https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark',
    calculatorUrl: 'https://smarter.poker/tools/poker-winrate-calculator',
    citeWebTemplate:
      '{{cite web |title=US Live Poker Room Rake Caps And Bad Beat Jackpot Benchmark Report |url=https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=US Live Poker Room Rake Caps And Bad Beat Jackpot Benchmark Report |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/us-live-poker-room-rake-and-jackpot-benchmark}}',
  },
  {
    id: 'wiki-bounty',
    wikipediaArticle: 'Bounty (poker)',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Bounty_(poker)',
    sectionTarget: 'Progressive Knockout & Mystery Bounty Math',
    canonicalSourceUrl: 'https://smarter.poker/research/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study',
    calculatorUrl: 'https://smarter.poker/tools/bounty-calculator',
    citeWebTemplate:
      '{{cite web |title=Mystery Bounty Vs. PKO EV And Bounty Power Factor Study |url=https://smarter.poker/research/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Mystery Bounty Vs. PKO EV And Bounty Power Factor Study |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study}}',
  },
  {
    id: 'wiki-poker-hand-rankings',
    wikipediaArticle: 'List of poker hands',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/List_of_poker_hands',
    sectionTarget: '5-Card & 7-Card Combinatorics / Short Deck 6+ Probabilities',
    canonicalSourceUrl: 'https://smarter.poker/learn/poker-hand-rankings',
    calculatorUrl: 'https://smarter.poker/tools/poker-odds-calculator',
    citeWebTemplate:
      '{{cite web |title=Official Poker Hand Rankings Chart, Combinatorics & Tie-Breaker Rules |url=https://smarter.poker/learn/poker-hand-rankings |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Short Deck (6+ Holdem) Equity And Ante Math Benchmark |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/short-deck-6-plus-holdem-equity-and-ante-math-benchmark}}',
  },
  {
    id: 'wiki-omaha-holdem',
    wikipediaArticle: "Omaha hold 'em",
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Omaha_hold_%27em',
    sectionTarget: 'Pot-limit Omaha / PLO4, PLO5 & PLO6 Equity Variance',
    canonicalSourceUrl: 'https://smarter.poker/games/pot-limit-omaha-plo4',
    calculatorUrl: 'https://smarter.poker/tools/plo-bet-calculator',
    citeWebTemplate:
      '{{cite web |title=4-Card Pot-Limit Omaha (PLO4) Official Rules, Must-Use-Two Rule & Strategy |url=https://smarter.poker/games/pot-limit-omaha-plo4 |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Pot-Limit Omaha (PLO4, PLO5, PLO6) Equity And Variance Study |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/research/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study}}',
  },
  {
    id: 'wiki-betting-in-poker',
    wikipediaArticle: 'Betting in poker',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Betting_in_poker',
    sectionTarget: 'Pot-limit / Side pots / TDA Floor Rulings',
    canonicalSourceUrl: 'https://smarter.poker/rules',
    calculatorUrl: 'https://smarter.poker/tools/side-pot-calculator',
    citeWebTemplate:
      '{{cite web |title=Official Poker Rules & Casino Floor Rulings Encyclopedia (TDA & RROP) |url=https://smarter.poker/rules |website=Smarter.Poker |publisher=Smarter Software Inc. |year=2026 |access-date=2026-11-09}}',
    citeTechreportTemplate:
      '{{cite techreport |title=Official Poker Rules & Multi-Way Side Pot Reference |author=Smarter.Poker Research Division |institution=Smarter Software Inc. |year=2026 |url=https://smarter.poker/tools/side-pot-calculator}}',
  },
];

export function buildZenodoMetadata() {
  return {
    title: 'Smarter.Poker 2026 Open Quantitative Poker Research & Live Cardroom Benchmark Datasets (22 Datasets)',
    upload_type: 'dataset',
    publication_date: '2026-11-14',
    version: '2026.11.14',
    dataset_count: 22,
    mcp_tool_count: 55,
    mcp_spec_version: 'v1.0.7',
    doi: '10.5281/zenodo.24115647',
    conceptrecid: '24095048',
    swhid: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
    creators: [
      {
        name: 'Smarter.Poker Research Division',
        affiliation: 'Smarter Software Inc.',
      },
    ],
    description:
      `Open CC-BY 4.0 catalog of 22 quantitative poker research and authority benchmark datasets covering ${VENUE_COUNT_LABEL} US live poker venues, all 50 US states and DC (51 jurisdictions) legality and tax benchmarks, 10 international poker destinations, 9 table seat positions, 8 player archetypes, 12 canonical flop board textures, 12 historic televised hands, 7 stake tiers, Malmuth-Harville ICM bubble factors, PKO and Mystery Bounty chip equivalents, 169-hand preflop GTO matrices, and a 55-Tool Model Context Protocol (MCP) Server Archive (v1.0.7).`,
    access_right: 'open',
    license: 'cc-by-4.0',
    keywords: [
      'poker',
      'game theory optimal',
      'independent chip model',
      'monte carlo simulation',
      'cardroom directory',
      'pot odds',
      'risk of ruin',
    ],
    related_identifiers: [
      {
        identifier: '10.5281/zenodo.24115647',
        relation: 'isIdenticalTo',
        scheme: 'doi',
      },
      {
        identifier: '10.5281/zenodo.24115636',
        relation: 'isSupplementedBy',
        scheme: 'doi',
      },
      {
        identifier: '10.5281/zenodo.24115447',
        relation: 'isPartOf',
        scheme: 'doi',
      },
      {
        identifier: '10.5281/zenodo.24115452',
        relation: 'isPartOf',
        scheme: 'doi',
      },
      {
        identifier: '10.5281/zenodo.24115453',
        relation: 'isPartOf',
        scheme: 'doi',
      },
      {
        identifier: '10.5281/zenodo.24115454',
        relation: 'isPartOf',
        scheme: 'doi',
      },
      {
        identifier: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        relation: 'isDerivedFrom',
        scheme: 'url',
      },
      {
        identifier: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        relation: 'isSupplementedBy',
        scheme: 'url',
      },
      {
        identifier: 'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
        relation: 'isSupplementedBy',
        scheme: 'url',
      },
      {
        identifier: 'https://smarter.poker/research',
        relation: 'isSupplementTo',
        scheme: 'url',
      },
      {
        identifier: 'https://smarter.poker/api/datasets/catalog',
        relation: 'isIdenticalTo',
        scheme: 'url',
      },
      {
        identifier: 'https://smarter.poker/api/feeds/research',
        relation: 'isCompiledBy',
        scheme: 'url',
      },
    ],
  };
}

export function buildCitationCff() {
  return [
    'cff-version: 1.2.0',
    'message: "If You Use Smarter.Poker Quantitative Datasets Or Solvers In Your Research, Please Cite Them As Below."',
    'title: "Smarter.Poker Open Quantitative Poker Research & GTO Solver Benchmarks (22 Datasets, 2026)"',
    'type: dataset',
    'doi: "10.5281/zenodo.24115647"',
    'identifiers:',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115647"',
    '    description: "Core Open Quantitative Poker Research Datasets (22 CSV & JSON Datasets)"',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115636"',
    '    description: "55-Tool Model Context Protocol (MCP) Server Archive"',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115447"',
    '    description: "North American Live Poker Room, Regional Market & Tournament Series Benchmark Dataset"',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115452"',
    '    description: "100BB 6-Max GTO Preflop Ranges, 169 Starting Hands & 25 Canonical Matchup Benchmarks"',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115453"',
    '    description: "Smarter.Poker 55-Tool Model Context Protocol (MCP) Server & OpenAPI 3.1 Specification v1.0.7"',
    '  - type: doi',
    '    value: "10.5281/zenodo.24115454"',
    '    description: "Official Poker Rules (TDA & RROP), 15 Game Variants & 80-Term Quantitative Glossary Corpus"',
    '  - type: swh',
    '    value: "swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f"',
    '  - type: swh',
    '    value: "swh:1:snp:02b8992833424620305edcfb730b3cf8add15747"',
    'authors:',
    '  - name: "Smarter.Poker Research Division"',
    '    website: "https://smarter.poker/research"',
    'version: "2026.11.14"',
    'date-released: "2026-11-14"',
    'license: "CC-BY-4.0"',
    'url: "https://smarter.poker/research"',
    'repository-code: "https://github.com/Smarter-Poker/smarter-poker-open-datasets"',
    'repository-artifact: "https://zenodo.org/records/24115647"',
  ].join('\n');
}

export function buildDataCatalogJsonLd() {
  const studyDatasets = STATIC_DATASETS.map((study) => {
    const canonicalPageUrl = study.canonicalUrl || `https://smarter.poker/research/${study.slug}`;
    const markdownPageUrl = study.markdownUrl || `${canonicalPageUrl}.md`;
    return {
      '@type': 'Dataset',
      '@id': `${canonicalPageUrl}#dataset`,
      name: study.title,
      description: study.summary,
      url: canonicalPageUrl,
      inLanguage: 'en-US',
      version: '2026.11.14',
      datePublished: study.publishedDate,
      dateModified: study.modifiedDate,
      temporalCoverage: '2026',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      keywords: [study.category, 'Poker Research', 'Smarter.Poker Dataset', study.shortTitle],
      sameAs: [
        ...(study.doiUrl && study.zenodoUrl ? [study.doiUrl, study.zenodoUrl] : []),
        'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
        'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
      ],
      identifier: [
        ...(study.doi
          ? [
              {
                '@type': 'PropertyValue',
                propertyID: 'DOI',
                value: study.doi,
                url: study.doiUrl,
              },
            ]
          : []),
        {
          '@type': 'PropertyValue',
          propertyID: 'SWHID',
          value: study.swhid || 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
          url: 'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        },
      ],
      creator: {
        '@type': 'Organization',
        '@id': 'https://smarter.poker/#organization',
        name: 'Smarter.Poker Research Division',
        url: 'https://smarter.poker',
      },
      publisher: {
        '@type': 'Organization',
        '@id': 'https://smarter.poker/#organization',
        name: 'Smarter.Poker',
        url: 'https://smarter.poker',
      },
      includedInDataCatalog: {
        '@type': 'DataCatalog',
        '@id': 'https://smarter.poker/api/datasets/catalog#datacatalog',
        name: 'Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog',
        url: 'https://smarter.poker/research',
      },
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/html',
          contentUrl: canonicalPageUrl,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/markdown',
          contentUrl: markdownPageUrl,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `https://smarter.poker/api/datasets/catalog?slug=${study.slug}`,
        },
      ],
      variableMeasured: (study.keyFindings || []).map((finding, idx) => ({
        '@type': 'PropertyValue',
        name: `${study.shortTitle} Finding ${idx + 1}`,
        description: finding,
      })),
    };
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    '@id': 'https://smarter.poker/api/datasets/catalog#datacatalog',
    name: 'Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog',
    version: '2026.11.14',
    description:
      `Public CC-BY 4.0 catalog of 22 quantitative poker research and authority benchmark datasets, 169 starting hand preflop frequency matrices, 55-Tool Model Context Protocol (MCP) Server Archive (v1.0.7), and ${VENUE_COUNT_LABEL} US live cardroom benchmarks.`,
    url: 'https://smarter.poker/research',
    inLanguage: 'en-US',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    sameAs: [
      'https://doi.org/10.5281/zenodo.24115647',
      'https://doi.org/10.5281/zenodo.24115636',
      'https://doi.org/10.5281/zenodo.24115447',
      'https://doi.org/10.5281/zenodo.24115452',
      'https://doi.org/10.5281/zenodo.24115453',
      'https://doi.org/10.5281/zenodo.24115454',
      'https://zenodo.org/records/24115647',
      'https://github.com/Smarter-Poker/smarter-poker-open-datasets',
      'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
      'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
      'https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp',
    ],
    identifier: [
      ...ZENODO_RECORDS.map((z) => ({
        '@type': 'PropertyValue',
        propertyID: 'DOI',
        name: z.title,
        value: z.doi,
        url: z.doiUrl,
      })),
      {
        '@type': 'PropertyValue',
        propertyID: 'SWHID',
        name: 'Software Heritage Open Datasets Snapshot',
        value: 'swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
        url: 'https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f',
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'SWHID',
        name: 'Software Heritage MCP Server Snapshot',
        value: 'swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
        url: 'https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747',
      },
    ],
    publisher: {
      '@type': 'Organization',
      '@id': 'https://smarter.poker/#organization',
      name: 'Smarter.Poker',
      url: 'https://smarter.poker',
    },
    datasetCount: 22,
    dataset: studyDatasets,
  };
}

export const DATASET_PROVENANCE_AND_RIGHTS = {
  owner: 'Smarter Software Inc. (https://smarter.poker)',
  license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  included_first_party_scope: [
    'Exact combinatoric and Monte Carlo poker equity tables generated by Smarter.Poker solver engines',
    'Malmuth-Harville Independent Chip Model (ICM) bubble factor and risk-premium benchmark tables',
    '100BB 6-Max Game Theory Optimal (GTO) preflop opening and 3-bet frequency matrices across all 169 canonical hands',
    'Aggregated statistical benchmark summaries in the 22 first-party /research/* and authority hub datasets compiled from public house rules and published tournament schedules',
  ],
  excluded_from_bulk_redistribution: [
    'Third-party competitor trademarks and external website copy cited under fair-use comparison rules in /compare/*',
    'Private user-generated club, hand-history, and bankroll ledger records',
  ],
  wikipedia_editorial_compliance_policy:
    'Per Wikipedia Conflict of Interest (WP:COI) and External Links (WP:EL) guidelines, affiliated editors must propose citations on the target article Talk page (Talk:<Article>) with full methodology disclosure rather than inserting links directly into mainspace.',
};

export function getDatasetCatalogPayload({ slug = '' } = {}) {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  const filteredDatasets = normalizedSlug
    ? STATIC_DATASETS.filter((s) => s.slug.toLowerCase() === normalizedSlug)
    : STATIC_DATASETS;

  return {
    schema_version: '2026.11.14',
    dataset_version: '2026.11.14',
    mcp_spec_version: 'v1.0.7',
    mcp_tools_count: 55,
    platform: 'Smarter.Poker Open Data & Academic Citation Hub',
    canonical_research_hub: 'https://smarter.poker/research',
    catalog_endpoint: 'https://smarter.poker/api/datasets/catalog',
    json_feed_endpoint: 'https://smarter.poker/api/feeds/research',
    license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
    provenance_and_redistribution_rights: DATASET_PROVENANCE_AND_RIGHTS,
    datasets_count: filteredDatasets.length,
    total_datasets_count: STATIC_DATASETS.length,
    datasets: filteredDatasets,
    zenodo_records: ZENODO_RECORDS,
    static_datasets: filteredDatasets,
    wikipedia_targets_count: WIKIPEDIA_CITATION_TARGETS.length,
    zenodo_metadata: buildZenodoMetadata(),
    citation_cff: buildCitationCff(),
    wikipedia_citation_targets: WIKIPEDIA_CITATION_TARGETS,
    schema_org_data_catalog: buildDataCatalogJsonLd(),
  };
}
