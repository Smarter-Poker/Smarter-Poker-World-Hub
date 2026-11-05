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
 * Tournament Arena relaunch (Dan, 2026-11-05): after the welcome-back run this
 * route also sends the one-time relaunch email and text to every real player
 * (src/lib/tournamentRelaunch/notice.mjs). Receipts live in sp_relaunch_awards,
 * so once every player has been reached that step is a no-op. It rides this
 * schedule because CLAUDE.md section 11 forbids a net-new cron route.
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
import { runRelaunchNotice } from '../../../src/lib/tournamentRelaunch/notice.mjs';

export const config = { maxDuration: 300 };

async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const secret = (process.env.CRON_SECRET || '').trim();
    const auth = String(req.headers.authorization || '');
    if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

    const startedAt = Date.now();
    // 60 disbursements measured at 35-320 ms each stay well inside the
    // database function's own statement budget.
    const limit = Math.max(1, Math.min(Number(req.query?.limit) || 50, 60));
    try {
        const sb = createClient();
        const summary = await runWelcomeBack(sb, { limit, sendEmail, sendSms, log: (m) => console.log(m) });

        // One-time relaunch notice. Its own try: a relaunch failure must never
        // turn a good welcome-back run red, and the receipts make it resumable.
        let relaunch = null;
        try {
            relaunch = await runRelaunchNotice(sb, { sendEmail, sendSms, log: (m) => console.log(m), deadline: startedAt + 280000 });
        } catch (e) {
            relaunch = { error: String(e?.message || e) };
            console.error('[tournament-relaunch]', relaunch.error);
        }

        // A player the promotion could not pay is an incident, not a success:
        // non-200 lets the dispatcher count it and page after three failed
        // hours. It pages for an empty promo wallet (nobody can be paid) and
        // for a player who FIRST failed this run; one stuck player seen every
        // hour is reported in the digest under Could Not Be Paid instead, so
        // the pager does not become a permanent alarm anyone learns to mute.
        if (summary.wallet_empty || summary.failed_new > 0) {
            const why = summary.wallet_empty ? 'Midway Union promo wallet cannot fund the chips' : `${summary.failed_new} player(s) could not be paid`;
            return res.status(503).json({ success: false, error: why, ...summary, relaunch });
        }
        return res.status(200).json({ success: true, ...summary, relaunch });
    } catch (err) {
        reportApiError(err, req);
        console.error('[signup-welcome-back]', err?.message || err);
        return res.status(500).json({ success: false, error: String(err?.message || err) });
    }
}

export default withCronHealth('signup-welcome-back', handler);
