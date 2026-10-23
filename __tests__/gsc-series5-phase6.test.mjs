/**
 * GSC & Organic Growth Series 5 — Phase 6 Tests
 * Verifies:
 *   1. Hub-and-Spoke Internal Cross-Linking Mesh between /glossary/[term] and
 *      /learn/[topic] (every glossary term referenced by a lesson links back to
 *      that lesson on its static term page)
 *   2. Venue detail pages (/hub/venues/[id]) render crawlable breadcrumb links
 *      to their parent state and city directory hubs (/hub/poker-near-me/in/[state]
 *      and /hub/poker-near-me/in/[state]/[city])
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LESSONS, lessonPath } from '../src/content/learn/lessons.js';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.js';

const ROOT = process.cwd();

test('pages/glossary/[term].js imports LESSONS and lessonPath and cross-links matching strategy lessons', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/glossary/[term].js'), 'utf8');
  assert.match(src, /import\s+\{\s*LESSONS,\s*lessonPath\s*\}\s+from\s+['"]\.\.\/\.\.\/src\/content\/learn\/lessons['"]/);
  assert.match(src, /LESSONS\.filter\(\(l\)\s*=>\s*Array\.isArray\(l\.glossary\)\s*&&\s*l\.glossary\.includes\(term\.slug\)\)/);
  assert.match(src, /<Link href=\{lessonPath\(l\.slug\)\}/);
  assert.match(src, /Strategy Lessons/);
});

test('at least 20 glossary terms resolve to one or more strategy lessons in the /learn corpus', () => {
  const matchedTerms = GLOSSARY_TERMS.filter((term) =>
    LESSONS.some((l) => Array.isArray(l.glossary) && l.glossary.includes(term.slug))
  );
  assert.ok(
    matchedTerms.length >= 20,
    `Expected at least 20 glossary terms to cross-link to /learn lessons, got ${matchedTerms.length}`
  );
  for (const l of LESSONS) {
    assert.match(lessonPath(l.slug), /^\/learn\/[a-z0-9-]+$/);
  }
});

test('pages/hub/venues/[id].js renders crawlable state and city hub links in DeepRouteSignalDeck breadcrumbs', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/hub/venues/[id].js'), 'utf8');
  assert.match(
    src,
    /href:\s*`\/hub\/poker-near-me\/in\/\$\{encodeURIComponent\(String\(venue\.state\)\.trim\(\)\.toLowerCase\(\)\)\}`/
  );
  assert.match(
    src,
    /href:\s*`\/hub\/poker-near-me\/in\/\$\{encodeURIComponent\(String\(venue\.state\)\.trim\(\)\.toLowerCase\(\)\)\}\/\$\{encodeURIComponent\(String\(venue\.city\)\.trim\(\)\.toLowerCase\(\)\.replace\(\/\\s\+\/g,\s*'-'\)\)\}`/
  );
});
