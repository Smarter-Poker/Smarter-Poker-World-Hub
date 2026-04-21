/**
 * /api/admin/autofix-status — Autofix Pipeline Status API
 *
 * Returns recent deployment history and autofix activity.
 * Used by the admin dashboard at /hub/admin/autofix
 */

export const config = { maxDuration: 30 };

const TEAM_ID = 'team_SVD8r7AOPH065G3usBxVvrBc';
const PROJECT_ID = 'prj_op66GkZyZcygXQKm76iyycfVFAQx';
const GITHUB_OWNER = 'Smarter-Poker';
const GITHUB_REPO = 'Smarter-Poker-World-Hub';

export default async function handler(req, res) {
  const vercelToken = process.env.VERCEL_TOKEN;
  const ghPat = process.env.GH_PAT;

  if (!vercelToken) {
    return res.status(500).json({ error: 'VERCEL_TOKEN not set' });
  }

  try {
    // Fetch recent deployments
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=20`,
      { headers: { Authorization: `Bearer ${vercelToken}` } }
    );
    if (!deploymentsRes.ok) {
      return res.status(502).json({ error: `Vercel API error: ${deploymentsRes.status}` });
    }
    const deploymentsData = await deploymentsRes.json();
    // Filter to main branch only — preview branch deploys clutter the dashboard
    const deployments = (deploymentsData.deployments || [])
      .filter(d => (d.meta?.githubCommitRef || '') === 'main')
      .map(d => ({
      id: d.uid,
      state: d.state,
      branch: d.meta?.githubCommitRef || 'main',
      createdAt: d.createdAt,
      sha: d.meta?.githubCommitSha?.substring(0, 9) || '',
      message: d.meta?.githubCommitMessage || '',
      isAutofix: (d.meta?.githubCommitMessage || '').includes('[autofix]'),
      buildDuration: d.ready ? Math.round((d.ready - d.buildingAt) / 1000) : null,
    }));

    // Count stats
    const totalDeploys = deployments.length;
    const errorCount = deployments.filter(d => d.state === 'ERROR').length;
    const autofixCount = deployments.filter(d => d.isAutofix).length;
    const autofixSuccess = deployments.filter(d => d.isAutofix && d.state === 'READY').length;
    const autofixFailed = deployments.filter(d => d.isAutofix && d.state === 'ERROR').length;

    // Fetch recent [autofix] commits from GitHub
    let autofixCommits = [];
    if (ghPat) {
      try {
        const commitsRes = await fetch(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=main&per_page=50`,
          { headers: { Authorization: `Bearer ${ghPat}`, Accept: 'application/vnd.github.v3+json' } }
        );
        if (commitsRes.ok) {
          const commits = await commitsRes.json();
          autofixCommits = commits
            .filter(c => c.commit?.message?.includes('[autofix]'))
            .map(c => ({
              sha: c.sha.substring(0, 9),
              message: c.commit.message.split('\n')[0],
              date: c.commit.committer?.date,
              author: c.commit.author?.name,
            }));
        }
      } catch (_) { /* ignore */ }
    }

    // Optimize: Add caching to prevent rate-limiting from Vercel's own API
    // if multiple admins have the dashboard open.
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      pipeline: {
        status: errorCount === 0 ? 'healthy' : 'error',
        pollInterval: '2 minutes',
        engine: 'Claude (Anthropic) + Grok fallback',
        mode: 'direct-to-main',
      },
      stats: {
        totalDeploys,
        errorCount,
        autofixCount,
        autofixSuccess,
        autofixFailed,
        successRate: autofixCount > 0 ? Math.round((autofixSuccess / autofixCount) * 100) : 100,
      },
      deployments,
      autofixCommits,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
