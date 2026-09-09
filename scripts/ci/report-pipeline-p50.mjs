#!/usr/bin/env node
/**
 * report-pipeline-p50.mjs - weekly, one self-updating issue.
 *
 * WHY THIS EXISTS. The 2026-09-08 pipeline audit had to excavate every number
 * in it by hand from the Vercel API and `gh run list`, because nothing in
 * either repo records how long shipping takes. Two defects had been costing
 * eleven minutes a push for months in plain sight:
 *
 *   - Phase 1 of git-safe-push.sh deleted the 2.4 GB .next directory and then
 *     Phase 2.5 ran the build that cache exists to accelerate;
 *   - Phase 4 polled production for a sha a squash-merge guarantees will never
 *     be there, so every SUCCESSFUL push ended in DEPLOY_VERIFIED:false.
 *
 * Neither failed a check. Both were arithmetic nobody was doing. This does the
 * arithmetic every week so the next argument about pipeline speed is a lookup.
 *
 * WHERE IT RUNS. Inside publish-watchdog.yml, on the schedule that workflow
 * already has. Not a new `schedule:` trigger (CLAUDE.md 11.3), not Open Claw
 * (it asks GitHub about GitHub - 11.4 makes exactly this argument for the
 * watchdog it lives in), and never the Claude scheduler (10.9).
 *
 * It self-gates to one 30-minute window a week and exits 0 otherwise, so the
 * other 335 ticks cost one date comparison.
 */

const REPO = process.env.GITHUB_REPOSITORY || 'Smarter-Poker/Smarter-Poker-World-Hub';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const FORCE = process.env.FORCE_PIPELINE_REPORT === '1';
const DRY = process.env.DRY_RUN === '1';
const ISSUE_TITLE = 'Pipeline latency, weekly';
const WINDOW_DAYS = 7;

if (!TOKEN) {
  console.error('report-pipeline-p50: no GITHUB_TOKEN - nothing to do.');
  process.exit(0);
}

// --- the gate: Mondays, 09:00-09:29 UTC ------------------------------------
const now = new Date();
if (!FORCE && !(now.getUTCDay() === 1 && now.getUTCHours() === 9 && now.getUTCMinutes() < 30)) {
  console.log(
    `report-pipeline-p50: outside the weekly window (now ${now.toISOString()}), skipping.`
  );
  process.exit(0);
}

const since = new Date(Date.now() - WINDOW_DAYS * 864e5);

async function api(path, params = {}) {
  const url = new URL(`https://api.github.com/repos/${REPO}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, {
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'report-pipeline-p50',
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url.pathname}`);
  return r.json();
}

const quantile = (sorted, q) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null;

const fmt = (s) => {
  if (s === null || !Number.isFinite(s)) return 'n/a';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
};

// --- 1. pull requests: created -> merged -----------------------------------
async function pullRequests() {
  const out = [];
  for (let page = 1; page <= 4; page++) {
    const rows = await api('pulls', { state: 'closed', per_page: 100, page, sort: 'updated', direction: 'desc' });
    if (!rows.length) break;
    let allOlder = true;
    for (const pr of rows) {
      if (!pr.merged_at) continue;
      const merged = new Date(pr.merged_at);
      if (merged < since) continue;
      allOlder = false;
      out.push({ n: pr.number, secs: (merged - new Date(pr.created_at)) / 1000 });
    }
    if (allOlder && page > 1) break;
  }
  return out;
}

// --- 2. main: commit cadence ----------------------------------------------
async function mainCadence() {
  const commits = await api('commits', { sha: 'main', since: since.toISOString(), per_page: 100 });
  const times = commits
    .map((c) => new Date(c.commit.committer?.date || c.commit.author?.date).getTime())
    .sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / 1000);
  return { count: commits.length, gaps: gaps.sort((a, b) => a - b) };
}

// --- 3. runs on main: how many never reached a verdict ---------------------
// A cancelled run is a check that told nobody anything. When pushes arrive
// faster than a job finishes, cancel-in-progress turns the whole suite into
// noise - the shape .agent/audits/2026-08-21-publish-deadlock-and-palette-
// clobber.md describes, and the reason e2e-tests.yml stopped cancelling its
// own main runs on 2026-09-08.
async function mainRunHealth() {
  const byWorkflow = new Map();
  for (let page = 1; page <= 3; page++) {
    const { workflow_runs: runs = [] } = await api('actions/runs', {
      branch: 'main',
      per_page: 100,
      page,
      created: `>=${since.toISOString().slice(0, 10)}`,
    });
    if (!runs.length) break;
    for (const r of runs) {
      const e = byWorkflow.get(r.name) || { total: 0, cancelled: 0, failure: 0 };
      e.total++;
      if (r.conclusion === 'cancelled') e.cancelled++;
      if (r.conclusion === 'failure') e.failure++;
      byWorkflow.set(r.name, e);
    }
  }
  return byWorkflow;
}

