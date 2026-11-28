/**
 * Master All-Phases (Tiers 1-6) Forensic Hardening Law Suite (2026-11-28)
 *
 * Permanently locks all 7 real cross-phase root-cause bugs uncovered and fixed
 * during the Phase 1-6 forensic sweep so NONE of them can ever regress:
 *
 *   F1: Zero phantom PostHog event names — every event in SEO_FUNNEL_EVENTS
 *       MUST have at least one real emitter in src/ or pages/, and every
 *       counter rendered in pages/admin/signup-health.js MUST exist in
 *       SEO_FUNNEL_EVENTS.
 *   F2+F3: Full End-To-End Series Reminder Contract — pages/hub/series/[id].js
 *       writes kind/label/eventDate/startDate/seriesName/venue/path ->
 *       sanitizeGuestSpots preserves every field -> syncGuestSavedSpotsToCloud
 *       mirrors sp_saved_spots_v1 into user_metadata without clobbering
 *       reminded_at -> organicWelcomeDripRunner Phase D dispatches the email
 *       and stamps reminded_at idempotently.
 *   F4: Verify-Phone ?unlocked=1 Route Parity — appendSeoUnlockedParam &
 *       describePendingDestination cover EVERY Tier 1-6 interactive route
 *       prefix (/tools, /learn, /poker-rooms, /glossary, /rules, /compare,
 *       /freerolls, /hub/series, /hub/venues, /hub/poker-near-me, /hub/tours,
 *       /hub/video-library/watch).
 *   F5: Complete Tier 1-6 Unlock & Peak-Utility PWA Copy Coverage.
 *   F6: Magic Link Telemetry Honesty — seo_quick_signup_magic_link_sent fires
 *       strictly AFTER signInWithOtp succeeds (never on error/422).
 *   F7: Dark-Social OAuth Attribution Permanence & Zero Static _app.js Weight.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { SEO_FUNNEL_EVENTS } from '../src/lib/acquisition/seoFunnelRollup.mjs';
import { runOrganicWelcomeDrip } from '../src/lib/seo/organicWelcomeDripRunner.mjs';
import {
  hasAttributionPayload,
  beginOAuthAttribution,
  attributionForNewAccount,
  recordFirstTouch,
} from '../src/lib/acquisition/firstTouch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else if (/\.(js|jsx|mjs|ts|tsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

function loadJsxModule(relPath, extraRequires = {}) {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const src = read(relPath);
  const compiled = ts.transpileModule(src, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: path.basename(relPath),
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    process,
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Math,
    JSON,
    Promise,
    require: (name) => {
      if (name in extraRequires) return extraRequires[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
      return {};
    },
  });
  return mod.exports;
}

// F1: Every event in SEO_FUNNEL_EVENTS MUST be emitted by live production source
test('FORENSIC LAW F1: zero phantom PostHog funnel events - every SEO_FUNNEL_EVENTS entry has a live emitter in src/ or pages/', () => {
  const files = [...walkFiles(path.join(ROOT, 'src')), ...walkFiles(path.join(ROOT, 'pages'))];
  const emittedEvents = new Set();
  const emitterRe = /(?:trackSeoFunnelEvent|trackFunnelEvent)\(\s*['"](seo_[a-z0-9_]+)['"]/g;

  for (const full of files) {
    if (full.endsWith('seoFunnelRollup.mjs')) continue;
    const content = fs.readFileSync(full, 'utf8');
    let m;
    while ((m = emitterRe.exec(content)) !== null) {
      emittedEvents.add(m[1]);
    }
  }

  for (const eventName of SEO_FUNNEL_EVENTS) {
    assert.ok(
      emittedEvents.has(eventName),
      `Phantom PostHog funnel event '${eventName}' in SEO_FUNNEL_EVENTS has ZERO emitters in src/ or pages/!`,
    );
  }

  // Every tierEventCards key rendered in pages/admin/signup-health.js must exist in SEO_FUNNEL_EVENTS
  const adminSrc = read('pages/admin/signup-health.js');
  const funnelSet = new Set(SEO_FUNNEL_EVENTS);
  const cardKeyRe = /\{\s*key:\s*'(seo_[a-z0-9_]+)'/g;
  let cm;
  let cardCount = 0;
  while ((cm = cardKeyRe.exec(adminSrc)) !== null) {
    cardCount += 1;
    assert.ok(
      funnelSet.has(cm[1]),
      `pages/admin/signup-health.js renders counter '${cm[1]}' which is NOT queried by SEO_FUNNEL_EVENTS!`,
    );
  }
  assert.ok(cardCount >= 9, `Expected >= 9 Tier 4-6 event counters in signup-health.js, found ${cardCount}`);
});

// F2 + F3: End-to-End Series Reminder -> sanitizeGuestSpots -> syncGuestSavedSpotsToCloud -> Phase D Email
test('FORENSIC LAW F2+F3: series Remind Me spot survives sanitizeGuestSpots -> syncGuestSavedSpotsToCloud -> Phase D reminder dispatch without losing fields or clobbering reminded_at', async () => {
  const seriesSrc = read('pages/hub/series/[id].js');
  for (const field of [
    "kind: 'series-reminder'",
    'label: eventLabel',
    'eventDate:',
    'startDate:',
    'seriesName:',
    'venue:',
    'path: redirectTarget',
  ]) {
    assert.ok(
      seriesSrc.includes(field),
      `pages/hub/series/[id].js reminderEntry must include '${field}' for Phase D email dispatch`,
    );
  }

  const bannerMod = loadJsxModule('src/components/seo/SmarterUnlockedWelcomeBanner.jsx', {
    'next/link': { __esModule: true, default: () => null },
    'next/router': { useRouter: () => ({ pathname: '/hub', asPath: '/hub', query: {}, replace: () => {} }) },
    '../../lib/seo/seoFunnelTelemetry': { trackSeoFunnelEvent: () => {} },
  });

  const nowMs = Date.parse('2026-11-28T10:00:00Z');
  const eventIso = '2026-11-28T12:00:00Z'; // T-2h upcoming!
  const rawReminderFromSeriesPage = {
    id: 'series-reminder-5001388-1',
    kind: 'series-reminder',
    label: '$540 Opening Day Deepstack',
    eventDate: eventIso,
    startDate: eventIso,
    seriesName: 'Gardens Poker Championship',
    venue: 'The Gardens Casino',
    path: '/hub/series/5001388',
    toolSlug: 'series-event-reminder',
    toolName: 'Tournament Event Reminder',
    summaryText: '$540 Opening Day Deepstack At Gardens Poker Championship',
    url: '/hub/series/5001388',
    savedAt: '2026-11-28T09:00:00Z',
  };

  // Step 1: sanitizeGuestSpots preserves all Phase D fields
  const sanitized = bannerMod.sanitizeGuestSpots([rawReminderFromSeriesPage]);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].kind, 'series-reminder');
  assert.equal(sanitized[0].label, '$540 Opening Day Deepstack');
  assert.equal(sanitized[0].eventDate, eventIso);
  assert.equal(sanitized[0].startDate, eventIso);
  assert.equal(sanitized[0].seriesName, 'Gardens Poker Championship');
  assert.equal(sanitized[0].venue, 'The Gardens Casino');
  assert.equal(sanitized[0].path, '/hub/series/5001388');

  // Step 2: syncGuestSavedSpotsToCloud mirrors structured spots into user_metadata
  const localMap = new Map([
    ['smarter-poker-auth', JSON.stringify({ access_token: 'tok_live_forensic_123456' })],
    ['sp_saved_spots_v1', JSON.stringify([rawReminderFromSeriesPage])],
  ]);
  const sessionMap = new Map();
  let mirroredMetaSpots = null;
  const synced = await bannerMod.syncGuestSavedSpotsToCloud({
    localStorage: {
      getItem: (k) => (localMap.has(k) ? localMap.get(k) : null),
      setItem: (k, v) => localMap.set(k, String(v)),
    },
    sessionStorage: {
      getItem: (k) => (sessionMap.has(k) ? sessionMap.get(k) : null),
      setItem: (k, v) => sessionMap.set(k, String(v)),
    },
    fetch: async () => ({ ok: true }),
    updateUserMetadata: async (spots) => {
      mirroredMetaSpots = spots;
    },
  });
  assert.equal(synced, true);
  assert.ok(Array.isArray(mirroredMetaSpots) && mirroredMetaSpots.length === 1);
  assert.equal(mirroredMetaSpots[0].kind, 'series-reminder');
  assert.equal(mirroredMetaSpots[0].eventDate, eventIso);

  // Step 3: Phase D runner consumes those EXACT mirrored spots & dispatches email + stamps reminded_at
  const sentEmails = [];
  let stampedMeta = null;
  const fakeSb = {
    auth: {
      admin: {
        listUsers: async () => ({
          data: {
            users: [
              {
                id: 'usr_forensic_1',
                email: 'player@example.com',
                created_at: '2026-11-20T00:00:00Z',
                user_metadata: {
                  first_name: 'Alex',
                  phone_verified: true,
                  sp_saved_spots_v1: mirroredMetaSpots,
                },
              },
            ],
          },
          error: null,
        }),
        updateUserById: async (_uid, body) => {
          stampedMeta = body.user_metadata;
          return { data: {}, error: null };
        },
      },
    },
  };

  const runRes = await runOrganicWelcomeDrip(fakeSb, {
    sendEmail: async (payload) => {
      sentEmails.push(payload);
      return { ok: true, id: 'msg_1' };
    },
    now: nowMs,
  });

  assert.equal(runRes.remindersSent, 1, 'Phase D must dispatch real reminder from mirrored series spot');
  assert.equal(sentEmails.length, 1);
  assert.match(sentEmails[0].subject, /Opening Day Deepstack/);
  assert.ok(stampedMeta.sp_saved_spots_v1[0].reminded_at, 'Phase D must stamp reminded_at');

  // Step 4: Later merge preserves reminded_at so re-sync never causes duplicate reminders
  const reMerged = bannerMod.mergeSavedSpotsPreservingReminders(
    stampedMeta.sp_saved_spots_v1,
    [rawReminderFromSeriesPage],
  );
  assert.equal(
    reMerged[0].reminded_at,
    stampedMeta.sp_saved_spots_v1[0].reminded_at,
    'mergeSavedSpotsPreservingReminders must preserve reminded_at stamp',
  );
});

// F4: Verify-Phone ?unlocked=1 route parity across all Tiers 1-6
test('FORENSIC LAW F4: pages/hub/verify-phone.js appends ?unlocked=1 and describes destinations for ALL Tier 1-6 conversion routes', () => {
  const vpSrc = read('pages/hub/verify-phone.js');
  for (const prefix of [
    "'/tools/'",
    "'/learn/'",
    "'/hub/series/'",
    "'/hub/venues/'",
    "'/hub/poker-near-me'",
    "'/hub/tours/'",
    "'/hub/video-library/watch/'",
    "'/poker-rooms/'",
    "'/glossary/'",
    "'/rules/'",
    "'/compare/'",
    "'/freerolls'",
  ]) {
    assert.ok(vpSrc.includes(prefix), `SEO_UNLOCK_PREFIXES in verify-phone.js must include ${prefix}`);
  }

  const vpMod = loadJsxModule('pages/hub/verify-phone.js', {
    'next/router': { useRouter: () => ({ query: {}, push: () => {}, replace: () => {} }) },
    '../../src/lib/phoneWelcome': { shouldOfferPhoneWelcome: () => true },
    '../../src/lib/pendingPhoneVerification.mjs': {
      savePendingPhoneVerification: () => {},
      readPendingPhoneVerification: () => null,
      clearPendingPhoneVerification: () => {},
    },
    '../../src/components/gates/VerificationConsole': { __esModule: true, default: () => null },
    '../../src/lib/analytics': { capture: () => {}, FunnelEvents: {} },
    '../../src/components/seo/SEOHead': { __esModule: true, default: () => null },
    '../../src/lib/supabase': { supabase: {} },
    '../../src/lib/authUtils': { useRequireAuth: () => ({}), authedFetch: () => {}, getAccessToken: () => '' },
    '../../src/engine/EventBus': { busEmit: () => {} },
    '../../src/lib/clubInvite': { fetchPendingJoinPath: async () => null, isSafeRelativePath: () => true, safeClubArenaPath: (p) => p },
    '../../src/lib/sms/codeDelivery.mjs': { codeNotDeliveredMessage: () => '' },
    '../../src/lib/promoCampaigns/promoSignupToken.mjs': {
      cleanPromoTokenShape: () => null,
      clearPendingPromoSignupToken: () => {},
      getOrCreateClubArenaDeviceId: () => '',
      readPendingPromoSignupToken: () => null,
      rememberPromoSignupToken: () => {},
    },
  });

  const tierRoutes = [
    '/tools/pot-odds-calculator',
    '/tools/gto-leak-finder',
    '/learn/category/preflop',
    '/poker-rooms/states/texas',
    '/glossary/pot-odds',
    '/rules/texas-holdem',
    '/hub/video-library/watch/vid_123',
    '/hub/venues/42',
    '/hub/series/5001388',
    '/hub/poker-near-me',
    '/hub/tours/wsop',
    '/compare/smarter-poker-vs-pokercode',
    '/freerolls',
  ];

  for (const route of tierRoutes) {
    assert.equal(
      vpMod.appendSeoUnlockedParam(route),
      `${route}?unlocked=1`,
      `appendSeoUnlockedParam must append ?unlocked=1 for Tier 1-6 route ${route}`,
    );
    const desc = vpMod.describePendingDestination(route);
    assert.ok(
      typeof desc === 'string' && desc.length > 5 && desc !== 'Your Smarter.Poker Account',
      `describePendingDestination must return tailored copy for ${route}, got: ${desc}`,
    );
  }
});

// F5: Complete Tier 1-6 unlock copy & peak-utility PWA copy coverage
test('FORENSIC LAW F5: UNLOCK_COPY_MAP and resolvePeakUtilityPwaCopy cover all Tier 4-6 unlock keys', () => {
  const bannerSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  for (const key of [
    'calc-session-milestone',
    'venue-follow',
    'local-state-rooms',
    'local-city-rooms',
    'local-game-rooms',
    'local-corridor-rooms',
    'series-alerts-event-reminder',
    'video-practice',
    'video-bookmark',
    'concept-bridge',
  ]) {
    assert.ok(
      bannerSrc.includes(`'${key}':`),
      `UNLOCK_COPY_MAP in SmarterUnlockedWelcomeBanner.jsx must include '${key}'`,
    );
  }

  const pwaMod = loadJsxModule('src/components/ui/PWAInstallPrompt.jsx', {
    'next/router': { useRouter: () => ({ pathname: '/hub' }) },
    '../../lib/supabase': { supabase: {} },
    '../../lib/pwaInstall': {
      initPWAInstallListener: () => {},
      isRunningAsApp: () => false,
      isKnownInstalled: () => false,
      markInstalled: () => {},
      getInstallInfo: () => ({ canInstall: false }),
      triggerInstall: async () => {},
      subscribeInstallChange: () => () => {},
    },
    '../../lib/pwaRoutePolicy': { installPromptDelay: () => 0 },
    './InstallGuideSheet': { __esModule: true, default: () => null },
  });

  assert.match(pwaMod.resolvePeakUtilityPwaCopy('venue-follow'), /Waitlists & Room Alerts/);
  assert.match(pwaMod.resolvePeakUtilityPwaCopy('video-practice'), /Daily GTO Drills/);
  assert.match(pwaMod.resolvePeakUtilityPwaCopy('calc-session-milestone'), /Daily GTO Drills/);
  assert.match(pwaMod.resolvePeakUtilityPwaCopy('concept-bridge-math'), /Daily GTO Drills/);
  assert.match(pwaMod.resolvePeakUtilityPwaCopy('series-alerts-event-reminder'), /Tournament Alerts/);
});

// F6: Magic Link telemetry fires strictly AFTER signInWithOtp succeeds
test('FORENSIC LAW F6: SmarterQuickSignupSheet only tracks seo_quick_signup_magic_link_sent AFTER signInWithOtp succeeds', () => {
  const sheetSrc = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  const fnStart = sheetSrc.indexOf('const handleMagicLinkSignIn');
  const fnEnd = sheetSrc.indexOf('const googleButtonLabel', fnStart);
  assert.ok(fnStart > 0 && fnEnd > fnStart);
  const block = sheetSrc.slice(fnStart, fnEnd);

  const otpIdx = block.indexOf('supabase.auth.signInWithOtp');
  const errReturnIdx = block.indexOf('return;', otpIdx);
  const trackIdx = block.indexOf("trackFunnelEvent('seo_quick_signup_magic_link_sent'");
  const sentStateIdx = block.indexOf('setMagicLinkSent(true)');

  assert.ok(otpIdx > 0, 'signInWithOtp call must exist');
  assert.ok(errReturnIdx > otpIdx, 'error return guard must follow signInWithOtp');
  assert.ok(
    trackIdx > errReturnIdx,
    'seo_quick_signup_magic_link_sent MUST fire AFTER signInWithOtp error guard returns (never on failed/422 attempts)',
  );
  assert.ok(sentStateIdx > trackIdx, 'setMagicLinkSent(true) must follow successful tracking');
});

// F7: Dark-social OAuth attribution permanence & zero static _app.js weight regression
test('FORENSIC LAW F7: dark-social OAuth attribution works without utm_source and SmarterUnlockedWelcomeBanner adds zero static supabase/analytics imports', () => {
  assert.equal(hasAttributionPayload({ acquisition_landing_path: '/glossary/pot-odds' }), true);
  assert.equal(hasAttributionPayload({}), false);

  const store = new Map();
  const win = {
    location: { search: '', pathname: '/glossary/pot-odds' },
    document: { referrer: '' },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    crypto: globalThis.crypto,
  };
  const t0 = Date.parse('2026-11-28T08:00:00Z');
  recordFirstTouch(win, t0 - 5000);
  const nonce = beginOAuthAttribution(win, t0);
  assert.match(nonce, /^[a-f0-9]{32}$/);
  const attr = attributionForNewAccount(
    {
      created_at: '2026-11-28T08:00:10Z',
      last_sign_in_at: '2026-11-28T08:00:11Z',
      app_metadata: { provider: 'google' },
      user_metadata: {},
    },
    win,
    t0 + 15000,
    nonce,
  );
  assert.equal(attr?.acquisition_landing_path, '/glossary/pot-odds');

  const bannerSrc = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  assert.doesNotMatch(
    bannerSrc,
    /^import\s+.*from\s+['"][^'"]*(?:lib\/supabase|lib\/analytics)['"]/m,
    'SmarterUnlockedWelcomeBanner must NOT add static supabase or analytics imports to _app.js',
  );
});

// F8: SmarterCalculatorSaveBar actions container wraps cleanly inside 390px cards
test('FORENSIC LAW F8: .calcSaveActions allows flex-shrink and max-width 100% so Share Spot never overflows narrow 390px cards', () => {
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const start = css.indexOf('.calcSaveActions {');
  const end = css.indexOf('}', start);
  assert.ok(start > 0 && end > start, '.calcSaveActions rule must exist');
  const block = css.slice(start, end);
  assert.match(block, /flex-wrap:\s*wrap/, '.calcSaveActions must wrap on narrow viewports');
  assert.match(block, /max-width:\s*100%/, '.calcSaveActions must bound width to 100% of card');
  assert.match(block, /min-width:\s*0/, '.calcSaveActions must set min-width: 0 so flex items can wrap');
  assert.doesNotMatch(block, /flex:\s*0\s+0\s+auto/, '.calcSaveActions must NOT set flex: 0 0 auto (prevents wrapping)');
});
