import { NextApiRequest, NextApiResponse } from 'next';

// MLB StatsAPI relay.
//
// WHY: The prediction engine's Hetzner host is rate-blocked (HTTP 406) by the
// statsapi.mlb.com WAF for datacenter burst traffic, which starves the model of
// per-player data (season stats, gamelogs, lineups, live feeds). Vercel's egress
// rotates across a large pool, so relaying the occasional blocked call through
// this route keeps the engine's inputs complete. The engine only falls back here
// AFTER direct fetches fail (see engine/common/http.py), so volume stays low.
//
// SECURITY: Bearer auth with CRON_SECRET (same pattern as pages/api/cron/*).
// The upstream host is HARDCODED — only paths under /api/ on statsapi.mlb.com
// can be fetched. No arbitrary-URL proxying (no SSRF surface).
const UPSTREAM = 'https://statsapi.mlb.com';
const PATH_RE = /^\/api\/v1(\.1)?\/[A-Za-z0-9\-_./]*(\?[A-Za-z0-9\-_.,=&%()+]*)?$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const auth = req.headers.authorization || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!PATH_RE.test(rawPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const upstream = await fetch(`${UPSTREAM}${rawPath}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
        Accept: 'application/json, text/plain, */*',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await upstream.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);
    try {
      return res.json(JSON.parse(body));
    } catch {
      return res.send(body);
    }
  } catch (err: any) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: `Relay fetch failed: ${err?.message || err}` });
  }
}
