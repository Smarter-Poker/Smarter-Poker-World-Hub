#!/usr/bin/env node
/**
 * scripts/check-push-velocity.mjs
 *
 * Push-velocity watchdog: assert that origin/main has received a commit in
 * the last MAX_AGE_HOURS hours. Auto-opens a GitHub Issue if not (or
 * comments on an existing open one). Designed to catch the class of
 * silent-failure where auto-push agents back off due to a chronic CI
 * red status — like the 3-hour stall on 2026-05-10 caused by the
 * branch-protection-watchdog workflow being added without an allowlist
 * entry in build-safety-gate.yml CHECK 6c.
 *
 * Why a separate watchdog instead of relying on existing CI:
 *   - Agents back off SILENTLY when they see chronic CI failure
 *   - GitHub doesn't natively alert on "push rate dropped"
 *   - Existing checks (build-safety-gate, audit-marker) test commits
 *     that DO arrive — they don't notice commits that DON'T arrive
 *
 * Run modes:
 *   `node scripts/check-push-velocity.mjs`          → check + alert if stale
 *   `node scripts/check-push-velocity.mjs --quiet`  → check only, no issue creation
 *
 * Required env:
 *   GITHUB_TOKEN  — PAT with repo scope on the canonical repo
 *
 * Configurable env (optional):
 *   MAX_AGE_HOURS         — alert if no commit on main in this many hours (default 4)
 *   WORK_HOURS_UTC_START  — only alert during these hours (default 12)
 *   WORK_HOURS_UTC_END    — only alert during these hours (default 4 next-day = 28%24)
 *
 * Exit codes:
 *   0 — push velocity healthy (or outside work hours, no alert needed)
 *   1 — stalled inside work hours; alert was raised (issue created/commented)
 *   2 — environment misconfigured
 */

const REPO_OWNER = 'Smarter-Poker';
const REPO_NAME = 'Smarter-Poker-World-Hub';
const BRANCH = 'main';
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS || 4);
const WORK_START = Number(process.env.WORK_HOURS_UTC_START || 12); // 12 UTC = 5am PT, 8am ET
const WORK_END_RAW = Number(process.env.WORK_HOURS_UTC_END || 4);
const WORK_END = WORK_END_RAW < WORK_START ? WORK_END_RAW + 24 : WORK_END_RAW; // wraps next day

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const QUIET = process.argv.includes('--quiet');
const ISSUE_TITLE = `[watchdog] No commits landed on main in >${MAX_AGE_HOURS}h`;

if (!TOKEN) {
  console.error('[push-velocity] GITHUB_TOKEN env not set');
  process.exit(2);
}

const gh = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

function inWorkHours() {
  const utcHour = new Date().getUTCHours();
  if (WORK_END_RAW < WORK_START) {
    // wraps midnight, e.g. 12-04 next day
    return utcHour >= WORK_START || utcHour < WORK_END_RAW;
  }
  return utcHour >= WORK_START && utcHour < WORK_END;
}

async function getMainHeadAge() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}`,
    { headers: gh }
  );
  if (!res.ok) throw new Error(`GET commit: ${res.status} ${await res.text()}`);
  const c = await res.json();
  const date = new Date(c.commit?.author?.date || c.commit?.committer?.date);
  const ageHours = (Date.now() - date.getTime()) / 3_600_000;
  return { sha: c.sha?.slice(0, 10), date: date.toISOString(), ageHours };
}

async function findOpenIssue() {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?state=open&labels=watchdog-push-velocity&per_page=5`,
    { headers: gh }
  );
  if (!res.ok) return null;
  const list = await res.json();
  return Array.isArray(list) && list.length ? list[0] : null;
}

async function openIssue(body) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ISSUE_TITLE,
        body,
        labels: ['watchdog-push-velocity', 'incident'],
      }),
    }
  );
  if (!res.ok) throw new Error(`POST issue: ${res.status} ${await res.text()}`);
  return res.json();
}

