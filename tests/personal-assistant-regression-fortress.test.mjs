import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// ─── 1. Action Grading & Daily Hand Contract ──────────────────────────────────

test('Fortress [actionGrading]: Check-Raise, 4-Bet, Jam, fractional pot bets, and word boundaries', async () => {
  const { parseActionLabel, gradeAction } = await import('../src/lib/sandbox/actionGrading.js');

  assert.equal(parseActionLabel('Check-Raise').type, 'raise');
  assert.equal(gradeAction('Check', 'Check-Raise'), false);
  assert.equal(gradeAction('Check-Raise', 'Raise'), true);

  assert.equal(parseActionLabel('4-Bet').type, 'raise');
  assert.equal(gradeAction('Bet', '4-Bet'), false);
  assert.equal(gradeAction('4-Bet', 'Raise'), true);

  assert.equal(parseActionLabel('Jam').type, 'allin');
  assert.equal(gradeAction('Jam', 'All-In'), true);

  assert.equal(gradeAction('Bet 1/3 Pot', 'Bet Pot'), false);
  assert.equal(gradeAction('Bet 1/2 Pot', 'Bet Pot'), false);
  assert.equal(gradeAction('Bet 2/3 Pot', 'Bet Pot'), false);
  assert.equal(gradeAction('Bet 1/3 Pot', 'Bet 33%'), true);
  assert.equal(gradeAction('Bet 2/3 Pot', 'Bet 66%'), true);
  assert.equal(parseActionLabel('Bet Spot').size, null, 'Substring "pot" inside "Spot" must NOT parse as 100% pot');
});

test('Fortress [dailyHandContract]: rejects impossible pair suffixes and avoids board suit collisions', async () => {
  const { materializeCanonicalHeroHand, resolveDailyHeroHand } = await import('../src/lib/personal-assistant/dailyHandContract.mjs');

  assert.equal(materializeCanonicalHeroHand('AAs', ['Ks', '7h', '2c']), null, 'Impossible suited pair AAs must be rejected');
  assert.equal(materializeCanonicalHeroHand('22o', ['Ks', '7h', '2c']), null, 'Impossible offsuit pair 22o must be rejected');

  const validPair = materializeCanonicalHeroHand('AA', ['As', 'Ah', '7c']);
  assert.ok(validPair, 'Valid pocket pair with two board aces should materialize non-colliding suits');
  const heroCards = validPair.match(/.{2}/g) || [];
  assert.equal(heroCards.length, 2);
  assert.equal(heroCards.includes('As'), false);
  assert.equal(heroCards.includes('Ah'), false);

  const resolved = resolveDailyHeroHand({
    scenario: { heroHand: 'AA', boardCards: ['As', 'Ah', '7c'] },
  });
  assert.equal(resolved, 'AdAc');
});

// ─── 2. Hetzner Hand History & Leak Record Normalization ──────────────────────

test('Fortress [leakRecord]: Hetzner action.stage preserves postflop streets, strips forced posts, and normalizes 10->T', async () => {
  const { normalizeAuditHand, toCardCode } = await import('../src/lib/personal-assistant/leakRecord.js');

  assert.equal(toCardCode('10h'), 'Th');
  assert.equal(toCardCode('10S'), 'Ts');

  const normalized = normalizeAuditHand({
    id: 'hand-hetzner-1',
    created_at: '2026-11-24T12:00:00Z',
    big_blind: 2,
    small_blind: 1,
    community_cards: ['Ks', '7h', '2c'],
    players: [
      { userId: 'hero-1', seat: 1, position: 'BTN', hole_cards: ['Ah', 'Kd'], stack: 200 },
      { userId: 'vil-1', seat: 2, position: 'BB', stack: 200 },
    ],
    actions: [
      { stage: 'preflop', userId: 'vil-1', type: 'bb', amount: 2, origin: 'forced' },
      { stage: 'preflop', userId: 'hero-1', type: 'raise', amount: 6 },
      { stage: 'preflop', userId: 'vil-1', type: 'call', amount: 6 },
      { stage: 'flop', userId: 'vil-1', type: 'check', amount: 0 },
      { stage: 'flop', userId: 'hero-1', type: 'bet', amount: 8 },
      { stage: 'flop', userId: 'vil-1', type: 'allin', amount: 194 },
    ],
  }, 'hero-1');

  assert.ok(normalized, 'Hetzner row must normalize');
  const flopActions = (normalized.actions || []).filter((a) => a.street === 'flop');
  assert.ok(flopActions.length >= 2, 'Hetzner stage:"flop" actions must remain on flop, never collapse into preflop');
  assert.equal((normalized.actions || []).some((a) => a.type === 'bb'), false, 'Forced bb post must be stripped');
});

