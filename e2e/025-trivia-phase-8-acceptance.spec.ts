import { expect, test, type Page, type Route } from '@playwright/test';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000022';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMjIiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQxMDI0NDQ4MDB9.phase8acceptance';
const AUTH_USER = {
  id: ACCOUNT_ID,
  email: 'trivia-phase8@example.test',
  role: 'authenticated',
  aud: 'authenticated',
  user_metadata: { poker_alias: 'Phase Eight' },
};

const MODES = [
  {
    mode: 'daily',
    path: '/hub/trivia/daily',
    description: 'Fresh Daily',
  },
  {
    mode: 'mtt',
    path: '/hub/trivia/mtt',
    description: 'Read The Blind Level, Stack Pressure, Position And Payout Stage Before You Commit To A Tournament Line.',
  },
  {
    mode: 'cash',
    path: '/hub/trivia/cash',
    description: 'Work Through Real Cash-Table Decisions With Stakes, Effective Stack, Position, Street And Pot Context In View.',
  },
  {
    mode: 'icm',
    path: '/hub/trivia/icm',
    description: 'Separate Chips Gained From Payout Equity Gained, Then Choose The Line That Fits The Actual Tournament Pressure.',
  },
  {
    mode: 'gto',
    path: '/hub/trivia/gto',
    description: 'Lock Your Decision First, Then Read The Server-Released Frequency Mix, Range Distribution And EV Without Invented Solver Numbers.',
  },
] as const;

type TriviaMode = (typeof MODES)[number]['mode'];

const IDS: Record<TriviaMode, { session: string; question: string; score: string; entry: string; reward: string }> = {
  daily: {
    session: '10000000-0000-4000-8000-000000000001',
    question: '11000000-0000-4000-8000-000000000001',
    score: '21000000-0000-4000-8000-000000000001',
    entry: '31000000-0000-4000-8000-000000000001',
    reward: '32000000-0000-4000-8000-000000000001',
  },
  mtt: {
    session: '10000000-0000-4000-8000-000000000002',
    question: '11000000-0000-4000-8000-000000000002',
    score: '21000000-0000-4000-8000-000000000002',
    entry: '31000000-0000-4000-8000-000000000002',
    reward: '32000000-0000-4000-8000-000000000002',
  },
  cash: {
    session: '10000000-0000-4000-8000-000000000003',
    question: '11000000-0000-4000-8000-000000000003',
    score: '21000000-0000-4000-8000-000000000003',
    entry: '31000000-0000-4000-8000-000000000003',
    reward: '32000000-0000-4000-8000-000000000003',
  },
  icm: {
    session: '10000000-0000-4000-8000-000000000004',
    question: '11000000-0000-4000-8000-000000000004',
    score: '21000000-0000-4000-8000-000000000004',
    entry: '31000000-0000-4000-8000-000000000004',
    reward: '32000000-0000-4000-8000-000000000004',
  },
  gto: {
    session: '10000000-0000-4000-8000-000000000005',
    question: '11000000-0000-4000-8000-000000000005',
    score: '21000000-0000-4000-8000-000000000005',
    entry: '31000000-0000-4000-8000-000000000005',
    reward: '32000000-0000-4000-8000-000000000005',
  },
};

