/**
 * A CHECK THAT IS RED ON main AND BLOCKS NOBODY STOPS BEING A CHECK.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * `Global Footer E2E` failed on EVERY run on this repo's `main` from 2026-09-04
 * onward. It was found on 2026-09-06, by accident, while looking at something
 * else.
 *
 * Nothing was broken about the alerting, because there was none. The workflow
 * is not in the `main: no rewinds` ruleset, so a red run blocks no merge, opens
 * no issue and turns nothing a colour anyone looks at. Twenty-odd merges landed
 * on top of it.
 *
 * And when it was finally read, none of the three failures was in the footer.
 * Every footer assertion passed. They were marketplace tests that `npm run
 * build` runs before Next: a retired Daily Pass still pinned by a test, a
 * `annual` -> `yearly` rename applied to the code and not to its test, and two
 * em dashes. All three were changed correctly and left one half behind - which
 * is the ordinary way a repo goes red, and precisely why somebody has to be
 * told.
 *
 * REQUIRED checks cannot reach this state: a red one blocks the merge queue and
 * an agent finds out in minutes. So this detector exists for the others, and
 * the others are the majority.
 *
 * ── IT WATCHED ONE REPO OF SEVEN (fixed 2026-09-06) ──────────────────────────
 * The first version read `GITHUB_REPOSITORY` and nothing else, so it guarded
 * the World Hub and left the other six estate repos with no detector at all.
 * The estate-wide sweep that found that also found what had been hiding in the
 * dark, and both had been red for days with nobody told:
 *
 *   - smarter-poker-commander, `Login Bridge Probe`, red since 2026-09-04. A
 *     Playwright locator asked for the button's `title` tooltip instead of its
 *     accessible name, so it could never match.
 *   - PepNationLab, `Promote to Production`, red since 2026-09-03 - and that
 *     one was not cosmetic. The author gate held one literal address; the
 *     estate had moved squash merges onto its own App the same day, so the gate
 *     refused every commit and PRODUCTION FROZE six commits behind `main` for
 *     three days while the build stayed green.
 *   - PepNationLab, `Lighthouse CI`, red since 2026-08-20, its config file
 *     swept up in an unrelated cleanup of root scripts.
 *
 * A detector scoped to one repo is a detector that reports the estate is fine
 * because the room it is standing in is fine. It sweeps all seven now.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 * For each repo: ask GitHub for recent completed runs on `main`, keep the
 * newest run per workflow, and report any workflow whose newest run FAILED -
 * with how long it has been failing and over how many consecutive runs. Exits
 * non-zero when anything is over the threshold, so the caller can raise one
 * issue naming all of them.
 *
 * Deliberately NOT a list of blessed exceptions. A workflow allowed to be red
 * is a workflow that should be deleted or fixed, and an allowlist here would
 * become the place failures go to be forgotten - which is the bug.
 *
 * ── LOUD FAILURES ARE NOT THE TARGET ─────────────────────────────────────────
 * Some workflows fail ON PURPOSE: `Publish Watchdog` exits non-zero to RAISE an
 * alarm, and when it does it opens or updates a tracked issue. Its red is the
 * product, not a defect, and the first run of this detector flagged it - which
 * would have taught everyone to ignore this detector inside a week.
 *
 * So the discriminator is not "is it red" but "is anybody being told". A
 * failing workflow with an open issue touched since the failures began is
 * already speaking for itself and is reported as `loud`. A failing workflow
 * with nothing open is `SILENT`, and silent is the only thing that alarms.
 * That is the distinction the Global Footer E2E case was made of. Issues are
 * read from the repo that owns the workflow, never from this one - an issue
 * here has never silenced an alarm about another repo's `main`.
 *
 * ── A BLIND SPOT IS LOUDER THAN A RED CHECK ──────────────────────────────────
 * The single-repo version failed OPEN on any API error, which is right when the
 * token is missing or GitHub is down: a watchdog that reports an outage because
 * it could not reach the API teaches people to ignore it.
 *
 * Across seven repos that rule turns dangerous. A token whose installation
 * quietly loses one repository would read six, skip the seventh, and print a
 * clean bill of health for an estate it can no longer see all of - which is
 * this file's own bug, one level up. So:
 *
 *   - NO repo readable  -> exit 0. No token, or GitHub is unwell. Say so.
 *   - SOME readable     -> the unreadable ones are a SCOPE REGRESSION and they
 *                          alarm on their own, because the token demonstrably
 *                          works and simply cannot see that repo any more.
 *
 * Usage:
 *   node scripts/ci/check-main-is-green.mjs                # 6h threshold
 *   MAIN_RED_HOURS=24 node scripts/ci/check-main-is-green.mjs
 *   MAIN_RED_REPOS='owner/a,owner/b' node scripts/ci/check-main-is-green.mjs
 *   MAIN_RED_REPOS=self node scripts/ci/check-main-is-green.mjs   # this repo only
 *
 * Needs a token with Actions:read and Issues:read on every repo in the sweep.
 * A repo-scoped GITHUB_TOKEN can only ever see its own, so the caller mints an
 * owner-scoped App token the way `estate-integrity` does; with a repo-scoped
 * token the six others read as unreadable and say so, rather than reading as
 * green.
 */
