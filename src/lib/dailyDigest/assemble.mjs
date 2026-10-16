/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { generateAiSummary } from './aiSummary.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

export async function assembleDigest(sb, day, { withAi = true, withCosts = true } = {}) {
    const { data: digest, error } = await sb.rpc('fn_sp_daily_digest', { p_day: day });
    if (error) throw new Error(`fn_sp_daily_digest: ${error.message}`);
    const [costs, ai] = await Promise.all([
        withCosts ? providerSpend(day).catch(() => null) : null,
        withAi ? generateAiSummary(digest) : null,
    ]);
    const viewUrl = viewUrlFor(day);
    const opts = { aiSummary: ai?.text || null, costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin' };
    return { digest, ai, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}

