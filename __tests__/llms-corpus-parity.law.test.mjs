// Phase 33 (AEO Phase 15 of 16): Complete llms-full.txt corpus parity law test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncLlmsFull } from '../scripts/generate-llms-full.mjs';
import { LESSONS, LEARN_CATEGORIES } from '../src/content/learn/lessons.js';
import { COMPARE_PAGES } from '../src/content/compare/pages.js';
import { categoryAnchor } from '../src/lib/learn/learnSite.js';

test('public/llms-full.txt is 100% synchronized with LESSONS, LEARN_CATEGORIES, and COMPARE_PAGES', () => {
  const { current, inSync } = syncLlmsFull({ write: false });
  assert.ok(inSync, 'public/llms-full.txt drifted from the corpus modules; run node scripts/generate-llms-full.mjs --write');

  for (const cat of LEARN_CATEGORIES) {
    const slug = categoryAnchor(cat);
    assert.ok(current.includes(`https://smarter.poker/learn/category/${slug}`), `llms-full.txt lists category ${slug}`);
  }
  for (const lesson of LESSONS) {
    assert.ok(current.includes(`https://smarter.poker/learn/${lesson.slug}.md`), `llms-full.txt lists lesson ${lesson.slug}`);
  }
  for (const page of COMPARE_PAGES) {
    assert.ok(current.includes(`https://smarter.poker/compare/${page.slug}.md`), `llms-full.txt lists comparison ${page.slug}`);
  }
});
