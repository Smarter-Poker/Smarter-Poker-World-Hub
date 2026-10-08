/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — VERIFY PHONE / CLAIM WELCOME PACKAGE
   /hub/verify-phone

   Owner instruction (Dan, 2026-10-07): phone verification no longer happens
   on the signup form. A brand-new player confirms their email, logs in, and
   this is their first screen: verify a phone number to receive the welcome
   package (30-day VIP card + 500 diamonds), or skip. Anyone who skipped finds
   "Verify Phone Number" in the hub hamburger menu until they verify.

   The payout happens server-side in pages/api/sms/verify-otp.js on the
   authenticated path (bearer token): phone + phone_verified on the profile,
   the 30-day VIP card, the catalog phone_verified award, and the 500 welcome
   diamonds through the Mint under signup:<uid>.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Crown, Gem, CheckCircle2 } from 'lucide-react';
import { capture, FunnelEvents } from '../../src/lib/analytics';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { useRequireAuth, authedFetch } from '../../src/lib/authUtils';
import { busEmit } from '../../src/engine/EventBus';
import { showDiamondToast } from '../../src/components/diamonds/DiamondToast';

const RESEND_COOLDOWN_S = 60;
const DISMISS_KEY = 'phone_prompt_dismissed_at';

function formatPhone(value) {
    const cleaned = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
}

