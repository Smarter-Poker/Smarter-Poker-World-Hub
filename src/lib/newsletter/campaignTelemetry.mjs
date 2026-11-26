/**
 * Pure, zero-dependency Resend campaign telemetry & error_summary serializer.
 *
 * Shared by `lifecycleEngine.mjs`, `dispatch.mjs`, `pages/api/news/digest.js`,
 * `pages/api/news/operations.js`, and `pages/api/webhooks/resend.js` without
 * circular module imports.
 */
import { classifyClickedEmailSection } from './utmAttribution.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEMETRY_TOKEN_RE = /(?:^|\s*\|\s*)telemetry:(\{.*\})\s*$/;
const SPOT_VOTES_TOKEN_RE = /(?:^|\s*\|\s*)votes:(\{.*\})\s*$/;
const PROMO_DRAFT_TOKEN_RE = /(?:^|\s*\|\s*)draft:(\{.*\})\s*$/;

export const SPOT_VOTE_SUBJECT_PREFIX = '[SPOT-VOTE] ';
export const PROMO_DRAFT_SUBJECT_PREFIX = '[PROMO DRAFT] ';

export function extractResendCampaignId(tags) {
    if (!tags) return null;
    if (Array.isArray(tags)) {
        for (const item of tags) {
            const name = String(item?.name || '').trim().toLowerCase();
            if (name === 'campaign_id') {
                const val = String(item?.value || '').trim();
                return UUID_RE.test(val) ? val.toLowerCase() : null;
            }
        }
        return null;
    }
    if (typeof tags === 'object') {
        const val = String(tags.campaign_id ?? tags.campaignId ?? '').trim();
        return UUID_RE.test(val) ? val.toLowerCase() : null;
    }
    return null;
}

export function parseCampaignTelemetrySummary(errorSummary) {
    const raw = String(errorSummary || '').trim();
    if (!raw) {
        return { opens: 0, clicks: 0, cleanErrorSummary: null };
    }
    const match = raw.match(TELEMETRY_TOKEN_RE);
    if (!match) {
        return { opens: 0, clicks: 0, cleanErrorSummary: raw };
    }
    let opens = 0;
    let clicks = 0;
    try {
        const parsed = JSON.parse(match[1]);
        opens = Math.max(0, Math.floor(Number(parsed?.opens || 0)));
        clicks = Math.max(0, Math.floor(Number(parsed?.clicks || 0)));
    } catch {
        /* ignore malformed telemetry json */
    }
    const prefix = raw.slice(0, match.index).trim();
    return {
        opens,
        clicks,
        cleanErrorSummary: prefix || null,
    };
}

export function parseCampaignSectionClicks(errorSummary) {
    const raw = String(errorSummary || '').trim();
    if (!raw) return {};
    const match = raw.match(TELEMETRY_TOKEN_RE);
    if (!match) return {};
    try {
        const parsed = JSON.parse(match[1]);
        if (parsed?.sections && typeof parsed.sections === 'object' && !Array.isArray(parsed.sections)) {
            const result = {};
            for (const [k, v] of Object.entries(parsed.sections)) {
                const count = Math.max(0, Math.floor(Number(v || 0)));
                if (count > 0) result[k] = count;
            }
            return result;
        }
    } catch {
        /* ignore malformed telemetry json */
    }
    return {};
}

export function applyCampaignTelemetryEvent(errorSummary, eventType, { clickedUrl = '' } = {}) {
    const current = parseCampaignTelemetrySummary(errorSummary);
    const sections = parseCampaignSectionClicks(errorSummary);
    const nextOpens = current.opens + (eventType === 'email.opened' ? 1 : 0);
    const nextClicks = current.clicks + (eventType === 'email.clicked' ? 1 : 0);

    if (eventType === 'email.clicked' && clickedUrl) {
        const sec = classifyClickedEmailSection(clickedUrl);
        sections[sec] = (sections[sec] || 0) + 1;
    }

    const payload = {
        opens: nextOpens,
        clicks: nextClicks,
        ...(Object.keys(sections).length > 0 ? { sections } : {}),
    };
    const serialized = `telemetry:${JSON.stringify(payload)}`;
    return {
        opens: nextOpens,
        clicks: nextClicks,
        sections,
        errorSummary: current.cleanErrorSummary ? `${current.cleanErrorSummary} | ${serialized}` : serialized,
    };
}

