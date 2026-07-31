import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * HENDONMOB AUTO-SYNC via MANUS AI
 * 
 * Triggers a Manus AI browser agent to scrape HendonMob stats
 * for all users with linked profiles. Zero human work required.
 * 
 * GET  /api/hendonmob/auto-sync         — Trigger sync for all users
 * GET  /api/hendonmob/auto-sync?userId=X — Trigger sync for one user
 * 
 * Protected by a secret key to prevent unauthorized triggers.
 * Can be called by: Vercel cron, external scheduler, or manual curl.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

const MANUS_API_KEY = (process.env.MANUS_API_KEY || '').trim();
const MANUS_API_URL = 'https://api.manus.ai/v1/tasks';
const AUTO_SYNC_SECRET = process.env.HENDON_AUTO_SYNC_SECRET || '';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * Build the Manus prompt for scraping a batch of HendonMob profiles.
 * The prompt instructs Manus to:
 * 1. Visit each HendonMob URL
 * 2. Read ONLY explicitly labeled stats
 * 3. POST results back to our sync API
 */
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

export default async function handler(req, res) {
  try {

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth: either the sync secret or a valid JWT
    const secretKey = req.headers['x-auto-sync-key'] || req.query.key;
    const token = req.headers.authorization?.replace('Bearer ', '');

    let authorized = false;

    if (secretKey && AUTO_SYNC_SECRET && secretKey === AUTO_SYNC_SECRET) {
        authorized = true;
    } else if (token) {
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (user) authorized = true;
    }

    if (!authorized) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!MANUS_API_KEY) {
        return res.status(500).json({ error: 'MANUS_API_KEY not configured' });
    }

    try {
        // Get users to scrape
        let query = getSupabase()
            .from('profiles')
            .select('id, full_name, hendon_url')
            .not('hendon_url', 'is', null)
            .neq('hendon_url', '');

        // Optional: single user mode
        const { userId } = req.query;
        if (userId) {
            query = query.eq('id', userId);
        }

        const { data: users, error: fetchError } = await query;

        if (fetchError || !users?.length) {
            return res.status(200).json({
                success: true,
                message: 'No users with HendonMob links found',
                count: 0,
            });
        }

        // Build the sync API URL (where Manus will POST results)
        const host = req.headers.host || 'smarter.poker';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const syncApiUrl = `${protocol}://${host}/api/hendonmob/auto-sync-receive`;

        // Create Manus task
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
            console.warn('Manus API error:', manusData);
            return res.status(500).json({
                success: false,
                error: 'Manus task creation failed',
                details: manusData,
            });
        }

        return res.status(200).json({
            success: true,
            message: `Manus task created for ${users.length} user(s)`,
            taskId: manusData.task_id,
            taskUrl: manusData.task_url,
            usersQueued: users.length,
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Auto-Sync Error]', err);
        return res.status(500).json({ error: err.message });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
