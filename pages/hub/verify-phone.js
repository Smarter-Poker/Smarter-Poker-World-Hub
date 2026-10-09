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
import VerificationConsole from '../../src/components/gates/VerificationConsole';
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
        // The player just said "not now": the hub's reminder card waits for
        // the next session instead of popping up on the screen they land on.
        try { sessionStorage.setItem('sp_welcome_nudge_shown', '1'); } catch (_e) { /* ignore */ }
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
            <VerificationConsole checking={checking} alreadyVerified={alreadyVerified} stage={stage}
                busy={busy} error={error} phone={phone} digits={digits} code={code} codeRef={codeRef}
                cooldown={cooldown} formatPhone={formatPhone} sendCode={sendCode} verifyCode={verifyCode}
                skip={skip} goHub={goHub} doneLead={doneLead} vipDays={vipDays}
                welcomeDiamonds={welcomeDiamonds} bonusDiamonds={bonusDiamonds} packageStatus={packageStatus}
                onPhoneChange={(event) => { setPhone(event.target.value); setError(''); }}
                onCodeChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                changePhone={() => { if (!busy) { setStage('phone'); setError(''); } }}
            />
        </>
    );
}
