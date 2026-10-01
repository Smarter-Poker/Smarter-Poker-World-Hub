import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^store_[a-z0-9_]{1,64}$/;
const EVENTS = new Set([
  'store_add_to_cart',
  'store_catalog_fallback',
  'store_catalog_page_loaded',
  'store_catalog_viewed',
  'store_checkout_canceled',
  'store_checkout_complete',
  'store_checkout_failed',
  'store_checkout_pending',
  'store_checkout_session_created',
  'store_checkout_started',
  'store_checkout_verification_failed',
  'store_club_purchase_complete',
  'store_club_purchase_failed',
  'store_club_purchase_started',
  'store_diamond_purchase_complete',
  'store_diamond_purchase_failed',
  'store_diamond_purchase_reviewed',
  'store_diamond_purchase_started',
  'store_section_opened',
  'store_viewed',
]);
const ROUTES = new Set(['diamonds', 'vip', 'merch', 'rewards', 'club-shop', 'fulfillment', 'unknown']);
const PROPERTY_KEYS = new Set([
  'type', 'product', 'source', 'items', 'visible', 'matched', 'method', 'status', 'reason',
  'from', 'to',
]);

let client = null;
function getClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Marketplace analytics database is not configured');
  client = createClient(url, key);
  return client;
}

function cleanProperties(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cleaned = {};
  for (const [key, property] of Object.entries(value)) {
    if (!PROPERTY_KEYS.has(key)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof property)) continue;
    cleaned[key] = typeof property === 'string' ? property.slice(0, 100) : property;
  }
  return cleaned;
}

function hasExplicitCrossSiteOrigin(req) {
  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') return true;
  const origin = req.headers?.origin;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== String(host).split(',')[0].trim();
  } catch (_) {
    return true;
  }
}

export default async function handler(req, res) {
  setPrivateCommerceResponse(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'POST only' });
  }
  if (!applyRateLimit(req, res, { max: 120, windowMs: 60_000, scope: 'store-events' })) return;
  if (hasExplicitCrossSiteOrigin(req)) {
    return res.status(403).json({ success: false, error: 'Cross-site event refused' });
  }
  if (Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8') > 2048) {
    return res.status(413).json({ success: false, error: 'Event too large' });
  }

  const eventId = String(req.body?.eventId || '');
  const sessionId = String(req.body?.sessionId || '');
  const eventName = String(req.body?.eventName || '');
  const route = ROUTES.has(req.body?.route) ? req.body.route : 'unknown';
  if (
    !UUID_RE.test(eventId)
    || !UUID_RE.test(sessionId)
    || !EVENT_RE.test(eventName)
    || !EVENTS.has(eventName)
  ) {
    return res.status(400).json({ success: false, error: 'Invalid Marketplace event' });
  }

  try {
    const { error } = await getClient().from('marketplace_funnel_events').upsert(
      {
        event_id: eventId,
        session_id: sessionId,
        event_name: eventName,
        route,
        properties: cleanProperties(req.body?.properties),
      },
      { onConflict: 'event_id', ignoreDuplicates: true }
    );
    if (error) throw error;
    return res.status(202).json({ success: true });
  } catch (error) {
    console.warn('[store-analytics-events]', error?.message || error);
    return res.status(503).json({ success: false, error: 'Event receipt unavailable' });
  }
}
