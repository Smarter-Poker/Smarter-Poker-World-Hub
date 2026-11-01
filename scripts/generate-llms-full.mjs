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
import { categoryAnchor } from '../src/lib/learn/learnSite.js';

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
    '- **World Hub Interactive Simulators, Solvers & Training Utilities (with Raw Markdown Mirrors)**:',
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
    '- **MCP Registry Manifest**: https://smarter.poker/.well-known/mcp-registry.json',
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