/**
 * Finalizes a campaign's `error_summary` after batch sending completes while
 * preserving any `telemetry:{"opens":...,"clicks":...}` counters that Resend
 * webhooks recorded while the campaign was in `status = 'sending'`.
 */
export function mergeFinalCampaignErrorSummary(existingErrorSummary, sendErrors = []) {
    const current = parseCampaignTelemetrySummary(existingErrorSummary);
    const sections = parseCampaignSectionClicks(existingErrorSummary);
    const cleanErrors = Array.isArray(sendErrors)
        ? sendErrors.map((e) => String(e || '').trim()).filter(Boolean)
        : [];
    const prefix = cleanErrors.length > 0 ? cleanErrors.join(' | ').slice(0, 880) : current.cleanErrorSummary;
    const hasTelemetry = current.opens > 0 || current.clicks > 0;
    if (!hasTelemetry) {
        return prefix || null;
    }
    const payload = {
        opens: current.opens,
        clicks: current.clicks,
        ...(Object.keys(sections).length > 0 ? { sections } : {}),
    };
    const serialized = `telemetry:${JSON.stringify(payload)}`;
    return prefix ? `${prefix} | ${serialized}` : serialized;
}

export function parseSpotVotesSummary(errorSummary) {
    const raw = String(errorSummary || '').trim();
    if (!raw) return { A: 0, B: 0, C: 0 };
    const match = raw.match(SPOT_VOTES_TOKEN_RE);
    if (!match) return { A: 0, B: 0, C: 0 };
    try {
        const parsed = JSON.parse(match[1]);
        return {
            A: Math.max(0, Math.floor(Number(parsed?.A || 0))),
            B: Math.max(0, Math.floor(Number(parsed?.B || 0))),
            C: Math.max(0, Math.floor(Number(parsed?.C || 0))),
        };
    } catch {
        return { A: 0, B: 0, C: 0 };
    }
}

export function serializeSpotVotesSummary(counts = {}) {
    return (
        'votes:' +
        JSON.stringify({
            A: Math.max(0, Math.floor(Number(counts?.A || 0))),
            B: Math.max(0, Math.floor(Number(counts?.B || 0))),
            C: Math.max(0, Math.floor(Number(counts?.C || 0))),
        })
    );
}

export function parsePromoDraftSummary(row) {
    if (!row || typeof row !== 'object') {
        return { id: null, name: '', draft: null, updatedAt: null };
    }
    const subj = String(row.subject || '').trim();
    const name = subj.startsWith(PROMO_DRAFT_SUBJECT_PREFIX)
        ? subj.slice(PROMO_DRAFT_SUBJECT_PREFIX.length).trim()
        : subj;
    const rawError = String(row.error_summary || '').trim();
    let draft = null;
    const match = rawError.match(PROMO_DRAFT_TOKEN_RE);
    if (match) {
        try {
            draft = JSON.parse(match[1]);
        } catch {
            /* ignore malformed draft json */
        }
    }
    return {
        id: row.id ?? null,
        name,
        draft,
        updatedAt: row.updated_at || row.created_at || null,
    };
}

export function serializePromoDraftSummary(draft) {
    return 'draft:' + JSON.stringify(draft || {}).slice(0, 4000);
}

/**
 * Pure helper computing the authoritative `newsletter_subscribers` column patch
 * when an administrator activates or deactivates a subscriber row.
 * Clearing suppressed `source` markers (`snooze:*`, `unsubscribe`, `resend_bounce`,
 * `resend_complaint`, `sms_opt_out`, `admin_deactivated`) guarantees a reactivated
 * subscriber is immediately eligible for dispatches rather than staying silently
 * suppressed by stale `source` metadata.
 */
export function resolveAdminSubscriberPatch(isActive, currentSource = '', nowIso = new Date().toISOString()) {
    if (!isActive) {
        return {
            is_active: false,
            unsubscribed_at: nowIso,
            source: 'admin_deactivated',
        };
    }
    const cleanSource = String(currentSource || '').trim();
    const lower = cleanSource.toLowerCase();
    const shouldClearSuppressedSource =
        !cleanSource ||
        lower.startsWith('snooze:') ||
        lower === 'unsubscribe' ||
        lower === 'admin_deactivated' ||
        lower === 'resend_bounce' ||
        lower === 'resend_complaint' ||
        lower === 'sms_opt_out';
    return {
        is_active: true,
        unsubscribed_at: null,
        ...(shouldClearSuppressedSource ? { source: 'admin_reactivated' } : {}),
    };
}
