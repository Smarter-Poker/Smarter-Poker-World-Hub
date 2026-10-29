/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * A database statement that was cancelled for running past its limit. The
 * reports below are read-only and idempotent, so a cancelled one is retried
 * once the contention that cancelled it (the top-of-the-hour crons, the
 * digest's own sibling reports) has passed. Any other error is final.
 */
export const STATEMENT_TIMEOUT = /canceling statement due to statement timeout|statement timeout|\b57014\b/i;
const RETRY_DELAYS_MS = [4000, 12000];
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls a read-only report RPC. Statement timeouts are retried (after a
 * pause) while the shared budget lasts; the final error is returned as is.
 * `budget.deadline` is a Date.now() timestamp: no retry starts past it, so
 * the serverless function (maxDuration 300 s) still has time to send.
 */
export async function rpcWithRetry(sb, name, args, { sleep = defaultSleep, delays = RETRY_DELAYS_MS, budget = null } = {}) {
    let result = await sb.rpc(name, args);
    for (const delay of delays) {
        const message = result?.error?.message || '';
        if (!message || !STATEMENT_TIMEOUT.test(message)) break;
        if (budget?.deadline && Date.now() + delay > budget.deadline) break;
        await sleep(delay);
        if (budget?.deadline && Date.now() >= budget.deadline) break;
        result = await sb.rpc(name, args);
    }
    return result;
}

/**
 * Real Player Totals (fn_sp_digest_player_report): every real player's result,
 * games, rake, end-of-day balances and time played. Includes BBJ attribution and period totals. A failure never stops the
 * digest; the card then says the totals could not be built.
 */
export async function loadPlayerTotals(sb, day, retry = {}) {
    try {
        const { data, error } = await rpcWithRetry(sb, 'fn_sp_digest_player_report', { p_day: day }, retry);
        if (error) return { day, error: error.message };
        return data || null;
    } catch (err) {
        return { day, error: String(err?.message || err) };
    }
}

export async function loadSpinsSpend(sb, day, retry = {}) {
    try {
        const { data, error } = await rpcWithRetry(sb, 'fn_sp_digest_spins_spend', { p_day: day }, retry);
        return error ? { day, error: error.message } : (data || { day, error: 'Report unavailable' });
    } catch (err) { return { day, error: String(err?.message || err) }; }
}

/** Time the report loads may keep retrying, out of the route's 300 s. */
const REPORT_BUDGET_MS = 150000;

/**
 * Loads the day's data once. The three reads are heavy, so the two reports
 * run after the main digest instead of racing it (and each other) for the
 * same database, and the caller loads once however many admins get the email.
 */
export async function loadDigestData(sb, day, { withCosts = true, dispatch = true, retry = {} } = {}) {
    const budget = retry.budget || { deadline: Date.now() + REPORT_BUDGET_MS };
    const withBudget = { ...retry, budget };
    const { data: digest, error } = await rpcWithRetry(sb, 'fn_sp_daily_digest', { p_day: day, p_dispatch: dispatch }, withBudget);
    if (error) throw new Error(`fn_sp_daily_digest: ${error.message}`);
    const playerTotals = await loadPlayerTotals(sb, day, withBudget);
    const spinsSpend = await loadSpinsSpend(sb, day, withBudget);
    if (digest && playerTotals) digest.player_totals = playerTotals;
    if (digest) digest.spins_spend = spinsSpend;
    const costs = withCosts ? await providerSpend(day).catch(() => null) : null;
    return { digest, costs };
}

/** Renders loaded data for one recipient. */
export function renderDigest(day, { digest, costs }, { recipientName } = {}) {
    const viewUrl = viewUrlFor(day);
    const opts = { costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin', recipientName, email: true };
    return { digest, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}

/**
 * Straight data, no AI: the same shape as the Pep Nation Lab daily digest.
 * Every number in the email comes from the nightly snapshot or a provider's
 * own billing API; nothing is written by a model.
 */
export async function assembleDigest(sb, day, { withCosts = true, dispatch = true, recipientName, retry } = {}) {
    const data = await loadDigestData(sb, day, { withCosts, dispatch, retry });
    return renderDigest(day, data, { recipientName });
}
