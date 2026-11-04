/**
 * CRON: /api/cron/signup-welcome-back
 * Schedule: hourly (registered in scripts/openclaw-cron-dispatcher.py)
 *
 * Welcome-back chips (Dan, 2026-11-04): every real player who signed up 24+
 * hours ago and has not played a hand is paid 25 free chips from the Midway
 * Union promo wallet and told by push, email and text.
 *
 * The database pays and raises the push (fn_sp_signup_welcome_back_run, Club
 * Arena migration 20261104145956, idempotent per player); this route sends the
 * email through Resend and the text through Twilio and records each channel's
 * receipt. A player with no phone on file gets no text, as Dan expects.
 *
 * This is a promotion on a clock, not a repair job: the schedule is the product.
 *
 * Auth: Bearer <CRON_SECRET>. `?limit=N` caps the players paid in one run.
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { sendEmail, sendSms } from '../../../src/lib/dailyDigest/delivery.mjs';
import { runWelcomeBack } from '../../../src/lib/welcomeBack/run.mjs';

export const config = { maxDuration: 300 };

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const secret = (process.env.CRON_SECRET || '').trim();
    const auth = String(req.headers.authorization || '');
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

    // 60 disbursements measured at 35-320 ms each stay well inside the
    // database function's own statement budget.
    const limit = Math.max(1, Math.min(Number(req.query?.limit) || 50, 60));
    try {
        const sb = createClient();
        const summary = await runWelcomeBack(sb, { limit, sendEmail, sendSms, log: (m) => console.log(m) });
        // A player the promotion could not pay (promo wallet empty, a ledger
        // refusal) is an incident, not a success: non-200 lets the dispatcher
        // count it and page after three failed hours. Channels still ran.
        if (summary.failed > 0) return res.status(503).json({ success: false, error: `${summary.failed} player(s) could not be paid`, ...summary });
        return res.status(200).json({ success: true, ...summary });
    } catch (err) {
        reportApiError(err, req);
        console.error('[signup-welcome-back]', err?.message || err);
        return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
}

export default withCronHealth('signup-welcome-back', handler);
