/**
 * Store readiness (Club Arena app), World Hub side of phase 6:
 *   - /privacy is a real server-rendered page (the stores crawl it);
 *   - the universal-link and app-link files are served from the environment
 *     and are a 404 until Dan sets the values (never a placeholder).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { appLinksResponse, cleanTeamId, cleanFingerprints, BUNDLE_ID } = require('../src/lib/app-links.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const PRINT = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

test('with nothing configured both files are 404 - no placeholder app id is ever published', () => {
  assert.equal(appLinksResponse('aasa', {}).status, 404);
  assert.equal(appLinksResponse('assetlinks', {}).status, 404);
  assert.equal(appLinksResponse('aasa', { APPLE_TEAM_ID: 'TEAMID' }).status, 404); // not 10 chars
  assert.equal(appLinksResponse('assetlinks', { ANDROID_RELEASE_CERT_SHA256: 'deadbeef' }).status, 404);
});

test('a configured Team ID yields an AASA that names the app and the Club Arena paths', () => {
  const { status, body } = appLinksResponse('aasa', { APPLE_TEAM_ID: ' abcde12345 ' });
  assert.equal(status, 200);
  const detail = body.applinks.details[0];
  assert.deepEqual(detail.appIDs, [`ABCDE12345.${BUNDLE_ID}`]);
  assert.deepEqual(detail.paths, ['/hub/club-arena', '/hub/club-arena/*']);
  assert.deepEqual(body.webcredentials.apps, [`ABCDE12345.${BUNDLE_ID}`]);
  assert.equal(cleanTeamId('abc'), null);
});

test('a configured certificate fingerprint yields assetlinks for the package', () => {
  const { status, body } = appLinksResponse('assetlinks', {
    ANDROID_RELEASE_CERT_SHA256: `${PRINT.toLowerCase()}, junk`,
  });
  assert.equal(status, 200);
  assert.equal(body[0].target.package_name, BUNDLE_ID);
  assert.deepEqual(body[0].target.sha256_cert_fingerprints, [PRINT]);
  assert.deepEqual(cleanFingerprints('nope'), []);
});

test('next.config serves the well-known files from those routes and no longer redirects /privacy away', () => {
  const cfg = read('next.config.js');
  assert.match(cfg, /source: '\/\.well-known\/apple-app-site-association', destination: '\/api\/app-links\/aasa'/);
  assert.match(cfg, /source: '\/\.well-known\/assetlinks\.json', destination: '\/api\/app-links\/assetlinks'/);
  assert.doesNotMatch(cfg, /source: '\/privacy', destination: '\/terms'/);
  assert.match(cfg, /source: '\/legal\/privacy', destination: '\/privacy'/);
});

test('/privacy is a page with no client state that renders the one PrivacySection', () => {
  const page = read('pages/privacy.js');
  assert.match(page, /import \{ PrivacySection, styles \} from '\.\/terms'/);
  assert.match(page, /<PrivacySection \/>/);
  assert.doesNotMatch(page, /useState|useEffect/);
  const terms = read('pages/terms.js');
  assert.match(terms, /export function PrivacySection\(\)/);
  // what a store reviewer looks for, on the page they will read
  for (const s of ['The Club Arena App', 'Deleting Your Account', 'Push Token', 'RevenueCat', 'PostHog', 'Our Error Logs']) {
    assert.ok(terms.includes(s), `privacy section names ${s}`);
  }
});
