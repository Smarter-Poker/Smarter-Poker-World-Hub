// Email OTP length is provider controlled. Accept current 8-digit and legacy
// 6-digit tokens intact; Supabase remains the verification authority.
export function isEmailVerificationCode(code) {
    return /^(?:\d{6}|\d{8})$/.test(code);
}

export const INSTALL_ACCOUNT_DELAY_MS = 180_000;
export function installPromptDelay(user, pathname, now = Date.now()) {
    if (!user?.id || /^\/(?:auth|i)(?:\/|$)/.test(pathname || '')) return null;
    const created = Date.parse(user.created_at);
    if (!Number.isFinite(created)) return null;
    return Math.max(0, created + INSTALL_ACCOUNT_DELAY_MS - now);
}
