import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const ROOT = process.cwd();
const USER_ID = '11111111-1111-4111-8111-111111111111';

const RETIRED_METHODS = [
  ['pages/api/training/leaderboard.js', 'POST', 'TRAINING_LEADERBOARD_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/achievements.js', 'POST', 'TRAINING_ACHIEVEMENTS_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/challenges.js', 'POST', 'TRAINING_CHALLENGES_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/challenges.js', 'PUT', 'TRAINING_CHALLENGES_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/daily-bonus.js', 'POST', 'TRAINING_DAILY_BONUS_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/spaced-repetition.js', 'GET', 'TRAINING_SPACED_REPETITION_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/spaced-repetition.js', 'POST', 'TRAINING_SPACED_REPETITION_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/spaced-repetition.js', 'PATCH', 'TRAINING_SPACED_REPETITION_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/tournaments.js', 'POST', 'TRAINING_TOURNAMENTS_SERVER_AUTHORITY_REQUIRED'],
  ['pages/api/training/tournaments.js', 'PUT', 'TRAINING_TOURNAMENTS_SERVER_AUTHORITY_REQUIRED'],
  ['pages/api/training/explain-answer.js', 'POST', 'TRAINING_EXPLANATION_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/jarvis/training-session.js', 'POST', 'JARVIS_TRAINING_VERIFIED_ATTEMPT_REQUIRED'],
  ['pages/api/training/share.js', 'POST', 'TRAINING_SHARE_SERVER_AUTHORITY_REQUIRED'],
];

const READ_ROUTES = [
  'pages/api/training/leaderboard.js',
  'pages/api/training/achievements.js',
  'pages/api/training/challenges.js',
  'pages/api/training/daily-bonus.js',
  'pages/api/training/tournaments.js',
];

function sourceFor(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

async function loadRoute(path, { client, user = { id: USER_ID } } = {}) {
  const source = sourceFor(path);
  const clientCreations = [];
  const defaultClient = new Proxy({}, {
    get(_target, property) {
      throw new Error(`retired route touched Supabase client property ${String(property)}`);
    },
  });

  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => user
        ? { user, error: null }
        : { user: null, error: 'No token' },
    },
    '../../../src/lib/supabaseServerClient': {
      createClient: (...args) => {
        clientCreations.push(args);
        return client || defaultClient;
      },
    },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: () => true,
      LIMITS: { read: {}, write: {} },
    },
    '../../../src/utils/trainingApiUtils': {
      withTiming: () => {},
      sanitizeParam: (value) => value,
      clampPagination: (value) => ({ limit: Number(value) || 20 }),
      reconcileAnswerKey: (value) => value,
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
    '../../../src/lib/training/leaderboardPeriod.mjs': {
      getLeaderboardPeriodKey: () => 'alltime',
    },
    '../../../src/lib/training/leaderboardDimensions.mjs': {
      getTrainingLeaderboardCategory: () => 'cash',
      normalizeTrainingLeaderboardCategory: (value) => value,
    },
    '../../../src/lib/trivia/getTodayCST': { getTodayCST: () => '2026-09-06' },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (value) => value,
      isTrainingQuestionValid: () => true,
    },
  };

  const module = new SourceTextModule(source, { identifier: path });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected dependency in ${path}: ${specifier}`);
    const dependency = new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
    return dependency;
  });
  await module.evaluate();
  return { handler: module.namespace.default, clientCreations };
}

test('retired legacy Training mutations fail with explicit authority errors before any service client is created', async (t) => {
  for (const [path, method, code] of RETIRED_METHODS) {
    await t.test(`${method} ${path}`, async () => {
      const { handler, clientCreations } = await loadRoute(path);
      const response = createResponse();
      await handler({
        method,
        headers: { authorization: 'Bearer forged-browser-token' },
        query: {},
        body: {
          userId: 'attacker-controlled',
          accuracy: 100,
          score: 999999,
          questionsCorrect: 999999,
          stats: { accuracy: 100 },
          sessionData: { accuracy: 100, isPerfect: true },
          data: { rank: 1, diamonds: 999999 },
        },
      }, response);

      assert.equal(response.statusCode, 410);
      assert.equal(response.body?.success, false);
      assert.equal(response.body?.code, code);
      assert.equal(clientCreations.length, 0, 'retired method must not even instantiate a service-role client');
    });
  }
});

test('read routes retain GET handlers while their source contains no database mutation or reward primitive', () => {
  for (const path of READ_ROUTES) {
    const source = sourceFor(path);
    assert.match(source, /req\.method (?:===|!==) 'GET'/, `${path} must retain its GET behavior`);
    assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\s*\(/, `${path} must be read-only`);
    const rpcNames = [...source.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(
      rpcNames.every((name) => name === 'fn_training_verified_leaderboard_rank_v2'),
      `${path} may call only the service-owned read-only rank RPC`,
    );
    assert.doesNotMatch(source, /safeAward|add_diamonds_to_balance/, `${path} must not retain an award path`);
  }
});

test('explanation and Jarvis legacy endpoints contain no cache, analytics, or service-role write path', () => {
  for (const path of ['pages/api/training/explain-answer.js', 'pages/api/jarvis/training-session.js']) {
    const source = sourceFor(path);
    assert.doesNotMatch(source, /supabaseServerClient|SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);
  }
});

test('Training share rejects generated statistics and stores only authenticated, explicitly authored text', async () => {
  const writes = [];
  const client = {
    from(table) {
      assert.equal(table, 'social_posts');
      return {
        insert(payload) {
          writes.push(payload);
          return {
            select(columns) {
              assert.equal(columns, 'id');
              return {
                async maybeSingle() {
                  return { data: { id: 'post-1' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  const { handler } = await loadRoute('pages/api/training/share.js', { client });
  const response = createResponse();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: {
      userId: 'attacker-controlled',
      shareType: 'leaderboard',
      data: { rank: 1, diamonds: 999999, accuracy: 100 },
      customMessage: '  I wrote this message myself.  ',
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].author_id, USER_ID);
  assert.equal(writes[0].content, 'I wrote this message myself.');
  assert.deepEqual(writes[0].metadata, {
    shareType: 'custom',
    postType: 'update',
    autoGenerated: false,
  });
  assert.equal(Object.hasOwn(writes[0].metadata, 'trainingData'), false);

  const source = sourceFor('pages/api/training/share.js');
  assert.doesNotMatch(source, /SHARE_TEMPLATES|generateContent|trainingData/);
});

test('Training custom share binds authorship to authentication and never trusts a browser userId', async () => {
  let writeCount = 0;
  const client = {
    from() {
      writeCount += 1;
      throw new Error('anonymous custom share reached the database');
    },
  };
  const { handler } = await loadRoute('pages/api/training/share.js', { client, user: null });
  const response = createResponse();
  await handler({
    method: 'POST',
    headers: {},
    body: {
      userId: 'attacker-controlled',
      customMessage: 'This text must not be published anonymously.',
    },
  }, response);

  assert.equal(response.statusCode, 401);
  assert.equal(writeCount, 0);
});
