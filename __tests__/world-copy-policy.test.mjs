import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  containsBannedWorldBar,
  normalizeWorldCopy,
  WORLD_COPY_SCOPE_CLASS,
} from '../src/lib/world-copy-policy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const appSource = readFileSync(join(ROOT, 'pages/_app.js'), 'utf8');
const policySource = readFileSync(join(ROOT, 'src/components/ui/WorldCopyPolicy.jsx'), 'utf8');
const inventory = JSON.parse(
  readFileSync(join(ROOT, '.agent/audits/2026-08-31-world-hub-menu-route-inventory.json'), 'utf8')
);

test('World copy normalization Title Cases visible words without damaging acronyms', () => {
  assert.equal(
    normalizeWorldCopy('review AQs with VIP and GTO tools'),
    'Review AQs With VIP And GTO Tools'
  );
  assert.equal(normalizeWorldCopy('high-stakes cash / tournament play'), 'High-Stakes Cash / Tournament Play');
  assert.equal(normalizeWorldCopy('37.5% equity'), '37.5% Equity');
});

test('World copy normalization removes every banned long separator bar', () => {
  for (const fixture of [
    ['news — videos', 'News: Videos'],
    ['cash – tournament', 'Cash: Tournament'],
    ['—', 'Not Available'],
    ['–', 'Not Available'],
  ]) {
    const normalized = normalizeWorldCopy(fixture[0]).trim();
    assert.equal(normalized, fixture[1]);
    assert.equal(containsBannedWorldBar(normalized), false);
  }
});

test('all 203 owned physical routes receive the shared copy boundary', () => {
  assert.equal(inventory.worldCount, 14);
  assert.equal(inventory.routeCount, 203);
  assert.match(appSource, /worldCopyWorldId = worldFooterConfig\?\.id \|\| null/);
  assert.match(appSource, /<WorldCopyPolicy worldId=\{worldCopyWorldId\}/);
  assert.equal(WORLD_COPY_SCOPE_CLASS, 'world-copy-scope');
  assert.match(appSource, /WORLD_COPY_SCOPE_CLASS/);
  assert.match(policySource, /document\.documentElement/);
  assert.match(policySource, /new MutationObserver/);
  assert.match(policySource, /characterData: true/);
  assert.match(policySource, /attributeFilter: COPY_ATTRIBUTES/);
  assert.match(policySource, /text-transform: capitalize !important/);
  assert.match(policySource, /data-preserve-case/);
  assert.match(policySource, /data-user-content/);
  assert.match(policySource, /data-post-content/);
  assert.match(policySource, /post-content/);
});

test('user content, social posts, and comments are protected from title casing', () => {
  assert.match(policySource, /data-user-content/);
  assert.match(policySource, /data-post-card/);
  assert.match(policySource, /data-post-content/);
  assert.match(policySource, /data-comment-content/);
  assert.match(policySource, /text-transform: none !important/);
});
