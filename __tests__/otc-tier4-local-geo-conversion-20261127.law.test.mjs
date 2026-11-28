/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TIER 4 CI FORTRESS: HIGH-INTENT LOCAL "POKER NEAR ME" GEO-CLUSTER CRO
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for the 4 local discovery templates:
 *   - pages/poker-rooms/states/[state].js
 *   - pages/poker-rooms/guides/[city].js
 *   - pages/poker-rooms/by-game/[game].js
 *   - pages/poker-rooms/corridors/[slug].js
 *
 * Enforces:
 *   1. #SMARTERDESIGN Local Player Action Strip mounted across all 4 templates
 *      with primary Follow <Context> Poker Rooms Free CTA
 *      (data-testid="local-follow-rooms-cta") wiring openQuickSignup with exact
 *      per-vertical unlockKey, canonical redirectPath, contextual subtitle, and
 *      trackSeoFunnelEvent('seo_local_action_bar_click', { vertical, slug }).
 *   2. Secondary bankroll session CTA (data-testid="local-bankroll-cta")
 *      linking to /hub/bankroll-manager (or /hub/poker-near-me/lobby).
 *   3. Single clean <SmarterAccountUnlockGate mount (zero duplicates) and full
 *      preservation of SEOHead, CitationBacklinkBox, AiPromptLauncher, and GEO
 *      components.
 *   4. Zero em/en dashes, zero banned gold hexes, zero blanket "Verified Rooms"
 *      wording, valid SmarterSeoKit.module.css class references, and zero
 *      analytics.js bloat.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const LOCAL_TEMPLATES = [
  {
    file: 'pages/poker-rooms/states/[state].js',
    unlockKey: 'local-state-rooms',
    vertical: 'state',
    requiresGeo: false,
  },
  {
    file: 'pages/poker-rooms/guides/[city].js',
    unlockKey: 'local-city-rooms',
    vertical: 'city',
    requiresGeo: false,
  },
  {
    file: 'pages/poker-rooms/by-game/[game].js',
    unlockKey: 'local-game-rooms',
    vertical: 'by-game',
    requiresGeo: true,
  },
  {
    file: 'pages/poker-rooms/corridors/[slug].js',
    unlockKey: 'local-corridor-rooms',
    vertical: 'corridor',
    requiresGeo: true,
  },
];

const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f59e0b|fbbf24|facc15|eab308|d97706|f2b84b)\b/i;
const BLANKET_VERIFIED_RE = /\bVerified\s+(?:Live\s+)?(?:US\s+)?(?:Poker\s+)?(?:Rooms|Venues|Cardrooms)\b/i;
const DASH_RE = /[\u2014\u2013]/;

