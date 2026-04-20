/* ═══════════════════════════════════════════════════════════════════════════
   MFA SELF-SERVICE PAGE — Phase 6.1.24
   URL: /auth/settings/mfa
   ═══════════════════════════════════════════════════════════════════════════

   Three states, driven by user_mfa_factors row:

   1. NOT ENROLLED (no row or row.enabled === false + no pending secret)
      → "Enable two-factor authentication" → /api/auth/mfa/setup returns
         QR + secret → user scans → enters 6-digit code → /api/auth/mfa/verify
         → server enables + returns 10 backup codes → we render them once.

   2. ENROLLED (row.enabled === true)
      → "Two-factor authentication is ON" + disable button.
      → Disable requires a fresh TOTP or backup code (/api/auth/mfa/disable).

   3. ENROLLMENT PENDING (row exists, enabled=false — user called setup but
      never finished verification)
      → Treat as case 1 — re-show the QR / code entry.

   This page does NOT go behind the MFA edge-gate itself — the whole point
   of it is that users have not yet MFA'd. It requires a normal Supabase
   session (step-1 password only).
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../../../src/lib/supabase';

export default function MfaSettingsPage() {
    const router = useRouter();

    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    // Current MFA state for this user
    const [mfaStatus, setMfaStatus] = useState(null); // 'off' | 'on' | 'pending'

    // Enrolment flow state
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [pendingSecret, setPendingSecret] = useState(null);
    const [enrollCode, setEnrollCode] = useState('');
    const [enrolling, setEnrolling] = useState(false);
    const [freshBackupCodes, setFreshBackupCodes] = useState(null);

    // Disable flow state
    const [disableCode, setDisableCode] = useState('');
    const [disabling, setDisabling] = useState(false);

    // ── Bootstrap ─────────────────────────────────────────────────────────
    useEffect(() => {
        async function init() {
            const { data: { session: s } } = await supabase.auth.getSession();
            if (!s) {
                router.replace(
                    `/auth/login?redirect=${encodeURIComponent('/auth/settings/mfa')}`,
                );
                return;
            }
            setSession(s);
            await refreshStatus(s);
        }
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    async function refreshStatus(s = session) {
        if (!s) return;
        setLoading(true);
        try {
            const { data, error: dbErr } = await supabase
                .from('user_mfa_factors')
                .select('enabled, verified_at')
                .eq('user_id', s.user.id)
                .maybeSingle();
            if (dbErr) throw dbErr;

            if (!data) setMfaStatus('off');
            else if (data.enabled) setMfaStatus('on');
            else setMfaStatus('pending');
        } catch (err) {
            console.error('[mfa-settings] status probe failed', err);
            setError('Could not load your MFA status. Please refresh.');
        } finally {
            setLoading(false);
        }
    }

    // ── Enrolment: setup → verify ─────────────────────────────────────────
    async function startEnrolment() {
        setError(null);
        setNotice(null);
        setFreshBackupCodes(null);
        setEnrolling(true);
        try {
            const res = await fetch('/api/auth/mfa/setup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Setup failed');

            setQrDataUrl(json.qrCode || json.qrCodeDataURL || null);
            setPendingSecret(json.secret || json.base32 || null);
        } catch (err) {
            console.error('[mfa-settings] setup error', err);
            setError(err.message || 'Could not start enrolment.');
        } finally {
            setEnrolling(false);
        }
    }

    async function confirmEnrolment() {
        setError(null);
        setNotice(null);
        const cleaned = String(enrollCode).replace(/\s+/g, '');
        if (!/^\d{6}$/.test(cleaned)) {
            setError('Enter the 6-digit code from your authenticator app.');
            return;
        }
        setEnrolling(true);
        try {
            const res = await fetch('/api/auth/mfa/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ code: cleaned }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Verification failed');

            setFreshBackupCodes(json.backupCodes || []);
            setQrDataUrl(null);
            setPendingSecret(null);
            setEnrollCode('');
            setNotice('Two-factor authentication is now ON.');
            await refreshStatus();
        } catch (err) {
            console.error('[mfa-settings] verify error', err);
            setError(err.message || 'Could not verify that code.');
        } finally {
            setEnrolling(false);
        }
    }

    // ── Disable ──────────────────────────────────────────────────────────
    async function confirmDisable() {
        setError(null);
        setNotice(null);
        const cleaned = String(disableCode).replace(/\s+/g, '').toUpperCase();
        if (cleaned.length !== 6 && cleaned.length !== 8) {
            setError('Enter your current 6-digit TOTP code or an 8-char backup code.');
            return;
        }
        setDisabling(true);
        try {
            const res = await fetch('/api/auth/mfa/disable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ code: cleaned }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Disable failed');

            setDisableCode('');
            setNotice('Two-factor authentication has been disabled.');
            await refreshStatus();
        } catch (err) {
            console.error('[mfa-settings] disable error', err);
            setError(err.message || 'Could not disable two-factor authentication.');
        } finally {
            setDisabling(false);
        }
    }

    // ── Render helpers ───────────────────────────────────────────────────
    function copyBackupCodes() {
        if (!freshBackupCodes) return;
        try {
            navigator.clipboard.writeText(freshBackupCodes.join('\n'));
            setNotice('Backup codes copied to clipboard.');
        } catch {
            setError('Copy failed — please select the codes manually.');
        }
    }

    function downloadBackupCodes() {
        if (!freshBackupCodes) return;
        const body = [
            'Smarter.Poker — MFA backup codes',
            `Generated: ${new Date().toISOString()}`,
            `Account: ${session?.user?.email || ''}`,
            '',
            'Each code can be used exactly once. Store them somewhere safe',
            '(a password manager or a printed copy in a secure location).',
            '',
            ...freshBackupCodes,
            '',
        ].join('\n');
        const blob = new Blob([body], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smarter-poker-backup-codes-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (loading) {
        return (
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <p style={{ color: '#cbd5e1', textAlign: 'center' }}>Loading…</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Two-Factor Authentication · Smarter.Poker</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <div style={bgStyle}>
                <div style={cardStyle}>
                    <h1 style={titleStyle}>Two-Factor Authentication</h1>
                    <p style={subtitleStyle}>
                        Add a second factor to your sign-in. Required for admin,
                        VIP, and high-value accounts.
                    </p>

                    {notice && <div style={noticeStyle}>{notice}</div>}
                    {error && <div style={errorStyle} role="alert">{error}</div>}

                    {/* ── State 1 & 3 — off / pending: offer enrolment ─── */}
                    {(mfaStatus === 'off' || mfaStatus === 'pending') && !freshBackupCodes && (
                        <section style={sectionStyle}>
                            {!qrDataUrl && !pendingSecret && (
                                <>
                                    <p style={bodyTextStyle}>
                                        Status:{' '}
                                        <strong style={{ color: '#fca5a5' }}>
                                            {mfaStatus === 'off' ? 'Not enrolled' : 'Enrolment incomplete'}
                                        </strong>
                                    </p>
                                    <button
                                        onClick={startEnrolment}
                                        disabled={enrolling}
                                        style={{
                                            ...primaryBtnStyle,
                                            opacity: enrolling ? 0.55 : 1,
                                            cursor: enrolling ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {enrolling ? 'Preparing…' : 'Enable two-factor authentication'}
                                    </button>
                                </>
                            )}

                            {(qrDataUrl || pendingSecret) && (
                                <>
                                    <p style={bodyTextStyle}>
                                        Scan this QR code with your authenticator app
                                        (1Password, Authy, Google Authenticator, etc.),
                                        then enter the 6-digit code it shows.
                                    </p>

                                    {qrDataUrl && (
                                        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
                                            <img
                                                src={qrDataUrl}
                                                alt="MFA QR code"
                                                style={{
                                                    width: '12rem',
                                                    height: '12rem',
                                                    background: '#fff',
                                                    padding: '0.5rem',
                                                    borderRadius: '0.5rem',
                                                }}
                                            />
                                        </div>
                                    )}

                                    {pendingSecret && (
                                        <details style={{ marginBottom: '1rem' }}>
                                            <summary style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '0.8rem' }}>
                                                Can't scan? Enter this code manually
                                            </summary>
                                            <code style={secretCodeStyle}>{pendingSecret}</code>
                                        </details>
                                    )}

                                    <label style={labelStyle}>Verification code</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        placeholder="123456"
                                        value={enrollCode}
                                        onChange={(e) => setEnrollCode(e.target.value)}
                                        disabled={enrolling}
                                        style={inputStyle}
                                    />

                                    <button
                                        onClick={confirmEnrolment}
                                        disabled={enrolling || !enrollCode}
                                        style={{
                                            ...primaryBtnStyle,
                                            opacity: enrolling || !enrollCode ? 0.55 : 1,
                                            cursor: enrolling || !enrollCode ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {enrolling ? 'Verifying…' : 'Verify & turn on'}
                                    </button>
                                </>
                            )}
                        </section>
                    )}

                    {/* ── Fresh backup codes (one-time display) ─────────── */}
                    {freshBackupCodes && (
                        <section style={sectionStyle}>
                            <h2 style={{ color: '#fbbf24', fontSize: '1rem', margin: 0 }}>
                                Save these backup codes
                            </h2>
                            <p style={bodyTextStyle}>
                                Each code works exactly once. You'll need one if you lose
                                your authenticator. <strong>We will never show them again.</strong>
                            </p>
                            <div style={codesGridStyle}>
                                {freshBackupCodes.map((c) => (
                                    <code key={c} style={codePillStyle}>{c}</code>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button onClick={copyBackupCodes} style={secondaryBtnStyle}>
                                    Copy to clipboard
                                </button>
                                <button onClick={downloadBackupCodes} style={secondaryBtnStyle}>
                                    Download .txt
                                </button>
                            </div>
                            <button
                                onClick={() => setFreshBackupCodes(null)}
                                style={{ ...primaryBtnStyle, marginTop: '1rem' }}
                            >
                                I've saved them — continue
                            </button>
                        </section>
                    )}

                    {/* ── State 2 — on: allow disable ───────────────────── */}
                    {mfaStatus === 'on' && !freshBackupCodes && (
                        <section style={sectionStyle}>
                            <p style={bodyTextStyle}>
                                Status:{' '}
                                <strong style={{ color: '#4ade80' }}>
                                    Two-factor authentication is ON
                                </strong>
                            </p>

                            <details style={{ marginTop: '1rem' }}>
                                <summary style={dangerSummaryStyle}>
                                    Disable two-factor authentication
                                </summary>
                                <div style={{ padding: '0.75rem 0 0' }}>
                                    <p style={{ ...bodyTextStyle, color: '#fca5a5' }}>
                                        Enter your current authenticator code (or a backup code)
                                        to turn off MFA. Your account will be less secure.
                                    </p>
                                    <label style={labelStyle}>Current code</label>
                                    <input
                                        type="text"
                                        inputMode="text"
                                        autoComplete="one-time-code"
                                        maxLength={8}
                                        placeholder="6-digit TOTP or backup code"
                                        value={disableCode}
                                        onChange={(e) => setDisableCode(e.target.value)}
                                        disabled={disabling}
                                        style={inputStyle}
                                    />
                                    <button
                                        onClick={confirmDisable}
                                        disabled={disabling || !disableCode}
                                        style={{
                                            ...dangerBtnStyle,
                                            opacity: disabling || !disableCode ? 0.55 : 1,
                                            cursor: disabling || !disableCode ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {disabling ? 'Disabling…' : 'Disable MFA'}
                                    </button>
                                </div>
                            </details>
                        </section>
                    )}

                    <div style={dividerStyle} />

                    <p style={helpTextStyle}>
                        Need to replace a lost device?{' '}
                        <a href="mailto:support@smarter.poker" style={{ color: '#60a5fa' }}>
                            Contact support
                        </a>
                        {' '}— recovery requires identity verification.
                    </p>
                </div>
            </div>
        </>
    );
}

/* ── styles ─────────────────────────────────────────────────────────────── */

const bgStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
    background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 50%, #020617 100%)',
};

const cardStyle = {
    width: '100%',
    maxWidth: '32rem',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.25)',
    borderRadius: '1rem',
    padding: '2rem',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
    backdropFilter: 'blur(12px)',
};

const titleStyle = {
    color: '#f8fafc',
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
    letterSpacing: '-0.01em',
};

const subtitleStyle = {
    color: '#94a3b8',
    fontSize: '0.9rem',
    margin: '0.5rem 0 1.25rem',
};

const sectionStyle = {
    marginTop: '1rem',
    padding: '1rem',
    background: 'rgba(2, 6, 23, 0.45)',
    border: '1px solid rgba(148, 163, 184, 0.15)',
    borderRadius: '0.75rem',
};

const bodyTextStyle = {
    color: '#cbd5e1',
    fontSize: '0.9rem',
    lineHeight: 1.55,
    margin: '0 0 0.75rem',
};

const labelStyle = {
    display: 'block',
    fontSize: '0.75rem',
    color: '#cbd5e1',
    margin: '0.75rem 0 0.4rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 600,
};

const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem',
    fontSize: '1.15rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    letterSpacing: '0.3em',
    textAlign: 'center',
    background: 'rgba(2, 6, 23, 0.6)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '0.5rem',
    color: '#f8fafc',
    outline: 'none',
    boxSizing: 'border-box',
};

const primaryBtnStyle = {
    marginTop: '0.75rem',
    width: '100%',
    padding: '0.85rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#f8fafc',
    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))',
    border: '1px solid rgba(59, 130, 246, 0.5)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
};

