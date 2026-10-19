export const PHONE_CODE_WINDOW_MS = 10 * 60 * 1000;
const key = userId => `sp-pending-phone-verification:${userId}`;

// Retain only the challenge destination and timing, never the SMS code.
export function savePendingPhoneVerification(storage, userId, phone, now = Date.now()) {
    if (!userId || !/^\d{10}$/.test(phone)) return null;
    const pending = { phone, sentAt: now, expiresAt: now + PHONE_CODE_WINDOW_MS };
    try { storage.setItem(key(userId), JSON.stringify(pending)); } catch { /* memory state remains usable */ }
    return pending;
}

export function readPendingPhoneVerification(storage, userId, now = Date.now()) {
    if (!userId) return null;
    try {
        const pending = JSON.parse(storage.getItem(key(userId)) || 'null');
        if (!pending || !/^\d{10}$/.test(pending.phone) || !Number.isFinite(pending.sentAt)
            || pending.sentAt > now || pending.expiresAt !== pending.sentAt + PHONE_CODE_WINDOW_MS
            || now >= pending.expiresAt) {
            storage.removeItem(key(userId));
            return null;
        }
        return pending;
    } catch { return null; }
}

export function clearPendingPhoneVerification(storage, userId) {
    try { if (userId) storage.removeItem(key(userId)); } catch { /* storage unavailable */ }
}
