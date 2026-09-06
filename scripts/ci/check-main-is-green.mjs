/**
 * A CHECK THAT IS RED ON main AND BLOCKS NOBODY STOPS BEING A CHECK.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * `Global Footer E2E` failed on EVERY run on `main` from 2026-09-04 onward. It
 * was found on 2026-09-06, by accident, while looking at something else.
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
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────
 * Ask GitHub for recent completed runs on `main`, keep the newest run per
 * workflow, and report any workflow whose newest run FAILED - with how long it
 * has been failing and over how many consecutive runs. Exits non-zero when
 * anything is over the threshold, so the caller can raise one issue naming all
 * of them.
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
 * That is the distinction the Global Footer E2E case was made of.
 *
 * Usage:
 *   node scripts/ci/check-main-is-green.mjs                # 6h threshold
 *   MAIN_RED_HOURS=24 node scripts/ci/check-main-is-green.mjs
 *
 * Needs GITHUB_TOKEN (Actions: read) and GITHUB_REPOSITORY, both of which a
 * workflow already has.
 */
import process from 'node:process';

const REPO = process.env.GITHUB_REPOSITORY || 'Smarter-Poker/Smarter-Poker-World-Hub';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const HOURS = Number(process.env.MAIN_RED_HOURS || 6);
const BRANCH = process.env.MAIN_RED_BRANCH || 'main';
/**
 * ── IT USED TO SAMPLE, AND SAMPLING HAS A BLIND SPOT (fixed 2026-09-06) ──────
 * The first version read the last 300 completed runs on `main` and took the
 * newest run per workflow. Measured hours later: that window contained only
 * SEVENTEEN of the repo's THIRTY-EIGHT active workflows. The busy ones crowd
 * out the quiet ones - and a workflow that runs rarely is exactly the one whose
 * red goes unnoticed, which is the entire subject of this file.
 *
 * `Global Footer E2E` proved it. It had been failing on main since 2026-09-04,
 * it is the case this detector was written for, and this detector could not
 * see it, because its last run had fallen off the end of the window.
 *
 * So the workflows are ENUMERATED and each is asked for its own latest run on
 * main. It costs one request per workflow instead of three in total, and there
 * is no window for anything to fall out of.
 */

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

let workflows = [];
try {
  const d = await api(`/repos/${REPO}/actions/workflows?per_page=100`);
  workflows = (d.workflows || []).filter((w) => w.state === 'active');
} catch (err) {
  // Fail OPEN. A watchdog that reports an outage because it could not reach the
  // API teaches people to ignore it.
  console.log(`Could not list workflows (${err.message}); skipping.`);
  process.exit(0);
}

if (workflows.length === 0) {
  console.log('No active workflows found.');
  process.exit(0);
}

// Ask each workflow for ITS OWN recent runs on the branch. A few per workflow
// is enough to count a failure streak, and nothing can fall out of a window.
const byWorkflow = new Map();
let unreadable = 0;
for (const w of workflows) {
  try {
    const d = await api(
      `/repos/${REPO}/actions/workflows/${w.id}/runs?branch=${encodeURIComponent(BRANCH)}&status=completed&per_page=10`
    );
    const list = d.workflow_runs || [];
    if (list.length) byWorkflow.set(w.name, list);
  } catch {
    unreadable++;
  }
}

if (byWorkflow.size === 0) {
  console.log(`Could not read runs for any of ${workflows.length} workflows; skipping.`);
  process.exit(0);
}
const runs = [...byWorkflow.values()].flat();

const now = Date.now();
const red = [];

for (const [name, list] of byWorkflow) {
  const latest = list[0];
  if (latest.conclusion !== 'failure') continue;

  // How many consecutive failures, and when did the rot start?
  let consecutive = 0;
  let firstBad = latest;
  for (const r of list) {
    if (r.conclusion !== 'failure') break;
    consecutive++;
    firstBad = r;
  }

  const hours = (now - new Date(firstBad.created_at)) / 3_600_000;
  const lastGreen = list.find((r) => r.conclusion === 'success');

  red.push({
    name,
    consecutive,
    hours,
    since: firstBad.created_at,
    url: latest.html_url,
    lastGreen: lastGreen ? lastGreen.created_at : null,
    seen: list.length,
  });
}

// Open issues, so a workflow that already raised one is not double-reported.
let openIssues = [];
try {
  const d = await api(`/repos/${REPO}/issues?state=open&per_page=100&sort=updated`);
  openIssues = Array.isArray(d) ? d.filter((i) => !i.pull_request) : [];
} catch {
  openIssues = []; // no issues readable -> treat everything as silent, which errs loud
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
const hasOpenAlarm = (name, since) => {
  const needle = name.toLowerCase();
  const sinceMs = new Date(since).getTime();
  return openIssues.some((i) => {
    const touched = new Date(i.updated_at).getTime();
    if (touched < sinceMs) return false;
    const hay = `${i.title} ${i.body || ''}`.toLowerCase();
    return hay.includes(needle);
  });
};

const hrs = (h) => (h >= 48 ? `${(h / 24).toFixed(1)} days` : `${h.toFixed(1)}h`);

console.log(
  `Asked ${workflows.length} active workflow(s) for their latest run on ${BRANCH}; ` +
    `${byWorkflow.size} have run there` +
    (unreadable ? `, ${unreadable} unreadable` : '') +
    `.`
);

if (red.length === 0) {
  console.log(`OK - every workflow's latest run on ${BRANCH} is green or neutral.`);
  process.exit(0);
}

red.sort((a, b) => b.hours - a.hours);
for (const r of red) r.loud = hasOpenAlarm(r.name, r.since);

// Alarm only on SILENT failures that have outlived the threshold. Under it is a
// normal transient - somebody broke main a moment ago and is probably already
// fixing it.
const overdue = red.filter((r) => r.hours >= HOURS && !r.loud);

console.log('');
for (const r of red) {
  const mark = r.loud ? 'loud ' : r.hours >= HOURS ? 'SILENT' : 'fresh';
  console.log(
    `  ${mark} ${r.name} - ${r.consecutive} consecutive failure(s) over ${hrs(r.hours)}` +
      (r.lastGreen ? `, last green ${r.lastGreen}` : ', no green run in the window') +
      (r.loud ? ' [an open issue already names it]' : '')
  );
}
console.log('');

if (overdue.length === 0) {
  const loud = red.filter((r) => r.loud).length;
  console.log(
    `Nothing silent past ${HOURS}h. ${loud} failing workflow(s) already have an open issue; ` +
      `${red.length - loud - overdue.length} are still fresh.`
  );
  process.exit(0);
}

const lines = overdue.map(
  (r) =>
    `- **${r.name}** - ${r.consecutive} consecutive failures over ${hrs(r.hours)}` +
    (r.lastGreen ? `, last green \`${r.lastGreen}\`` : ', no green run in the scanned window') +
    `\n  ${r.url}`
);

console.log('::group::report');
console.log(lines.join('\n'));
console.log('::endgroup::');

console.error('');
console.error(
  `::error title=SILENTLY RED ON ${BRANCH.toUpperCase()}::${overdue.length} workflow(s) have been failing on ${BRANCH} for over ${HOURS}h with no open issue naming them: ${overdue
    .map((r) => r.name)
    .join(', ')}`
);
process.exit(1);
