/**
 * Canonical Commander group forwarding. The former contact-only filesystem
 * handler shadowed the rewrite and broke group details and host PUT/DELETE.
 * Canonical Commander owns membership/privacy and the editable-field list.
 */
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const METHODS = ['GET', 'PUT', 'PATCH', 'DELETE'];
const GROUP_PATH = /^[A-Za-z0-9_-]{1,100}$/;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!METHODS.includes(req.method)) {
    res.setHeader('Allow', METHODS);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const id = req.query.id;
  if (typeof id !== 'string' || !GROUP_PATH.test(id)) {
    return res.status(400).json({ success: false, error: 'Valid group identifier required' });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['x-idempotency-key']) headers['X-Idempotency-Key'] = req.headers['x-idempotency-key'];
    const upstream = await fetch(`https://commander.smarter.poker/api/home-games/groups/${encodeURIComponent(id)}`, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined :
        (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body || {})),
      signal: controller.signal,
      redirect: 'error',
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
    console.warn('[home-games group proxy] upstream unavailable:', error?.name || 'Error');
    return res.status(502).json({ success: false, error: 'Home game service unavailable' });
  } finally {
    clearTimeout(timeout);
  }
}
