/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * Real Player Totals (fn_sp_digest_player_report): every real player's result,
 * games, rake, end-of-day balances and time played. Includes BBJ attribution and period totals. A failure never stops the
 * digest; the card then says the totals could not be built.
 */
export async function loadPlayerTotals(sb, day) {
    try {
        const { data, error } = await sb.rpc('fn_sp_digest_player_report', { p_day: day });
        if (error) return { day, error: error.message };
        return data || null;
    } catch (err) {
        return { day, error: String(err?.message || err) };
    }
}

/**
 * Straight data, no AI: the same shape as the Pep Nation Lab daily digest.
 * Every number in the email comes from the nightly snapshot or a provider's
 * own billing API; nothing is written by a model.
 */
export async function assembleDigest(sb, day, { withCosts = true, dispatch = true, recipientName } = {}) {
    const [{ data: digest, error }, playerTotals] = await Promise.all([
        sb.rpc('fn_sp_daily_digest', { p_day: day, p_dispatch: dispatch }),
        loadPlayerTotals(sb, day),
    ]);
    if (error) throw new Error(`fn_sp_daily_digest: ${error.message}`);
    if (digest && playerTotals) digest.player_totals = playerTotals;
    const costs = withCosts ? await providerSpend(day).catch(() => null) : null;
    const viewUrl = viewUrlFor(day);
    const opts = { costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin', recipientName, email: true };
    return { digest, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}