// ─── 3. Coaching Intelligence & Review Queue Presentation ─────────────────────

test('Fortress [coachingIntelligence]: null dates never become 1970 epoch; PIO/lookup-failed coverage accurate', async () => {
  const { buildCoachingSnapshot } = await import('../src/lib/personal-assistant/coachingIntelligence.mjs');

  const snap = buildCoachingSnapshot({
    leaks: [{
      id: 'leak-1',
      leak_type: 'cbet_too_low',
      leak_category: 'postflop',
      situation_class: 'Flop C-Bet',
      status: 'persistent',
      severity: 'high',
      ev_loss_bb_per_100: 4.2,
      resolved_at: null,
      updated_at: '2026-11-24T12:00:00Z',
    }],
    decisions: [
      {
        hand_external_id: 'club-arena:11111111-1111-4111-8111-111111111111',
        decision_key: 'd-1',
        street: 'flop',
        solver_verified: true,
        solver_source: 'PIO',
        classification: 'blunder',
        ev_loss: 1.5,
        ev_loss_measured: true,
        audited_at: '2026-11-24T12:00:00Z',
      },
      {
        hand_external_id: 'club-arena:22222222-2222-4222-8222-222222222222',
        decision_key: 'd-2',
        street: 'turn',
        solver_verified: false,
        solver_source: 'lookup-failed',
        classification: 'inaccuracy',
        ev_loss: null,
        ev_loss_measured: false,
        audited_at: '2026-11-24T12:01:00Z',
      },
    ],
    reviews: [],
  });

  const timelineJson = JSON.stringify(snap.timeline || []);
  assert.equal(timelineJson.includes('1970-01-01'), false, 'Null timestamps must never emit 1970-01-01 epoch events');
  assert.equal(snap.coverage.solverEvidence, 1, 'PIO solver decision must count as solverEvidence');
  assert.equal(snap.coverage.aiGuidance, 0, 'lookup-failed must NEVER be misclassified as aiGuidance');
});

test('Fortress [reviewQueuePresentation]: dueInLabel returns today for same-day future review, tomorrow for next UTC day', async () => {
  const { dueInLabel } = await import('../src/lib/personal-assistant/reviewQueueLabels.mjs');

  const now = Date.UTC(2026, 10, 24, 15, 0, 0);
  const oneHourLater = new Date(now + 3_600_000).toISOString();
  const nextDay = new Date(Date.UTC(2026, 10, 25, 10, 0, 0)).toISOString();
  const threeDays = new Date(Date.UTC(2026, 10, 27, 10, 0, 0)).toISOString();

  assert.equal(dueInLabel(oneHourLater, now), 'today');
  assert.equal(dueInLabel(nextDay, now), 'tomorrow');
  assert.equal(dueInLabel(threeDays, now), 'in 3 days');
});

test('Fortress [leakReview & lockedDrillResult]: reviewStats uses history[].at and lockedDrillResult accepts graded.correct', async () => {
  const { reviewStats } = await import('../src/lib/sandbox/leakReview.js');
  const { lockedDrillResult } = await import('../src/lib/personal-assistant/lockedDrillResult.js');

  const now = Date.UTC(2026, 10, 24, 18, 0, 0);
  const stats = reviewStats([{
    leakId: 'l1',
    reps: 3,
    dueAt: new Date(now + 86_400_000).toISOString(),
    history: [
      { at: new Date(now - 2 * 86_400_000).toISOString(), score: 1 },
      { at: new Date(now - 1 * 86_400_000).toISOString(), score: 1 },
      { at: new Date(now).toISOString(), score: 1 },
    ],
  }], new Date(now));
  assert.ok(stats.streak >= 3, `Expected 3-day review streak from history[].at, got ${stats.streak}`);

  const summary = lockedDrillResult({ correct: true, selectedAnswer: 'Bet 33%' });
  assert.equal(summary.correct, true);
  assert.equal(summary.pick, 'Bet 33%');
});

