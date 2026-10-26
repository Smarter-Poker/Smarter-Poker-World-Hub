/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * Real Player Totals: every real player's result, games, rake, end-of-day
 * balances and time played for the day, plus `period` (the day, the last 7
 * days and the month to date; Dan, 2026-10-26). fn_sp_digest_player_period
 * returns the day's totals with `period` added; on a database that does not
 * have it yet this falls back to the day alone (fn_sp_digest_player_totals),
 * so neither side has to ship first. A failure never stops the digest; the
 * card then says the totals could not be built.
 */
function missingFunction(error) {
    const text = `${error?.code || ''} ${error?.message || ''}`;
    return /PGRST202|42883|Could not find the function|does not exist/i.test(text);
}

export async function loadPlayerTotals(sb, day) {
    try {
        const period = await sb.rpc('fn_sp_digest_player_period', { p_day: day });
        if (!period.error) return period.data || null;
        if (!missingFunction(period.error)) return { day, error: period.error.message };
        const { data, error } = await sb.rpc('fn_sp_digest_player_totals', { p_day: day });
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
    const opts = { costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin', recipientName };
    return { digest, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}
