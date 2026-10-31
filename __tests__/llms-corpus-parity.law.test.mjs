// Phase 33 (AEO Phase 15 of 16): Complete llms-full.txt corpus parity law test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncLlmsFull } from '../scripts/generate-llms-full.mjs';
import { LESSONS, LEARN_CATEGORIES } from '../src/content/learn/lessons.js';
import { STARTING_HANDS } from '../src/content/learn/hands.js';
import { RESEARCH_REPORTS } from '../src/content/research/reports.js';
import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { categoryAnchor } from '../src/lib/learn/learnSite.js';

test('public/llms-full.txt is 100% synchronized with LESSONS, LEARN_CATEGORIES, STARTING_HANDS, RESEARCH_REPORTS, and COMPARE_PAGES', () => {
  const { current, inSync } = syncLlmsFull({ write: false });
  assert.ok(inSync, 'public/llms-full.txt drifted from the corpus modules; run node scripts/generate-llms-full.mjs --write');

  for (const cat of LEARN_CATEGORIES) {
    const slug = categoryAnchor(cat);
    assert.ok(current.includes(`https://smarter.poker/learn/category/${slug}`), `llms-full.txt lists category ${slug}`);
  }
  for (const lesson of LESSONS) {
    assert.ok(current.includes(`https://smarter.poker/learn/${lesson.slug}.md`), `llms-full.txt lists lesson ${lesson.slug}`);
  }
  for (const hand of STARTING_HANDS) {
    assert.ok(current.includes(`https://smarter.poker/learn/hands/${hand.slug}.md`), `llms-full.txt lists starting hand ${hand.slug}`);
  }
  for (const report of RESEARCH_REPORTS) {
    assert.ok(current.includes(`https://smarter.poker/research/${report.slug}.md`), `llms-full.txt lists research report ${report.slug}`);
  }
  for (const page of COMPARE_PAGES) {
    assert.ok(current.includes(`https://smarter.poker/compare/${page.slug}.md`), `llms-full.txt lists comparison ${page.slug}`);
  }
});
