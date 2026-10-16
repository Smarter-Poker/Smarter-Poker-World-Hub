/** Builds everything the daily digest email needs for one Central day. */
import { buildHtml, buildSubject, buildText } from './render.mjs';
import { generateAiSummary, fallbackSummary } from './aiSummary.mjs';
import { providerSpend, viewUrlFor } from './delivery.mjs';

/**
 * The AI provider failing for a reason only the owner can fix (no credits, a
 * revoked key) is itself something that needs attention: the same key powers
 * in-app translation. Added to the list the email renders; a model blip or an
 * invented number in the summary is not, the plain summary covers those.
 */
export function withProviderAttention(digest, ai) {
    const reason = String(ai?.reason || '');
    const onGrok = ai?.source === 'grok-3';
    let title = null;
    if (/credit balance/i.test(reason)) {
        title = onGrok
            ? 'The Anthropic API account is out of credits; the AI summary and in-app translation are running on Grok until it is topped up'
            : 'The Anthropic API account is out of credits and Grok did not answer, so the AI summary and in-app translation are down';
    } else if (/^http_(401|403)\b/.test(reason)) {
        title = onGrok
            ? 'The Anthropic API key was refused; the AI summary and in-app translation are running on Grok'
            : 'The Anthropic API key was refused and Grok did not answer, so the AI summary and in-app translation are down';
    }
    if (!title || !digest) return digest;
    const item = { rule: 'ai_provider_unavailable', severity: 'warning', title, status: 'not_picked_up', detail: { reason: reason.slice(0, 200) } };
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

