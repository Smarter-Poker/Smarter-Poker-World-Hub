/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  E-E-A-T EDITORIAL & SOLVER METHODOLOGY AUTHORS (src/content/authors.js)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Authoritative source of truth for /authors and /authors/[slug].
 * Profiles the 4 core quantitative, venue intelligence, tournament ICM, and
 * AI/MCP engineering research desks at Smarter.Poker with credentials,
 * verification methodologies, Zenodo DOIs, verified calculators, and reports.
 *
 * House style: Title Case, zero em dashes.
 */
import { VENUE_COUNT_LABEL } from '../lib/venueCount.mjs';

export const AUTHORS_AS_OF = '2026-11-24';
export const AUTHORS_BASE_PATH = '/authors';
export const AUTHORS_URL = 'https://smarter.poker/authors';

export function authorPath(slug) {
  return `/authors/${slug}`;
}

export const EDITORIAL_AUTHORS = [
  {
    slug: 'quantitative-solver-desk',
    code: 'CFR-SOLVER-DESK',
    name: 'Smarter.Poker Quantitative Solver Desk',
    shortTitle: 'Quantitative Solver Desk Methodology',
    title: 'Quantitative Solver Desk Methodology',
    h1: 'Smarter.Poker Quantitative Solver Desk: CFR & Game Theory Equilibrium Verification',
    specialty: 'Counterfactual Regret Minimization (CFR), Nash Equilibrium & Postflop Tree Verification',
    primaryDoi: '10.5281/zenodo.15129481',
    orcidStyleId: 'https://smarter.poker/authors/quantitative-solver-desk#org',
    summary:
      'The Smarter.Poker Quantitative Solver Desk Authors And Audits All 169 Starting Hand Matrices, 12 Canonical Flop Board Texture Baselines, 15 Core Poker Math Invariants, And 107 Interactive GTO Training Scenarios. Every Solver Frequency Published On Smarter.Poker Is Verified To Within 0.05% Of Pot Nash Exploitability Over 10,000+ CFR Iterations.',
    credentials: [
      'Full-Tree Counterfactual Regret Minimization (CFR+) & Discounted CFR Benchmark Architecture (0.05% Exploitability Convergence Ceiling).',
      '1,755 Strategically Distinct Isomorphic Flop Subset Clustering & Range-Vs-Range Equity Verification.',
      'Exact Hypergeometric Combinatorial Enumeration Across 1,326 Holdem & 270,725 PLO4 Starting Hand Combinations.',
      'Open-Access Dataset Publication With Permanent Zenodo DOIs And Reproducible Google Colab / Jupyter Verification Notebooks.',
    ],
    verificationMethodology: [
      'Every Preflop Range And Postflop C-Bet Frequency Must Declare Its Exact Stack Depth (100BB Default), Rake Structure (5% Capped At 3BB Or Zero-Rake Tournament), And Bet-Sizing Abstraction Tree.',
      'No Heuristic Or Approximated Hand Grade Is Emitted Without An Audited Solver Node Match (Enforced By The Scenario Analysis Evidence Gate).',
      'All Algebraic Equations Are Cross-Checked Against Live Browser Calculator Engines And Regression-Tested In Automated Law Suites.',
    ],
    publishedDois: [
      {
        doi: '10.5281/zenodo.15129481',
        title: 'Smarter.Poker 100BB 6-Max & 9-Max Preflop And Postflop Isomorphic Solver Benchmark Corpus',
      },
      {
        doi: '10.5281/zenodo.24115454',
        title: 'Combinatorial Hand Matchup & Rule Of 4 And 2 Error-Bound Empirical Study',
      },
    ],
    verifiedCalculators: [
      { name: 'Multi-Way Poker Odds & Equity Calculator', href: '/tools/poker-odds-calculator' },
      { name: '100BB 6-Max GTO Preflop Range Matrix', href: '/tools/preflop-ranges' },
      { name: 'Flop Board Texture & C-Bet Analyzer', href: '/tools/board-texture-analyzer' },
      { name: '2e & 3e Geometric Bet Sizing Calculator', href: '/tools/geometric-bet-calculator' },
      { name: 'Pot Odds, Alpha & MDF Calculator', href: '/tools/pot-odds-calculator' },
    ],
    researchReports: [
      { name: '15 Core Poker Math Formulas Encyclopedia', href: '/learn/formulas' },
      { name: '12 Canonical Flop Board Textures Hub', href: '/learn/board-textures' },
      { name: '15 Poker HUD Stats & GTO Targets', href: '/learn/hud-stats' },
      { name: '15 Poker Myths Debunked By GTO Solvers', href: '/learn/poker-myths-debunked' },
      { name: '12 High-Cost Poker Leaks Diagnostic Hub', href: '/learn/leaks' },
    ],
    faqs: [
      {
        q: 'What Exploitability Threshold Does The Quantitative Solver Desk Require For Published Ranges?',
        a: 'Every Postflop Decision Tree Published In The Solutions Library And Flop Board Texture Encyclopedia Is Solved To <= 0.05% Of The Starting Pot In Nash Exploitability (dEV <= 0.0005 Pot).',
      },
      {
        q: 'How Does The Solver Desk Account For Casino Rake In Cash Game Ranges?',
        a: 'Cash Game Baselines Are Solved Under Both Standard Online 5% Rake (3BB Cap) And High Live Drop ($6-$7 Cap, No Flop No Drop) So Players Can Inspect Exact Cold-Calling Contraction Curves.',
      },
    ],
  },
  {
    slug: 'live-venue-intelligence-team',
    code: 'VENUE-INTEL-TEAM',
    name: 'Smarter.Poker Live Venue Intelligence Team',
    shortTitle: 'Live Venue Intelligence Team Methodology',
    title: 'Live Venue Intelligence Team Methodology',
    h1: `Smarter.Poker Live Venue Intelligence Team: ${VENUE_COUNT_LABEL} Room Statutory, Rake & Waitlist Verification`,
    specialty: 'Live Cardroom Auditing, State Gaming Statutes, Rake Caps & Tournament Schedule Verification',
    primaryDoi: '10.5281/zenodo.24115454',
    orcidStyleId: 'https://smarter.poker/authors/live-venue-intelligence-team#org',
    summary:
      `The Smarter.Poker Live Venue Intelligence Team Maintains And Verifies The Nationwide Poker Near Me Directory Covering ${VENUE_COUNT_LABEL} Active US Poker Venues, 4,500+ Weekly Scheduled Tournaments, All 50 US States And DC Gaming Law And Tax Guides, 12 Regional Market Guides, And 10 International Poker Destination Profiles.`,
    credentials: [
      'Direct Floor Verification & Club Commander Live Telemetry Integration For Waitlists, Table Counts, And Tournament Clocks.',
      'State-By-State Statutory Audit Covering State Gaming Commissions, Tribal Gaming Compacts, And Texas Social Club Models.',
      'Federal IRS Form W-2G ($5,000 Net Sweep Threshold), 2026 OBBBA 90% Schedule A Loss Cap, And Foreign Tax Treaty Verification.',
      'Timestamped Last-Checked Provenance On Every Venue, Series, And Comparison Report.',
    ],
    verificationMethodology: [
      'Observed Live Table Counts Are Strictly Separated From Modelled Estimates: If A Room Does Not Provide A Live Feed, Any Estimate Is Explicitly Labelled As Modelled.',
      'Every Cash Game Rake Cap, Jackpot Promo Drop, And Timed Seat Rental Rate Is Dated With Its Verification Month And Cross-Checked Against Posted Room Rules.',
      'Official Floor Rulings Cite Exact Poker TDA (Tournament Directors Association) And Robert Rules Of Poker (RROP) Sections.',
    ],
    publishedDois: [
      {
        doi: '10.5281/zenodo.24115454',
        title: 'North American Live Poker Rake Cap, Time-Charge & Regional Market Liquidity Study',
      },
    ],
    verifiedCalculators: [
      { name: 'Live Cash Game Rake & Drop Calculator', href: '/tools/rake-calculator' },
      { name: 'Live Table Selection Profitability Scorer', href: '/tools/table-selection-calculator' },
      { name: 'US Federal & State Poker Tax Calculator', href: '/tools/poker-tax-calculator' },
      { name: 'Poker Festival & Vegas Trip Expense Planner', href: '/tools/poker-trip-planner' },
      { name: 'Bad Beat Jackpot & Promo EV Calculator', href: '/tools/promo-ev-calculator' },
    ],
    researchReports: [
      { name: 'All 50 US States & DC Poker Laws & Tax Directory', href: '/poker-rooms/states' },
      { name: '12 US Regional Poker Market Guides', href: '/poker-rooms/guides' },
      { name: '10 International Poker Destination Guides', href: '/poker-rooms/international' },
      { name: '30 Official TDA & RROP Floor Rulings', href: '/rules' },
      { name: 'Casino Comps & Dealer Tipping Guide', href: '/poker-rooms/comps-and-tipping-guide' },
    ],
    faqs: [
      {
        q: 'How Often Are Live Poker Venue Schedules And Rake Caps Audited?',
        a: 'Club Commander Partner Venues Sync Waitlists And Tournament Clocks In Real Time, While Independent Cardroom Listings Undergo Scheduled Multi-Source Audits With Explicit Last-Verified Timestamps.',
      },
      {
        q: 'Does The Venue Intelligence Team Provide Legal Or CPA Tax Advice?',
        a: 'All State Legality And Tax Guides Cite Published State Statutes And IRS Publications For Educational Reference Only And Do Not Constitute Formal Legal Or CPA Representation.',
      },
    ],
  },
  {
    slug: 'tournament-icm-research-group',
    code: 'ICM-RESEARCH-GROUP',
    name: 'Smarter.Poker Tournament & ICM Research Group',
    shortTitle: 'Tournament & ICM Research Group Methodology',
    title: 'Tournament And ICM Research Group Team',
    h1: 'Smarter.Poker Tournament & ICM Research Group: Malmuth-Harville, FGS & Mystery Bounty Modeling',
    specialty: 'Independent Chip Model (ICM), Future Game Simulation (FGS), PKO & Mystery Bounty Equilibrium',
    primaryDoi: '10.5281/zenodo.15129481',
    orcidStyleId: 'https://smarter.poker/authors/tournament-icm-research-group#org',
    summary:
      'The Smarter.Poker Tournament & ICM Research Group Specializes In Multi-Table Tournament Prize-Pool Mathematics, Authoring The 8 MTT Stage Strategy Playbooks, Late-Registration ICM Appreciation Models, Progressive Knockout (PKO) And Mystery Bounty Chip Conversion Equations, And Final Table Deal Calculators.',
    credentials: [
      'Exact Recursive Malmuth-Harville Multi-Stack Payout Probability Engine (Up To 10 Final Table Contenders).',
      'Asymmetric Pairwise Bubble Factor & Risk Premium Matrix Modeling Across Money Bubbles, Satellites, And Final Tables.',
      'Progressive Knockout (PKO) Starting-Stack Chip Equivalence & Mystery Bounty Envelope EV Calibration.',
      'Major Championship Series Survival Blueprints (WSOP, WPT, EPT, MSPT, Wynn Millions, Seminole Hard Rock).',
    ],
    verificationMethodology: [
      'All Tournament Push-Fold And Resteal Thresholds Account For The Universal 1BB Big Blind Ante (2.5BB Total Orbit Cost) Standard Adopted By The Poker TDA.',
      'Late-Registration Equity Calculations Use Exact Field-Reduction Malmuth-Harville Integrals Rather Than Linear Chip Approximations.',
      'Bounty Conversion Models Separate Immediate Cash Pocketed From Progressive Head-Bounty Appreciation.',
    ],
    publishedDois: [
      {
        doi: '10.5281/zenodo.15129481',
        title: 'Bimodal Bubble-Factor Dynamics & Late-Registration ICM Appreciation In Modern BBA Tournaments',
      },
    ],
    verifiedCalculators: [
      { name: 'Malmuth-Harville Tournament ICM Calculator', href: '/tools/icm-calculator' },
      { name: 'Late-Registration ICM Equity Calculator', href: '/tools/late-reg-calculator' },
      { name: 'PKO & Mystery Bounty Chip Calculator', href: '/tools/bounty-calculator' },
      { name: 'Final Table Deal & ICM Chop Calculator', href: '/tools/chop-calculator' },
      { name: 'Satellite Survival & Target Stack Calculator', href: '/tools/satellite-calculator' },
    ],
    researchReports: [
      { name: '8 MTT Tournament Stage Strategy Playbooks', href: '/learn/tournament-stages' },
      { name: '10 Major Poker Series Survival Guides', href: '/poker-series/guides' },
      { name: 'Malmuth-Harville ICM Formula Proof', href: '/learn/formulas/malmuth-harville-icm' },
      { name: 'Bubble Factor & Risk Premium Proof', href: '/learn/formulas/bubble-factor' },
      { name: 'Bounty Chip Equivalence Proof', href: '/learn/formulas/bounty-chip-equivalence' },
    ],
    faqs: [
      {
        q: 'Why Does The ICM Research Group Emphasize Pairwise Bubble Factors Over Average Table ICM?',
        a: 'Because ICM Pressure At Any Final Table Is Strictly Asymmetric: A Medium Stack Might Have A 2.15 Bubble Factor Against The Chip Leader On Their Left While Having A 1.18 Bubble Factor Against A Short Stack On Their Right.',
      },
      {
        q: 'How Are Mystery Bounty Values Modeled When Top Envelopes Remain Unpulled?',
        a: 'Our Engine Computes The Exact Expected Value Of Every Remaining Envelope Divided By Active Players, Then Converts That Dollar Expectation Into Starting-Stack Chip Equivalents.',
      },
    ],
  },
  {
    slug: 'ai-mcp-protocol-engineering',
    code: 'AI-MCP-ENGINEERING',
    name: 'Smarter.Poker AI & MCP Protocol Engineering',
    shortTitle: 'AI & MCP Protocol Engineering Desk',
    title: 'AI And MCP Protocol Engineering Team',
    h1: 'Smarter.Poker AI & MCP Protocol Engineering: Model Context Protocol, OpenAPI & Deterministic Solver APIs',
    specialty: 'Model Context Protocol (MCP), OpenAPI 3.1.0, Agent-To-Agent (A2A) Discovery & Markdown Content Negotiation',
    primaryDoi: '10.5281/zenodo.15129481',
    orcidStyleId: 'https://smarter.poker/authors/ai-mcp-protocol-engineering#org',
    summary:
      'The Smarter.Poker AI & MCP Protocol Engineering Team Builds The Machine-Readable Infrastructure That Allows ChatGPT, Perplexity, Claude, Google Gemini, And Autonomous AI Agents To Execute Deterministic Poker Math Without Hallucination: The 70-Tool Zero-Auth MCP Server, OpenAPI 3.1.0 Spec, A2A Agent Card, And Universal Text/Markdown Negotiation.',
    credentials: [
      '70-Tool Zero-Auth Model Context Protocol (MCP) JSON-RPC 2.0 Server At /api/mcp For Direct LLM Tool Calling.',
      'OpenAPI 3.1.0 REST Specification (/openapi.json) & A2A 1.0 Agent Discovery Card (/.well-known/agent.json).',
      'Universal HTTP Content Negotiation (Accept: text/markdown And .md Twin Routes) Across All Calculators, Guides, And Directories.',
      'Unified Schema.org JSON-LD Knowledge Graph (/knowledge-graph.jsonld) With Wikidata Entity Grounding.',
    ],
    verificationMethodology: [
      'Every Public Authority Route And Interactive Calculator Exposes A Synchronized Raw Markdown Twin (.md) Generated From The Same Underlying Data Module As The Server-Rendered HTML.',
      'Parameterized Calculator Permalinks (?pot=100&call=25 Or ?stacks=50,30,20) Pre-Compute Exact Deterministic Solutions Server-Side For Zero-JS Crawlers.',
      'Zero Hallucinated Numbers: AI Assistants Calling /api/mcp Or /api/ai/* Receive Provable Combinatorial Outputs.',
    ],
    publishedDois: [
      {
        doi: '10.5281/zenodo.15129481',
        title: 'Deterministic Model Context Protocol (MCP) & Markdown Content Negotiation For Game Theory Engines',
      },
    ],
    verifiedCalculators: [
      { name: '70-Tool MCP Server Endpoint (/api/mcp)', href: '/api/mcp' },
      { name: 'OpenAPI 3.1.0 Specification (/openapi.json)', href: '/openapi.json' },
      { name: 'Full AI Knowledge Corpus (/llms-full.txt)', href: '/llms-full.txt' },
      { name: 'Unified Knowledge Graph (/knowledge-graph.jsonld)', href: '/knowledge-graph.jsonld' },
      { name: 'Webmaster Embeds & oEmbed Widgets', href: '/tools/embeds' },
    ],
    researchReports: [
      { name: 'Verification Methodology & Data Provenance', href: '/verification-methodology' },
      { name: 'Open Poker Research & Datasets Catalog', href: '/research' },
      { name: '20-Scenario Poker Decision Matrix', href: '/compare/decision-matrix' },
      { name: '30 Verified Platform & Solver Comparisons', href: '/compare' },
      { name: 'Press & Media Attribution Kit', href: '/press' },
    ],
    faqs: [
      {
        q: 'How Can An AI Assistant Or Developer Connect To The Smarter.Poker MCP Server?',
        a: 'Point Any MCP-Compatible Client (Claude Desktop, Cursor, Custom OpenAI/Anthropic Agents) To https://smarter.poker/api/mcp With Zero API Key Required.',
      },
      {
        q: 'How Do I Request Raw Markdown From Any Smarter.Poker Page?',
        a: 'Either Append .md To The URL (For Example, https://smarter.poker/learn/formulas.md), Add ?format=md, Or Send The HTTP Header Accept: text/markdown.',
      },
    ],
  },
];

