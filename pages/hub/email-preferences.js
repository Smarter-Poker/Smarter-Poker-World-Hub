import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '../../src/lib/authUtils';
import {
    WIRE_SESSION_CHECKED_KEY,
    WIRE_SUBSCRIPTION_CHANGED_EVENT,
} from '../../src/components/news/NewsletterCaptureBar';


const PREFERENCE_OPTIONS = [
    {
        key: 'wire_only',
        badge: 'Recommended',
        title: 'Weekly Wire Only (Pause Promo Blasts)',
        description:
            'Keep Receiving Curated Weekly Poker News, Solver Spots, And Tool Spotlights While Pausing All Promotional Broadcasts.',
    },
    {
        key: 'snooze_30d',
        badge: '30-Day Pause',
        title: 'Snooze Emails For 30 Days',
        description:
            'Take A Quiet 30-Day Break From Both Weekly Wire Digests And Promotional Emails Without Losing Your Subscription.',
    },
    {
        key: 'all',
        badge: 'Full Access',
        title: 'Receive All Smarter.Poker Updates',
        description:
            'Get The Weekly Wire Plus Exclusive Free Chip Drops, VIP Invitations, And Major Tournament Announcements.',
    },
    {
        key: 'unsubscribe',
        badge: 'Opt Out',
        title: 'Unsubscribe From Everything',
        description:
            'Immediately Stop All Smarter.Poker News Digests And Promotional Emails For This Address.',
    },
];

function modeLabel(mode) {
    if (mode === 'wire_only') return 'Weekly Wire Only';
    if (mode === 'snooze_30d') return 'Snoozed For 30 Days';
    if (mode === 'unsubscribed') return 'Unsubscribed';
    return 'All Updates Active';
}

