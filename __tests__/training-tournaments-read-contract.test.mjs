import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

const API_PATH = 'pages/api/training/tournaments.js';
const PAGE_PATH = 'pages/hub/training/tournaments.js';
const API_SOURCE = readFileSync(API_PATH, 'utf8');
const PAGE_SOURCE = readFileSync(PAGE_PATH, 'utf8');
const USER_ID = '11111111-1111-4111-8111-111111111111';

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

function makeQuery(table, outcomes, calls) {
  const filters = [];
  const query = {
    select(columns) {
      calls.push([table, 'select', columns]);
      return query;
    },
    eq(column, value) {
      filters.push([column, value]);
      calls.push([table, 'eq', column, value]);
      return query;
    },
    order(column, options) {
      calls.push([table, 'order', column, options]);
      return query;
    },
    limit(value) {
      calls.push([table, 'limit', value]);
      return query;
    },
    maybeSingle() {
      return Promise.resolve(outcomes.tournamentDetail);
    },
    then(resolve, reject) {
      const isTournamentDetail = filters.some(([column]) => column === 'tournament_id');
      const result = table === 'training_tournaments'
        ? outcomes.tournamentList
        : isTournamentDetail
          ? outcomes.tournamentEntries
          : outcomes.userEntries;
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function makeClient(overrides = {}) {
  const calls = [];
  const outcomes = {
    tournamentDetail: { data: { id: 'tournament-1', status: 'scheduled' }, error: null },
    tournamentEntries: { data: [], error: null },
    tournamentList: { data: [{ id: 'tournament-1', status: 'scheduled' }], error: null },
    userEntries: { data: [], error: null },
    ...overrides,
  };
  return {
    calls,
    auth: {
      async getUser(token) {
        calls.push(['auth', 'getUser', token]);
        return { data: { user: { id: USER_ID } }, error: null };
      },
    },
    from(table) {
      calls.push([table, 'from']);
      return makeQuery(table, outcomes, calls);
    },
  };
}

async function loadHandler(client) {
  const dependencies = {
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/utils/trainingApiUtils': {
      sanitizeParam: (value) => value,
      withTiming: () => {},
    },
    '../../../src/lib/sentryWrap': { reportApiError: () => {} },
  };
  const module = new SourceTextModule(API_SOURCE, { identifier: API_PATH });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `unexpected dependency: ${specifier}`);
    return new SyntheticModule(Object.keys(exports), function setExports() {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  return module.namespace.default;
}

async function request(client, query) {
  const handler = await loadHandler(client);
  const response = createResponse();
  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
    query,
  }, response);
  return response;
}

test('the lobby sends exact scheduled status and exposes API failures instead of empty results', () => {
  assert.match(PAGE_SOURCE, /\['live', 'scheduled', 'completed'\]/);
  assert.doesNotMatch(PAGE_SOURCE, /\['live', 'upcoming', 'completed'\]/);
  assert.match(PAGE_SOURCE, /status=\$\{activeTab\}/);
  assert.match(PAGE_SOURCE, /!response\.ok \|\| payload\?\.success !== true/);
  assert.match(PAGE_SOURCE, /error: tournamentsError/);
  assert.match(PAGE_SOURCE, /variant="retry"/);
  assert.match(PAGE_SOURCE, /No Empty Results Were Assumed/);
});

test('the lobby subscribes to both canonical tournament tables and no commander table', () => {
  assert.match(PAGE_SOURCE, /event: '\*',[\s\S]*?table: 'training_tournaments'/);
  assert.match(PAGE_SOURCE, /event: '\*',[\s\S]*?table: 'training_tournament_entries'/);
  assert.doesNotMatch(PAGE_SOURCE, /commander_tournament_entries/);
});

test('scheduled list requests preserve the exact status through the database filter', async () => {
  const client = makeClient();
  const response = await request(client, { status: 'scheduled' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body?.success, true);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.ok(client.calls.some((call) => (
    call[0] === 'training_tournaments'
      && call[1] === 'eq'
      && call[2] === 'status'
      && call[3] === 'scheduled'
  )));
});

test('the obsolete upcoming status is rejected instead of broadening to every tournament', async () => {
  const client = makeClient();
  const response = await request(client, { status: 'upcoming' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body?.success, false);
  assert.equal(response.body?.code, 'INVALID_TOURNAMENT_STATUS');
  assert.equal(client.calls.some((call) => call[1] === 'from'), false);
});

const FAILURE_CASES = [
  ['tournament detail', { tournamentDetail: { data: null, error: new Error('detail unavailable') } }, { tournamentId: 'tournament-1' }, 'tournament-detail'],
  ['tournament entries', { tournamentEntries: { data: null, error: new Error('entries unavailable') } }, { tournamentId: 'tournament-1' }, 'tournament-entries'],
  ['tournament list', { tournamentList: { data: null, error: new Error('list unavailable') } }, { status: 'live' }, 'tournament-list'],
  ['user entries', { userEntries: { data: null, error: new Error('user entries unavailable') } }, { status: 'completed' }, 'user-entries'],
];

test('every tournament Supabase read error fails closed with an explicit non-200 response', async (t) => {
  for (const [name, overrides, query, operation] of FAILURE_CASES) {
    await t.test(name, async () => {
      const response = await request(makeClient(overrides), query);
      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.body, {
        success: false,
        error: 'Tournament data is temporarily unavailable',
        code: 'TRAINING_TOURNAMENTS_READ_FAILED',
        operation,
      });
    });
  }
});
