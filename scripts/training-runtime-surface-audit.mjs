import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRAINING_RUNTIME_AUDIT_CONTRACT,
  acquireCheckpointLock,
  assertDiskHeadroom,
  assertDistinctArtifactPaths,
  assertSupportedNodeVersion,
  buildExpectedBatchMap,
  createCheckpoint,
  loadOrCreateCheckpoint,
  normalizeFailedBatch,
  removeCheckpointAfterSuccessfulRun,
  sha256,
  validateCompleteSuccessfulRun,
  validateFeedbackChecks,
  validateSuccessfulBatch,
  writeCheckpointAtomic,
} from './lib/training-runtime-checkpoint.mjs';
import { parseStrictInteger } from './lib/training-runtime-supervisor.mjs';

const AUDIT_FILE_PATH = fileURLToPath(import.meta.url);
const ROOT = join(dirname(AUDIT_FILE_PATH), '..');
const BASE_URL = String(
  process.env.TRAINING_AUDIT_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000'
).replace(/\/$/, '');
const CONCURRENCY = parseStrictInteger(process.env.TRAINING_AUDIT_CONCURRENCY, {
  name: 'runtime audit concurrency',
  fallback: 2,
  minimum: 1,
  maximum: 8,
});
const BATCH_SIZE = Math.max(CONCURRENCY, parseStrictInteger(
  process.env.TRAINING_AUDIT_BATCH_SIZE,
  {
    name: 'runtime audit batch size',
    fallback: 8,
    minimum: 1,
    maximum: 107,
  },
));
const LIFECYCLE_AUDIT = process.env.TRAINING_AUDIT_LIFECYCLE === '1';
const QUESTIONS_PER_SESSION = parseStrictInteger(
  process.env.TRAINING_AUDIT_QUESTIONS_PER_SESSION,
  {
    name: 'runtime audit questions per session',
    fallback: 20,
    minimum: 20,
    maximum: 100,
  },
);
const REQUIRE_FULL = process.env.TRAINING_AUDIT_REQUIRE_FULL === '1';
const AUTH_STATE = process.env.TRAINING_AUDIT_AUTH_STATE
  ? String(process.env.TRAINING_AUDIT_AUTH_STATE)
  : join(ROOT, 'playwright/.auth/user.json');
const OUTPUT_PATH = String(process.env.TRAINING_AUDIT_OUTPUT || '').trim();
const CHECKPOINT_PATH = String(
  process.env.TRAINING_AUDIT_CHECKPOINT
  || (OUTPUT_PATH ? `${OUTPUT_PATH}.checkpoint.json` : '')
).trim();
const EXPECTED_BUILD = String(process.env.TRAINING_AUDIT_EXPECTED_BUILD || '').trim();
const auditStartedAt = new Date();
assertSupportedNodeVersion();
assertDistinctArtifactPaths(OUTPUT_PATH, CHECKPOINT_PATH);
const { chromium } = await import('playwright');
const require = createRequire(import.meta.url);
const storedAuth = JSON.parse(readFileSync(AUTH_STATE, 'utf8'));
const authLocalStorage = storedAuth.origins.find((origin) => (
  new URL(origin.origin).hostname === new URL(BASE_URL).hostname
))?.localStorage || storedAuth.origins[0]?.localStorage || [];
const storedAuthSession = JSON.parse(
  authLocalStorage.find((item) => item.name === 'smarter-poker-auth')?.value || 'null'
);
assert.ok(storedAuthSession?.user?.id, 'runtime audit requires an authenticated test-user storage state');
const catalogSource = readFileSync(join(ROOT, 'src/data/TRAINING_LIBRARY.js'), 'utf8');
const catalogBlock = catalogSource.match(/export const TRAINING_LIBRARY = \[([\s\S]*?)\n\];/)?.[1] || '';
const catalogGames = [...catalogBlock.matchAll(
  /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*focus:\s*'([^']+)',\s*category:\s*'([^']+)'/g
)].map((match) => ({ id: match[1], name: match[2], focus: match[3], category: match[4] }));

assert.equal(catalogGames.length, 107, 'runtime audit must load the complete 107-game catalog');
assert.equal(
  new Set(catalogGames.map((game) => game.id)).size,
  catalogGames.length,
  'runtime audit catalog contains duplicate game ids',
);
const gamePattern = String(process.env.TRAINING_AUDIT_GAME_PATTERN || '').trim();
const games = gamePattern
  ? catalogGames.filter((game) => new RegExp(gamePattern, 'i').test(game.id))
  : catalogGames;
assert.ok(games.length > 0, 'runtime audit game filter selected no catalog games');

const allViewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 },
];
const viewportPattern = String(process.env.TRAINING_AUDIT_VIEWPORT_PATTERN || '').trim();
const viewports = viewportPattern
  ? allViewports.filter((viewport) => new RegExp(viewportPattern, 'i').test(viewport.name))
  : allViewports;
assert.ok(viewports.length > 0, 'runtime audit viewport filter selected no viewports');

function freeDiskBytes() {
  const stats = statfsSync(ROOT);
  return Number(stats.bavail) * Number(stats.bsize);
}

function browserBundleRoot(executablePath) {
  const marker = '.app/';
  const appIndex = executablePath.indexOf(marker);
  return appIndex >= 0 ? executablePath.slice(0, appIndex + 4) : dirname(executablePath);
}

function collectBundleEntries(root, current = root, entries = []) {
  for (const name of readdirSync(current).sort()) {
    const path = join(current, name);
    const stats = lstatSync(path);
    if (stats.isDirectory()) collectBundleEntries(root, path, entries);
    else entries.push({ path, relativePath: relative(root, path), stats });
  }
  return entries;
}

async function hashBrowserBundle(root) {
  const digest = createHash('sha256');
  for (const entry of collectBundleEntries(root)) {
    digest.update(`${entry.relativePath}\0${entry.stats.mode}\0${entry.stats.size}\0`);
    if (entry.stats.isSymbolicLink()) {
      digest.update(`link:${readlinkSync(entry.path)}\0`);
      continue;
    }
    if (!entry.stats.isFile()) continue;
    for await (const chunk of createReadStream(entry.path)) digest.update(chunk);
    digest.update('\0');
  }
  return digest.digest('hex');
}