export default function EmailPreferencesPage() {
    const router = useRouter();
    const [prefToken, setPrefToken] = useState('');
    const [useSessionAuth, setUseSessionAuth] = useState(false);
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState('');
    const [maskedEmail, setMaskedEmail] = useState('');
    const [currentMode, setCurrentMode] = useState('all');
    const [statusNotice, setStatusNotice] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    // Each load takes a ticket; a slower response from an older token or account never overwrites a newer one.
    const loadSeqRef = useRef(0);
    const saveInFlightRef = useRef(false);

    const loadCurrentPreferences = useCallback(async (rawToken) => {
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setErrorMessage('');
        try {
            const accessToken = getAccessToken();
            const response = await fetch(`/api/news/subscribe?preferences=${encodeURIComponent(rawToken)}`, {
                headers: {
                    Accept: 'application/json',
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
            });
            const body = await response.json().catch(() => ({}));
            if (seq !== loadSeqRef.current) return;
            if (!response.ok || !body?.success) {
                setErrorMessage('This Email Preference Link Is Invalid Or Has Expired.');
                return;
            }
            setMaskedEmail(body.maskedEmail || body.email || '');
            setCurrentMode(body.currentMode || 'all');
        } catch {
            if (seq === loadSeqRef.current) {
                setErrorMessage('Unable To Load Email Preferences Right Now - Please Try Again.');
            }
        } finally {
            if (seq === loadSeqRef.current) setLoading(false);
        }
    }, []);

    const loadSessionPreferences = useCallback(async (sessionJwt) => {
        const seq = ++loadSeqRef.current;
        setLoading(true);
        setErrorMessage('');
        try {
            const response = await fetch('/api/news/subscribe?preferences=session', {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${sessionJwt}`,
                },
            });
            const body = await response.json().catch(() => ({}));
            if (seq !== loadSeqRef.current) return;
            if (!response.ok || !body?.success) {
                return;
            }
            setMaskedEmail(body.maskedEmail || body.email || '');
            setCurrentMode(body.currentMode || 'all');
            setUseSessionAuth(true);
        } catch {
            if (seq === loadSeqRef.current) {
                setErrorMessage('Unable To Load Email Preferences Right Now - Please Try Again.');
            }
        } finally {
            if (seq === loadSeqRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!router.isReady) return;
        const fromQuery = Array.isArray(router.query.token)
            ? router.query.token[0]
            : router.query.token;
        const clean = typeof fromQuery === 'string' ? fromQuery.trim() : '';
        setPrefToken(clean);
        if (clean) {
            setUseSessionAuth(false);
            loadCurrentPreferences(clean);
            return;
        }

        const sessionJwt = getAccessToken();
        if (sessionJwt) {
            loadSessionPreferences(sessionJwt);
            return;
        }

        loadSeqRef.current += 1;
        setUseSessionAuth(false);
        setLoading(false);
    }, [router.isReady, router.query.token, loadCurrentPreferences, loadSessionPreferences]);

    const handleSelectPreference = async (preferenceKey) => {
        if ((!prefToken && !useSessionAuth) || savingKey || saveInFlightRef.current) return;
        saveInFlightRef.current = true;
        setSavingKey(preferenceKey);
        setErrorMessage('');
        setStatusNotice('');
        try {
            const accessToken = getAccessToken();
            const headers = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }
            const bodyPayload = {
                action: 'preferences',
                mode: preferenceKey,
                preference: preferenceKey,
            };
            if (prefToken) {
                bodyPayload.token = prefToken;
            }
            const response = await fetch('/api/news/subscribe', {
                method: 'POST',
                headers,
                body: JSON.stringify(bodyPayload),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body?.success) {
                setErrorMessage('Could Not Save Your Email Preference - Please Try Again.');
                return;
            }
            if (typeof window !== 'undefined') {
                // Keep every Weekly Wire capture bar on this device in step with the saved choice.
                try {
                    if (preferenceKey === 'unsubscribe') {
                        window.localStorage.removeItem('sp_wire_subscribed_v1');
                    } else {
                        window.localStorage.setItem('sp_wire_subscribed_v1', '1');
                    }
                } catch {
                    /* ignore storage restrictions */
                }
                try {
                    window.sessionStorage.removeItem(WIRE_SESSION_CHECKED_KEY);
                } catch {
                    /* ignore storage restrictions */
                }
                try {
                    window.dispatchEvent(new Event(WIRE_SUBSCRIPTION_CHANGED_EVENT));
                } catch {
                    /* ignore environments without Event */
                }
            }
            const updatedMode = body.currentMode || (preferenceKey === 'unsubscribe' ? 'unsubscribed' : preferenceKey);
            setCurrentMode(updatedMode);
            if (body.maskedEmail || body.email) setMaskedEmail(body.maskedEmail || body.email);
            setStatusNotice(`Saved: ${modeLabel(updatedMode)}`);
        } catch {
            setErrorMessage('Could Not Save Your Email Preference - Please Try Again.');
        } finally {
            saveInFlightRef.current = false;
            setSavingKey('');
        }
    };

    return (
        <>
            <Head>
                <title>Email Preferences | Smarter.Poker</title>
                <meta name="robots" content="noindex,nofollow" />
            </Head>
            <main
                style={{
                    minHeight: '100vh',
                    background: '#05070a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 16px',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                }}
            >
                <section
                    style={{
                        width: '100%',
                        maxWidth: '640px',
                        background: '#0b1118',
                        border: '1px solid #1b2c3d',
                        borderRadius: '18px',
                        padding: '34px 26px',
                        boxShadow: '0 24px 60px rgba(5, 7, 10, 0.72)',
                    }}
                >
                    <div
                        style={{
                            color: '#4fc1b3',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '2.8px',
                            textTransform: 'uppercase',
                        }}
                    >
                        Smarter.Poker Inbox Controls
                    </div>

                    <h1
                        style={{
                            margin: '10px 0 10px 0',
                            color: '#ffffff',
                            fontSize: '28px',
                            lineHeight: 1.2,
                            fontWeight: 800,
                        }}
                    >
                        One-Click Email Preferences
                    </h1>

                    <p style={{ margin: '0 0 22px 0', color: '#b7cadc', fontSize: '14.5px', lineHeight: 1.6 }}>
                        Choose Exactly How Often Smarter.Poker Reaches Your Inbox With One Click Below.
                    </p>

                    {loading ? (
                        <div
                            style={{
                                background: '#101a24',
                                border: '1px solid #1b2c3d',
                                borderRadius: '12px',
                                padding: '20px',
                                color: '#9fb3c8',
                                fontSize: '14px',
                            }}
                        >
                            Loading Your Email Preferences...
                        </div>
                    ) : !prefToken && !useSessionAuth ? (
                        <div
                            style={{
                                background: '#101a24',
                                border: '1px solid #1b2c3d',
                                borderRadius: '12px',
                                padding: '22px',
                            }}
                        >
                            <div style={{ color: '#ffffff', fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>
                                Open From Any Smarter.Poker Email
                            </div>
                            <p style={{ margin: '0 0 18px 0', color: '#b7cadc', fontSize: '14px', lineHeight: 1.55 }}>
                                Click The Signed Email Preferences Link At The Bottom Of Any Weekly Wire Or Smarter.Poker Email To Update Delivery In One Click.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <Link
                                    href="/hub/wire"
                                    style={{
                                        display: 'inline-block',
                                        background: '#4fc1b3',
                                        color: '#05070a',
                                        textDecoration: 'none',
                                        fontWeight: 800,
                                        fontSize: '13.5px',
                                        padding: '11px 18px',
                                        borderRadius: '8px',
                                    }}
                                >
                                    Read Weekly Wire Archive
                                </Link>
                                <Link
                                    href="/hub/settings/notifications"
                                    style={{
                                        display: 'inline-block',
                                        background: '#1b2c3d',
                                        color: '#ffffff',
                                        textDecoration: 'none',
                                        fontWeight: 700,
                                        fontSize: '13.5px',
                                        padding: '11px 18px',
                                        borderRadius: '8px',
                                    }}
                                >
                                    Account Notification Settings
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            {maskedEmail && (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '10px',
                                        background: '#101a24',
                                        border: '1px solid #1b2c3d',
                                        borderRadius: '12px',
                                        padding: '14px 16px',
                                        marginBottom: '18px',
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#8fa6bc', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            Managing Inbox
                                        </div>
                                        <div className="no-capitalize" style={{ color: '#ffffff', fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                                            {maskedEmail}
                                        </div>
                                    </div>
                                    <span
                                        style={{
                                            background: 'rgba(79, 193, 179, 0.14)',
                                            border: '1px solid rgba(79, 193, 179, 0.4)',
                                            color: '#4fc1b3',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            padding: '5px 12px',
                                            borderRadius: '999px',
                                        }}
                                    >
                                        {modeLabel(currentMode)}
                                    </span>
                                </div>
                            )}

                            {statusNotice && (
                                <div
                                    role="status"
                                    style={{
                                        background: 'rgba(79, 193, 179, 0.14)',
                                        border: '1px solid rgba(79, 193, 179, 0.45)',
                                        color: '#4fc1b3',
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        marginBottom: '16px',
                                    }}
                                >
                                    {statusNotice}
                                </div>
                            )}

                            {errorMessage && (
                                <div
                                    role="alert"
                                    style={{
                                        background: '#101a24',
                                        border: '1px solid #60a5fa',
                                        color: '#60a5fa',
                                        padding: '12px 16px',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        marginBottom: '16px',
                                    }}
                                >
                                    {errorMessage}
                                </div>
                            )}

                            <div style={{ display: 'grid', gap: '12px' }}>
                                {PREFERENCE_OPTIONS.map((opt) => {
                                    const isSelected =
                                        (opt.key === 'unsubscribe' && currentMode === 'unsubscribed') ||
                                        opt.key === currentMode;
                                    const isSaving = savingKey === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => handleSelectPreference(opt.key)}
                                            disabled={Boolean(savingKey)}
                                            aria-pressed={isSelected}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                background: isSelected ? '#101a24' : '#05070a',
                                                border: isSelected ? '2px solid #4fc1b3' : '1px solid #1b2c3d',
                                                borderRadius: '12px',
                                                padding: '16px 18px',
                                                color: '#ffffff',
                                                cursor: savingKey ? 'default' : 'pointer',
                                                transition: 'border-color 0.18s ease, background 0.18s ease',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '10px',
                                                    marginBottom: '6px',
                                                }}
                                            >
                                                <span style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                                                    {opt.title}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        letterSpacing: '0.8px',
                                                        textTransform: 'uppercase',
                                                        padding: '3px 9px',
                                                        borderRadius: '999px',
                                                        background: isSelected ? '#4fc1b3' : '#1b2c3d',
                                                        color: isSelected ? '#05070a' : '#60a5fa',
                                                    }}
                                                >
                                                    {isSaving ? 'Saving...' : isSelected ? 'Selected' : opt.badge}
                                                </span>
                                            </div>
                                            <div style={{ color: '#b7cadc', fontSize: '13.5px', lineHeight: 1.5 }}>
                                                {opt.description}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div
                        style={{
                            borderTop: '1px solid #1b2c3d',
                            marginTop: '24px',
                            paddingTop: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            fontSize: '13px',
                        }}
                    >
                        <Link href="/hub/wire" style={{ color: '#4fc1b3', textDecoration: 'none', fontWeight: 700 }}>
                            Weekly Wire Web Archive
                        </Link>
                        <Link href="/hub/news" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: 700 }}>
                            Back To News Hub
                        </Link>
                    </div>
                </section>
            </main>
        </>
    );
}
