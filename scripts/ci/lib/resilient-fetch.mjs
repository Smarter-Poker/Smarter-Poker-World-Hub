/* ONE RETRY POLICY FOR EVERY CI GATE THAT TALKS TO SUPABASE.
 *
 * Dependency-free on purpose: the Build Safety Gate job does not npm install,
 * so this is a plain relative import with no package behind it.
 *
 * WHY THIS FILE EXISTS.
 *
 * The checks in "Pre-Deploy Safety Checks" are REQUIRED status checks on main.
 * They do not fail alone: when one fails, nothing merges in this repository
 * until a human notices and clicks re-run. Several of them reach over the
 * network to PostgREST, and the network does not care that the gate is
 * required.
 *
 * This has now happened enough times to be a pattern rather than bad luck:
 *
 *   - 2026-08-22, three times in one day, check-economy-invariants was closed
 *     by HTTP 503 PGRST002 while every assertion behind it passed. That file
 *     grew its own retry loop in response, and the reasoning in it was right.
 *   - 2026-08-22, twice hours apart, the same file failed on 57014 "canceling
 *     statement due to statement timeout". The first fix wrapped one of its two
 *     calls and left the other bare, which is why there was a second time.
 *   - 2026-08-24 06:39, check-reward-catalog-drift died on HTTP 503 PGRST002
 *     during a nine-minute window where PostgREST could not reach Postgres at
 *     all. check-phantom-columns, in the same job and the same run, survived it
 *     because it had just been given a retry loop of its own.
 *
 * Two files with two different answers to the same problem is how the third
 * incident happens. The fix for one has to be the fix for all of them, so the
 * next gate added to this job inherits it instead of becoming the next outage.
 *
 * WHAT COUNTS AS TRANSIENT.
 *
 * 5xx, 429, 408, a thrown fetch, an abort, 57014 and PGRST002. PGRST002 arrives
 * as a 503 so the status test already catches it; it is named because it is the
 * most common failure in this estate and the least obviously transient-looking
 * to somebody reading the log for the first time. It is what PostgREST answers
 * while it rebuilds its schema cache, which every DDL migration triggers, and
 * on a schema this size (839 tables) that window is comfortably longer than a
 * naive retry budget.
 *
 * A 4xx that is not 408/429 is us: wrong URL, wrong key, revoked service role.
 * Retrying cannot fix it and only delays an honest failure, so it fails now.
 * A FALSE ASSERTION IS NEVER RETRIED - that is the signal, and retrying it
 * would be hiding it. This helper only ever retries transport.
 *
 * WHY BOTH A PER-ATTEMPT TIMEOUT AND A TOTAL BUDGET.
 *
 * The two failure shapes need opposite things. A 503 fails in milliseconds and
 * wants many cheap retries spread over a long window. A slow-but-alive response
 * wants a generous ceiling: this project's OpenAPI document is 5.7 MB across
 * 839 tables, which measures 3.5-5.5s from a developer machine and does NOT
 * clear 20s from a GitHub runner - a 20s ceiling turned a slow success into a
 * hard failure and blocked the queue, which is the exact harm this file exists
 * to prevent. And with no ceiling at all, a hung socket has nothing to abort it
 * and the step simply sits there.
 *
 * So: a per-attempt AbortSignal ceiling, AND a wall-clock budget across all
 * attempts so seven 60s attempts cannot become seven minutes.
 */

const ATTEMPTS = 7;
const STEP_MS = 5_000;
const MAX_WAIT_MS = 30_000;
const PER_ATTEMPT_TIMEOUT_MS = 60_000;
const TOTAL_BUDGET_MS = 240_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransientStatus(status) {
  return status >= 500 || status === 429 || status === 408;
}

function isTransientBody(body) {
  return body.includes('57014') || body.includes('PGRST002');
}

/**
 * Fetch that retries transport trouble and nothing else.
 *
 * @param {string} label   prefix for log lines, e.g. 'check-phantom-columns'
 * @param {string} target  absolute URL
 * @param {object} [init]  fetch init; a `signal` is added per attempt
 * @param {object} [opts]  { attempts, perAttemptTimeoutMs, totalBudgetMs, parse, exitCode }
 *                         parse: 'json' (default) | 'text' | 'response'
 * @returns {Promise<any>} parsed body, or the Response when parse==='response'
 *
 * On unrecoverable failure it prints why and calls process.exit(1). Callers do
 * not need to handle transport errors, which is the whole point: a caller that
 * has to remember is a caller that will forget.
 */
export async function resilientFetch(label, target, init = {}, opts = {}) {
  const attempts = opts.attempts ?? ATTEMPTS;
  const perAttempt = opts.perAttemptTimeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
  const budget = opts.totalBudgetMs ?? TOTAL_BUDGET_MS;
  const parse = opts.parse ?? 'json';
  // Callers differ: the U4.x gates exit 2, the economy gates exit 1. Preserve
  // whatever the caller already used so this refactor cannot change what a
  // failure looks like from outside.
  const exitCode = opts.exitCode ?? 1;

  const startedAll = Date.now();
  let lastProblem = 'unknown';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const startedAttempt = Date.now();
    try {
      const res = await fetch(target, { ...init, signal: AbortSignal.timeout(perAttempt) });

      if (res.ok) {
        const ms = Date.now() - startedAttempt;
        if (attempt > 1) console.warn(`[${label}] recovered on attempt ${attempt} after ${ms}ms.`);
        if (ms > perAttempt / 4) {
          console.warn(
            `[${label}] response took ${ms}ms against a ${perAttempt}ms ceiling. ` +
              `Raise it before it starts failing.`
          );
        }
        if (parse === 'response') return res;
        if (parse === 'text') return await res.text();
        return await res.json();
      }

      // Read the body once; it is needed both to classify and to report.
      let body = '';
      try {
        body = await res.text();
      } catch {
        body = '<unreadable body>';
      }
      lastProblem = `HTTP ${res.status} ${body.slice(0, 200)}`;
      if (!isTransientStatus(res.status) && !isTransientBody(body)) {
        console.error(`[${label}] ${lastProblem}`);
        console.error(`[${label}] Not retryable - this is a request problem, not the network.`);
        process.exit(exitCode);
      }
    } catch (err) {
      lastProblem =
        err?.name === 'TimeoutError' || err?.name === 'AbortError'
          ? `timed out after ${Date.now() - startedAttempt}ms (ceiling ${perAttempt}ms)`
          : String(err?.message || err);
    }

    const elapsed = Date.now() - startedAll;
    if (attempt >= attempts || elapsed >= budget) break;

    const wait = Math.min(attempt * STEP_MS, MAX_WAIT_MS);
    if (elapsed + wait >= budget) break;
    console.warn(
      `[${label}] transient failure (attempt ${attempt}/${attempts}): ${lastProblem} ` +
        `- retrying in ${wait / 1000}s`
    );
    await sleep(wait);
  }

  const spent = Math.round((Date.now() - startedAll) / 1000);
  console.error(`[${label}] gave up after ${spent}s. Last failure: ${lastProblem}`);
  console.error(`[${label}] This is a TRANSPORT failure, not a failing assertion.`);
  console.error(`[${label}] Check the Supabase project status before touching the code.`);
  process.exit(exitCode);
}