import process from 'node:process';

import { classifyAcrossBranches, groupByWorkflow, redWorkflows } from './lib/workflowVerdicts.mjs';

/**
 * The estate, in the same order and with the same names as `REPOS` in Club
 * Arena's `.github/scripts/estate-integrity.sh`. Keep the two in step: a repo
 * that exists in one list and not the other is a repo one guard watches and the
 * other does not.
 */
const ESTATE = [
  'Smarter-Poker/Smarter-Poker-Club-Arena',
  'Smarter-Poker/Smarter-Poker-World-Hub',
  'Smarter-Poker/smarter-poker-commander',
  'Smarter-Poker/commander-shared',
  'Smarter-Poker/smarter-poker-workers',
  'Smarter-Poker/Smarter-Poker-Diamond-Arena',
  'Smarter-Poker/PepNationLab',
];

const SELF = process.env.GITHUB_REPOSITORY || 'Smarter-Poker/Smarter-Poker-World-Hub';
const REPOS = (() => {
  const raw = (process.env.MAIN_RED_REPOS || '').trim();
  if (!raw) return ESTATE;
  if (raw === 'self') return [SELF];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const HOURS = Number(process.env.MAIN_RED_HOURS || 6);
const BRANCH = process.env.MAIN_RED_BRANCH || 'main';
/** Runs to scan. Enough to see several ticks of every workflow. */
const PAGES = 3;

if (!TOKEN) {
  console.log('No GITHUB_TOKEN; skipping (a watchdog that cannot ask is not a failure).');
  process.exit(0);
}

const api = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'smarter-poker-main-is-green',
    },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json();
};

