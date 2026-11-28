/**
 * EVERY INTERNAL LINK REACHES A PAGE, BEFORE MERGE (2026-11-28).
 *
 * scripts/ci/check-internal-links.mjs runs as CHECK 30 of the required
 * Pre-Deploy Safety Checks. Its first run found eight links that reached no
 * page: three Learn roadmap calculators under names that never existed
 * (chop, outs, variance), two admin runbook links to an unserved repo file,
 * a home-games link to /commander (Commander lives on its own host), and a
 * Messenger tab-icon badge drawn on /favicon.ico, which this site does not
 * have. Each was fixed at its source. These pins keep the check honest:
 * it must pass on the repo, must still catch the classes it exists for, and
 * must not be satisfied by response-header rules or conditional rewrites.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ALLOW,
  NOT_LINKS,
  checkInternalLinks,
  loadConfigSources,
  loadContentSlugs,
  loadRoutes,
  makeResolver,
} from '../scripts/ci/check-internal-links.mjs';

const ROOT = process.cwd();

test('every internal link in the source reaches a page', async () => {
  const { checked, broken } = await checkInternalLinks(ROOT);
  assert.ok(checked > 1000, `the check read the source (${checked} links)`);
  assert.deepEqual(broken.map((b) => `${b.file}:${b.line} ${b.link} (${b.reason})`), []);
});

test('the resolver still catches each class of broken link', async () => {
  const routes = loadRoutes(ROOT);
  const configSources = loadConfigSources(ROOT);
  const contentSlugs = await loadContentSlugs(ROOT);
  const resolve = makeResolver({ root: ROOT, routes, configSources, contentSlugs });
  for (const bad of [
    '/glossary/club-arena', // a glossary term the module never defined
    '/rules/no-such-ruling-zz', // a rules slug with no ruling
    '/learn/no-such-lesson-zz', // a lesson that does not exist
    '/compare/no-such-comparison', // a comparison that does not exist
    '/hub/no-such-world-zz', // the /hub/[orbId] catch-all 404s unknown worlds
    '/tools/tournament-chop-calculator', // a tool under a name it never had
    '/favicon.ico', // a public file that is not there
  ]) {
    assert.equal(resolve(bad).ok, false, `${bad} must be reported`);
  }
  for (const good of ['/', '/hub/training', '/tools/chop-calculator', '/api/health', '/hub/preflop-charts/stats']) {
    assert.equal(resolve(good).ok, true, `${good} must resolve`);
  }
});

test('response-header rules and conditional rewrites never vouch for a link', () => {
  const sources = loadConfigSources(ROOT).map((s) => s.source);
  assert.ok(sources.length > 50, 'redirect and rewrite sources were read');
  // "/(.*)" is a headers() rule: it serves no page.
  assert.ok(!sources.includes('/(.*)'), 'headers() sources are excluded');
  assert.ok(!sources.some((s) => s === '/:path*'), 'host- or header-conditional catch-alls are excluded');
});

test('every exception carries its reason, and the check is a required CI step', () => {
  for (const [link, reason] of [...ALLOW, ...NOT_LINKS]) {
    assert.ok(typeof reason === 'string' && reason.length > 20, `${link} needs a written reason`);
  }
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/build-safety-gate.yml'), 'utf8');
  const job = workflow.slice(workflow.indexOf('  safety-checks:'), workflow.indexOf('\n  notify-failure:'));
  assert.match(job, /node --no-warnings scripts\/ci\/check-internal-links\.mjs/, 'CHECK 30 runs inside Pre-Deploy Safety Checks');
});