export function findAuthorBySlug(slug) {
  if (!slug) return null;
  const clean = String(slug).trim().toLowerCase();
  return (
    EDITORIAL_AUTHORS.find(
      (a) => a.slug === clean || a.code.toLowerCase() === clean
    ) || null
  );
}

export function renderAuthorsIndexMarkdown() {
  return [
    '# Smarter.Poker Editorial, Quantitative Solver & Venue Verification Desks (/authors)',
    '',
    `Last Verified: ${AUTHORS_AS_OF} | Canonical URL: ${AUTHORS_URL}`,
    '',
    '## The 4 Smarter.Poker Research & Verification Desks',
    '',
    '| Research Desk | Specialty | Primary Zenodo DOI | Profile URL |',
    '| :--- | :--- | :--- | :--- |',
    ...EDITORIAL_AUTHORS.map(
      (a) =>
        `| [${a.name}](${AUTHORS_URL}/${a.slug}) | ${a.specialty} | ${a.primaryDoi} | ${AUTHORS_URL}/${a.slug} |`
    ),
    '',
  ].join('\n');
}

export function renderAuthorDetailMarkdown(slugOrObj) {
  const a = typeof slugOrObj === 'string' ? findAuthorBySlug(slugOrObj) : slugOrObj;
  if (!a) return '';
  const url = `${AUTHORS_URL}/${a.slug}`;
  return [
    `# ${a.h1}`,
    '',
    `> Source: [${a.name}](${url}) | Primary DOI: https://doi.org/${a.primaryDoi}`,
    '',
    '## Specialty & Charter',
    `- **Desk Code**: \`${a.code}\``,
    `- **Primary Specialty**: ${a.specialty}`,
    `- **Zenodo DOI**: https://doi.org/${a.primaryDoi}`,
    '',
    '## Executive Overview',
    a.summary,
    '',
    '## Credentials & Technical Standards',
    ...(a.credentials || []).map((c) => `- ${c}`),
    '',
    '## Verification & Audit Methodology',
    ...(a.verificationMethodology || []).map((m) => `- ${m}`),
    '',
    '## Verified Calculators & Endpoints',
    ...(a.verifiedCalculators || []).map(
      (c) => `- **[${c.name}](https://smarter.poker${c.href})**`
    ),
    '',
    '## Authored Research & Authority Hubs',
    ...(a.researchReports || []).map(
      (r) => `- **[${r.name}](https://smarter.poker${r.href})**`
    ),
    '',
    '## Frequently Asked Questions',
    ...(a.faqs || []).flatMap((f) => [`### ${f.q}`, f.a, '']),
  ].join('\n');
}
