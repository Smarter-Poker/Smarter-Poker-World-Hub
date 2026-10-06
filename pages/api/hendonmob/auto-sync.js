/**
 * HENDONMOB AUTO-SYNC via MANUS AI
 * 
 * Triggers a Manus AI browser agent to scrape HendonMob stats
 * for all users with linked profiles. Zero human work required.
 * 
 * GET  /api/hendonmob/auto-sync         — Trigger sync for all users
 * GET  /api/hendonmob/auto-sync?userId=X — Trigger sync for one user
 * 
 * Who may trigger it (2026-10-05 privacy audit):
 *   - the weekly workflow or an operator, with CRON_SECRET / ADMIN_ROUTE_SECRET
 *     in a header (.github/workflows/hendonmob-auto-sync.yml sends x-cron-secret);
 *   - a signed-in platform administrator (profiles.is_admin or an admin role).
 * It used to accept ANY valid user JWT, which let every signed-in player start
 * a paid, all-user scrape job, and HENDON_AUTO_SYNC_SECRET, which had been
 * pasted into every Manus prompt and so sits in a third party's task history.
 * That secret is retired: nothing accepts it any more, so it needs no rotation.
 *
 * No standing secret is ever placed in the prompt sent to Manus (a third
 * party). The prompt used to embed HENDON_AUTO_SYNC_SECRET as the callback
 * credential, which handed the trigger secret to Manus and to everything that
 * can read its task history. Each run now mints a one-run callback token:
 * random, stored only as its SHA-256 in public.hendon_sync_tokens, expiring
 * after HENDON_TOKEN_TTL_HOURS, and valid only for writing the HendonMob stats
 * of the accounts queued in that run (auto-sync-receive checks all three).
 * A leaked task history therefore exposes, at worst, a dead token that could
 * only ever have written three public stats for those accounts.
 */

import crypto from 'crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { authorizePokerOpsRead } from '../../../src/lib/poker-near-me/opsReadAuth';

const MANUS_API_KEY = (process.env.MANUS_API_KEY || '').trim();
const MANUS_API_URL = 'https://api.manus.ai/v1/tasks';
const HENDON_TOKEN_TTL_HOURS = 12;

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
 * 3. Report the results as JSON in its final task output
 *
 * This text goes to a third party. It must never contain a secret, token or
 * other credential of ours.
 */
function buildManusPrompt(users, callbackUrl, runToken) {
    const userLines = users.map((u, i) => 
        `${i + 1}. Name: "${u.display_name || 'Unknown'}" | URL: ${u.hendon_url} | UserID: ${u.id}`
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
3. Record the result for that player in this exact JSON shape:
{
  "userId": "<the UserID from the list above>",
  "stats": {
    "totalCashes": <number or null>,
    "totalEarnings": <number or null>,
    "biggestCash": <number or null>
  }
}

4. Send that JSON object for the player with an HTTP POST to:
   ${callbackUrl}
   with the headers "Content-Type: application/json" and "X-Hendon-Sync-Token: ${runToken}".
   That token is single-run and only valid for the players listed above.
5. Move to the next player. Wait 3 seconds between each.
Do not make any other HTTP request except loading the HendonMob pages.

IMPORTANT RULES:
- Every value MUST come from an explicit label on the page
- If you cannot find a labeled stat, set it to null - do NOT guess
- Remove dollar signs and commas from numbers before sending (e.g. "$900,957" → 900957)
- If the page is blocked or fails to load, skip that player and move on

After processing all players, finish with a single JSON array containing every player's result object, followed by a summary of how many succeeded and failed.`;
}

export default async function handler(req, res) {
  try {

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth: an operator secret in a header, or a verified platform
    // administrator. An ordinary user JWT is NOT enough.
    const ops = await authorizePokerOpsRead(req, getSupabase());
    const authorized = ops.authorized === true;

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
            .select('id, display_name, hendon_url')
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

        // One-run callback token: random, stored hashed, short-lived, and
        // scoped to exactly the accounts queued here.
        const runToken = crypto.randomBytes(32).toString('hex');
        const { error: tokenError } = await getSupabase()
            .from('hendon_sync_tokens')
            .insert({
                token_hash: crypto.createHash('sha256').update(runToken).digest('hex'),
                user_ids: users.map((u) => u.id),
                expires_at: new Date(Date.now() + HENDON_TOKEN_TTL_HOURS * 3600 * 1000).toISOString(),
            });
        if (tokenError) {
            console.warn('[Auto-Sync] could not record the run token:', tokenError.message || tokenError);
            return res.status(500).json({ success: false, error: 'Could not prepare the sync run' });
        }

        // A fixed origin: a forwarded Host header must never choose where a
        // third party sends a credential.
        const callbackUrl = 'https://smarter.poker/api/hendonmob/auto-sync-receive';
        const prompt = buildManusPrompt(users, callbackUrl, runToken);

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
        try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
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
