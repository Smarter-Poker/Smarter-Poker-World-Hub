/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * Straight data, no AI: the same shape as the Pep Nation Lab daily digest.
 * Every number in the email comes from the nightly snapshot or a provider's
 * own billing API; nothing is written by a model.
 */
export async function assembleDigest(sb, day, { withCosts = true, dispatch = true, recipientName } = {}) {
    const { data: digest, error } = await sb.rpc('fn_sp_daily_digest', { p_day: day, p_dispatch: dispatch });
    if (error) throw new Error(`fn_sp_daily_digest: ${error.message}`);
    const costs = withCosts ? await providerSpend(day).catch(() => null) : null;
    const viewUrl = viewUrlFor(day);
    const opts = { costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin', recipientName };
    return { digest, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}
