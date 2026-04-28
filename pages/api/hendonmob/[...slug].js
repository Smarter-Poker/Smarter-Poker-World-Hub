/**
 * /api/hendonmob/* — Hono catch-all router (Phase 4.4 module #5, 2026-04-28)
 *
 * Consolidates 3 previously-separate handlers (sync/auto-sync/auto-sync-receive)
 * under a single Hono app. Same pattern as kyc (module #4) — mixed auth per route.
 *
 * Routes (mounted at /api/hendonmob):
 *   GET  /sync              — read user's HendonMob stats from DB (JWT auth)
 *   POST /sync              — save user-provided HendonMob stats (JWT auth, rate-limited)
 *   GET  /auto-sync         — trigger Manus AI scrape (X-Auto-Sync-Key OR JWT)
 *   POST /auto-sync-receive — Manus AI posts scrape results (X-Auto-Sync-Key only)
 *
 * Replaces:
 *   pages/api/hendonmob/sync.js                (145 LOC)
 *   pages/api/hendonmob/auto-sync.js           (189 LOC)
 *   pages/api/hendonmob/auto-sync-receive.js   (106 LOC)
 *   = 440 LOC, now ~280 LOC with shared helpers + middleware.
 *
 * Auth pattern:
 *   - sync: requires user JWT — userAuth middleware
 *   - auto-sync: accepts EITHER X-Auto-Sync-Key (Vercel cron / external scheduler)
 *     OR a valid JWT (admin-trigger from UI) — eitherAuth middleware
 *   - auto-sync-receive: ONLY X-Auto-Sync-Key (Manus posting back) — secretAuth middleware
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

const AUTO_SYNC_SECRET = process.env.HENDON_AUTO_SYNC_SECRET || '';
const MANUS_API_KEY = process.env.MANUS_API_KEY || '';
const MANUS_API_URL = 'https://api.manus.ai/v1/tasks';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Manus prompt builder ─────────────────────────────────────────────────
function buildManusPrompt(users, syncApiUrl) {
  const userLines = users.map((u, i) =>
    `${i + 1}. Name: "${u.full_name || 'Unknown'}" | URL: ${u.hendon_url} | UserID: ${u.id}`
  ).join('\n');

  return `You are a data extraction agent. Your job is to visit HendonMob poker player pages and extract REAL statistics.

CRITICAL LAW: ONLY extract data that is EXPLICITLY LABELED on the page. NEVER guess, assume, or make up values. If a stat is not found, report null.

Here are the players to scrape:
${userLines}

For EACH player above, do the following:
1. Navigate to their HendonMob URL
2. Find these EXPLICITLY LABELED stats on the page:
   - "Total Live Earnings" → extract the dollar amount (e.g. $900,957)
   - Look for the text that says "X cashes" (e.g. "52 cashes") → extract the number
   - "Best Live Cash" → extract the dollar amount (e.g. $252,020)
3. After extracting, send the data by making this HTTP request:

POST ${syncApiUrl}
Headers:
  Content-Type: application/json
  X-Auto-Sync-Key: ${AUTO_SYNC_SECRET}
Body (JSON):
{
  "userId": "<the UserID from the list above>",
  "stats": {
    "totalCashes": <number or null>,
    "totalEarnings": <number or null>,
    "biggestCash": <number or null>
  }
}

4. Move to the next player. Wait 3 seconds between each.

IMPORTANT RULES:
- Every value MUST come from an explicit label on the page
- If you cannot find a labeled stat, set it to null — do NOT guess
- Remove dollar signs and commas from numbers before sending (e.g. "$900,957" → 900957)
- If the page is blocked or fails to load, skip that player and move on

After processing all players, report a summary of how many succeeded and failed.`;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/hendonmob');

// Auth middlewares (post-4.1d ESM-clean — uses getServerUserWithFallback)
const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return c.json({ success: false, error: 'Auth required' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[hendonmob] auth error:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
};

const secretAuth = async (c, next) => {
  const secretKey = c.req.header('x-auto-sync-key');
  if (!secretKey || !AUTO_SYNC_SECRET || secretKey !== AUTO_SYNC_SECRET) {
    return c.json({ error: 'Invalid sync key' }, 401);
  }
  await next();
};

const eitherAuth = async (c, next) => {
  const secretKey = c.req.header('x-auto-sync-key') || c.req.query('key');
  if (secretKey && AUTO_SYNC_SECRET && secretKey === AUTO_SYNC_SECRET) {
    return next();
  }
  try {
    const req = c.env?.req;
    const { user } = await getServerUserWithFallback(req, getSupabase());
    if (user) {
      c.set('user', user);
      return next();
    }
  } catch (err) {
    console.warn('[hendonmob] eitherAuth fallback error:', err);
  }
  return c.json({ error: 'Unauthorized' }, 401);
};

// Rate-limit middleware (writes only — applied per-route as needed)
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/hendonmob/sync — read current stats
app.get('/sync', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('hendon_url, hendon_total_cashes, hendon_total_earnings, hendon_biggest_cash')
      .eq('id', user.id)
      .maybeSingle();

    return c.json({
      success: true,
      total_cashes: profile?.hendon_total_cashes ?? null,
      total_earnings: profile?.hendon_total_earnings ?? null,
      biggest_cash: profile?.hendon_biggest_cash ?? null,
      hendon_url: profile?.hendon_url ?? null,
      source: 'database',
    });
  } catch (err) {
    console.warn('[hendonmob/sync GET]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/hendonmob/sync — save user-provided stats
app.post('/sync', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { hendonUrl, stats: clientStats } = body;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, hendon_url')
      .eq('id', user.id)
      .maybeSingle();

    const targetUrl = hendonUrl || profile?.hendon_url;
    if (!targetUrl || !targetUrl.includes('thehendonmob.com')) {
      return c.json({ success: false, error: 'Please enter a valid Hendon Mob profile URL' }, 400);
    }

    if (!clientStats || (clientStats.totalCashes == null && clientStats.totalEarnings == null)) {
      return c.json({ success: false, error: 'No stats provided. Please enter your cashes and/or earnings.' }, 400);
    }

    const tc = clientStats.totalCashes != null ? parseInt(clientStats.totalCashes, 10) : null;
    const te = clientStats.totalEarnings != null ? parseFloat(clientStats.totalEarnings) : null;
    const bc = clientStats.biggestCash != null ? parseFloat(clientStats.biggestCash) : null;

    if ((tc != null && (isNaN(tc) || tc < 0 || tc >= 100000)) ||
        (te != null && (isNaN(te) || te < 0 || te >= 500000000))) {
      return c.json({ success: false, error: 'Invalid stats values. Cashes must be 0-99999, earnings must be non-negative.' }, 400);
    }

    const updateData = {};
    if (tc != null && !isNaN(tc)) updateData.hendon_total_cashes = tc;
    if (te != null && !isNaN(te)) updateData.hendon_total_earnings = te;
    if (bc != null && !isNaN(bc) && bc >= 0) updateData.hendon_biggest_cash = bc;

    if (Object.keys(updateData).length === 0) {
      return c.json({ success: false, error: 'No valid stats to save.' }, 400);
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (updateError) {
      console.warn('[hendonmob/sync POST] update error:', updateError);
      return c.json({ success: false, error: 'Failed to save stats' }, 500);
    }

    return c.json({
      success: true,
      total_cashes: tc ?? null,
      total_earnings: te ?? null,
      biggest_cash: bc ?? null,
      source: 'client_update',
    });
  } catch (err) {
    console.warn('[hendonmob/sync POST]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/hendonmob/auto-sync — trigger Manus scrape
app.get('/auto-sync', eitherAuth, async (c) => {
  if (!MANUS_API_KEY) {
    return c.json({ error: 'MANUS_API_KEY not configured' }, 500);
  }
  const supabase = getSupabase();
  try {
    let query = supabase
      .from('profiles')
      .select('id, full_name, hendon_url')
      .not('hendon_url', 'is', null)
      .neq('hendon_url', '');

    const userId = c.req.query('userId');
    if (userId) {
      query = query.eq('id', userId);
    }

    const { data: users, error: fetchError } = await query;
    if (fetchError || !users?.length) {
      return c.json({ success: true, message: 'No users with HendonMob links found', count: 0 });
    }

    const host = c.req.header('host') || 'smarter.poker';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const syncApiUrl = `${protocol}://${host}/api/hendonmob/auto-sync-receive`;

    const prompt = buildManusPrompt(users, syncApiUrl);

    const manusResponse = await fetch(MANUS_API_URL, {
      method: 'POST',
      headers: {
        'API_KEY': MANUS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        agentProfile: 'manus-1.6',
        taskMode: 'agent',
        hideInTaskList: false,
      }),
    });

    const manusData = await manusResponse.json();
    if (!manusResponse.ok) {
      console.warn('[hendonmob/auto-sync] Manus API error:', manusData);
      return c.json({ success: false, error: 'Manus task creation failed', details: manusData }, 500);
    }

    return c.json({
      success: true,
      message: `Manus task created for ${users.length} user(s)`,
      taskId: manusData.task_id,
      taskUrl: manusData.task_url,
      usersQueued: users.length,
    });
  } catch (err) {
    console.warn('[hendonmob/auto-sync]', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
});

// POST /api/hendonmob/auto-sync-receive — Manus posts results
app.post('/auto-sync-receive', secretAuth, async (c) => {
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { userId, stats } = body;

    if (!userId || !stats) {
      return c.json({ error: 'userId and stats required' }, 400);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return c.json({ error: 'Invalid userId format - must be a valid UUID' }, 400);
    }

    const updateData = {};
    if (stats.totalCashes != null && !isNaN(stats.totalCashes)) {
      updateData.hendon_total_cashes = parseInt(stats.totalCashes, 10);
    }
    if (stats.totalEarnings != null && !isNaN(stats.totalEarnings)) {
      updateData.hendon_total_earnings = parseFloat(stats.totalEarnings);
    }
    if (stats.biggestCash != null && !isNaN(stats.biggestCash)) {
      updateData.hendon_biggest_cash = parseFloat(stats.biggestCash);
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ success: true, message: 'No valid stats to update', userId });
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.warn('[hendonmob/auto-sync-receive] DB update error:', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    console.debug(`[Auto-Sync] Updated user ${userId}:`, updateData);
    return c.json({ success: true, userId, updated: updateData });
  } catch (err) {
    console.warn('[hendonmob/auto-sync-receive]', err);
    return c.json({ error: err?.message || 'Internal server error' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[hendonmob] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[hendonmob] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
