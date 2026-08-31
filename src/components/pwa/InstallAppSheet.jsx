/**
 * INSTALL APP SHEET — the thing that actually walks you into installing.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dan, 2026-08-25: "MAKE SURE THAT SMARTER.POKER HAS A full PWA install
 * layer that walks you into installing... THIS NEEDS TO WORK FOR ANDROID
 * USERS AS WELL."
 *
 * One sheet, four honest paths, because the platforms genuinely differ:
 *
 *   Android / desktop Chrome / Edge  one tap, native install dialog
 *   iOS Safari                       Apple exposes no install API at all,
 *                                    so: Share -> Add to Home Screen
 *   iOS Chrome / Firefox / Edge      Add to Home Screen does not exist in
 *                                    those share sheets. Telling the user
 *                                    to "tap Share" sends them somewhere
 *                                    with no such option, so say "open in
 *                                    Safari" instead of lying.
 *   Already installed                say so and close, rather than
 *                                    offering an install that no-ops
 *
 * Why this matters beyond convenience: installing is the gate on push
 * notifications. iOS has no Push API outside an installed app.
 */
import { useEffect, useRef, useState } from 'react';
import {
    triggerInstall, canPromptInstall, isRunningAsApp,
    isIos, isIosSafari, isIosNonSafari, subscribeInstallState,
} from '../../lib/pwaInstall';

const TEAL = '#14B8A6';

function ShareIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={TEAL}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
    );
}

function PlusSquareIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={TEAL}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={TEAL}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

const IOS_STEPS = [
    {
        icon: <ShareIcon />,
        title: 'Tap The Share Button',
        detail: 'The square with an arrow pointing up, in the Safari toolbar. On iPhone it is at the bottom; on iPad it is top right.',
    },
    {
        icon: <PlusSquareIcon />,
        title: 'Tap Add To Home Screen',
        detail: 'Scroll down the share sheet to find it. It has a plus icon next to it.',
    },
    {
        icon: <CheckIcon />,
        title: 'Open It From Your Home Screen',
        detail: 'Launch Smarter Poker from the new icon, then allow notifications when asked. Alerts only work from the installed app.',
    },
];