async function commentOnIssue(issueNum, body) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNum}/comments`,
    {
      method: 'POST',
      headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }
  );
  if (!res.ok) throw new Error(`POST comment: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getRecentBuildSafetyGateRun() {
  // Workflow ID for build-safety-gate.yml is 246642998 in this repo
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/246642998/runs?per_page=3&branch=${BRANCH}`,
    { headers: gh }
  );
  if (!res.ok) return null;
  const d = await res.json();
  return (d.workflow_runs || [])[0] || null;
}

(async () => {
  const head = await getMainHeadAge();
  console.log(
    `[push-velocity] origin/${BRANCH} HEAD = ${head.sha} (${head.date}) — age ${head.ageHours.toFixed(2)}h (threshold ${MAX_AGE_HOURS}h)`
  );

  if (head.ageHours < MAX_AGE_HOURS) {
    console.log('[push-velocity] OK — main is fresh.');
    process.exit(0);
  }

  if (!inWorkHours()) {
    console.log(
      `[push-velocity] STALE but currently outside configured work hours (${WORK_START}-${WORK_END_RAW} UTC) — no alert raised.`
    );
    process.exit(0);
  }

  console.error(
    `[push-velocity] STALL DETECTED: no commit on ${BRANCH} in ${head.ageHours.toFixed(1)}h.`
  );

  // Find the latest Build Safety Gate run to surface the likely cause
  const latestRun = await getRecentBuildSafetyGateRun();
  const ciContext = latestRun
    ? `Latest Build Safety Gate run on \`${BRANCH}\`:
- sha: \`${latestRun.head_sha?.slice(0, 10)}\`
- status: ${latestRun.status} / conclusion: ${latestRun.conclusion}
- url: ${latestRun.html_url}`
    : '(no Build Safety Gate runs found)';

  const body = `Watchdog detected that \`main\` has not received a commit in **${head.ageHours.toFixed(1)} hours** (current threshold: ${MAX_AGE_HOURS}h).

**Current HEAD on \`main\`:**
- sha: \`${head.sha}\`
- committed: ${head.date}

**Most likely cause:** auto-push agents (Cowork / Antigravity / Claude Code) detected a chronic red CI status and intentionally stopped pushing per RULE 6 ("verify build green before push"). Check the latest Build Safety Gate run for the failure that's blocking everything.

${ciContext}

**Diagnostic commands:**
\`\`\`bash
# Get the failing job in the latest run
gh run view <run-id> --log-failed

# Or browse to the run URL above
\`\`\`

**Common causes (sorted by 2026-05-10 history):**
1. A scheduled workflow was added without allowlisting it in \`build-safety-gate.yml\` CHECK 6c + CLAUDE.md §11.4 (the 2026-05-10 17:45-22:24 UTC stall)
2. A new \`.single()\` call slipped past CHECK in pre-push hooks
3. \`pages/api/cron/\` grew beyond cap 45
4. \`vercel.json\` crons grew beyond cap 40
5. A real build error on main from a recent merge

If this is a false positive (e.g. holiday/weekend low-activity), close the issue and the watchdog will not re-alert until staleness threshold is exceeded again.`;

  if (QUIET) {
    console.error('[push-velocity] --quiet passed; not creating an issue.');
    console.error('Body that would have been posted:');
    console.error(body);
    process.exit(1);
  }

  const existing = await findOpenIssue();
  if (existing) {
    console.error(`[push-velocity] open issue #${existing.number} already exists; commenting.`);
    await commentOnIssue(
      existing.number,
      `Watchdog re-fired at ${new Date().toISOString()}. Main HEAD age is now ${head.ageHours.toFixed(1)}h.`
    );
  } else {
    const issue = await openIssue(body);
    console.error(`[push-velocity] opened issue #${issue.number}: ${issue.html_url}`);
  }
  process.exit(1);
})();
