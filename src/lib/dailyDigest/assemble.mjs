/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { generateAiSummary, fallbackSummary } from './aiSummary.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * Only when no AI provider could write the summary does it need the owner:
 * Grok is primary and Anthropic the backup, so one of them having a bad day is
 * not news. A guard rejection (an invented number) is not an owner action either.
 */
export function withProviderAttention(digest, ai) {
    if (!digest || ai?.source !== 'fallback') return digest;
    const reason = String(ai?.reason || '');
    const grokPart = reason.split(';')[0];
    if (!grokPart.startsWith('grok') || /unverified numbers|empty/i.test(grokPart)) return digest;
    const item = { rule: 'ai_provider_unavailable', severity: 'warning',
        title: 'Neither Grok nor Anthropic answered, so the AI summary used the plain written version',
        status: 'not_picked_up', detail: { reason: reason.slice(0, 200) } };
    const status = { ...(digest.attention_status || {}) };
    status.not_picked_up = Number(status.not_picked_up || 0) + 1;
    return { ...digest, attention: [...(digest.attention || []), item], attention_status: status };
}

export async function assembleDigest(sb, day, { withAi = true, withCosts = true, dispatch = true } = {}) {
    let { data: digest, error } = await sb.rpc('fn_sp_daily_digest', { p_day: day, p_dispatch: dispatch });
    if (error) throw new Error(`fn_sp_daily_digest: ${error.message}`);
    let [costs, ai] = await Promise.all([
        withCosts ? providerSpend(day).catch(() => null) : null,
        withAi ? generateAiSummary(digest) : null,
    ]);
    const flagged = withProviderAttention(digest, ai);
    if (flagged !== digest && ai?.source === 'fallback') ai = { ...ai, text: fallbackSummary(flagged) };
    digest = flagged;
    const viewUrl = viewUrlFor(day);
    const opts = { aiSummary: ai?.text || null, costs, viewUrl, dashboardUrl: 'https://smarter.poker/admin' };
    return { digest, ai, costs, opts, subject: buildSubject(digest), html: buildHtml(digest, opts), text: buildText(digest, opts) };
}

