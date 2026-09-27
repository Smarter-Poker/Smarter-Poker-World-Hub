/**
 * WHEN MAY WE ASK A PLAYER TO TURN NOTIFICATIONS ON? (2026-09-27)
 *
 * Pure decision logic, shared in behaviour with Club Arena's
 * src/lib/pushNudgePolicy.ts. Both apps are served from smarter.poker and read
 * one localStorage, so the two copies read and write the SAME ledger key: a
 * "Not Now" in one app is honoured by the other. Change both together.
 *
 * The old rule was "ask once per account per browser, forever". Measured on
 * production, 2026-09-27: 218 human profiles, 4 accounts ever enrolled. A
 * single ask twenty seconds after landing, recorded permanently whatever the
 * answer, is not a sign-up flow. This replaces it with:
 *
 *   - asks tied to moments where a notification is obviously useful (joining
 *     a club, a first rakeback receipt, opening the invoice workspace), plus
 *     the original first-visit ask;
 *   - "Not Now" starts a cool-down (7 days, then 30) instead of closing the
 *     door; three "Not Now"s stop the contextual asks for good. Settings stays
 *     available as the re-enable path in every state;
 *   - at most one ask per day, whatever the moment;
 *   - never an ask when this device is already on, when the person turned
 *     notifications off themselves, or when the browser has blocked them
 *     (Settings explains how to unblock instead of a modal they cannot act on);
 *   - the OS permission dialog is only ever raised by the person's own tap on
 *     the in-app button, never by this policy.
 *
 * OWNER EXCEPTION. Dan's accounting copies route to Production Alerts
 * (Club Arena PR #5428), so he is never nudged to enroll FOR RECEIPTS.
 * This module does not touch that routing.
 */

export const OWNER_USER_ID = '47965354-0e56-43ef-931c-ddaab82af765';

export const NUDGE_MOMENTS = Object.freeze(['first_run', 'club_joined', 'rakeback_receipt', 'invoice_workspace']);
const RECEIPT_MOMENTS = new Set(['rakeback_receipt', 'invoice_workspace']);

const DAY = 24 * 60 * 60 * 1000;
export const COOLDOWNS_MS = Object.freeze([7 * DAY, 30 * DAY]);
export const MAX_DISMISSALS = 3;
export const MIN_GAP_BETWEEN_ASKS_MS = DAY;

export const ledgerKey = (userId) => `sp_push_nudge_v1_${userId}`;
/** Written by the original one-time prompt in both apps; read for continuity. */
export const legacyAskedKey = (userId) => `sp_firstrun_notif_v2_${userId}`;
export const legacyInstallKey = (userId) => `sp_firstrun_ios_install_${userId}`;

const EMPTY = Object.freeze({ dismissals: 0, lastDismissedAt: 0, lastShownAt: 0 });

