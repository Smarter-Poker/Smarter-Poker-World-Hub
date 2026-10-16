// Production email OTP is configured to six digits, the provider minimum.
// The owner requires a maximum of six; eight-digit tokens are never accepted.
export function isEmailVerificationCode(code) {
    return /^\d{6}$/.test(code);
}

export const INSTALL_ACCOUNT_DELAY_MS = 180_000;
export function installPromptDelay(user, pathname, now = Date.now()) {
    if (!user?.id || /^\/(?:auth|i)(?:\/|$)/.test(pathname || '')) return null;
    const created = Date.parse(user.created_at);
    if (!Number.isFinite(created)) return null;
    return Math.max(0, created + INSTALL_ACCOUNT_DELAY_MS - now);
}