const hrs = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)}h`);

/**
 * Every workflow in one repo whose newest completed run on BRANCH failed.
 * Throws if the repo cannot be read at all, so the caller can tell "green"
 * apart from "invisible".
 */
async function scanRepo(repo) {
  const runs = [];
  for (let page = 1; page <= PAGES; page++) {
    const d = await api(
      `/repos/${repo}/actions/runs?branch=${encodeURIComponent(BRANCH)}&status=completed&per_page=100&page=${page}`
    );
    const batch = d.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }

  // No runs on main at all does not mean nothing to see: a repo whose CI is
  // entirely pull_request-driven would have returned "green" here forever.
  if (runs.length === 0) {
    return { repo, workflows: 0, runs: 0, red: [], prOnly: await scanOffMain(repo, new Set(), Date.now()) };
  }

  // Newest first, then group by workflow.
  //
  // A SKIPPED OR CANCELLED RUN IS NOT A GREEN RUN. This used to read the single
  // newest run per workflow and require `conclusion === 'failure'`. The listing
  // is fetched with `status=completed`, and completed includes `skipped` and
  // `cancelled`, so any workflow that interleaves no-ops with failures was
  // invisible - and an event-driven workflow interleaves by construction.
  // Measured 2026-09-09: `Push Delivery Watchdog` here, and Club Arena's
  // `Post-Deploy E2E (production)` at 24 failures in 21 hours, were both hidden
  // behind a `cancelled` newest run. See ./lib/workflowVerdicts.mjs.
  runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const byWorkflow = groupByWorkflow(runs);

  const now = Date.now();
  const red = redWorkflows(runs, now).map((r) => ({ ...r, repo }));

  // ── AND THE WORKFLOWS THAT NEVER TOUCH main ────────────────────────────
  // Everything above reads ?branch=main. A pull_request-only workflow has
  // nothing there, so it was invisible to the detector written because one of
  // them rotted. `Global Footer E2E` is the case: red on every run for sixteen
  // hours on 2026-09-09 and found by accident, again.
  //
  // These are judged by a stricter rule, because off main every run belongs to
  // somebody's branch - see classifyAcrossBranches for the measured reason.
  const prOnly = await scanOffMain(repo, new Set(byWorkflow.keys()), now);

  return { repo, workflows: byWorkflow.size, runs: runs.length, red, prOnly };
}

/**
 * Workflows with NO runs on BRANCH at all, red across several branches at once.
 *
 * `onMain` is the set of workflow names the main sweep already saw; anything in
 * it is that sweep's business and is skipped here rather than reported twice.
 */
async function scanOffMain(repo, onMain, now) {
  const runs = [];
  for (let page = 1; page <= PAGES; page++) {
    const d = await api(`/repos/${repo}/actions/runs?status=completed&per_page=100&page=${page}`);
    const batch = d.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const out = [];
  for (const [name, list] of groupByWorkflow(runs)) {
    if (onMain.has(name)) continue;                       // the main sweep owns it
    if (list.some((r) => r.head_branch === BRANCH)) continue;  // it does reach main
    const verdict = classifyAcrossBranches(name, list, { now });
    if (verdict) out.push({ ...verdict, repo, prOnly: true });
  }
  return out;
}

/**
 * Open issues in the repo that OWNS the workflow. A workflow already raising
 * its own alarm there is speaking for itself; an issue in some other repo is
 * not evidence that anybody is watching this one.
 */
async function openIssuesFor(repo) {
  try {
    const d = await api(`/repos/${repo}/issues?state=open&per_page=100&sort=updated`);
    return Array.isArray(d) ? d.filter((i) => !i.pull_request) : [];
  } catch {
    return []; // unreadable issues -> treat everything as silent, which errs loud
  }
}

/**
 * Is somebody already being told about this workflow?
 *
 * A tracked alarm names its detector. `Publish Watchdog` puts its own name and
 * the failing sha in the issue it maintains, so a substring match on the
 * workflow name across open issues is enough, provided the issue has been
 * touched since the failures started - a stale issue from last month is not
 * evidence that anyone is watching today.
 */
const hasOpenAlarm = (issues, name, since) => {
  const needle = name.toLowerCase();
  const sinceMs = new Date(since).getTime();
  return issues.some((i) => {
    if (new Date(i.updated_at).getTime() < sinceMs) return false;
    return `${i.title} ${i.body || ''}`.toLowerCase().includes(needle);
  });
};

const results = await Promise.all(
  REPOS.map(async (repo) => {
    try {
      return await scanRepo(repo);
    } catch (err) {
      return { repo, unreadable: err.message };
    }
  })
);

const unreadable = results.filter((r) => r.unreadable);
const readable = results.filter((r) => !r.unreadable);

if (readable.length === 0) {
  // No token reach at all: missing scopes, or GitHub is unwell. Fail OPEN.
  console.log(`Could not read any of the ${REPOS.length} repo(s); skipping.`);
  for (const r of unreadable) console.log(`  ${r.repo}: ${r.unreadable}`);
  process.exit(0);
}

const red = readable.flatMap((r) => r.red);
// Workflows that never touch BRANCH, red across several branches at once.
// Reported separately because the rule that found them is stricter, and saying
// "on 3 branches" is the difference between rot and somebody's bad branch.
const prOnly = readable.flatMap((r) => r.prOnly || []);
for (const r of readable) {
  const mine = [...red, ...prOnly].filter((x) => x.repo === r.repo);
  const issues = mine.length ? await openIssuesFor(r.repo) : [];
  for (const x of mine) x.loud = hasOpenAlarm(issues, x.name, x.since);
}

const totalRuns = readable.reduce((n, r) => n + r.runs, 0);
const totalWorkflows = readable.reduce((n, r) => n + r.workflows, 0);
console.log(
  `Scanned ${totalRuns} completed runs on ${BRANCH} across ${readable.length}/${REPOS.length} repo(s), ${totalWorkflows} workflows.`
);

// A repo the token used to see and no longer can is a blind spot, and a blind
// spot reads as "green" to everybody downstream. It alarms on its own.
for (const r of unreadable) {
  console.log(`  BLIND  ${r.repo} - ${r.unreadable}`);
}

red.sort((a, b) => b.hours - a.hours);
console.log('');
for (const r of red) {
  const mark = r.loud ? 'loud ' : r.hours >= HOURS ? 'SILENT' : 'fresh';
  console.log(
    `  ${mark} ${r.repo} :: ${r.name} - ${r.consecutive} consecutive failure(s) over ${hrs(r.hours)}` +
      (r.lastGreen ? `, last green ${r.lastGreen}` : ', no green run in the window') +
      (r.loud ? ' [an open issue already names it]' : '')
  );
}
if (red.length === 0) console.log(`  every workflow's latest VERDICT on ${BRANCH} is green.`);
console.log('');

