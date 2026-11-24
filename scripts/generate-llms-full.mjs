#!/usr/bin/env node
/**
 * scripts/generate-llms-full.mjs
 *
 * Synchronizes the dynamic catalog sections of public/llms-full.txt with the
 * authoritative Smarter.Poker modules:
 * - src/content/glossary/terms.js (GLOSSARY_TERMS)
 * - src/content/learn/lessons.js (LESSONS & LEARN_CATEGORIES)
 * - src/content/compare/pages.js (COMPARE_PAGES)
 *
 * Can be run with `--write` to update public/llms-full.txt or `--check` to
 * verify parity in CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.js';
import { LESSONS, LEARN_CATEGORIES } from '../src/content/learn/lessons.js';
import { STARTING_HANDS } from '../src/content/learn/hands.js';
import { RESEARCH_REPORTS } from '../src/content/research/reports.js';
import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { POKER_RULES } from '../src/content/rules/rules.js';
import { POKER_VARIANTS } from '../src/content/games/variants.js';
import { POKER_MARKET_GUIDES } from '../src/content/guides/markets.js';
import { HAND_MATCHUPS } from '../src/content/learn/matchups.js';
import { SERIES_GUIDES } from '../src/content/guides/seriesGuides.js';
import { MCP_TOOLS, MCP_PROMPTS, MCP_RESOURCE_TEMPLATES } from '../src/lib/mcp/mcpServer.mjs';
import { STREAMER_BOT_COMMANDS } from '../pages/api/stream/cmd.js';
import { categoryAnchor } from '../src/lib/learn/learnSite.js';
import { ZENODO_RECORDS } from '../src/lib/seo/datasetCatalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LLMS_FULL_PATH = path.join(ROOT, 'public', 'llms-full.txt');

export function buildCatalogAppendix() {
  const lines = [
    '## 10. Poker Glossary & Strategy Lessons Corpus',
    '',
    `- **Poker Glossary DefinedTermSet (${GLOSSARY_TERMS.length} Terms)**: https://smarter.poker/glossary (Raw Markdown Corpus: https://smarter.poker/glossary.md)`,
    '  - Individual term Markdown mirrors: `https://smarter.poker/glossary/<slug>.md`',
    '  - AI Glossary Search API: `https://smarter.poker/api/ai/terms?q=straddle`',
    `- **GTO Strategy Lessons Curriculum (${LESSONS.length} Lessons Across ${LEARN_CATEGORIES.length} Topic Clusters)**: https://smarter.poker/learn (Raw Markdown Curriculum: https://smarter.poker/learn.md)`,
    ...LEARN_CATEGORIES.map((c) => {
      const slug = categoryAnchor(c);
      return `  - **${c} Strategy Cluster**: https://smarter.poker/learn/category/${slug} (Markdown: https://smarter.poker/learn/category/${slug}.md)`;
    }),
    '  - Individual lesson Markdown mirrors:',
    ...LESSONS.map((l) => `    - [${l.title}](https://smarter.poker/learn/${l.slug}) ([Markdown](https://smarter.poker/learn/${l.slug}.md))`),
    '  - AI Strategy Lessons API: `https://smarter.poker/api/ai/lessons`',
    `- **Texas Holdem Starting Hand Encyclopedia (${STARTING_HANDS.length} Canonical Hand Guides)**: https://smarter.poker/learn/hands (Raw Markdown Index: https://smarter.poker/learn/hands.md)`,
    ...STARTING_HANDS.map((h) => `  - [${h.code} (${h.name})](https://smarter.poker/learn/hands/${h.slug}) ([Markdown](https://smarter.poker/learn/hands/${h.slug}.md))`),
    `- **Verified Software & Cardroom Comparisons (${COMPARE_PAGES.length} Pages)**: https://smarter.poker/compare (Raw Markdown Directory: https://smarter.poker/compare.md)`,
    ...COMPARE_PAGES.map((p) => `  - [${p.title}](https://smarter.poker/compare/${p.slug}) ([Markdown](https://smarter.poker/compare/${p.slug}.md))`),
    '  - AI Comparisons API: `https://smarter.poker/api/ai/comparisons`',
    `- **First-Party Poker Industry Research & Data Benchmarks (${RESEARCH_REPORTS.length} Reports)**: https://smarter.poker/research (Raw Markdown Hub: https://smarter.poker/research.md)`,
    ...RESEARCH_REPORTS.map((r) => `  - [${r.title}](https://smarter.poker/research/${r.slug}) ([Markdown](https://smarter.poker/research/${r.slug}.md))`),
    `- **Official Poker Rules & Tournament Floor Rulings Encyclopedia (${POKER_RULES.length} Rulings)**: https://smarter.poker/rules (Raw Markdown Hub: https://smarter.poker/rules.md)`,
    ...POKER_RULES.map((r) => `  - [${r.title}](https://smarter.poker/rules/${r.slug}) ([Markdown](https://smarter.poker/rules/${r.slug}.md))`),
    `- **Poker Variants & Mixed Games Encyclopedia (${POKER_VARIANTS.length} Variants)**: https://smarter.poker/games (Raw Markdown Hub: https://smarter.poker/games.md)`,
    ...POKER_VARIANTS.map((v) => `  - [${v.title}](https://smarter.poker/games/${v.slug}) ([Markdown](https://smarter.poker/games/${v.slug}.md))`),
    '- **Official Poker Hand Rankings & Tie-Breaker Cheat Sheet**: https://smarter.poker/learn/poker-hand-rankings ([Markdown](https://smarter.poker/learn/poker-hand-rankings.md))',
    `- **Canonical All-In Hand-Vs-Hand Matchups (${HAND_MATCHUPS.length} Matchups)**: https://smarter.poker/learn/matchups (Raw Markdown Hub: https://smarter.poker/learn/matchups.md)`,
    ...HAND_MATCHUPS.map((m) => `  - [${m.title}](https://smarter.poker/learn/matchups/${m.slug}) ([Markdown](https://smarter.poker/learn/matchups/${m.slug}.md))`),
    `- **US Regional Poker Market & Rake Comparison Guides (${POKER_MARKET_GUIDES.length} Markets)**: https://smarter.poker/poker-rooms/guides (Raw Markdown Hub: https://smarter.poker/poker-rooms/guides.md)`,
    ...POKER_MARKET_GUIDES.map((m) => `  - [${m.title}](https://smarter.poker/poker-rooms/guides/${m.slug}) ([Markdown](https://smarter.poker/poker-rooms/guides/${m.slug}.md))`),
    '- **First-Time Casino Live Poker Room Guide & Dealer Tipping Calculator**: https://smarter.poker/poker-rooms/first-time-guide ([Markdown](https://smarter.poker/poker-rooms/first-time-guide.md))',
    `- **Major Live Poker Series, Tour & Festival Strategy Guides (${SERIES_GUIDES.length} Series)**: https://smarter.poker/poker-series/guides (Raw Markdown Hub: https://smarter.poker/poker-series/guides.md)`,
    ...SERIES_GUIDES.map((s) => `  - [${s.name}](https://smarter.poker/poker-series/guides/${s.slug}) ([Markdown](https://smarter.poker/poker-series/guides/${s.slug}.md))`),
    '- **Authority Strategy Hubs & US State Poker Directories**:',
    '  - Poker Table Position GTO Strategy Hub (9 Seats: UTG, UTG+1, MP, LJ, HJ, CO, BTN, SB, BB): https://smarter.poker/learn/positions ([Markdown](https://smarter.poker/learn/positions.md))',
    '  - Cash Game & Stakes Level Strategy Blueprints (8 Stake Tiers): https://smarter.poker/learn/stakes ([Markdown](https://smarter.poker/learn/stakes.md))',
    '  - Famous Historical Poker Hands Solver Breakdowns (15 Iconic Hands): https://smarter.poker/learn/famous-hands ([Markdown](https://smarter.poker/learn/famous-hands.md))',
    '  - 30-Day Structured Poker Study Roadmaps: https://smarter.poker/learn/roadmaps ([Markdown](https://smarter.poker/learn/roadmaps.md))',
    '  - Poker Player Archetypes & Exploitative Strategy Hub (8 Profiles): https://smarter.poker/learn/player-types ([Markdown](https://smarter.poker/learn/player-types.md))',
    '  - Canonical Flop Board Textures & GTO C-Bet Encyclopedia (12 Textures): https://smarter.poker/learn/board-textures ([Markdown](https://smarter.poker/learn/board-textures.md))',
    '  - Poker Mental Game, Tilt Control & Peak Performance Guide: https://smarter.poker/learn/mental-game ([Markdown](https://smarter.poker/learn/mental-game.md))',
    '  - Poker As A Business: Professional Bankroll, Schedule C Tax & Entity Guide: https://smarter.poker/learn/poker-as-a-business ([Markdown](https://smarter.poker/learn/poker-as-a-business.md))',
    '  - Poker Math & Quantitative Formula Sheet (20 Core Equations): https://smarter.poker/learn/poker-math ([Markdown](https://smarter.poker/learn/poker-math.md))',
    '  - Printable Poker Strategy Cheat Sheets Hub: https://smarter.poker/learn/cheat-sheets ([Markdown](https://smarter.poker/learn/cheat-sheets.md))',
    '  - Online Poker Vs. Live Casino Poker Quantitative Comparison: https://smarter.poker/learn/online-vs-live-poker ([Markdown](https://smarter.poker/learn/online-vs-live-poker.md))',
    '  - Live Poker Tells, Timing Tells & Bet-Sizing Forensics: https://smarter.poker/learn/live-poker-tells ([Markdown](https://smarter.poker/learn/live-poker-tells.md))',
    '  - US State-By-State Poker Legal Status, Tax & Cardroom Directory: https://smarter.poker/poker-rooms/states ([Markdown](https://smarter.poker/poker-rooms/states.md))',
    '  - International Live Poker Destinations, Rake Caps & Global Tax Directory (10 Cities): https://smarter.poker/poker-rooms/international ([Markdown](https://smarter.poker/poker-rooms/international.md))',
    '  - Casino Poker Comps, Player Rewards & Dealer Tipping Guide: https://smarter.poker/poker-rooms/comps-and-tipping-guide ([Markdown](https://smarter.poker/poker-rooms/comps-and-tipping-guide.md))',
    '- **World Hub Interactive Simulators, Solvers & Training Utilities (with Raw Markdown Mirrors)**:',
    '  - Master Poker Tools & Calculators Directory (42 Free Tools): https://smarter.poker/tools ([Markdown](https://smarter.poker/tools.md))',
    '  - Multiway Poker Odds & Equity Calculator: https://smarter.poker/tools/poker-odds-calculator ([Markdown](https://smarter.poker/tools/poker-odds-calculator.md))',
    '  - Tournament ICM & Final Table Deal Calculator: https://smarter.poker/tools/icm-calculator ([Markdown](https://smarter.poker/tools/icm-calculator.md))',
    '  - 13x13 GTO Preflop Range Matrix & Position Hub: https://smarter.poker/tools/preflop-ranges ([Markdown](https://smarter.poker/tools/preflop-ranges.md))',
    '  - Pot Odds, Required Equity & MDF Calculator: https://smarter.poker/tools/pot-odds-calculator ([Markdown](https://smarter.poker/tools/pot-odds-calculator.md))',
    '  - Poker Bankroll & Risk Of Ruin Calculator: https://smarter.poker/tools/bankroll-calculator ([Markdown](https://smarter.poker/tools/bankroll-calculator.md))',
    '  - Poker Push/Fold Short-Stack Chart Calculator: https://smarter.poker/tools/push-fold-calculator ([Markdown](https://smarter.poker/tools/push-fold-calculator.md))',
    '  - PKO & Mystery Bounty Chip Equity Calculator: https://smarter.poker/tools/bounty-calculator ([Markdown](https://smarter.poker/tools/bounty-calculator.md))',
    '  - Poker Winrate, BB/100 & Hourly Rate Calculator: https://smarter.poker/tools/poker-winrate-calculator ([Markdown](https://smarter.poker/tools/poker-winrate-calculator.md))',
    '  - Multi-Way All-In Side Pot Calculator: https://smarter.poker/tools/side-pot-calculator ([Markdown](https://smarter.poker/tools/side-pot-calculator.md))',
    '  - Poker Tournament Blind Structure & Chip Distribution Generator: https://smarter.poker/tools/blind-structure-calculator ([Markdown](https://smarter.poker/tools/blind-structure-calculator.md))',
    '  - Stack-To-Pot Ratio (SPR) & Geometric Bet Sizing Calculator: https://smarter.poker/tools/spr-calculator ([Markdown](https://smarter.poker/tools/spr-calculator.md))',
    '  - Pot-Limit (PLO) Max Bet & Bomb Pot Calculator: https://smarter.poker/tools/plo-bet-calculator ([Markdown](https://smarter.poker/tools/plo-bet-calculator.md))',
    '  - Tournament Payout & Prize Pool Distribution Calculator: https://smarter.poker/tools/payout-calculator ([Markdown](https://smarter.poker/tools/payout-calculator.md))',
    '  - Live Cash Game Rake & Time-Charge Calculator: https://smarter.poker/tools/rake-calculator ([Markdown](https://smarter.poker/tools/rake-calculator.md))',
    '  - 3-Bet, 4-Bet & Minimum Defense Calculator: https://smarter.poker/tools/3bet-calculator ([Markdown](https://smarter.poker/tools/3bet-calculator.md))',
    '  - Final Table Deal & ICM Chop Calculator: https://smarter.poker/tools/chop-calculator ([Markdown](https://smarter.poker/tools/chop-calculator.md))',
    '  - Poker Variance & Downswing Simulator: https://smarter.poker/tools/variance-calculator ([Markdown](https://smarter.poker/tools/variance-calculator.md))',
    '  - Poker Outs & Draw Probability Calculator: https://smarter.poker/tools/outs-calculator ([Markdown](https://smarter.poker/tools/outs-calculator.md))',
    '  - US Poker Tax & Form W-2G Calculator: https://smarter.poker/tools/poker-tax-calculator ([Markdown](https://smarter.poker/tools/poker-tax-calculator.md))',
    '  - Poker Staking & Markup Split Calculator: https://smarter.poker/tools/staking-calculator ([Markdown](https://smarter.poker/tools/staking-calculator.md))',
    '  - Pre-Flop Isolation Raise Sizing Calculator: https://smarter.poker/tools/iso-calculator ([Markdown](https://smarter.poker/tools/iso-calculator.md))',
    '  - Home Game Chip Set & Setup Calculator: https://smarter.poker/tools/home-game-kit ([Markdown](https://smarter.poker/tools/home-game-kit.md))',
    '  - Poker Format Selector & Study Roadmap Quiz: https://smarter.poker/tools/format-quiz ([Markdown](https://smarter.poker/tools/format-quiz.md))',
    '  - Flop Board Texture & GTO C-Bet Analyzer: https://smarter.poker/tools/board-texture-analyzer ([Markdown](https://smarter.poker/tools/board-texture-analyzer.md))',
    '  - Harrington Tournament M-Ratio & Zone Calculator: https://smarter.poker/tools/m-ratio-calculator ([Markdown](https://smarter.poker/tools/m-ratio-calculator.md))',
    '  - Cash Game Session Planner & Net Hourly Income Calculator: https://smarter.poker/tools/session-planner ([Markdown](https://smarter.poker/tools/session-planner.md))',
    '  - Live Straddle & Bomb Pot EV Calculator: https://smarter.poker/tools/straddle-calculator ([Markdown](https://smarter.poker/tools/straddle-calculator.md))',
    '  - Poker Hand History Formatter (Reddit & Discord Markdown): https://smarter.poker/tools/hand-converter ([Markdown](https://smarter.poker/tools/hand-converter.md))',
    '  - Tournament Satellite Bubble Factor & Seat-Lock Calculator: https://smarter.poker/tools/satellite-calculator ([Markdown](https://smarter.poker/tools/satellite-calculator.md))',
    '  - Bad Beat Jackpot & High-Hand Promo EV Calculator: https://smarter.poker/tools/promo-ev-calculator ([Markdown](https://smarter.poker/tools/promo-ev-calculator.md))',
    '  - 10-Question Interactive GTO Poker IQ Diagnostic Test: https://smarter.poker/tools/poker-iq-test ([Markdown](https://smarter.poker/tools/poker-iq-test.md))',
    '  - Interactive Hold\'em Showdown Winner & Kicker Resolver: https://smarter.poker/tools/who-wins-calculator ([Markdown](https://smarter.poker/tools/who-wins-calculator.md))',
    '  - Printable Mixed Game & Dealer Rotation Placards: https://smarter.poker/tools/mixed-game-placards ([Markdown](https://smarter.poker/tools/mixed-game-placards.md))',
    '  - PLO Straight Wrap & Flush Redraw Outs Calculator: https://smarter.poker/tools/plo-outs-calculator ([Markdown](https://smarter.poker/tools/plo-outs-calculator.md))',
    '  - Tournament Late-Registration ICM Equity Calculator: https://smarter.poker/tools/late-reg-calculator ([Markdown](https://smarter.poker/tools/late-reg-calculator.md))',
    '  - Poker Winrate Confidence Interval & Sample Size Calculator: https://smarter.poker/tools/winrate-confidence-calculator ([Markdown](https://smarter.poker/tools/winrate-confidence-calculator.md))',
    '  - Poker Festival & Vegas Trip Expense Overhead Calculator: https://smarter.poker/tools/poker-trip-planner ([Markdown](https://smarter.poker/tools/poker-trip-planner.md))',
    '  - Live Poker Tournament Shot Clock & Time-Bank Timer: https://smarter.poker/tools/shot-clock ([Markdown](https://smarter.poker/tools/shot-clock.md))',
    '  - Multi-Street 2e & 3e Geometric Bet Sizing Calculator: https://smarter.poker/tools/geometric-bet-calculator ([Markdown](https://smarter.poker/tools/geometric-bet-calculator.md))',
    '  - Live Cash Game Table Selection & Profitability Scorer: https://smarter.poker/tools/table-selection-calculator ([Markdown](https://smarter.poker/tools/table-selection-calculator.md))',
    '  - MTT Tournament Grind Session & ABI Bankroll Planner: https://smarter.poker/tools/mtt-grind-planner ([Markdown](https://smarter.poker/tools/mtt-grind-planner.md))',
    '  - Embeddable Webmaster Poker Widgets & Streamer Bot Commands: https://smarter.poker/tools/embeds ([Markdown](https://smarter.poker/tools/embeds.md))',
    '  - Personal AI Assistant Hub: https://smarter.poker/hub/personal-assistant ([Markdown](https://smarter.poker/hub/personal-assistant.md))',
    '  - Leak Finder & EV Audit: https://smarter.poker/hub/personal-assistant/leaks ([Markdown](https://smarter.poker/hub/personal-assistant/leaks.md))',
    '  - Interactive Strategy Sandbox: https://smarter.poker/hub/personal-assistant/sandbox ([Markdown](https://smarter.poker/hub/personal-assistant/sandbox.md))',
    '  - Install Smarter.Poker Web App (PWA): https://smarter.poker/hub/install ([Markdown](https://smarter.poker/hub/install.md))',
    '  - VIP Membership Plan Comparison: https://smarter.poker/hub/vip-membership/compare ([Markdown](https://smarter.poker/hub/vip-membership/compare.md))',
    '  - Custom Spot Solver: https://smarter.poker/hub/training/custom-solve ([Markdown](https://smarter.poker/hub/training/custom-solve.md))',
    '  - Custom Rake Solver: https://smarter.poker/hub/training/custom-rake ([Markdown](https://smarter.poker/hub/training/custom-rake.md))',
    '  - Rake Solutions Browser: https://smarter.poker/hub/training/rake-solutions ([Markdown](https://smarter.poker/hub/training/rake-solutions.md))',
    '  - Multiway Preflop Solver: https://smarter.poker/hub/training/multiway-preflop ([Markdown](https://smarter.poker/hub/training/multiway-preflop.md))',
    '  - Interactive Preflop Charts: https://smarter.poker/hub/training/preflop-charts ([Markdown](https://smarter.poker/hub/training/preflop-charts.md))',
    '  - ICM Simulator: https://smarter.poker/hub/training/icm-simulator ([Markdown](https://smarter.poker/hub/training/icm-simulator.md))',
    '  - Final Table Deal Simulator: https://smarter.poker/hub/training/final-table-sim ([Markdown](https://smarter.poker/hub/training/final-table-sim.md))',
    '  - Famous Final Tables Replay Sim: https://smarter.poker/hub/training/famous-finals ([Markdown](https://smarter.poker/hub/training/famous-finals.md))',
    '  - Short Deck 6+ GTO Trainer: https://smarter.poker/hub/training/short-deck-trainer ([Markdown](https://smarter.poker/hub/training/short-deck-trainer.md))',
    '  - Quantal Response (QRE) Explorer: https://smarter.poker/hub/training/qre-explorer ([Markdown](https://smarter.poker/hub/training/qre-explorer.md))',
    '  - GTO Range Builder: https://smarter.poker/hub/training/range-builder ([Markdown](https://smarter.poker/hub/training/range-builder.md))',
    '  - Hand Analysis Lab: https://smarter.poker/hub/training/hand-lab ([Markdown](https://smarter.poker/hub/training/hand-lab.md))',
    '  - Side-By-Side Hand Comparison: https://smarter.poker/hub/training/hand-comparison ([Markdown](https://smarter.poker/hub/training/hand-comparison.md))',
    '  - Bankroll Risk of Ruin Analyzer: https://smarter.poker/hub/training/risk-analyzer ([Markdown](https://smarter.poker/hub/training/risk-analyzer.md))',
    '  - Spot Trainer: https://smarter.poker/hub/training/spot-trainer ([Markdown](https://smarter.poker/hub/training/spot-trainer.md))',
    '  - Custom Drill Builder: https://smarter.poker/hub/training/drill-builder ([Markdown](https://smarter.poker/hub/training/drill-builder.md))',
    '  - Custom Quiz Builder: https://smarter.poker/hub/training/quiz-builder ([Markdown](https://smarter.poker/hub/training/quiz-builder.md))',
    '  - GTO Flashcards: https://smarter.poker/hub/training/flashcards ([Markdown](https://smarter.poker/hub/training/flashcards.md))',
    '  - Position Mastery Trainer: https://smarter.poker/hub/training/position-mastery ([Markdown](https://smarter.poker/hub/training/position-mastery.md))',
    '  - Multi-Table Trainer: https://smarter.poker/hub/training/multi-table ([Markdown](https://smarter.poker/hub/training/multi-table.md))',
    '  - Autopilot Drill Mode: https://smarter.poker/hub/training/autopilot ([Markdown](https://smarter.poker/hub/training/autopilot.md))',
    '  - AI Coach Mode: https://smarter.poker/hub/training/coach-mode ([Markdown](https://smarter.poker/hub/training/coach-mode.md))',
    '  - Daily GTO Challenge: https://smarter.poker/hub/training/daily-challenge ([Markdown](https://smarter.poker/hub/training/daily-challenge.md))',
    '  - Quick 5-Hand Warmup: https://smarter.poker/hub/training/quick-warmup ([Markdown](https://smarter.poker/hub/training/quick-warmup.md))',
    '  - Session Warmup Routine: https://smarter.poker/hub/training/session-warmup ([Markdown](https://smarter.poker/hub/training/session-warmup.md))',
    '  - Weakness Scanner: https://smarter.poker/hub/training/weakness-scanner ([Markdown](https://smarter.poker/hub/training/weakness-scanner.md))',
    '  - Tilt Guard Monitor: https://smarter.poker/hub/training/tilt-guard ([Markdown](https://smarter.poker/hub/training/tilt-guard.md))',
    '  - Tournament Prep Planner: https://smarter.poker/hub/training/tournament-prep ([Markdown](https://smarter.poker/hub/training/tournament-prep.md))',
    '  - Grinder Focus Timer: https://smarter.poker/hub/training/focus-timer ([Markdown](https://smarter.poker/hub/training/focus-timer.md))',
    '  - Poker Skill Tree: https://smarter.poker/hub/training/skill-tree ([Markdown](https://smarter.poker/hub/training/skill-tree.md))',
    '  - Community Training Leaderboard: https://smarter.poker/hub/training/community-leaderboard ([Markdown](https://smarter.poker/hub/training/community-leaderboard.md))',
    '  - Study Group Finder: https://smarter.poker/hub/training/study-group-finder ([Markdown](https://smarter.poker/hub/training/study-group-finder.md))',
    '  - Live Training Feed: https://smarter.poker/hub/training/training-feed ([Markdown](https://smarter.poker/hub/training/training-feed.md))',
    '  - GTO Strategy News: https://smarter.poker/hub/training/gto-news ([Markdown](https://smarter.poker/hub/training/gto-news.md))',
    '  - GTO Solution Cache Preloader: https://smarter.poker/hub/training/gto-preloader ([Markdown](https://smarter.poker/hub/training/gto-preloader.md))',
    '  - Interactive Scenario Demo: https://smarter.poker/hub/training/scenario-demo ([Markdown](https://smarter.poker/hub/training/scenario-demo.md))',
    '  - GTO Solutions Browser: https://smarter.poker/hub/training/solutions ([Markdown](https://smarter.poker/hub/training/solutions.md))',
    '  - Hand History Upload: https://smarter.poker/hub/training/hand-history-upload ([Markdown](https://smarter.poker/hub/training/hand-history-upload.md))',
    '  - Training Daily Challenges: https://smarter.poker/hub/training/challenges ([Markdown](https://smarter.poker/hub/training/challenges.md))',
    '  - Training Tournaments: https://smarter.poker/hub/training/tournaments ([Markdown](https://smarter.poker/hub/training/tournaments.md))',
    '  - Training Accuracy Leaderboard: https://smarter.poker/hub/training/leaderboard ([Markdown](https://smarter.poker/hub/training/leaderboard.md))',
    '- **Editorial Standards & Mathematical Governance**: https://smarter.poker/editorial-standards (Markdown: https://smarter.poker/editorial-standards.md)',
    '- **Data Provenance & Verification Methodology**: https://smarter.poker/verification-methodology (Markdown: https://smarter.poker/verification-methodology.md)',
    '- **Unified JSON-LD Knowledge Graph**: https://smarter.poker/knowledge-graph.jsonld',
    '- **Multilingual AI Grounding Corpus (EN/ES/PT/DE/FR/IT/JA)**: https://smarter.poker/api/ai/corpus (Spanish: https://smarter.poker/llms-es.txt | Portuguese: https://smarter.poker/llms-pt.txt | German: https://smarter.poker/llms-de.txt | French: https://smarter.poker/llms-fr.txt | Italian: https://smarter.poker/llms-it.txt | Japanese: https://smarter.poker/llms-ja.txt)',
    '- **AI Crawler Attribution & Corpus Health Endpoint**: https://smarter.poker/api/ai/crawler-status',
    `- **MCP Registry Manifest**: https://smarter.poker/.well-known/mcp-registry.json (${MCP_TOOLS.length} MCP Tools, ${MCP_PROMPTS.length} MCP Prompts, ${MCP_RESOURCE_TEMPLATES.length} MCP Resource Templates)`,
    '- **Glama MCP Directory Listing**: https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp (Schema: https://glama.ai/mcp/servers/Smarter-Poker/smarter-poker-mcp/schema)',
    `- **All ${MCP_TOOLS.length} Zero-Auth MCP Tools**: ${MCP_TOOLS.map((t) => `\`${t.name}\``).join(', ')}`,
    `- **All ${MCP_PROMPTS.length} MCP Prompts**: ${MCP_PROMPTS.map((p) => `\`${p.name}\``).join(', ')}`,
    `- **Twitch & YouTube Streamer Chatbot Commands API (${STREAMER_BOT_COMMANDS.length} Commands: ${STREAMER_BOT_COMMANDS.map((c) => c.command).join(', ')})**: https://smarter.poker/api/stream/cmd?cmd=help`,
    `- **Self-Archived Zenodo DOIs (${ZENODO_RECORDS.length} Deposits)**:`,
    ...ZENODO_RECORDS.map((r, idx) => `  - Record ${idx + 1} (\`${r.doi}\`): ${r.doiUrl} - ${r.title}`),
    '- **Software Heritage (SWHID) Archival Snapshots**:',
    '  - Open Datasets Repository: `swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f` (https://archive.softwareheritage.org/swh:1:snp:ff23640ad24a3a825d320bae8621fd50ba58c16f)',
    '  - MCP Server Repository: `swh:1:snp:02b8992833424620305edcfb730b3cf8add15747` (https://archive.softwareheritage.org/swh:1:snp:02b8992833424620305edcfb730b3cf8add15747)',
    '- **Press Kit, Data Journalism & Media Resources**: https://smarter.poker/press ([Markdown](https://smarter.poker/press.md))',
    '- **RFC 9116 Security Disclosure Policy**: https://smarter.poker/.well-known/security.txt',
    '',
  ];
  return lines.join('\n');
}

export function syncLlmsFull({ write = false } = {}) {
  const current = fs.readFileSync(LLMS_FULL_PATH, 'utf8');
  const marker = '## 10. Poker Glossary & Strategy Lessons Corpus';
  const idx = current.indexOf(marker);
  const head = idx >= 0 ? current.slice(0, idx) : current.trimEnd() + '\n\n';
  const next = head + buildCatalogAppendix();

  if (write) {
    fs.writeFileSync(LLMS_FULL_PATH, next, 'utf8');
  }
  return { current, next, inSync: current === next };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  const res = syncLlmsFull({ write });
  if (write) {
    console.log('Updated public/llms-full.txt');
  } else if (!res.inSync) {
    console.error('public/llms-full.txt is out of sync with the corpus modules. Run: node scripts/generate-llms-full.mjs --write');
    process.exit(1);
  } else {
    console.log('public/llms-full.txt is in sync.');
  }
}
