import { createHash } from 'node:crypto';

const VOLATILE_FIELDS = new Set([
  'last_checked_at',
  'last_scraped',
  'last_scraped_at',
  'last_successful_scrape',
  'last_verified_at',
  'next_check_at',
  'scrape_status',
  'updated_at',
]);

export function sha(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalMaterial(value) {
  if (Array.isArray(value)) return value.map(canonicalMaterial);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => !VOLATILE_FIELDS.has(key))
    .sort()
    .map((key) => [key, canonicalMaterial(value[key])])
    .filter(([, entry]) => entry !== undefined));
}

export function materialSha(venues) {
  return sha(canonicalMaterial(venues || []));
}

async function fetchJson(url, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return { response, json: await response.json() };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCompleteDirectory({
  sourceOrigin,
  fetchImpl = fetch,
  pageSize = 1000,
  timeoutMs = 30_000,
}) {
  const rows = [];
  let offset = 0;
  let candidateCount = null;
  let revision = null;
  let firstResponse = null;

  for (let page = 0; page < 10_000; page += 1) {
    const url = new URL('/api/poker/venues', sourceOrigin);
    url.searchParams.set('view', 'directory');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    const { response, json } = await fetchJson(url, { fetchImpl, timeoutMs });
    if (!json.success || !Array.isArray(json.data)) throw new Error('Directory source returned an invalid public venue projection');
    if (json.degraded === true || json.data_source === 'static_snapshot') {
      throw new Error('Directory source is degraded; refusing to use snapshot-backed data');
    }
    if (!firstResponse) firstResponse = response;

    const pageRevision = String(json.data_revision || response.headers.get('x-pnm-data-revision') || '');
    if (revision && pageRevision && revision !== pageRevision) {
      throw new Error('Directory revision changed during pagination; retry from a stable generation');
    }
    revision ||= pageRevision;
    const reportedTotal = Number(json.total);
    if (Number.isFinite(reportedTotal) && reportedTotal >= 0) {
      if (candidateCount != null && reportedTotal !== candidateCount) {
        throw new Error('Directory candidate count changed during pagination; retry from a stable generation');
      }
      candidateCount = reportedTotal;
    }

    rows.push(...json.data);
    offset += pageSize;
    if (candidateCount != null ? offset >= candidateCount : json.data.length < pageSize) break;
    if (page === 9_999) throw new Error('Directory pagination exceeded the safety limit');
  }

  if (rows.length === 0) throw new Error('Directory source did not return any public venues');
  const ids = rows.map((venue) => String(venue?.id || '')).filter(Boolean);
  if (ids.length !== rows.length || new Set(ids).size !== ids.length) {
    throw new Error('Directory pagination returned missing or duplicate venue identities');
  }
  return {
    candidateCount: candidateCount ?? rows.length,
    dataRevision: revision || null,
    response: firstResponse,
    venues: rows,
  };
}

export async function fetchHealth({ sourceOrigin, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const url = new URL('/api/health', sourceOrigin);
  return (await fetchJson(url, { fetchImpl, timeoutMs })).json;
}