type FixtureState = {
  startBodies: Array<Record<string, unknown>>;
  answerAttempts: Record<TriviaMode, number>;
  submitAttempts: Record<TriviaMode, number>;
  unexpectedValueMoves: string[];
  settledModes: Set<TriviaMode>;
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function modeForSession(sessionId: unknown): TriviaMode {
  const found = MODES.find(({ mode }) => IDS[mode].session === sessionId)?.mode;
  if (!found) throw new Error(`Fixture received unknown session: ${String(sessionId)}`);
  return found;
}

function questionFor(mode: TriviaMode) {
  const pressure = mode === 'cash'
    ? 'At a deep-stacked high-limit cash table'
    : 'At the final table with a meaningful pay jump and money-bubble pressure';
  return {
    id: IDS[mode].question,
    question: `${pressure}, you are on the BTN against the BB with As Kh on a 9s 7d 2c flop, 22.5BB effective and an 18BB pot. Which line best protects the full range while preserving the long-run decision quality across this unusually detailed situation?`,
    options: [
      'Bet 50% Pot With A Balanced Value And Bluff Range While Preserving Enough Strong Checks For Later Streets',
      'Check The Entire Range And Never Reopen The Betting Lead On Any Turn Card',
      'Bet 25% Pot With Every Combination Regardless Of Blockers, Position, Stack Depth, Or Payout Pressure',
      'Move All-In Immediately Because A Long Description Must Always Imply Maximum Aggression',
    ],
    category: mode === 'icm' ? 'icm_chip_ev' : mode === 'cash' ? 'cash_game_situations' : mode === 'gto' ? 'gto_scenarios' : 'mtt_situations',
    difficulty: 'medium',
    context: {
      heroPosition: 'BTN',
      villainPosition: 'BB',
      stackDepthBb: mode === 'cash' ? 100 : 22.5,
      street: 'flop',
      gameType: mode === 'cash' ? 'High-Limit Cash' : 'No-Limit Holdem Tournament',
      heroHand: ['As', 'Kh'],
      board: ['9s', '7d', '2c'],
      potBb: 18,
      stakes: '$5/$10',
      blinds: '1,000/2,000/2,000',
      payoutStage: 'Final Table Pay Jump',
      evModel: mode === 'icm' ? 'Money EV / ICM' : 'Chip EV',
    },
  };
}

function solverMetadata() {
  return {
    gto_frequencies: { b50: 0.6, c: 0.3, f: 0.1 },
    evData: {
      contract: 'trivia-solver-ev/1',
      value: 1.25,
      unit: 'bb',
      source: 'solved_spots_gold.strategy_matrix_v2.hand_evs_bb',
      aggregation: 'live_combo_class_mean',
      provenance: {
        authority: 'training_solver_provenance_authority',
        catalog: 'training_solver_artifact_catalog',
        artifact_id: '50000000-0000-4000-8000-000000000005',
        scenario_hash: 'cash_flop_btn_bb_as_kh_fixture',
        solver: 'PioSOLVER',
        solver_version: 'PioSOLVER Pro 3.8.0',
        solver_binary_checksum: 'a'.repeat(64),
        pipeline_commit: 'b'.repeat(40),
        manifest_version: 'solver-manifest-v1',
        manifest_checksum: 'c'.repeat(64),
        source_artifact_checksum: 'd'.repeat(64),
        source_combo_order_sha256: 'e'.repeat(64),
        training_game_contracts_sha256: 'f'.repeat(64),
        audited_at: '2026-10-05T17:00:00.000Z',
      },
    },
  };
}

function settlementFor(mode: TriviaMode, requestId: unknown) {
  const ids = IDS[mode];
  const postedAt = '2026-10-05T17:30:00.000Z';
  const entry = {
    id: ids.entry,
    role: 'entry',
    referenceId: `trivia_entry_${ids.session}`,
    amount: -10,
    kind: 'trivia_entry',
    balanceAfter: 490,
    createdAt: postedAt,
  };
  const reward = {
    id: ids.reward,
    role: 'reward',
    referenceId: `trivia_session_${ids.session}`,
    amount: 5,
    kind: 'trivia_run',
    balanceAfter: mode === 'daily' ? 505 : 495,
    createdAt: postedAt,
  };
  const bonus = {
    id: '33000000-0000-4000-8000-000000000001',
    role: 'daily_bonus',
    referenceId: `trivia_daily_bonus_${ids.session}`,
    amount: 10,
    kind: 'trivia_daily_bonus',
    balanceAfter: 515,
    createdAt: postedAt,
  };
  return {
    success: true,
    sessionId: ids.session,
    correct: 1,
    total: 1,
    score: 100,
    diamondsAwarded: 5,
    dailyBonusAwarded: mode === 'daily' ? 10 : 0,
    newBalance: mode === 'daily' ? 515 : 495,
    replayed: false,
    voided: 0,
    scoreId: ids.score,
    perQuestion: [{
      questionId: ids.question,
      wasCorrect: true,
      correctDisplayIndex: 0,
      storedDisplayIndex: 0,
      outcome: 'correct',
    }],
    receipt: {
      sessionId: ids.session,
      scoreId: ids.score,
      settlementReference: `fixture-settlement-${mode}`,
      requestId: typeof requestId === 'string' ? requestId : '40000000-0000-4000-8000-000000000001',
      resultHash: '1'.repeat(64),
      submittedAt: postedAt,
      transactions: mode === 'daily' ? [reward, bonus] : [entry, reward],
    },
  };
}

async function installAuth(page: Page, recoverMode?: TriviaMode) {
  await page.addInitScript(({ token, user, accountId, recovery }) => {
    localStorage.clear();
    localStorage.setItem('smarter-poker-auth', JSON.stringify({
      access_token: token,
      refresh_token: 'phase-8-acceptance-refresh',
      expires_at: 4102444800,
      expires_in: 2147483647,
      token_type: 'bearer',
      user,
    }));
    localStorage.setItem('smarter_poker_auth_migration', 'v6_2026_01_21_explicit_storage_key');
    localStorage.setItem(`sp-welcome-shown-${accountId}`, 'true');
    if (recovery) {
      localStorage.setItem(
        `sp.trivia.solo-recovery.v1:${encodeURIComponent(accountId)}:${encodeURIComponent(recovery.mode)}`,
        JSON.stringify({
          version: 1,
          mode: recovery.mode,
          accountId,
          sessionId: recovery.sessionId,
          phase: 'active',
          createdAt: Date.now(),
          expiresAt: '2099-01-01T00:00:00.000Z',
          settlementRequestId: null,
        }),
      );
    }
  }, {
    token: AUTH_TOKEN,
    user: AUTH_USER,
    accountId: ACCOUNT_ID,
    recovery: recoverMode ? { mode: recoverMode, sessionId: IDS[recoverMode].session } : null,
  });
}

async function installNetworkFixtures(page: Page): Promise<FixtureState> {
  const state: FixtureState = {
    startBodies: [],
    answerAttempts: { daily: 0, mtt: 0, cash: 0, icm: 0, gto: 0 },
    submitAttempts: { daily: 0, mtt: 0, cash: 0, icm: 0, gto: 0 },
    unexpectedValueMoves: [],
    settledModes: new Set(),
  };

  // The signed-in shell owns profile and Daily leaderboard Realtime channels.
  // Mock the socket itself so this acceptance test cannot reach a deployed
  // Supabase project even when its local candidate carries production URLs.
  await page.routeWebSocket('**/realtime/v1/**', (socket) => {
    socket.close({ code: 1000, reason: 'deterministic_trivia_fixture' });
  });
  await page.route('https://us.i.posthog.com/**', (route) => route.fulfill({ status: 204, body: '' }));

  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/user')) {
      return request.headers().authorization === `Bearer ${AUTH_TOKEN}`
        ? json(route, AUTH_USER)
        : json(route, { message: 'fixture_signed_out' }, 401);
    }
    return json(route, { user: AUTH_USER, session: null });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const wantsObject = (request.headers().accept || '').includes('application/vnd.pgrst.object+json');

    // Every browser-owned persistence path is forbidden in this fixture.
    // The one POST allowlist entry is a read-only own-profile RPC.
    if (!['GET', 'HEAD'].includes(request.method()) && !pathname.endsWith('/rpc/get_my_full_profile')) {
      state.unexpectedValueMoves.push(`REST ${request.method()} ${pathname}`);
      return json(route, { message: 'fixture_refused_unexpected_rest_mutation' }, 500);
    }

    if (pathname.endsWith('/rpc/get_my_full_profile')) {
      return json(route, [{
        id: ACCOUNT_ID,
        username: 'phase_eight',
        full_name: 'Phase Eight',
        diamonds: 500,
        is_vip: false,
        vip_expires_at: null,
      }]);
    }
    if (pathname.endsWith('/trivia_streaks')) {
      if (wantsObject) {
        return json(route, { current_streak: 2, best_streak: 5, last_play_date: '2026-10-04' });
      }
      return json(route, []);
    }
    if (pathname.endsWith('/daily_trivia_plays')) {
      return json(route, state.settledModes.has('daily') ? [{ id: 'fixture-daily-play' }] : []);
    }
    if (pathname.endsWith('/profiles') && wantsObject) {
      return json(route, { id: ACCOUNT_ID, username: 'phase_eight', diamonds: 500, is_vip: false });
    }
    return json(route, wantsObject ? null : []);
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === '/api/diamonds/spend' || pathname === '/api/rewards/claim') {
      state.unexpectedValueMoves.push(pathname);
      return json(route, { success: false, error: 'fixture_refused_unexpected_value_move' }, 500);
    }
    if (pathname === '/api/auth/ensure-profile') {
      return json(route, {
        created: false,
        isBrandNew: false,
        profile: { id: ACCOUNT_ID, username: 'phase_eight', diamonds: 500, is_vip: false },
      });
    }
    if (pathname === '/api/vip/check-status') return json(route, { success: true, isVip: false });
    if (pathname === '/api/user/get-header-stats') {
      return json(route, {
        success: true,
        profile: {
          id: ACCOUNT_ID,
          username: 'phase_eight',
          full_name: 'Phase Eight',
          diamonds: 500,
          is_vip: false,
          is_admin: false,
          avatar_url: null,
          arena_avatar_url: null,
          use_avatar_as_profile_pic: false,
        },
        unread_notifications: 0,
        unread_messages: 0,
      });
    }
    if (pathname === '/api/trivia/session-start') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const mode = body.mode as TriviaMode;
      if (!MODES.some((candidate) => candidate.mode === mode)) {
        return json(route, { success: false, error: 'fixture_mode_not_supported' }, 400);
      }
      state.startBodies.push(body);
      const resumed = body.startNonce === IDS[mode].session;
      return json(route, {
        success: true,
        sessionId: IDS[mode].session,
        mode,
        questions: [questionFor(mode)],
        entryCost: mode === 'daily' ? 0 : 10,
        entryState: mode === 'daily' ? 'free' : 'charged',
        newBalance: mode === 'daily' ? 500 : 490,
        resumed,
        expiresAt: '2099-01-01T00:00:00.000Z',
        contract: { timer: { kind: 'untimed' } },
        contractSignature: `fixture-contract-${mode}`,
      });
    }
    if (pathname === '/api/trivia/session-answer') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const mode = modeForSession(body.sessionId);
      state.answerAttempts[mode] += 1;
      if (mode === 'cash' && state.answerAttempts.cash === 1) {
        return json(route, { success: false, error: 'fixture_answer_transport_lost' }, 503);
      }
      return json(route, {
        success: true,
        sessionId: IDS[mode].session,
        questionId: IDS[mode].question,
        wasCorrect: true,
        correctDisplayIndex: 0,
        storedDisplayIndex: 0,
        fresh: state.answerAttempts[mode] === 1,
        outcome: 'correct',
        explanation: 'The authoritative explanation is intentionally long enough to prove that reveal copy wraps safely without forcing horizontal scrolling on a narrow phone.',
        ...(mode === 'gto' ? { solverMetadata: solverMetadata() } : {}),
      });
    }
    if (pathname === '/api/trivia/session-submit') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const mode = modeForSession(body.sessionId);
      state.submitAttempts[mode] += 1;
      if (mode === 'icm' && state.submitAttempts.icm === 1) {
        return json(route, { success: false, error: 'fixture_settlement_transport_lost' }, 503);
      }
      state.settledModes.add(mode);
      return json(route, settlementFor(mode, body.requestId));
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      state.unexpectedValueMoves.push(`API ${request.method()} ${pathname}`);
      return json(route, { success: false, error: 'fixture_refused_unexpected_api_mutation' }, 500);
    }
    return json(route, { success: true, data: [] });
  });

  return state;
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    main: document.querySelector('main')?.scrollWidth || 0,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
  if (widths.main > 0) expect(widths.main).toBeLessThanOrEqual(widths.viewport + 1);
}

