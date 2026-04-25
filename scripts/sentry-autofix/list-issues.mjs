// List all unresolved Sentry issues
const SENTRY_API = 'https://sentry.io/api/0';
const ORG_SLUG = 'smarter-software-inc';
const PROJECT_SLUG = process.env.SENTRY_PROJECT_SLUG || ''; // optional filter

async function sentryGet(path) {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error('SENTRY_AUTH_TOKEN is not set');
  const res = await fetch(`${SENTRY_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'smarter-poker-sentry-lister/1.0',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sentry GET ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return { data: await res.json(), link: res.headers.get('link') };
}

async function listAllIssues() {
  const issues = [];
  let cursor = null;
  let page = 0;
  
  while (true) {
    let path = `/organizations/${ORG_SLUG}/issues/?is:unresolved&limit=100`;
    if (cursor) path += `&cursor=${cursor}`;
    
    const { data, link } = await sentryGet(path);
    issues.push(...data);
    page++;
    
    // Parse next cursor from Link header
    const nextMatch = link?.match(/<[^>]+>; rel="next"[^;]*; cursor="([^"]+)"/);
    if (!nextMatch || data.length === 0) break;
    cursor = nextMatch[1];
    if (page > 10) break; // safety cap
  }
  
  return issues;
}

const issues = await listAllIssues();

console.log(`\n=== SENTRY ISSUES (${issues.length} total) ===\n`);
for (const issue of issues) {
  console.log(`[${issue.shortId}] ${issue.title}`);
  console.log(`  Status: ${issue.status} | Level: ${issue.level} | Count: ${issue.count} | Users: ${issue.userCount}`);
  console.log(`  Culprit: ${issue.culprit || 'N/A'}`);
  console.log(`  First: ${issue.firstSeen} | Last: ${issue.lastSeen}`);
  console.log(`  URL: https://smarter-software-inc.sentry.io/issues/${issue.id}/`);
  console.log('');
}

// Output as JSON for processing
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/sentry-issues.json', JSON.stringify(issues, null, 2));
console.log(`\nFull data saved to /tmp/sentry-issues.json`);
