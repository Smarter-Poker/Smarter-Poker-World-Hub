/**
 * A PULL REQUEST WITH NO CHECKS IS NOT WAITING. IT IS STUCK, FOREVER, SILENTLY.
 *
 * ── WHAT HAPPENS ─────────────────────────────────────────────────────────────
 * `agent-open-pr.yml` opens the pull request with the first token it can get:
 * the Autopilot App, then `GH_PAT`, then `GITHUB_TOKEN`. That file already
 * knows the last one is different, and says so in its own comment:
 *
 *     "opened with GITHUB_TOKEN (sweep must rescue events)"
 *
 * **GitHub fires no `pull_request` events for a pull request created with
 * `GITHUB_TOKEN`** - deliberately, so that a workflow cannot trigger itself. So
 * none of the `on: pull_request` workflows ever run: no CI, no Build Safety
 * Gate, no Global Footer E2E. Not late - never.
 *
 * `agent-open-pr` then arms squash auto-merge, correctly and immediately. The
 * result is the worst shape a pipeline has: a pull request that LOOKS healthy.
 * It is open, it is armed, it reports itself waiting for required checks - and
 * the checks it waits for do not exist and will never be created. GitHub does
 * not even compute `mergeable`; every one of these reads `unknown`.
 *
 * The sweep that comment relies on does not rescue this. The every-30-minutes
 * pass in `agent-autopilot` ARMS auto-merge, and arming was never the missing
 * part. Nothing in the estate re-creates the absent check runs, and nothing
 * notices they are absent.
 *
 * ── MEASURED, 2026-09-06 ─────────────────────────────────────────────────────
 * Found by accident while verifying an unrelated fix, which is the same way
 * `Global Footer E2E` was found two days earlier. The first sweep looked only
 * at the two busy repos and found seven. Widening it to the estate - the exact
 * correction `check-main-is-green.mjs` had to make a day earlier, for the same
 * reason - found two more that nobody had looked at in over a week:
 *
 *   PepNationLab #89    add agent playbook and rules            210 hours idle
 *   PepNationLab #117   super agent price floor                 210 hours idle
 *   World Hub    #1308  five money routes respect the freeze     58 hours idle
 *   World Hub    #1329  no feather on the frame alpha            50 hours idle
 *   Club Arena   #3143  profile phase 2, 270 files               19 hours idle
 *   Club Arena   #3167  handoff, card presentation               17 hours idle
 *   World Hub    #1384  diamond wallet realism                   16 hours idle
 *   Club Arena   #3009  remove direct payment rails               7 hours idle
 *   Club Arena   #3286  realtime phase 6                          1 hour idle
 *
 * Nine pull requests, zero check runs between them, every one armed to merge.
 * Two touch money routes. The oldest pair had been sitting for nine days with
 * nobody told, because there was nothing to tell anybody.
 *
 * So this sweeps all seven repos from its first line. A detector scoped to one
 * repo reports that the estate is fine because the room it is standing in is.
 *
 * This is CLAUDE.md 10.83 one level up. That law says a check nobody can see is
 * not a check. This says a pull request nobody can merge is not a pull request,
 * and it fails in the same direction: quietly, looking fine.
 *
 * ── WHAT THIS DOES ───────────────────────────────────────────────────────────
 * Sweeps the estate for open pull requests with NO `pull_request` workflow run
 * on their head sha, past a grace period.
 *
 * With `--repair` it also fixes them, and the repair is the cheap one: close the
 * pull request and reopen it. A `reopened` event is in the default activity set
 * for `on: pull_request`, so every gate runs on the next tick. It changes no
 * code, moves no branch and merges nothing - it only lets the pipeline that was
 * supposed to run, run.
 *
 * THE REPAIR NEEDS AN EVENT-FIRING TOKEN. Reopening with `GITHUB_TOKEN` fires no
 * events either, which would close the loop on itself and teach everyone that
 * the repair does not work. So the repair refuses to run under `GITHUB_TOKEN`
 * and says why, rather than doing something that merely looks like a fix.
 *
 * Usage:  node scripts/ci/check-prs-can-actually-merge.mjs [--repair]
 * Needs:  GITHUB_TOKEN to read; an App token or GH_PAT to repair
 * Exits:  0 nothing stuck, or all repaired - 1 something is stuck - 2 cannot tell
 */
import process from 'node:process';

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
  const raw = (process.env.STUCK_PR_REPOS || '').trim();
  if (!raw) return ESTATE;
  if (raw === 'self') return [SELF];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
})();

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
/**
 * Grace period. A pull request opened seconds ago has no runs yet and is not
 * stuck, it is new. Thirty minutes is comfortably past the worst runner queue
 * this estate has measured - 14 minutes on 2026-09-04, before the World Hub
 * was given twelve more runners.
 */
const MINUTES = Number(process.env.STUCK_PR_MINUTES || 30);
const REPAIR = process.argv.includes('--repair');