test('Tier 4.1 - All 4 local geo-cluster templates mount #SMARTERDESIGN Local Player Action Strip with openQuickSignup, telemetry, and bankroll CTA', () => {
  for (const tpl of LOCAL_TEMPLATES) {
    const src = read(tpl.file);

    assert.match(
      src,
      /import\s+\{\s*openQuickSignup\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/components\/seo\/SmarterQuickSignupSheet['"]/,
      `${tpl.file} must import openQuickSignup from SmarterQuickSignupSheet`,
    );
    assert.match(
      src,
      /import\s+\{\s*trackSeoFunnelEvent\s*\}\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/lib\/seo\/seoFunnelTelemetry['"]/,
      `${tpl.file} must import trackSeoFunnelEvent from seoFunnelTelemetry`,
    );
    assert.doesNotMatch(
      src,
      /lib\/analytics/,
      `${tpl.file} must not statically import lib/analytics`,
    );

    assert.match(
      src,
      /data-testid="local-follow-rooms-cta"/,
      `${tpl.file} must render data-testid="local-follow-rooms-cta"`,
    );
    assert.match(
      src,
      /Follow\s+\{[^}]+\}\s+Poker Rooms Free/,
      `${tpl.file} primary CTA must render Follow <Context> Poker Rooms Free`,
    );
    assert.match(
      src,
      /data-testid="local-bankroll-cta"/,
      `${tpl.file} must render data-testid="local-bankroll-cta"`,
    );
    assert.match(
      src,
      /href="\/hub\/(?:bankroll-manager|poker-near-me\/lobby)"/,
      `${tpl.file} secondary CTA must link to /hub/bankroll-manager or /hub/poker-near-me/lobby`,
    );
    assert.match(
      src,
      /Log Tonight(?:&apos;|')s Session Free/,
      `${tpl.file} secondary CTA must read Log Tonight's Session Free`,
    );

    assert.ok(
      src.includes("trackSeoFunnelEvent('seo_local_action_bar_click'"),
      `${tpl.file} must call trackSeoFunnelEvent('seo_local_action_bar_click', ...)`,
    );
    assert.match(
      src,
      new RegExp(`vertical:\\s*'${tpl.vertical}'`),
      `${tpl.file} must report vertical: '${tpl.vertical}' in seo_local_action_bar_click`,
    );
    assert.match(
      src,
      /openQuickSignup\s*\(\s*\{[\s\S]{0,600}?unlockKey:\s*'([^']+)'/,
      `${tpl.file} must call openQuickSignup with unlockKey`,
    );
    assert.ok(
      src.includes(`unlockKey: '${tpl.unlockKey}'`),
      `${tpl.file} must pass exact unlockKey '${tpl.unlockKey}'`,
    );
    assert.match(
      src,
      /redirectPath:\s*canonicalPath/,
      `${tpl.file} must pass redirectPath: canonicalPath to openQuickSignup`,
    );
    assert.ok(
      src.includes('Save Favorite Rooms, Get Tournament Start Reminders & Track Live Bankroll Sessions Free'),
      `${tpl.file} must pass contextual subtitle to openQuickSignup`,
    );

    // #SMARTERDESIGN palette, 0px corners, >= 44px touch targets, and 390px zero-overflow layout
    for (const token of ['#0b1120', '#111827', '#2563eb', '#38bdf8']) {
      assert.ok(src.includes(token), `${tpl.file} action strip must include #SMARTERDESIGN token ${token}`);
    }
    assert.match(src, /minHeight:\s*(?:44|'44px')/, `${tpl.file} action strip buttons must enforce >= 44px touch targets`);
    assert.match(src, /borderRadius:\s*0/, `${tpl.file} action strip must enforce 0px sharp corners`);
    assert.match(src, /flexWrap:\s*'wrap'/, `${tpl.file} action strip must wrap cleanly on 390px mobile`);
    assert.match(src, /maxWidth:\s*'100%'/, `${tpl.file} action strip must bound maxWidth to 100% for zero overflow`);
  }
});

test('Tier 4.2 - All 4 local templates mount SmarterAccountUnlockGate without duplicates and preserve SEO/GEO components', () => {
  for (const tpl of LOCAL_TEMPLATES) {
    const src = read(tpl.file);

    const gateMatches = src.match(/<SmarterAccountUnlockGate\b/g) || [];
    assert.equal(
      gateMatches.length,
      1,
      `${tpl.file} must mount <SmarterAccountUnlockGate exactly once (found ${gateMatches.length})`,
    );

    assert.match(src, /<SEOHead\b/, `${tpl.file} must keep SEOHead intact`);
    assert.match(src, /<CitationBacklinkBox\b/, `${tpl.file} must keep CitationBacklinkBox intact`);
    assert.match(src, /<AiPromptLauncher\b/, `${tpl.file} must keep AiPromptLauncher intact`);

    if (tpl.requiresGeo) {
      assert.match(src, /<GeoCitationCapsule\b/, `${tpl.file} must keep GeoCitationCapsule intact`);
      assert.match(src, /<GeoFollowUpChain\b/, `${tpl.file} must keep GeoFollowUpChain intact`);
    }
  }
});

test('Tier 4.3 - All 4 local templates obey zero em/en dashes, zero banned gold hexes, zero blanket Verified Rooms wording, and valid CSS module references', () => {
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));

  for (const tpl of LOCAL_TEMPLATES) {
    const src = read(tpl.file);

    assert.doesNotMatch(src, DASH_RE, `${tpl.file} must contain zero em or en dashes`);
    assert.doesNotMatch(src, BANNED_GOLD_RE, `${tpl.file} must contain zero banned gold hex colors`);
    assert.doesNotMatch(
      src,
      BLANKET_VERIFIED_RE,
      `${tpl.file} must never claim blanket "Verified Rooms" / "Verified Venues"`,
    );

    assert.match(
      src,
      /import\s+seoKitStyles\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/components\/seo\/SmarterSeoKit\.module\.css['"]/,
      `${tpl.file} must import SmarterSeoKit.module.css`,
    );

    const referenced = [...src.matchAll(/\bseoKitStyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, `${tpl.file} must use at least one SmarterSeoKit.module.css class`);
    const missing = referenced.filter((cls) => !definedClasses.has(cls));
    assert.deepEqual(
      missing,
      [],
      `${tpl.file} references undefined SmarterSeoKit.module.css classes: ${missing.join(', ')}`,
    );
  }
});
