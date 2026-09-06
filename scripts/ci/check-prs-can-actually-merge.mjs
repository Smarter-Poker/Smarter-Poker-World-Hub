/**
 * A PULL REQUEST WITH NO CHECKS IS NOT WAITING. IT IS STUCK, FOREVER, SILENTLY.
 *
 * ── WHAT HAPPENS ─────────────────────────────────────────────────────────────
 * A pull request needs `pull_request` workflow runs ON ITS CURRENT HEAD SHA.
 * Those are the required checks; without them auto-merge can never be
 * satisfied and the pull request waits forever. There are two ways to end up
 * with none, they need OPPOSITE fixes, and telling them apart is most of what
 * this script is for.
 *
 * **1. It conflicts with `main`.** GitHub runs `on: pull_request` workflows
 * against the MERGE commit (`refs/pull/N/merge`). If the branch conflicts,
 * that ref cannot be produced, so no run is even attempted. Reopening does
 * nothing. The only fix is to merge `origin/main` into the branch - which
 * CLAUDE.md 12 requires anyway, since rebasing is refused here.
 *
 * **2. Something moved the head without firing an event.** GitHub fires no
 * `pull_request` events for anything done with `GITHUB_TOKEN` - deliberately,
 * so a workflow cannot trigger itself. `agent-open-pr.yml` says so in its own
 * log line, "opened with GITHUB_TOKEN (sweep must rescue events)", and the
 * same rule silences a `synchronize` when a workflow pushes to the branch.
 * The pull request then looks healthy - open, auto-merge armed, reporting
 * itself as waiting for checks - and the checks it waits for were never
 * created. THAT one is repaired by closing and reopening it.
 *
 * No sweep rescued either case. `agent-autopilot`'s every-30-minutes pass ARMS
 * auto-merge, and arming was never the missing part.
 *
 * ── MEASURED, 2026-09-06 ─────────────────────────────────────────────────────
 * Found by accident while verifying an unrelated fix - the same way `Global
 * Footer E2E` was found two days earlier, and the second time in one week that
 * the discovery method was "somebody happened to look".
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
 * Nine, zero checks between them, every one armed to merge, two touching money
 * routes, the oldest pair idle for nine days.
 *
 * **All nine turned out to be case 1**, and finding that out cost a wrong fix
 * first: they were reopened, which created no checks at all, because a
 * conflicting pull request has no merge ref to run against. What the reopen DID
 * do was force GitHub to compute `mergeable_state`, which had read `unknown` on
 * every one of them - the answer was `dirty`, nine times.
 *
 * Their history says the rest. #1308's last `pull_request` runs were on sha
 * c3e034066 on 2026-09-04; its head is 1903fe96d, which carries only `Agent
 * Open PR` runs from `push` and `create`. The head moved, nothing re-ran, and
 * the branch drifted into conflict while the pull request went on reporting
 * itself as merely waiting.
 *
 * So a detector that had only known about case 2 would have reported nine
 * pull requests as a token problem and sent the next agent to reopen them
 * again. It classifies now, and says which fix each one needs.
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
 * Grace period, measured against the HEAD COMMIT - not against the pull
 * request's `updated_at`.
 *
 * The first version used `updated_at`, and it hid its own failure. This
 * script's repair closes and reopens the pull request, which UPDATES
 * `updated_at`; so on the next pass every pull request it had just failed to
 * fix looked freshly touched, fell inside the grace period, and was skipped.
 * It printed "every open pull request has had its gates run" while nine were
 * still sitting there with zero checks. Caught the same hour by asking GitHub
 * directly instead of believing the script.
 *
 * Anything that touches a pull request moves `updated_at` - a comment, a
 * label, a bot. The question here is "has THIS head sha had time to collect
 * its checks", so the honest clock is when that commit arrived.
 *
 * Thirty minutes is comfortably past the worst runner queue this estate has
 * measured: 14 minutes on 2026-09-04, before the World Hub was given twelve
 * more runners.
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

/**
 * `mergeable_state` is computed lazily: the first read of a pull request
 * GitHub has not looked at lately returns `unknown`. Ask again rather than
 * treating "I do not know yet" as "not conflicting" - guessing wrong here
 * sends the repair at a pull request it cannot help.
 */
/**
 * Every `mergeable_state` GitHub documents EXCEPT `dirty` (conflicting) and
 * `unknown` (not computed yet). A pull request in one of these has a merge ref,
 * so it could have had checks and did not - which is the defect reopening
 * fixes. Anything outside this set is left alone.
 */
const KNOWN_MERGEABLE_STATES = new Set(['clean', 'blocked', 'behind', 'unstable', 'has_hooks', 'draft']);

