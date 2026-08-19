#!/usr/bin/env node
/**
 * scripts/check-vercel-project-uniqueness.mjs
 *
 * Guardrail: enumerate every Vercel project in the Smarter-Poker team that
 * is git-connected to the `Smarter-Poker-World-Hub` repo, and assert exactly
 * one such project exists. The canonical project is `hub-vanguard`
 * (`prj_op66GkZyZcygXQKm76iyycfVFAQx`).
 *
 * Why this exists:
 *   On 2026-05-08 we discovered TWO Vercel projects (`hub-vanguard` and
 *   `smarter-poker-world-hub`) both connected to the same GitHub repo. Every
 *   git push fired a build on BOTH. The duplicate (`smarter-poker-world-hub`)
 *   was misconfigured, so its builds errored or sat in QUEUED forever, fighting
 *   the real project for build-queue concurrency. From the dashboard it looked
 *   like "deployments queued and never built." Root cause: someone (an agent
 *   or AG re-link) created a parallel Vercel project pointing at the same
 *   GitHub source.
 *
 * Run this script:
 *   - Locally: `node scripts/check-vercel-project-uniqueness.mjs`
 *   - Daily via Open Claw (recommended) — exit code 1 if duplicate found, 0 if clean.
 *
 * Required env:
 *   VERCEL_TOKEN     — Personal/team API token with read access to projects.
 *   VERCEL_TEAM_ID   — defaults to `team_SVD8r7AOPH065G3usBxVvrBc` (Smarter-Poker).
 *
 * Exit codes:
 *   0 — exactly one Vercel project links the repo (the canonical `hub-vanguard`)
 *   1 — duplicate detected; prints the offending project IDs so they can be deleted
 *   2 — environment misconfigured (missing VERCEL_TOKEN, API errored, etc.)
 */

const TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_SVD8r7AOPH065G3usBxVvrBc';
const TOKEN = process.env.VERCEL_TOKEN;
const REPO = 'Smarter-Poker-World-Hub';
const REPO_OWNER = 'Smarter-Poker';
const CANONICAL_PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const CANONICAL_PROJECT_NAME = 'hub-vanguard';
// GitHub numeric id for Smarter-Poker/Smarter-Poker-World-Hub. Deployment
// metadata carries this even when the Vercel project reports no `link`, which
// is the only way to catch a duplicate that builds via GitHub App dispatch.
const REPO_ID = 1132365826;
// How many recent deployments to inspect per project in pass 2.
const DEPLOY_SAMPLE = 10;

if (!TOKEN) {
  console.error('[check-vercel-project-uniqueness] VERCEL_TOKEN env not set');
  process.exit(2);
}

