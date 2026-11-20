/**
 * /api/email/click?t=<signed token> - counts a campaign click and redirects.
 *
 * Redirects ONLY to the smarter.poker URL inside the signed token
 * (links.mjs isAllowedDestination), so this is not an open redirect. An
 * expired or broken token still lands the reader on Club Arena rather than an
 * error page; it just is not counted.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { verifyClick } from '../../../src/lib/marketing/links.mjs';

const FALLBACK = 'https://smarter.poker/hub/club-arena/';

export function makeHandler({ getClient = createClient } = {}) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex');
        const claim = verifyClick(String(req.query?.t || ''));
        if (claim && !claim.expired) {
            try {
                const { error } = await getClient().rpc('fn_sp_marketing_record_click', { p_campaign_id: claim.campaignId, p_email_key: claim.email });
                if (error) console.error('[email-click]', error.message);
            } catch (e) {
                console.error('[email-click]', e?.message || e);
            }
        }
        res.setHeader('Location', claim ? claim.url : FALLBACK);
        return res.status(302).end();
    };
}

export default makeHandler();
