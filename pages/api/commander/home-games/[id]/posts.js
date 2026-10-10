import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { homeGameSocialWriteAccess } from '../../../../../src/lib/home-games/socialPrivacyServer.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const id = req.query.id;
  if (typeof id !== 'string' || !UUID.test(id)) return res.status(400).json({ success: false, error: 'Valid group identifier required' });

  // Canonical Commander retains post creation, validation and persistence.
  // Do not replay a write when its transport acknowledgment is uncertain.
  if (req.method === 'POST') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
      if (req.headers.authorization) headers.Authorization = req.headers.authorization;
      if (req.headers['x-idempotency-key']) headers['X-Idempotency-Key'] = req.headers['x-idempotency-key'];
      const upstream = await fetch(`https://commander.smarter.poker/api/home-games/${encodeURIComponent(id)}/posts`, {
        method: 'POST', headers,
        body: typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body || {}),
        signal: controller.signal, redirect: 'error',
      });
      const body = await upstream.text();
      res.status(upstream.status);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
      for (const name of ['retry-after', 'www-authenticate']) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      return res.send(body);
    } catch (error) {
      console.warn('[home-games posts] upstream unavailable:', error?.name || 'Error');
      return res.status(502).json({ success: false, error: 'Post save unconfirmed. Refresh the group before retrying.' });
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    if (!req.headers.authorization) return res.status(401).json({ success: false, error: 'Authentication required' });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey || !anonKey) throw new Error('Home Games configuration unavailable');
    const service = createClient(url, serviceKey, OPTIONS);
    const { user, error: authError } = await getServerUserWithFallback(req, service);
    if (authError || !user?.id) return res.status(401).json({ success: false, error: 'Authentication required' });
    const access = await homeGameSocialWriteAccess(service, { page_type: 'home_game', linked_entity_id: id }, user.id);
    // This native member feed has always required approved membership. Public
    // profile posts have their separate public projection, not this endpoint.
    if (!access.allowed) return res.status(403).json({ success: false, error: 'Approved Home Game membership required' });
    const caller = createClient(url, anonKey, { ...OPTIONS, global: { headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {} } });
    const scalar = value => Array.isArray(value) ? value[0] : value;
    const limit = Math.min(100, Math.max(1, Number.parseInt(scalar(req.query.limit), 10) || 20));
    const offset = Math.min(10000, Math.max(0, Number.parseInt(scalar(req.query.offset), 10) || 0));
    const query = caller.from('commander_home_posts').select('*, author:author_id (id, display_name, avatar_url)', { count: 'exact' })
      .eq('group_id', id).eq('is_published', true).or('is_hidden.is.null,is_hidden.eq.false');
    const result = await query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit - 1);
    if (result.error) throw result.error;
    return res.status(200).json({ success: true, data: { posts: result.data || [], total: result.count, limit, offset } });
  } catch (error) {
    console.warn('[home-games posts] read unavailable:', error?.code || error?.name || 'Error');
    return res.status(503).json({ success: false, error: 'Home Game posts unavailable' });
  }
}