async function expectReducedMotion(page: Page, selector: string) {
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const durations = await page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    const toSeconds = (value: string) => value.split(',').map((part) => {
      const clean = part.trim();
      if (clean.endsWith('ms')) return Number.parseFloat(clean) / 1000;
      return Number.parseFloat(clean) || 0;
    });
    return [...toSeconds(style.animationDuration), ...toSeconds(style.transitionDuration)];
  });
  expect(Math.max(...durations)).toBeLessThanOrEqual(0.00002);
}

async function expectEntranceComposition(page: Page, mode: TriviaMode, mobile: boolean) {
  const art = page.locator(`[data-art="${mode}"]`);
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('data-art-state', 'ready');
  const image = art.locator('img');
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  const source = await image.evaluate((node: HTMLImageElement) => node.currentSrc || node.src);
  expect(source).toContain(`/images/trivia/intro-v2/${mode}-`);
  expect(source).toContain(mobile ? '-mobile-' : '-wide-');

  const description = mode === 'daily'
    ? page.getByText('Fresh Daily', { exact: true })
    : page.locator('.strategy-description');
  await expect(description).toBeVisible();

  const boxes = await Promise.all([art.boundingBox(), description.boundingBox()]);
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).not.toBeNull();
  if (mobile) {
    expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(boxes[1]!.y + 2);
  } else {
    expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x + 2);
  }

  await expectReducedMotion(page, mode === 'daily' ? '[data-daily-attempt] [data-art]' : '.strategy-description');
  await expectNoHorizontalOverflow(page);
}

