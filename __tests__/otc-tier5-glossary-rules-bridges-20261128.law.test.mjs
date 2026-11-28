/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TIER 5 CI FORTRESS: GLOSSARY & RULES CONCEPT-TO-TOOL CONVERSION BRIDGES
 * ═══════════════════════════════════════════════════════════════════════════
 * Permanent regression locks for Tier 5 informational-to-tool bridges:
 *   - src/lib/seo/conceptToolBridge.mjs
 *   - pages/glossary/[term].js
 *   - pages/rules/[slug].js
 *
 * Enforces:
 *   1. resolveConceptToolBridge deterministically maps all 8 poker concept
 *      families + GTO Leak Finder fallback (9 total) to real live routes under
 *      pages/, with Title Case copy, zero em/en dashes, zero banned gold, and
 *      zero blanket "Verified Rooms" wording.
 *   2. Every real glossary term (src/content/glossary/terms.js) and every real
 *      poker rule (src/content/rules/rules.js) resolves cleanly to a real route
 *      with kind-scoped unlockKey and Practice Free In 107 GTO Games CTA.
 *   3. Both pages/glossary/[term].js and pages/rules/[slug].js mount the
 *      #SMARTERDESIGN bridge card (data-testid="concept-tool-bridge"), primary
 *      tool link (data-testid="concept-bridge-tool-link"), and signup CTA
 *      (data-testid="concept-bridge-signup-cta") wired to openQuickSignup and
 *      trackSeoFunnelEvent('seo_concept_bridge_click', ...).
 *   4. Zero em/en dashes, zero banned gold hexes, zero &apos; in JSX text,
 *      zero analytics.js bloat, valid SmarterSeoKit.module.css class names,
 *      and 100% preservation of existing SEOHead, JSON-LD, CitationBacklinkBox,
 *      AiPromptLauncher, QR print sheet, and single SmarterAccountUnlockGate.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveConceptToolBridge,
  CONCEPT_TOOL_BRIDGE_TARGETS,
} from '../src/lib/seo/conceptToolBridge.mjs';
import { GLOSSARY_TERMS } from '../src/content/glossary/terms.js';
import { POKER_RULES } from '../src/content/rules/rules.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const TITLE_CASE_ACRONYMS = new Set([
  'nlh', 'nlhe', 'plo', 'plo4', 'plo5', 'plo6', 'plo8', 'flh', 'flo', 'ofc',
  'nl', 'pl', 'fl', 'sng', 'mtt', 'xmtt', 'pko', 'ko', 'gtd', 'hu', 'wsop',
  'bbj', 'vip', 'id', 'utg', 'sb', 'bb', 'btn', 'co', 'mp', 'hj', 'lj',
  'rit', 'gto', 'ev', 'roi', 'itm', 'usd', 'kyc', 'tos', 'faq', 'api', 'url',
  'pc', 'ios', 'os', 'ui', 'ux', 'qr', 'sms', 'otp', '2fa', 'icm', 'tda',
]);