async function vercelGet(path) {
  const url = `https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${TEAM_ID}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${path} → ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function listAllProjects() {
  const out = [];
  let next = null;
  do {
    const path = next
      ? `/v9/projects?limit=100&until=${next}`
      : '/v9/projects?limit=100';
    const data = await vercelGet(path);
    out.push(...(data.projects || []));
    next = data.pagination?.next || null;
  } while (next);
  return out;
}

(async () => {
  let projects;
  try {
    projects = await listAllProjects();
  } catch (err) {
    console.error('[check-vercel-project-uniqueness] API error:', err.message);
    process.exit(2);
  }

  // Filter to projects whose git link points at our repo
  const linked = projects.filter((p) => {
    const link = p.link;
    if (!link) return false;
    if (link.type !== 'github') return false;
    return link.repo === REPO && (link.org === REPO_OWNER || link.repoOwner === REPO_OWNER);
  });

  console.log(
    `[check-vercel-project-uniqueness] ${linked.length} project(s) link the ${REPO_OWNER}/${REPO} GitHub repo:`
  );
  for (const p of linked) {
    const isCanonical = p.id === CANONICAL_PROJECT_ID ? '✓ canonical' : '✗ DUPLICATE';
    console.log(`  ${isCanonical}  ${p.name.padEnd(30)} ${p.id}`);
  }

  if (linked.length === 0) {
    console.error(
      `[check-vercel-project-uniqueness] FAIL: no Vercel project is linked to ${REPO_OWNER}/${REPO}.`,
      'Production deploys are broken.'
    );
    process.exit(1);
  }

  if (linked.length > 1) {
    const dupes = linked.filter((p) => p.id !== CANONICAL_PROJECT_ID);
    console.error(
      `[check-vercel-project-uniqueness] FAIL: ${dupes.length} duplicate project(s) link ${REPO_OWNER}/${REPO}:`
    );
    for (const d of dupes) {
      console.error(`  → ${d.name} (${d.id}) — disconnect/delete in Vercel dashboard`);
    }
    console.error(
      `Canonical project must remain: ${CANONICAL_PROJECT_NAME} (${CANONICAL_PROJECT_ID}).`
    );
    process.exit(1);
  }

  // Exactly one project, and it's the canonical one
  if (linked[0].id !== CANONICAL_PROJECT_ID) {
    console.error(
      `[check-vercel-project-uniqueness] FAIL: the single linked project is`,
      `${linked[0].name} (${linked[0].id}), not the canonical`,
      `${CANONICAL_PROJECT_NAME} (${CANONICAL_PROJECT_ID}). Did the canonical project`,
      `get renamed or replaced? Confirm with Dan before assuming this is correct.`
    );
    process.exit(1);
  }

  // ── PASS 2: link-less projects that still BUILD this repo ─────────────────
  //
  // The `link` check above is necessary but NOT sufficient. On 2026-08-19 a
  // second project (`smarter-poker-world-hub`, prj_cAdaLHhlih322O1SjK3pUrcHk2KN)
  // was found building EVERY push to this repo — 20 production deployments in
  // two hours, several CANCELED/BLOCKED — while reporting NO link at all. Pass 1
  // returned a clean "exactly one project" and the duplicate ran unnoticed,
  // burning build minutes and fighting the real project for queue concurrency.
  //
  // Vercel's GitHub App can keep dispatching deployment events to a project
  // whose `link` has been cleared, so the only reliable signal is what actually
  // got built: deployment.meta.githubRepoId.
  const suspects = [];
  for (const p of projects) {
    if (p.id === CANONICAL_PROJECT_ID) continue;
    let deployments = [];
    try {
      const data = await vercelGet(`/v6/deployments?projectId=${p.id}&limit=${DEPLOY_SAMPLE}`);
      deployments = data.deployments || [];
    } catch {
      continue; // a project we cannot read cannot be assessed; pass 1 still applies
    }
    const fromOurRepo = deployments.filter((d) => {
      const m = d.meta || {};
      return String(m.githubRepoId) === String(REPO_ID) || m.githubRepo === REPO;
    });
    if (fromOurRepo.length > 0) {
      suspects.push({ project: p, count: fromOurRepo.length, latest: fromOurRepo[0] });
    }
  }

  if (suspects.length > 0) {
    console.error(
      `[check-vercel-project-uniqueness] FAIL: ${suspects.length} project(s) report NO link to`,
      `${REPO_OWNER}/${REPO} but are still BUILDING it (Vercel GitHub App dispatch):`
    );
    for (const s of suspects) {
      const when = s.latest?.created ? new Date(s.latest.created).toISOString() : 'unknown';
      console.error(
        `  → ${s.project.name} (${s.project.id}) — ${s.count} of the last ${DEPLOY_SAMPLE}`,
        `deployments came from this repo, most recent ${when}. Delete the project`,
        `(clearing its link is not enough — that is exactly how it evaded this check).`
      );
    }
    process.exit(1);
  }

  console.log(
    `[check-vercel-project-uniqueness] OK: exactly one project (${CANONICAL_PROJECT_NAME}) links the repo,`,
    `and no other project is building it.`
  );
  process.exit(0);
})();