function finite(n) {
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

export function sameUser(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Parse a stored ledger defensively: a corrupt value is an empty ledger. */
export function parseLedger(raw) {
    if (!raw) return { ...EMPTY };
    try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object') return { ...EMPTY };
        return {
            dismissals: Math.min(Math.max(Math.floor(finite(v.dismissals)), 0), MAX_DISMISSALS),
            lastDismissedAt: finite(v.lastDismissedAt),
            lastShownAt: finite(v.lastShownAt),
        };
    } catch {
        return { ...EMPTY };
    }
}

/**
 * @param {object} input
 * @param {string|null} input.userId
 * @param {string} input.moment            one of NUDGE_MOMENTS
 * @param {number} input.now               ms epoch
 * @param {object} input.ledger            parseLedger() result
 * @param {number} [input.legacyAskedAt]   value of the legacy one-time key, 0 if absent
 * @param {number} [input.legacyInstallAt] value of the legacy iOS install cool-down key
 * @param {object} input.device
 * @param {boolean} input.device.supported     web push (or native push) is available
 * @param {boolean} input.device.iosNeedsInstall iPhone/iPad Safari tab, not installed
 * @param {string}  input.device.permission     'default' | 'granted' | 'denied' | 'unsupported'
 * @param {boolean} input.device.subscribed     this device holds a subscription
 * @param {boolean} input.device.optedOut       the person turned push off here
 * @returns {{ show: true, variant: 'ask'|'install' } | { show: false, reason: string }}
 */
export function decideNudge({ userId, moment, now, ledger = EMPTY, legacyAskedAt = 0, legacyInstallAt = 0, device }) {
    if (!userId) return { show: false, reason: 'signed_out' };
    if (!NUDGE_MOMENTS.includes(moment)) return { show: false, reason: 'unknown_moment' };
    if (RECEIPT_MOMENTS.has(moment) && sameUser(userId, OWNER_USER_ID)) {
        return { show: false, reason: 'owner_receipts_route_to_production_alerts' };
    }
    const d = device || {};
    if (d.optedOut) return { show: false, reason: 'opted_out' };
    if (d.permission === 'denied') return { show: false, reason: 'blocked' };
    if (d.subscribed) return { show: false, reason: 'already_on' };

    let variant = 'ask';
    if (!d.supported) {
        if (!d.iosNeedsInstall) return { show: false, reason: 'unsupported' };
        variant = 'install';
    }

    // A legacy "asked once" mark counts as one earlier Not Now at that time.
    // The original prompt wrote it for success, denial and Not Now alike;
    // success and denial are already excluded above, so what remains is a
    // person who deferred. They get the cool-down, not a permanent silence.
    let { dismissals, lastDismissedAt } = ledger;
    const legacy = finite(legacyAskedAt);
    if (dismissals === 0 && legacy) {
        dismissals = 1;
        lastDismissedAt = legacy;
    }
    if (variant === 'install') lastDismissedAt = Math.max(lastDismissedAt, finite(legacyInstallAt));

    // The first-visit ask is exactly that: it runs once. Later asks come only
    // from a moment the person just created.
    if (moment === 'first_run' && (dismissals > 0 || ledger.lastShownAt > 0)) {
        return { show: false, reason: 'first_run_already_asked' };
    }
    if (dismissals >= MAX_DISMISSALS) return { show: false, reason: 'declined_repeatedly' };
    if (dismissals > 0) {
        const wait = COOLDOWNS_MS[Math.min(dismissals - 1, COOLDOWNS_MS.length - 1)];
        if (now - lastDismissedAt < wait) return { show: false, reason: 'cooling_down' };
    } else if (variant === 'install' && lastDismissedAt && now - lastDismissedAt < COOLDOWNS_MS[0]) {
        return { show: false, reason: 'cooling_down' };
    }
    if (ledger.lastShownAt && now - ledger.lastShownAt < MIN_GAP_BETWEEN_ASKS_MS) {
        return { show: false, reason: 'asked_recently' };
    }
    return { show: true, variant };
}

export function recordShown(ledger, now) {
    return { ...ledger, lastShownAt: now };
}

export function recordDismissed(ledger, now, legacyAskedAt = 0) {
    const base = ledger.dismissals === 0 && finite(legacyAskedAt) ? 1 : ledger.dismissals;
    return { ...ledger, dismissals: Math.min(base + 1, MAX_DISMISSALS), lastDismissedAt: now };
}

/** Storage helpers. Private windows throw on localStorage; never let that escape. */
export function readNudgeState(storage, userId) {
    const read = (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
    return {
        ledger: parseLedger(read(ledgerKey(userId))),
        legacyAskedAt: Number(read(legacyAskedKey(userId)) || 0) || 0,
        legacyInstallAt: Number(read(legacyInstallKey(userId)) || 0) || 0,
    };
}

export function writeLedger(storage, userId, ledger) {
    try { storage?.setItem(ledgerKey(userId), JSON.stringify(ledger)); } catch { /* private mode */ }
}

/** The one call a feature makes at its meaningful moment. Fire and forget. */
export const NUDGE_EVENT = 'sp:push-nudge';
export function requestPushNudge(moment) {
    if (typeof window === 'undefined') return;
    try {
        // Kept for a host that mounts after the moment (lazy chunks).
        window.__spPendingPushNudge = { moment, at: Date.now() };
        window.dispatchEvent(new CustomEvent(NUDGE_EVENT, { detail: { moment } }));
    } catch { /* a nudge is optional; the feature that asked must never fail */ }
}
export function takePendingNudge(maxAgeMs = 60_000) {
    if (typeof window === 'undefined') return null;
    const p = window.__spPendingPushNudge;
    window.__spPendingPushNudge = null;
    return p && Date.now() - p.at <= maxAgeMs ? p.moment : null;
}
