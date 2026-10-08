/**
 * WELCOME PACKAGE NUDGE
 * ═══════════════════════════════════════════════════════════════════════════
 * A transient, tappable card for players who have not verified a phone number
 * and therefore have not claimed the welcome package (30-day VIP card + 500
 * diamonds). Shown on the hub once per session, in the same corner and with
 * the same lifetime as DiamondToast, so it never sits on the artwork for long
 * and never covers the featured cards permanently (Dan, 2026-08-29: no ads in
 * random places or overlapping images).
 *
 *   - Shown only when the hub has read profile.phone_verified === false.
 *   - Never on the first visit of a brand-new player: they get the full
 *     welcome screen instead (pages/hub/index.js redirect).
 *   - Once per browser session (sessionStorage), auto-hides after 8 seconds,
 *     and can be dismissed or tapped to open /hub/verify-phone.
 *   - After a dismiss it waits 24 hours (localStorage) before returning.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ShieldCheck, X } from 'lucide-react';
import { capture } from '../../lib/analytics';

const SESSION_KEY = 'sp_welcome_nudge_shown';
const SNOOZE_KEY = 'sp_welcome_nudge_snoozed_until';
const SNOOZE_MS = 24 * 60 * 60 * 1000;
const VISIBLE_MS = 8000;

export default function WelcomePackageNudge({ phoneVerified }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (phoneVerified !== false) return undefined;
        try {
            if (sessionStorage.getItem(SESSION_KEY) === '1') return undefined;
            const until = Number(localStorage.getItem(SNOOZE_KEY) || 0);
            if (until > Date.now()) return undefined;
        } catch (_e) { /* storage unavailable: show once, never persist */ }

        const show = setTimeout(() => {
            setOpen(true);
            try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (_e) { /* ignore */ }
            try { capture('welcome_nudge_shown', { surface: 'hub' }); } catch (_e) { /* best-effort */ }
        }, 2500);
        return () => clearTimeout(show);
    }, [phoneVerified]);

    useEffect(() => {
        if (!open) return undefined;
        const hide = setTimeout(() => setOpen(false), VISIBLE_MS);
        return () => clearTimeout(hide);
    }, [open]);

    if (!open) return null;

    const dismiss = () => {
        setOpen(false);
        try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)); } catch (_e) { /* ignore */ }
        try { capture('welcome_nudge_dismissed', { surface: 'hub' }); } catch (_e) { /* best-effort */ }
    };

    const go = () => {
        setOpen(false);
        try { capture('welcome_nudge_tapped', { surface: 'hub' }); } catch (_e) { /* best-effort */ }
        router.push('/hub/verify-phone');
    };

    return (
        <div style={styles.wrap} role="status" aria-live="polite">
            <style>{`
                @keyframes spWelcomeNudgeIn {
                    from { transform: translateY(-12px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
            <div style={styles.card}>
                <button type="button" onClick={go} style={styles.body} aria-label="Claim your welcome package: verify your phone number">
                    <span style={styles.icon}><ShieldCheck size={18} strokeWidth={2} aria-hidden="true" /></span>
                    <span style={styles.text}>
                        <span style={styles.title}>Claim Your Welcome Package</span>
                        <span style={styles.sub}>Verify Your Phone For A 30-Day VIP Card + 500 Diamonds</span>
                    </span>
                </button>
                <button type="button" onClick={dismiss} className="sp-icon-btn" style={styles.close} aria-label="Not now">
                    <X size={16} strokeWidth={2.25} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

const styles = {
    wrap: {
        // The band between the global header (~46px) and the top of the
        // featured carousel (~165px on a phone). Compact on purpose so it
        // never sits on the artwork (Dan, 2026-08-29).
        position: 'fixed',
        top: '54px',
        left: '12px',
        right: '12px',
        zIndex: 99998,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    card: {
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        maxWidth: '420px',
        background: 'linear-gradient(135deg, rgba(10, 18, 36, 0.98), rgba(7, 12, 24, 0.98))',
        border: '1px solid rgba(0, 212, 255, 0.45)',
        borderRadius: '14px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.55), 0 0 24px rgba(0, 212, 255, 0.18)',
        overflow: 'hidden',
        animation: 'spWelcomeNudgeIn 0.35s ease-out',
    },
    body: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        color: '#e6f1ff',
        textAlign: 'left',
        cursor: 'pointer',
        minHeight: '52px',
    },
    icon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'rgba(0, 212, 255, 0.12)',
        color: '#00d4ff',
        flexShrink: 0,
    },
    text: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
    title: { fontSize: '13px', fontWeight: 700, color: '#ffffff' },
    sub: { fontSize: '11px', color: 'rgba(230, 241, 255, 0.72)', lineHeight: 1.25 },
    close: {
        width: '44px',
        background: 'transparent',
        border: 'none',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        color: 'rgba(230, 241, 255, 0.6)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
};