for (const r of prOnly) {
  const mark = r.loud ? 'loud ' : r.hours >= HOURS ? 'SILENT' : 'fresh';
  console.log(
    `  ${mark} ${r.repo} :: ${r.name} - never runs on ${BRANCH}; ${r.consecutive} consecutive` +
      ` failure(s) over ${hrs(r.hours)} across ${r.branchCount} branches` +
      (r.lastGreen ? `, last green ${r.lastGreen}` : ', no green run in the window') +
      (r.loud ? ' [an open issue already names it]' : '')
  );
}
if (prOnly.length === 0) {
  console.log(`  no ${BRANCH}-less workflow is failing across several branches at once.`);
}
console.log('');

// Alarm only on SILENT failures that have outlived the threshold. Under it is a
// normal transient - somebody broke main a moment ago and is probably already
// fixing it.
const overdue = [...red, ...prOnly].filter((r) => r.hours >= HOURS && !r.loud);

if (overdue.length === 0 && unreadable.length === 0) {
  const all = [...red, ...prOnly];
  const loud = all.filter((r) => r.loud).length;
  console.log(
    `Nothing silent past ${HOURS}h. ${loud} failing workflow(s) already have an open issue; ` +
      `${all.length - loud} are still fresh.`
  );
  process.exit(0);
}

const lines = [];
if (overdue.length) {
  lines.push(
    ...overdue.map(
      (r) =>
        `- **${r.repo}** :: **${r.name}** - ${r.consecutive} consecutive failures over ${hrs(r.hours)}` +
        (r.prOnly ? ` across ${r.branchCount} branches (it never runs on \`${BRANCH}\`, so no merge is blocked by it)` : '') +
        (r.lastGreen ? `, last green \`${r.lastGreen}\`` : ', no green run in the scanned window') +
        `\n  ${r.url}`
    )
  );
}
if (unreadable.length) {
  lines.push(
    '',
    'Repositories this detector could NOT read, while it could read others. It is blind there, and blind reads as green:',
    ...unreadable.map((r) => `- **${r.repo}** - \`${r.unreadable}\``)
  );
}

console.log('::group::report');
console.log(lines.join('\n'));
console.log('::endgroup::');

console.error('');
if (overdue.length) {
  console.error(
    `::error title=SILENTLY RED ON ${BRANCH.toUpperCase()}::${overdue.length} workflow(s) have been failing on ${BRANCH} for over ${HOURS}h with no open issue naming them: ${overdue
      .map((r) => `${r.repo}::${r.name}`)
      .join(', ')}`
  );
}
if (unreadable.length) {
  console.error(
    `::error title=DETECTOR IS BLIND::${unreadable.length} repo(s) could not be read while others could, so their main is unwatched: ${unreadable
      .map((r) => r.repo)
      .join(', ')}`
  );
}
process.exit(1);
