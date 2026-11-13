import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { GUIDE_COPY, GUIDE_DESTINATIONS, businessHubKnowledge } from '../src/lib/businessHubGuide.mjs';
import { JOURNEY_COPY, VENUE_TOOLS, goalRecommendation, prepareVenueInquiry } from '../src/lib/businessHubJourney.mjs';
import { guideConsent, enableGuideAnalytics, disableGuideAnalytics, sanitizeGuideCapture } from '../src/lib/guideAnalyticsConsent.mjs';
import { qualifiedGuideQuery, loadQualifiedGuideVisits } from '../src/lib/acquisition/qualifiedGuideVisits.mjs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

test('guide sanitizer preserves the actual SDK ingestion contract while dropping private enrichment', () => {
  const require = createRequire(import.meta.url);
  const { PostHog } = require('posthog-js/lib/src/posthog-core');
  const input = { event: 'business_hub_goal_selected', properties: {
    token: 'synthetic-public-ingestion-token', distinct_id: 'anonymous-session-device',
    $session_id: 'random-session', $process_person_profile: false,
    topic: 'training', destination: 'training', language: 'en', source: 'direct',
    email: 'private@example.test', password: 'private-password', $current_url: 'https://private.example/?secret=value',
  } };
  // Run the installed SDK hook pipeline, which drops events if a required
  // transport property was removed. A sanitizer-only mock missed this defect.
  const output = PostHog.prototype._runBeforeSend.call({ config: { before_send: sanitizeGuideCapture } }, input);
  assert.ok(output, 'the real SDK must accept the sanitized event for transport');
  assert.equal(output.properties.token, input.properties.token);
  assert.equal(output.properties.distinct_id, input.properties.distinct_id);
  assert.equal(output.properties.$session_id, input.properties.$session_id);
  assert.equal(output.properties.$process_person_profile, false);
  assert.doesNotMatch(JSON.stringify(output), /private@example|private-password|private\.example|secret=value/);
  assert.equal(PostHog.prototype._runBeforeSend.call({ config: { before_send: sanitizeGuideCapture } }, { event: '$pageview', properties: input.properties }), null);
});

