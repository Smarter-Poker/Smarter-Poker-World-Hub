/**
 * GET /api/internal/login-bridge-probe - the Open Claw entry point for the
 * Club Commander login-bridge probe (2026-09-04).
 *
 * Why a relay: the probe itself runs on the Commander Vercel project
 * (commander.smarter.poker/api/internal/login-bridge-probe). Its first live
 * Open Claw run answered 401 because the CRON_SECRET copied onto that project
 * was not the production value - a copied secret drifts (2026-08-31: 85 jobs,
 * a day). So the dispatcher authenticates to THIS host, the one it already
 * talks to for every job, with the CRON_SECRET bearer every other route here
 * checks, and this route calls Commander with a short-lived ticket signed by
 * SUPABASE_JWT_SECRET - the one secret both projects hold by construction.
 * Nothing new to provision on either side.
 *
 * Commander's answer is returned verbatim (status + JSON), so the dispatcher
 * journal, CRITICAL_JOBS paging and cron_execution_log (written by Commander
 * as /commander/internal/login-bridge-probe) all see the real result.
 *
 * Not under pages/api/cron/ on purpose: CLAUDE.md 11.3 freezes that directory;
 * this follows the /api/internal/cron-auth-probe pattern.
 */
import { mintProbeTicket } from '../../../src/lib/probeTicket';

const COMMANDER_PROBE_URL =
  process.env.COMMANDER_PROBE_URL || 'https://commander.smarter.poker/api/internal/login-bridge-probe';

// Commander's probe takes 10-30 s (two legs, ~25 HTTP calls).
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Byte-identical to pages/api/internal/cron-auth-probe.js: the bearer this
  // relay accepts must be exactly the one every other gated route accepts.
  const auth = req.headers.authorization || '';
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const ticketSecret = process.env.SUPABASE_JWT_SECRET;
  if (!ticketSecret) {
    return res.status(503).json({ ok: false, error: 'SUPABASE_JWT_SECRET is not configured; cannot sign the probe ticket' });
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50_000);
  try {
    const upstream = await fetch(COMMANDER_PROBE_URL, {
      method: 'GET',
      headers: {
        'x-probe-ticket': mintProbeTicket(ticketSecret),
        accept: 'application/json',
        'user-agent': 'smarter-poker-hub/login-bridge-probe-relay',
      },
      signal: ctl.signal,
    });
    const text = await upstream.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { ok: false, error: 'commander returned non-JSON', body: text.slice(0, 300) }; }
    return res.status(upstream.status).json({ ...body, relay: 'hub', commander_status: upstream.status });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      ok: false,
      relay: 'hub',
      error: timedOut ? 'commander probe did not answer within 50s' : `commander probe unreachable: ${err?.message || err}`,
    });
  } finally {
    clearTimeout(timer);
  }
}
