/**
 * LAW: a page that markets up an answer must contain that answer.
 *
 * /hub/commander/faq declared a full FAQPage in JSON-LD - 28 questions with
 * their answers - while the HTML it served carried five questions, no answers
 * and 124 words of text. The other six categories were never mounted, and
 * every answer was unmounted until somebody clicked it.
 *
 * Two things were wrong with that. Google requires the answer content a
 * FAQPage declares to be present on the page, so the markup was unsupported.
 * And the page itself had nothing to index: the most substantial body of
 * Club Commander copy on the site was invisible to a crawler.
 *
 * Categories and answers are shown and hidden with CSS now, not by mounting.
 * A reader sees exactly what they saw before; a crawler sees the whole FAQ.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'pages/hub/commander/faq.js'), 'utf8');

test('every category is rendered, not only the active one', () => {
  // The regression: mapping over ONE category's faqs.
  assert.doesNotMatch(
    src,
    /currentCategory\.faqs\)\.map/,
    'the list must iterate every category, not just the selected one'
  );
  assert.match(
    src,
    /\(searchTerm \? filteredCategories : FAQ_CATEGORIES\)\.map/,
    'the unfiltered render must start from the whole FAQ_CATEGORIES set'
  );
});

test('an answer is hidden with CSS, never unmounted', () => {
  // `{open && (<div>{faq.answer}</div>)}` is the shape that emptied the page.
  assert.doesNotMatch(
    src,
    /\{\s*(?:open|expandedFAQ === [^)]*)\s*&&\s*\(/,
    'an unmounted answer is an answer the crawler never sees'
  );
  assert.match(
    src,
    /style=\{open \? undefined : \{ display: 'none' \}\}/,
    'the answer panel must be present and hidden, not absent'
  );
  assert.match(src, /\{faq\.answer\}/, 'the answer text must be rendered');
});

test('the accordion says what it controls', () => {
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /aria-controls=\{`faq-answer-/);
  assert.match(src, /id=\{`faq-answer-/);
});

test('the JSON-LD and the page agree on the questions', () => {
  // Both must come from the same constant - a hand-maintained second list is
  // how markup and page drift apart.
  assert.match(src, /mainEntity: FAQ_CATEGORIES\.flatMap/);
  assert.match(src, /'@type': 'FAQPage'/);
});

test('panel keys are stable across categories', () => {
  // Keyed by list index, two categories' third questions were the same key and
  // opening one opened the other once every category rendered at once.
  assert.match(src, /const key = `\$\{category\.id\}::\$\{faq\.question\}`/);
  assert.doesNotMatch(src, /toggleFAQ\(index\)/);
});