function titleCaseText(text) {
  return text.replace(/[A-Za-z][A-Za-z0-9'’]*/g, (word, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 1), offset);
    if (before === '&') return word;
    if (/\d/.test(before)) return word;
    const lower = word.toLowerCase();
    if (TITLE_CASE_ACRONYMS.has(lower)) return lower.toUpperCase();
    if (word.length > 1 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

const DASH_RE = /[\u2014\u2013]/;
const BANNED_GOLD_RE = /#(?:ffd700|d4af37|f59e0b|fbbf24|facc15|eab308|d97706|f2b84b)\b/i;
const BLANKET_VERIFIED_RE = /\bVerified\s+(?:Live\s+)?(?:US\s+)?(?:Poker\s+)?(?:Rooms|Venues|Cardrooms)\b/i;

function routeExistsOnDisk(href) {
  const clean = String(href || '').replace(/^\/+/, '');
  if (!clean) return false;
  return (
    fs.existsSync(path.join(ROOT, `pages/${clean}.js`)) ||
    fs.existsSync(path.join(ROOT, `pages/${clean}/index.js`)) ||
    fs.existsSync(path.join(ROOT, `pages/${clean}.jsx`)) ||
    fs.existsSync(path.join(ROOT, `pages/${clean}/index.jsx`))
  );
}

const FAMILY_CASES = [
  {
    name: 'Pot Odds / Implied Odds / Outs / Equity / Reverse Implied',
    expectedHref: '/tools/pot-odds-calculator',
    expectedLabel: 'Pot Odds & Implied Odds Calculator',
    samples: [
      { kind: 'glossary', slug: 'pot-odds', title: 'Pot Odds', category: 'Math' },
      { kind: 'glossary', slug: 'implied-odds', title: 'Implied Odds', category: 'Math' },
      { kind: 'glossary', slug: 'reverse-implied-odds', title: 'Reverse Implied Odds', category: 'Math' },
      { kind: 'glossary', slug: 'outs', title: 'Outs', category: 'Math' },
      { kind: 'glossary', slug: 'equity', title: 'Equity', category: 'Math' },
    ],
  },
  {
    name: 'ICM / Bubble / Final Table / Push / Fold / Shoving / Satellite / Bounty / PKO / M-Ratio',
    expectedHref: '/tools/icm-calculator',
    expectedLabel: 'Interactive ICM Payout Calculator',
    samples: [
      { kind: 'glossary', slug: 'icm', title: 'ICM (Independent Chip Model)', category: 'Math' },
      { kind: 'rules', slug: 'hand-for-hand-bubble-play-rules', title: 'Hand-For-Hand Money Bubble Procedures', category: 'Tournament TDA' },
      { kind: 'rules', slug: 'final-table-redraw-and-icm-chop-rules', title: 'Final Table Redraw & Official ICM Chop Agreements', category: 'Tournament TDA' },
      { kind: 'glossary', slug: 'push-fold', title: 'Push Fold Shoving Chart', category: 'Theory' },
      { kind: 'glossary', slug: 'satellite-m-ratio', title: 'Satellite M-Ratio Strategy', category: 'Math' },
      { kind: 'glossary', slug: 'progressive-knockout', title: 'Progressive Knockout (PKO)', category: 'Live Room' },
      { kind: 'glossary', slug: 'mystery-bounty', title: 'Mystery Bounty', category: 'Live Room' },
    ],
  },
  {
    name: 'Preflop / 3-Bet / 4-Bet / Range / RFI / Button / Hijack / Cutoff / Squeeze / Open',
    expectedHref: '/tools/preflop-ranges',
    expectedLabel: '13x13 GTO Preflop Range Matrix',
    samples: [
      { kind: 'glossary', slug: '3-bet', title: '3-Bet', category: 'Preflop' },
      { kind: 'glossary', slug: '4-bet', title: '4-Bet', category: 'Preflop' },
      { kind: 'glossary', slug: 'rfi', title: 'RFI (Raise First In)', category: 'Preflop' },
      { kind: 'glossary', slug: 'squeeze', title: 'Squeeze', category: 'Preflop' },
      { kind: 'glossary', slug: 'range', title: 'Range', category: 'Theory' },
      { kind: 'glossary', slug: 'cutoff-hijack-open', title: 'Hijack & Cutoff Open Strategy', category: 'Preflop' },
      { kind: 'glossary', slug: 'dealer-button', title: 'Dealer Button', category: 'Basics' },
    ],
  },
  {
    name: 'PLO / Omaha / Wrap / Pot-Limit',
    expectedHref: '/tools/plo-outs-calculator',
    expectedLabel: 'PLO Straight Wrap & Outs Calculator',
    samples: [
      { kind: 'glossary', slug: 'plo-wrap', title: 'PLO Straight Wrap', category: 'Postflop' },
      { kind: 'glossary', slug: 'omaha-outs', title: 'Omaha Drawing Outs', category: 'Math' },
      { kind: 'rules', slug: 'pot-limit-maximum-bet-calculation-rules', title: 'Pot-Limit Maximum Bet Calculation & Pre-Counting Rules', category: 'Variant Specific' },
    ],
  },
  {
    name: 'C-Bet / Texture / Board / Wet / Dry / Check-Raise / Barrel / Float / Bluff / MDF',
    expectedHref: '/tools/board-texture-analyzer',
    expectedLabel: 'Flop Board Texture Analyzer',
    samples: [
      { kind: 'glossary', slug: 'c-bet', title: 'C-Bet (Continuation Bet)', category: 'Postflop' },
      { kind: 'glossary', slug: 'board-texture', title: 'Board Texture', category: 'Postflop' },
      { kind: 'glossary', slug: 'wet-board', title: 'Wet Board', category: 'Postflop' },
      { kind: 'glossary', slug: 'dry-flop-float', title: 'Dry Flop Float Play', category: 'Postflop' },
      { kind: 'glossary', slug: 'barrel', title: 'Barrel', category: 'Postflop' },
      { kind: 'glossary', slug: 'semi-bluff', title: 'Semi-Bluff', category: 'Postflop' },
      { kind: 'glossary', slug: 'mdf', title: 'MDF (Minimum Defense Frequency)', category: 'Math' },
      { kind: 'rules', slug: 'check-raising-and-out-of-turn-action', title: 'Check-Raising & Binding Out-Of-Turn Action Rules', category: 'Betting & Action' },
    ],
  },
  {
    name: 'Bankroll / Variance / Winrate / BB/100 / Downswing / Rake / Buy-In / Stake',
    expectedHref: '/hub/bankroll-manager',
    expectedLabel: 'Free Cloud Bankroll Manager',
    samples: [
      { kind: 'glossary', slug: 'variance', title: 'Variance', category: 'Math' },
      { kind: 'glossary', slug: 'rake', title: 'Rake', category: 'Basics' },
      { kind: 'glossary', slug: 'bankroll-downswing', title: 'Bankroll Downswing & Buy-In Rules', category: 'Math' },
      { kind: 'glossary', slug: 'winrate-bb-100', title: 'Winrate BB/100 At Live Stakes', category: 'Math' },
    ],
  },
  {
    name: 'Hand Rankings / Kicker / Split / Showdown / Tie / Flush / Straight / Full House',
    expectedHref: '/tools/who-wins-calculator',
    expectedLabel: 'Showdown & Kicker Resolver',
    samples: [
      { kind: 'glossary', slug: 'showdown', title: 'Showdown', category: 'Basics' },
      { kind: 'rules', slug: 'showdown-order-who-shows-first', title: 'Showdown Order: Who Shows First On The River', category: 'Showdown & Pot Award' },
      { kind: 'rules', slug: 'odd-chip-rule-split-pots', title: 'The Odd Chip Rule In Split & Multi-Board Pots', category: 'Showdown & Pot Award' },
      { kind: 'glossary', slug: 'hand-rankings-kicker', title: 'Hand Rankings, Kicker & Tie Rules', category: 'Basics' },
      { kind: 'glossary', slug: 'flush-straight-full-house', title: 'Flush, Straight & Full House Ranking', category: 'Basics' },
    ],
  },
  {
    name: 'Live Rules / TDA / Floor / String Bet / Blind / Straddle / Home Game / Chip',
    expectedHref: '/tools/poker-odds-calculator',
    expectedLabel: 'Live Poker Odds Calculator',
    samples: [
      { kind: 'rules', slug: 'string-bets-and-oversized-chip-rule', title: 'String Bets & The Single Oversized Chip Rule', category: 'Betting & Action' },
      { kind: 'rules', slug: 'straddle-rules-utg-button-mississippi', title: 'Live Poker Straddle Rules: UTG, Button & Mississippi', category: 'Cash Game Procedures' },
      { kind: 'rules', slug: 'disputed-pots-and-surveillance-review-rules', title: 'Disputed Pots, Floor Rulings & Camera Review Rules', category: 'Showdown & Pot Award' },
      { kind: 'glossary', slug: 'blinds', title: 'Blinds', category: 'Basics' },
      { kind: 'glossary', slug: 'home-game-tda-chips', title: 'Home Game Live Rules & Chip Procedures', category: 'Live Room' },
    ],
  },
  {
    name: 'Fallback Default -> GTO Leak Finder',
    expectedHref: '/tools/gto-leak-finder',
    expectedLabel: '60-Second GTO Poker Leak Finder',
    samples: [
      { kind: 'glossary', slug: 'gto', title: 'GTO (Game Theory Optimal)', category: 'Theory' },
      { kind: 'glossary', slug: 'nodelocking', title: 'Nodelocking', category: 'Theory' },
      { kind: 'glossary', slug: 'unmapped-mystery-concept', title: 'Unmapped Mystery Concept', category: 'Theory' },
      {},
    ],
  },
];

test('Tier 5.1 - resolveConceptToolBridge maps all 9 families deterministically to real live routes with clean Title Case copy', () => {
  assert.equal(CONCEPT_TOOL_BRIDGE_TARGETS.length, 9, 'Expected 9 canonical bridge target routes');

  for (const href of CONCEPT_TOOL_BRIDGE_TARGETS) {
    assert.ok(routeExistsOnDisk(href), `Bridge target ${href} does not correspond to a real Next.js page under pages/`);
  }

  for (const family of FAMILY_CASES) {
    for (const input of family.samples) {
      const result = resolveConceptToolBridge(input);

      assert.equal(
        result.toolHref,
        family.expectedHref,
        `[${family.name}] Expected ${family.expectedHref} for ${JSON.stringify(input)}, got ${result.toolHref}`,
      );
      assert.equal(
        result.toolLabel,
        family.expectedLabel,
        `[${family.name}] Expected label "${family.expectedLabel}" for ${JSON.stringify(input)}, got "${result.toolLabel}"`,
      );
      assert.equal(result.practiceLabel, 'Practice Free In 107 GTO Games');
      assert.ok(routeExistsOnDisk(result.toolHref), `${result.toolHref} must exist on disk`);

      for (const field of ['toolHref', 'toolLabel', 'eyebrow', 'headline', 'subcopy', 'unlockKey', 'practiceLabel']) {
        assert.equal(typeof result[field], 'string', `Missing string field ${field}`);
        assert.ok(result[field].trim().length > 0, `Empty field ${field}`);
        assert.doesNotMatch(result[field], DASH_RE, `${field} must not contain em/en dashes: ${result[field]}`);
        assert.doesNotMatch(result[field], BANNED_GOLD_RE, `${field} must not contain banned gold hexes`);
        assert.doesNotMatch(result[field], BLANKET_VERIFIED_RE, `${field} must not contain blanket Verified Rooms wording`);
      }

      for (const copyField of ['toolLabel', 'eyebrow', 'headline', 'subcopy', 'practiceLabel']) {
        assert.equal(
          result[copyField],
          titleCaseText(result[copyField]),
          `${copyField} must be strict Title Case: "${result[copyField]}"`,
        );
      }
    }
  }

  const mapperSrc = read('src/lib/seo/conceptToolBridge.mjs');
  assert.doesNotMatch(mapperSrc, DASH_RE, 'conceptToolBridge.mjs must contain zero em/en dashes');
  assert.doesNotMatch(mapperSrc, BANNED_GOLD_RE, 'conceptToolBridge.mjs must contain zero banned gold hexes');
  assert.doesNotMatch(mapperSrc, BLANKET_VERIFIED_RE, 'conceptToolBridge.mjs must contain zero blanket Verified Rooms wording');
});

test('Tier 5.2 - Every real glossary term and poker rule resolves cleanly to a verified route', () => {
  assert.ok(GLOSSARY_TERMS.length >= 60, 'Expected full glossary dataset');
  assert.ok(POKER_RULES.length >= 25, 'Expected full rules dataset');

  const seenRoutes = new Set();

  for (const term of GLOSSARY_TERMS) {
    const bridge = resolveConceptToolBridge({
      kind: 'glossary',
      slug: term.slug,
      title: term.term,
      category: term.category,
    });
    assert.ok(CONCEPT_TOOL_BRIDGE_TARGETS.includes(bridge.toolHref), `Unexpected toolHref for glossary/${term.slug}: ${bridge.toolHref}`);
    assert.match(bridge.unlockKey, /^glossary-bridge-[a-z0-9-]+$/, `Invalid glossary unlockKey: ${bridge.unlockKey}`);
    seenRoutes.add(bridge.toolHref);
  }

  for (const rule of POKER_RULES) {
    const bridge = resolveConceptToolBridge({
      kind: 'rules',
      slug: rule.slug,
      title: rule.title,
      category: rule.category,
    });
    assert.ok(CONCEPT_TOOL_BRIDGE_TARGETS.includes(bridge.toolHref), `Unexpected toolHref for rules/${rule.slug}: ${bridge.toolHref}`);
    assert.match(bridge.unlockKey, /^rules-bridge-[a-z0-9-]+$/, `Invalid rules unlockKey: ${bridge.unlockKey}`);
    seenRoutes.add(bridge.toolHref);
  }

  assert.equal(
    seenRoutes.size,
    CONCEPT_TOOL_BRIDGE_TARGETS.length,
    `Expected all 9 bridge targets to be exercised across live glossary+rules corpus; hit ${seenRoutes.size}`,
  );
});

test('Tier 5.3 - Both pages/glossary/[term].js and pages/rules/[slug].js mount #SMARTERDESIGN concept-tool-bridge with telemetry, signup, valid CSS classes, and zero regressions', () => {
  const css = read('src/components/seo/SmarterSeoKit.module.css');
  const definedClasses = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]));

  const TARGET_PAGES = [
    {
      file: 'pages/glossary/[term].js',
      kind: 'glossary',
      source: 'glossary-tool-bridge',
      requireQrPrint: false,
    },
    {
      file: 'pages/rules/[slug].js',
      kind: 'rules',
      source: 'rules-tool-bridge',
      requireQrPrint: true,
    },
  ];

  for (const tpl of TARGET_PAGES) {
    const src = read(tpl.file);

    assert.match(
      src,
      /import\s+\{\s*resolveConceptToolBridge\s*\}\s+from\s+['"]\.\.\/\.\.\/src\/lib\/seo\/conceptToolBridge\.mjs['"]/,
      `${tpl.file} must import resolveConceptToolBridge`,
    );
    assert.match(
      src,
      /import\s+\{\s*openQuickSignup\s*\}\s+from\s+['"]\.\.\/\.\.\/src\/components\/seo\/SmarterQuickSignupSheet['"]/,
      `${tpl.file} must import openQuickSignup`,
    );
    assert.match(
      src,
      /import\s+\{\s*trackSeoFunnelEvent\s*\}\s+from\s+['"]\.\.\/\.\.\/src\/lib\/seo\/seoFunnelTelemetry['"]/,
      `${tpl.file} must import trackSeoFunnelEvent`,
    );
    assert.match(
      src,
      /import\s+seoKitStyles\s+from\s+['"]\.\.\/\.\.\/src\/components\/seo\/SmarterSeoKit\.module\.css['"]/,
      `${tpl.file} must import SmarterSeoKit.module.css`,
    );
    assert.doesNotMatch(src, /lib\/analytics/, `${tpl.file} must not statically import lib/analytics`);

    assert.match(src, /data-testid="concept-tool-bridge"/, `${tpl.file} must mount concept-tool-bridge`);
    assert.match(src, /data-testid="concept-bridge-tool-link"/, `${tpl.file} must mount concept-bridge-tool-link`);
    assert.match(src, /data-testid="concept-bridge-signup-cta"/, `${tpl.file} must mount concept-bridge-signup-cta`);
    assert.match(src, /Open \{bridge\.toolLabel\} Free/, `${tpl.file} must render Open <toolLabel> Free link text`);
    assert.match(src, /Practice Free In 107 GTO Games/, `${tpl.file} must render Practice Free In 107 GTO Games CTA`);

    assert.ok(
      src.includes("trackSeoFunnelEvent('seo_concept_bridge_click'"),
      `${tpl.file} must call trackSeoFunnelEvent('seo_concept_bridge_click', ...)`,
    );
    assert.match(src, new RegExp(`kind:\\s*'${tpl.kind}'`), `${tpl.file} must pass kind: '${tpl.kind}'`);
    assert.match(src, /target_tool:\s*bridge\.toolHref/, `${tpl.file} must pass target_tool: bridge.toolHref`);

    assert.match(src, /unlockKey:\s*bridge\.unlockKey/, `${tpl.file} must pass unlockKey: bridge.unlockKey to openQuickSignup`);
    assert.match(src, /redirectPath:\s*canonicalPath/, `${tpl.file} must pass redirectPath: canonicalPath to openQuickSignup`);
    assert.match(src, new RegExp(`source:\\s*'${tpl.source}'`), `${tpl.file} must pass source: '${tpl.source}' to openQuickSignup`);

    // #SMARTERDESIGN palette, 0px corners, >= 44px touch targets, 390px zero-overflow flex wrap
    for (const token of ['#0b1120', '#111827', '#2563eb', '#38bdf8']) {
      assert.ok(src.includes(token), `${tpl.file} must include #SMARTERDESIGN token ${token}`);
    }
    assert.match(src, /borderRadius:\s*0/, `${tpl.file} must enforce 0px corners`);
    assert.match(src, /minHeight:\s*(?:44|'44px')/, `${tpl.file} must enforce >= 44px touch targets`);
    assert.match(src, /flexWrap:\s*'wrap'/, `${tpl.file} must use flexWrap: 'wrap' for 390px mobile`);
    assert.match(src, /maxWidth:\s*'100%'/, `${tpl.file} must bound maxWidth: '100%' for zero overflow`);

    // Valid CSS module class references
    const referenced = [...src.matchAll(/\bseoKitStyles\.([A-Za-z][A-Za-z0-9_-]*)\b/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, `${tpl.file} must use at least one SmarterSeoKit.module.css class`);
    const missing = referenced.filter((cls) => !definedClasses.has(cls));
    assert.deepEqual(missing, [], `${tpl.file} references undefined SmarterSeoKit classes: ${missing.join(', ')}`);

    // Hygiene & house style
    assert.doesNotMatch(src, DASH_RE, `${tpl.file} must contain zero em/en dashes`);
    assert.doesNotMatch(src, BANNED_GOLD_RE, `${tpl.file} must contain zero banned gold hexes`);
    assert.doesNotMatch(src, BLANKET_VERIFIED_RE, `${tpl.file} must never claim blanket Verified Rooms`);
    assert.doesNotMatch(src, /&apos;/, `${tpl.file} must never use &apos; in JSX text`);

    // Preserve existing SEO/AEO/Conversion mounts without duplicating SmarterAccountUnlockGate
    assert.match(src, /<SEOHead\b/, `${tpl.file} must keep SEOHead`);
    assert.match(src, /<CitationBacklinkBox\b/, `${tpl.file} must keep CitationBacklinkBox`);
    assert.match(src, /<AiPromptLauncher\b/, `${tpl.file} must keep AiPromptLauncher`);
    const gateMatches = src.match(/<SmarterAccountUnlockGate\b/g) || [];
    assert.equal(gateMatches.length, 1, `${tpl.file} must mount SmarterAccountUnlockGate exactly once (found ${gateMatches.length})`);

    if (tpl.requireQrPrint) {
      assert.ok(src.includes('/api/seo/qr?path='), `${tpl.file} must preserve QR code print sheet`);
      assert.ok(src.includes('@media print') && src.includes('dangerouslySetInnerHTML'), `${tpl.file} must preserve print stylesheet`);
      assert.match(src, /Frequently Asked Questions:/, `${tpl.file} must preserve FAQ section`);
    } else {
      assert.doesNotMatch(src, /useEffect/, `${tpl.file} must not introduce client-only useEffect`);
    }
  }
});