// --- 4. the local build gate, from what git-safe-push.sh now records --------
async function localBuildGate() {
  try {
    const { readFileSync } = await import('node:fs');
    const rows = JSON.parse(readFileSync('logs/deploy-history.json', 'utf8'));
    const secs = rows
      .filter((r) => r.action === 'build' && r.duration)
      .map((r) => Number(String(r.duration).replace(/[^\d.]/g, '')))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return secs;
  } catch {
    return [];
  }
}

const [prs, cadence, runHealth, buildGate] = await Promise.all([
  pullRequests(),
  mainCadence(),
  mainRunHealth(),
  localBuildGate(),
]);

const prSecs = prs.map((p) => p.secs).sort((a, b) => a - b);
const noisiest = [...runHealth.entries()]
  .filter(([, v]) => v.total >= 3)
  .sort((a, b) => b[1].cancelled / b[1].total - a[1].cancelled / a[1].total)
  .slice(0, 6);

const lines = [];
lines.push(`Window: last ${WINDOW_DAYS} days, to ${now.toISOString().replace('T', ' ').slice(0, 16)} UTC.`);
lines.push('');
lines.push('## Pull request created to merged');
lines.push('');
lines.push(`| n | p50 | p90 | slowest |`);
lines.push(`|---|---|---|---|`);
lines.push(
  `| ${prSecs.length} | ${fmt(quantile(prSecs, 0.5))} | ${fmt(quantile(prSecs, 0.9))} | ${fmt(prSecs.at(-1) ?? null)} |`
);
lines.push('');
lines.push('## Commits on main');
lines.push('');
lines.push(
  `${cadence.count} commits, median gap ${fmt(quantile(cadence.gaps, 0.5))}, ` +
    `${cadence.gaps.filter((g) => g < 480).length} of ${cadence.gaps.length} gaps under 8 minutes.`
);
lines.push('');
lines.push(
  'That last number is the one to watch. When it is high, a job that needs ' +
    'more than eight minutes to reach its first assertion cannot finish on main, ' +
    'and `cancel-in-progress: true` turns its whole suite into noise.'
);
lines.push('');
lines.push('## Runs on main that never reached a verdict');
lines.push('');
lines.push('| workflow | runs | cancelled | failed |');
lines.push('|---|---|---|---|');
for (const [name, v] of noisiest) {
  lines.push(`| ${name} | ${v.total} | ${v.cancelled} | ${v.failure} |`);
}
if (!noisiest.length) lines.push('| (no workflow ran 3+ times on main this week) | | | |');
lines.push('');
lines.push('## Local build gate (git-safe-push.sh Phase 2.5)');
lines.push('');
if (buildGate.length) {
  lines.push(
    `${buildGate.length} recorded, p50 ${fmt(quantile(buildGate, 0.5))}, ` +
      `fastest ${fmt(buildGate[0])}, slowest ${fmt(buildGate.at(-1))}.`
  );
  lines.push('');
  lines.push(
    'Recorded since 2026-09-08. Before that the script printed its phase ' +
      'durations and nothing collected them, which is why the audit had to ' +
      'call the cold build INFERRED.'
  );
} else {
  lines.push(
    'Nothing recorded yet. `logs/deploy-history.json` collects these from ' +
      'git-safe-push.sh Phase 2.5; a CI checkout only sees what has been pushed.'
  );
}
lines.push('');
lines.push('---');
lines.push('');
lines.push(
  'Written by `scripts/ci/report-pipeline-p50.mjs`, weekly, from ' +
    '`publish-watchdog.yml`. This issue updates itself in place; it is not a ' +
    'new one each week. Background: `.agent/audits/2026-09-08-publish-pipeline-improvements.md`.'
);

const body = lines.join('\n');
console.log(body);

if (DRY) {
  console.log('\n(DRY_RUN=1 - not touching the issue)');
  process.exit(0);
}

const existing = (await api('issues', { state: 'open', per_page: 100, creator: 'app/github-actions' }))
  .concat(await api('issues', { state: 'open', per_page: 100 }))
  .find((i) => i.title === ISSUE_TITLE && !i.pull_request);

const write = async (path, method, payload) => {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'report-pipeline-p50',
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

if (existing) {
  await write(`issues/${existing.number}`, 'PATCH', { body });
  console.log(`\nUpdated issue #${existing.number}.`);
} else {
  const created = await write('issues', 'POST', { title: ISSUE_TITLE, body });
  console.log(`\nOpened issue #${created.number}.`);
}
