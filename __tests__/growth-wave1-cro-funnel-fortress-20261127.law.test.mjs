/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GROWTH WAVE 1 CI FORTRESS: CRO FUNNEL, PRE-SIGNUP OFFER, GEO AI WELCOME,
 *  LIVE SOCIAL PROOF, CLOUD SPOT SYNC & SMART GEO-DEFAULTS (2026-11-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for Lane 1 CRO funnel upgrades:
 *   1. Zero-dependency src/lib/seo/seoExperiment.js deterministic A/B bucket
 *      ('control-gto' vs 'welcome-vip-500' in sessionStorage sp_seo_exp_v1)
 *      and AI referral welcome detector (ChatGPT, Perplexity, Claude, Gemini).
 *   2. SmarterQuickSignupSheet pre-signup 30-Day VIP + 500 Diamonds offer badge,
 *      A/B experiment_variant telemetry, AI welcome eyebrow, and cached live
 *      /api/poker/platform-counts social proof with verified static fallback.
 *   3. SmarterAccountUnlockGate #SMARTERDESIGN pre-signup welcome-offer ribbon.
 *   4. GuestConversionBar tailored AI-visitor copy + concise 30-Day VIP hook.
 *   5. SmarterUnlockedWelcomeBanner non-blocking cloud saved-spot sync
 *      (localStorage sp_saved_spots_v1 -> /api/training/tool-records, guarded
 *      by sessionStorage sp_spots_synced_v1, swallowing auth/network errors).
 *   6. pages/auth/signup.js smart timezone geo-defaulting to NON_US_COUNTRIES
 *      preserving US default for US visitors and ?state=/?country= overrides.
 *   7. Strict ZERO lib/analytics imports across all _app.js-reachable SEO
 *      conversion files + zero em/en dashes + zero banned gold hexes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const {
  SEO_OFFER_EXPERIMENT_KEY,
  SEO_OFFER_VARIANTS,
  getSeoOfferExperiment,
  detectAiWelcomeEngine,
  getAiWelcomeContext,
} = await import('../src/lib/seo/seoExperiment.js');

const { NON_US_COUNTRIES } = await import('../src/lib/countries.js');

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

test('WAVE1 LAW 1: seoExperiment.js is zero-dependency, buckets deterministically into sp_seo_exp_v1, and detects AI engines', () => {
  const src = read('src/lib/seo/seoExperiment.js');
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.doesNotMatch(codeOnly, /^\s*import\s+/m, 'seoExperiment.js must remain strictly zero-dependency with zero imports');
  assert.doesNotMatch(codeOnly, /lib\/analytics/, 'seoExperiment.js must never reference lib/analytics');
  assert.equal(SEO_OFFER_EXPERIMENT_KEY, 'sp_seo_exp_v1');
  assert.deepEqual([...SEO_OFFER_VARIANTS], ['control-gto', 'welcome-vip-500']);

  const storeA = makeMemoryStorage();
  const variantA1 = getSeoOfferExperiment({ storage: storeA, randomFn: () => 0.12 });
  const variantA2 = getSeoOfferExperiment({ storage: storeA, randomFn: () => 0.99 });
  assert.equal(variantA1, 'control-gto');
  assert.equal(variantA2, 'control-gto', 'persisted sp_seo_exp_v1 bucket must stay deterministic across calls');
  assert.equal(storeA.getItem('sp_seo_exp_v1'), 'control-gto');

  const storeB = makeMemoryStorage();
  const variantB1 = getSeoOfferExperiment({ storage: storeB, randomFn: () => 0.78 });
  const variantB2 = getSeoOfferExperiment({ storage: storeB, randomFn: () => 0.01 });
  assert.equal(variantB1, 'welcome-vip-500');
  assert.equal(variantB2, 'welcome-vip-500', 'welcome-vip-500 bucket must persist in sessionStorage');
  assert.equal(storeB.getItem('sp_seo_exp_v1'), 'welcome-vip-500');

  const chatgpt = getAiWelcomeContext({ referrer: 'https://chatgpt.com/c/1234', search: '' });
  assert.equal(chatgpt?.engine, 'chatgpt');
  assert.equal(chatgpt?.label, 'ChatGPT');
  assert.equal(chatgpt?.eyebrow, 'Welcome From ChatGPT - Run Live GTO Solvers Free');
  assert.equal(chatgpt?.barCopy, 'From ChatGPT? Run Live GTO Solvers & Save Ranges Free');

  const perplexity = detectAiWelcomeEngine({ referrer: 'https://www.perplexity.ai/search?q=gto', search: '' });
  assert.equal(perplexity?.engine, 'perplexity');
  assert.equal(perplexity?.label, 'Perplexity');

  const claude = detectAiWelcomeEngine({ referrer: 'https://claude.ai/chat/abc', search: '' });
  assert.equal(claude?.engine, 'claude');
  assert.equal(claude?.label, 'Claude');

  const gemini = detectAiWelcomeEngine({ referrer: '', search: '?utm_source=gemini' });
  assert.equal(gemini?.engine, 'gemini');
  assert.equal(gemini?.label, 'Gemini');

  assert.equal(detectAiWelcomeEngine({ referrer: 'https://www.google.com/', search: '' }), null);
  assert.equal(detectAiWelcomeEngine({ referrer: 'https://smarter.poker/tools', search: '' }), null);
});

test('WAVE1 LAW 2: SmarterQuickSignupSheet wires pre-signup VIP+500 offer, A/B experiment_variant, AI welcome, and cached platform-counts proof', () => {
  const src = read('src/components/seo/SmarterQuickSignupSheet.jsx');
  assert.match(src, /import\s+\{\s*getSeoOfferExperiment,\s*getAiWelcomeContext\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/seo\/seoExperiment['"]/);
  assert.match(src, /Includes Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
  assert.match(src, /data-testid="quick-signup-welcome-offer"/);
  assert.match(src, /data-testid="quick-signup-ai-welcome"/);
  assert.match(src, /data-testid="quick-signup-live-proof"/);
  assert.match(src, /experiment_variant:\s*(?:activeVariant|experimentVariant)/);
  assert.match(src, /\/api\/poker\/platform-counts/);
  assert.match(src, /directory\?\.public_playable/);
  assert.match(src, /current_tables\?\.published/);
  assert.match(src, /STATIC_SOCIAL_PROOF/);
});

test('WAVE1 LAW 3: SmarterAccountUnlockGate renders #SMARTERDESIGN pre-signup welcome-offer ribbon', () => {
  const src = read('src/components/seo/SmarterAccountUnlockGate.jsx');
  assert.match(src, /data-testid="unlock-gate-welcome-ribbon"/);
  assert.match(src, /Bonus: Free 30-Day VIP \+ 500 Diamonds On Phone Verify/);
});

test('WAVE1 LAW 4: GuestConversionBar renders tailored AI-visitor copy and concise 30-Day VIP hook safely for 390px mobile', () => {
  const src = read('src/components/seo/GuestConversionBar.jsx');
  assert.match(src, /import\s+\{\s*getAiWelcomeContext\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/seo\/seoExperiment['"]/);
  assert.match(src, /From \$\{aiWelcome\.label\}\? Run Live GTO Solvers & Save Ranges Free/);
  assert.match(src, /30-Day VIP/);
  assert.match(src, /overflow:\s*hidden/);
  assert.match(src, /text-overflow:\s*ellipsis/);
});

test('WAVE1 LAW 5: SmarterUnlockedWelcomeBanner syncs sp_saved_spots_v1 non-blockingly on signed-in mount and guards with sp_spots_synced_v1', async () => {
  const src = read('src/components/seo/SmarterUnlockedWelcomeBanner.jsx');
  assert.match(src, /SAVED_SPOTS_STORAGE_KEY\s*=\s*['"]sp_saved_spots_v1['"]/);
  assert.match(src, /SPOTS_SYNCED_SESSION_KEY\s*=\s*['"]sp_spots_synced_v1['"]/);
  assert.match(src, /smarter-poker-auth/);
  assert.match(src, /\/api\/training\/tool-records/);
  assert.match(src, /void syncGuestSavedSpotsToCloud\(\)/);

  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const compiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'SmarterUnlockedWelcomeBanner.jsx',
  }).outputText;

  const tracked = [];
  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console,
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (name === 'next/link') return { default: () => null };
      if (name === 'next/router') return { useRouter: () => ({ asPath: '/hub' }) };
      if (name.endsWith('/seoFunnelTelemetry')) return { trackSeoFunnelEvent: (e, p) => tracked.push({ e, p }) };
      if (name.endsWith('.module.css')) return { default: {} };
      return {};
    },
  });

  const { syncGuestSavedSpotsToCloud } = mod.exports;
  assert.equal(typeof syncGuestSavedSpotsToCloud, 'function');

  // 1) Happy path: signed-in user with guest spots syncs once and marks sp_spots_synced_v1
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  localStore.setItem('smarter-poker-auth', JSON.stringify({ access_token: 'valid_jwt_token_123456' }));
  localStore.setItem('sp_saved_spots_v1', JSON.stringify([
    { id: 'spot_1', toolSlug: 'pot-odds-calculator', toolName: 'Pot Odds', summaryText: '25% equity', url: '/tools/pot-odds-calculator', savedAt: '2026-11-27T00:00:00Z' },
  ]));
  const requests = [];
  const ok = await syncGuestSavedSpotsToCloud({
    localStorage: localStore,
    sessionStorage: sessionStore,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  assert.equal(ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/training/tool-records');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.Authorization, 'Bearer valid_jwt_token_123456');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.toolId, 'calculator-saved-spots');
  assert.equal(body.data.spots.length, 1);
  assert.equal(sessionStore.getItem('sp_spots_synced_v1'), '1');
  assert.equal(tracked.some((t) => t.e === 'seo_guest_spots_synced'), true);

  // 2) Second call in same session is a no-op because sp_spots_synced_v1 is already set
  const second = await syncGuestSavedSpotsToCloud({
    localStorage: localStore,
    sessionStorage: sessionStore,
    fetch: async () => { throw new Error('Should not re-fetch once synced'); },
  });
  assert.equal(second, false);

  // 3) Auth error / rejected fetch fails safely without throwing and leaves sp_spots_synced_v1 unset
  const failSession = makeMemoryStorage();
  const failed = await syncGuestSavedSpotsToCloud({
    localStorage: localStore,
    sessionStorage: failSession,
    fetch: async () => { throw new Error('Network offline'); },
  });
  assert.equal(failed, false);
  assert.equal(failSession.getItem('sp_spots_synced_v1'), null);
});

test('WAVE1 LAW 6: pages/auth/signup.js smart geo-defaulting pre-selects NON_US_COUNTRIES while preserving US defaults and query overrides', () => {
  const src = read('pages/auth/signup.js');
  assert.match(src, /export function inferNonUsCountryFromTimezone/);
  assert.match(src, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(src, /locationTouchedRef/);
  assert.match(src, /router\.query\?\.state/);
  assert.match(src, /router\.query\?\.country/);

  // Extract and execute pure timezone inference helper against real NON_US_COUNTRIES
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const compiled = ts.transpileModule(src, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: 'signup.jsx',
  }).outputText;

  const mod = { exports: {} };
  vm.runInNewContext(compiled, {
    module: mod,
    exports: mod.exports,
    console: { log() {}, warn() {} },
    require: (name) => {
      if (name === 'react' || name === 'react/jsx-runtime' || name === 'lucide-react') return require(name);
      if (name.endsWith('/countries')) return { US_COUNTRY: 'United States', NON_US_COUNTRIES };
      return {};
    },
  });

  const { inferNonUsCountryFromTimezone } = mod.exports;
  assert.equal(inferNonUsCountryFromTimezone('America/Toronto'), 'Canada');
  assert.equal(inferNonUsCountryFromTimezone('Europe/London'), 'United Kingdom');
  assert.equal(inferNonUsCountryFromTimezone('Australia/Sydney'), 'Australia');
  assert.equal(inferNonUsCountryFromTimezone('Europe/Berlin'), 'Germany');
  assert.equal(inferNonUsCountryFromTimezone('America/Sao_Paulo'), 'Brazil');
  assert.equal(inferNonUsCountryFromTimezone('Asia/Tokyo'), 'Japan');
  assert.equal(inferNonUsCountryFromTimezone('Pacific/Auckland'), 'New Zealand');

  // US & neutral timezones must ALWAYS stay null so US visitors retain US default
  for (const usTz of [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
    'Etc/UTC',
  ]) {
    assert.equal(inferNonUsCountryFromTimezone(usTz), null, `US/neutral timezone ${usTz} must preserve US default`);
  }
});

test('WAVE1 LAW 7: ZERO lib/analytics imports across all _app.js-reachable SEO conversion modules + zero em/en dashes + zero banned gold hexes', () => {
  const APP_REACHABLE_SEO_FILES = [
    'src/lib/seo/seoExperiment.js',
    'src/lib/seo/seoFunnelTelemetry.js',
    'src/components/seo/SmarterQuickSignupSheet.jsx',
    'src/components/seo/SmarterAccountUnlockGate.jsx',
    'src/components/seo/GuestConversionBar.jsx',
    'src/components/seo/SmarterUnlockedWelcomeBanner.jsx',
    'src/components/seo/SmarterEngagedConversionPrompt.jsx',
  ];

  const BANNED_GOLD = /#(f59e0b|eab308|fbbf24|d97706|ffd700|facc15)\b/i;

  for (const rel of APP_REACHABLE_SEO_FILES) {
    const src = read(rel);
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(
      codeOnly,
      /lib\/analytics|\.\.\/analytics/,
      `${rel} is _app.js-reachable and MUST NOT import lib/analytics`,
    );
    assert.doesNotMatch(
      codeOnly,
      /aiReferralTracker/,
      `${rel} MUST NOT import aiReferralTracker.js (which pulls in lib/analytics)`,
    );
    assert.doesNotMatch(codeOnly, /[\u2014\u2013]/, `${rel} must never contain em dashes or en dashes in code/UI text`);
    assert.doesNotMatch(codeOnly, BANNED_GOLD, `${rel} must never contain banned gold hexes`);
  }
});
