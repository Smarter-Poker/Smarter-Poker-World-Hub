import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const TOPICS = new Set(['poker', 'casino_slots', 'sports']);
const LIFECYCLES = new Set(['active', 'paused', 'quarantined', 'retired']);
const MODES = new Set(['creator_uploads', 'sports_chart']);
const MUTABLE = new Set([
  'name', 'handle', 'provider_source_id', 'uploads_playlist_id', 'ingest_topic',
  'ingestion_mode', 'lifecycle_status', 'cadence_minutes',
  'max_candidates_per_run', 'expected_daily_candidates', 'region_code',
  'provider_category_id', 'attribution_url', 'operator_notes',
]);

function clients() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !anon || !service) return null;
  return {
    anon: createClient(url, anon, { auth: { persistSession: false } }),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  };
}

async function authorize(req, res, connection) {
  const configured = (process.env.ADMIN_ROUTE_SECRET || '').trim();
  if (configured && req.headers['x-admin-secret'] === configured) return true;
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin session required' });
    return false;
  }
  const { data, error } = await connection.anon.auth.getUser(authorization.slice(7));
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired admin session' });
    return false;
  }
  const profile = await connection.admin.from('profiles').select('is_admin')
    .eq('id', data.user.id).maybeSingle();
  if (profile.error || profile.data?.is_admin !== true) {
    res.status(403).json({ error: 'Admin access required' });
    return false;
  }
  return true;
}

function normalizedPatch(body, creating = false) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (MUTABLE.has(key)) output[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (output.ingest_topic && !TOPICS.has(output.ingest_topic)) throw new Error('Invalid topic');
  if (output.lifecycle_status && !LIFECYCLES.has(output.lifecycle_status)) throw new Error('Invalid lifecycle');
  if (output.ingestion_mode && !MODES.has(output.ingestion_mode)) throw new Error('Invalid ingestion mode');
  for (const key of ['cadence_minutes', 'max_candidates_per_run', 'expected_daily_candidates']) {
    if (output[key] !== undefined && (!Number.isInteger(output[key]) || output[key] < 0)) {
      throw new Error(`Invalid ${key}`);
    }
  }
  if (creating) {
    for (const key of ['name', 'ingest_topic', 'ingestion_mode']) {
      if (!output[key]) throw new Error(`${key} is required`);
    }
    if (output.ingestion_mode === 'creator_uploads' && !output.handle && !output.provider_source_id) {
      throw new Error('A channel handle or stable provider source id is required');
    }
    if (output.ingestion_mode === 'sports_chart') {
      output.provider_source_id ||= `sports-chart-${output.region_code || 'US'}-${output.provider_category_id || '17'}`;
      output.region_code ||= 'US';
      output.provider_category_id ||= '17';
    }
  }
  return output;
}

const SOURCE_COLUMNS = [
  'id', 'name', 'handle', 'provider', 'provider_source_id', 'uploads_playlist_id',
  'ingest_topic', 'ingestion_mode', 'lifecycle_status', 'is_active',
  'cadence_minutes', 'max_candidates_per_run', 'expected_daily_candidates',
  'region_code', 'provider_category_id', 'provider_cursor', 'attribution_url',
  'last_checked_at', 'last_success_at', 'last_new_item_at', 'last_empty_success_at',
  'last_failure_at', 'last_failure_code', 'consecutive_failures',
  'last_candidate_count', 'last_qualified_count', 'quota_units_last_run',
  'clips_found', 'operator_notes', 'updated_at',
].join(',');

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.read)) return;
  res.setHeader('Cache-Control', 'no-store');
  const connection = clients();
  if (!connection) return res.status(500).json({ error: 'Source registry is not configured' });
  if (!(await authorize(req, res, connection))) return;

  try {
    if (req.method === 'GET') {
      const [sourcesResult, runsResult, quotaResult] = await Promise.all([
        connection.admin.from('content_sources').select(SOURCE_COLUMNS)
          .eq('kind', 'youtube_channel').order('ingest_topic').order('name').limit(500),
        connection.admin.from('video_source_ingestion_runs')
          .select('operation_id,source_id,source_name,topic,status,candidates,qualified,inserted,duplicates,rejected,quota_units,failure_code,started_at,completed_at')
          .order('started_at', { ascending: false }).limit(100),
        connection.admin.from('video_source_quota_usage')
          .select('usage_date,units_used,daily_budget,updated_at').order('usage_date', { ascending: false }).limit(7),
      ]);
      const failure = sourcesResult.error || runsResult.error || quotaResult.error;
      if (failure) return res.status(500).json({ error: failure.message });
      const sources = sourcesResult.data || [];
      const capacity = sources.filter((source) => source.is_active && source.lifecycle_status === 'active')
        .reduce((sum, source) => sum + (Number(source.expected_daily_candidates) || 0), 0);
      return res.status(200).json({
        sources,
        recentRuns: runsResult.data || [],
        quota: quotaResult.data || [],
        summary: {
          total: sources.length,
          active: sources.filter((source) => source.is_active && source.lifecycle_status === 'active').length,
          unhealthy: sources.filter((source) => source.lifecycle_status === 'quarantined' || source.consecutive_failures > 0).length,
          configuredDailyCapacity: capacity,
          capacityTarget: 500,
        },
        generatedAt: new Date().toISOString(),
      });
    }

    if (req.method === 'POST') {
      const row = {
        ...normalizedPatch(req.body, true),
        domain: req.body?.ingest_topic === 'sports' ? 'sports' : 'poker',
        kind: 'youtube_channel',
        provider: 'youtube',
        is_active: true,
        rights_status: 'embed_only',
        playback_mode: 'youtube_embed',
      };
      const result = await connection.admin.from('content_sources').insert(row).select(SOURCE_COLUMNS).maybeSingle();
      if (result.error) return res.status(400).json({ error: result.error.message });
      return res.status(201).json({ source: result.data });
    }

    if (req.method === 'PATCH') {
      const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) return res.status(400).json({ error: 'Valid source id required' });
      const patch = normalizedPatch(req.body);
      delete patch.id;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'No supported changes supplied' });
      patch.is_active = patch.lifecycle_status ? patch.lifecycle_status === 'active' : undefined;
      if (patch.is_active === undefined) delete patch.is_active;
      patch.updated_at = new Date().toISOString();
      const result = await connection.admin.from('content_sources').update(patch).eq('id', id).select(SOURCE_COLUMNS).maybeSingle();
      if (result.error) return res.status(400).json({ error: result.error.message });
      if (!result.data) return res.status(404).json({ error: 'Source not found' });
      return res.status(200).json({ source: result.data });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(400).json({ error: error?.message || 'Source registry request failed' });
  }
}
