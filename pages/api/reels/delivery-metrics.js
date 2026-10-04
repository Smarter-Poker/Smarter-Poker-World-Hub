import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const SURFACES = new Set(['standalone', 'social', 'library']);
const MODES = new Set(['for-you', 'following', 'latest', 'learning', 'shorts']);
const PLAYBACK = new Set(['youtube_embed', 'native', 'unknown']);
let client;

function bounded(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function serviceClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Reels metrics service is unavailable');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  if (Number(req.headers['content-length'] || 0) > 4_000) {
    return res.status(413).json({ success: false, error: 'Request body too large' });
  }
  const surface = String(req.body?.surface || '');
  const feedMode = String(req.body?.feed_mode || '');
  const playbackType = String(req.body?.playback_type || 'unknown');
  const viewportWidth = bounded(req.body?.viewport_width, 240, 10000);
  if (!SURFACES.has(surface) || !MODES.has(feedMode) || !PLAYBACK.has(playbackType) || viewportWidth === null) {
    return res.status(400).json({ success: false, error: 'Invalid delivery metric' });
  }
  const row = {
    surface,
    feed_mode: feedMode,
    playback_type: playbackType,
    viewport_width: Math.round(viewportWidth),
    startup_ms: bounded(req.body?.startup_ms, 0, 120000),
    dropped_frames: bounded(req.body?.dropped_frames, 0, 1000000),
    decoded_frames: bounded(req.body?.decoded_frames, 0, 100000000),
    memory_mb: bounded(req.body?.memory_mb, 0, 100000),
    transferred_kb: bounded(req.body?.transferred_kb, 0, 10000000),
    battery_level: bounded(req.body?.battery_level, 0, 1),
    data_saver: req.body?.data_saver === true,
  };
  try {
    const { error } = await serviceClient().from('reels_delivery_metrics').insert(row);
    if (error) throw error;
  } catch (error) {
    console.warn('[reels/delivery-metrics] insert failed:', error?.message || 'unknown error');
    return res.status(503).json({ success: false, error: 'Metrics service is unavailable' });
  }
  return res.status(202).json({ success: true });
}
