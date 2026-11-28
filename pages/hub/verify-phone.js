import { shouldOfferPhoneWelcome } from '../../src/lib/phoneWelcome';
import { savePendingPhoneVerification, readPendingPhoneVerification, clearPendingPhoneVerification } from '../../src/lib/pendingPhoneVerification.mjs';
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
import { useRequireAuth, authedFetch, getAccessToken } from '../../src/lib/authUtils';
import { busEmit } from '../../src/engine/EventBus';
import { fetchPendingJoinPath, isSafeRelativePath, safeClubArenaPath } from '../../src/lib/clubInvite';
import { codeNotDeliveredMessage } from '../../src/lib/sms/codeDelivery.mjs';
import {
    cleanPromoTokenShape,
    clearPendingPromoSignupToken,
    getOrCreateClubArenaDeviceId,
    readPendingPromoSignupToken,
    rememberPromoSignupToken,
} from '../../src/lib/promoCampaigns/promoSignupToken.mjs';

const RESEND_COOLDOWN_S = 60;
const DISMISS_KEY = 'phone_prompt_dismissed_at';

const SEO_UNLOCK_PREFIXES = [
    '/tools/',
    '/learn/',
    '/hub/series/',
    '/hub/venues/',
    '/hub/poker-near-me',
    '/hub/tours/',
    '/hub/video-library/watch/',
    '/poker-rooms/',
    '/glossary/',
    '/rules/',
    '/compare/',
    '/freerolls',
];

export function appendSeoUnlockedParam(rawPath) {
    if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//')) return rawPath;
    const hashIdx = rawPath.indexOf('#');
    const pathAndQuery = hashIdx >= 0 ? rawPath.slice(0, hashIdx) : rawPath;
    const hashPart = hashIdx >= 0 ? rawPath.slice(hashIdx) : '';
    const queryIdx = pathAndQuery.indexOf('?');
    const pathname = queryIdx >= 0 ? pathAndQuery.slice(0, queryIdx) : pathAndQuery;
    const queryPart = queryIdx >= 0 ? pathAndQuery.slice(queryIdx + 1) : '';
    const isSeoRoute = SEO_UNLOCK_PREFIXES.some((prefix) => {
        const bare = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
        return pathname === bare || pathname.startsWith(prefix);
    });
    if (!isSeoRoute) return rawPath;
    if (/(?:^|&)unlocked(?:=|&|$)/.test(queryPart)) return rawPath;
    const nextQuery = queryPart ? `${queryPart}&unlocked=1` : 'unlocked=1';
    return `${pathname}?${nextQuery}${hashPart}`;
}

