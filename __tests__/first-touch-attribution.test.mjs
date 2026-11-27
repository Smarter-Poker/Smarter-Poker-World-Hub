/**
 * Campaign tags on LinkedIn and Reddit links must survive to the account
 * record. Before 2026-11-11 nothing captured them (no Vercel Web Analytics on
 * hub-vanguard; PostHog only loads on auth pages), so every tag was lost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRST_TOUCH_KEY, OAUTH_INTENT_KEY, cleanTag, parseFirstTouch, recordFirstTouch, firstTouchMetadata, attributionForNewAccount, beginOAuthAttribution, withAttributionNonce } from '../src/lib/acquisition/firstTouch.mjs';

function fakeWindow(search, pathname = '/freerolls', referrer = '') {
  const store = new Map();
  return {
    location: { search, pathname },
    document: { referrer },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    store,
  };
}

test('first tagged landing is kept and later landings never overwrite it', () => {
  const w = fakeWindow('?utm_source=linkedin&utm_medium=social&utm_campaign=freerolls');
  const t0 = Date.parse('2026-11-11T12:00:00Z');
  recordFirstTouch(w, t0);
  w.location = { search: '?utm_source=reddit&utm_medium=social&utm_campaign=poker', pathname: '/tools' };
  recordFirstTouch(w, t0 + 1000);
  assert.deepEqual(firstTouchMetadata(w, t0 + 2000), {
    acquisition_utm_source: 'linkedin',
    acquisition_utm_medium: 'social',
    acquisition_utm_campaign: 'freerolls',
    acquisition_landing_path: '/freerolls',
    acquisition_captured_at: '2026-11-11T12:00:00.000Z',
  });
});

test('an untagged visit records nothing and a direct tagged sign-up still attributes', () => {
  const w = fakeWindow('?ref=123');
  assert.equal(recordFirstTouch(w), null);
  assert.equal(w.store.has(FIRST_TOUCH_KEY), false);
  assert.deepEqual(firstTouchMetadata(w), {});
  const direct = fakeWindow('?utm_source=reddit', '/auth/signup');
  assert.equal(firstTouchMetadata(direct).acquisition_utm_source, 'reddit');
});

test('tags are restricted to a short safe alphabet', () => {
  assert.equal(cleanTag('<script>'), null);
  assert.equal(cleanTag('a b'), null);
  assert.equal(cleanTag('x'.repeat(100)).length, 64);
  assert.equal(parseFirstTouch('?utm_source=%22%3E%3Cimg', '/'), null);
  assert.equal(parseFirstTouch('?utm_source=linkedin', '/<x>').landing_path, '/');
  assert.equal(parseFirstTouch('?utm_source=linkedin', '/hub/club-arena/invite/SECRET42').landing_path, '/hub', 'deeper segments (invite codes, usernames) are never kept');
  const rec = parseFirstTouch('?utm_source=linkedin&access_token=abc&email=a%40b.c&code=xyz&utm_term=t', '/tools');
  assert.deepEqual(Object.keys(rec).sort(), ['captured_at', 'landing_path', 'utm_source'], 'only the campaign tags, first path segment and time are kept');
});

test('expired and corrupt records are ignored', () => {
  const w = fakeWindow('');
  w.localStorage.setItem(FIRST_TOUCH_KEY, '{bad');
  assert.deepEqual(firstTouchMetadata(w), {});
  w.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify({ utm_source: 'linkedin', captured_at: '2026-01-01T00:00:00Z' }));
  assert.deepEqual(firstTouchMetadata(w, Date.parse('2026-11-11T00:00:00Z')), {});
});

test('the app records first touch and sign-up writes it to the account metadata', () => {
  assert.match(readFileSync('pages/_app.js', 'utf8'), /acquisition\/firstTouch\.mjs'\)\s*\.then\(\(m\) => m\.recordFirstTouch\(\)\)/);
  const signup = readFileSync('pages/auth/signup.js', 'utf8');
  assert.match(signup, /import \{ firstTouchMetadata, beginOAuthAttribution, withAttributionNonce \} from '\.\.\/\.\.\/src\/lib\/acquisition\/firstTouch\.mjs';/);
  assert.match(signup, /\.\.\.firstTouchMetadata\(\),/);
});

function oauthUser(createdIso, signedInIso, extra = {}) {
  return { app_metadata: { provider: 'google' }, created_at: createdIso, last_sign_in_at: signedInIso, user_metadata: {}, ...extra };
}

test('OAuth: the campaign binds only to the flow this browser started, once', () => {
  const t0 = Date.parse('2026-11-11T18:00:00Z');
  const w = fakeWindow('?utm_source=reddit&utm_campaign=poker', '/tools');
  recordFirstTouch(w, t0 - 120_000);
  const nonce = beginOAuthAttribution(w, t0);
  assert.match(nonce, /^[a-f0-9]{32}$/);
  assert.equal(withAttributionNonce('https://x.invalid/auth/callback?next=%2Fhub', nonce), `https://x.invalid/auth/callback?next=%2Fhub&attr=${nonce}`);
  const fresh = oauthUser('2026-11-11T18:00:20.000Z', '2026-11-11T18:00:20.300Z');
  assert.equal(attributionForNewAccount(fresh, w, t0 + 30_000, nonce).acquisition_utm_source, 'reddit');
  assert.equal(w.store.has(OAUTH_INTENT_KEY), false, 'the nonce is single-use');
  assert.equal(attributionForNewAccount(fresh, w, t0 + 40_000, nonce), null, 'a retried callback cannot attribute again');
});

test('OAuth: delayed completion within the hour is still attributed', () => {
  const t0 = Date.parse('2026-11-11T18:00:00Z');
  const w = fakeWindow('?utm_source=linkedin&utm_campaign=freerolls', '/freerolls');
  recordFirstTouch(w, t0 - 60_000);
  const nonce = beginOAuthAttribution(w, t0);
  const finishedLate = oauthUser('2026-11-11T18:40:00.000Z', '2026-11-11T18:40:00.200Z');
  assert.equal(attributionForNewAccount(finishedLate, w, t0 + 40 * 60_000 + 5_000, nonce).acquisition_utm_campaign, 'freerolls');
  const w2 = fakeWindow('?utm_source=linkedin', '/freerolls');
  recordFirstTouch(w2, t0 - 60_000);
  const n2 = beginOAuthAttribution(w2, t0);
  const tooLate = oauthUser('2026-11-11T19:30:00.000Z', '2026-11-11T19:30:00.200Z');
  assert.equal(attributionForNewAccount(tooLate, w2, t0 + 90 * 60_000, n2), null, 'an intent older than an hour expires');
});

test('OAuth: existing users, ordinary logins and other flows are never attributed', () => {
  const t0 = Date.parse('2026-11-11T18:00:00Z');
  const make = () => { const w = fakeWindow('?utm_source=reddit', '/tools'); recordFirstTouch(w, t0 - 60_000); return w; };
  let w = make(); let n = beginOAuthAttribution(w, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-10-01T00:00:00Z', '2026-11-11T18:00:10Z'), w, t0 + 10_000, n), null, 'existing account signing in');
  w = make(); n = beginOAuthAttribution(w, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T17:55:00Z', '2026-11-11T18:00:10Z'), w, t0 + 10_000, n), null, 'account made minutes ago, signing in again');
  w = make(); beginOAuthAttribution(w, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T18:00:05Z', '2026-11-11T18:00:05.1Z'), w, t0 + 10_000, null), null, 'callback without attr (ordinary login or email link)');
  w = make(); const older = beginOAuthAttribution(w, t0); beginOAuthAttribution(w, t0 + 1_000);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T18:00:05Z', '2026-11-11T18:00:05.1Z'), w, t0 + 10_000, older), null, 'an older flow\'s nonce does not match');
  const other = fakeWindow('', '/'); recordFirstTouch(other, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T18:00:05Z', '2026-11-11T18:00:05.1Z'), other, t0 + 10_000, 'a'.repeat(32)), null, 'another browser has no matching intent');
  w = make(); n = beginOAuthAttribution(w, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T18:00:05Z', '2026-11-11T18:00:05.1Z', { user_metadata: { acquisition_utm_source: 'linkedin' } }), w, t0 + 10_000, n), null, 'first attribution wins');
  w = make(); n = beginOAuthAttribution(w, t0);
  assert.equal(attributionForNewAccount(oauthUser('2026-11-11T18:00:05Z', '2026-11-11T18:00:05.1Z', { app_metadata: { provider: 'email' } }), w, t0 + 10_000, n), null, 'email accounts are attributed at signUp');
  assert.equal(beginOAuthAttribution(fakeWindow('', '/auth/login'), t0), null, 'no campaign, no intent');
});

test('the OAuth callback writes attribution for new accounts', () => {
  const cb = readFileSync('pages/auth/callback.js', 'utf8');
  assert.match(cb, /import \{ attributionForNewAccount \} from '\.\.\/\.\.\/src\/lib\/acquisition\/firstTouch\.mjs';/);
  assert.match(cb, /const acquisition = attributionForNewAccount\(user, window, Date\.now\(\), attrParam \|\| null\);\s*if \(acquisition\) await supabase\.auth\.updateUser\(\{ data: acquisition \}\);/);
  for (const page of ['pages/auth/signup.js', 'pages/auth/login.js']) {
    const src = readFileSync(page, 'utf8');
    assert.match(src, /const attributionNonce = beginOAuthAttribution\(\);/, page);
    assert.match(src, /redirectTo: withAttributionNonce\(/, page);
  }
});

test('organic search and AI referrers are attributed when utm_source is absent', () => {
  const t0 = Date.parse('2026-11-27T12:00:00Z');

  // Organic Google (desktop & international)
  const g = parseFirstTouch('', '/tools/poker-odds-calculator', t0, 'https://www.google.com/search?q=poker+odds');
  assert.equal(g.utm_source, 'google');
  assert.equal(g.utm_medium, 'organic');
  assert.equal(g.landing_path, '/tools/poker-odds-calculator');

  const gUk = parseFirstTouch('', '/poker-rooms/nevada/las-vegas/extra-ignored', t0, 'https://www.google.co.uk/');
  assert.equal(gUk.utm_source, 'google');
  assert.equal(gUk.utm_medium, 'organic');
  assert.equal(gUk.landing_path, '/poker-rooms/nevada/las-vegas');

  // Android Google Search app
  const gApp = parseFirstTouch('', '/hub/venues/bellagio-las-vegas', t0, 'android-app://com.google.android.googlequicksearchbox/');
  assert.equal(gApp.utm_source, 'google');
  assert.equal(gApp.utm_medium, 'organic');
  assert.equal(gApp.landing_path, '/hub/venues/bellagio-las-vegas');

  // Bing, DuckDuckGo, Yahoo, Brave, Ecosia
  const bing = parseFirstTouch('', '/learn/icm-basics', t0, 'https://www.bing.com/search?q=icm+poker');
  assert.equal(bing.utm_source, 'bing');
  assert.equal(bing.utm_medium, 'organic');
  assert.equal(bing.landing_path, '/learn/icm-basics');

  assert.deepEqual(
    [
      parseFirstTouch('', '/rules', t0, 'https://duckduckgo.com/'),
      parseFirstTouch('', '/games', t0, 'https://search.yahoo.com/search?p=poker'),
      parseFirstTouch('', '/glossary', t0, 'https://search.brave.com/search?q=gto'),
      parseFirstTouch('', '/research', t0, 'https://www.ecosia.org/search?q=poker'),
    ].map((r) => [r.utm_source, r.utm_medium]),
    [
      ['duckduckgo', 'organic'],
      ['yahoo', 'organic'],
      ['brave', 'organic'],
      ['ecosia', 'organic'],
    ]
  );

  // AI answer engines (including gemini.google.com taking precedence over google.*)
  assert.deepEqual(
    [
      parseFirstTouch('', '/tools/icm-calculator', t0, 'https://chatgpt.com/'),
      parseFirstTouch('', '/tools/icm-calculator', t0, 'https://chat.openai.com/c/123'),
      parseFirstTouch('', '/compare/gto-wizard', t0, 'https://www.perplexity.ai/search/best-gto'),
      parseFirstTouch('', '/features/gto-trainer', t0, 'https://claude.ai/chat/abc'),
      parseFirstTouch('', '/hub/series/wsop-2026', t0, 'https://gemini.google.com/app'),
      parseFirstTouch('', '/hub/poker-near-me/texas', t0, 'https://copilot.microsoft.com/'),
    ].map((r) => [r.utm_source, r.utm_medium, r.landing_path]),
    [
      ['chatgpt', 'ai_referral', '/tools/icm-calculator'],
      ['chatgpt', 'ai_referral', '/tools/icm-calculator'],
      ['perplexity', 'ai_referral', '/compare/gto-wizard'],
      ['claude', 'ai_referral', '/features/gto-trainer'],
      ['gemini', 'ai_referral', '/hub/series/wsop-2026'],
      ['copilot', 'ai_referral', '/hub/poker-near-me/texas'],
    ]
  );

  // Explicit utm_source still wins over referrer
  const explicit = parseFirstTouch('?utm_source=reddit&utm_medium=social', '/tools/poker-odds-calculator', t0, 'https://www.google.com/');
  assert.equal(explicit.utm_source, 'reddit');
  assert.equal(explicit.utm_medium, 'social');

  // Empty, internal smarter.poker, and unknown referrers return null
  assert.equal(parseFirstTouch('', '/tools/poker-odds-calculator', t0, ''), null);
  assert.equal(parseFirstTouch('', '/tools/poker-odds-calculator', t0, 'https://smarter.poker/hub'), null);
  assert.equal(parseFirstTouch('', '/tools/poker-odds-calculator', t0, 'https://www.smarter.poker/learn'), null);
  assert.equal(parseFirstTouch('', '/tools/poker-odds-calculator', t0, 'https://example.com/blog'), null);

  // recordFirstTouch reads win.document.referrer and persists through to firstTouchMetadata
  const w = fakeWindow('', '/tools/poker-odds-calculator', 'https://chatgpt.com/');
  recordFirstTouch(w, t0);
  assert.deepEqual(firstTouchMetadata(w, t0 + 1000), {
    acquisition_utm_source: 'chatgpt',
    acquisition_utm_medium: 'ai_referral',
    acquisition_landing_path: '/tools/poker-odds-calculator',
    acquisition_captured_at: '2026-11-27T12:00:00.000Z',
  });
});