// ─── 4. Sandbox Libraries (HandHistoryParser, EquityEngine, nativeSolverImport, scenarioContract)

test('Fortress [Sandbox HandHistoryParser]: ignores SUMMARY seats, keeps bet vs raise, parses EUR/GBP & GGPoker boards', async () => {
  const { parseHandHistory } = await import('../src/lib/sandbox/HandHistoryParser.js');

  const hh = [
    "PokerStars Hand #99999: Hold'em No Limit (€0.50/€1.00 EUR) - 2026/11/24 12:00:00 ET",
    "Table 'Alpha' 6-max Seat #1 is the button",
    'Seat 1: Hero (€100.00 in chips)',
    'Seat 2: Villain (€120.00 in chips)',
    'Hero: posts small blind €0.50',
    'Villain: posts big blind €1.00',
    '*** HOLE CARDS ***',
    'Dealt to Hero [Ah Kd]',
    'Hero: raises €2.00 to €2.50',
    'Villain: calls €1.50',
    '*** FIRST FLOP *** [Ks 7h 2c]',
    'Villain: checks',
    'Hero: bets €3.00',
    'Villain: calls €3.00',
    '*** FIRST TURN *** [Jd]',
    'Villain: checks',
    'Hero: checks',
    '*** SUMMARY ***',
    'Seat 1: Hero (button) showed [Ah Kd] and won (€11.00)',
    'Seat 2: Villain (big blind) showed [Qs Js] and lost',
  ].join('\n');

  const parsed = parseHandHistory(hh);
  assert.equal(parsed.success, true);
  assert.equal(parsed.heroStack, 100);
  assert.equal(parsed.villains.length, 1, 'SUMMARY seat lines must not add phantom villains');
  assert.deepEqual(parsed.board.flop, ['Ks', '7h', '2c']);
  assert.equal(parsed.board.turn, 'Jd');
  const flopHero = parsed.actionHistory.find((a) => a.street === 'flop' && a.player === 'Hero');
  assert.equal(flopHero?.action, 'bet', 'Postflop bets must map to bet (never raise)');
});

test('Fortress [EquityEngine]: case-insensitive eval, dash ranges, suffix validation, and multiway cache key isolation', async () => {
  const { evaluateHand, expandRangeToCombos } = await import('../src/lib/sandbox/EquityEngine.js');

  assert.equal(
    evaluateHand(['ah', 'kd', 'qs', 'jc', 'th']),
    evaluateHand(['Ah', 'Kd', 'Qs', 'Jc', 'Th']),
    'Lowercase card codes must score identically to canonical case',
  );
  assert.ok(evaluateHand(['AH', 'KD', 'QS', 'JC', 'TH']) > 0, 'Uppercase card codes must not score 0');

  assert.equal(expandRangeToCombos('A5s-A2s').length, 16, 'A5s-A2s must expand all 4 suited hands (16 combos)');
  assert.equal(expandRangeToCombos('QQ-99').length, 24, 'QQ-99 must expand QQ/JJ/TT/99 (24 combos)');
  assert.equal(expandRangeToCombos('AKz').length, 0, 'Invalid suffix AKz must expand to 0 combos');
  assert.equal(expandRangeToCombos('AAs').length, 0, 'Impossible suited pair AAs must expand to 0 combos');

  const eqSrc = read('src/lib/sandbox/EquityEngine.js');
  const workerSrc = read('src/lib/sandbox/equityWorkerSource.js');
  assert.match(eqSrc, /asyncRunoutKey[\s\S]*Array\.isArray\(message\.range\.villains\)/, 'asyncRunoutKey must serialize multiway villain ranges');
  assert.match(eqSrc, /WORKER_JOB_TIMEOUT_MS[\s\S]{0,120}|recycleWorker\(\);[\s\S]{0,160}WORKER_JOB_TIMEOUT_MS/, 'Worker timeout must recycle wedged worker');
  assert.match(workerSrc, /function expandDash/, 'Generated equityWorkerSource.js must stay in sync with @equity-core fixes');
  assert.match(workerSrc, /c\[0\]\.toUpperCase\(\)/, 'Generated equityWorkerSource.js must include card-case normalization');
});