async function readRuntimeArtifactIdentity() {
  assertDiskHeadroom(freeDiskBytes());
  const playwrightPackagePath = require.resolve('playwright/package.json');
  const playwrightCorePackagePath = require.resolve('playwright-core/package.json');
  const playwrightPackage = JSON.parse(readFileSync(playwrightPackagePath, 'utf8'));
  const playwrightCorePackage = JSON.parse(readFileSync(playwrightCorePackagePath, 'utf8'));
  const executablePath = String(
    process.env.TRAINING_AUDIT_BROWSER_EXECUTABLE || chromium.executablePath(),
  );
  const executableStats = statSync(executablePath);
  const bundleRoot = browserBundleRoot(executablePath);
  const bundleStats = statSync(bundleRoot);
  return {
    node: process.versions.node,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    packageLockSha256: sha256(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')),
    nodeModulesRealPath: realpathSync(join(ROOT, 'node_modules')),
    playwright: {
      version: playwrightPackage.version,
      packageSha256: sha256(readFileSync(playwrightPackagePath, 'utf8')),
    },
    playwrightCore: {
      version: playwrightCorePackage.version,
      packageSha256: sha256(readFileSync(playwrightCorePackagePath, 'utf8')),
    },
    browser: {
      executablePath,
      executableBytes: executableStats.size,
      executableMtimeMs: executableStats.mtimeMs,
      bundleRoot,
      bundleMtimeMs: bundleStats.mtimeMs,
      bundleSha256: await hashBrowserBundle(bundleRoot),
    },
  };
}

async function readDeploymentIdentity() {
  const response = await fetch(`${BASE_URL}/api/health?trainingAudit=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.ok, true, `runtime audit could not read deployment health: HTTP ${response.status}`);
  const health = await response.json();
  const version = String(health?.version || '').trim();
  const commitSha = String(health?.commitSha || '').trim();
  assert.ok(version, 'runtime audit deployment health did not expose a build version');
  if (EXPECTED_BUILD) {
    assert.equal(
      commitSha,
      EXPECTED_BUILD,
      `runtime audit expected exact build ${EXPECTED_BUILD} but found ${commitSha || version}`,
    );
  }
  return {
    version,
    commitSha: commitSha || null,
    expectedCommitSha: EXPECTED_BUILD || null,
    deploymentUrl: health?.deploymentUrl || null,
    deploymentId: health?.deploymentId || null,
  };
}

const deploymentIdentity = await readDeploymentIdentity();
const runtimeArtifactIdentity = await readRuntimeArtifactIdentity();
const initialFreeDiskBytes = freeDiskBytes();
const checkpointLibraryPath = join(ROOT, 'scripts/lib/training-runtime-checkpoint.mjs');
const supervisorLibraryPath = join(ROOT, 'scripts/lib/training-runtime-supervisor.mjs');
const auditImplementationSha256 = sha256(
  [AUDIT_FILE_PATH, checkpointLibraryPath, supervisorLibraryPath]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n'),
);
const catalogSha256 = sha256(catalogSource);
const checkpointFingerprint = {
  contract: TRAINING_RUNTIME_AUDIT_CONTRACT,
  targetDeployment: deploymentIdentity,
  runtimeArtifacts: runtimeArtifactIdentity,
  auditImplementationSha256,
  catalogSha256,
  authFixtureSha256: sha256(readFileSync(AUTH_STATE, 'utf8')),
  baseUrl: BASE_URL,
  authUserId: storedAuthSession.user.id,
  gameIds: games.map((game) => game.id),
  viewports,
  batchSize: BATCH_SIZE,
  concurrency: CONCURRENCY,
  requireFull: REQUIRE_FULL,
  lifecycleAudit: LIFECYCLE_AUDIT,
  questionsPerSession: LIFECYCLE_AUDIT ? QUESTIONS_PER_SESSION : null,
};
const expectedBatches = buildExpectedBatchMap({
  games,
  viewports,
  batchSize: BATCH_SIZE,
  lifecycleAudit: LIFECYCLE_AUDIT,
});
const expectedSurfaceChecks = [...expectedBatches.values()].reduce(
  (total, descriptor) => total + (descriptor.games.length * descriptor.surfaces.length),
  0,
);
const feedbackRequired = viewports.some((viewport) => viewport.name === 'mobile');
if (REQUIRE_FULL) {
  assert.ok(OUTPUT_PATH, 'full runtime certification requires TRAINING_AUDIT_OUTPUT');
  assert.ok(CHECKPOINT_PATH, 'full runtime certification requires TRAINING_AUDIT_CHECKPOINT');
  assert.match(
    EXPECTED_BUILD,
    /^[0-9a-f]{40}$/i,
    'full runtime certification requires a 40-character TRAINING_AUDIT_EXPECTED_BUILD',
  );
  assert.equal(gamePattern, '', 'full runtime certification cannot filter games');
  assert.equal(viewportPattern, '', 'full runtime certification cannot filter viewports');
  assert.equal(games.length, 107, 'full runtime certification requires all 107 games');
  assert.deepEqual(
    viewports.map(({ name }) => name),
    ['mobile', 'desktop'],
    'full runtime certification requires both canonical viewports',
  );
  assert.equal(LIFECYCLE_AUDIT, true, 'full runtime certification requires lifecycle auditing');
  assert.equal(QUESTIONS_PER_SESSION, 20, 'full runtime certification requires 20-question sessions');
  assert.equal(expectedSurfaceChecks, 642, 'full runtime certification requires 642 surface checks');
  assert.equal(feedbackRequired, true, 'full runtime certification requires mobile feedback checks');
}
const fingerprintSha256 = sha256(JSON.stringify(checkpointFingerprint));
const releaseCheckpointLock = acquireCheckpointLock(CHECKPOINT_PATH, fingerprintSha256);
const activeBrowsers = new Set();
let lockReleased = false;
const releaseLock = () => {
  if (lockReleased) return;
  lockReleased = true;
  releaseCheckpointLock();
};
process.once('exit', releaseLock);
let shutdownStarted = false;
async function shutdownRuntimeAudit(exitCode) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  await Promise.race([
    Promise.all([...activeBrowsers].map((browser) => browser.close().catch(() => {}))),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  releaseLock();
  process.exit(exitCode);
}
process.once('SIGINT', () => void shutdownRuntimeAudit(130));
process.once('SIGTERM', () => void shutdownRuntimeAudit(143));

let checkpoint = CHECKPOINT_PATH
  ? loadOrCreateCheckpoint(CHECKPOINT_PATH, checkpointFingerprint, expectedBatches, feedbackRequired)
  : createCheckpoint(checkpointFingerprint);
const resumedBatches = Object.keys(checkpoint.batchResults).length;
let executedBatches = 0;
const terminalBatchResults = {};
let terminalFeedbackChecks = [];

function persistCheckpoint() {
  writeCheckpointAtomic(CHECKPOINT_PATH, checkpoint);
}

async function assertDeploymentUnchanged() {
  assertDiskHeadroom(freeDiskBytes());
  const current = await readDeploymentIdentity();
  assert.deepEqual(
    current,
    deploymentIdentity,
    `runtime audit deployment changed from ${deploymentIdentity.version} to ${current.version}`,
  );
  const executableStats = statSync(runtimeArtifactIdentity.browser.executablePath);
  const bundleStats = statSync(runtimeArtifactIdentity.browser.bundleRoot);
  assert.equal(
    executableStats.size,
    runtimeArtifactIdentity.browser.executableBytes,
    'runtime audit browser executable changed size during the run',
  );
  assert.equal(
    executableStats.mtimeMs,
    runtimeArtifactIdentity.browser.executableMtimeMs,
    'runtime audit browser executable changed during the run',
  );
  assert.equal(
    bundleStats.mtimeMs,
    runtimeArtifactIdentity.browser.bundleMtimeMs,
    'runtime audit browser bundle changed during the run',
  );
}

const ignoredConsoleError = (message, sourceUrl = '') => (
  /WebSocket connection to .*\/_next\/(?:webpack-hmr|hmr)/.test(message)
  || /\/_next\/(?:webpack-hmr|hmr)/.test(sourceUrl)
  // Each isolated audit batch replays the same saved test session. Supabase
  // refresh tokens are one-time credentials, so later disposable contexts can
  // receive this expected 400 even though the canonical app token and mocked
  // Training APIs remain available for the visual/runtime assertions.
  || (/\/auth\/v1\/token\?grant_type=refresh_token/.test(sourceUrl)
    && /Failed to load resource:.*\b(?:400|429)\b/.test(message))
  // The lifecycle matrix injects exactly one 503 per game/level to prove the
  // trainer's fallback path. The recovered UI is asserted immediately after.
  || (LIFECYCLE_AUDIT
    && /\/api\/training\/batch-preload/.test(sourceUrl)
    && /Failed to load resource:.*\b503\b/.test(message))
  // The reusable auth fixture intentionally fixes VIP enrichment after SSR.
  // That can only alter this header modifier in a dev build. The approved
  // global header itself is out of Phase 5 scope and production hydration was
  // independently certified during Phase 4.
  || (/Prop .*did not match/.test(message)
    && /approved-global-header__vip/.test(message))
);

function attachPageDiagnostics(page) {
  const diagnostics = { consoleErrors: [], pageErrors: [] };
  const onConsole = (message) => {
    const sourceUrl = message.location()?.url || '';
    if (message.type() === 'error' && !ignoredConsoleError(message.text(), sourceUrl)) {
      diagnostics.consoleErrors.push(
        sourceUrl ? `${message.text()} [source: ${sourceUrl}]` : message.text(),
      );
    }
  };
  const onPageError = (error) => diagnostics.pageErrors.push(error?.message || String(error));
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    diagnostics,
    detach() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

function diagnosticsSince(diagnostics, cursor) {
  return {
    consoleErrors: diagnostics.consoleErrors.slice(cursor.consoleErrors),
    pageErrors: diagnostics.pageErrors.slice(cursor.pageErrors),
  };
}

function diagnosticsCursor(diagnostics) {
  return {
    consoleErrors: diagnostics.consoleErrors.length,
    pageErrors: diagnostics.pageErrors.length,
  };
}

function appendDiagnosticFailures(failures, diagnostics) {
  if (diagnostics.consoleErrors.length) {
    failures.push(`console errors: ${diagnostics.consoleErrors.join(' | ')}`);
  }
  if (diagnostics.pageErrors.length) {
    failures.push(`page errors: ${diagnostics.pageErrors.join(' | ')}`);
  }
}

function appendUnreportedDiagnostics(results, diagnostics) {
  if (!results.length) return;
  const reported = results.flatMap((result) => result.failures || []).join('\n');
  const unseen = {
    consoleErrors: diagnostics.consoleErrors.filter((message) => !reported.includes(message)),
    pageErrors: diagnostics.pageErrors.filter((message) => !reported.includes(message)),
  };
  appendDiagnosticFailures(results.at(-1).failures, unseen);
}

const RUNTIME_FORBIDDEN_REQUEST_KEYS = new Set([
  'accuracy',
  'actionevs',
  'classification',
  'correctanswer',
  'correctcount',
  'evloss',
  'gtofrequencies',
  'iscorrect',
  'levelpassed',
  'optimalfrequency',
  'questionsanswered',
  'rewarddiamonds',
  'selectedfrequency',
  'street',
]);

const RUNTIME_ALLOWED_GRADE_REQUEST_KEYS = new Set([
  'attemptId',
  'countsTowardCompletion',
  'decisionOrdinal',
  'gameId',
  'gradingMode',
  'gradingReceipt',
  'handOrdinal',
  'practiceOnly',
  'questionId',
  'rng',
  'selectedAnswer',
  'sessionId',
  'sessionKind',
  'sessionTargetHands',
  'snapshotKey',
  'submissionId',
  'userId',
]);

const RUNTIME_PRIVATE_DELIVERY_KEYS = new Set([
  'actionevs',
  'answer',
  'bestaction',
  'classification',
  'correct',
  'correctanswer',
  'correctanswertext',
  'evdata',
  'explanation',
  'frequencies',
  'gtofrequencies',
  'iscorrect',
  'nextstreetcontinuation',
  'nextstreetcontinuationaction',
  'rawfrequencies',
  'rngguidance',
  'solution',
  'solveranswer',
  'targetactionid',
  'targetactiontext',
]);

function runtimeIsPrivateDeliveryKey(key) {
  const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return RUNTIME_PRIVATE_DELIVERY_KEYS.has(normalized)
    || normalized.startsWith('correct')
    || normalized.startsWith('nextstreetcontinuation')
    || normalized.startsWith('targetaction')
    || normalized.endsWith('explanation')
    || normalized.endsWith('frequencies')
    || normalized.endsWith('actionevs');
}

function stripRuntimePrivateDeliveryData(value) {
  if (Array.isArray(value)) return value.map(stripRuntimePrivateDeliveryData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !runtimeIsPrivateDeliveryKey(key))
      .map(([key, child]) => [key, stripRuntimePrivateDeliveryData(child)]),
  );
}

function runtimeTargetHands(level, sessionKind, requestedHands) {
  assert.ok(
    ['campaign', 'custom', 'replay'].includes(sessionKind),
    `runtime session kind ${sessionKind || '(missing)'} is invalid`,
  );
  if (sessionKind === 'campaign') {
    if (Number(level) === 12) return 30;
    if (Number(level) === 11) return 25;
    return 20;
  }
  const requested = Number(requestedHands);
  if (sessionKind === 'custom') {
    assert.ok([10, 25, 50, 100].includes(requested), 'runtime custom target is invalid');
  } else {
    assert.ok(Number.isInteger(requested) && requested >= 1 && requested <= 100,
      'runtime replay target is invalid');
  }
  return requested;
}

function assertBlindRuntimeQuestion(value, path = 'question') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertBlindRuntimeQuestion(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    assert.equal(
      RUNTIME_PRIVATE_DELIVERY_KEYS.has(normalized),
      false,
      `runtime fixture leaked private grading field ${path}.${key}`,
    );
    assertBlindRuntimeQuestion(child, `${path}.${key}`);
  }
}

function createRuntimeFixtureAuthority() {
  const attemptsByKey = new Map();
  const attemptsById = new Map();
  const canonicalByQuestionId = new Map();
  const receipts = new Map();
  const submissions = new Map();

  const attemptKey = ({ sessionId, gameId, level, sessionKind }) => (
    `${sessionId}\u0000${gameId}\u0000${level}\u0000${sessionKind}`
  );

  function ensureAttempt({
    sessionId,
    gameId,
    level,
    sessionKind = 'campaign',
    requestedHands,
    difficultyMode = 'grouped',
    config = {},
    parentAttemptId = null,
  }) {
    assert.ok(String(sessionId || '').trim(), 'runtime session id is required');
    assert.ok(String(gameId || '').trim(), 'runtime game id is required');
    assert.ok(Number.isInteger(Number(level)) && Number(level) >= 1 && Number(level) <= 12,
      'runtime level is invalid');
    const targetHands = runtimeTargetHands(level, sessionKind, requestedHands);
    const key = attemptKey({ sessionId, gameId, level, sessionKind });
    const configFingerprint = sha256(JSON.stringify({
      difficultyMode,
      targetHands,
      parentAttemptId,
      ...config,
    }));
    const existing = attemptsByKey.get(key);
    if (existing) {
      if (existing.configFingerprint !== configFingerprint) {
        return {
          error: {
            status: 409,
            body: {
              success: false,
              code: 'TRAINING_ATTEMPT_NONCE_CONFLICT',
              error: 'This session identity already owns another Training configuration.',
            },
          },
        };
      }
      if (existing.status !== 'open') {
        return {
          error: {
            status: 409,
            body: {
              success: false,
              code: 'TRAINING_ATTEMPT_NOT_OPEN',
              error: 'This Training attempt is no longer open.',
            },
          },
        };
      }
      return { attempt: existing };
    }

    if (sessionKind === 'replay') {
      const parent = attemptsById.get(parentAttemptId);
      if (!parent || parent.status !== 'completed' || parent.gameId !== gameId || parent.level !== level) {
        return {
          error: {
            status: 409,
            body: {
              success: false,
              code: 'TRAINING_ATTEMPT_PARENT_INVALID',
              error: 'The replay source attempt is not eligible.',
            },
          },
        };
      }
    }

    const attempt = {
      id: randomUUID(),
      sessionId,
      gameId,
      level,
      sessionKind,
      targetHands,
      difficultyMode,
      configFingerprint,
      parentAttemptId,
      practiceOnly: sessionKind === 'replay',
      status: 'open',
      hands: new Map(),
      completion: null,
      analytics: null,
    };
    attemptsByKey.set(key, attempt);
    attemptsById.set(attempt.id, attempt);
    return { attempt };
  }

  function canonicalQuestion(attempt, handOrdinal, decisionOrdinal = 1, overrides = {}) {
    const psychology = attempt.gameId.startsWith('psy-');
    const suffix = `${attempt.gameId}-${attempt.level}-${handOrdinal}-${decisionOrdinal}`;
    const continuationFixture = !psychology
      && attempt.sessionId === 'feedback-cash-001'
      && handOrdinal === 1
      && decisionOrdinal === 1;
    const street = overrides.street || (continuationFixture ? 'flop' : 'preflop');
    const boardCards = Array.isArray(overrides.boardCards)
      ? overrides.boardCards
      : continuationFixture ? ['2h', '7c', 'Jd'] : [];
    return {
      id: `${suffix}-${attempt.id}`,
      question: psychology
        ? 'A difficult hand has raised your frustration. What is the most disciplined response?'
        : 'Action folds to the Button, who raises to 2.5 BB. What is your best action?',
      scenario: psychology
        ? {
            isPsychology: true,
            street,
            action: 'You notice frustration affecting your decision process.',
          }
        : {
            street,
            heroPosition: 'Small Blind',
            villainPosition: 'Button',
            heroHand: ['A♠', 'K♠'],
            heroCards: ['As', 'Ks'],
            boardCards,
            board: boardCards.join(' '),
            stackDepth: 100,
            pot: 6.5,
            action: 'Action folds to the Button, who raises to 2.5 BB.',
            ...(continuationFixture ? {
              isMultiStreet: true,
              nextStreetContinuationAction: 'raise',
            } : {}),
          },
      options: psychology
        ? [
            { id: 'pause', text: 'Pause, Breathe, And Reassess' },
            { id: 'continue', text: 'Continue At The Same Pace' },
            { id: 'stakes', text: 'Move Up In Stakes' },
            { id: 'chase', text: 'Chase The Loss Immediately' },
          ]
        : [
            { id: 'fold', text: 'Fold' },
            { id: 'call', text: 'Call' },
            { id: 'raise', text: '3-Bet To 9 BB' },
            { id: 'allin', text: '3-Bet All-In' },
          ],
      correctAnswer: psychology ? 'pause' : 'raise',
      explanation: psychology
        ? 'A deliberate pause interrupts emotional momentum and restores a process-first decision.'
        : 'The suited premium hand performs best as a value 3-bet from the Small Blind.',
      dataQuality: 'runtime-authority-fixture',
    };
  }

  function publicQuestion(attempt, canonical, handOrdinal, decisionOrdinal = 1) {
    const snapshotKey = sha256([
      attempt.id,
      canonical.id,
      handOrdinal,
      decisionOrdinal,
    ].join('\u0000'));
    const receipt = `runtime-audit-receipt.${randomUUID()}`;
    const submissionId = randomUUID();
    const publicBody = stripRuntimePrivateDeliveryData(canonical);
    const question = {
      ...publicBody,
      _gradingContext: {
        receipt,
        submissionId,
        sessionId: attempt.sessionId,
        attemptId: attempt.id,
        snapshotKey,
        sessionKind: attempt.sessionKind,
        sessionTargetHands: attempt.targetHands,
        handOrdinal,
        decisionOrdinal,
        countsTowardCompletion: decisionOrdinal === 1,
        practiceOnly: attempt.practiceOnly,
        difficultyMode: attempt.difficultyMode,
        rngRolls: { low: 25, high: 75 },
        solverEvidenceAvailable: false,
        expiresAt: new Date(Date.now() + (60 * 60 * 1_000)).toISOString(),
      },
    };
    assertBlindRuntimeQuestion(question);
    const receiptState = {
      attempt,
      canonical,
      publicQuestion: question,
      submissionId,
      snapshotKey,
      handOrdinal,
      decisionOrdinal,
    };
    receipts.set(receipt, receiptState);
    canonicalByQuestionId.set(canonical.id, { attempt, canonical });
    return receiptState;
  }

  function ensureQuestion(attempt, handOrdinal, decisionOrdinal = 1, overrides = {}) {
    assert.ok(
      Number.isInteger(Number(handOrdinal))
        && Number(handOrdinal) >= 1
        && Number(handOrdinal) <= attempt.targetHands,
      'runtime hand ordinal is outside the signed attempt',
    );
    assert.ok(
      Number.isInteger(Number(decisionOrdinal))
        && Number(decisionOrdinal) >= 1
        && Number(decisionOrdinal) <= 8,
      'runtime decision ordinal is invalid',
    );
    let hand = attempt.hands.get(handOrdinal);
    if (!hand) {
      hand = { decisions: new Map(), scored: null };
      attempt.hands.set(handOrdinal, hand);
    }
    const existing = hand.decisions.get(decisionOrdinal);
    if (existing) return existing;
    const canonical = overrides.canonical
      || canonicalQuestion(attempt, handOrdinal, decisionOrdinal, overrides);
    const state = publicQuestion(attempt, canonical, handOrdinal, decisionOrdinal);
    hand.decisions.set(decisionOrdinal, state);
    return state;
  }

  function delivery(attempt, handOrdinalStart, count) {
    const safeStart = Number(handOrdinalStart);
    const safeCount = Number(count);
    assert.ok(Number.isInteger(safeStart) && safeStart >= 1,
      'runtime delivery start is invalid');
    assert.ok(Number.isInteger(safeCount) && safeCount >= 1,
      'runtime delivery count is invalid');
    assert.ok(safeStart + safeCount - 1 <= attempt.targetHands,
      'runtime delivery exceeds the signed attempt');
    const questions = Array.from({ length: safeCount }, (_, offset) => (
      ensureQuestion(attempt, safeStart + offset).publicQuestion
    ));
    return {
      success: true,
      gameId: attempt.gameId,
      level: attempt.level,
      sessionId: attempt.sessionId,
      attemptId: attempt.id,
      sessionKind: attempt.sessionKind,
      targetHands: attempt.targetHands,
      count: questions.length,
      questions,
    };
  }

  function grade(payload) {
    for (const key of Object.keys(payload)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert.equal(
        RUNTIME_FORBIDDEN_REQUEST_KEYS.has(normalized),
        false,
        `browser submitted forbidden server-owned Training field ${key}`,
      );
      assert.equal(
        RUNTIME_ALLOWED_GRADE_REQUEST_KEYS.has(key),
        true,
        `browser submitted an unknown Training grading field ${key}`,
      );
    }
    const receiptState = receipts.get(payload.gradingReceipt);
    if (!receiptState) {
      return { status: 400, body: { success: false, error: 'Unknown grading receipt.' } };
    }
    const { attempt, canonical, submissionId, snapshotKey, handOrdinal, decisionOrdinal } = receiptState;
    const exactIdentity = String(payload.submissionId) === submissionId
      && String(payload.sessionId) === attempt.sessionId
      && String(payload.attemptId) === attempt.id
      && String(payload.snapshotKey) === snapshotKey
      && String(payload.gameId) === attempt.gameId
      && String(payload.questionId) === canonical.id
      && Number(payload.handOrdinal) === handOrdinal
      && Number(payload.decisionOrdinal) === decisionOrdinal
      && typeof payload.countsTowardCompletion === 'boolean'
      && payload.countsTowardCompletion === (decisionOrdinal === 1)
      && typeof payload.practiceOnly === 'boolean'
      && payload.practiceOnly === attempt.practiceOnly
      && String(payload.sessionKind) === attempt.sessionKind
      && Number(payload.sessionTargetHands) === attempt.targetHands
      && String(payload.gradingMode) === attempt.difficultyMode
      && payload.rng === null;
    if (!exactIdentity) {
      return { status: 409, body: { success: false, error: 'Signed answer identity mismatch.' } };
    }
    if (!canonical.options.some((option) => option.id === payload.selectedAnswer)) {
      return { status: 422, body: { success: false, error: 'Selected answer is not legal.' } };
    }
    const replay = submissions.get(submissionId);
    if (replay) {
      if (replay.selectedAnswer !== payload.selectedAnswer) {
        return {
          status: 409,
          body: {
            success: false,
            code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT',
            error: 'This hand already has another answer.',
          },
        };
      }
      return { status: 200, body: { ...replay.response, idempotentReplay: true } };
    }
    if (attempt.status !== 'open') {
      return {
        status: 409,
        body: { success: false, code: 'TRAINING_ATTEMPT_NOT_OPEN', error: 'Attempt is not open.' },
      };
    }
    if (decisionOrdinal > 1) {
      const prior = attempt.hands.get(handOrdinal)?.decisions.get(decisionOrdinal - 1);
      if (!prior || !submissions.has(prior.submissionId)) {
        return {
          status: 409,
          body: {
            success: false,
            code: 'TRAINING_ATTEMPT_DECISION_SEQUENCE_GAP',
            error: 'The preceding decision is missing.',
          },
        };
      }
    }
    const isCorrect = payload.selectedAnswer === canonical.correctAnswer;
    const classification = isCorrect ? 'best' : 'wrong';
    if (decisionOrdinal === 1) attempt.hands.get(handOrdinal).scored = isCorrect;
    const continuationAction = String(canonical.scenario?.nextStreetContinuationAction || '');
    const revealedContinuationAction = canonical.options.some(
      (option) => String(option?.id ?? option) === continuationAction,
    ) ? continuationAction : null;
    const response = {
      success: true,
      idempotentReplay: false,
      submissionId,
      sessionId: attempt.sessionId,
      attemptId: attempt.id,
      snapshotKey,
      handOrdinal,
      decisionOrdinal,
      countsTowardCompletion: decisionOrdinal === 1,
      practiceOnly: attempt.practiceOnly,
      evidence: {
        solverVerified: false,
        classification,
        evLossMeasured: false,
        isCorrect,
        gradeMode: 'canonical',
        difficultyMode: attempt.difficultyMode,
        rng: null,
        canonicalSolverClassification: classification,
        selectedFrequency: null,
        optimalFrequency: null,
        evLoss: 0,
        optimalAction: canonical.correctAnswer,
      },
      feedback: {
        correctAnswer: canonical.correctAnswer,
        correctAnswerText: canonical.options.find((option) => option.id === canonical.correctAnswer)?.text,
        explanation: canonical.explanation,
        structuredExplanation: null,
        gtoFrequencies: null,
        frequencies: null,
        rawFrequencies: null,
        evData: null,
        actionEVs: null,
        solverVerified: false,
        dataQuality: canonical.dataQuality,
        continuation: revealedContinuationAction
          ? { actionId: revealedContinuationAction }
          : null,
      },
    };
    submissions.set(submissionId, { selectedAnswer: payload.selectedAnswer, response });
    return { status: 200, body: response };
  }

  function complete(attemptId) {
    const attempt = attemptsById.get(attemptId);
    if (!attempt) {
      return { status: 404, body: { success: false, code: 'TRAINING_ATTEMPT_NOT_FOUND' } };
    }
    if (attempt.completion) {
      return { status: 200, body: { ...attempt.completion, newCompletion: false } };
    }
    const scores = Array.from({ length: attempt.targetHands }, (_, index) => (
      attempt.hands.get(index + 1)?.scored
    ));
    if (scores.some((score) => typeof score !== 'boolean')) {
      return {
        status: 409,
        body: {
          success: false,
          code: 'TRAINING_ATTEMPT_INCOMPLETE',
          answered: scores.filter((score) => typeof score === 'boolean').length,
          requiredQuestions: attempt.targetHands,
          error: 'The runtime attempt is incomplete.',
        },
      };
    }
    const correct = scores.filter(Boolean).length;
    const accuracy = Math.round((correct / attempt.targetHands) * 100);
    const requiredCorrect = Math.ceil(attempt.targetHands * (attempt.level === 12 ? 0.9 : 0.85));
    let currentStreak = 0;
    let bestStreak = 0;
    for (const score of scores) {
      currentStreak = score ? currentStreak + 1 : 0;
      bestStreak = Math.max(bestStreak, currentStreak);
    }
    const rewardBase = 5
      + (accuracy === 100 ? 10 : accuracy >= 90 ? 5 : accuracy >= 85 ? 3 : 0)
      + (bestStreak > 5 ? 2 : 0);
    const rewardMultiplier = [1, 1, 1, 1.1, 1.15, 1.25, 1.35, 1.4, 1.5, 1.6, 1.75, 2][attempt.level - 1]
      || 1;
    const diamondsEarned = attempt.practiceOnly ? 0 : Math.round(rewardBase * rewardMultiplier);
    attempt.status = 'completed';
    attempt.completion = {
      success: true,
      newCompletion: true,
      attemptId: attempt.id,
      practiceOnly: attempt.practiceOnly,
      answered: attempt.targetHands,
      correct,
      accuracy,
      passed: correct >= requiredCorrect,
      bestStreak,
      diamondsEarned,
      diamondsAwarded: diamondsEarned,
      rewardReference: `training_attempt:${attempt.id}`,
      requiredQuestions: attempt.targetHands,
      requiredCorrect,
      history: { attempt_id: attempt.id },
      progress: attempt.practiceOnly ? null : { game_id: attempt.gameId, level: attempt.level },
      trainingStreak: { current_streak: 1, longest_streak: 1 },
    };
    return { status: 200, body: attempt.completion };
  }

  function saveAnalytics(attemptId) {
    const attempt = attemptsById.get(attemptId);
    if (!attempt) {
      return { status: 404, body: { success: false, code: 'TRAINING_ATTEMPT_NOT_FOUND' } };
    }
    if (attempt.status !== 'completed') {
      return { status: 409, body: { success: false, code: 'TRAINING_ATTEMPT_NOT_COMPLETED' } };
    }
    const created = !attempt.analytics;
    if (!attempt.analytics) {
      attempt.analytics = {
        attempt_id: attempt.id,
        game_id: attempt.gameId,
        hands_played: attempt.targetHands,
        hand_history: Array.from({ length: attempt.targetHands }, (_, index) => ({
          handNumber: index + 1,
          isCorrect: attempt.hands.get(index + 1)?.scored === true,
        })),
      };
    }
    return {
      status: 200,
      body: {
        success: true,
        newSession: created,
        attemptId: attempt.id,
        practiceOnly: attempt.practiceOnly,
        session: attempt.analytics,
        diamondsEarned: 0,
      },
    };
  }

  function resolveContinuation(receipt) {
    const parent = receipts.get(receipt);
    if (!parent) {
      return {
        error: {
          status: 400,
          body: { success: false, code: 'TRAINING_GRADING_RECEIPT_REQUIRED', error: 'Unknown grading receipt.' },
        },
      };
    }
    const saved = submissions.get(parent.submissionId);
    if (!saved) {
      return {
        error: {
          status: 409,
          body: {
            success: false,
            code: 'TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED',
            error: 'Save the current decision before continuing.',
          },
        },
      };
    }
    const actionId = String(parent.canonical.scenario?.nextStreetContinuationAction || '');
    const actionIsCanonical = parent.canonical.options.some(
      (option) => String(option?.id ?? option) === actionId,
    );
    if (!actionIsCanonical) {
      return {
        error: {
          status: 409,
          body: {
            success: false,
            code: 'TRAINING_CONTINUATION_EXACT_LINE_UNAVAILABLE',
            error: 'This decision has no exact canonical continuation.',
          },
        },
      };
    }
    if (String(saved.selectedAnswer).toLowerCase() !== actionId.toLowerCase()) {
      return {
        error: {
          status: 409,
          body: {
            success: false,
            code: 'TRAINING_CONTINUATION_OFF_TREE_ACTION',
            error: 'The selected action leaves the exact solved line.',
          },
        },
      };
    }
    return { parent, actionId };
  }

  return {
    attemptsById,
    canonicalByQuestionId,
    receipts,
    delivery,
    ensureAttempt,
    ensureQuestion,
    grade,
    complete,
    saveAnalytics,
    resolveContinuation,
  };
}

async function readContractedRuntimeRequest(route, observations, {
  endpoint,
  methods,
  allowedQueryKeys = [],
  requiredQueryKeys = [],
  allowedBodyKeys = null,
  requiredBodyKeys = [],
}) {
  const request = route.request();
  const method = request.method();
  const url = new URL(request.url());
  const violations = [];
  if (!methods.includes(method)) violations.push(`method ${method}`);
  if (!/^Bearer\s+\S+$/i.test(request.headers().authorization || '')) {
    violations.push('missing bearer authorization');
  }
  const queryKeys = [...url.searchParams.keys()];
  const allowedQuery = new Set(allowedQueryKeys);
  const unknownQueryKeys = queryKeys.filter((key) => !allowedQuery.has(key));
  if (unknownQueryKeys.length) violations.push(`unknown query keys ${unknownQueryKeys.join(',')}`);
  for (const key of requiredQueryKeys) {
    if (!url.searchParams.has(key) || !String(url.searchParams.get(key) || '').trim()) {
      violations.push(`missing query key ${key}`);
    }
  }

  let payload = null;
  if (allowedBodyKeys !== null) {
    try {
      payload = JSON.parse(request.postData() || 'null');
    } catch {
      violations.push('invalid JSON body');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      violations.push('body must be an object');
    } else {
      const allowedBody = new Set(allowedBodyKeys);
      const unknownBodyKeys = Object.keys(payload).filter((key) => !allowedBody.has(key));
      if (unknownBodyKeys.length) violations.push(`unknown body keys ${unknownBodyKeys.join(',')}`);
      for (const key of requiredBodyKeys) {
        if (!Object.hasOwn(payload, key)) violations.push(`missing body key ${key}`);
      }
    }
  } else if (request.postData()) {
    violations.push('unexpected request body');
  }

  if (violations.length === 0) return { request, url, payload };
  observations.unknownTrainingRequests.push({ endpoint, method, url: request.url(), violations });
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: `Runtime request contract failed: ${violations.join('; ')}` }),
  });
  return null;
}

async function installRuntimeMocks(context) {
  const observations = {
    batchPreloadRequests: 0,
    batchPreloadPayloads: [],
    successfulDeliveries: [],
    singleQuestionRecoveryRequests: 0,
    getQuestionRequests: [],
    customTrainRequests: [],
    reissueQuestionRequests: [],
    nextStreetRequests: [],
    transientPreloadFailures: 0,
    successfulPreloads: 0,
    recordQuestionRequests: [],
    saveProgressRequests: [],
    saveSessionRequests: [],
    smartPracticeRequests: [],
    unknownTrainingRequests: [],
  };
  const authority = createRuntimeFixtureAuthority();
  if (process.env.TRAINING_AUDIT_DEBUG === '1') {
    context.on('request', (request) => {
      if (request.url().includes('/api/training/progress')) {
        process.stderr.write(`[runtime-audit] progress request ${request.url()}\n`);
      }
    });
  }
  // The checked-in storage state proves the guarded client path, but its
  // one-time refresh token cannot be replayed across hundreds of disposable
  // contexts. Keep this audit hermetic: refresh/user reads return the same
  // test identity with a short-lived, audit-local expiry and never contact the
  // production auth service. Production sign-in is verified separately by the
  // authenticated deployment smoke suite.
  const auditSession = {
    ...storedAuthSession,
    expires_in: 60 * 60,
    expires_at: Math.floor(Date.now() / 1000) + (60 * 60),
  };
  await context.route('**/auth/v1/token?grant_type=refresh_token', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(auditSession),
  }));
  await context.route('**/auth/v1/user', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(auditSession.user),
  }));
  // Header/profile enrichment is outside the runtime contract and must not
  // make this deterministic audit depend on Supabase transport health. Empty
  // PostgREST collections exercise the app's legitimate no-enrichment state.
  await context.route('**/rest/v1/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': '0-0/0' },
    body: '[]',
  }));
  // Register a fail-closed Training boundary before endpoint-specific
  // fixtures. Playwright gives newer routes priority. Any endpoint omitted by
  // this authority must fail the audit instead of receiving a fake success.
  await context.route('**/api/training/**', (route) => {
    observations.unknownTrainingRequests.push({
      method: route.request().method(),
      url: route.request().url(),
    });
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Unmocked Training endpoint in runtime audit.' }),
    });
  });
  await context.route('**/api/games/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'runtime audit uses the canonical client catalog' }),
  }));
  const failedPreloads = new Map();
  await context.route('**/api/training/batch-preload?**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'batch-preload',
      methods: ['GET'],
      allowedQueryKeys: [
        'gameId', 'level', 'count', 'difficulty', 'sessionId', 'handOrdinalStart',
        'gameMode', 'handSelection', 'targetStreet', 'targetPositions',
      ],
      requiredQueryKeys: ['gameId', 'level', 'count', 'difficulty', 'sessionId', 'gameMode', 'handSelection'],
    });
    if (!contracted) return;
    observations.batchPreloadRequests += 1;
    const { url } = contracted;
    const gameId = url.searchParams.get('gameId') || 'cash-001';
    const level = url.searchParams.get('level') || '1';
    const sessionId = url.searchParams.get('sessionId') || 'runtime-audit-session';
    const difficultyMode = url.searchParams.get('difficulty') || 'standard';
    const requestedCount = Number(url.searchParams.get('count') || 20);
    const count = LIFECYCLE_AUDIT ? Math.min(requestedCount, QUESTIONS_PER_SESSION) : requestedCount;
    const handOrdinalStart = Number(url.searchParams.get('handOrdinalStart') || 1);
    const recoveryKey = `${gameId}:${level}`;
    observations.batchPreloadPayloads.push({
      gameId,
      level: Number(level),
      sessionId,
      count: requestedCount,
      handOrdinalStart,
    });
    const failedCount = failedPreloads.get(recoveryKey) || 0;
    // Exhaust the hook's complete-batch retry budget once. Only a real count=1
    // recovery request may then succeed, proving the single-hand fallback is
    // reachable and preserves the attempt's larger signed target.
    if (LIFECYCLE_AUDIT && requestedCount > 1 && failedCount < 3) {
      failedPreloads.set(recoveryKey, failedCount + 1);
      observations.transientPreloadFailures += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'deterministic transient audit failure' }),
      });
      return;
    }
    if (LIFECYCLE_AUDIT && requestedCount === 1) {
      observations.singleQuestionRecoveryRequests += 1;
    }
    const started = authority.ensureAttempt({
      sessionId,
      gameId,
      level: Number(level),
      sessionKind: 'campaign',
      requestedHands: runtimeTargetHands(Number(level), 'campaign'),
      difficultyMode,
      config: {
        gameMode: url.searchParams.get('gameMode') || 'full',
        handSelection: url.searchParams.get('handSelection') || 'all',
        targetStreet: url.searchParams.get('targetStreet') || null,
      },
    });
    if (started.error) {
      await route.fulfill({
        status: started.error.status,
        contentType: 'application/json',
        body: JSON.stringify(started.error.body),
      });
      return;
    }
    observations.successfulPreloads += 1;
    observations.successfulDeliveries.push({
      gameId,
      level: Number(level),
      sessionId,
      attemptId: started.attempt.id,
      count,
      handOrdinalStart,
      targetHands: started.attempt.targetHands,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authority.delivery(started.attempt, handOrdinalStart, count)),
    });
  });
  await context.route('**/api/training/get-question?**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'get-question',
      methods: ['GET'],
      allowedQueryKeys: ['gameId', 'level', 'engineType', 'difficulty', 'sessionId', 'handOrdinal'],
      requiredQueryKeys: ['gameId', 'level', 'sessionId'],
    });
    if (!contracted) return;
    const { url } = contracted;
    const request = Object.fromEntries(url.searchParams.entries());
    observations.getQuestionRequests.push(request);
    const level = Number(request.level || 1);
    const started = authority.ensureAttempt({
      sessionId: request.sessionId,
      gameId: request.gameId,
      level,
      sessionKind: 'campaign',
      requestedHands: runtimeTargetHands(level, 'campaign'),
      difficultyMode: request.difficulty || 'standard',
      config: { engineType: request.engineType || 'PIO' },
    });
    if (started.error) {
      return route.fulfill({
        status: started.error.status,
        contentType: 'application/json',
        body: JSON.stringify(started.error.body),
      });
    }
    const delivered = authority.delivery(started.attempt, Number(request.handOrdinal || 1), 1);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...delivered, question: delivered.questions[0], questions: undefined }),
    });
  });
  await context.route('**/api/training/custom-train?**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'custom-train',
      methods: ['GET'],
      allowedQueryKeys: [
        'gameId', 'gameType', 'position', 'villainPosition', 'actionScenario',
        'stackDepth', 'street', 'handClass', 'boardTexture', 'spotType', 'count',
        'level', 'difficulty', 'sessionId', 'gameMode', 'handSelection',
      ],
      requiredQueryKeys: ['gameId', 'gameType', 'stackDepth', 'count', 'level', 'difficulty', 'sessionId'],
    });
    if (!contracted) return;
    const { url } = contracted;
    const request = Object.fromEntries(url.searchParams.entries());
    observations.customTrainRequests.push(request);
    const level = Number(request.level || 1);
    const count = Number(request.count || 25);
    let started;
    try {
      started = authority.ensureAttempt({
        sessionId: request.sessionId,
        gameId: request.gameId,
        level,
        sessionKind: 'custom',
        requestedHands: count,
        difficultyMode: request.difficulty || 'standard',
        config: request,
      });
    } catch (error) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: error.message }),
      });
    }
    if (started.error) {
      return route.fulfill({
        status: started.error.status,
        contentType: 'application/json',
        body: JSON.stringify(started.error.body),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...authority.delivery(started.attempt, 1, count),
        exactFiltersApplied: true,
        config: request,
      }),
    });
  });
  await context.route('**/api/training/progress**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'progress',
      methods: ['GET'],
      allowedQueryKeys: ['userId', 'gameId'],
      requiredQueryKeys: ['gameId'],
    });
    if (!contracted) return;
    if (process.env.TRAINING_AUDIT_DEBUG === '1') {
      process.stderr.write(`[runtime-audit] progress fixture ${route.request().url()}\n`);
    }
    return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current_level: 3,
      highest_level_unlocked: 3,
      levels: {
        level_1: { highScore: 92, attempts: 2 },
        level_2: { highScore: 90, attempts: 1 },
      },
    }),
    });
  });
  await context.route('**/api/training/smart-practice?**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'smart-practice',
      methods: ['GET'],
      allowedQueryKeys: ['gameId'],
    });
    if (!contracted) return;
    const { url } = contracted;
    observations.smartPracticeRequests.push(Object.fromEntries(url.searchParams.entries()));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        recommendation: {
          type: 'general',
          title: 'General Practice',
          description: 'Complete Training hands to build an authoritative practice history.',
          targetPositions: [],
          targetStreet: null,
          priority: 1,
          config: {},
          reason: 'insufficient_data',
        },
        alternatives: [],
        analytics: {
          totalSessions: 0,
          totalHands: 0,
          overallAccuracy: 0,
          spacedRepDue: 0,
        },
      }),
    });
  });
  await context.route('**/api/training/reissue-questions', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'reissue-questions',
      methods: ['POST'],
      allowedBodyKeys: [
        'gameId', 'questionIds', 'level', 'difficulty', 'sessionId', 'sessionKind',
        'parentAttemptId', 'requestedHands', 'handOrdinalStart', 'gameMode',
        'handSelection', 'targetStreet',
      ],
      requiredBodyKeys: [
        'gameId', 'questionIds', 'level', 'difficulty', 'sessionId', 'sessionKind',
        'requestedHands', 'handOrdinalStart', 'gameMode', 'handSelection', 'targetStreet',
      ],
    });
    if (!contracted) return;
    const { payload } = contracted;
    observations.reissueQuestionRequests.push(payload);
    const requestedIds = Array.isArray(payload.questionIds) ? payload.questionIds.map(String) : [];
    const canonicalEntries = requestedIds.map((id) => authority.canonicalByQuestionId.get(id));
    if (requestedIds.length === 0 || canonicalEntries.some((entry) => (
      !entry || entry.attempt.gameId !== payload.gameId || entry.attempt.level !== Number(payload.level)
    ))) {
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'TRAINING_REISSUE_QUESTION_UNAVAILABLE',
          error: 'One or more questions are not canonical for this level.',
        }),
      });
    }
    const sessionKind = payload.sessionKind || 'campaign';
    const started = authority.ensureAttempt({
      sessionId: payload.sessionId,
      gameId: payload.gameId,
      level: Number(payload.level),
      sessionKind,
      requestedHands: Number(payload.requestedHands || requestedIds.length),
      difficultyMode: payload.difficulty || 'standard',
      parentAttemptId: payload.parentAttemptId || null,
      config: {
        gameMode: payload.gameMode || 'full',
        handSelection: payload.handSelection || 'all',
        targetStreet: payload.targetStreet || null,
      },
    });
    if (started.error) {
      return route.fulfill({
        status: started.error.status,
        contentType: 'application/json',
        body: JSON.stringify(started.error.body),
      });
    }
    const start = Number(payload.handOrdinalStart || 1);
    const questions = canonicalEntries.map(({ canonical }, index) => (
      authority.ensureQuestion(started.attempt, start + index, 1, { canonical }).publicQuestion
    ));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        gameId: started.attempt.gameId,
        level: started.attempt.level,
        sessionId: started.attempt.sessionId,
        attemptId: started.attempt.id,
        sessionKind: started.attempt.sessionKind,
        targetHands: started.attempt.targetHands,
        count: questions.length,
        questions,
      }),
    });
  });
  await context.route('**/api/training/next-street', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'next-street',
      methods: ['POST'],
      allowedBodyKeys: ['gradingReceipt'],
      requiredBodyKeys: ['gradingReceipt'],
    });
    if (!contracted) return;
    const { payload } = contracted;
    observations.nextStreetRequests.push(payload);
    if (Object.keys(payload).length !== 1 || typeof payload.gradingReceipt !== 'string') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Only the signed parent receipt is accepted.' }),
      });
    }
    const continuation = authority.resolveContinuation(payload.gradingReceipt);
    if (continuation.error) {
      return route.fulfill({
        status: continuation.error.status,
        contentType: 'application/json',
        body: JSON.stringify(continuation.error.body),
      });
    }
    const { parent } = continuation;
    const parentBoard = parent.canonical.scenario?.boardCards || [];
    const newCard = parentBoard.length < 3 ? '2c' : parentBoard.length === 3 ? '3d' : '4h';
    const boardCards = [...parentBoard, newCard];
    const street = boardCards.length >= 5 ? 'river' : boardCards.length === 4 ? 'turn' : 'flop';
    const next = authority.ensureQuestion(
      parent.attempt,
      parent.handOrdinal,
      parent.decisionOrdinal + 1,
      { street, boardCards },
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        question: next.publicQuestion,
        newCard,
        boardCards,
        street,
        sessionId: parent.attempt.sessionId,
        attemptId: parent.attempt.id,
        handOrdinal: parent.handOrdinal,
        decisionOrdinal: parent.decisionOrdinal + 1,
      }),
    });
  });
  await context.route('**/api/training/save-progress', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'save-progress',
      methods: ['POST'],
      allowedBodyKeys: ['attemptId'],
      requiredBodyKeys: ['attemptId'],
    });
    if (!contracted) return;
    const { payload } = contracted;
    observations.saveProgressRequests.push(payload);
    if (Object.keys(payload).length !== 1 || typeof payload.attemptId !== 'string') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Only attemptId may be supplied.' }),
      });
    }
    const result = authority.complete(payload.attemptId);
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });

  await context.route('**/api/training/record-question', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'record-question',
      methods: ['POST'],
      allowedBodyKeys: [...RUNTIME_ALLOWED_GRADE_REQUEST_KEYS],
      requiredBodyKeys: [...RUNTIME_ALLOWED_GRADE_REQUEST_KEYS],
    });
    if (!contracted) return;
    const { payload } = contracted;
    observations.recordQuestionRequests.push(payload);
    const result = authority.grade(payload);
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });

  await context.route('**/api/training/save-session', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'save-session',
      methods: ['POST'],
      allowedBodyKeys: ['attemptId'],
      requiredBodyKeys: ['attemptId'],
    });
    if (!contracted) return;
    const { payload } = contracted;
    observations.saveSessionRequests.push(payload);
    if (Object.keys(payload).length !== 1 || typeof payload.attemptId !== 'string') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Only attemptId may be supplied.' }),
      });
    }
    const result = authority.saveAnalytics(payload.attemptId);
    return route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });

  await context.route('**/api/training/analytics?**', async (route) => {
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'analytics',
      methods: ['GET'],
      allowedQueryKeys: ['gameId', 'days', 'type'],
    });
    if (!contracted) return;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, sessions: [], answers: [], data: [] }),
    });
  });

  await context.route('**/api/training/spaced-repetition**', async (route) => {
    const method = route.request().method();
    const contracted = await readContractedRuntimeRequest(route, observations, {
      endpoint: 'spaced-repetition',
      methods: ['GET', 'POST', 'PATCH'],
      allowedQueryKeys: ['gameId', 'count'],
      allowedBodyKeys: method === 'GET' ? null : method === 'POST'
        ? ['mistakes']
        : ['spotSignature', 'wasCorrect'],
      requiredBodyKeys: method === 'POST' ? ['mistakes'] : method === 'PATCH'
        ? ['spotSignature', 'wasCorrect']
        : [],
    });
    if (!contracted) return;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(method === 'GET'
        ? { success: true, spots: [] }
        : { success: true }),
    });
  });

  const successRoutes = [
    '**/api/user/get-header-stats',
    '**/api/auth/ensure-profile',
    '**/api/rewards/eggs/evaluate',
    '**/api/rewards/birthday-reward',
    '**/api/rewards/daily-login',
    '**/api/social/pages?**',
    '**/api/vip/check-status?**',
    '**/api/check-access?**',
  ];
  for (const pattern of successRoutes) {
    await context.route(pattern, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, progress: [], sessions: [], data: [] }),
    }));
  }
  observations.fixtureAuthority = authority;
  return observations;
}

async function answerLocator(page, psychology, correct) {
  if (psychology) {
    return page.locator('[data-training-question-card] button').filter({
      hasText: correct ? /Pause.*Breathe.*Reassess/i : /Continue.*Same Pace/i,
    });
  }
  return page.locator(`.sp-club-gto-actions [data-action="${correct ? 'raise' : 'fold'}"]`);
}

async function assertFeedbackAndAdvance(page, gameId, psychology, correct) {
  const answer = await answerLocator(page, psychology, correct);
  await answer.waitFor({ state: 'visible', timeout: 15_000 });
  const recordResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/training/record-question'),
    { timeout: 15_000 },
  );
  await answer.click();
  await page.getByText('Your Answer', { exact: true }).first().waitFor({ timeout: 15_000 });
  await page.getByText('Correct Answer', { exact: true }).first().waitFor({ timeout: 15_000 });
  const expectedVerdict = correct ? 'Correct' : 'Incorrect';
  const verdict = page.getByText(expectedVerdict, { exact: true }).first();
  await verdict.waitFor({ state: 'visible', timeout: 15_000 });
  const recordResponse = await recordResponsePromise;
  assert.equal(recordResponse.status(), 200, `${gameId} answer persistence returned HTTP ${recordResponse.status()}`);
  const recordBody = await recordResponse.json();
  assert.equal(recordBody?.success, true, `${gameId} answer persistence did not succeed`);
  assert.equal(
    recordBody?.evidence?.isCorrect,
    correct,
    `${gameId} persisted grade did not match the visible verdict`,
  );
  const next = page.getByText(/Next Question/).first();
  await next.waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(250);
  assert.equal(await verdict.isVisible(), true, `${gameId} ${expectedVerdict} feedback did not persist`);
  assert.equal(await next.isVisible(), true, `${gameId} did not require manual Next`);
  await next.click();
}

async function completeLifecycleSession(page, game, correct) {
  const psychology = game.id.startsWith('psy-');
  for (let index = 0; index < QUESTIONS_PER_SESSION; index += 1) {
    const marker = psychology
      ? `Question ${index + 1}/${QUESTIONS_PER_SESSION}`
      : `Question ${index + 1} Of ${QUESTIONS_PER_SESSION}`;
    await page.waitForFunction((expected) => (
      [...document.querySelectorAll('body *')].some((element) => (
        element.children.length === 0
        && element.textContent?.includes(expected)
        && element.getBoundingClientRect().width > 0
        && element.getBoundingClientRect().height > 0
        && getComputedStyle(element).visibility !== 'hidden'
      ))
    ), marker, { timeout: 20_000 });
    await assertFeedbackAndAdvance(page, game.id, psychology, correct);
  }
  await page.locator('.sp-arena-review__title').waitFor({ state: 'visible', timeout: 30_000 });
}

async function assertHealthyLifecycleState(page, label) {
  await waitForVisibleImages(page);
  const state = await readNavigationState(page);
  assert.equal(state.approvedHeaders, 1, `${label} approved global header count`);
  assert.equal(state.scanlineElements, 0, `${label} rendered scanline elements`);
  assert.ok(state.overflow <= 1, `${label} horizontal overflow ${state.overflow}px`);
  assert.deepEqual(state.brokenVisibleImages, [], `${label} rendered broken visible images`);
  assert.doesNotMatch(
    state.bodyText,
    /Arena Crash Detected|Connection Error|Sign In Required/i,
    `${label} rendered an arena error state`,
  );
}

async function waitForRuntimeObservation(predicate, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for runtime evidence: ${label}`);
}

async function auditLifecycle(page, game, viewport, observations) {
  const result = {
    gameId: game.id,
    viewport: viewport.name,
    surface: 'lifecycle',
    loadRecovery: false,
    correctFeedback: false,
    incorrectFeedback: false,
    manualNext: false,
    completion: false,
    retry: false,
    levelTransition: false,
    observedRequests: null,
    failures: [],
  };
  try {
    // The first preload for every game/level is intentionally a 503. The hook
    // must recover through its single-question fallback and still render the
    // complete deterministic fixture queue.
    await completeLifecycleSession(page, game, true);
    await assertHealthyLifecycleState(page, `${game.id} correct completion`);
    result.correctFeedback = true;
    result.manualNext = true;
    result.completion = true;
    const firstCompletedAttemptId = observations.saveProgressRequests.at(-1)?.attemptId;

    const nextLevel = page.getByRole('button', { name: /Next Level \(2\)/ });
    try {
      await nextLevel.waitFor({ state: 'visible', timeout: 15_000 });
    } catch (error) {
      const reviewText = (await page.locator('body').innerText()).slice(-4_000);
      throw new Error(`${error?.message || error}\nReview screen: ${reviewText}`);
    }
    await nextLevel.click();
    const levelTwoDelivery = await waitForRuntimeObservation(
      () => observations.successfulDeliveries.find((delivery) => (
        delivery.level === 2 && delivery.attemptId !== firstCompletedAttemptId
      )),
      `${game.id} distinct Level 2 attempt`,
    );
    assert.equal(levelTwoDelivery.targetHands, 20, `${game.id} Level 2 target changed`);
    await page.waitForFunction(() => (
      [...document.querySelectorAll('body *')].some((element) => (
        /Question 1(?:\/| Of )/.test(element.textContent || '')
        && element.children.length === 0
        && element.getBoundingClientRect().width > 0
        && element.getBoundingClientRect().height > 0
      ))
    ), undefined, { timeout: 30_000 });
    await assertHealthyLifecycleState(page, `${game.id} level transition`);
    result.levelTransition = true;

    await page.goto(
      `${BASE_URL}/hub/training/arena/${game.id}?level=1&session=runtime-fail-${viewport.name}-${game.id}`,
      { waitUntil: 'domcontentloaded', timeout: 45_000 },
    );
    await page.locator('.sp-arena-lobby__start').waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForFunction(() => {
      const button = document.querySelector('.sp-arena-lobby__start');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 45_000 });
    await page.locator('.sp-arena-lobby__start').click();
    await page.locator('[data-training-ui]').first().waitFor({ state: 'visible', timeout: 45_000 });
    await completeLifecycleSession(page, game, false);
    await assertHealthyLifecycleState(page, `${game.id} incorrect completion`);
    result.incorrectFeedback = true;
    const failedAttemptId = observations.saveProgressRequests.at(-1)?.attemptId;
    const retryLevel = page.getByRole('button', { name: /Retry Level 1/ });
    await retryLevel.waitFor({ state: 'visible', timeout: 15_000 });
    await retryLevel.click();
    const retryDelivery = await waitForRuntimeObservation(
      () => observations.successfulDeliveries.findLast((delivery) => (
        delivery.level === 1 && delivery.attemptId !== failedAttemptId
      )),
      `${game.id} distinct retry attempt`,
    );
    assert.notEqual(retryDelivery.attemptId, firstCompletedAttemptId,
      `${game.id} Retry reused the first completed attempt`);
    await page.waitForFunction(() => (
      [...document.querySelectorAll('body *')].some((element) => (
        /Question 1(?:\/| Of )/.test(element.textContent || '')
        && element.children.length === 0
        && element.getBoundingClientRect().width > 0
        && element.getBoundingClientRect().height > 0
      ))
    ), undefined, { timeout: 30_000 });
    await assertHealthyLifecycleState(page, `${game.id} retry state`);
    result.retry = true;

    result.observedRequests = {
      batchPreloadRequests: observations.batchPreloadRequests,
      transientPreloadFailures: observations.transientPreloadFailures,
      successfulPreloads: observations.successfulPreloads,
      singleQuestionRecoveryRequests: observations.singleQuestionRecoveryRequests,
      recordQuestionRequests: observations.recordQuestionRequests.length,
      saveProgressRequests: observations.saveProgressRequests.length,
      saveSessionRequests: observations.saveSessionRequests.length,
      unknownTrainingRequests: observations.unknownTrainingRequests.length,
    };
    assert.ok(
      observations.transientPreloadFailures >= 3
        && observations.singleQuestionRecoveryRequests >= 1
        && observations.successfulPreloads >= 1,
      `${game.id} did not prove recovery through the real single-question fallback`,
    );
    result.loadRecovery = true;
    assert.equal(
      observations.recordQuestionRequests.length,
      QUESTIONS_PER_SESSION * 2,
      `${game.id} did not persist every answer from both lifecycle sessions`,
    );
    assert.equal(
      new Set(observations.recordQuestionRequests.map(({ submissionId }) => submissionId)).size,
      observations.recordQuestionRequests.length,
      `${game.id} reused an answer submission id`,
    );
    assert.equal(
      observations.saveProgressRequests.length,
      2,
      `${game.id} did not persist exactly both completed lifecycle attempts`,
    );
    assert.equal(
      observations.saveSessionRequests.length,
      observations.saveProgressRequests.length,
      `${game.id} did not persist one analytics projection per completed attempt`,
    );
    assert.deepEqual(
      observations.saveSessionRequests.map(({ attemptId }) => attemptId),
      observations.saveProgressRequests.map(({ attemptId }) => attemptId),
      `${game.id} analytics did not acknowledge the authoritative completion attempts`,
    );
    for (const { attemptId } of observations.saveProgressRequests) {
      const attempt = observations.fixtureAuthority.attemptsById.get(attemptId);
      assert.equal(attempt?.status, 'completed', `${game.id} completion left an attempt open`);
      assert.ok(attempt?.completion, `${game.id} completion result was not server-derived`);
      assert.ok(attempt?.analytics, `${game.id} analytics projection was not server-derived`);
    }
    assert.deepEqual(
      observations.unknownTrainingRequests,
      [],
      `${game.id} called an unmodeled Training endpoint`,
    );
  } catch (error) {
    result.failures.push(error?.message || String(error));
  }
  return result;
}

async function waitForVisibleImages(page, timeout = 10_000) {
  await page.waitForFunction(() => {
    const visibleInViewport = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0
        && box.height > 0
        && box.bottom > 0
        && box.top < innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };

    return [...document.images]
      .filter((image) => (
        visibleInViewport(image)
        && !image.closest('.approved-global-header')
      ))
      .every((image) => image.complete && image.naturalWidth > 0);
  }, undefined, { timeout }).catch(() => undefined);
}