export default function InstallAppSheet({ onClose, reason }) {
    const overlayRef = useRef(null);
    const closeRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState(null);
    const [, forceRender] = useState(0);

    // Chrome can fire beforeinstallprompt after this sheet opens, which turns
    // an instructions-only sheet into a one-tap install. Re-render when it does.
    useEffect(() => subscribeInstallState(() => forceRender((n) => n + 1)), []);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const nativeAvailable = canPromptInstall();
    const iosSafari = isIosSafari();
    const iosOtherBrowser = isIosNonSafari();
    const installed = isRunningAsApp();

    const handleInstall = async () => {
        if (busy) return;
        setBusy(true);
        setNote(null);
        const result = await triggerInstall();
        setBusy(false);

        if (result === 'accepted' || result === 'already-installed') {
            onClose();
            return;
        }
        if (result === 'dismissed') {
            setNote('No problem. You can install any time from Settings.');
            return;
        }
        if (result === 'ios-needs-safari') {
            setNote('Open smarter.poker in Safari to add it to your Home Screen.');
            return;
        }
        if (result === 'unavailable') {
            setNote('Your browser did not offer an install. Try Chrome on Android, or Safari on iPhone.');
        }
    };

    let body;
    if (installed) {
        body = (
            <p style={S.lead}>
                Smarter Poker Is Already Installed On This Device. Open It From Your Home Screen
                To Get Alerts.
            </p>
        );
    } else if (iosOtherBrowser) {
        body = (
            <p style={S.lead}>
                On IPhone And IPad, Only Safari Can Add An App To Your Home Screen. Open
                Smarter.Poker In Safari, Then Come Back To This Screen.
            </p>
        );
    } else if (nativeAvailable) {
        // Android / desktop Chrome / Edge. One tap, no instructions needed.
        body = (
            <>
                <p style={S.lead}>
                    Install Smarter Poker As An App And Get Seat Alerts, Messages And Game
                    Updates On Your Phone Like Any Other App.
                </p>
                <button type="button" onClick={handleInstall} disabled={busy} style={S.primary}>
                    {busy ? 'Opening...' : 'Install App'}
                </button>
            </>
        );
    } else if (isIos()) {
        body = (
            <>
                <p style={S.lead}>
                    Apple Does Not Allow One-Tap Installs In Safari, So It Takes Three Quick Steps.
                </p>
                <ol style={S.list}>
                    {IOS_STEPS.map((step, i) => (
                        <li key={step.title} style={S.step}>
                            <span aria-hidden="true" style={S.num}>{i + 1}</span>
                            <span style={S.stepIcon}>{step.icon}</span>
                            <span>
                                <span style={S.stepTitle}>{step.title}</span>
                                <span style={S.stepDetail}>{step.detail}</span>
                            </span>
                        </li>
                    ))}
                </ol>
            </>
        );
    } else {
        // Desktop browser with no install support, or Chrome before the event.
        body = (
            <>
                <p style={S.lead}>
                    Install Smarter Poker As An App For Faster Access And Phone Alerts. If Your
                    Browser Supports It, Look For The Install Icon In The Address Bar.
                </p>
                <button type="button" onClick={handleInstall} disabled={busy} style={S.primary}>
                    {busy ? 'Opening...' : 'Try Install'}
                </button>
            </>
        );
    }

    return (
        <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-label="Install Smarter Poker"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
            style={S.overlay}
        >
            <div style={S.sheet}>
                <div style={S.header}>
                    <div style={{ minWidth: 0 }}>
                        <div style={S.title}>Install Smarter Poker</div>
                        {reason && <div style={S.reason}>{reason}</div>}
                    </div>
                    <button ref={closeRef} onClick={onClose} aria-label="Close" style={S.close}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {body}

                {note && <p style={S.note}>{note}</p>}

                <button type="button" onClick={onClose} style={S.ghost}>
                    {iosSafari && !nativeAvailable ? 'Got It' : 'Not Now'}
                </button>
            </div>
        </div>
    );
}

const S = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 999999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    },
    sheet: {
        width: '100%', maxWidth: 460,
        background: '#111827', color: '#fff',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '18px 18px 0 0',
        padding: '20px 18px calc(20px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -16px 60px rgba(0,0,0,0.6)',
        maxHeight: '88vh', overflowY: 'auto',
    },
    header: {
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 12, marginBottom: 10,
    },
    title: { fontSize: 18, fontWeight: 700 },
    reason: { fontSize: 12.5, color: TEAL, fontWeight: 600, marginTop: 3 },
    close: {
        flexShrink: 0, width: 30, height: 30, borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#9CA3AF',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    },
    lead: { fontSize: 14, color: '#9CA3AF', lineHeight: 1.5, margin: '4px 0 0' },
    list: { listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
    step: {
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '11px 12px', borderRadius: 12,
        background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.14)',
    },
    num: {
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        background: TEAL, color: '#04211E', fontSize: 12, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    stepIcon: { flexShrink: 0, lineHeight: 0, marginTop: 1 },
    stepTitle: { display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 2 },
    stepDetail: { display: 'block', fontSize: 12.5, color: '#8B9DAD', lineHeight: 1.45 },
    primary: {
        width: '100%', marginTop: 16, padding: '13px 16px', borderRadius: 12, border: 'none',
        background: TEAL, color: '#04211E', fontSize: 15, fontWeight: 700, cursor: 'pointer',
    },
    ghost: {
        width: '100%', marginTop: 10, padding: '12px 16px', borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
        color: '#D1D5DB', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    },
    note: { marginTop: 12, fontSize: 13, color: '#FCD34D', lineHeight: 1.45 },
};
