/**
 * Drive the REAL `pages/api/training/batch-preload.js` handler in-process.
 *
 * Nothing under test is mocked. The route is compiled from source and given
 * its real application modules; only four infrastructure boundaries that
 * cannot exist in a unit process are replaced, and every one sits outside the
 * logic under test:
 *   - the Supabase client (an in-memory fake implementing exactly the
 *     PostgREST/RPC calls the real code issues; the solver-catalog RPC applies
 *     the same filters, ordering and page limit as
 *     `training_solver_spot_candidates_v1`),
 *   - request authentication, the rate limiter and the error reporter.
 *
 * Shared by the attestation real-geometry suite and the campaign game matrix.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nodeRequire = createRequire(import.meta.url);

// Application sources import siblings without a file extension because
// webpack resolves them in production. This hook performs that same extension
// resolution for Node. It never substitutes a module's contents, and it leaves
// CommonJS resolution inside node_modules alone.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL?.startsWith('file:')
      && !context.parentURL.includes('/node_modules/')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      if (!fs.existsSync(base) || fs.statSync(base).isDirectory()) {
        for (const extension of ['.js', '.mjs', '.ts']) {
          if (fs.existsSync(base + extension)) {
            return nextResolve(pathToFileURL(base + extension).href, context);
          }
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

export function withSourceExtension(absolutePath) {
  if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) return absolutePath;
  for (const extension of ['.js', '.mjs', '.ts']) {
    if (fs.existsSync(absolutePath + extension)) return absolutePath + extension;
  }
  return absolutePath;
}

/** Import a repository module by root-relative path (extension optional). */
export const load = (relativePath) => import(
  pathToFileURL(withSourceExtension(path.join(ROOT, relativePath))).href
);

const policyContract = await load('src/lib/training/solverPolicyContract.js');

export const SOLVER_CANDIDATE_RPC = 'training_solver_spot_candidates_v1';

/**
 * In-memory Supabase client. `catalogRows` are served through the bounded
 * solver-catalog RPC with its production filters; every other table starts
 * empty (production today: no admitted artifact, and this harness models an
 * empty `training_question_cache` unless `tables` seeds one).
 */
export function createInMemorySupabase({
  catalogRows = [],
  failCatalogRpc = false,
  tables: seededTables = {},
} = {}) {
  const tables = new Map(Object.entries(seededTables).map(([name, rows]) => [name, structuredClone(rows)]));
  const calls = { rpc: [], catalogRequests: [], catalogPages: 0 };
  const tableRows = (name) => {
    if (!tables.has(name)) tables.set(name, []);
    return tables.get(name);
  };

  function solverCandidates(params) {
    calls.catalogPages += 1;
    calls.catalogRequests.push(structuredClone(params));
    if (failCatalogRpc) {
      return { data: null, error: { message: 'catalog authority unavailable', code: '57014' } };
    }
    const requested = new Set((params.p_family_stacks || [])
      .map((item) => `${item.game_type}|${Number(item.stack_depth)}`));
    const limit = Math.max(1, Math.min(128, Number(params.p_limit ?? 12)));
    const data = catalogRows
      .filter((row) => requested.has(`${row.game_type}|${row.stack_depth}`)
        && (!params.p_position || row.strategy_matrix_v2.position === params.p_position)
        && (!params.p_artifact_id || row.id === params.p_artifact_id)
        && (!params.p_scenario_hash || row.scenario_hash === params.p_scenario_hash)
        && (!params.p_street || row.street === params.p_street)
        && (!params.p_lower_inclusive || row.id >= params.p_lower_inclusive)
        && (!params.p_lower_exclusive || row.id > params.p_lower_exclusive)
        && (!params.p_upper_exclusive || row.id < params.p_upper_exclusive))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .slice(0, limit)
      // PostgREST returns fresh JSON for every call; the engine mutates rows.
      .map((row) => structuredClone(row));
    return { data, error: null };
  }

  // PostgREST builders are thenables that also accept `abortSignal()`; the
  // real persistence wrapper refuses anything else.
  function builder(execute) {
    const query = {
      abortSignal() { return query; },
      then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); },
    };
    return query;
  }

  function rpc(name, params = {}) {
    calls.rpc.push(name);
    return builder(() => {
      if (name === SOLVER_CANDIDATE_RPC) return solverCandidates(params);
      if (name === 'fn_start_training_attempt_v2') {
        return { data: { success: true, attemptId: randomUUID() }, error: null };
      }
      if (name === 'fn_training_attempt_record_served_batch_v1') {
        return { data: { questionCount: (params.p_deliveries || []).length }, error: null };
      }
      throw new Error(`Unexpected RPC at the Supabase boundary: ${name}`);
    });
  }

  function from(tableName) {
    const state = {
      filters: [], write: null, order: null, limit: null, returning: false, single: false,
    };
    const matches = (row) => state.filters.every((filter) => filter(row));
    const execute = () => {
      const rows = tableRows(tableName);
      if (state.write) {
        const conflictColumns = String(state.write.options?.onConflict || '')
          .split(',').map((column) => column.trim()).filter(Boolean);
        const written = [];
        for (const candidate of state.write.rows) {
          const row = structuredClone(candidate);
          if (tableName === 'training_question_cache') {
            // Stands in for the database trigger that seals the policy checksum.
            row.policy_checksum = createHash('sha256')
              .update(policyContract.stablePolicyJson(row.canonical_policy))
              .digest('hex');
          }
          const existingIndex = conflictColumns.length === 0 ? -1 : rows.findIndex((existing) => (
            conflictColumns.every((column) => existing[column] === row[column])
          ));
          if (existingIndex >= 0) {
            if (!state.write.options?.ignoreDuplicates) rows[existingIndex] = row;
            written.push(rows[existingIndex]);
          } else {
            rows.push(row);
            written.push(row);
          }
        }
        return { data: state.returning ? structuredClone(written) : null, error: null };
      }
      let selected = rows.filter(matches);
      if (state.order) {
        const { column, ascending } = state.order;
        selected = [...selected].sort((left, right) => (
          (left[column] < right[column] ? -1 : left[column] > right[column] ? 1 : 0)
            * (ascending ? 1 : -1)
        ));
      }
      if (state.limit !== null) selected = selected.slice(0, state.limit);
      if (state.single) {
        if (selected.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: structuredClone(selected[0] ?? null), error: null };
      }
      return { data: structuredClone(selected), error: null };
    };
    const query = {
      select() { if (state.write) state.returning = true; return query; },
      eq(column, value) { state.filters.push((row) => row[column] === value); return query; },
      in(column, values) { state.filters.push((row) => values.includes(row[column])); return query; },
      gte(column, value) { state.filters.push((row) => row[column] >= value); return query; },
      lte(column, value) { state.filters.push((row) => row[column] <= value); return query; },
      order(column, { ascending = true } = {}) { state.order = { column, ascending }; return query; },
      limit(count) { state.limit = count; return query; },
      upsert(rows, options) { state.write = { rows: Array.isArray(rows) ? rows : [rows], options }; return query; },
      maybeSingle() { state.single = true; return query; },
      abortSignal() { return query; },
      then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); },
    };
    return query;
  }

  return { rpc, from, calls, tables };
}

