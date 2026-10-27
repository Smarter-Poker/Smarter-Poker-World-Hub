/**
 * /api/digest/view?t=<signed token> - the daily digest as a web page.
 *
 * The "View This Digest Online" button in the morning email carries a token
 * signed with the server's cron secret (day + 45 day expiry), so the link in
 * the owner's inbox opens without a login while any other day, or a guessed
 * link, is refused. Read only: renders from the stored snapshot, no send, no
 * AI call, no provider calls. Never cached.
 */
import { createClient } from '@supabase/supabase-js';
import { verifyViewToken, viewUrlFor } from '../../../src/lib/dailyDigest/delivery.mjs';
import { buildHtml } from '../../../src/lib/dailyDigest/render.mjs';
import { loadPlayerTotals } from '../../../src/lib/dailyDigest/assemble.mjs';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const day = verifyViewToken(typeof req.query?.t === 'string' ? req.query.t : '');
    if (!day) return res.status(403).send('This digest link is invalid or has expired.');

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return res.status(500).send('Not configured');
    const sb = createClient(url, key, { auth: { persistSession: false } });

    const [{ data: digest, error }, playerTotals] = await Promise.all([
        sb.rpc('fn_sp_daily_digest', { p_day: day, p_dispatch: false }),
        loadPlayerTotals(sb, day),
    ]);
    if (error || !digest) return res.status(500).send('The digest could not be loaded.');
    if (playerTotals) digest.player_totals = playerTotals;

    const html = buildHtml(digest, { viewUrl: viewUrlFor(day), dashboardUrl: 'https://smarter.poker/admin' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
}
