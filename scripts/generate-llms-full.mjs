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
    `- **Verified Software & Cardroom Comparisons (${COMPARE_PAGES.length} Pages)**: https://smarter.poker/compare (Raw Markdown Directory: https://smarter.poker/compare.md)`,
    ...COMPARE_PAGES.map((p) => `  - [${p.title}](https://smarter.poker/compare/${p.slug}) ([Markdown](https://smarter.poker/compare/${p.slug}.md))`),
    '  - AI Comparisons API: `https://smarter.poker/api/ai/comparisons`',
    '- **Data Provenance & Verification Methodology**: https://smarter.poker/verification-methodology (Markdown: https://smarter.poker/verification-methodology.md)',
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