test('Fortress [nativeSolverImport & scenarioContract]: duplicate board cards, range bounds, prototype safety, all-in tracking', async () => {
  const { parseNativeSolverImport } = await import('../src/lib/sandbox/nativeSolverImport.mjs');
  const { validateAndNormalizeScenario } = await import('../src/lib/sandbox/scenarioContract.mjs');

  assert.throws(
    () => parseNativeSolverImport(JSON.stringify({
      board: { flop: ['Ah', 'Kd', '2c'], turn: 'Ah' },
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 10,
      effectiveStack: 100,
    })),
    /Duplicate Card/i,
    'Cross-street duplicate board card must throw',
  );

  assert.throws(
    () => parseNativeSolverImport(JSON.stringify({
      board: ['Ah', 'Kd', '2c'],
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 10,
      effectiveStack: 100,
      villainRange: 'AA,'.repeat(250),
    })),
    /500/,
    'Unbounded villainRange > 500 chars must be rejected',
  );

  const multiCsv = 'hero position,villain position,pot,effective stack,board\nBTN,BB,10,100,Ah Kd 2c\nCO,BB,12,80,Qs Js 4d';
  const csvResult = parseNativeSolverImport(multiCsv);
  assert.ok(csvResult.warnings.length > 0, 'Multi-row CSV must warn that only the first row was imported');

  assert.throws(
    () => validateAndNormalizeScenario({
      gameType: 'cash',
      heroHand: { card1: 'Ah', card2: 'Kd' },
      heroPosition: 'BTN',
      heroStack: 100,
      potSize: 6.5,
      board: { flop: [], turn: null, river: null },
      villains: [{ position: 'BB', stack: 100, range: 'AAs', archetype: { id: 'gto_neutral' } }],
      actionHistory: [],
    }),
    'Scenario validator must reject impossible pair suffix AAs',
  );

  // All-in player in 3-way pot must not be put back into pending on later raise
  const validated = validateAndNormalizeScenario({
    gameType: 'cash',
    heroHand: { card1: 'Ah', card2: 'Kd' },
    heroPosition: 'BTN',
    heroStack: 100,
    potSize: 10,
    board: { flop: ['Ks', '7h', '2c'], turn: 'Jd', river: null },
    villains: [
      { position: 'SB', stack: 20, range: '', archetype: { id: 'gto_neutral' } },
      { position: 'BB', stack: 100, range: '', archetype: { id: 'gto_neutral' } },
    ],
    actionHistory: [
      { street: 'flop', position: 'SB', action: 'allin' },
      { street: 'flop', position: 'BB', action: 'raise' },
      { street: 'flop', position: 'BTN', action: 'call' },
      { street: 'turn', position: 'BB', action: 'check' },
    ],
  });
  assert.equal(validated.board.turn, 'Jd', 'Betting round must close cleanly when SB is already all-in');
});

test('Fortress [weeklySpotCatalog]: week_default_1 action history has BB checking to Hero CO', async () => {
  const { curatedWeeklySpotById } = await import('../src/lib/personal-assistant/weeklySpotCatalog.js');
  const spot = curatedWeeklySpotById('week_default_1');
  assert.ok(spot);
  assert.equal(spot.scenario_json.heroPosition, 'CO');
  assert.equal(spot.scenario_json.actionHistory[0].position, 'BB');
  assert.equal(spot.scenario_json.actionHistory[0].action, 'check');
});

// ─── 5. Security, Privacy, Cache-Control & Routing Fortress ───────────────────

