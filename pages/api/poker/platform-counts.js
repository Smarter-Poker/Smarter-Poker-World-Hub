import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import directorySnapshotData from '../../../data/poker-venue-directory-snapshot.json';
import { applyVenueIntegrity } from '../../../src/lib/poker-near-me/venueIntegrityServer';
import { buildSnapshotVenueDirectory } from '../../../src/lib/poker-near-me/venueDirectoryServer';
import {
  PNM_CATALOG_RETENTION_MAX_AGE_MS,
  PNM_CURRENT_ACTIVITY_MAX_AGE_MS,
  buildCurrentActivityCountContract,
  buildDirectoryCountContract,
  buildPlatformCountEnvelope,
} from '../../../src/lib/poker-near-me/platformCounts';
import { fetchAllRows } from '../../../src/lib/poker-near-me/dailyTournamentData.mjs';

const MAX_CONTRACT_ROWS = 50000;

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

function snapshotDirectoryContract() {
  const metadata = directorySnapshotData?.metadata || {};
  // Counts must degrade to the same projected, integrity-filtered source used by
  // discovery and the sitemap. Falling back to the older broad all-venues export
  // made the lobby claim 512 public venues while only 398 venue routes existed.
  const directory = buildSnapshotVenueDirectory({
    params: { limit: 1000 },
    venues: directorySnapshotData?.venues || [],
    metadata,
  });
  const sourceCandidates = Number(metadata.source_candidate_count);
  return buildDirectoryCountContract({
    catalogActive: null,
    rawPublicRows: Number.isFinite(sourceCandidates) ? sourceCandidates : directory.total,
    integritySummary: directory.data_integrity,
    publicOutput: directory.total,
    source: 'static_snapshot',
    revision: directory.data_revision,
  });
}

async function fetchLiveRows(supabase, cutoffIso, nowIso) {
  return fetchAllRows(() => supabase
      .from('venue_live_tables')
      .select('venue_name,bravo_slug,game_name,tables_running,source,data_quality,observation_kind,scrape_batch_id,scrape_timestamp')
      .gte('scrape_timestamp', cutoffIso)
      .lte('scrape_timestamp', nowIso)
      .order('scrape_timestamp', { ascending: false })
      .order('id', { ascending: false }), { maxRows: MAX_CONTRACT_ROWS });
}

async function liveDirectoryContract(supabase) {
  const fields = [
    'id', 'name', 'city', 'state', 'venue_type', 'latitude', 'longitude', 'lat', 'lng',
    'address', 'phone', 'website', 'logo_url', 'profile_photo_url', 'cover_photo_url',
    'data_quality', 'trust_score', 'is_active', 'is_suppressed', 'canonical_venue_id',
    'location_integrity_revision', 'last_verified_at', 'last_scraped_at', 'last_scraped',
  ].join(',');

  const buildPublicQuery = ({ head = false } = {}) => supabase
    .from('poker_venues')
    .select(head ? 'id' : fields, head ? { count: 'exact', head: true } : undefined)
    .eq('is_active', true)
    .eq('is_suppressed', false)
    .neq('id', 3109)
    .is('canonical_venue_id', null)
    .not('venue_type', 'in', '(series,tour,home_game)');

  const [activeResult, publicCountResult, publicRowsResult] = await Promise.all([
    supabase
      .from('poker_venues')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    buildPublicQuery({ head: true }),
    fetchAllRows(() => buildPublicQuery().order('id', { ascending: true }), {
      maxRows: MAX_CONTRACT_ROWS,
    }),
  ]);

  if (publicCountResult.error) throw publicCountResult.error;
  if (publicRowsResult.error) throw publicRowsResult.error;
  if (publicRowsResult.truncated) throw new Error(`Public directory exceeded ${MAX_CONTRACT_ROWS} rows`);
  const integrity = applyVenueIntegrity(publicRowsResult.rows);
  const newest = integrity.venues
    .flatMap((venue) => [venue?.last_verified_at, venue?.last_scraped_at, venue?.last_scraped])
    .map((value) => Date.parse(String(value || '')))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || 0;
  const revision = `supabase:${publicCountResult.count ?? integrity.venues.length}:${newest}`;

  return {
    contract: buildDirectoryCountContract({
      catalogActive: activeResult.error ? null : activeResult.count,
      rawPublicRows: publicCountResult.count ?? publicRowsResult.rows.length,
      integritySummary: integrity.summary,
      publicOutput: integrity.venues.length,
      source: 'supabase',
      revision,
    }),
    degraded: Boolean(activeResult.error),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  const now = Date.now();
  const supabase = getSupabase();
  let degraded = false;
  let directory;
  let currentTables;
  const degradedSources = [];

  try {
    const result = await liveDirectoryContract(supabase);
    directory = result.contract;
    if (result.degraded) {
      degraded = true;
      degradedSources.push('catalog_active');
    }
  } catch (error) {
    console.warn('[platform-counts] Directory query degraded:', error?.message || error);
    directory = snapshotDirectoryContract();
    degraded = true;
    degradedSources.push('directory');
  }

  try {
    const cutoffIso = new Date(now - Math.max(
      PNM_CURRENT_ACTIVITY_MAX_AGE_MS,
      PNM_CATALOG_RETENTION_MAX_AGE_MS,
    )).toISOString();
    const result = await fetchLiveRows(supabase, cutoffIso, new Date(now).toISOString());
    if (result.truncated) throw new Error(`Current activity exceeded ${MAX_CONTRACT_ROWS} rows`);
    currentTables = {
      ...buildCurrentActivityCountContract(result.rows, { now }),
      truncated: false,
    };
  } catch (error) {
    console.warn('[platform-counts] Current activity query degraded:', error?.message || error);
    currentTables = buildCurrentActivityCountContract([], { now });
    degraded = true;
    degradedSources.push('current_tables');
  }

  try {
    const payload = buildPlatformCountEnvelope({ directory, currentTables, degraded });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ...payload, degraded_sources: degradedSources });
  } catch (error) {
    try { reportApiError(error, req); } catch (_reportError) { /* best effort */ }
    console.warn('[platform-counts] Contract failure:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Count contract unavailable' });
  }
}
