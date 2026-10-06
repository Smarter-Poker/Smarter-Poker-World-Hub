import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from '@babel/parser';

import { platformAdminUrl } from '../src/components/horses/platformAdmin.js';
import { TABS } from '../src/components/horses/tabRegistry.js';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

test('Platform Operations is a console-read code-split tab', () => {
  const tab = TABS.find((entry) => entry.id === 'platform');
  assert.ok(tab);
  assert.equal(tab.label, 'Platform Operations');
  assert.equal(tab.permission, 'console.read');
  assert.equal(typeof tab.load, 'function');
  assert.notEqual(tab.legacy, true);
});

test('platform URL builder preserves section-specific paging', () => {
  assert.equal(platformAdminUrl('breaks', { scorecardsLimit: 100, scorecardsOffset: 200 }), '/api/horses/platform-admin?section=breaks&scorecardsLimit=100&scorecardsOffset=200');
  assert.throws(() => platformAdminUrl('not-real'), /Unknown Platform Operations section/);
});

test('panel and route agree on the maintained Phase 8 list shapes', async () => {
  const source = await read('src/components/horses/PlatformPanel.jsx');
  const route = await read('pages/api/horses/platform-admin.js');
  for (const token of ['body.breakLog', 'body.circulationMarks', 'body.currentEngineSha', 'body.latestShippedSha']) {
    assert.match(source, new RegExp(token.replace('.', '\\.')), token);
  }
  assert.match(source, /pageOf\(value\)\.rows/);
  assert.match(route, /\.\.\.receipts/);
  assert.match(route, /currentEngineSha:/);
  assert.match(route, /latestShippedSha:/);
  assert.match(route, /\.\.\.stalenessList/);
  assert.match(route, /\.\.\.combined/);
  assert.match(route, /\.eq\('shipped', true\)/);
  assert.match(source, /\[body\.health, body\.staleness, body\.executions\]/);
  assert.match(source, /pages\.some\(\(page\) => page\.hasMore\)/);
  assert.match(source, /Durable Confirmed/);
  assert.match(source, /runtime\.breakEndsAt/);
});

test('estimated throughput and incident acknowledgement are labelled in UI copy', async () => {
  const source = await read('src/components/horses/PlatformPanel.jsx');
  assert.match(source, /Estimated Platform Hands Per Second/);
  assert.match(source, /Estimated From Active Tables And Measured-Table Hands Per Hour/);
  assert.match(source, /Acknowledgement Means Seen And Owned/);
  assert.match(source, /It Never Resolves A Drift/);
  assert.doesNotMatch(source, /Acknowledged\s*[,.:;-]?\s*Resolved/i);
});

test('incident evidence discloses permission filtering and the bounded merge cap', async () => {
  const panel = await read('src/components/horses/PlatformPanel.jsx');
  const model = await read('src/components/horses/platformAdmin.js');
  assert.match(panel, /Permission-Scoped Sources Withheld/);
  assert.match(panel, /This View Is Partial, Not Complete/);
  assert.match(panel, /Row Evidence Cap/);
  assert.match(model, /permissionRequiredSources/);
  assert.match(model, /maxRows/);
});

test('375px-first console layout retains focus, overflow and reduced-motion safeguards', async () => {
  const css = await read('src/components/horses/shared.module.css');
  const panel = await read('src/components/horses/PlatformPanel.jsx');
  assert.match(css, /\.platformInstrumentGrid,[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(min-width: 640px\)[\s\S]*?\.platformInstrumentGrid \{ grid-template-columns: repeat\(2/);
  assert.match(css, /@media \(min-width: 960px\)[\s\S]*?\.platformInstrumentGrid \{ grid-template-columns: repeat\(4/);
  assert.match(css, /\.opsSubnav \{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.opsSubnavBtn:focus-visible|\.platformPanel[^\n]*:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.platformPanel/);
  assert.match(panel, /aria-label="Platform Operations Sections"/);
  assert.match(panel, /aria-current=\{active === item\.id \? 'page'/);
  assert.match(panel, /aria-live="polite"/);
  assert.doesNotThrow(() => parse(panel, { sourceType: 'module', plugins: ['jsx'] }));
});

test('every PlatformPanel CSS module reference resolves', async () => {
  const css = await read('src/components/horses/shared.module.css');
  const panel = await read('src/components/horses/PlatformPanel.jsx');
  const definitions = new Set([...css.matchAll(/^\.([A-Za-z0-9_-]+)/gm)].map((match) => match[1]));
  for (const match of panel.matchAll(/styles\.([A-Za-z0-9_]+)/g)) assert.ok(definitions.has(match[1]), match[1]);
});