if (!TOKEN) {
  console.log('No GITHUB_TOKEN; skipping (a watchdog that cannot ask is not a failure).');
  process.exit(0);
}

const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'smarter-poker-stuck-prs',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { ok: res.ok, status: res.status, json };
};

const mins = (m) => (m >= 120 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);

/**
 * `GITHUB_TOKEN` is an installation token for github-actions[bot], and it is
 * the one token whose writes fire no events. Asking who we are is the only
 * reliable way to know: the value is opaque, and the workflow may have handed
 * us any of three.
 */
const whoAmI = async () => {
  const me = await api('/user');
  if (me.ok && me.json && me.json.login) return me.json.login;
  const app = await api('/installation/repositories?per_page=1');
  if (app.ok) return 'app-installation';
  return 'unknown';
};

const scan = async (repo) => {
  const prs = await api(`/repos/${repo}/pulls?state=open&per_page=100`);
  if (!prs.ok || !Array.isArray(prs.json)) return { repo, unreadable: String(prs.status) };
  const now = Date.now();
  const stuck = [];
  for (const pr of prs.json) {
    const idle = (now - new Date(pr.updated_at).getTime()) / 60000;
    if (idle < MINUTES) continue;
    const runs = await api(`/repos/${repo}/actions/runs?head_sha=${pr.head.sha}&per_page=30`);
    if (!runs.ok) continue; // cannot tell; never an alarm
    const fromPr = ((runs.json && runs.json.workflow_runs) || []).filter((r) => r.event === 'pull_request');
    if (fromPr.length === 0) {
      stuck.push({ number: pr.number, branch: pr.head.ref, idle, title: pr.title });
    }
  }
  return { repo, open: prs.json.length, stuck };
};

const results = [];
for (const repo of REPOS) results.push(await scan(repo));

const unreadable = results.filter((r) => r.unreadable);
const readable = results.filter((r) => !r.unreadable);

for (const r of unreadable) console.log(`  ??   ${r.repo} - could not list pull requests (${r.unreadable})`);

if (readable.length === 0) {
  console.log('Could not read any repo; reporting nothing.');
  process.exit(2);
}

const stuck = readable.flatMap((r) => r.stuck.map((s) => ({ ...s, repo: r.repo })));
const totalOpen = readable.reduce((n, r) => n + r.open, 0);

console.log(`Swept ${readable.length} repo(s), ${totalOpen} open pull request(s).`);

if (stuck.length === 0) {
  console.log('OK - every open pull request has had its gates run.');
  process.exit(0);
}

for (const s of stuck) {
  console.log(`  STUCK ${s.repo}#${s.number}  ${mins(s.idle).padStart(6)} idle  ${s.branch}`);
}
console.log('');

if (!REPAIR) {
  console.error(
    `::error title=PULL REQUESTS THAT CAN NEVER MERGE::${stuck.length} open pull request(s) have no ` +
      `pull_request workflow run at all, so their required checks will never exist and auto-merge can ` +
      `never be satisfied. They were opened with GITHUB_TOKEN, which fires no pull_request events. ` +
      `Re-run with --repair, or close and reopen each one by hand.`
  );
  for (const s of stuck) console.error(`  ${s.repo}#${s.number} (${mins(s.idle)} idle): ${s.title}`);
  process.exit(1);
}

const who = await whoAmI();
if (who === 'github-actions[bot]') {
  console.error(
    '::error title=REPAIR NEEDS A TOKEN THAT FIRES EVENTS::this is GITHUB_TOKEN, whose reopen fires no ' +
      'pull_request events either - the repair would report success and change nothing, which is worse ' +
      'than not running at all. Pass the Autopilot App token or GH_PAT.'
  );
  process.exit(1);
}
console.log(`Repairing as ${who} - close, then reopen; a reopened event runs every gate.`);

let failed = 0;
for (const s of stuck) {
  const shut = await api(`/repos/${s.repo}/pulls/${s.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
  if (!shut.ok) {
    console.error(`  ${s.repo}#${s.number}: could not close (${shut.status}); left exactly as it was.`);
    failed++;
    continue;
  }
  const open = await api(`/repos/${s.repo}/pulls/${s.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'open' }),
  });
  if (!open.ok) {
    // Never leave one closed. This is the only step here that can do harm.
    console.error(
      `  ${s.repo}#${s.number}: REOPEN FAILED (${open.status}) AND IT IS NOW CLOSED. Reopen it by hand.`
    );
    failed++;
    continue;
  }
  console.log(`  ${s.repo}#${s.number}: reopened; its gates run on the next tick.`);
}

if (failed) {
  console.error(`\n${failed} of ${stuck.length} could not be repaired.`);
  process.exit(1);
}
console.log(`\nRepaired all ${stuck.length}. Their checks run now; a red one still blocks, as it should.`);
process.exit(0);
