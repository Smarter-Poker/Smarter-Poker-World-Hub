// Exact rolling-window, cross-event session deduplication. No visitor rows leave PostHog.
export function qualifiedGuideQuery(start, end) {
  const from = new Date(start).toISOString();
  const to = new Date(end).toISOString();
  if (from >= to || Date.parse(to) - Date.parse(from) > 7 * 86400000) throw new Error('Invalid Window');
  return `SELECT uniqExact(properties.$session_id) AS qualified_visits
FROM events
WHERE timestamp >= toDateTime64('${from}', 3, 'UTC')
  AND timestamp < toDateTime64('${to}', 3, 'UTC')
  AND event IN ('business_hub_goal_selected', 'business_hub_destination_click')
  AND properties.$session_id IS NOT NULL
  AND toString(properties.$session_id) != ''`;
}
export async function loadQualifiedGuideVisits(start, end, options = {}) {
  const env = options.env || process.env;
  const key = env.POSTHOG_REPORTING_API_KEY?.trim();
  const project = env.POSTHOG_REPORTING_PROJECT_ID?.trim();
  if (!key || !/^\d+$/.test(project || '')) return null;
  try {
    const response = await (options.fetch || globalThis.fetch)(`https://us.posthog.com/api/projects/${project}/query/`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: qualifiedGuideQuery(start, end) }, name: 'Smarter Guide Qualified Visits', refresh: 'force_blocking' }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.error || result.query_status?.complete === false || result.results?.length !== 1 || result.results[0]?.length !== 1) return null;
    const count = result.results[0][0];
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  } catch { return null; }
}