const ROUTE_INFRASTRUCTURE = Object.freeze([
  '../../../src/lib/serverAuth',
  '../../../src/lib/supabaseServerClient',
  '../../../src/lib/apiRateLimit',
  '../../../src/lib/apiErrorHandler',
]);

/** Compile the real route from source over the given Supabase boundary. */
export async function loadRealBatchPreloadRoute(db, { authUserId }) {
  const source = fs.readFileSync(path.join(ROOT, 'pages/api/training/batch-preload.js'), 'utf8');
  const babel = nodeRequire('@babel/core');
  const compiled = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: 'pages/api/training/batch-preload.js',
    plugins: [nodeRequire('@babel/plugin-transform-modules-commonjs')],
    sourceType: 'module',
  }).code;
  const dependencies = {
    '../../../src/lib/serverAuth': {
      getServerUserWithFallback: async () => ({ user: { id: authUserId }, error: null }),
    },
    '../../../src/lib/supabaseServerClient': { createClient: () => db },
    '../../../src/lib/apiRateLimit': { applyRateLimit: () => true, LIMITS: { read: {} } },
    '../../../src/lib/apiErrorHandler': { reportApiError() {} },
  };
  const specifiers = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (ROUTE_INFRASTRUCTURE.includes(specifier)) continue;
    // Everything else is the real application module.
    dependencies[specifier] = await load(path.join('pages/api/training', specifier));
  }
  const routeModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.ok(dependencies[specifier], `Unexpected batch-preload dependency: ${specifier}`);
    return dependencies[specifier];
  }, routeModule, routeModule.exports);
  return routeModule.exports.default;
}

export function createApiResponse() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    setHeader() { return this; },
    end() { this.headersSent = true; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.headersSent = true; return this; },
  };
}

/**
 * Issue one GET to the real handler. `console.warn` output is captured as the
 * server log (the route's only diagnostic channel) and restored afterwards; a
 * throwaway per-call grading secret is installed, never a deployed credential.
 */
export async function invokeBatchPreload({
  db,
  query,
  authUserId,
  env = {},
  diagnosticsPrefix = null,
}) {
  const handler = await loadRealBatchPreloadRoute(db, { authUserId });
  const response = createApiResponse();
  const previousEnv = {};
  const nextEnv = {
    TRAINING_GRADING_RECEIPT_SECRET: randomBytes(32).toString('hex'),
    ...env,
  };
  for (const [name, value] of Object.entries(nextEnv)) {
    previousEnv[name] = process.env[name];
    if (value === undefined || value === null) delete process.env[name];
    else process.env[name] = value;
  }
  const serverLog = [];
  const originalWarn = console.warn;
  const originalDebug = console.debug;
  console.warn = (...args) => { serverLog.push(args); };
  console.debug = () => {};
  try {
    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-token' },
      query,
    }, response);
  } finally {
    console.warn = originalWarn;
    console.debug = originalDebug;
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  const diagnostics = diagnosticsPrefix
    ? serverLog.filter((args) => args[0] === diagnosticsPrefix).map((args) => JSON.parse(args[1]))
    : [];
  if (response.statusCode >= 500) {
    // Surface the route's own diagnosis; a bare 500 is useless in CI output.
    console.error('[batch-preload harness] route failed', JSON.stringify(serverLog.map((args) => (
      args.map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : arg))
    )), null, 2));
  }
  return { response, serverLog, diagnostics };
}
