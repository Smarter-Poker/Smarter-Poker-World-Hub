/* ═══════════════════════════════════════════════════════════════════════════
   TWO-FACTOR AUTH MODAL — SMS ENROLMENT
   ═══════════════════════════════════════════════════════════════════════════

   The second factor is a TEXT MESSAGE to the phone number already verified on
   the account. There is no authenticator app, no QR code and no shared secret
   in this flow — the previous version rendered a QR from /api/auth/mfa/setup,
   which no longer returns one.

   ENROL      POST /api/auth/mfa/setup     → texts a code, returns
                                             { phoneHint, challengeId, codeLength }
              POST /api/auth/mfa/verify    → { code, challengeId } → enables the
                                             factor and returns 10 backup codes.

   DISABLE    POST /api/auth/mfa/disable   → goes straight through when the
                                             browser already holds a valid MFA
                                             session (the 30-day trusted-device
                                             path). Otherwise it answers
                                             `requiresMfa` and we text a code
                                             via /api/auth/mfa/send-code —
                                             /disable only VERIFIES, it does
                                             not send.

   NO VERIFIED PHONE is not an error state — setup answers 400 with
   `requiresPhoneVerification: true`, and we show the user how to fix it.

   All props are optional. The component keeps its own state and mirrors it out
   through whichever setters the parent supplied, so it cannot crash on a
   missing prop, and it never assumes a response shape.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '../../../lib/authUtils';

const RESEND_COOLDOWN_SEC = 30;
const RATE_LIMITED_COOLDOWN_SEC = 60;
const BACKUP_CODE_LEN = 8;

const noop = () => {};

async function readJson(res) {
    try {
        const parsed = await res.json();
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
        return {};
    }
}

export default function TwoFactorAuthModal({
    show2FAModal, setShow2FAModal, twoFactorEnabled, setTwoFactorEnabled, qrCode, setQrCode, manualEntryKey, setManualEntryKey, verificationCode, setVerificationCode, backupCodes, setBackupCodes, loadingMFA, setLoadingMFA, mfaFeedback, setMfaFeedback, user, showDisable2FAConfirm, setShowDisable2FAConfirm, backupCodesCopied, setBackupCodesCopied, onStartPhoneVerification
}) {
    /* Parent setters are optional — normalise every one of them. */
    const closeModal = typeof setShow2FAModal === 'function' ? setShow2FAModal : noop;
    const pushEnabled = typeof setTwoFactorEnabled === 'function' ? setTwoFactorEnabled : noop;
    const pushCode = typeof setVerificationCode === 'function' ? setVerificationCode : noop;
    const pushBackupCodes = typeof setBackupCodes === 'function' ? setBackupCodes : noop;
    const pushLoading = typeof setLoadingMFA === 'function' ? setLoadingMFA : noop;
    const pushFeedback = typeof setMfaFeedback === 'function' ? setMfaFeedback : noop;
    const pushDisableConfirm = typeof setShowDisable2FAConfirm === 'function' ? setShowDisable2FAConfirm : noop;
    const pushCopied = typeof setBackupCodesCopied === 'function' ? setBackupCodesCopied : noop;

    const inputRef = useRef(null);

    /* 'idle' → 'code' → 'done'  (plus 'phone' when there is nothing to text) */
    const [step, setStep] = useState('idle');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type, message }
    const [phoneHint, setPhoneHint] = useState(null);
    const [challengeId, setChallengeId] = useState(null);
    const [codeLength, setCodeLength] = useState(null);
    const [cooldown, setCooldown] = useState(0);
    const [codes, setCodes] = useState(Array.isArray(backupCodes) ? backupCodes : []);
    const [copied, setCopied] = useState(false);

    /* Disable flow */
    const [confirmDisable, setConfirmDisable] = useState(showDisable2FAConfirm === true);
    const [disableNeedsCode, setDisableNeedsCode] = useState(false);

    const enabled = twoFactorEnabled === true;
    const expectedLen =
        Number.isInteger(codeLength) && codeLength >= 4 && codeLength <= 8 ? codeLength : null;

    const say = useCallback((type, message) => {
        const payload = message ? { type, message } : null;
        setFeedback(payload);
        pushFeedback(payload);
    }, [pushFeedback]);

    const setLoading = useCallback((v) => {
        setBusy(v);
        pushLoading(v);
    }, [pushLoading]);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const closeAndReset = () => {
        setCode('');
        pushCode('');
        say(null, null);
        setConfirmDisable(false);
        pushDisableConfirm(false);
        setDisableNeedsCode(false);
        closeModal(false);
    };

    const authHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
    });

    /* Shared handling for a send-a-code response. */
    const applySendResponse = (json) => {
        if (typeof json.phoneHint === 'string' && json.phoneHint) setPhoneHint(json.phoneHint);
        if (json.challengeId) setChallengeId(json.challengeId);
        if (Number.isFinite(Number(json.codeLength))) setCodeLength(Number(json.codeLength));
        setCooldown(RESEND_COOLDOWN_SEC);
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    /* ── ENROL: ask the server to text a code ───────────────────────────── */
    const startSetup = async ({ isResend = false } = {}) => {
        if (busy) return;
        setLoading(true);
        say(null, null);
        try {
            const res = await fetch('/api/auth/mfa/setup', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(),
                body: JSON.stringify({}),
            });
            const json = await readJson(res);

            if (!res.ok) {
                if (json.requiresPhoneVerification || json.code === 'PHONE_NOT_VERIFIED') {
                    setStep('phone');
                    say('error', typeof json.error === 'string' && json.error
                        ? json.error
                        : 'Add and verify a mobile number first — that is where your codes are texted.');
                    return;
                }
                if (res.status === 409) {
                    /* Already enrolled — reflect that instead of arguing. */
                    pushEnabled(true);
                    say('error', typeof json.error === 'string' ? json.error : 'Two-factor is already enabled.');
                    return;
                }
                if (res.status === 429) {
                    setCooldown(RATE_LIMITED_COOLDOWN_SEC);
                    say('error', 'Too many code requests. Please wait a minute and try again.');
                    return;
                }
                say('error', typeof json.error === 'string' && json.error
                    ? json.error
                    : 'We could not send your code right now. Please try again.');
                return;
            }

            applySendResponse(json);
            setStep('code');
            say('success', isResend ? 'New code sent.' : null);
        } catch (err) {
            console.warn('[2fa] setup error:', err);
            say('error', 'We could not reach the server. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    /* ── ENROL: confirm the texted code ─────────────────────────────────── */
    const verify2FA = async () => {
        if (busy) return;
        const cleaned = String(code).replace(/\D/g, '');
        if (expectedLen ? cleaned.length !== expectedLen : !/^\d{4,8}$/.test(cleaned)) {
            say('error', expectedLen
                ? `Enter the ${expectedLen}-digit code we texted you.`
                : 'Enter the code we texted you.');
            return;
        }

        setLoading(true);
        say(null, null);
        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(),
                body: JSON.stringify({ code: cleaned, challengeId: challengeId || undefined }),
            });
            const json = await readJson(res);

            if (!res.ok || json.success === false) {
                say('error', typeof json.error === 'string' && json.error
                    ? json.error
                    : "That code didn't work. Please try again.");
                setCode('');
                pushCode('');
                setTimeout(() => inputRef.current?.focus(), 50);
                return;
            }

            const issued = Array.isArray(json.backupCodes) ? json.backupCodes.filter((c) => typeof c === 'string') : [];
            setCodes(issued);
            pushBackupCodes(issued);
            pushEnabled(true);
            setStep('done');
            setCode('');
            pushCode('');
            say('success', typeof json.message === 'string' && json.message
                ? json.message
                : 'Two-factor is on. We will text you a code when something needs confirming.');
        } catch (err) {
            console.warn('[2fa] verify error:', err);
            say('error', 'We could not reach the server. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    /* ── DISABLE: text a confirmation code (/disable does not send) ─────── */
    const sendDisableCode = async ({ isResend = false } = {}) => {
        try {
            const res = await fetch('/api/auth/mfa/send-code', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(),
            });
            const json = await readJson(res);
            if (!res.ok) {
                if (res.status === 429) setCooldown(RATE_LIMITED_COOLDOWN_SEC);
                say('error', typeof json.error === 'string' && json.error
                    ? json.error
                    : 'We could not text you a code. Use a backup code instead.');
                return;
            }
            applySendResponse(json);
            say('success', isResend ? 'New code sent.' : 'We texted you a code to confirm turning 2FA off.');
        } catch (err) {
            console.warn('[2fa] disable send error:', err);
            say('error', 'We could not reach the server. Please try again.');
        }
    };

    /* ── DISABLE ────────────────────────────────────────────────────────── */
    const disable2FA = async (withCode) => {
        if (busy) return;
        setLoading(true);
        say(null, null);
        try {
            const body = {};
            if (withCode) {
                body.code = String(withCode).replace(/[^A-Za-z0-9]/g, '');
                if (challengeId) body.challengeId = challengeId;
            }
            const res = await fetch('/api/auth/mfa/disable', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
            const json = await readJson(res);

            if (!res.ok || json.success === false) {
                /* No valid MFA session yet — text a code and ask for it. */
                if ((json.requiresMfa || json.requiresRecentMfa) && !withCode) {
                    setDisableNeedsCode(true);
                    await sendDisableCode();
                    return;
                }
                say('error', typeof json.error === 'string' && json.error
                    ? json.error
                    : 'We could not turn off two-factor. Please try again.');
                return;
            }

            pushEnabled(false);
            setCodes([]);
            pushBackupCodes([]);
            setConfirmDisable(false);
            pushDisableConfirm(false);
            setDisableNeedsCode(false);
            setCode('');
            pushCode('');
            setStep('idle');
            say('success', typeof json.message === 'string' && json.message
                ? json.message
                : 'Two-factor authentication has been turned off.');
        } catch (err) {
            console.warn('[2fa] disable error:', err);
            say('error', 'We could not reach the server. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const copyCodes = () => {
        try { navigator.clipboard.writeText(codes.join('\n')); } catch (_e) { console.warn('[App] Handled exception:', _e?.message || _e); }
        setCopied(true);
        pushCopied(true);
        setTimeout(() => { setCopied(false); pushCopied(false); }, 2000);
    };

    const shown = feedback || (mfaFeedback && typeof mfaFeedback === 'object' ? mfaFeedback : null);
    const destination = phoneHint ? String(phoneHint) : 'the number on your account';
    const codeReady = expectedLen
        ? String(code).replace(/\D/g, '').length === expectedLen
        : /^\d{4,8}$/.test(String(code).replace(/\D/g, ''));

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget) closeAndReset(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeAndReset(); }}
            tabIndex={-1}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.9)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20
            }}>
            <div style={{
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                borderRadius: 16,
                padding: 32,
                maxWidth: 500,
                width: '100%',
                maxHeight: '85vh',
                overflow: 'auto',
                border: '1px solid rgba(0, 212, 255, 0.2)'
            }}>
                <h2 style={{ color: '#fff', marginBottom: 16, fontSize: 24 }}>
                    {enabled ? 'Two-Factor Authentication' : 'Turn On Two-Factor Authentication'}
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 24, fontSize: 14 }}>
                    We text a short code to your mobile number. One code covers everything for 30 days —
                    you will not be asked again on a remembered device until then.
                </p>

                {!enabled ? (
                    <>
                        {/* ── No verified phone: an actionable path, not an error ── */}
                        {step === 'phone' ? (
                            <div style={{
                                background: 'rgba(255, 193, 7, 0.1)',
                                border: '1px solid rgba(255, 193, 7, 0.3)',
                                borderRadius: 12,
                                padding: 20,
                                marginBottom: 20
                            }}>
                                <h3 style={{ color: '#FFC107', fontSize: 16, marginBottom: 8 }}>Verify a mobile number first</h3>
                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, margin: '0 0 16px' }}>
                                    Two-factor codes are sent by text, so we need a mobile number we have confirmed
                                    is yours. Add and verify one under Settings → Account → Phone Number, then come
                                    back here.
                                </p>
                                <div style={{ display: 'flex', gap: 12 }}>
                                    {typeof onStartPhoneVerification === 'function' && (
                                        <button
                                            onClick={() => onStartPhoneVerification()}
                                            style={{
                                                flex: 1,
                                                padding: '12px 24px',
                                                background: '#00D4FF',
                                                border: 'none',
                                                borderRadius: 20,
                                                color: '#000',
                                                fontSize: 14,
                                                fontWeight: 600,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Verify My Phone
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setStep('idle'); say(null, null); }}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        ) : step === 'idle' ? (
                            <>
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: 12,
                                    padding: 20,
                                    marginBottom: 20
                                }}>
                                    <h3 style={{ color: '#00D4FF', fontSize: 16, marginBottom: 12 }}>How it works</h3>
                                    <ol style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, paddingLeft: 20, margin: 0 }}>
                                        <li style={{ marginBottom: 8 }}>We text a code to the mobile number verified on your account.</li>
                                        <li style={{ marginBottom: 8 }}>You type it in here once.</li>
                                        <li>That is it — no app to install, and no new code for 30 days.</li>
                                    </ol>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={() => startSetup()}
                                        disabled={busy}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: busy ? '#666' : '#00D4FF',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: busy ? '#999' : '#000',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: busy ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {busy ? 'Sending...' : 'Text Me A Code'}
                                    </button>
                                    <button
                                        onClick={closeAndReset}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : step === 'code' ? (
                            <>
                                <div style={{
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    borderRadius: 12,
                                    padding: 16,
                                    marginBottom: 20
                                }}>
                                    <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, margin: 0 }}>
                                        We texted {expectedLen ? `a ${expectedLen}-digit code` : 'a code'} to{' '}
                                        <strong style={{ color: '#fff' }}>{destination}</strong>. Enter it below to finish.
                                    </p>
                                </div>

                                <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={expectedLen || 8}
                                    placeholder={expectedLen === 4 ? '1234' : 'Enter Code'}
                                    value={code}
                                    onChange={(e) => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, expectedLen || 8);
                                        setCode(v);
                                        pushCode(v);
                                    }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && codeReady) verify2FA(); }}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: 8,
                                        color: '#fff',
                                        fontSize: 16,
                                        marginBottom: 12,
                                        textAlign: 'center',
                                        letterSpacing: 4,
                                        boxSizing: 'border-box'
                                    }}
                                />

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 20, fontSize: 13 }}>
                                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Didn&apos;t get it?</span>
                                    <button
                                        onClick={() => startSetup({ isResend: true })}
                                        disabled={busy || cooldown > 0}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            padding: 0,
                                            color: busy || cooldown > 0 ? 'rgba(255,255,255,0.35)' : '#00D4FF',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            cursor: busy || cooldown > 0 ? 'not-allowed' : 'pointer',
                                            textDecoration: busy || cooldown > 0 ? 'none' : 'underline'
                                        }}
                                    >
                                        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                                    </button>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <button
                                        onClick={verify2FA}
                                        disabled={busy || !codeReady}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: busy || !codeReady ? '#666' : '#00D4FF',
                                            border: 'none',
                                            borderRadius: 20,
                                            color: busy || !codeReady ? '#999' : '#000',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: busy || !codeReady ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {busy ? 'Verifying...' : 'Verify & Enable'}
                                    </button>
                                    <button
                                        onClick={closeAndReset}
                                        style={{
                                            flex: 1,
                                            padding: '12px 24px',
                                            background: 'rgba(255, 255, 255, 0.1)',
                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                            borderRadius: 20,
                                            color: '#fff',
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : null}

                        {/* Inline feedback banner */}
                        {shown && shown.message && (
                            <div style={{ padding: '8px 12px', marginTop: 12, background: shown.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${shown.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: shown.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                {shown.message}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div style={{
                            background: 'rgba(0, 255, 0, 0.1)',
                            border: '1px solid rgba(0, 255, 0, 0.3)',
                            borderRadius: 12,
                            padding: 20,
                            marginBottom: 20,
                            textAlign: 'center'
                        }}>
                            <h3 style={{ color: '#0f0', fontSize: 18, marginBottom: 8 }}>2FA Is Active</h3>
                            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: 0 }}>
                                We text a code to {phoneHint ? <strong style={{ color: '#fff' }}>{phoneHint}</strong> : 'your verified mobile number'} when
                                something sensitive needs confirming — and not again for 30 days on a remembered device.
                            </p>
                        </div>

                        {!confirmDisable ? (
                            <button
                                onClick={() => { setConfirmDisable(true); pushDisableConfirm(true); }}
                                disabled={busy}
                                style={{
                                    width: '100%',
                                    padding: '12px 24px',
                                    background: busy ? '#999' : '#ff4757',
                                    border: 'none',
                                    borderRadius: 20,
                                    color: '#fff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: busy ? 'not-allowed' : 'pointer',
                                    marginBottom: 12
                                }}
                            >
                                Turn Off 2FA
                            </button>
                        ) : (
                            <div style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.3)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 12 }}>
                                    Are you sure? This will make your account less secure, and your backup codes will stop working.
                                </p>

                                {disableNeedsCode && (
                                    <>
                                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8 }}>
                                            Enter the code we texted to {destination} — or one of your backup codes.
                                        </p>
                                        <input
                                            type="text"
                                            inputMode="text"
                                            autoComplete="one-time-code"
                                            maxLength={12}
                                            placeholder="Code"
                                            value={code}
                                            onChange={(e) => { setCode(e.target.value); pushCode(e.target.value); }}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                borderRadius: 8,
                                                color: '#fff',
                                                fontSize: 15,
                                                marginBottom: 8,
                                                textAlign: 'center',
                                                letterSpacing: 3,
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12, fontSize: 12 }}>
                                            <button
                                                onClick={() => sendDisableCode({ isResend: true })}
                                                disabled={busy || cooldown > 0}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    padding: 0,
                                                    color: busy || cooldown > 0 ? 'rgba(255,255,255,0.35)' : '#00D4FF',
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: busy || cooldown > 0 ? 'not-allowed' : 'pointer',
                                                    textDecoration: busy || cooldown > 0 ? 'none' : 'underline'
                                                }}
                                            >
                                                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                                            </button>
                                        </div>
                                    </>
                                )}

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => {
                                            const entered = String(code).replace(/[^A-Za-z0-9]/g, '');
                                            disable2FA(disableNeedsCode ? entered : null);
                                        }}
                                        disabled={busy || (disableNeedsCode && String(code).replace(/[^A-Za-z0-9]/g, '').length < 4)}
                                        style={{ flex: 1, padding: '10px', background: busy ? '#999' : '#ff4757', border: 'none', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
                                    >
                                        {busy ? 'Turning Off...' : 'Yes, Turn It Off'}
                                    </button>
                                    <button
                                        onClick={() => { setConfirmDisable(false); pushDisableConfirm(false); setDisableNeedsCode(false); setCode(''); pushCode(''); }}
                                        style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                                    >
                                        Keep Enabled
                                    </button>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={closeAndReset}
                            style={{
                                width: '100%',
                                padding: '12px 24px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>

                        {shown && shown.message && (
                            <div style={{ padding: '8px 12px', marginTop: 12, background: shown.type === 'success' ? 'rgba(49, 162, 76, 0.15)' : 'rgba(255, 71, 87, 0.15)', border: `1px solid ${shown.type === 'success' ? 'rgba(49, 162, 76, 0.3)' : 'rgba(255, 71, 87, 0.3)'}`, borderRadius: 8, color: shown.type === 'success' ? '#31A24C' : '#ff4757', fontSize: 13 }}>
                                {shown.message}
                            </div>
                        )}
                    </>
                )}

                {/* Backup codes — issued once, on successful enrolment. */}
                {codes.length > 0 && (
                    <div style={{
                        background: 'rgba(0, 212, 255, 0.08)',
                        border: '1px solid rgba(0, 212, 255, 0.25)',
                        borderRadius: 12,
                        padding: 20,
                        marginTop: 16,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h4 style={{ color: '#00D4FF', fontSize: 14, fontWeight: 700, margin: 0 }}>Backup Codes</h4>
                            <button
                                onClick={copyCodes}
                                style={{ padding: '4px 12px', background: copied || backupCodesCopied ? 'rgba(49, 162, 76, 0.2)' : 'rgba(0, 212, 255, 0.15)', border: `1px solid ${copied || backupCodesCopied ? 'rgba(49, 162, 76, 0.4)' : 'rgba(0, 212, 255, 0.3)'}`, borderRadius: 20, color: copied || backupCodesCopied ? '#31A24C' : '#00D4FF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            >
                                {copied || backupCodesCopied ? 'Copied!' : 'Copy All'}
                            </button>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 12 }}>
                            Save these somewhere safe. Each works once, is {BACKUP_CODE_LEN} characters long, and they
                            are the only way in if you lose the phone we text.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {codes.map((c, i) => (
                                <div key={i} style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'monospace', textAlign: 'center' }}>{c}</div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
