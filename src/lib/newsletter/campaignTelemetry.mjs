/**
 * Pure, zero-dependency Resend campaign telemetry & error_summary serializer.
 *
 * Shared by `lifecycleEngine.mjs`, `dispatch.mjs`, `pages/api/news/digest.js`,
 * `pages/api/news/operations.js`, and `pages/api/webhooks/resend.js` without
 * circular module imports.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEMETRY_TOKEN_RE = /(?:^|\s*\|\s*)telemetry:(\{[^{}]*\})\s*$/;

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

export function applyCampaignTelemetryEvent(errorSummary, eventType) {
    const current = parseCampaignTelemetrySummary(errorSummary);
    const nextOpens = current.opens + (eventType === 'email.opened' ? 1 : 0);
    const nextClicks = current.clicks + (eventType === 'email.clicked' ? 1 : 0);
    const serialized = `telemetry:${JSON.stringify({ opens: nextOpens, clicks: nextClicks })}`;
    return {
        opens: nextOpens,
        clicks: nextClicks,
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
    const cleanErrors = Array.isArray(sendErrors)
        ? sendErrors.map((e) => String(e || '').trim()).filter(Boolean)
        : [];
    const prefix = cleanErrors.length > 0 ? cleanErrors.join(' | ').slice(0, 880) : current.cleanErrorSummary;
    const hasTelemetry = current.opens > 0 || current.clicks > 0;
    if (!hasTelemetry) {
        return prefix || null;
    }
    const serialized = `telemetry:${JSON.stringify({ opens: current.opens, clicks: current.clicks })}`;
    return prefix ? `${prefix} | ${serialized}` : serialized;
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