const secondaryBtnStyle = {
    flex: 1,
    padding: '0.65rem 0.75rem',
    fontSize: '0.85rem',
    color: '#e2e8f0',
    background: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
};

const dangerBtnStyle = {
    marginTop: '0.75rem',
    width: '100%',
    padding: '0.85rem 1rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#fee2e2',
    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.85), rgba(185, 28, 28, 0.9))',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    borderRadius: '0.5rem',
    cursor: 'pointer',
};

const dangerSummaryStyle = {
    cursor: 'pointer',
    color: '#fca5a5',
    fontSize: '0.85rem',
    fontWeight: 500,
};

const errorStyle = {
    marginTop: '0.75rem',
    padding: '0.65rem 0.85rem',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    borderRadius: '0.5rem',
    color: '#fca5a5',
    fontSize: '0.85rem',
};

const noticeStyle = {
    marginTop: '0.75rem',
    padding: '0.65rem 0.85rem',
    background: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.35)',
    borderRadius: '0.5rem',
    color: '#86efac',
    fontSize: '0.85rem',
};

const dividerStyle = {
    height: '1px',
    background: 'rgba(148, 163, 184, 0.15)',
    margin: '1.5rem 0 1rem',
};

const helpTextStyle = {
    color: '#64748b',
    fontSize: '0.75rem',
    textAlign: 'center',
    lineHeight: 1.5,
    margin: 0,
};

const secretCodeStyle = {
    display: 'block',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.85rem',
    letterSpacing: '0.1em',
    background: 'rgba(2, 6, 23, 0.8)',
    padding: '0.6rem 0.75rem',
    borderRadius: '0.4rem',
    color: '#e2e8f0',
    marginTop: '0.5rem',
    wordBreak: 'break-all',
};

const codesGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '0.4rem',
    marginTop: '0.75rem',
};

const codePillStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9rem',
    letterSpacing: '0.1em',
    background: 'rgba(251, 191, 36, 0.08)',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    padding: '0.5rem 0.6rem',
    borderRadius: '0.4rem',
    color: '#fde68a',
    textAlign: 'center',
};
