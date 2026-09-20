/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  A SKIPPED RUN IS NOT A GREEN RUN
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `check-main-is-green.mjs` grouped every completed run on `main` by workflow,
 * took the newest one, and reported the workflow only when THAT run had
 * `conclusion === 'failure'`. Its own success line said the quiet part:
 *
 *     "OK - every workflow's latest run on main is green or neutral."
 *
 * Neutral was being counted as health. It is not health, it is the absence of
 * evidence, and the two are only the same when nothing ever skips.
 *
 * ── MEASURED, 2026-09-09, IN BOTH REPOS ──────────────────────────────────────
 * Club Arena: `Post-Deploy E2E (production)` had failed **24 times in 21 hours
 * with no success at all** and the detector had never once named it. It is a
 * `workflow_run` listener with a concurrency group, so most of its runs end
 * `skipped` (the publish it listens for concluded something other than success)
 * or `cancelled` (a newer run took the lock). In a 300-run window it had 46
 * runs, of which **7 carried a verdict and all 7 were failures** - and the
 * newest run, the only one the detector read, was `cancelled`.
 *
 * Here: `Push Delivery Watchdog` was masked the same way - latest run
 * `cancelled`, with a failed verdict sitting directly behind it. Fixing the
 * detector in one repo and not the other would leave the estate's two copies
 * disagreeing about what red means, which is its own defect.
 *
 * That is not a tuning problem. Any workflow whose runs interleave skips with
 * failures is STRUCTURALLY invisible to "is the newest run a failure", and
 * event-driven workflows interleave by construction. The consecutive-failure
 * walk had the same hole one line further down: it `break`s on any non-failure,
 * so a single skip between two failures reset the clock to zero and put the
 * workflow back under the threshold.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Only a run that reached a VERDICT is evidence about a workflow's health.
 * `success` says green. `failure`, `timed_out` and `startup_failure` say red -
 * the last two were also invisible before, because only the literal string
 * 'failure' counted. `skipped`, `cancelled`, `neutral`, `action_required` and
 * `stale` say nothing at all, and are stepped over rather than believed.
 *
 * ── WHY THE DURATION SAYS "AT LEAST" ─────────────────────────────────────────
 * The caller reads a fixed window of recent runs. A noisy workflow can fill it
 * on its own - Post-Deploy E2E was 46 of 300 - so the oldest failure visible is
 * often not the first one. When the walk consumes every verdict in the window
 * without finding a success, the true duration is longer than measured, and the
 * report says so instead of quoting a number it cannot support. It errs toward
 * under-reporting, never toward a louder alarm than the evidence carries.
 */

/** A run that reached one of these told us something about the workflow. */
export const GREEN = 'success';

/**
 * Red verdicts. `timed_out` and `startup_failure` are failures that the old
 * equality check on the literal 'failure' let through untouched.
 */
export const BAD_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

/** Everything that counts as evidence either way. */
export const VERDICT_CONCLUSIONS = new Set([GREEN, ...BAD_CONCLUSIONS]);

/** Did this run actually decide anything? */
export function isVerdict(run) {
  return VERDICT_CONCLUSIONS.has(run?.conclusion);
}

/** Newest-first list of only the runs that carry a verdict. */
export function verdictRuns(list) {
  return list.filter(isVerdict);
}

/**
 * Classify one workflow's runs (newest first). Returns null when the workflow
 * is healthy or when the window holds no verdict for it at all - "no evidence"
 * is not an alarm, it is a question, and this detector does not page on
 * questions.
 */
export function classifyWorkflow(name, list, now = Date.now()) {
  const verdicts = verdictRuns(list);
  const latest = verdicts[0];
  if (!latest || !BAD_CONCLUSIONS.has(latest.conclusion)) return null;

  let consecutive = 0;
  let firstBad = latest;
  for (const run of verdicts) {
    if (!BAD_CONCLUSIONS.has(run.conclusion)) break;
    consecutive += 1;
    firstBad = run;
  }

  const lastGreen = verdicts.find((r) => r.conclusion === GREEN);

  return {
    name,
    consecutive,
    hours: (now - new Date(firstBad.created_at).getTime()) / 3_600_000,
    since: firstBad.created_at,
    url: latest.html_url,
    lastGreen: lastGreen ? lastGreen.created_at : null,
    seen: list.length,
    verdicts: verdicts.length,
    // Every verdict in the window was bad, so the first one we can see is
    // probably not the first one there was.
    windowLimited: consecutive === verdicts.length,
  };
}

/** Group a flat newest-first run list by workflow name. */
export function groupByWorkflow(runs) {
  const byWorkflow = new Map();
  for (const run of runs) {
    if (!byWorkflow.has(run.name)) byWorkflow.set(run.name, []);
    byWorkflow.get(run.name).push(run);
  }
  return byWorkflow;
}

/** Every workflow whose latest VERDICT was red. */
export function redWorkflows(runs, now = Date.now()) {
  const out = [];
  for (const [name, list] of groupByWorkflow(runs)) {
    const verdict = classifyWorkflow(name, list, now);
    if (verdict) out.push(verdict);
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────────────────
 * A WORKFLOW THAT NEVER RUNS ON main CAN ROT TOO.
 *
 * check-main-is-green exists because `Global Footer E2E` was red on every run
 * for days and nothing said so. It sweeps `?branch=main`.
 *
 * `Global Footer E2E` triggers on `pull_request` and `workflow_dispatch`. It
 * has never produced a run on main in its life. So the detector written
 * because of it cannot see it, and on 2026-09-09 it rotted again - red on
 * every run for sixteen hours, 152 failures in 200 runs, found by accident a
 * second time. The blind spot is structural, not a bug in the sweep: there is
 * nothing on main to look at.
 *
 * WHY THIS NEEDS A DIFFERENT RULE. On main, one red newest run is enough -
 * main is one line of history and a failure there is the repo's failure. Off
 * main, every run belongs to somebody's branch, and one branch that does not
 * build is that branch's problem, not rot. Measured on this repo over the four
 * days after the fix (50 completed runs of that workflow): the worst streak of
 * consecutive failures was 3, across 3 different branches, and the newest run
 * was green. During the outage it was 152 with no green at all.
 *
 * So: a streak long enough to clear that noise floor, AND spread across enough
 * DIFFERENT branches that it cannot be one bad branch. Six across three, by
 * default, which would have fired inside the first hour of the outage and does
 * not fire on the estate as it stands today.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Defaults chosen from measurement, not taste. See the comment above. */
export const PR_ONLY_MIN_CONSECUTIVE = 6;
export const PR_ONLY_MIN_BRANCHES = 3;

/**
 * Classify a workflow whose runs come from many branches.
 *
 * Returns null unless the newest verdicts are an unbroken run of failures that
 * is both long enough and spread across enough branches. Null is the common
 * case and means "this is somebody's branch, not the repo".
 */
export function classifyAcrossBranches(name, list, {
  now = Date.now(),
  minConsecutive = PR_ONLY_MIN_CONSECUTIVE,
  minBranches = PR_ONLY_MIN_BRANCHES,
} = {}) {
  const verdict = classifyWorkflow(name, list, now);
  if (!verdict) return null;                       // newest verdict was green

  const verdicts = verdictRuns(list);
  const branches = new Set();
  for (const run of verdicts) {
    if (!BAD_CONCLUSIONS.has(run.conclusion)) break;
    if (run.head_branch) branches.add(run.head_branch);
  }

  if (verdict.consecutive < minConsecutive) return null;
  if (branches.size < minBranches) return null;

  return { ...verdict, branches: [...branches], branchCount: branches.size };
}