const mergeStateOf = async (repo, number) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const pr = await api(`/repos/${repo}/pulls/${number}`);
    if (!pr.ok) return 'unreadable';
    const state = pr.json && pr.json.mergeable_state;
    if (state && state !== 'unknown') return state;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return 'unknown';
};

/** When the current head commit arrived. See MINUTES for why not `updated_at`. */
const headAgeMinutes = async (repo, pr) => {
  const c = await api(`/repos/${repo}/commits/${pr.head.sha}`);
  const when =
    (c.ok && c.json && c.json.commit && c.json.commit.committer && c.json.commit.committer.date) ||
    pr.created_at;
  return (Date.now() - new Date(when).getTime()) / 60000;
};

const scan = async (repo) => {
  const prs = await api(`/repos/${repo}/pulls?state=open&per_page=100`);
  if (!prs.ok || !Array.isArray(prs.json)) return { repo, unreadable: String(prs.status) };
  const stuck = [];
  for (const pr of prs.json) {
    // Runs first: it is one call, and a pull request with checks needs no
    // further questions asked about it. Only the rare bare one costs more.
    const runs = await api(`/repos/${repo}/actions/runs?head_sha=${pr.head.sha}&per_page=30`);
    if (!runs.ok) continue; // cannot tell; never an alarm
    const fromPr = ((runs.json && runs.json.workflow_runs) || []).filter((r) => r.event === 'pull_request');
    if (fromPr.length > 0) continue;
    const idle = await headAgeMinutes(repo, pr);
    if (idle < MINUTES) continue; // genuinely new, not stuck
    const state = await mergeStateOf(repo, pr.number);
    stuck.push({
      number: pr.number,
      branch: pr.head.ref,
      idle,
      title: pr.title,
      state,
      conflicting: state === 'dirty',
      // REPAIR ONLY ON A POSITIVE ANSWER. `unknown` means GitHub has not
      // computed mergeability yet, not that the branch is clean - and it is
      // returned often, for minutes at a time. Reading it as "not conflicting"
      // is what sent the first repair at nine conflicting pull requests it
      // could not help. Absence of an answer is never permission to act.
      repairable: KNOWN_MERGEABLE_STATES.has(state),
    });
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

const conflicting = stuck.filter((s) => s.conflicting);
const eventless = stuck.filter((s) => s.repairable);
const undecidable = stuck.filter((s) => !s.conflicting && !s.repairable);

for (const s of stuck) {
  const why = s.conflicting
    ? 'CONFLICTS with main'
    : s.repairable
      ? `no events (${s.state})`
      : `cannot tell (${s.state})`;
  console.log(`  STUCK ${s.repo}#${s.number}  ${mins(s.idle).padStart(6)} idle  ${why.padEnd(22)} ${s.branch}`);
}
console.log('');

if (undecidable.length) {
  console.log(
    `${undecidable.length} could not be judged: GitHub had not computed mergeable_state. That is not ` +
      `permission to reopen them - it is the absence of an answer. They are reported and left alone, ` +
      `and the next pass asks again.`
  );
}

if (conflicting.length) {
  console.log(
    `${conflicting.length} conflict with main. A conflicting pull request has no merge ref, so no ` +
      `check CAN run on it - reopening one changes nothing. Merge origin/main into the branch ` +
      `(CLAUDE.md 12: never rebase), push, and the gates run themselves.`
  );
}

if (!REPAIR) {
  console.error(
    `::error title=PULL REQUESTS THAT CAN NEVER MERGE::${stuck.length} open pull request(s) have no ` +
      `pull_request workflow run on their head sha, so their required checks do not exist and ` +
      `auto-merge can never be satisfied. ${conflicting.length} conflict with main and need ` +
      `origin/main merged into the branch; ${eventless.length} lost their events (a GITHUB_TOKEN ` +
      `write fires none) and are repaired by closing and reopening them; ${undecidable.length} could ` +
      `not be judged and were left alone.`
  );
  for (const s of stuck) {
    console.error(`  ${s.repo}#${s.number} (${mins(s.idle)} idle, ${s.state}): ${s.title}`);
  }
  process.exit(1);
}

if (eventless.length === 0) {
  console.log('Nothing here is repairable by reopening; every one of them needs main merged in.');
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
console.log(`Repairing ${eventless.length} as ${who} - close, then reopen; a reopened event runs every gate.`);

let failed = 0;
for (const s of eventless) {
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

if (failed || conflicting.length) {
  if (failed) console.error(`\n${failed} of ${eventless.length} could not be repaired.`);
  if (conflicting.length) console.error(`\n${conflicting.length} still need main merged into them by hand.`);
  process.exit(1);
}
console.log(`\nRepaired all ${eventless.length}. Their checks run now; a red one still blocks, as it should.`);
process.exit(0);