export function describePendingDestination(nextPath) {
    if (typeof nextPath !== 'string') return null;
    const trimmed = nextPath.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
    const pathname = trimmed.split(/[?#]/, 1)[0].toLowerCase().replace(/\/+$/, '') || '/';
    if (pathname === '/' || pathname === '/hub') return 'Your Smarter.Poker Hub';
    if (pathname === '/tools/gto-leak-finder' || pathname.startsWith('/tools/gto-leak-finder/')) {
        return 'Your Full GTO Leak Report';
    }
    if (pathname === '/tools/preflop-ranges' || pathname.startsWith('/tools/preflop-ranges/')) {
        return 'Your Saved GTO Preflop Range';
    }
    if (
        pathname === '/tools/odds'
        || pathname.startsWith('/tools/odds/')
        || pathname === '/tools/poker-odds-calculator'
    ) {
        return 'Your Saved Hand Equity Spot';
    }
    if (pathname === '/tools/icm-calculator') {
        return 'Your Saved ICM Calculation';
    }
    if (pathname === '/tools' || pathname.startsWith('/tools/')) {
        return 'Your Saved Poker Tool Spot';
    }
    if (pathname === '/hub/series' || pathname.startsWith('/hub/series/') || pathname === '/hub/poker-series') {
        return 'Your Tournament Event Reminder';
    }
    if (
        pathname === '/hub/venues'
        || pathname.startsWith('/hub/venues/')
        || pathname.startsWith('/hub/poker-near-me')
        || pathname.startsWith('/poker-rooms')
    ) {
        return 'Your Followed Poker Room';
    }
    if (pathname === '/learn' || pathname.startsWith('/learn/')) {
        return 'Your GTO Strategy Drill';
    }
    if (pathname === '/hub/training' || pathname.startsWith('/hub/training/')) {
        return 'Your 107 GTO Training Games';
    }
    if (pathname === '/hub/club-arena' || pathname.startsWith('/hub/club-arena/')) {
        return 'Your Club Arena Table';
    }
    if (pathname === '/hub/bankroll-manager') {
        return 'Your Cloud Bankroll Manager';
    }
    if (pathname === '/compare' || pathname.startsWith('/compare/')) {
        return 'Your Poker Platform Comparison';
    }
    if (pathname === '/freerolls' || pathname.startsWith('/freerolls/')) {
        return 'Your Free Daily Freeroll Schedule';
    }
    if (pathname === '/glossary' || pathname.startsWith('/glossary/')) {
        return 'Your Interactive Poker Concept & GTO Drills';
    }
    if (pathname === '/rules' || pathname.startsWith('/rules/')) {
        return 'Your Poker Floor Rule & Table Tools';
    }
    if (pathname.startsWith('/hub/video-library/watch')) {
        return 'Your Bookmarked Strategy Video & GTO Drills';
    }
    if (pathname === '/hub/tours' || pathname.startsWith('/hub/tours/')) {
        return 'Your Live Poker Tour Schedule';
    }
    return 'Your Smarter.Poker Destination';
}

function phoneChallengeStorage() {
    try { return sessionStorage; } catch { return null; }
}

function formatPhone(value) {
    const cleaned = String(value || '').replace(/\D/g, '').slice(0, 10);
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
}

export default function VerifyPhonePage() {
    const router = useRouter();
    const isWelcome = router.query.welcome === '1';
    // Honour any safe same-origin relative path passed in ?next= or ?redirect=
    // (such as a Share & Invite club join page or /hub/personal-assistant/review?hand=<uuid>).
    const isSafeInternalPath = (raw) => {
        if (typeof isSafeRelativePath === 'function') return isSafeRelativePath(raw);
        if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return false;
        if (/[\u0000-\u0020\u007f\\]/.test(raw)) return false;
        if (typeof URL === 'function') {
            try {
                return new URL(raw, 'https://same.origin.invalid').origin === 'https://same.origin.invalid';
            } catch {
                return false;
            }
        }
        return !/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !raw.includes('://');
    };
    const rawQueryNext = Array.isArray(router.query.next) ? router.query.next[0] : router.query.next;
    const rawQueryRedirect = Array.isArray(router.query.redirect)
        ? router.query.redirect[0]
        : router.query.redirect;
    const safeQueryNext = isSafeInternalPath(rawQueryNext)
        ? rawQueryNext
        : (isSafeInternalPath(rawQueryRedirect) ? rawQueryRedirect : null);
    const queryNext = safeQueryNext ? appendSeoUnlockedParam(safeQueryNext) : null;
    // Opened without ?next= (the hamburger's verify phone entry): the account's
    // own pending invite, if any, is where the player continues to.
    const [pendingNext, setPendingNext] = useState(null);
    const nextPath = queryNext || pendingNext;
    const pendingDestinationLabel = nextPath ? describePendingDestination(nextPath) : null;
    const safePtShape = (raw) => {
        if (typeof cleanPromoTokenShape === 'function') return cleanPromoTokenShape(raw);
        const val = typeof raw === 'string' ? raw.trim() : '';
        return /^[A-Za-z0-9_-]{8,256}\.[A-Za-z0-9_-]{16,128}$/.test(val) ? val : null;
    };
    const readPtFromSearch = (searchStr) => {
        if (typeof searchStr !== 'string' || !searchStr) return null;
        const m = searchStr.match(/(?:^\?|&)pt=([^&#]+)/);
        if (!m) return null;
        try { return safePtShape(decodeURIComponent(m[1])); } catch { return null; }
    };
    const rawQueryPt = Array.isArray(router.query?.pt) ? router.query.pt[0] : router.query?.pt;
    const initialPt = safePtShape(rawQueryPt) || (
        typeof window !== 'undefined' ? readPtFromSearch(window.location?.search) : null
    );
    const selfParts = [];
    if (isWelcome) selfParts.push('welcome=1');
    if (queryNext) selfParts.push(`next=${encodeURIComponent(queryNext)}`);
    if (initialPt) selfParts.push(`pt=${encodeURIComponent(initialPt)}`);
    const selfPath = `/hub/verify-phone${selfParts.length ? `?${selfParts.join('&')}` : ''}`;

    useEffect(() => {
        try {
            const candidatePt = initialPt || (
                typeof window !== 'undefined' ? readPtFromSearch(window.location?.search) : null
            );
            if (candidatePt && typeof rememberPromoSignupToken === 'function') {
                rememberPromoSignupToken(candidatePt);
            }
        } catch (_ptErr) { /* non-blocking */ }
    }, [initialPt]);

    // The repo's guard: resolves the session through every recovery layer
    // and only bounces to /auth/login when the player really is signed out.
    const { user, checking: authChecking } = useRequireAuth(selfPath);
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

    // A tab reload, auth refresh or application remount must not discard an
    // in-flight ten-minute SMS challenge. Scope recovery to this account.
    useEffect(() => {
        if (!user?.id) return;
        const pending = readPendingPhoneVerification(phoneChallengeStorage(), user.id);
        if (pending) {
            setPhone(pending.phone);
            setStage('code');
            setCooldown(Math.max(0, Math.ceil((pending.sentAt + RESEND_COOLDOWN_S * 1000 - Date.now()) / 1000)));
        }
    }, [user?.id]);

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
                    .select('phone_verified, is_vip, vip_tier')
                    .eq('id', user.id)
                    .maybeSingle();
                if (cancelled) return;
                if (readErr) console.warn('[verify-phone] profile read failed:', readErr.message);
                if (profile?.phone_verified === true) setAlreadyVerified(true);
                if (!readErr && profile && isWelcome && !shouldOfferPhoneWelcome(profile)) {
                    window.location.replace(queryNext || '/hub');
                    return;
                }
            } catch (_e) { /* show the form anyway */ }
            if (!cancelled) setProfileChecked(true);
        })();
        return () => { cancelled = true; };
    }, [user?.id, isWelcome, queryNext]);

    // No ?next=: ask the database whether this account still owes a visit to
    // an invited club's join page.
    useEffect(() => {
        if (!user?.id || queryNext) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const path = await fetchPendingJoinPath(getAccessToken());
                if (!cancelled && path) setPendingNext(path);
            } catch (_e) { /* no pending invite: the page ends on /hub as before */ }
        })();
        return () => { cancelled = true; };
    }, [user?.id, queryNext]);

    // useRequireAuth only resolves with a null user on its way to /auth/login,
    // so a missing user keeps the skeleton up instead of flashing the form.
    const checking = authChecking || !user?.id || !profileChecked;

    // A completed account continues immediately without another verification form.
    useEffect(() => {
        if (!checking && alreadyVerified) window.location.replace(nextPath || '/hub');
    }, [checking, alreadyVerified, nextPath]);

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

    const deliveryWatch = useRef(0);
    const watchCodeDelivery = useCallback((messageId) => {
        const watchId = ++deliveryWatch.current;
        const startedAt = Date.now();
        const poll = async () => {
            if (deliveryWatch.current !== watchId || Date.now() - startedAt > 90000) return;
            try {
                const res = await fetch(`/api/sms/otp-status?sid=${encodeURIComponent(messageId)}`, { cache: 'no-store' });
                const answer = await res.json().catch(() => ({}));
                if (deliveryWatch.current !== watchId) return;
                if (answer.state === 'delivered') return;
                if (answer.state === 'not_delivered') {
                    setError(codeNotDeliveredMessage(answer.reason));
                    setCooldown(0);
                    return;
                }
            } catch (_e) { /* keep waiting; the timer still offers a resend */ }
            setTimeout(poll, 4000);
        };
        setTimeout(poll, 4000);
    }, []);
    useEffect(() => () => { deliveryWatch.current += 1; }, []);

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
            savePendingPhoneVerification(phoneChallengeStorage(), user.id, digits);
            setStage('code');
            setCode('');
            setCooldown(RESEND_COOLDOWN_S);
            // A CODE THAT NEVER ARRIVES IS SAID SO (2026-11-07): the carrier's
            // answer lands in sms_delivery_receipts; on a refusal the player is
            // told at once and may send a new code without waiting out the timer.
            if (data.messageId) watchCodeDelivery(data.messageId);
            try { capture(FunnelEvents.PHONE_VERIFY_CODE_SENT, { welcome: isWelcome }); } catch (_e) { /* best-effort */ }
            setTimeout(() => codeRef.current?.focus(), 50);
        } catch (err) {
            setError(err.message || 'Failed To Send Code');
        } finally {
            setBusy(false);
        }
    }, [busy, cooldown, digits, isWelcome, user?.id]);

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
            let promoToken = null;
            let deviceId = null;
            try {
                const rawPt = Array.isArray(router.query?.pt) ? router.query.pt[0] : router.query?.pt;
                promoToken = (typeof cleanPromoTokenShape === 'function' ? cleanPromoTokenShape(rawPt) : null)
                    || (typeof readPendingPromoSignupToken === 'function' ? readPendingPromoSignupToken() : null);
                if (typeof getOrCreateClubArenaDeviceId === 'function') {
                    deviceId = getOrCreateClubArenaDeviceId();
                }
            } catch (_promoReadErr) { /* non-blocking; server also checks user_metadata */ }
            const res = await authedFetch('/api/sms/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: digits,
                    code,
                    ...(promoToken ? { promoToken } : {}),
                    ...(deviceId ? { deviceId } : {}),
                }),
            });
            if (res.status === 401) throw new Error('Your Session Expired. Please Sign In Again.');
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'Verification Failed');
            clearPendingPhoneVerification(phoneChallengeStorage(), user.id);
            try {
                if (typeof clearPendingPromoSignupToken === 'function') clearPendingPromoSignupToken();
            } catch (_promoClearErr) { /* ignore */ }
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
                    busEmit.diamondsEarned(welcome, 'Welcome Package');
                }
                if (bonus > 0) {
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
    }, [busy, code, digits, user?.id, isWelcome, nextPath]);

    const skip = useCallback(() => {
        if (busy) return;
        clearPendingPhoneVerification(phoneChallengeStorage(), user?.id);
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
        // Club Arena is a separate app behind a rewrite, so a club path is a
        // full navigation rather than a Next route change.
        if (nextPath) window.location.replace(nextPath);
        else router.replace('/hub');
    }, [router, busy, isWelcome, nextPath, user?.id]);

    const promoChips = Number(result?.promoChipsGranted || 0);

    const goHub = useCallback(() => {
        try { sessionStorage.setItem('just_authenticated', 'true'); } catch (_e) { /* ignore */ }
        if (promoChips > 0) window.location.replace('/hub/club-arena/?welcome=chips');
        else if (nextPath) window.location.replace(nextPath);
        else router.replace('/hub');
    }, [router, nextPath, promoChips]);

    // The confirmed server result is shown once, then every player continues.
    // Cancel navigation if this page unmounts before the two-second toast ends.
    useEffect(() => {
        if (stage !== 'done') return undefined;
        const timer = setTimeout(goHub, 2000);
        return () => clearTimeout(timer);
    }, [stage, goHub]);

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
            {isWelcome && nextPath && pendingDestinationLabel && !checking && !alreadyVerified && stage !== 'done' && (
                <div
                    role="status"
                    aria-live="polite"
                    data-testid="verify-phone-continuity-bar"
                    style={{
                        width: '100%',
                        background: '#000',
                        padding: '12px 12px 0',
                        display: 'flex',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            width: 'min(620px, 100%)',
                            padding: '10px 14px',
                            borderRadius: 0,
                            border: '1px solid #3a7fbd',
                            background: 'linear-gradient(180deg, #10243a 0%, #0b1120 100%)',
                            boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.34)',
                            color: '#f2f7ff',
                            fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif",
                            fontSize: 13,
                            fontWeight: 600,
                            lineHeight: 1.45,
                            textAlign: 'center',
                        }}
                    >
                        <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                            {`Waiting Next: ${pendingDestinationLabel}`}
                        </span>
                        <span>
                            {' · Claim Your Free 30-Day VIP + 500 Diamonds In 15 Seconds, Or Skip Straight There'}
                        </span>
                    </div>
                </div>
            )}
            <VerificationConsole checking={checking} alreadyVerified={alreadyVerified} stage={stage}
                busy={busy} error={error} phone={phone} digits={digits} code={code} codeRef={codeRef}
                cooldown={cooldown} formatPhone={formatPhone} sendCode={sendCode} verifyCode={verifyCode}
                skip={skip} goHub={goHub} doneLead={doneLead} vipDays={vipDays}
                welcomeDiamonds={welcomeDiamonds} bonusDiamonds={bonusDiamonds} promoChips={promoChips} packageStatus={packageStatus}
                continueLabel={
                    promoChips > 0 || safeClubArenaPath(nextPath)
                        ? 'Continue To The Club'
                        : (nextPath ? 'Continue' : undefined)
                }
                onPhoneChange={(event) => { setPhone(event.target.value); setError(''); }}
                onCodeChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                changePhone={() => { if (!busy) { clearPendingPhoneVerification(phoneChallengeStorage(), user?.id); setStage('phone'); setError(''); } }}
            />
        </>
    );
}
