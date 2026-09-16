import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../pages/api/gto/generate-scenario.js', import.meta.url), 'utf8');
const loaderSource = readFileSync(new URL('../src/games/GrokScenarioLoader.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);

function response() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

function compileHandler({ profileError = null } = {}) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/gto/generate-scenario.js',
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const authoredRange = { AA: { raise: 1 } };
  const client = {
    auth: {
      async getUser() { return { data: { user: { id: 'user-1' } }, error: null }; },
    },
    from(table) {
      assert.equal(table, 'profiles');
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() {
          return {
            data: { is_vip: true, vip_tier: 'lifetime', vip_expires_at: null },
            error: profileError,
          };
        },
      };
      return query;
    },
  };
  const positionRange = { UTG: authoredRange, BTN: authoredRange, BB: authoredRange };
  const dependencies = {
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { write: {} } },
    '../../../src/lib/supabaseServerClient': { createClient: () => client },
    '../../../src/lib/sentryWrap': { reportApiError() {} },
    '../../../src/config/solverRanges': {
      RFI: positionRange,
      RFI_20BB: positionRange,
      RFI_50BB: positionRange,
      RFI_200BB: positionRange,
      THREE_BET: { BTN_vs_UTG: authoredRange },
      BB_DEFENSE: { vs_UTG: authoredRange },
      FOUR_BET: { UTG_vs_3bet: authoredRange },
      SQUEEZE: { BTN_vs_UTG_open_MP_call: authoredRange },
      COLD_CALL: {},
      SB_COMPLETE: authoredRange,
      SHOVE_FOLD: { '10BB': positionRange, '15BB': positionRange },
      BB_CALL_VS_SHOVE: { '10BB': { vs_UTG: authoredRange } },
    },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(Object.hasOwn(dependencies, specifier), `unexpected scenario dependency: ${specifier}`);
    return dependencies[specifier];
  }, module, module.exports);
  return module.exports.default;
}

async function invoke(handler, body) {
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer test' }, body }, res);
  return res;
}

test('authored range endpoint never mislabels chip-EV shove references as ICM or bubble solves', () => {
  assert.match(source, /7:\s*\['Push\/Fold'\]/);
  assert.doesNotMatch(source, /case ['"]ICM Spots['"]|case ['"]Bubble Play['"]/);
  assert.match(source, /No payout, field, or bubble inputs are applied/);
  assert.match(source, /dedicated ICM model/);
  assert.doesNotMatch(source, /ICM premium[\s\S]{0,120}10-15%/i);
});

test('caller-supplied scenario and context filters fail closed against the authored contract', async () => {
  const handler = compileHandler();
  const unsupportedType = await invoke(handler, { level: 1, scenarioType: 'Bubble Play' });
  assert.equal(unsupportedType.statusCode, 400);
  assert.equal(unsupportedType.body.code, 'AUTHORED_REFERENCE_TYPE_UNSUPPORTED');

  for (const body of [
    { level: 1, position: 'BB' },
    { level: 1, stackDepth: 37 },
    { level: 1, format: 'MTT Final Table' },
  ]) {
    const unsupportedFilter = await invoke(handler, body);
    assert.equal(unsupportedFilter.statusCode, 400);
    assert.equal(unsupportedFilter.body.code, 'AUTHORED_REFERENCE_FILTER_UNSUPPORTED');
  }

  const unavailable = await invoke(compileHandler({ profileError: new Error('unavailable') }), { level: 1 });
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.code, 'AUTHORED_REFERENCE_ENTITLEMENT_UNAVAILABLE');
});

test('successful authored scenarios carry an executable practice-only provenance contract', async () => {
  const res = await invoke(compileHandler(), {
    level: 1,
    position: 'UTG',
    stackDepth: 100,
    format: 'Authored Local Practice',
    scenarioType: 'Open Raise Range',
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.scenario.solution, { AA: 'raise' });
  assert.equal(res.body.scenario.source, 'AUTHORED_PREFLOP_REFERENCE');
  assert.equal(res.body.scenario.authority, 'authored_local_reference');
  assert.equal(res.body.scenario.authorityStatus, 'practice_only');
  assert.equal(res.body.scenario.practiceOnly, true);
  assert.equal(res.body.scenario.solverGenerated, false);
  assert.equal(res.body.scenario.solverVerified, false);
  assert.equal(res.body.scenario.countsTowardCompletion, false);
  assert.match(res.body.scenario.evidenceDisclosure, /not a provenance-sealed solver export/i);
  assert.equal(res.body.meta.engine, 'AUTHORED_PREFLOP_REFERENCE');
  assert.equal(Object.hasOwn(res.body.scenario, 'rangeSource'), false);
  assert.equal(Object.hasOwn(res.body.meta, 'rangeSource'), false);
});

test('the legacy scenario loader rejects any response missing the practice-only boundary', () => {
  assert.match(loaderSource, /scenario\.authority === 'authored_local_reference'/);
  assert.match(loaderSource, /scenario\.authorityStatus === 'practice_only'/);
  assert.match(loaderSource, /scenario\.practiceOnly === true/);
  assert.match(loaderSource, /scenario\.solverVerified === false/);
  assert.match(loaderSource, /scenario\.countsTowardCompletion === false/);
  assert.doesNotMatch(loaderSource, /real solver-derived|deterministic solver-range API/i);
});

test('the legacy scenario loader enforces that boundary at runtime', async () => {
  const loader = await import('../src/games/GrokScenarioLoader.js');
  const originalFetch = globalThis.fetch;
  const eligible = {
    id: 'authored-1',
    level: 1,
    title: 'Authored Practice',
    solution: { AA: 'raise' },
    authority: 'authored_local_reference',
    authorityStatus: 'practice_only',
    practiceOnly: true,
    solverVerified: false,
    countsTowardCompletion: false,
  };

  try {
    globalThis.fetch = async () => ({
      async json() {
        return { success: true, scenario: { ...eligible, practiceOnly: false } };
      },
    });
    assert.equal(await loader.fetchScenario(1), null);

    globalThis.fetch = async () => ({
      async json() { return { success: true, scenario: eligible }; },
    });
    assert.deepEqual(await loader.fetchScenario(1), eligible);
  } finally {
    loader.clearCache();
    globalThis.fetch = originalFetch;
  }
});
