/**
 * Personal Assistant Phase 4 UI contracts:
 * live spot quick logger + external HH import, post-session recap, verified-fixed-live badges,
 * due-count nudges, share review links, coaching coverage-gap/funnel UI, sandbox boundary link.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildLiveSpotHandHistory,
  detectExternalHandFormat,
  findDuplicateCards,
  parseLiveSpotCards,
  summarizeLiveSpotAudit,
  validateLiveSpot,
} from '../src/lib/personal-assistant/liveSpotHandHistory.mjs';
import {
  buildHandReviewShareUrl,
  buildTableVerificationIndex,
  describeTableVerification,
  normalizeCoverageGapsRanked,
  normalizeFunnelMetrics,
} from '../src/lib/personal-assistant/liveVerificationPresentation.mjs';
import { parseHandHistory } from '../src/engines/HandHistoryParser.js';
import ts from 'typescript';

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8');
const NOW = new Date(Date.UTC(2026, 10, 25, 12, 0, 0));
const baseSpot = {
  heroCards: 'As Kd',
  position: 'BTN',
  format: 'cash',
  stackBb: 100,
  facing: 'open_raise',
  action: 'raise',
};

// ─── Pure helpers: Live Quick Spot -> PokerStars NLHE text ──────────────────

test('card parsing accepts common notations and rejects typos instead of guessing', () => {
  assert.deepEqual(parseLiveSpotCards('As Kd').cards, ['As', 'Kd']);
  assert.deepEqual(parseLiveSpotCards('askd').cards, ['As', 'Kd']);
  assert.deepEqual(parseLiveSpotCards('A♠, K♦').cards, ['As', 'Kd']);
  assert.deepEqual(parseLiveSpotCards('10h 2c').cards, ['Th', '2c']);
  assert.equal(parseLiveSpotCards('As Kx').valid, false);
  assert.equal(parseLiveSpotCards('As K').valid, false);
  assert.deepEqual(findDuplicateCards(['As', 'Kd'], ['Kd', '2c']), ['Kd']);
});

test('buildLiveSpotHandHistory emits parseable PokerStars text for every facing situation and position', () => {
  const facings = [
    ['unopened', ['UTG', 'MP', 'CO', 'BTN', 'SB']],
    ['open_raise', ['MP', 'CO', 'BTN', 'SB', 'BB']],
    ['three_bet', ['UTG', 'MP', 'CO', 'BTN', 'SB']],
    ['facing_bet', ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB']],
  ];
  for (const format of ['cash', 'tournament']) {
    for (const [facing, positions] of facings) {
      for (const position of positions) {
        for (const action of ['fold', 'call', 'raise']) {
          const board = facing === 'facing_bet' ? '7h 2d Tc' : '';
          const built = buildLiveSpotHandHistory(
            { ...baseSpot, format, facing, position, action, board, stackBb: 100 },
            { now: NOW },
          );
          assert.equal(built.ok, true, `${format}/${facing}/${position}/${action}: ${built.errors.join('; ')}`);
          const hands = parseHandHistory(built.text);
          assert.equal(hands.length, 1, `${format}/${facing}/${position}/${action} must parse to one hand`);
          const [hand] = hands;
          assert.equal(hand.hero?.position, position, `${facing}/${position}: hero position must survive parsing`);
          assert.deepEqual(hand.hero?.holeCards, ['As', 'Kd']);
          assert.equal(hand.format, format);
          assert.equal(hand.variant, 'holdem');
          assert.equal(hand.gameType, 'NL');
          const heroActions = Object.values(hand.streets)
            .filter(Boolean)
            .flatMap((street) => street.actions || [])
            .filter((entry) => entry.isHero);
          assert.ok(heroActions.length >= 1, 'Hero must have a logged decision');
        }
      }
    }
  }
});

test('quick spot text keeps blinds, button seat, board streets and stack depth honest', () => {
  const built = buildLiveSpotHandHistory({
    heroCards: 'Qs Js', position: 'BB', format: 'cash', stackBb: 80, facing: 'facing_bet', action: 'call', board: 'Ts 9h 2c 4d',
  }, { now: NOW });
  assert.equal(built.ok, true);
  assert.match(built.text, /^PokerStars Hand #\d+: Hold'em No Limit \(\$0\.50\/\$1\.00 USD\)/);
  assert.match(built.text, /Seat #1 is the button/);
  assert.match(built.text, /Hero \(\$80 in chips\)/);
  assert.match(built.text, /\*\*\* FLOP \*\*\* \[Ts 9h 2c\]/);
  assert.match(built.text, /\*\*\* TURN \*\*\* \[Ts 9h 2c\] \[4d\]/);
  assert.doesNotMatch(built.text, /\*\*\* RIVER/);
  assert.equal(built.street, 'turn');
  assert.doesNotMatch(built.text, /collected|wins|Uncalled/i, 'A quick spot must never invent a result');

  const tournament = buildLiveSpotHandHistory({ ...baseSpot, format: 'tournament', stackBb: 12 }, { now: NOW });
  assert.match(tournament.text, /Tournament #\d+/);
  assert.match(tournament.text, /Level I \(50\/100\)/);
  assert.match(tournament.text, /Hero \(1200 in chips\)/);
});

test('short stacks cap at all-in and never exceed the logged stack', () => {
  const built = buildLiveSpotHandHistory({ ...baseSpot, facing: 'three_bet', position: 'CO', stackBb: 10, action: 'raise' }, { now: NOW });
  assert.equal(built.ok, true);
  assert.match(built.text, /all-in/);
  const [hand] = parseHandHistory(built.text);
  const amounts = Object.values(hand.streets).filter(Boolean).flatMap((s) => s.actions || [])
    .filter((a) => a.isHero).map((a) => a.amount);
  assert.ok(amounts.every((amount) => amount <= 10), `Hero amounts ${amounts} must stay within a 10 BB stack`);
});

test('colliding, malformed or inconsistent spots are rejected with a clear reason and no text', () => {
  const cases = [
    [{ ...baseSpot, facing: 'facing_bet', board: 'As 7h 2d' }, /Duplicate Card/],
    [{ ...baseSpot, heroCards: 'As As' }, /Duplicate Card/],
    [{ ...baseSpot, heroCards: 'As' }, /Exactly Two/],
    [{ ...baseSpot, heroCards: 'Zz Kd' }, /Hero Cards Are Not Valid/],
    [{ ...baseSpot, facing: 'facing_bet', board: '7h 2d' }, /Board Needs 3, 4 Or 5/],
    [{ ...baseSpot, facing: 'facing_bet', board: '' }, /Postflop Bet Needs/],
    [{ ...baseSpot, board: '7h 2d Tc' }, /Remove The Board/],
    [{ ...baseSpot, position: 'UTG', facing: 'open_raise' }, /UTG Acts First/],
    [{ ...baseSpot, position: 'BB', facing: 'unopened' }, /Big Blind Cannot Be Folded To/],
    [{ ...baseSpot, position: 'BB', facing: 'three_bet' }, /Big Blind Cannot Have Opened/],
    [{ ...baseSpot, stackBb: 1 }, /Stack Must Be Between/],
    [{ ...baseSpot, stackBb: 9999 }, /Stack Must Be Between/],
    [{ ...baseSpot, format: 'sitngo' }, /Cash Or Tournament/],
    [{ ...baseSpot, action: 'shove' }, /Choose Your Action/],
    [null, /Hero Cards/],
  ];
  for (const [spot, pattern] of cases) {
    const result = buildLiveSpotHandHistory(spot, { now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.text, '');
    assert.ok(result.errors.some((message) => pattern.test(message)), `${JSON.stringify(spot)} -> ${result.errors}`);
  }
  assert.equal(validateLiveSpot(baseSpot).ok, true);
});

test('quick spot hand ids are deterministic per spot and distinct across spots', () => {
  const a = buildLiveSpotHandHistory(baseSpot, { now: NOW });
  const b = buildLiveSpotHandHistory({ ...baseSpot }, { now: new Date(NOW.getTime() + 60_000) });
  const c = buildLiveSpotHandHistory({ ...baseSpot, action: 'call' }, { now: NOW });
  assert.equal(a.handId, b.handId);
  assert.notEqual(a.handId, c.handId);
  assert.match(a.handId, /^\d{12}$/);
});

// ─── detectExternalHandFormat ───────────────────────────────────────────────

test('detectExternalHandFormat names the site and game, and flags non-NLHE variants honestly', () => {
  const ps = detectExternalHandFormat("PokerStars Hand #123456789: Hold'em No Limit ($0.50/$1.00 USD) - 2026/11/25 12:00:00 ET\nTable 'A' 6-max");
  assert.equal(ps.site, 'pokerstars');
  assert.equal(ps.variant, 'nlhe');
  assert.equal(ps.supported, true);
  assert.equal(ps.handCount, 1);

  const stars = detectExternalHandFormat("PokerStars Zoom Hand #5: Hold'em No Limit ($1/$2)");
  assert.equal(stars.site, 'pokerstars');

  const gg = detectExternalHandFormat("Poker Hand #HD1234567: Hold'em No Limit ($0.25/$0.50) - 2026/11/25 12:00:00\nTable 'NLHGold1'");
  assert.equal(gg.site, 'ggpoker');
  assert.equal(gg.supported, true);

  const club = detectExternalHandFormat("Poker Hand #HD1: Hold'em No Limit ($1/$2)\nTable 'ClubGG Friends 12'");
  assert.equal(club.site, 'clubgg');

  const acr = detectExternalHandFormat('Hand #2938470 - Holdem(No Limit) - $0.05/$0.10 - 2026/11/25 12:00:00 UTC\nTable: Quick');
  assert.equal(acr.site, 'acr');
  assert.equal(acr.variant, 'nlhe');
  assert.equal(acr.supported, true);
  assert.equal(detectExternalHandFormat('Americas Cardroom Hand #1 - Holdem(No Limit)').site, 'acr');

  const eight = detectExternalHandFormat('***** 888poker Hand History for Game 98765 *****\n$0.01/$0.02 Blinds No Limit Holdem');
  assert.equal(eight.site, '888poker');
  assert.equal(eight.variant, 'nlhe');

  const plo = detectExternalHandFormat("PokerStars Hand #9: Omaha Pot Limit ($0.50/$1.00 USD)");
  assert.equal(plo.variant, 'plo');
  assert.equal(plo.supported, false);
  assert.match(plo.reason, /Not Audited Yet/);

  const ggPlo = detectExternalHandFormat('Poker Hand #OM123: Omaha PLO ($1/$2)');
  assert.equal(ggPlo.variant, 'plo');
  assert.equal(ggPlo.supported, false);

  const shortDeck = detectExternalHandFormat('PokerStars Hand #1: Short Deck Hold\u2019em No Limit ($1/$2)');
  assert.equal(shortDeck.variant, 'short_deck');
  assert.equal(shortDeck.supported, false);

  const limit = detectExternalHandFormat("PokerStars Hand #1: Hold'em Limit ($1/$2 USD)");
  assert.equal(limit.variant, 'limit_holdem');
  assert.equal(limit.supported, false);

  const stud = detectExternalHandFormat('PokerStars Hand #1: 7 Card Stud Limit ($1/$2)');
  assert.equal(stud.supported, false);

  const mixed = detectExternalHandFormat([
    "PokerStars Hand #1: Hold'em No Limit ($1/$2)", 'seat lines', '',
    'PokerStars Hand #2: Omaha Pot Limit ($1/$2)', 'seat lines',
  ].join('\n'));
  assert.equal(mixed.mixed, true);
  assert.equal(mixed.supported, true);
  assert.equal(mixed.handCount, 2);
  assert.equal(mixed.unsupportedHandCount, 1);

  const unknown = detectExternalHandFormat('this is not a hand history');
  assert.equal(unknown.site, 'unknown');
  assert.equal(unknown.supported, null);
  assert.equal(detectExternalHandFormat('').handCount, 0);
  assert.equal(detectExternalHandFormat(null).site, 'unknown');
});

test('a generated quick spot is detected as PokerStars NLHE by the paste detector', () => {
  const built = buildLiveSpotHandHistory(baseSpot, { now: NOW });
  const detected = detectExternalHandFormat(built.text);
  assert.equal(detected.site, 'pokerstars');
  assert.equal(detected.supported, true);
});

// ─── Audit summary honesty ──────────────────────────────────────────────────

test('summarizeLiveSpotAudit never attaches solver advice or EV to an unverified decision', () => {
  const summary = summarizeLiveSpotAudit({
    handsParsed: 1,
    complete: true,
    analyses: [{
      drillHref: '/hub/training/arena/some-game?source=audit',
      decisions: [
        { street: 'preflop', heroPosition: 'BTN', playerAction: 'call', solverAction: 'raise', classification: 'mistake', evLoss: 1.2, evLossMeasured: true, solverVerified: false },
        { street: 'flop', heroPosition: 'BTN', playerAction: 'call', solverAction: 'fold', classification: 'mistake', evLoss: 0.4, evLossMeasured: true, solverVerified: true },
      ],
    }],
  });
  assert.equal(summary.verifiedCount, 1);
  assert.equal(summary.unpricedCount, 1);
  assert.equal(summary.hasVerifiedAdvice, true);
  const [unverified, verified] = summary.decisions;
  assert.equal(unverified.solverAction, null);
  assert.equal(unverified.evLoss, null);
  assert.equal(unverified.classification, 'unpriced');
  assert.equal(verified.solverAction, 'fold');
  assert.equal(verified.evLoss, 0.4);
  assert.equal(summary.drillHref, '/hub/training/arena/some-game?source=audit');

  const none = summarizeLiveSpotAudit({ analyses: [{ drillHref: 'https://evil.example/x', decisions: [{ solverVerified: undefined, street: 'flop' }] }] });
  assert.equal(none.hasVerifiedAdvice, false);
  assert.equal(none.drillHref, null, 'Only same-site /hub/ drill links are accepted');
  assert.equal(summarizeLiveSpotAudit(null).decisionsAnalyzed, 0);
});

// ─── Verified Fixed Live badges ─────────────────────────────────────────────

test('Verified Fixed Live is reachable ONLY from confirmed_fixed_at_tables', () => {
  const confirmed = describeTableVerification({
    status: 'confirmed_fixed_at_tables', preMistakeRate: 32, postMistakeRate: 11, postSampleCount: 12, requiredSampleCount: 8,
  });
  assert.equal(confirmed.kind, 'verified');
  assert.equal(confirmed.tone, 'success');
  assert.equal(confirmed.label, 'Verified Fixed Live');
  assert.equal(confirmed.delta, 'Mistakes 32% \u2192 11%');

  // Rates are percentages: 1 means 1%, never 100%.
  const lowRates = describeTableVerification({ status: 'confirmed_fixed_at_tables', preMistakeRate: 1, postMistakeRate: 0 });
  assert.equal(lowRates.delta, 'Mistakes 1% \u2192 0%');
  assert.equal(describeTableVerification({ status: 'confirmed_fixed_at_tables', preMistakeRate: null, postMistakeRate: 4 }).delta, null);
  const legacyAliases = describeTableVerification({ status: 'confirmed_fixed_at_tables', preBaselineErrorRate: 30, postBaselineErrorRate: 9, postBaselineSamples: 10 });
  assert.equal(legacyAliases.delta, 'Mistakes 30% \u2192 9%');

  const awaiting = describeTableVerification({ status: 'awaiting_live_hands', postSampleCount: 3, requiredSampleCount: 8, handsRemaining: 5 });
  assert.equal(awaiting.kind, 'awaiting');
  assert.equal(awaiting.label, '3/8 Live Hands To Verify');
  assert.equal(describeTableVerification({ status: 'awaiting_live_hands', handsRemaining: 6 }).label, '2/8 Live Hands To Verify');
  assert.equal(describeTableVerification({ status: 'awaiting_live_hands' }).label, '0/8 Live Hands To Verify');

  assert.equal(describeTableVerification({ status: 'relapsed_at_tables', preMistakeRate: 10, postMistakeRate: 30 }).kind, 'relapsed');

  for (const status of ['not_mastered', 'mastered_in_drills_still_leaking', 'mastered', 'verified', 'fixed', '', undefined]) {
    assert.equal(describeTableVerification({ status, label: 'Verified Fixed Live', postMistakeRate: 0 }), null, `${status} must not show a live-fixed claim`);
  }
  assert.equal(describeTableVerification(null), null);
  assert.equal(describeTableVerification('confirmed_fixed_at_tables'), null);
});

test('table verification index reads leaks, priorities and training plan modules by id', () => {
  const verification = { status: 'awaiting_live_hands', postSampleCount: 2 };
  const index = buildTableVerificationIndex({
    leaks: [{ id: 'a', tableVerification: verification }],
    priorities: [{ id: 'b', tableVerification: verification }],
    trainingPlan: { modules: [{ leakId: 'c', tableVerification: verification }, { leakId: 'd' }] },
  });
  assert.deepEqual([...index.keys()].sort(), ['a', 'b', 'c']);
  assert.equal(buildTableVerificationIndex(null).size, 0);
  assert.equal(buildTableVerificationIndex({ leaks: 'nope' }).size, 0);
});

// ─── Share Review links ─────────────────────────────────────────────────────

test('share review URLs hide hole cards by default, never carry names or ids, and ignore bad cards', () => {
  const hand = { street: 'flop', position: 'btn', board: ['Ts', '9h', '2c'], heroCards: ['As', 'Kd'], stakes: '$1/$2', title: 'Overfold On Dry Flops' };
  const hidden = buildHandReviewShareUrl({ origin: 'https://smarter.poker/', ...hand });
  const url = new URL(hidden);
  assert.equal(url.pathname, '/share/hand');
  assert.equal(url.searchParams.get('view'), 'review');
  assert.equal(url.searchParams.get('anon'), '1');
  assert.equal(url.searchParams.get('hero'), null, 'Hole cards are excluded unless explicitly selected');
  assert.equal(url.searchParams.get('board'), 'Ts,9h,2c');
  assert.equal(url.searchParams.get('position'), 'BTN');
  assert.doesNotMatch(hidden, /sandbox/i, 'Never point at the retired /sandbox/[id] route');

  const shown = new URL(buildHandReviewShareUrl({ ...hand, includeHoleCards: true, anonymize: false }), 'https://x.test');
  assert.equal(shown.searchParams.get('hero'), 'As,Kd');
  assert.equal(shown.searchParams.get('anon'), '0');
  assert.equal(shown.pathname, '/share/hand');

  const bad = new URL(buildHandReviewShareUrl({ board: ['Zz', 'Ts'], heroCards: ['As'], includeHoleCards: true, street: 'moon', title: '<script>x</script>' }), 'https://x.test');
  assert.equal(bad.searchParams.get('board'), 'Ts');
  assert.equal(bad.searchParams.get('hero'), null, 'Hole cards need exactly two valid cards');
  assert.equal(bad.searchParams.get('street'), null);
  assert.doesNotMatch(bad.search, /<|>/);
});

// ─── Coaching normalizers ───────────────────────────────────────────────────

test('coverage gap and funnel normalizers never fabricate rows or zeros', () => {
  const ranked = normalizeCoverageGapsRanked({
    rows: [
      { format: 'cash', street: 'flop', position: 'btn', stackBucket: '60-100bb', reason: 'no_exact_solver_node', count: 14, coverageHint: { tier: 'deterministic_icm_model', label: 'Deterministic ICM Model', studyGuidance: 'Use The ICM Push Chart.' } },
      { format: 'cash', street: 'turn', stackBucket: 'unknown', count: 3, coverageHint: { tier: 'unsupported', label: 'Unsupported Format', studyGuidance: 'ignored' } },
      { format: 'tournament', street: 'turn', heroPosition: 'bb', count: 0 },
      { street: 'river', count: 'x' },
    ],
    totalUnpriced: 31,
  });
  assert.equal(ranked.rows.length, 2);
  assert.equal(ranked.rows[0].hintTier, 'deterministic_icm_model');
  assert.equal(ranked.rows[0].studyGuidance, 'Use The ICM Push Chart.');
  assert.equal(ranked.rows[1].stackBucket, null, 'unknown stack bucket is not shown');
  assert.equal(ranked.rows[1].studyGuidance, null, 'Unsupported spots never get study guidance');
  assert.equal(ranked.rows[0].format, 'Cash');
  assert.equal(ranked.rows[0].street, 'FLOP');
  assert.equal(ranked.rows[0].position, 'BTN');
  assert.equal(ranked.rows[0].reason, 'No Exact Solver Node');
  assert.equal(ranked.total, 31);
  assert.deepEqual(normalizeCoverageGapsRanked(undefined), { rows: [], total: null });
  assert.equal(normalizeCoverageGapsRanked([{ street: 'flop', count: 2 }], 9).total, 9);
  assert.equal(normalizeCoverageGapsRanked(Array.from({ length: 30 }, (_, i) => ({ street: 'flop', count: i + 1 }))).rows.length, 10);

  assert.equal(normalizeFunnelMetrics(undefined), null);
  assert.equal(normalizeFunnelMetrics({}), null);
  const funnel = normalizeFunnelMetrics({ auditedHands: 120, drilledLeaks: 4, masteredLeaks: null, verifiedFixedLive: 0 });
  assert.deepEqual(funnel.map((step) => step.label), ['Audited', 'Drilled', 'Mastered', 'Verified Live']);
  assert.deepEqual(funnel.map((step) => step.value), [120, 4, null, 0]);
});

// ─── Source contracts ───────────────────────────────────────────────────────

test('LiveSpotQuickEntry is a zero-clutter sheet with two tabs, 44px controls and 16px inputs', () => {
  const src = read('src/components/personal-assistant/LiveSpotQuickEntry.jsx');
  const paKit = read('src/components/sandbox/paKit.jsx');
  assert.match(src, /export \{ buildLiveSpotHandHistory, detectExternalHandFormat \}/);
  assert.match(src, /Live Quick Spot \(15s\)/);
  assert.match(src, /Paste External HH/);
  assert.match(src, /Analyze Live Spot/);
  assert.match(src, /Analyze Hand History/);
  assert.match(src, /\/api\/training\/audit-hand-history/);
  assert.match(src, /<BottomSheet/, 'Dialog behaviour comes from the shared BottomSheet');
  assert.match(paKit, /aria-modal="true"/, 'BottomSheet must keep aria-modal');
  assert.match(paKit, /e\.key === 'Escape'/, 'BottomSheet must close on Escape');
  assert.match(src, /minHeight: 44/);
  assert.match(src, /fontSize: 16/);
  assert.match(src, /<details className="pa-disclosure"[^>]*>/, 'Board entry is a native optional disclosure');
  assert.match(src, /No Verified Solver Spot Matched/, 'Unverified spots report coverage, not advice');
  assert.match(src, /detected\.supported === false/, 'Non-NLHE paste must disable analysis');
  assert.doesNotMatch(src, /Math\.random|fabricat/i);
  assert.doesNotMatch(src, /\bANALYZE\b/, 'No shouted copy');
});

test('no block-level tags sit inside any <button> in the Phase 4 surfaces', () => {
  const files = [
    'src/components/personal-assistant/LiveSpotQuickEntry.jsx',
    'pages/hub/personal-assistant/index.js',
    'pages/hub/personal-assistant/leaks.js',
    'src/components/personal-assistant/CoachingWorkspace.jsx',
  ];
  const BLOCK = new Set(['div', 'p', 'ul', 'ol', 'li', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'form', 'table', 'details', 'summary']);
  const tagName = (node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    return opening.tagName.getText();
  };
  for (const file of files) {
    const source = read(file);
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let buttons = 0;
    const offenders = [];
    const visit = (node) => {
      if (ts.isJsxElement(node) && tagName(node) === 'button') {
        buttons += 1;
        const inner = (child) => {
          if ((ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && BLOCK.has(tagName(child))) {
            offenders.push(`${tagName(child)} @ ${sf.getLineAndCharacterOfPosition(child.getStart()).line + 1}`);
          }
          ts.forEachChild(child, inner);
        };
        node.children.forEach(inner);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    assert.ok(buttons > 0, `${file}: expected to inspect at least one button`);
    assert.deepEqual(offenders, [], `${file}: block tags inside <button>`);
  }
});

test('PA Home: approved illustrated landing cards, Log A Hand modal, My Coaching Plan, and Settings are wired', () => {
  const src = read('pages/hub/personal-assistant/index.js');
  const css = read('src/styles/worlds/PersonalAssistantHub.module.css');
  assert.match(src, /Review My Play/);
  assert.match(src, /Virtual Sandbox/);
  assert.match(src, /My Leaks/);
  assert.match(src, /Log A Hand/);
  assert.match(src, /My Coaching Plan/);
  assert.match(src, /onClick=\{openLiveSpot\}/);
  assert.match(src, /import\('..\/..\/..\/src\/components\/personal-assistant\/LiveSpotQuickEntry'\)/);
  assert.doesNotMatch(src, /\/hub\/training/, 'Landing page body must not redirect to Training Games');
  assert.match(src, /readyToReviewText/);
  assert.match(src, /leaksSummaryText/);
  assert.match(css, /\.syncAlert\s*\{/, 'The live-data failure remains visible after the landing redesign');
});

test('Leak Finder: verified-live badges, due count tab, quick spot triggers, share review and ?quickspot=1', () => {
  const src = read('pages/hub/personal-assistant/leaks.js');
  assert.match(src, /function TableVerificationBadges/);
  assert.match(src, /describeTableVerification/);
  const badgeUses = src.match(/<TableVerificationBadges verification=\{leak\.tableVerification\} \/>/g) || [];
  assert.equal(badgeUses.length, 3, 'LeakCard, LeakDetail and Past Leaks all show live verification');
  assert.match(src, /label: reviewQueueAll\.length > 0 \? `Leaks \(\$\{reviewQueueAll\.length\}\)` : 'Leaks'/);
  assert.match(src, /data-live-spot-trigger="analysis-settings"/);
  assert.match(src, /data-live-spot-trigger="insights"/);
  assert.match(src, /router\.query\?\.quickspot/);
  assert.match(src, /quickSpotHandledRef/);
  assert.match(src, /const \{ quickspot: _removed, \.\.\.restQuery \} = router\.query/);
  assert.match(src, /<LiveSpotQuickEntry/);
  assert.match(src, /Anonymize Villain Names/);
  assert.match(src, /Include My Hole Cards/);
  assert.match(src, /Share Review/);
  assert.match(src, /buildHandReviewShareUrl/);
  assert.doesNotMatch(src, /\/sandbox\/\$\{/, 'Never link into the retired /sandbox/[id] route');
  assert.match(src, /onJumpToLeaks=/);
  assert.match(src, /onInspectHand=/);
  assert.match(src, /onDrillHand=/);
  assert.match(src, /launchLinkedHandDrill/);
  assert.match(src, /autoDrillHandledRef/);
});

test('Coaching Workspace: due alert jump, ranked gaps, funnel, debrief hands, viewNav grid preserved', () => {
  const src = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  const css = read('src/components/personal-assistant/CoachingWorkspace.module.css');
  assert.match(src, /onJumpToLeaks/);
  assert.match(src, /\/hub\/personal-assistant\/leaks\?tab=leaks/);
  assert.match(src, /data-alert-action="due-reviews"/);
  assert.match(src, /aria-label="Solver Coverage Gaps"/);
  assert.match(src, /normalizeCoverageGapsRanked\(workspace\?\.snapshot\?\.coverageGapsRanked/);
  assert.match(src, /aria-label="Coverage Gap Demand"/);
  assert.match(src, /aria-label="Coaching Funnel"/);
  assert.match(src, /normalizeFunnelMetrics\(workspace\?\.snapshot\?\.funnelMetrics\)/);
  assert.match(src, /topLeakedHands/);
  assert.match(src, /!workspace\?\.snapshot\?\.liveTableActive/);
  assert.match(src, /Hand-Level Review Is Paused While You Are Seated At A Live Table/);
  assert.match(src, /Latest Session Debrief/);
  assert.match(css, /\.viewNav \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(104px, 1fr\)\); \}/);
  assert.match(css, /\.alertAction[^}]*min-height: 44px/);
});

test('Restored Virtual Sandbox links verified destinations and the retired sandbox/[id] route stays noindex', () => {
  const src = read('pages/hub/personal-assistant/sandbox.js');
  assert.match(src, /data-training-authority="authored-sandbox-ungraded"/);
  assert.match(src, /\/hub\/personal-assistant\/leaks\?source=personal-assistant-sandbox/);
  const retired = read('pages/sandbox/[id].js');
  assert.match(retired, /noindex/i, 'Retired /sandbox/[id] must keep its noindex contract');
});

test('share/hand and OG hand-card have an honest view=review mode and keep legacy links intact', () => {
  const page = read('pages/share/hand.js');
  const og = read('pages/api/og/hand-card.js');
  assert.match(page, /isReview = (?:firstQuery\(view\)|scalarParam\(view\)|view) === 'review'/);
  assert.match(page, /noindex,nofollow/);
  assert.match(page, /Analyze Your Own Hands/);
  assert.match(page, /href="\/hub\/personal-assistant"/);
  assert.match(page, /Hole Cards Hidden By The Player/);
  assert.match(page, /Anonymized Villain/);
  assert.match(og, /view'\) === 'review'/);
  assert.match(og, /Hidden By The Player/);
  // Phase 10 honesty upgrade: neither review nor standard links fabricate fake Ah,Kh or +$1,250 defaults.
  for (const [name, text] of [['page', page], ['og', og]]) {
    assert.doesNotMatch(text, /\|\|\s*['"]Ah,Kh['"]/, `${name}: must not fabricate default Ah,Kh hole cards`);
    assert.doesNotMatch(text, /\|\|\s*['"]\+\$1,250['"]/, `${name}: must not fabricate default +$1,250 amount`);
  }
  assert.match(og, /const result = isReview \? '' :/);
  assert.match(og, /const amount = isReview \? '' :/);
  assert.match(og, /const pot = isReview \? '' :/);
  assert.match(og, /const player = isReview \? 'Smarter\.Poker Hand Review'/);
  assert.match(og, /private, no-store, max-age=0/);
  assert.match(og, /noindex, nofollow/);
  assert.match(page, /isReview \? reviewTitle/);
});