async function readNavigationState(page) {
  return page.evaluate(() => {
    const visibleInViewport = (element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0
        && box.height > 0
        && box.bottom > 0
        && box.top < innerHeight
        && style.display !== 'none'
        && style.visibility !== 'hidden';
    };
    return {
      title: document.title.trim(),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      approvedHeaders: document.querySelectorAll('.approved-global-header').length,
      scanlineElements: document.querySelectorAll(
        '.scanline, .scan-line, .hud-scanline, [class*="scanline"], [class*="scan-line"]',
      ).length,
      brokenVisibleImages: [...document.images]
        .filter((image) => (
          visibleInViewport(image)
          && !image.closest('.approved-global-header')
          && (!image.complete || image.naturalWidth === 0)
        ))
        .map((image) => image.currentSrc || image.src),
      bodyText: (document.body?.innerText || '').slice(0, 2_000),
    };
  });
}

async function auditNavigation(page, route, expectedSelector, diagnostics) {
  const cursor = diagnosticsCursor(diagnostics);
  let response = await page.goto(`${BASE_URL}${route}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.locator(expectedSelector).first().waitFor({ state: 'visible', timeout: 45_000 });
  await waitForVisibleImages(page);
  let state = await readNavigationState(page);
  let imageRecoveryChecks = 0;
  if (state.brokenVisibleImages.length) {
    imageRecoveryChecks = state.brokenVisibleImages.length;
    response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator(expectedSelector).first().waitFor({ state: 'visible', timeout: 45_000 });
    await waitForVisibleImages(page);
    state = await readNavigationState(page);
  }
  return {
    responseStatus: response?.status() || 0,
    finalPath: new URL(page.url()).pathname,
    ...diagnosticsSince(diagnostics, cursor),
    imageRecoveryChecks,
    ...state,
  };
}

function commonFailures(state) {
  const failures = [];
  if (state.responseStatus >= 400 || state.responseStatus === 0) failures.push(`HTTP ${state.responseStatus}`);
  if (!state.title) failures.push('missing document title');
  if (state.overflow > 1) failures.push(`horizontal overflow ${state.overflow}px`);
  if (state.scanlineElements !== 0) failures.push(`scanline elements ${state.scanlineElements}`);
  if (state.brokenVisibleImages.length) failures.push(`broken visible images: ${state.brokenVisibleImages.join(', ')}`);
  if (state.consoleErrors.length) failures.push(`console errors: ${state.consoleErrors.join(' | ')}`);
  if (state.pageErrors.length) failures.push(`page errors: ${state.pageErrors.join(' | ')}`);
  if (/Arena Crash Detected|Connection Error|Sign In Required/i.test(state.bodyText)) failures.push('arena error state rendered');
  return failures;
}

async function auditGame(page, game, viewport, diagnostics, observations) {
  const results = [];
  const playRoute = `/hub/training/play/${game.id}?revision=runtime-surface-audit`;
  const playDiagnosticCursor = diagnosticsCursor(diagnostics);
  try {
    const state = await auditNavigation(page, playRoute, '.sp-level-card', diagnostics);
    const failures = commonFailures(state);
    const levelCards = await page.locator('.sp-level-card').count();
    if (state.finalPath !== `/hub/training/play/${game.id}`) failures.push(`unexpected final path ${state.finalPath}`);
    if (state.approvedHeaders !== 1) failures.push(`approved global header count ${state.approvedHeaders}`);
    if (levelCards !== 12) failures.push(`level card count ${levelCards}`);
    const completedLevels = await page.locator('.sp-level-card.is-complete').count();
    const openLevels = await page.locator('.sp-level-card.is-open').count();
    if (completedLevels !== 2) {
      const firstCards = await page.locator('.sp-level-card').evaluateAll((cards) => (
        cards.slice(0, 3).map((card) => ({ className: card.className, text: card.innerText.slice(0, 160) }))
      ));
      failures.push(`resume completed-level count ${completedLevels}: ${JSON.stringify(firstCards)}`);
    }
    if (openLevels < 1) failures.push(`resume open-level count ${openLevels}`);
    const campaignText = (await page.locator('.sp-level-game-info').innerText()).toLocaleLowerCase();
    if (!campaignText.includes(game.name.toLocaleLowerCase())) failures.push('game name missing from campaign header');
    results.push({
      gameId: game.id,
      viewport: viewport.name,
      surface: 'play',
      imageRecoveryChecks: state.imageRecoveryChecks,
      failures,
    });
  } catch (error) {
    const failures = [error?.message || String(error)];
    appendDiagnosticFailures(failures, diagnosticsSince(diagnostics, playDiagnosticCursor));
    results.push({ gameId: game.id, viewport: viewport.name, surface: 'play', failures });
  }

  const arenaRoute = `/hub/training/arena/${game.id}?level=1&session=runtime-${viewport.name}-${game.id}`;
  const arenaDiagnosticCursor = diagnosticsCursor(diagnostics);
  try {
    const state = await auditNavigation(page, arenaRoute, '.sp-arena-lobby__start', diagnostics);
    const runtimeDiagnosticCursor = diagnosticsCursor(diagnostics);
    const failures = commonFailures(state);
    const startButton = page.locator('.sp-arena-lobby__start');
    await page.waitForFunction(() => {
      const button = document.querySelector('.sp-arena-lobby__start');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 45_000 });
    await startButton.click();
    await page.locator('[data-training-ui]').first().waitFor({ state: 'visible', timeout: 45_000 });
    await waitForVisibleImages(page);
    const gameplayState = await readNavigationState(page);
    const expectedUi = game.id.startsWith('psy-') ? 'psychology-scenario' : 'club-arena-table';
    const root = page.locator('[data-training-ui]').first();
    const actualUi = await root.getAttribute('data-training-ui');
    const actualGameId = await root.getAttribute('data-training-game-id');
    if (state.finalPath !== `/hub/training/arena/${game.id}`) failures.push(`unexpected final path ${state.finalPath}`);
    if (actualUi !== expectedUi) failures.push(`expected ${expectedUi}; rendered ${actualUi || 'no runtime UI'}`);
    if (actualGameId !== game.id) failures.push(`runtime game id ${actualGameId || 'missing'}`);
    const optionCount = game.id.startsWith('psy-')
      ? Number(await page.locator('[data-training-question-card]').getAttribute('data-training-option-count'))
      : await page.locator('.sp-club-gto-actions [data-action]').count();
    if (optionCount !== 4) failures.push(`answer option count ${optionCount}`);
    if (!game.id.startsWith('psy-') && await page.locator('.sp-club-gto-question').count() !== 1) {
      failures.push('Club Arena question panel missing');
    }
    if (gameplayState.overflow > 1) failures.push(`gameplay horizontal overflow ${gameplayState.overflow}px`);
    if (gameplayState.approvedHeaders !== 1) {
      failures.push(`gameplay approved global header count ${gameplayState.approvedHeaders}`);
    }
    if (gameplayState.scanlineElements !== 0) {
      failures.push(`gameplay scanline elements ${gameplayState.scanlineElements}`);
    }
    if (gameplayState.brokenVisibleImages.length) {
      failures.push(`gameplay broken visible images: ${gameplayState.brokenVisibleImages.join(', ')}`);
    }
    if (/Arena Crash Detected|Connection Error|Sign In Required/i.test(gameplayState.bodyText)) {
      failures.push('gameplay arena error state rendered');
    }
    appendDiagnosticFailures(failures, diagnosticsSince(diagnostics, runtimeDiagnosticCursor));
    results.push({
      gameId: game.id,
      viewport: viewport.name,
      surface: 'arena',
      lobbyReady: true,
      runtimeUi: actualUi,
      optionCount,
      scanlineElements: gameplayState.scanlineElements,
      brokenVisibleImages: gameplayState.brokenVisibleImages,
      imageRecoveryChecks: state.imageRecoveryChecks,
      failures,
    });
    if (LIFECYCLE_AUDIT && failures.length === 0) {
      const lifecycleDiagnosticCursor = diagnosticsCursor(diagnostics);
      const lifecycleResult = await auditLifecycle(page, game, viewport, observations);
      appendDiagnosticFailures(
        lifecycleResult.failures,
        diagnosticsSince(diagnostics, lifecycleDiagnosticCursor),
      );
      results.push(lifecycleResult);
    }
  } catch (error) {
    const failures = [error?.message || String(error)];
    appendDiagnosticFailures(failures, diagnosticsSince(diagnostics, arenaDiagnosticCursor));
    results.push({ gameId: game.id, viewport: viewport.name, surface: 'arena', failures });
  }
  if (observations.unknownTrainingRequests.length > 0) {
    results.at(-1).failures.push(
      `unmodeled Training endpoint requests: ${JSON.stringify(observations.unknownTrainingRequests)}`,
    );
  }
  return results;
}

async function auditFeedback(page, gameId, psychology, observations, diagnostics) {
  const diagnosticCursor = diagnosticsCursor(diagnostics);
  const initialRecordRequests = observations.recordQuestionRequests.length;
  const initialContinuationRequests = observations.nextStreetRequests.length;
  await page.goto(
    `${BASE_URL}/hub/training/arena/${gameId}?level=1&session=feedback-${gameId}`,
    { waitUntil: 'domcontentloaded', timeout: 45_000 }
  );
  await page.locator('.sp-arena-lobby__start').waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.sp-arena-lobby__start');
    return button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 45_000 });
  await page.locator('.sp-arena-lobby__start').click();
  await page.locator('[data-training-ui]').waitFor({ state: 'visible', timeout: 45_000 });
  // The poker fixture must choose its revealed canonical continuation action
  // so this audit proves the browser really reaches the exact Turn child.
  // Keep the psychology fixture deliberately incorrect so the same receipt
  // covers both visible verdict states without asking an off-tree poker action
  // to produce an impossible continuation.
  const expectedCorrect = !psychology;
  const answer = await answerLocator(page, psychology, expectedCorrect);
  const recordResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/training/record-question'),
    { timeout: 15_000 },
  );
  await answer.click();
  await page.getByText('Your Answer', { exact: true }).waitFor({ timeout: 15_000 });
  await page.getByText('Correct Answer', { exact: true }).waitFor({ timeout: 15_000 });
  const verdict = page.getByText(/^(?:Correct|Incorrect)$/).first();
  await verdict.waitFor({ timeout: 15_000 });
  const recordResponse = await recordResponsePromise;
  assert.equal(recordResponse.status(), 200, `${gameId} feedback persistence returned HTTP ${recordResponse.status()}`);
  const recordBody = await recordResponse.json();
  assert.equal(recordBody?.success, true, `${gameId} feedback persistence did not succeed`);
  const verdictText = (await verdict.innerText()).trim();
  const normalizedVerdict = verdictText.toLocaleLowerCase();
  assert.equal(
    normalizedVerdict,
    expectedCorrect ? 'correct' : 'incorrect',
    `${gameId} did not render the deliberate feedback verdict`,
  );
  assert.equal(
    recordBody?.evidence?.isCorrect,
    normalizedVerdict === 'correct',
    `${gameId} server evidence did not match the visible verdict`,
  );
  if (!psychology) {
    assert.equal(recordBody?.evidence?.evLossMeasured, false,
      `${gameId} fixture unexpectedly claimed measured EV`);
    const unavailableEV = page.getByText('EV NOT MEASURED', { exact: true }).first();
    await unavailableEV.waitFor({ state: 'visible', timeout: 15_000 });
    assert.equal(await unavailableEV.isVisible(), true,
      `${gameId} rendered an unmeasured compatibility zero as exact EV`);
    assert.equal(await page.getByText('NO EV LOSS', { exact: true }).count(), 0,
      `${gameId} labeled missing EV evidence as a perfect decision`);
  }
  await page.waitForTimeout(1_000);
  assert.equal(await verdict.isVisible(), true, `${gameId} feedback must persist before Next`);
  const next = page.getByRole('button', {
    name: psychology ? /Next Question/i : /Next - Continue Hand/i,
  }).first();
  await next.waitFor({ state: 'visible', timeout: 15_000 });
  assert.equal(await next.isVisible(), true, `${gameId} must expose manual Next`);
  assert.equal(
    observations.recordQuestionRequests.length - initialRecordRequests,
    1,
    `${gameId} feedback must issue exactly one observed persistence request`,
  );
  const state = await readNavigationState(page);
  assert.equal(state.scanlineElements, 0, `${gameId} feedback rendered scanline elements`);
  assert.deepEqual(state.brokenVisibleImages, [], `${gameId} feedback rendered broken images`);
  const observedDiagnostics = diagnosticsSince(diagnostics, diagnosticCursor);
  assert.deepEqual(observedDiagnostics.consoleErrors, [], `${gameId} feedback console errors`);
  assert.deepEqual(observedDiagnostics.pageErrors, [], `${gameId} feedback page errors`);
  assert.deepEqual(
    observations.unknownTrainingRequests,
    [],
    `${gameId} feedback called an unmodeled Training endpoint`,
  );
  let continuation = false;
  let continuationStreet = null;
  let continuationRequests = 0;
  if (!psychology) {
    const continuationResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/training/next-street'),
      { timeout: 15_000 },
    );
    await next.click();
    const continuationResponse = await continuationResponsePromise;
    assert.equal(
      continuationResponse.status(),
      200,
      `${gameId} continuation returned HTTP ${continuationResponse.status()}`,
    );
    const continuationBody = await continuationResponse.json();
    assert.equal(continuationBody?.success, true, `${gameId} continuation did not succeed`);
    assert.equal(continuationBody?.street, 'turn', `${gameId} continuation did not reach the Turn`);
    assert.equal(
      Number(continuationBody?.question?._gradingContext?.decisionOrdinal),
      2,
      `${gameId} continuation did not advance the decision ordinal`,
    );
    assertBlindRuntimeQuestion(continuationBody.question);
    await page.waitForFunction(() => (
      (document.body?.innerText || '').toLocaleLowerCase().includes('turn')
    ), undefined, { timeout: 15_000 });
    continuationRequests = observations.nextStreetRequests.length - initialContinuationRequests;
    assert.equal(continuationRequests, 1, `${gameId} issued the wrong continuation request count`);
    continuation = true;
    continuationStreet = 'turn';
  }
  return {
    gameId,
    verdict: normalizedVerdict === 'correct' ? 'Correct' : 'Incorrect',
    manualNext: true,
    persisted: true,
    persistenceRequests: 1,
    continuation,
    continuationStreet,
    continuationRequests,
  };
}

const launchBrowser = async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: runtimeArtifactIdentity.browser.executablePath,
    args: ['--mute-audio', '--autoplay-policy=user-gesture-required'],
  });
  activeBrowsers.add(browser);
  browser.once('disconnected', () => activeBrowsers.delete(browser));
  return browser;
};

async function createAuditContext(browser, viewport) {
  const context = await browser.newContext({
      storageState: AUTH_STATE,
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
  });
  // A runtime audit opens hundreds of full documents. Restore the freshly
  // generated test session before every document script so unrelated global
  // auth listeners cannot turn later catalog checks into logged-out pages.
  await context.addInitScript((items) => {
    const authEntry = items.find((item) => item.name === 'smarter-poker-auth');
    const nativeRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key) {
      if (key === 'smarter-poker-auth') return;
      return nativeRemoveItem.call(this, key);
    };
    for (const { name, value } of items) localStorage.setItem(name, value);
    if (authEntry) {
      const nativeClear = Storage.prototype.clear;
      Storage.prototype.clear = function clear() {
        nativeClear.call(this);
        localStorage.setItem(authEntry.name, authEntry.value);
      };
    }
    sessionStorage.setItem('sp_auth_confirmed', 'true');
  }, authLocalStorage);
  const observations = await installRuntimeMocks(context);
  return { context, observations };
}

async function auditBatch(viewport, batch) {
  const browser = await launchBrowser();
  const batchResults = [];
  try {
    const queue = [...batch];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) });
    await Promise.all(workers.map(async () => {
      while (true) {
        // Claim the game synchronously before awaiting page creation. If two
        // workers both observed `queue.length === 1` and yielded first, the
        // second worker previously dequeued `undefined`, rejected the batch,
        // and caused every valid surface in that batch to be replayed.
        const game = queue.shift();
        if (!game) break;
        // Each game owns a fresh browser context. Cookies, service workers,
        // local storage mutations, and route state from one of the 107 games
        // must never certify (or poison) the next game in the batch.
        const { context, observations } = await createAuditContext(browser, viewport);
        const page = await context.newPage();
        const pageDiagnostics = attachPageDiagnostics(page);
        try {
          const gameResults = await auditGame(
            page,
            game,
            viewport,
            pageDiagnostics.diagnostics,
            observations,
          );
          // Let microtask-delivered browser errors settle before detaching the
          // full-game collectors, then charge any not already attributed to
          // the terminal surface so no late lifecycle exception is discarded.
          await page.waitForTimeout(100);
          appendUnreportedDiagnostics(gameResults, pageDiagnostics.diagnostics);
          batchResults.push(...gameResults);
        } finally {
          pageDiagnostics.detach();
          await page.close().catch(() => {});
          await context.close().catch(() => {});
        }
      }
    }));
    return batchResults;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function auditFeedbackFlows(viewport) {
  const browser = await launchBrowser();
  try {
    const { context, observations } = await createAuditContext(browser, viewport);
    const feedbackPage = await context.newPage();
    const pageDiagnostics = attachPageDiagnostics(feedbackPage);
    try {
      return [
        await auditFeedback(
          feedbackPage,
          'cash-001',
          false,
          observations,
          pageDiagnostics.diagnostics,
        ),
        await auditFeedback(
          feedbackPage,
          'psy-001',
          true,
          observations,
          pageDiagnostics.diagnostics,
        ),
      ];
    } finally {
      pageDiagnostics.detach();
      await feedbackPage.close().catch(() => {});
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

for (const viewport of viewports) {
  for (let offset = 0; offset < games.length; offset += BATCH_SIZE) {
    const batchKey = `${viewport.name}:${offset}`;
    if (checkpoint.batchResults[batchKey]) continue;
    await assertDeploymentUnchanged();
    executedBatches += 1;
    const descriptor = expectedBatches.get(batchKey);
    assert.ok(descriptor, `missing expected runtime batch descriptor ${batchKey}`);
    const batch = games.slice(offset, offset + BATCH_SIZE);
    let batchError = null;
    let completedResults = null;
    let lastAttemptResults = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        lastAttemptResults = await auditBatch(viewport, batch);
        validateSuccessfulBatch(descriptor, lastAttemptResults);
        completedResults = lastAttemptResults;
        batchError = null;
        break;
      } catch (error) {
        batchError = error;
      }
    }
    if (batchError) {
      terminalBatchResults[batchKey] = normalizeFailedBatch(
        descriptor,
        lastAttemptResults,
        `browser batch failed after retry: ${batchError?.message || String(batchError)}`,
      );
      process.stderr.write(`[runtime-audit] batch failed and remains retryable (${batchKey})\n`);
      continue;
    }
    checkpoint.batchResults[batchKey] = completedResults;
    persistCheckpoint();
    process.stderr.write(
      `[runtime-audit] checkpointed ${Object.keys(checkpoint.batchResults).length}`
      + `/${expectedBatches.size} batches (${batchKey})\n`
    );
  }
  if (viewport.name === 'mobile' && !checkpoint.feedbackComplete) {
    await assertDeploymentUnchanged();
    try {
      const feedbackChecks = await auditFeedbackFlows(viewport);
      validateFeedbackChecks(feedbackChecks);
      checkpoint.feedbackChecks = feedbackChecks;
      checkpoint.feedbackComplete = true;
      persistCheckpoint();
    } catch (error) {
      terminalFeedbackChecks = ['cash-001', 'psy-001'].map((gameId) => ({
        gameId,
        failure: error?.message || String(error),
        manualNext: false,
        persisted: false,
      }));
    }
  }
}

await assertDeploymentUnchanged();
const endingRuntimeArtifactIdentity = await readRuntimeArtifactIdentity();
assert.deepEqual(
  endingRuntimeArtifactIdentity,
  runtimeArtifactIdentity,
  'runtime audit dependencies or browser bundle changed during the run',
);
const allBatchResults = {};
for (const key of expectedBatches.keys()) {
  allBatchResults[key] = checkpoint.batchResults[key] || terminalBatchResults[key];
  assert.ok(allBatchResults[key], `runtime audit did not attempt expected batch ${key}`);
}
const results = Object.values(allBatchResults).flat();
assert.equal(
  results.length,
  expectedSurfaceChecks,
  'runtime audit result ledger is incomplete',
);
const feedbackChecks = checkpoint.feedbackComplete
  ? checkpoint.feedbackChecks
  : terminalFeedbackChecks;
results.sort((a, b) => (
  a.gameId.localeCompare(b.gameId)
  || a.viewport.localeCompare(b.viewport)
  || a.surface.localeCompare(b.surface)
));
for (const result of results) {
  if (result.surface === 'arena') {
    if (result.scanlineElements !== 0) result.failures.push('arena scanline evidence is missing or nonzero');
    if (!Array.isArray(result.brokenVisibleImages)) result.failures.push('arena image evidence is missing');
  }
  if (result.surface === 'lifecycle') {
    const observed = result.observedRequests;
    if (!observed || observed.transientPreloadFailures < 1 || observed.successfulPreloads < 1) {
      result.failures.push('lifecycle preload recovery request evidence is incomplete');
    }
    if (observed?.singleQuestionRecoveryRequests < 1) {
      result.failures.push('lifecycle did not reach the single-question fallback');
    }
    if (observed?.recordQuestionRequests !== QUESTIONS_PER_SESSION * 2) {
      result.failures.push('lifecycle answer persistence request evidence is incomplete');
    }
    if (observed?.saveProgressRequests < 2) {
      result.failures.push('lifecycle completion persistence request evidence is incomplete');
    }
    if (observed?.saveSessionRequests !== observed?.saveProgressRequests) {
      result.failures.push('lifecycle analytics persistence request evidence is incomplete');
    }
    if (observed?.unknownTrainingRequests !== 0) {
      result.failures.push('lifecycle contains unmodeled Training endpoint requests');
    }
  }
}
for (const feedback of feedbackChecks) {
  if (feedback.persistenceRequests !== 1) {
    feedback.failure = feedback.failure || 'feedback persistence request evidence is incomplete';
  }
}
const failures = results.filter((result) => result.failures.length);
const feedbackFailures = feedbackChecks.filter((result) => result.failure);
const success = failures.length === 0
  && feedbackFailures.length === 0
  && Object.keys(checkpoint.batchResults).length === expectedBatches.size
  && (!feedbackRequired || checkpoint.feedbackComplete);
if (success) validateCompleteSuccessfulRun(checkpoint, expectedBatches, feedbackRequired);
if (success && REQUIRE_FULL) {
  assert.equal(results.filter((result) => result.surface === 'play').length, 214,
    'full runtime certification requires 214 play checks');
  assert.equal(results.filter((result) => result.surface === 'arena').length, 214,
    'full runtime certification requires 214 arena checks');
  assert.equal(results.filter((result) => result.surface === 'lifecycle').length, 214,
    'full runtime certification requires 214 lifecycle checks');
  assert.equal(feedbackChecks.length, 2, 'full runtime certification requires both feedback checks');
}
const auditEndedAt = new Date();
const summary = {
  success,
  status: success ? 'complete' : 'failed',
  certificationMode: REQUIRE_FULL ? 'full' : 'partial',
  executionScope: 'target-page-ui-with-hermetic-training-api-contract-fixtures',
  liveTargetEvidence: ['page documents', 'static assets', '/api/health deployment identity'],
  fixtureBackedEvidence: [
    '/api/training/batch-preload',
    '/api/training/record-question',
    '/api/training/next-street',
    '/api/training/save-progress',
    '/api/training/save-session',
  ],
  productionTrainingApiAuthorityCertified: false,
  startedAt: auditStartedAt.toISOString(),
  completedAt: auditEndedAt.toISOString(),
  durationMs: auditEndedAt.getTime() - auditStartedAt.getTime(),
  baseUrl: BASE_URL,
  targetBuildVersion: deploymentIdentity.version,
  targetDeployment: deploymentIdentity,
  auditContract: TRAINING_RUNTIME_AUDIT_CONTRACT,
  auditFingerprintSha256: fingerprintSha256,
  runtimeArtifacts: runtimeArtifactIdentity,
  initialFreeDiskBytes,
  finalFreeDiskBytes: freeDiskBytes(),
  games: games.length,
  gameIds: games.map((game) => game.id),
  viewports: viewports.map((viewport) => viewport.name),
  batchSize: BATCH_SIZE,
  runtimeNode: process.versions.node,
  resumedBatches,
  executedBatches,
  expectedBatches: expectedBatches.size,
  checkpointedBatches: Object.keys(checkpoint.batchResults).length,
  expectedSurfaceChecks,
  lifecycleAudit: LIFECYCLE_AUDIT,
  questionsPerSession: LIFECYCLE_AUDIT ? QUESTIONS_PER_SESSION : null,
  surfaceChecks: results.length,
  playChecks: results.filter((result) => result.surface === 'play').length,
  arenaChecks: results.filter((result) => result.surface === 'arena').length,
  clubArenaChecks: results.filter((result) => result.runtimeUi === 'club-arena-table').length,
  psychologyChecks: results.filter((result) => result.runtimeUi === 'psychology-scenario').length,
  lifecycleChecks: results.filter((result) => result.surface === 'lifecycle').length,
  imageRecoveryChecks: results.reduce((total, result) => (
    total + Number(result.imageRecoveryChecks || 0)
  ), 0),
  scanlineElements: results.reduce((total, result) => (
    total + Number(result.scanlineElements || 0)
  ), 0),
  lifecycleStateChecks: {
    loadRecovery: results.filter((result) => result.loadRecovery).length,
    correctFeedback: results.filter((result) => result.correctFeedback).length,
    incorrectFeedback: results.filter((result) => result.incorrectFeedback).length,
    manualNext: results.filter((result) => result.manualNext).length,
    completion: results.filter((result) => result.completion).length,
    retry: results.filter((result) => result.retry).length,
    levelTransition: results.filter((result) => result.levelTransition).length,
  },
  feedbackChecks,
  // Retain every individual game/viewport/surface assertion. The checkpoint is
  // deleted after success, so omitting this ledger would leave only aggregate
  // counts and make an “exhaustive” certificate impossible to independently
  // audit.
  results,
  failures,
};
const serializedSummary = `${JSON.stringify(summary, null, 2)}\n`;
if (OUTPUT_PATH) {
  const temporaryOutput = `${OUTPUT_PATH}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryOutput, serializedSummary, { flag: 'wx' });
    renameSync(temporaryOutput, OUTPUT_PATH);
  } finally {
    if (existsSync(temporaryOutput)) unlinkSync(temporaryOutput);
  }
}
removeCheckpointAfterSuccessfulRun(CHECKPOINT_PATH, success);
releaseLock();
process.stdout.write(serializedSummary);
process.exitCode = success ? 0 : 1;