test.use({
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
  locale: 'en-US',
  timezoneId: 'America/Chicago',
});

test.describe('25. Trivia Phase 8 Deterministic Acceptance', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('all five signed-out entrances keep unique art, mobile stacking, and a separate desktop composition', async ({ page }, testInfo) => {
    const fixture = await installNetworkFixtures(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const mobile = testInfo.project.name.includes('mobile');
    const seenModes = new Set<TriviaMode>();
    const viewportWidths = mobile ? [320, 375, 390, 430] : [page.viewportSize()?.width || 1280];

    for (const route of MODES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const primary = page.getByRole('button', { name: 'Sign In To Play', exact: true });
      await expect(primary).toBeVisible();
      await expect(page.locator(route.mode === 'daily' ? '[data-daily-attempt="signed-out"]' : `[data-strategy-mode="${route.mode}"][data-game-state="lobby"]`)).toBeVisible();
      await expect(page.getByText(route.description, { exact: true }).first()).toBeVisible();
      for (const width of viewportWidths) {
        if (mobile) await page.setViewportSize({ width, height: 900 });
        await expectEntranceComposition(page, route.mode, mobile);
      }
      seenModes.add(route.mode);
    }

    expect(seenModes).toEqual(new Set<TriviaMode>(['daily', 'mtt', 'cash', 'icm', 'gto']));
    expect(fixture.startBodies).toEqual([]);
    expect(fixture.unexpectedValueMoves).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('fixture-owned runs cover start, long play, reveal, retries, settlement, and receipts without live value movement', async ({ page }) => {
    await installAuth(page);
    const fixture = await installNetworkFixtures(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    for (const route of MODES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const start = page.getByRole('button', { name: route.mode === 'daily' ? 'Start Daily' : 'Start Challenge', exact: true });
      await expect(start).toBeVisible();
      await expect(start).toBeEnabled();
      await start.click();

      const question = page.locator('.question-text');
      await expect(question).toContainText('Which Line Best Protects The Full Range', { ignoreCase: true });
      const answers = page.locator('[data-trivia-answer]');
      await expect(answers).toHaveCount(4);
      for (const answer of await answers.all()) {
        const box = await answer.boundingBox();
        expect(box?.height || 0).toBeGreaterThanOrEqual(44);
      }
      await expectNoHorizontalOverflow(page);
      await answers.first().click();

      if (route.mode === 'cash') {
        await expect(page.locator('.strategy-answer-retry[role="alert"]')).toContainText('Answer Result Was Not Confirmed');
        await page.getByRole('button', { name: 'Retry Same Answer', exact: true }).click();
      }

      if (route.mode === 'daily') {
        await expect(answers.first()).toHaveAttribute('data-correct', 'true');
      } else {
        await expect(page.locator('.answer-verdict')).toHaveText('Correct');
      }
      if (route.mode === 'gto') {
        await expect(page.getByRole('heading', { name: 'Jarvis Solver Analysis' })).toBeVisible();
        await expect(page.getByText('Preferred Line Frequency', { exact: true })).toBeVisible();
        await expect(page.getByText('Expected Value', { exact: true })).toBeVisible();
        await expect(page.getByText('EV Evidence', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /Range And Frequency Mix/ })).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
      await page.getByRole('button', { name: 'See Results', exact: true }).click();

      if (route.mode === 'icm') {
        await expect(page.getByText('Settlement Pending', { exact: true })).toBeVisible();
        await expect(page.locator('.results .strategy-alert[role="alert"]')).toContainText('Settlement Receipt Is Still Pending');
        await page.getByRole('button', { name: 'Retry Settlement', exact: true }).click();
      }

      if (route.mode === 'daily') {
        await expect(page.getByRole('heading', { name: 'Settlement Receipt' })).toBeVisible();
        await expect(page.getByRole('list', { name: 'Verified Diamond Transactions' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Challenge Complete!' })).toBeVisible();
        await expect(page.getByText('Settlement Reference', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Diamond Transaction Record' })).toBeVisible();
      }
      await expect(page.getByText(`fixture-settlement-${route.mode}`, { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const startsForMode = fixture.startBodies.filter((body) => body.mode === route.mode);
      expect(startsForMode).toHaveLength(1);
    }

    expect(fixture.answerAttempts.cash).toBe(2);
    expect(fixture.submitAttempts.icm).toBe(2);
    expect(fixture.unexpectedValueMoves).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('an active MTT recovery resumes the same run identity without a second entry request', async ({ page }) => {
    await installAuth(page, 'mtt');
    const fixture = await installNetworkFixtures(page);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/hub/trivia/mtt', { waitUntil: 'domcontentloaded' });
    const resume = page.getByRole('button', { name: 'Resume Run', exact: true });
    await expect(resume).toBeVisible();
    await resume.click();
    await expect(page.getByText('Run Resumed At Question 1 Of 1. Previously Locked Answers Stay Binding.', { exact: true })).toBeVisible();
    await expect(page.locator('.question-text')).toBeVisible();

    expect(fixture.startBodies).toHaveLength(1);
    expect(fixture.startBodies[0]).toMatchObject({
      mode: 'mtt',
      startNonce: IDS.mtt.session,
    });
    expect(fixture.unexpectedValueMoves).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
