/**
 * Training reference pages are open to everyone (package C).
 *
 * Dan, 2026-10-12, answering "should these training pages be open to everyone
 * or get a sign-in button?": "THEY SHOULD OPEN TO EVERYONE."
 *
 * The contract pinned here, per endpoint:
 *   hand-of-the-day  GET without a credential returns today's question with no
 *                    answer key, no grading receipt and no per-user fields,
 *                    and writes nothing (no seal, attempt or served record).
 *   tournaments      GET without a credential returns the shared list and
 *                    standings with no viewer fields and no raw user ids.
 *                    POST/PUT stay retired (410) for everyone.
 *   study-groups     GET without a credential returns the directory with no
 *                    owner ids and no viewer flags. POST stays signed-in.
 *   get-progress     stays personal and signed-in only; position-mastery
 *                    renders signed out without calling it.
 * A request that PRESENTS a credential is always verified, so a bad token
 * keeps its 401 on every endpoint. Rate limits stay on every path.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import * as vm from 'node:vm';
import * as dailyCandidateScan from '../src/lib/training/dailyCandidateScan.mjs';

const ROOT = process.cwd();
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

const DAILY_API = read('pages/api/training/hand-of-the-day.js');
const TOURNAMENTS_API = read('pages/api/training/tournaments.js');
const GROUPS_API = read('pages/api/training/study-groups.js');
const PROGRESS_API = read('pages/api/training/get-progress.js');
const DAILY_PAGE = read('pages/hub/training/daily-challenge.js');
const ASSISTANT_PAGE = read('pages/hub/personal-assistant/index.js');
const TOURNAMENTS_PAGE = read('pages/hub/training/tournaments.js');
const TOURNAMENT_DETAIL_PAGE = read('pages/hub/training/tournament/[id].js');
const FINDER_PAGE = read('pages/hub/training/study-group-finder.js');
const MASTERY_PAGE = read('pages/hub/training/position-mastery.js');
const PROMPT = read('src/components/training/TrainingSignInPrompt.jsx');

const VM_MODULES = typeof vm.SourceTextModule === 'function';
const vmOnly = VM_MODULES ? {} : { skip: 'requires node --experimental-vm-modules' };
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

function createResponse() {
  return {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

async function loadModule(source, identifier, dependencies) {
  const module = new vm.SourceTextModule(source, { identifier });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected dependency in ${identifier}: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace.default;
}

// A recording query builder. Any mutation method is recorded so a test can
// prove an anonymous request wrote nothing.
function recordingClient(resolve, { authUser = null } = {}) {
  const calls = [];
  const writes = [];
  const rateLimits = [];
  const client = {
    auth: {
      async getUser(token) {
        calls.push({ table: 'auth', token });
        return authUser && token === 'good-token'
          ? { data: { user: authUser }, error: null }
          : { data: { user: null }, error: new Error('invalid') };
      },
    },
    rpc(name) {
      writes.push({ rpc: name });
      return Promise.resolve({ data: null, error: new Error('rpc not expected') });
    },
    from(table) {
      const state = { table, filters: [] };
      calls.push(state);
      const builder = {
        select(columns) { state.columns = columns; return builder; },
        eq(column, value) { state.filters.push(['eq', column, value]); return builder; },
        in(column, value) { state.filters.push(['in', column, value]); return builder; },
        gte(column, value) { state.filters.push(['gte', column, value]); return builder; },
        gt(column, value) { state.filters.push(['gt', column, value]); return builder; },
        lt(column, value) { state.filters.push(['lt', column, value]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        range() { return builder; },
        maybeSingle() { state.single = true; return Promise.resolve(resolve(state)); },
        then(onFulfilled, onRejected) { return Promise.resolve(resolve(state)).then(onFulfilled, onRejected); },
      };
      for (const method of ['insert', 'update', 'upsert', 'delete']) {
        builder[method] = () => { writes.push({ table, method }); return builder; };
      }
      return builder;
    },
  };
  return { client, calls, writes, rateLimits };
}

// ---------------------------------------------------------------------------
// hand-of-the-day
// ---------------------------------------------------------------------------

test('hand-of-the-day: a signed-out GET is served by a read-only public path', () => {
  const missingToken = between(DAILY_API, 'if (!token) {', '}');
  assert.match(missingToken, /return servePublicDailyQuestion\(res\)/);
  assert.doesNotMatch(missingToken, /status\(401\)/);
  // A presented credential is still verified.
  assert.match(DAILY_API, /if \(authError \|\| !user\?\.id\) \{\s*return res\.status\(401\)/);
  // The rate limit runs before the anonymous branch.
  assert.ok(
    DAILY_API.indexOf('applyRateLimit(req, res, LIMITS.read)') < DAILY_API.indexOf('servePublicDailyQuestion(res);'),
    'the read rate limit must apply to anonymous requests',
  );

  const publicPath = between(DAILY_API, 'async function readPublicDailyQuestion', 'export default async function handler');
  assert.doesNotMatch(publicPath, /\.(?:insert|update|upsert|delete|rpc)\s*\(/, 'the anonymous path must not write');
  assert.doesNotMatch(
    publicPath,
    /sealDailyCanonicalQuestion\(|getOrCreateSealedDailyQuestion\(|prepareTrainingAttemptDelivery\(|recordTrainingQuestionsServedForAttempt\(|readDailyRows\(|readPendingScoredAttempt\(|readRecoverablePriorScoredAttempt\(/,
    'the anonymous path must not seal, open an attempt, or read per-user rows',
  );
  // The answer key stays behind the signed answer path.
  assert.match(publicPath, /question: toPublicTrainingQuestion\(servedQuestion\)/);
  assert.match(publicPath, /feedback: null/);
  assert.doesNotMatch(publicPath, /postCompletionFeedback|_gradingContext|completedDays|persistedAnswer/);
});

test('hand-of-the-day: the anonymous handler response is blind and writes nothing', vmOnly, async () => {
  const question = {
    id: 'daily-q',
    question: 'What Is The Best Decision?',
    options: [{ id: 'fold', text: 'Fold' }, { id: 'raise', text: 'Raise' }],
    correctAnswer: 'raise',
    explanation: 'Value.',
    gtoFrequencies: { raise: 100 },
  };
  const { client, calls, writes } = recordingClient((state) => {
    if (state.table === 'training_question_cache' && state.single) return { data: null, error: null };
    if (state.table === 'training_question_cache') {
      return { data: [{ question_id: 'daily-q', question_data: question, policy_checksum: 'a'.repeat(64) }], error: null, count: 1 };
    }
    return { data: null, error: null };
  });
  const handler = await loadModule(DAILY_API, 'hand-of-the-day.js', {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: null, error: 'invalid' }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/utils/trainingApiUtils': { withTiming: () => {} },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/trivia/getTodayCST': { getTodayCST: () => '2026-10-12' },
    '../../../src/lib/training/questionContract.mjs': {
      enforceTrainingQuestionContract: (value) => value,
      isTrainingQuestionValid: () => true,
    },
    '../../../src/lib/training/gradingReceipt.mjs': {
      toPublicTrainingQuestion: (value) => {
        const { correctAnswer: _a, explanation: _e, gtoFrequencies: _g, ...rest } = value;
        return rest;
      },
    },
    '../../../src/lib/training/difficultyQuestionContract.mjs': { applyDifficultyToQuestion: (value) => value },
    '../../../src/lib/training/trainingAttemptDelivery.mjs': {
      buildTrainingQuestionSnapshot: () => { throw new Error('anonymous read built a snapshot'); },
      isTrainingAttemptContractError: () => false,
      isTrainingQuestionCampaignEligible: () => true,
      prepareTrainingAttemptDelivery: async () => { throw new Error('anonymous read opened an attempt'); },
      recordTrainingQuestionsServedForAttempt: async () => { throw new Error('anonymous read recorded a serve'); },
    },
    '../../../src/lib/training/dailyCandidateScan.mjs': dailyCandidateScan,
    '../../../src/lib/training/trainingPersistence.mjs': {
      isTrainingPersistenceUnavailable: () => false,
      runTrainingPersistenceQuery: async (factory) => {
        const result = await factory();
        return result.count === undefined ? { ...result, count: 1 } : result;
      },
      trainingPersistenceUnavailableBody: () => ({ success: false }),
    },
    '../../../src/lib/training/cacheTruthPersistence.mjs': {
      cacheRowIsServingEligible: () => true,
      withPersistedCacheReceipt: (value) => ({ ...value }),
    },
  });

  const response = createResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 200, JSON.stringify(response.body));
  assert.equal(response.body.viewer, 'anonymous');
  assert.equal(response.body.question.id, 'daily-q');
  assert.equal(response.body.question.correctAnswer, undefined);
  assert.equal(response.body.question.explanation, undefined);
  assert.equal(response.body.question._gradingContext, undefined);
  assert.equal(response.body.feedback, null);
  assert.equal(response.body.completion, null);
  assert.equal(Object.hasOwn(response.body, 'completedDays'), false);
  assert.deepEqual(writes, []);
  assert.equal(calls.some((call) => [
    'training_daily_challenge', 'training_attempts', 'training_answers', 'training_attempt_hands',
  ].includes(call.table)), false);

  const badToken = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer revoked-token' } }, badToken);
  assert.equal(badToken.statusCode, 401);
});

// ---------------------------------------------------------------------------
// tournaments
// ---------------------------------------------------------------------------

async function loadTournaments(client) {
  const limits = [];
  const handler = await loadModule(TOURNAMENTS_API, 'tournaments.js', {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/utils/trainingApiUtils': { sanitizeParam: (value) => value, withTiming: () => {} },
    '../../../src/lib/apiErrorHandler': { reportApiError: () => {} },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: (_req, _res, opts) => { limits.push(opts); return true; },
      LIMITS: { read: { kind: 'read' } },
    },
  });
  return { handler, limits };
}

function tournamentResolver(state) {
  if (state.table === 'training_tournaments' && state.single) {
    return { data: { id: 't-1', name: 'Open', status: 'live', created_by: OTHER_ID }, error: null };
  }
  if (state.table === 'training_tournaments') {
    return { data: [{ id: 't-1', name: 'Open', status: 'live', created_by: OTHER_ID }], error: null };
  }
  const isDetail = state.filters.some(([, column]) => column === 'tournament_id');
  if (isDetail) {
    return {
      data: [
        { id: 'e-1', user_id: USER_ID, score: 90, profiles: { username: 'hero', avatar_url: null } },
        { id: 'e-2', user_id: OTHER_ID, score: 80, profiles: { username: 'villain', avatar_url: null } },
      ],
      error: null,
    };
  }
  return { data: [{ tournament_id: 't-1', status: 'registered', score: 0, final_rank: null }], error: null };
}

test('tournaments: GET is open, per-user fields need a verified credential, writes stay retired', () => {
  const authBlock = between(TOURNAMENTS_API, 'let userId = null;', 'const safeQ');
  assert.match(authBlock, /if \(token\) \{/);
  assert.match(authBlock, /status\(401\)/, 'a presented credential is still verified');
  assert.doesNotMatch(TOURNAMENTS_API, /Auth required/);
  assert.match(TOURNAMENTS_API, /applyRateLimit\(req, res, LIMITS\.read\)/);
  assert.match(TOURNAMENTS_API, /TRAINING_TOURNAMENTS_SERVER_AUTHORITY_REQUIRED/);
  assert.doesNotMatch(TOURNAMENTS_API, /\.(?:insert|update|upsert|delete|rpc)\s*\(/);
  assert.doesNotMatch(TOURNAMENTS_API, /req\.query\.userId/);
});

test('tournaments: anonymous list and standings omit viewer fields and raw user ids', vmOnly, async () => {
  const { client, calls, writes } = recordingClient(tournamentResolver, { authUser: { id: USER_ID } });
  const { handler, limits } = await loadTournaments(client);

  const list = createResponse();
  await handler({ method: 'GET', headers: {}, query: { status: 'live' } }, list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.tournaments.length, 1);
  assert.equal(Object.hasOwn(list.body, 'userEntries'), false);
  assert.equal(Object.hasOwn(list.body.tournaments[0], 'created_by'), false);
  assert.equal(
    calls.some((call) => call.table === 'training_tournament_entries'),
    false,
    'an anonymous list must not read anybody\'s entries',
  );

  const detail = createResponse();
  await handler({ method: 'GET', headers: {}, query: { tournamentId: 't-1' } }, detail);
  assert.equal(detail.statusCode, 200);
  assert.equal(Object.hasOwn(detail.body, 'userEntry'), false);
  assert.equal(detail.body.entries.length, 2);
  for (const entry of [...detail.body.entries, ...detail.body.leaderboard]) {
    assert.equal(Object.hasOwn(entry, 'user_id'), false);
    assert.ok(entry.profiles?.username, 'public standings keep the public profile');
  }
  assert.deepEqual(writes, []);
  assert.ok(limits.length >= 2 && limits.every((value) => value?.kind === 'read'));

  const signedIn = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer good-token' }, query: { tournamentId: 't-1' } }, signedIn);
  assert.equal(signedIn.statusCode, 200);
  assert.equal(signedIn.body.userEntry?.user_id, USER_ID);

  const badToken = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad-token' }, query: {} }, badToken);
  assert.equal(badToken.statusCode, 401);

  const post = createResponse();
  await handler({ method: 'POST', headers: {}, query: {}, body: {} }, post);
  assert.equal(post.statusCode, 410);
});

// ---------------------------------------------------------------------------
// study-groups
// ---------------------------------------------------------------------------

async function loadGroups(client, user) {
  const limits = [];
  const handler = await loadModule(GROUPS_API, 'study-groups.js', {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async (req) => (
        user && req.headers?.authorization === 'Bearer good-token'
          ? { user, error: null }
          : { user: null, error: 'No token' }
      ),
    },
    '../../../src/lib/apiRateLimit': {
      applyRateLimit: (_req, _res, opts) => { limits.push(opts); return true; },
      LIMITS: { read: { kind: 'read' }, write: { kind: 'write' } },
    },
  });
  return { handler, limits };
}

function groupResolver(state) {
  if (state.table === 'training_study_groups') {
    return {
      data: [{ id: 'g-1', owner_id: OTHER_ID, name: 'River Lab', format: 'Cash', level: 'Any', focus: 'Rivers', max_members: 8, timezone: 'UTC' }],
      error: null,
    };
  }
  return { data: [{ group_id: 'g-1', user_id: OTHER_ID }, { group_id: 'g-1', user_id: USER_ID }], error: null };
}

test('study-groups: GET is open, POST stays signed in, no member identity leaves the route', () => {
  assert.match(GROUPS_API, /const anonymousRead = req\.method === 'GET' && !hasCredential/);
  assert.match(GROUPS_API, /if \(!anonymousRead && !user\) return res\.status\(401\)/);
  assert.match(GROUPS_API, /delete listed\.owner_id/);
  assert.match(GROUPS_API, /applyRateLimit\(req, res, req\.method === 'GET' \? LIMITS\.read : LIMITS\.write\)/);
  assert.doesNotMatch(GROUPS_API, /user_id:\s|members:\s*members|memberIds|email/);
});

test('study-groups: anonymous directory strips owner ids and viewer flags and never reaches a write', vmOnly, async () => {
  const { client, writes } = recordingClient(groupResolver);
  const { handler, limits } = await loadGroups(client, { id: USER_ID });

  const list = createResponse();
  await handler({ method: 'GET', headers: {} }, list);
  assert.equal(list.statusCode, 200);
  const [group] = list.body.groups;
  assert.equal(group.name, 'River Lab');
  assert.equal(group.members, 2);
  for (const key of ['owner_id', 'joined', 'owned', 'user_id']) {
    assert.equal(Object.hasOwn(group, key), false, `${key} must be absent for a signed-out viewer`);
  }
  assert.equal(limits[0]?.kind, 'read');

  const anonymousCreate = createResponse();
  await handler({ method: 'POST', headers: {}, body: { name: 'Should Not Exist' } }, anonymousCreate);
  assert.equal(anonymousCreate.statusCode, 401);
  assert.deepEqual(writes, [], 'an anonymous POST must not reach the create RPC');
  assert.equal(limits[1]?.kind, 'write');

  const badToken = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer bad-token' } }, badToken);
  assert.equal(badToken.statusCode, 401);

  const signedIn = createResponse();
  await handler({ method: 'GET', headers: { authorization: 'Bearer good-token' } }, signedIn);
  assert.equal(signedIn.statusCode, 200);
  assert.equal(signedIn.body.groups[0].joined, true);
  assert.equal(signedIn.body.groups[0].owned, false);
});

// ---------------------------------------------------------------------------
// get-progress stays personal; position-mastery renders signed out
// ---------------------------------------------------------------------------

test('get-progress stays signed-in only and position-mastery never calls it without a token', () => {
  assert.match(PROGRESS_API, /getServerUserWithFallback/);
  assert.match(PROGRESS_API, /status\(401\)/);

  const fetchData = between(MASTERY_PAGE, 'const fetchData = useCallback(', '}, []);');
  const tokenGate = fetchData.indexOf('if (!getAccessToken())');
  const progressCall = fetchData.indexOf("authedFetch('/api/training/get-progress')");
  assert.ok(tokenGate !== -1 && progressCall !== -1 && tokenGate < progressCall);
  assert.match(fetchData, /setSignedOut\(true\);\s*setProgress\(\[\]\);\s*setLoading\(false\);\s*return;/);
  assert.match(fetchData, /res\.status === 401[\s\S]*setSignedOut\(true\)/);
  assert.match(MASTERY_PAGE, /<TrainingSignInPrompt[\s\S]*returnPath="\/hub\/training\/position-mastery"/);
});

// ---------------------------------------------------------------------------
// client pages
// ---------------------------------------------------------------------------

test('every opened page shows a sign-in prompt with a return path instead of an auth failure', () => {
  assert.match(PROMPT, /\/auth\/login\?redirect=\$\{encodeURIComponent\(path\)\}/);
  assert.match(PROMPT, /!returnPath\.startsWith\('\/\/'\)/);

  assert.match(DAILY_PAGE, /setSignedOut\(data\.viewer === 'anonymous'\)/);
  assert.match(DAILY_PAGE, /returnPath="\/hub\/training\/daily-challenge"/);
  assert.match(DAILY_PAGE, /disabled=\{answered\.current \|\| submitting \|\| signedOut\}/);
  assert.match(DAILY_PAGE, /if \(answered\.current \|\| submitting \|\| !challenge \|\| signedOut\) return;/);

  assert.match(TOURNAMENTS_PAGE, /returnPath="\/hub\/training\/tournaments"/);
  assert.match(TOURNAMENTS_PAGE, /response\.status === 401/);
  assert.match(TOURNAMENT_DETAIL_PAGE, /<TrainingSignInPrompt/);

  assert.match(FINDER_PAGE, /study-group-finder\?join=\$\{encodeURIComponent\(group\.id\)\}/);
  assert.match(FINDER_PAGE, /signedOut \? 'Sign In To Join' : 'Join Group'/);
  const create = between(FINDER_PAGE, 'const createGroup = async () => {', 'setBusy(\'create\')');
  assert.match(create, /if \(signedOut\) \{[\s\S]*return;/, 'a signed-out create never posts');
  const join = between(FINDER_PAGE, 'const joinGroup = useCallback(async (group) => {', 'setBusy(group.id)');
  assert.match(join, /if \(signedOut\) \{[\s\S]*return;/, 'a signed-out join never posts');
});

test('the Personal Assistant daily hand card reads the shared hand without a credential', () => {
  const load = between(ASSISTANT_PAGE, 'const loadDailyHand = async () => {', 'loadDailyHand();');
  assert.match(load, /await fetch\('\/api\/training\/hand-of-the-day'/);
  assert.doesNotMatch(load, /authedFetch|Authorization/);
});

test('no source touched by this package contains emoji or .single()', () => {
  // Pictographic emoji (the SWC hazard). Plain Unicode symbols such as the
  // star and check mark in an existing finder comment are permitted.
  const emoji = /[\u{1F000}-\u{1FAFF}]|\u{FE0F}/u;
  for (const [name, source] of Object.entries({
    DAILY_API, TOURNAMENTS_API, GROUPS_API, DAILY_PAGE, TOURNAMENTS_PAGE,
    TOURNAMENT_DETAIL_PAGE, FINDER_PAGE, MASTERY_PAGE, PROMPT,
  })) {
    assert.doesNotMatch(source, emoji, `${name} contains emoji`);
    assert.doesNotMatch(source, /\.single\(\)/, `${name} uses .single()`);
  }
});