export default function VerifyPhonePage() {
    const router = useRouter();
    const isWelcome = router.query.welcome === '1';

    // The repo's guard: resolves the session through every recovery layer
    // and only bounces to /auth/login when the player really is signed out.
    const { user, checking: authChecking } = useRequireAuth(isWelcome ? '/hub/verify-phone?welcome=1' : '/hub/verify-phone');
    const [profileChecked, setProfileChecked] = useState(false);
    const [alreadyVerified, setAlreadyVerified] = useState(false);

    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [stage, setStage] = useState('phone'); // 'phone' | 'code' | 'done'
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [result, setResult] = useState(null);
    const codeRef = useRef(null);

    // ── Does this player still need this? ───────────────────────────────
    useEffect(() => {
        if (!user?.id) return undefined;
        let cancelled = false;
        (async () => {
            try {
                // profiles.phone is not readable by the browser (column grant
                // withheld on purpose); phone_verified is.
                const { data: profile, error: readErr } = await supabase
                    .from('profiles')
                    .select('phone_verified')
                    .eq('id', user.id)
                    .maybeSingle();
                if (cancelled) return;
                if (readErr) console.warn('[verify-phone] profile read failed:', readErr.message);
                if (profile?.phone_verified === true) setAlreadyVerified(true);
            } catch (_e) { /* show the form anyway */ }
            if (!cancelled) setProfileChecked(true);
        })();
        return () => { cancelled = true; };
    }, [user?.id]);

    // useRequireAuth only resolves with a null user on its way to /auth/login,
    // so a missing user keeps the skeleton up instead of flashing the form.
    const checking = authChecking || !user?.id || !profileChecked;

    // Funnel: how many players reach this screen, and from where.
    useEffect(() => {
        if (checking || alreadyVerified) return;
        try { capture(FunnelEvents.PHONE_VERIFY_SHOWN, { welcome: isWelcome }); } catch (_e) { /* analytics is best-effort */ }
    }, [checking, alreadyVerified, isWelcome]);

    // ── Resend cooldown ─────────────────────────────────────────────────
    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const digits = phone.replace(/\D/g, '');

    const sendCode = useCallback(async () => {
        if (busy || cooldown > 0) return;
        if (digits.length !== 10) {
            setError('Please Enter A Valid 10-Digit US Mobile Number');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await authedFetch('/api/sms/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: digits }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed To Send Code');
            setStage('code');
            setCode('');
            setCooldown(RESEND_COOLDOWN_S);
            try { capture(FunnelEvents.PHONE_VERIFY_CODE_SENT, { welcome: isWelcome }); } catch (_e) { /* best-effort */ }
            setTimeout(() => codeRef.current?.focus(), 50);
        } catch (err) {
            setError(err.message || 'Failed To Send Code');
        } finally {
            setBusy(false);
        }
    }, [busy, cooldown, digits, isWelcome]);

    const verifyCode = useCallback(async () => {
        if (busy) return;
        if (code.length !== 4) {
            setError('Please Enter The 4-Digit Code');
            return;
        }
        setBusy(true);
        setError('');
        try {
            // authedFetch attaches the bearer token; verify-otp only pays the
            // welcome package on the authenticated path.
            const res = await authedFetch('/api/sms/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: digits, code }),
            });
            if (res.status === 401) throw new Error('Your Session Expired. Please Sign In Again.');
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'Verification Failed');
            setResult(data);
            setStage('done');
            try {
                capture(FunnelEvents.PHONE_VERIFIED, {
                    welcome: isWelcome,
                    vip_granted: !!data.vipGranted,
                    welcome_diamonds: Number(data.welcomeDiamonds || 0),
                    package_status: data.packageStatus || null,
                });
            } catch (_e) { /* best-effort */ }
            // Hydrate the header and balance the way the old welcome popup did:
            // the VIP badge flips on and the diamonds land without a reload.
            try {
                const welcome = Number(data.welcomeDiamonds || 0);
                const bonus = Number(data.diamondsAwarded || 0);
                if (data.vipGranted) {
                    window.dispatchEvent(new CustomEvent('vip-status-changed', { detail: { vipGranted: true } }));
                }
                if (welcome > 0) {
                    showDiamondToast(welcome, 'Welcome Package');
                    busEmit.diamondsEarned(welcome, 'Welcome Package');
                }
                if (bonus > 0) {
                    showDiamondToast(bonus, 'Phone Verified');
                    busEmit.diamondsEarned(bonus, 'Phone Verified');
                }
                window.dispatchEvent(new Event('profile-updated'));
                // The official popup is for a package already in hand; this
                // screen just delivered it, so it never needs to show again.
                localStorage.setItem(`sp-welcome-shown-${user?.id}`, 'true');
            } catch (_e) { /* cosmetic */ }
        } catch (err) {
            setError(err.message || 'Verification Failed');
        } finally {
            setBusy(false);
        }
    }, [busy, code, digits, user?.id, isWelcome]);

    const skip = useCallback(() => {
        if (busy) return;
        setBusy(true);
        // This session's flag first so the hub never bounces back; the metadata
        // write (for later sessions) is fired without holding the navigation.
        try { sessionStorage.setItem('phone_prompt_skipped', '1'); } catch (_e) { /* ignore */ }
        try { capture(FunnelEvents.PHONE_VERIFY_SKIPPED, { welcome: isWelcome }); } catch (_e) { /* best-effort */ }
        try {
            supabase.auth.updateUser({ data: { [DISMISS_KEY]: new Date().toISOString() } })
                .catch(() => { /* non-blocking */ });
        } catch (_e) { /* non-blocking */ }
        router.replace('/hub');
    }, [router, busy, isWelcome]);

    const goHub = useCallback(() => {
        try { sessionStorage.setItem('just_authenticated', 'true'); } catch (_e) { /* ignore */ }
        router.replace('/hub');
    }, [router]);

    const vipDays = result?.vipDays || (result?.vipGranted ? 30 : 0);
    const welcomeDiamonds = Number(result?.welcomeDiamonds || 0);
    const bonusDiamonds = Number(result?.diamondsAwarded || 0);
    const packageStatus = result?.packageStatus || (welcomeDiamonds > 0 ? 'granted' : 'already_claimed');
    const doneLead = packageStatus === 'withheld_disposable'
        ? 'Your Phone Number Is Verified. Welcome Packages Are Not Available To Accounts Registered With A Temporary Email Address.'
        : packageStatus === 'mint_refused'
            ? 'Your Phone Number Is Verified. The Platform Is On A Short Maintenance Break, So Your Welcome Diamonds Will Be Added At Your Next Sign In.'
            : 'Your Phone Number Is Verified.';

    return (
        <>
            <SEOHead
                title="Verify Your Phone And Claim Your Welcome Package"
                description="Verify Your Phone Number On Smarter.Poker To Activate Your 30-Day VIP Card And Receive 500 Welcome Diamonds."
                canonical="/hub/verify-phone"
                noindex
            />
            <div style={styles.page}>
                <div style={styles.glowTop} />
                <div style={styles.card}>
                    <div style={styles.brand}>SMARTER.POKER</div>

                    {checking && (
                        <div style={styles.muted}>Loading Your Account…</div>
                    )}

                    {!checking && alreadyVerified && stage !== 'done' && (
                        <>
                            <h1 style={styles.title}>Phone Verified</h1>
                            <p style={styles.lead}>
                                Your Number Is Already Verified And Your Welcome Package Has Been Applied To This Account.
                            </p>
                            <button type="button" onClick={goHub} style={styles.primaryBtn}>Go To The Hub →</button>
                        </>
                    )}

                    {!checking && !alreadyVerified && stage !== 'done' && (
                        <>
                            <h1 style={styles.title}>{isWelcome ? 'Welcome To Smarter.Poker' : 'Verify Your Phone Number'}</h1>
                            <p style={styles.lead}>
                                Verify Your Phone Number To Unlock Your Welcome Package.
                            </p>

                            <div style={styles.packageRow}>
                                <div style={styles.perk}>
                                    <div style={styles.perkIcon}><Crown size={28} strokeWidth={1.75} aria-hidden="true" /></div>
                                    <div style={styles.perkTitle}>30-Day VIP Card</div>
                                    <div style={styles.perkSub}>Full VIP Access, Free</div>
                                </div>
                                <div style={styles.perk}>
                                    <div style={styles.perkIcon}><Gem size={28} strokeWidth={1.75} aria-hidden="true" /></div>
                                    <div style={styles.perkTitle}>500 Diamonds</div>
                                    <div style={styles.perkSub}>Welcome Bonus</div>
                                </div>
                            </div>

                            {stage === 'phone' && (
                                <form
                                    onSubmit={(e) => { e.preventDefault(); sendCode(); }}
                                    style={styles.form}
                                >
                                    <label htmlFor="vp-phone" style={styles.label}>US Mobile Number</label>
                                    <div style={styles.phoneRow}>
                                        <span style={styles.prefix}>+1</span>
                                        <input
                                            id="vp-phone"
                                            type="tel"
                                            inputMode="tel"
                                            autoComplete="tel-national"
                                            placeholder="(555) 555-5555"
                                            value={formatPhone(phone)}
                                            onChange={(e) => { setPhone(e.target.value); setError(''); }}
                                            style={styles.input}
                                        />
                                    </div>
                                    {error && <div role="alert" style={styles.error}>{error}</div>}
                                    <button
                                        type="submit"
                                        disabled={busy || digits.length !== 10}
                                        style={{ ...styles.primaryBtn, opacity: busy || digits.length !== 10 ? 0.5 : 1 }}
                                    >
                                        {busy ? 'Sending…' : 'Send Verification Code'}
                                    </button>
                                    <div style={styles.fine}>
                                        One Account Per Phone Number. We Use Your Number For Verification Only And Never Share It.
                                    </div>
                                </form>
                            )}

                            {stage === 'code' && (
                                <form
                                    onSubmit={(e) => { e.preventDefault(); verifyCode(); }}
                                    style={styles.form}
                                >
                                    <div style={styles.sentTo}>
                                        Code Sent To <strong>+1 {formatPhone(phone)}</strong>{' '}
                                        <button type="button" onClick={() => { setStage('phone'); setError(''); }} style={styles.linkBtn}>Change</button>
                                    </div>
                                    <label htmlFor="vp-code" style={styles.label}>4-Digit Code</label>
                                    <input
                                        id="vp-code"
                                        ref={codeRef}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        pattern="[0-9]*"
                                        maxLength={4}
                                        placeholder="• • • •"
                                        value={code}
                                        onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                                        style={{ ...styles.input, ...styles.codeInput }}
                                    />
                                    {error && <div role="alert" style={styles.error}>{error}</div>}
                                    <button
                                        type="submit"
                                        disabled={busy || code.length !== 4}
                                        style={{ ...styles.primaryBtn, opacity: busy || code.length !== 4 ? 0.5 : 1 }}
                                    >
                                        {busy ? 'Verifying…' : 'Verify And Claim'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={sendCode}
                                        disabled={busy || cooldown > 0}
                                        style={{ ...styles.secondaryBtn, opacity: cooldown > 0 ? 0.6 : 1 }}
                                    >
                                        {cooldown > 0 ? `Resend Code In ${cooldown}s` : 'Resend Code'}
                                    </button>
                                </form>
                            )}

                            <button type="button" onClick={skip} style={styles.skipBtn}>
                                {isWelcome ? 'Skip For Now' : 'Not Now'}
                            </button>
                            <div style={styles.fine}>
                                You Can Verify Any Time From The Hub Menu Under “Verify Phone Number”.
                            </div>
                        </>
                    )}

                    {stage === 'done' && (
                        <>
                            <div style={styles.doneBadge}><CheckCircle2 size={36} strokeWidth={2.25} aria-hidden="true" /></div>
                            <h1 style={styles.title}>You're All Set</h1>
                            <p style={styles.lead}>{doneLead}</p>
                            {packageStatus !== 'withheld_disposable' && (
                                <div style={styles.packageRow}>
                                    <div style={{ ...styles.perk, ...(vipDays > 0 ? styles.perkActive : {}) }}>
                                        <div style={styles.perkIcon}><Crown size={28} strokeWidth={1.75} aria-hidden="true" /></div>
                                        <div style={styles.perkTitle}>{vipDays > 0 ? `${vipDays}-Day VIP Card` : 'VIP Card'}</div>
                                        <div style={styles.perkSub}>{vipDays > 0 ? 'Activated' : 'Already On Your Account'}</div>
                                    </div>
                                    <div style={{ ...styles.perk, ...(welcomeDiamonds > 0 ? styles.perkActive : {}) }}>
                                        <div style={styles.perkIcon}><Gem size={28} strokeWidth={1.75} aria-hidden="true" /></div>
                                        <div style={styles.perkTitle}>{welcomeDiamonds > 0 ? `+${welcomeDiamonds} Diamonds` : '500 Diamonds'}</div>
                                        <div style={styles.perkSub}>
                                            {welcomeDiamonds > 0
                                                ? 'Added To Your Balance'
                                                : (packageStatus === 'mint_refused' ? 'Arriving At Next Sign In' : 'Already Claimed')}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {bonusDiamonds > 0 && (
                                <div style={styles.fine}>Plus {bonusDiamonds} Bonus Diamonds For Verifying Your Phone.</div>
                            )}
                            <button type="button" onClick={goHub} style={styles.primaryBtn}>Enter The Hub →</button>
                        </>
                    )}

                    <div style={styles.footer}>
                        <Link
                            href="/hub"
                            style={styles.footerLink}
                            onClick={() => { try { sessionStorage.setItem('phone_prompt_skipped', '1'); } catch (_e) { /* ignore */ } }}
                        >Hub</Link>
                        <span style={styles.dot}>·</span>
                        <Link href="/hub/help" style={styles.footerLink}>Help</Link>
                        {user?.email && (
                            <>
                                <span style={styles.dot}>·</span>
                                <span style={styles.footerMuted}>{user.email}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <style>{`
                html, body { background: #070a12; }
                @keyframes vpPulse { 0%, 100% { opacity: .55; } 50% { opacity: .95; } }
            `}</style>
        </>
    );
}

const CYAN = '#00d4ff';
const styles = {
    page: {
        // The approved global header sits above this page in the flow (~56px).
        minHeight: 'calc(100dvh - 56px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'radial-gradient(1200px 600px at 50% -10%, rgba(0, 114, 255, 0.25), transparent 60%), #070a12',
        fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#e6f1ff',
        position: 'relative',
        overflow: 'hidden',
    },
    glowTop: {
        position: 'absolute',
        top: '-120px',
        left: '50%',
        width: '420px',
        height: '420px',
        transform: 'translateX(-50%)',
        background: 'radial-gradient(circle, rgba(0, 212, 255, 0.18), transparent 60%)',
        animation: 'vpPulse 6s ease-in-out infinite',
        pointerEvents: 'none',
    },
    card: {
        position: 'relative',
        width: '100%',
        maxWidth: '440px',
        background: 'linear-gradient(180deg, rgba(13, 20, 36, 0.96), rgba(8, 12, 22, 0.98))',
        border: '1px solid rgba(0, 212, 255, 0.25)',
        boxShadow: '0 0 60px rgba(0, 212, 255, 0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
        borderRadius: '18px',
        padding: '28px 22px 20px',
        textAlign: 'center',
    },
    brand: {
        fontFamily: 'var(--font-orbitron), sans-serif',
        fontSize: '13px',
        letterSpacing: '4px',
        fontWeight: 800,
        background: `linear-gradient(135deg, ${CYAN} 0%, #0072ff 100%)`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: '18px',
    },
    title: {
        fontFamily: 'var(--font-orbitron), sans-serif',
        fontSize: '22px',
        fontWeight: 700,
        margin: '0 0 8px',
        color: '#ffffff',
        lineHeight: 1.2,
    },
    lead: { fontSize: '14px', color: 'rgba(230, 241, 255, 0.75)', margin: '0 0 18px', lineHeight: 1.5 },
    muted: { fontSize: '14px', color: 'rgba(230, 241, 255, 0.6)', padding: '24px 0' },
    packageRow: { display: 'flex', gap: '10px', marginBottom: '20px' },
    perk: {
        flex: 1,
        background: 'rgba(0, 212, 255, 0.06)',
        border: '1px solid rgba(0, 212, 255, 0.22)',
        borderRadius: '12px',
        padding: '14px 8px',
    },
    perkActive: { background: 'rgba(49, 162, 76, 0.12)', border: '1px solid rgba(49, 162, 76, 0.5)' },
    perkIcon: { display: 'flex', justifyContent: 'center', color: CYAN, marginBottom: '8px' },
    perkTitle: { fontSize: '15px', fontWeight: 700, color: '#ffffff' },
    perkSub: { fontSize: '11px', color: 'rgba(230, 241, 255, 0.6)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    form: { display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' },
    label: { fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(230, 241, 255, 0.65)' },
    phoneRow: { display: 'flex', gap: '8px', alignItems: 'stretch' },
    prefix: {
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        fontSize: '16px',
        fontWeight: 600,
    },
    input: {
        flex: 1,
        width: '100%',
        minHeight: '48px',
        padding: '0 14px',
        borderRadius: '10px',
        background: 'rgba(11, 14, 20, 0.9)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        color: '#ffffff',
        fontSize: '18px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    codeInput: { textAlign: 'center', letterSpacing: '12px', fontSize: '26px', fontWeight: 700 },
    primaryBtn: {
        width: '100%',
        minHeight: '50px',
        border: 'none',
        borderRadius: '12px',
        background: `linear-gradient(135deg, ${CYAN} 0%, #0072ff 100%)`,
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 0 24px rgba(0, 212, 255, 0.3)',
        marginTop: '4px',
    },
    secondaryBtn: {
        width: '100%',
        minHeight: '44px',
        borderRadius: '12px',
        background: 'transparent',
        border: '1px solid rgba(0, 212, 255, 0.35)',
        color: CYAN,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
    },
    skipBtn: {
        marginTop: '16px',
        background: 'none',
        border: 'none',
        color: 'rgba(230, 241, 255, 0.6)',
        fontSize: '14px',
        textDecoration: 'underline',
        cursor: 'pointer',
        minHeight: '44px',
    },
    linkBtn: { background: 'none', border: 'none', color: CYAN, cursor: 'pointer', fontSize: '13px', padding: 0, textDecoration: 'underline', minHeight: 0 },
    sentTo: { fontSize: '13px', color: 'rgba(230, 241, 255, 0.75)', textAlign: 'center', marginBottom: '4px' },
    error: {
        background: 'rgba(240, 40, 73, 0.15)',
        border: '1px solid rgba(240, 40, 73, 0.5)',
        color: '#ff8da1',
        borderRadius: '10px',
        padding: '10px 12px',
        fontSize: '13px',
        textAlign: 'center',
    },
    fine: { fontSize: '11px', color: 'rgba(230, 241, 255, 0.45)', marginTop: '10px', lineHeight: 1.5, textAlign: 'center' },
    doneBadge: {
        width: '64px',
        height: '64px',
        margin: '0 auto 14px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #31A24C, #1f7a36)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '30px',
        fontWeight: 800,
        color: '#fff',
        boxShadow: '0 0 30px rgba(49, 162, 76, 0.45)',
    },
    footer: { marginTop: '22px', fontSize: '12px', color: 'rgba(230, 241, 255, 0.5)', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' },
    footerLink: { color: CYAN, textDecoration: 'none' },
    footerMuted: { color: 'rgba(230, 241, 255, 0.4)' },
    dot: { color: 'rgba(230, 241, 255, 0.3)' },
};