test('guide consent never loads before permission, respects privacy signals and excludes private capture data', async () => {
  const values = new Map();
  const browser = { navigator: {}, sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  let loads = 0, options, optedIn = false;
  const load = async () => { loads++; return { default: { init: (_key, config, name) => { options = config; assert.equal(name, 'smarter_guide'); return {
    opt_in_capturing: () => { optedIn = true; }, has_opted_in_capturing: () => optedIn,
    opt_out_capturing: () => { optedIn = false; }, reset() {},
  }; } } }; };
  assert.equal(guideConsent(browser), false);
  assert.equal(loads, 0);
  assert.equal(await enableGuideAnalytics(browser, load, ''), false);
  for (const navigator of [{ doNotTrack: '1' }, { globalPrivacyControl: true }]) assert.equal(await enableGuideAnalytics({ ...browser, navigator }, load, 'public-project-token'), false);
  assert.equal(loads, 0);
  assert.equal(await enableGuideAnalytics(browser, load, 'public-project-token'), true);
  assert.equal(guideConsent(browser), true);
  assert.equal(options.autocapture, false);
  assert.equal(options.capture_pageview, false);
  assert.equal(options.disable_session_recording, true);
  assert.equal(options.person_profiles, 'never');
  assert.equal(options.respect_dnt, true);
  const event = sanitizeGuideCapture({ event: 'business_hub_goal_selected', properties: { source: 'help', destination: 'training', '$session_id': 'random', '$current_url': 'private', email: 'private', form: 'private', distinct_id: 'random' } });
  assert.deepEqual(event.properties, { source: 'help', destination: 'training', '$session_id': 'random', distinct_id: 'random' });
  assert.equal(sanitizeGuideCapture({ event: '$autocapture' }), null);
  disableGuideAnalytics(browser);
  assert.equal(guideConsent(browser), false);
  assert.equal(optedIn, false);
});

test('qualified guide reporting uses exact shared window and fails closed on missing or incomplete provider data', async () => {
  const start = '2026-11-04T18:00:00.123Z', end = '2026-11-11T18:00:00.123Z';
  const sql = qualifiedGuideQuery(start, end);
  assert.match(sql, /uniqExact\(properties\.\$session_id\)/);
  assert.match(sql, /timestamp >=/);
  assert.match(sql, /timestamp </);
  assert.match(sql, /business_hub_goal_selected/);
  assert.match(sql, /business_hub_destination_click/);
  assert.throws(() => qualifiedGuideQuery("2026-01-01'; DROP TABLE events", end));
  let calls = 0;
  assert.equal(await loadQualifiedGuideVisits(start, end, { env: {}, fetch: () => { calls++; } }), null);
  assert.equal(calls, 0);
  for (const [body, expected] of [[{ results: [[0]] }, 0], [{ results: [[3]] }, 3], [{ results: [] }, null], [{ results: [['3']] }, null], [{ results: [[-1]] }, null], [{ results: [[3]], query_status: { complete: false } }, null], [{ error: 'private', results: [[3]] }, null]]) {
    const result = await loadQualifiedGuideVisits(start, end, { env: { POSTHOG_REPORTING_API_KEY: 'synthetic-server-secret', POSTHOG_REPORTING_PROJECT_ID: '729028' }, fetch: async (url, request) => {
      assert.equal(url, 'https://us.posthog.com/api/projects/729028/query/');
      assert.equal(request.redirect, 'error');
      assert.equal(request.cache, 'no-store');
      assert.equal(JSON.parse(request.body).query.query, sql);
      assert.ok(request.signal);
      return { ok: true, json: async () => body };
    } });
    assert.equal(result, expected);
  }
  assert.equal(await loadQualifiedGuideVisits(start, end, { env: { POSTHOG_REPORTING_API_KEY: 'synthetic', POSTHOG_REPORTING_PROJECT_ID: '729028' }, fetch: async () => { throw new Error('private'); } }), null);
});

test('English and Spanish cover the same audiences, tools and official destinations', () => {
  assert.deepEqual(GUIDE_COPY.en.tools.map(row => row.slice(0, 2)), GUIDE_COPY.es.tools.map(row => row.slice(0, 2)));
  assert.deepEqual(GUIDE_COPY.en.sections.map(s => [s.id, s.faqs.map(f => f[2])]), GUIDE_COPY.es.sections.map(s => [s.id, s.faqs.map(f => f[2])]));
  for (const copy of Object.values(GUIDE_COPY)) {
    for (const [, dest] of copy.tools) assert.ok(GUIDE_DESTINATIONS[dest]);
    for (const section of copy.sections) for (const [, answer, dest] of section.faqs) {
      assert.ok(answer.length > 50);
      if (dest) assert.ok(GUIDE_DESTINATIONS[dest]);
    }
  }
  for (const href of Object.values(GUIDE_DESTINATIONS).filter(h => h.startsWith('/'))) {
    const pathname = new URL(href, 'https://smarter.poker').pathname;
    assert.ok(['.js', '.jsx', '.tsx', '/index.js'].some(suffix => existsSync(new URL(`pages${pathname}${suffix}`, root))) || pathname === '/hub/club-arena', href);
  }
});

test('every goal has a grounded bilingual recommendation and access requirement', () => {
  for (const language of ['en', 'es']) for (const row of GUIDE_COPY[language].tools) {
    const recommendation = goalRecommendation(row[1], language);
    assert.equal(recommendation.href, GUIDE_DESTINATIONS[row[1]]);
    assert.equal(recommendation.name, row[3]);
    assert.equal(recommendation.access, JOURNEY_COPY[language].availability[row[1]]);
    assert.ok(recommendation.access.length > 70);
  }
  assert.equal(goalRecommendation('cash-out'), null);
  assert.match(goalRecommendation('club_arena').access, /Not Open For Play Yet/);
  assert.match(goalRecommendation('commander').access, /Does Not Activate/);
});

test('venue drafts stay bounded, encode customer text and cannot change recipient or headers', () => {
  for (const language of ['en', 'es']) for (const tool of Object.keys(VENUE_TOOLS)) {
    const draft = prepareVenueInquiry({ venue: 'Room & Club', city: 'Chicago, IL', tool, language });
    const url = new URL(draft.href);
    assert.equal(url.protocol, 'mailto:');
    assert.equal(url.pathname, 'support@smarter.poker');
    assert.equal(url.searchParams.get('subject'), 'Venue Onboarding');
    assert.equal(url.searchParams.get('body'), draft.body);
    assert.match(draft.body, /Room & Club/);
    assert.equal(url.searchParams.has('bcc'), false);
  }
  for (const fields of [{}, { venue: 'A', city: 'Chicago', tool: 'tables' }, { venue: 'Room\r\nBcc: evil', city: 'Chicago', tool: 'tables' }, { venue: 'x'.repeat(101), city: 'Chicago', tool: 'tables' }, { venue: 'Room', city: 'Chicago', tool: '__proto__' }]) assert.equal(prepareVenueInquiry(fields), null);
  assert.doesNotMatch(read('src/lib/businessHubJourney.mjs'), /\bfetch\s*\(|localStorage|sessionStorage/);
});

test('exported guidance preserves launch, payment, safe-support and language boundaries', () => {
  const en = businessHubKnowledge('en');
  assert.match(en, /Funded Diamond Games Are Not Open/);
  assert.match(en, /Payment Does Not Increase Reward Chances/);
  assert.match(en, /Never Send Passwords, Verification Codes, Government ID Or Financial Credentials/);
  assert.match(en, /Club Approval/);
  assert.match(en, /Does Not Activate Commander/);
  assert.match(businessHubKnowledge('es'), /No Tienen Valor Monetario/);
  assert.match(businessHubKnowledge('es'), /Códigos De Verificación/);
  assert.equal(businessHubKnowledge('invalid'), en);
});

test('changed authoritative inputs require explicit content review', () => {
  const review = JSON.parse(read('docs/business-hub-guide-review.json'));
  for (const path of ['pages/terms.js', 'pages/legal/official-rules.js', 'pages/about.js', 'src/lib/businessHubGuide.mjs', 'src/lib/businessHubJourney.mjs', 'pages/hub/commander/index.js', 'pages/hub/bankroll-manager.js', 'pages/hub/training.js', 'pages/hub/poker-near-me/lobby.js']) assert.ok(review.inputs[path], `${path} must remain covered by factual review`);
  for (const [path, expected] of Object.entries(review.inputs)) {
    assert.equal(createHash('sha256').update(read(path)).digest('hex'), expected,
      `${path} changed. Review guide/agent claims and changed-topic tests using docs/business-hub-guide.md before updating the reviewed hash.`);
  }
});

test('guide is wired into the public Help page and required checks', () => {
  assert.match(read('pages/hub/help.js'), /<BusinessHubGuide\s*\/>/);
  assert.match(read('pages/hub/help.js'), /href="\/privacy"/);
  for (const file of ['.husky/pre-push', '.github/workflows/build-safety-gate.yml']) {
    for (const testFile of ['business-hub-guide.test.mjs', 'business-hub-guide-activity.test.mjs', 'business-hub-product-truth.test.mjs']) assert.ok(read(file).includes(testFile), `${file}: ${testFile}`);
  }
});

test('concurrent consent initialization is single-instance and withdrawal during loading prevents activation', async () => {
  const makeBrowser = () => {
    const storage = new Map();
    return { navigator: {}, sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  };
  let release, initialized = 0;
  const loading = new Promise(resolve => { release = resolve; });
  const sdk = { default: { init: () => { initialized++; return { opt_in_capturing() {}, has_opted_in_capturing: () => true }; } } };
  const browser = makeBrowser();
  const first = enableGuideAnalytics(browser, () => loading, 'public');
  const second = enableGuideAnalytics(browser, () => loading, 'public');
  release(sdk);
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(initialized, 1);
  let releaseRevoked;
  const revokedLoad = new Promise(resolve => { releaseRevoked = resolve; });
  const revoked = makeBrowser();
  const pending = enableGuideAnalytics(revoked, () => revokedLoad, 'public');
  disableGuideAnalytics(revoked);
  releaseRevoked(sdk);
  assert.equal(await pending, false);
  assert.equal(initialized, 1);
  assert.equal(revoked.smarterGuideConsentGranted, false);
});