test('Fortress [data-controls privacy]: sanitizeExportHandRow strips non-showdown opponent hole cards', async () => {
  const { sanitizeExportHandRow } = await import('../src/lib/personal-assistant/dataLifecycle.mjs');

  const raw = {
    id: 'h-1',
    players: [
      { userId: 'hero-1', cards: ['Ah', 'Kd'], showed: false },
      { userId: 'vil-folded', cards: ['7c', '2d'], hole_cards: ['7c', '2d'], showed: false },
      { userId: 'vil-showdown', cards: ['Qs', 'Qh'], showed: true },
    ],
  };

  const clean = sanitizeExportHandRow(raw, 'hero-1');
  assert.deepEqual(clean.players[0].cards, ['Ah', 'Kd'], 'Owner cards preserved');
  assert.equal(clean.players[1].cards, undefined, 'Folded opponent cards MUST be stripped');
  assert.equal(clean.players[1].hole_cards, undefined, 'Folded opponent hole_cards MUST be stripped');
  assert.deepEqual(clean.players[2].cards, ['Qs', 'Qh'], 'Showdown opponent cards preserved');
});

test('Fortress [Sandbox router & retired endpoints]: Map dispatcher blocks prototype keys & create-share retires POST/PATCH with 410', () => {
  const routerSrc = read('pages/api/sandbox/[...path].js');
  assert.match(routerSrc, /const ROUTES = new Map\(/, 'Sandbox router must use Map (not plain object) to block prototype keys like constructor/__proto__/toString');
  assert.match(routerSrc, /const fn = ROUTES\.get\(route\)/, 'Sandbox router must look up routes via ROUTES.get');
  assert.match(routerSrc, /res\.setHeader\(['"]Cache-Control['"],\s*['"]private, no-store, max-age=0['"]\)/);
  assert.match(routerSrc, /res\.setHeader\(['"]Vary['"],\s*['"]Authorization['"]\)/);

  const shareSrc = read('pages/api/sandbox/_routes/create-share.js');
  assert.match(shareSrc, /SANDBOX_SHARING_RETIRED/, 'POST/PATCH /api/sandbox/create-share must return SANDBOX_SHARING_RETIRED');
  assert.match(shareSrc, /status\(410\)/, 'POST/PATCH /api/sandbox/create-share must return 410 Gone');
  assert.doesNotMatch(shareSrc, /NEXT_PUBLIC_SUPABASE_ANON_KEY/, 'create-share must fail closed without service role key');
});

test('Fortress [API security & headers]: all PA/Sandbox private APIs enforce no-store, Vary: Authorization, and ownership/fail-closed invariants', () => {
  const privateRoutes = [
    'pages/api/assistant/stats.js',
    'pages/api/assistant/coaching.js',
    'pages/api/assistant/data-controls.js',
    'pages/api/assistant/leaks/index.js',
    'pages/api/assistant/leaks/detect.js',
    'pages/api/assistant/leaks/examples.js',
    'pages/api/assistant/leaks/review.js',
    'pages/api/assistant/leaks/audit-jobs.js',
    'pages/api/assistant/sandbox/analyze.js',
    'pages/api/assistant/sandbox/sandbox-quiz.js',
    'pages/api/assistant/sandbox/sandbox-analytics.js',
    'pages/api/assistant/sandbox/sandbox-templates.js',
    'pages/api/sandbox/[...path].js',
    'pages/api/sandbox/_routes/equity-snapshot.js',
  ];

  for (const route of privateRoutes) {
    const src = read(route);
    assert.match(src, /private,\s*no-store/i, `${route} must set Cache-Control: private, no-store`);
    assert.match(src, /Vary['"],\s*['"]Authorization/i, `${route} must set Vary: Authorization`);
  }

  // equity-snapshot must verify session ownership before insert
  const eqSnap = read('pages/api/sandbox/_routes/equity-snapshot.js');
  assert.match(eqSnap, /from\(['"]sandbox_sessions['"]\)[\s\S]*\.eq\(['"]user_id['"],\s*userId\)/);
  assert.doesNotMatch(eqSnap, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

  // coaching.js must fail closed without service role key
  const coaching = read('pages/api/assistant/coaching.js');
  assert.doesNotMatch(coaching, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);

  // data-controls.js must preserve last_retention_run_at and guard export size before receipt
  const dataControls = read('pages/api/assistant/data-controls.js');
  assert.match(dataControls, /last_retention_run_at:\s*current\.data\?\.last_retention_run_at\s*\?\?\s*null/);
  assert.ok(
    dataControls.indexOf('Buffer.byteLength(serialized') < dataControls.indexOf("from('pa_data_lifecycle_receipts').insert"),
    'data-controls.js must check export byte size BEFORE inserting receipt',
  );

  // weekly-spot.js and archetypes.js must never CDN-cache fallback errors
  const weeklySpot = read('pages/api/assistant/sandbox/weekly-spot.js');
  assert.match(weeklySpot, /no-store/);
  const archetypes = read('pages/api/assistant/archetypes.js');
  assert.match(archetypes, /no-store/);
  assert.ok(
    archetypes.indexOf("Cache-Control', 'no-store'") < archetypes.indexOf('public, s-maxage=3600'),
    'archetypes.js must set no-store on fallback and only set s-maxage on healthy DB reads',
  );

  // sandbox-quiz.js must deduplicate repeated answers per (user_id, scenario_hash)
  const quiz = read('pages/api/assistant/sandbox/sandbox-quiz.js');
  assert.match(quiz, /alreadyAnswered:\s*true/);

  // save-hand.js DELETE must select deleted rows and return 404 when nothing matched
  const saveHand = read('pages/api/sandbox/_routes/save-hand.js');
  assert.match(saveHand, /\.delete\(\)[\s\S]{0,120}\.select\(['"]id['"]\)/);
  assert.match(saveHand, /status\(404\)\.json\(\{\s*success:\s*false,\s*error:\s*['"]Saved hand not found['"]/);
});

test('Fortress [Recursive Directory-Wide API Law]: zero anon fallbacks, zero hardcoded URLs, 405-before-rateLimit, private no-store, and 503 auth propagation across ALL PA/Sandbox routes', () => {
  const walkJs = (dir, out = []) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return out;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walkJs(rel, out);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(rel);
    }
    return out;
  };

  const allRoutes = [
    ...walkJs('pages/api/assistant'),
    ...walkJs('pages/api/sandbox'),
    ...walkJs('app/api/assistant'),
  ].sort();

  assert.ok(allRoutes.length >= 28, `Expected >= 28 PA/Sandbox routes, discovered ${allRoutes.length}`);

  const PUBLIC_EDGE_ROUTES = new Set([
    'pages/api/assistant/archetypes.js',
    'pages/api/assistant/sandbox/weekly-spot.js',
  ]);
  const CRON_AUTH_FIRST_ROUTES = new Set([
    'pages/api/assistant/retention-maintenance.js',
  ]);

  for (const rel of allRoutes) {
    const src = read(rel);

    // Law 1: Zero silent anon-key fallbacks or hardcoded Supabase URLs anywhere
    assert.doesNotMatch(
      src,
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
      `${rel} must never silently fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    );
    assert.doesNotMatch(
      src,
      /kuklfnapbkmacvwxktbh\.supabase\.co/,
      `${rel} must never hardcode a Supabase project URL`,
    );

    // Law 2: Every non-public route directly under pages/api/assistant/** (and sandbox dispatcher) sets private no-store + Vary: Authorization
    if (rel.startsWith('pages/api/assistant/') && !PUBLIC_EDGE_ROUTES.has(rel) && rel !== 'pages/api/assistant/setup-database.js') {
      assert.match(src, /private,\s*no-store/i, `${rel} must set Cache-Control: private, no-store`);
      assert.match(src, /Vary['"],\s*['"]Authorization/i, `${rel} must set Vary: Authorization`);
    }

    // Law 3: Every handler with both req.method check and applyRateLimit checks method BEFORE burning rate-limit budget
    if (!CRON_AUTH_FIRST_ROUTES.has(rel) && src.includes('export default') && src.includes('applyRateLimit')) {
      const handlerBody = src.slice(src.indexOf('export default'));
      const methodIdx = handlerBody.search(/req\.method\b|const method = req\.method/);
      const rateIdx = handlerBody.search(/applyRateLimit\s*\(/);
      if (methodIdx !== -1 && rateIdx !== -1) {
        assert.ok(
          methodIdx < rateIdx,
          `${rel} must validate req.method BEFORE calling applyRateLimit so invalid-method probes cannot exhaust rate-limit quotas`,
        );
      }
    }

    // Law 4: Every route calling getServerUserWithFallback propagates 503 auth outages
    if (src.includes('getServerUserWithFallback(')) {
      assert.match(
        src,
        /503/,
        `${rel} calls getServerUserWithFallback and must propagate 503 auth outages instead of collapsing to 401/guest`,
      );
    }
  }
});

test('Fortress [UTC Week Boundaries]: leaderboards use UTC Monday boundaries across weekdays, Sundays, and DST transitions', async () => {
  const { utcMondayStartIso } = await import('../src/lib/personal-assistant/utcWeekWindow.mjs');

  assert.equal(utcMondayStartIso(new Date('2026-11-23T00:00:00Z')), '2026-11-23T00:00:00.000Z');
  assert.equal(utcMondayStartIso(new Date('2026-11-24T20:15:00Z')), '2026-11-23T00:00:00.000Z');
  assert.equal(utcMondayStartIso(new Date('2026-11-29T23:59:59Z')), '2026-11-23T00:00:00.000Z');
  assert.equal(utcMondayStartIso(new Date('2026-11-01T06:30:00Z')), '2026-10-26T00:00:00.000Z');
  assert.equal(utcMondayStartIso('not-a-date'), null);

  for (const rel of ['pages/api/sandbox/_routes/leaderboard.js', 'pages/api/sandbox/_routes/quiz-leaderboard.js']) {
    const src = read(rel);
    assert.match(src, /utcMondayStartIso/, `${rel} must use utcMondayStartIso`);
    assert.doesNotMatch(src, /\.getDay\(\)|\.setHours\(/, `${rel} must never use local-timezone getDay()/setHours()`);
  }
});

test('Fortress [Routing, AEO & UI Wiring]: zero dead /hub/sandbox or /hub/jarvis routes, fresh auth tokens, and clean PA UI', () => {
  const nextCfg = read('next.config.js');
  assert.match(nextCfg, /source:\s*['"]\/hub\/jarvis['"][\s\S]*destination:\s*['"]\/hub\/personal-assistant\/leaks['"]/);
  assert.match(nextCfg, /source:\s*['"]\/hub\/sandbox['"][\s\S]*destination:\s*['"]\/hub\/personal-assistant\/sandbox['"]/);

  const md = read('src/lib/seo/markdownIngestion.mjs');
  assert.equal(md.includes('https://smarter.poker/hub/sandbox)'), false, 'markdownIngestion must never publish dead 404 /hub/sandbox URL');

  const paIndex = read('pages/hub/personal-assistant/index.js');
  assert.match(paIndex, /title:\s*['"]Play['"][\s\S]*title:\s*['"]Diagnose['"][\s\S]*title:\s*['"]Train['"]/);
  assert.match(paIndex, /window\.location\.assign/);
  const useAssistantSrc = read('src/hooks/useAssistant.js');
  assert.match(useAssistantSrc, /pa-data-updated/);

  const sandboxPage = read('pages/hub/personal-assistant/sandbox.js');
  assert.doesNotMatch(sandboxPage, /useStudyDeck|useAvatar|assistantAuth/);
  assert.match(sandboxPage, /verified-evidence-required/);

  const leaksPage = read('pages/hub/personal-assistant/leaks.js');
  assert.match(leaksPage, /pa-auto-detect-last:\$\{userId\}/);
  assert.match(leaksPage, /deepLinkedTargetRef/);
  assert.match(leaksPage, /Audit This Hand/);

  const paKit = read('src/components/sandbox/paKit.jsx');
  assert.equal(paKit.includes('Jarvis // Module Active'), false);
  assert.match(paKit, /\/hub\/personal-assistant\/leaks/);

  const drill = read('src/components/sandbox/QuickSpotDrill.jsx');
  assert.match(drill, /reviewAbortRef/);
  assert.match(drill, /Practice Mode Progress Is Local/);
});
