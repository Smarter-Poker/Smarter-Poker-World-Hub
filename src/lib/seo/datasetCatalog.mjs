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
    title: 'Smarter.Poker 2026 Open Quantitative Poker Research & Live Cardroom Benchmark Datasets',
    upload_type: 'dataset',
    publication_date: '2026-11-09',
    creators: [
      {
        name: 'Smarter.Poker Research Division',
        affiliation: 'Smarter Software Inc.',
      },
    ],
    description:
      'Open CC-BY 4.0 datasets covering 324+ US live poker venues, rake and time-charge benchmarks, Malmuth-Harville ICM bubble factors, PKO and Mystery Bounty chip equivalents, 169-hand preflop GTO matrices, and poker bankroll risk-of-ruin simulations.',
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
    'title: "Smarter.Poker Open Quantitative Poker Research & GTO Solver Benchmarks (2026)"',
    'type: dataset',
    'authors:',
    '  - name: "Smarter.Poker Research Division"',
    '    website: "https://smarter.poker/research"',
    'version: "2026.11"',
    'date-released: "2026-11-09"',
    'license: "CC-BY-4.0"',
    'url: "https://smarter.poker/research"',
    'repository-artifact: "https://smarter.poker/api/datasets/catalog"',
  ].join('\n');
}

export function buildDataCatalogJsonLd() {
  const studyDatasets = RESEARCH_REPORTS.map((study) => ({
    '@type': 'Dataset',
    '@id': `https://smarter.poker/research/${study.slug}#dataset`,
    name: study.title,
    description: study.summary,
    url: `https://smarter.poker/research/${study.slug}`,
    datePublished: study.publishedDate,
    dateModified: study.modifiedDate,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    keywords: [study.category, 'Poker Research', 'Smarter.Poker Dataset'],
    creator: {
      '@type': 'Organization',
      name: 'Smarter.Poker Research Division',
      url: 'https://smarter.poker',
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/html',
        contentUrl: `https://smarter.poker/research/${study.slug}`,
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
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'DataCatalog',
    '@id': 'https://smarter.poker/api/datasets/catalog#datacatalog',
    name: 'Smarter.Poker Open Quantitative Poker & Live Cardroom Data Catalog',
    description:
      'Public CC-BY 4.0 catalog of 15 quantitative poker research datasets, 169 starting hand preflop frequency matrices, and 324+ US live cardroom benchmarks.',
    url: 'https://smarter.poker/research',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    publisher: {
      '@type': 'Organization',
      name: 'Smarter.Poker',
      url: 'https://smarter.poker',
    },
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
    'Aggregated statistical benchmark summaries in the 15 first-party /research/* studies compiled from public house rules and published tournament schedules',
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
  const filteredStudies = normalizedSlug
    ? RESEARCH_REPORTS.filter((s) => s.slug.toLowerCase() === normalizedSlug)
    : RESEARCH_REPORTS;

  return {
    schema_version: '2026-11-09',
    platform: 'Smarter.Poker Open Data & Academic Citation Hub',
    canonical_research_hub: 'https://smarter.poker/research',
    catalog_endpoint: 'https://smarter.poker/api/datasets/catalog',
    json_feed_endpoint: 'https://smarter.poker/api/feeds/research',
    license: 'Creative Commons Attribution 4.0 International (CC-BY 4.0)',
    provenance_and_redistribution_rights: DATASET_PROVENANCE_AND_RIGHTS,
    datasets_count: filteredStudies.length,
    wikipedia_targets_count: WIKIPEDIA_CITATION_TARGETS.length,
    zenodo_metadata: buildZenodoMetadata(),
    citation_cff: buildCitationCff(),
    wikipedia_citation_targets: WIKIPEDIA_CITATION_TARGETS,
    schema_org_data_catalog: buildDataCatalogJsonLd(),
  };
}
