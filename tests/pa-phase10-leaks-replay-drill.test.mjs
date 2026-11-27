/**
 * Phase 10 Anti-Regression Suite: Leak Finder Mastery Receipt & Club Arena Stats Return,
 * InlineHandReplay Card Parsing / Unit-Aware Amounts / Privacy Share / Arrow Keys,
 * QuickSpotDrill Desktop Keyboard Shortcuts, and CoachingWorkspace JSON/Print Export + Fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import { buildStudyPlanJson, buildStudyPlanMarkdown } from '../src/lib/personal-assistant/studyPlanExport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const React = require('react');
const ReactDOMServer = require('react-dom/server');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function loadTranspiledModule(relPath, mocks = {}) {
  const fullPath = path.join(ROOT, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: fullPath,
  }).outputText;

  const moduleObj = { exports: {} };
  const customRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id === 'react') return React;
    return require(id);
  };
  const fn = new Function('module', 'exports', 'require', transpiled);
  fn(moduleObj, moduleObj.exports, customRequire);
  return moduleObj.exports;
}

test('1. [leaks.js] Consumes pa_arena_review_receipt_v1 with 10m TTL, bypasses SWR cache, renders Club Arena Stats return link, and wires HamburgerMenu user', () => {
  const leaks = read('pages/hub/personal-assistant/leaks.js');

  // SessionStorage mastery receipt with try/catch, immediate removal, 10-minute expiry, SWR cache bypass, refresh & toast
  assert.match(leaks, /sessionStorage\?\.getItem\('pa_arena_review_receipt_v1'\)/);
  assert.match(leaks, /sessionStorage\.removeItem\('pa_arena_review_receipt_v1'\)/);
  assert.match(leaks, /MAX_RECEIPT_AGE_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  assert.match(leaks, /clearAssistantClientCache\(userId\);\s*fetchReviewSchedule\(\);\s*refresh\(\);/);
  assert.match(leaks, /toast\.success\('Training Mastery Synced'\)/);
  assert.match(leaks, /data-testid="review-receipt-banner"/);

  // Consumes ?source=club-arena-stats (plus club-arena) and renders 44px-tall return link to /hub/club-arena/stats
  assert.match(leaks, /const isFromClubArenaStats = navSource === 'club-arena-stats';/);
  assert.match(leaks, /const isFromClubArena = navSource === 'club-arena';/);
  assert.match(leaks, /href=\{isFromClubArenaStats \? '\/hub\/club-arena\/stats' : '\/hub\/club-arena'\}/);
  assert.match(leaks, /← Return To Club Arena Stats/);
  assert.match(leaks, /data-testid=\{isFromClubArenaStats \? 'return-club-arena-stats' : 'return-club-arena'\}/);
  assert.match(leaks, /minHeight:\s*44/);

  // Real user & showProfile={Boolean(user)} passed to HamburgerMenu (zero hardcoded user={null} / showProfile={false})
  assert.match(leaks, /<HamburgerMenu[\s\S]{0,220}user=\{user\}[\s\S]{0,120}showProfile=\{Boolean\(user\)\}/);
  assert.doesNotMatch(leaks, /<HamburgerMenu[\s\S]{0,220}user=\{null\}/);
  assert.doesNotMatch(leaks, /<HamburgerMenu[\s\S]{0,220}showProfile=\{false\}/);

  // handleTrainDrills(null) routes cleanly to /hub/training instead of silently returning
  assert.match(leaks, /const target = leak === null \? null : \(leak \|\| selectedLeak\);[\s\S]{0,180}router\.push\(\{\s*pathname:\s*'\/hub\/training'/);
});

test('2. [InlineHandReplay] Lowercase T->10 card parsing, unit-aware action amounts, privacy-safe Share Hand bar, and container-level ArrowLeft/ArrowRight stepping', () => {
  const replaySrc = read('src/components/personal-assistant/InlineHandReplay.jsx');
  const replayMod = loadTranspiledModule('src/components/personal-assistant/InlineHandReplay.jsx');
  const {
    parseCard,
    formatActionAmount,
    buildReplayShareUrl,
    default: InlineHandReplay,
  } = replayMod;

  // Lowercase 'th' parses to rank '10' (NOT 'T')
  const tenHearts = parseCard('th');
  assert.equal(tenHearts.rank, '10');
  assert.equal(tenHearts.suit, '♥');
  assert.equal(tenHearts.color, '#FF6B7A');
  assert.equal(parseCard('Th').rank, '10');
  assert.equal(parseCard('10s').rank, '10');
  assert.equal(parseCard('as').rank, 'A');
  assert.equal(parseCard('kd').rank, 'K');

  // Unit-aware action amounts: BB/tournament shows "X BB", cash USD shows "$X", unconfirmed never fabricates "$"
  assert.equal(formatActionAmount({ amount: 4.5 }, { handIsBb: true, handIsCashUsd: false }), '4.5 BB');
  assert.equal(formatActionAmount({ amount: 12, potBeforeBB: 18 }, { handIsBb: false, handIsCashUsd: false }), '12 BB');
  assert.equal(formatActionAmount({ amount: 16 }, { handIsBb: false, handIsCashUsd: true }), '$16');
  assert.equal(formatActionAmount({ amount: 250 }, { handIsBb: false, handIsCashUsd: false }), '250');
  assert.equal(formatActionAmount({ amount: '$35' }, { handIsBb: false, handIsCashUsd: false }), '$35');
  assert.equal(formatActionAmount({ amount: '3.5 BB' }, { handIsBb: false, handIsCashUsd: true }), '3.5 BB');
  assert.doesNotMatch(replaySrc, /\(\$\$\{act\.amount\}\)/, 'InlineHandReplay must never hardcode $ on act.amount');

  // Privacy-safe share URL builder: defaults to hole cards hidden, includes hero ONLY when explicitly opted in
  const hiddenUrl = buildReplayShareUrl({
    origin: 'https://smarter.poker',
    street: 'flop',
    position: 'btn',
    board: ['th', 'Js', '2c'],
    heroCards: ['As', 'Kd'],
    includeHoleCards: false,
  });
  const hiddenParams = new URL(hiddenUrl).searchParams;
  assert.equal(hiddenParams.get('view'), 'review');
  assert.equal(hiddenParams.get('anon'), '1');
  assert.equal(hiddenParams.get('street'), 'flop');
  assert.equal(hiddenParams.get('position'), 'BTN');
  assert.equal(hiddenParams.get('board'), 'Th,Js,2c');
  assert.equal(hiddenParams.get('hero'), null, 'Hole cards must be omitted by default');

  const optedInUrl = buildReplayShareUrl({
    origin: 'https://smarter.poker',
    street: 'flop',
    position: 'btn',
    board: ['th', 'Js', '2c'],
    heroCards: ['as', 'kd'],
    includeHoleCards: true,
  });
  assert.equal(new URL(optedInUrl).searchParams.get('hero'), 'As,Kd');

  // SSR render verifies lowercase 'th' -> '10', BB action formatting, and Share Hand controls
  const bbHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['th', 'as'], board: ['th', 'Js', '2c'], heroPosition: 'BTN', potBb: 12, effectiveStackBb: 88, format: 'tournament' },
      initialStreet: 'flop',
      streetTimeline: [
        { street: 'preflop', board: [] },
        { street: 'flop', board: ['th', 'Js', '2c'], potBb: 12, actions: [{ position: 'BTN', action: 'bet', amount: 4.5, isHero: true }] },
      ],
    }),
  );
  assert.match(bbHtml, /data-card="th"[^>]*><span>10<\/span>/, 'SSR must render lowercase th as 10');
  assert.match(bbHtml, /\(4\.5 BB\)/, 'BB/tournament action amount must render as BB');
  assert.doesNotMatch(bbHtml, /\(\$4\.5\)/, 'BB/tournament action must not render $');
  assert.match(bbHtml, /data-testid="replay-share-bar"/);
  assert.match(bbHtml, /data-testid="replay-share-include-cards"/);
  assert.match(bbHtml, /Include Hole Cards/);
  assert.match(bbHtml, /data-testid="replay-share-hand-btn"/);
  assert.match(bbHtml, /Share Hand/);
  assert.match(bbHtml, /role="status"[^>]*aria-live="polite"[^>]*data-testid="replay-share-status"/);

  // Cash USD SSR render confirms $ appears only for confirmed cash USD hands
  const cashHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(InlineHandReplay, {
      hand: { heroCards: ['As', 'Kd'], board: ['Qh', 'Js', '2c'], heroPosition: 'BTN', stakes: '$1/$2', pot: '$24', format: 'cash' },
      initialStreet: 'flop',
      streetTimeline: [
        { street: 'flop', board: ['Qh', 'Js', '2c'], pot: '$24', actions: [{ position: 'BTN', action: 'bet', amount: 16, isHero: true }] },
      ],
    }),
  );
  assert.match(cashHtml, /\(\$16\)/, 'Confirmed cash USD hand action amount must render with $');

  // Container-level ArrowLeft / ArrowRight keyboard stepping guarded against inputs and modifier keys
  assert.match(replaySrc, /const handleContainerKeyDown = useCallback/);
  assert.match(replaySrc, /onKeyDown=\{handleContainerKeyDown\}/);
  assert.match(replaySrc, /targetTag === 'INPUT'[\s\S]{0,120}targetTag === 'TEXTAREA'[\s\S]{0,120}targetTag === 'SELECT'/);
  assert.match(replaySrc, /event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey/);
});

test('3. [QuickSpotDrill] Desktop keyboard shortcuts (1-4 pick, Enter/Space advance) with strict guards and fine-pointer keycaps', async () => {
  const drillSrc = read('src/components/sandbox/QuickSpotDrill.jsx');
  const paTokens = await import(pathToFileURL(path.join(ROOT, 'src/components/sandbox/paTokens.js')).href);

  const drillMod = loadTranspiledModule('src/components/sandbox/QuickSpotDrill.jsx', {
    'lucide-react': {
      Zap: () => null,
      Check: () => null,
      X: () => null,
      Flame: () => null,
      RotateCcw: () => null,
      AlertTriangle: () => null,
      CalendarDays: () => null,
    },
    '../../lib/authUtils': { authedFetch: async () => ({ ok: true, json: async () => ({}) }) },
    '../../lib/personal-assistant/lockedDrillResult': { lockedDrillResult: () => ({}) },
    '../../lib/personal-assistant/persistenceContract': { readPersistenceResponse: async () => ({}) },
    '../../lib/sandbox/leakReview': { gradeReview: () => ({}), migrateRecord: (r) => r, SCHEMA_VERSION: 3 },
    '../../lib/personal-assistant/assistantDefaults.mjs': {
      PA_ANALYSIS_DEFAULTS: { practiceDifficulty: 'standard' },
      resolveDrillTiming: () => ({ durationSeconds: 15, label: '15s Standard' }),
    },
    './paTokens': paTokens,
    './paKit': {
      BottomSheet: ({ children }) => React.createElement('div', null, children),
      PAStyles: () => null,
      Skeleton: () => null,
      EmptyState: () => null,
      ErrorState: () => null,
      safeStorage: { get: () => '1', set: () => true, remove: () => true },
      usePrefersReducedMotion: () => false,
    },
  });

  const { resolveDrillShortcutAction } = drillMod;
  assert.equal(typeof resolveDrillShortcutAction, 'function');

  // 1-4 pick options when active & !revealed
  assert.deepEqual(
    resolveDrillShortcutAction({ key: '1', target: { tagName: 'BODY' } }, { active: true, revealed: false, optionCount: 4 }),
    { type: 'pick', index: 0 },
  );
  assert.deepEqual(
    resolveDrillShortcutAction({ key: '4', target: { tagName: 'BUTTON' } }, { active: true, revealed: false, optionCount: 4 }),
    { type: 'pick', index: 3 },
  );
  assert.equal(
    resolveDrillShortcutAction({ key: '4', target: { tagName: 'BODY' } }, { active: true, revealed: false, optionCount: 3 }),
    null,
    'Out-of-range key 4 must be ignored when only 3 options exist',
  );
  assert.equal(
    resolveDrillShortcutAction({ key: '1', target: { tagName: 'BODY' } }, { active: true, revealed: true, optionCount: 4 }),
    null,
    'Number keys must not pick after answer is revealed',
  );
  assert.equal(
    resolveDrillShortcutAction({ key: '2', target: { tagName: 'BODY' } }, { active: true, revealed: false, isSubmitting: true, optionCount: 4 }),
    null,
    'Number keys must be ignored while submitting',
  );

  // Enter / Space advance when revealed
  assert.deepEqual(
    resolveDrillShortcutAction({ key: 'Enter', target: { tagName: 'BODY' } }, { active: true, revealed: true, optionCount: 4 }),
    { type: 'next' },
  );
  assert.deepEqual(
    resolveDrillShortcutAction({ key: ' ', target: { tagName: 'BODY' } }, { active: true, revealed: true, optionCount: 4 }),
    { type: 'next' },
  );
  assert.equal(
    resolveDrillShortcutAction({ key: 'Enter', target: { tagName: 'BODY' } }, { active: true, revealed: false, optionCount: 4 }),
    null,
    'Enter must not advance before answer is revealed',
  );

  // Strict guards: modifier keys, form fields, repeat, inactive states
  for (const modEvent of [
    { key: '1', metaKey: true },
    { key: '1', ctrlKey: true },
    { key: '1', altKey: true },
    { key: '1', repeat: true },
    { key: '1', target: { tagName: 'INPUT' } },
    { key: '1', target: { tagName: 'TEXTAREA' } },
    { key: '1', target: { tagName: 'SELECT' } },
    { key: '1', target: { tagName: 'DIV', isContentEditable: true } },
  ]) {
    assert.equal(
      resolveDrillShortcutAction(modEvent, { active: true, revealed: false, optionCount: 4 }),
      null,
      `Must ignore guarded keydown event: ${JSON.stringify(modEvent)}`,
    );
  }
  assert.equal(
    resolveDrillShortcutAction({ key: '1', target: { tagName: 'BODY' } }, { active: false, revealed: false, optionCount: 4 }),
    null,
    'Must ignore when drill spot is inactive (loading/finished/confirmQuit)',
  );

  // Fine-pointer keycap hints with aria-hidden="true" and window keydown listener
  assert.match(drillSrc, /@media \(pointer: fine\)[\s\S]{0,120}\.pa-drill-keycap/);
  assert.match(drillSrc, /className="pa-drill-keycap"[\s\S]{0,80}aria-hidden="true"/);
  assert.match(drillSrc, /window\.addEventListener\('keydown',\s*onKeyDown\)/);
  assert.match(drillSrc, /const spotActive = !loading && !finished && !confirmQuit && !loadError && questions\.length > 0;/);
});

test('4. [studyPlanExport, CoachingWorkspace & CSS] PII-redacted buildStudyPlanJson, JSON + Print/PDF buttons, @media print rules, and Next Best Action fallback', () => {
  const secretEmail = 'player.secret@example.com';
  const secretUuid = '12345678-1234-4123-8123-123456789abc';
  const secretHandle = '@shark_villain99';
  const secretToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456';

  const sampleSnapshot = {
    generatedAt: '2026-11-27T02:00:00.000Z',
    userId: secretUuid,
    email: secretEmail,
    funnelMetrics: {
      auditedHands: 412,
      activeLeaks: 3,
      drilledLeaks: 2,
      masteredLeaks: 1,
      verifiedFixedLive: 1,
    },
    trainingPlan: {
      modules: [
        {
          rank: 1,
          leakId: secretUuid,
          title: `River Overfold vs ${secretHandle} (${secretEmail}) holding As Kd ${secretToken}`,
          status: 'emerging',
          category: 'river',
          heroCards: ['As', 'Kd'],
          playerName: 'RealHeroName',
          tableVerification: {
            status: 'confirmed_fixed_at_tables',
            label: 'Verified Fixed Live',
            preMistakeRate: 44.44,
            postMistakeRate: 11.16,
          },
          drillParams: { street: 'river', position: 'BB' },
          stakePoolContext: {
            label: 'NL200 Pool',
            poolMetricLabel: '48% Fold',
            gtoBaselineLabel: '35% Fold',
            sampleHands: 12000,
          },
        },
      ],
    },
    coverageGapsRanked: [
      {
        format: 'Tournament NLH',
        street: 'turn',
        position: 'BTN',
        stackBucket: '20-40bb',
        count: 9,
        coverageHint: { label: 'Queued For Harvest' },
      },
    ],
  };

  const jsonPlan = buildStudyPlanJson(sampleSnapshot);
  const serialized = JSON.stringify(jsonPlan);

  assert.equal(jsonPlan.schemaVersion, 1);
  assert.equal(jsonPlan.funnelMetrics.auditedHands, 412);
  assert.equal(jsonPlan.modules.length, 1);
  assert.equal(jsonPlan.modules[0].mistakeRate.prePercent, 44.4);
  assert.equal(jsonPlan.modules[0].mistakeRate.postPercent, 11.2);
  assert.equal(jsonPlan.coverageGaps.length, 1);
  assert.equal(jsonPlan.coverageGaps[0].position, 'BTN');

  // Strict PII & raw hole-card redaction guarantees
  assert.doesNotMatch(serialized, new RegExp(secretEmail.replace('.', '\\.')), 'JSON export must never contain email');
  assert.doesNotMatch(serialized, new RegExp(secretUuid, 'i'), 'JSON export must never contain UUID');
  assert.doesNotMatch(serialized, /@shark_villain99/, 'JSON export must never contain player handle');
  assert.doesNotMatch(serialized, /eyJhbGci/, 'JSON export must never contain auth tokens');
  assert.doesNotMatch(serialized, /\bAs Kd\b/, 'JSON export must never contain raw hole cards');
  assert.doesNotMatch(serialized, /RealHeroName/, 'JSON export must never leak non-whitelisted playerName');
  assert.equal(jsonPlan.modules[0].leakId, undefined, 'JSON module must not emit raw leakId UUID');
  assert.equal(jsonPlan.modules[0].heroCards, undefined, 'JSON module must not emit heroCards');

  // Existing Markdown exporter still works cleanly
  const md = buildStudyPlanMarkdown(sampleSnapshot);
  assert.match(md, /\[REDACTED_EMAIL\]/);

  // CoachingWorkspace.jsx wiring: Download JSON, Print / Save PDF, Next Best Action fallback -> onTrain / /hub/training
  const coachingSrc = read('src/components/personal-assistant/CoachingWorkspace.jsx');
  assert.match(coachingSrc, /buildStudyPlanJson/);
  assert.match(coachingSrc, /data-testid="download-study-plan-json-btn"/);
  assert.match(coachingSrc, /Download JSON/);
  assert.match(coachingSrc, /data-testid="print-study-plan-btn"/);
  assert.match(coachingSrc, /Print \/ Save PDF/);
  assert.match(coachingSrc, /window\.print\(\)/);
  assert.match(
    coachingSrc,
    /data-testid="next-best-action-practice-btn"[\s\S]{0,360}if \(onStartReview && targetLeak\) onStartReview\(targetLeak\);[\s\S]{0,120}else if \(onTrain\) onTrain\(targetLeak \|\| null\);[\s\S]{0,120}window\.location\.assign\('\/hub\/training'\)/,
    'Next Best Action Practice This fallback must route to onTrain / /hub/training rather than hand-history-upload',
  );

  // CoachingWorkspace.module.css @media print rules
  const css = read('src/components/personal-assistant/CoachingWorkspace.module.css');
  assert.match(css, /@media print\s*\{[\s\S]*background:\s*#ffffff/);
  assert.match(css, /@media print\s*\{[\s\S]*color:\s*#111827/);
  assert.match(css, /@media print\s*\{[\s\S]*\.viewNav[\s\S]*\.exportTray[\s\S]*display:\s*none !important/);
});
