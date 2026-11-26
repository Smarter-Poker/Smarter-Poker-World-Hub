import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAccessToken } from '../../lib/authUtils';
import styles from './NewsletterCaptureBar.module.css';

export const WIRE_SUBSCRIBED_KEY = 'sp_wire_subscribed_v1';
export const WIRE_DISMISSED_KEY = 'sp_wire_dismissed_v1';

const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeCapturePath(rawPath) {
    const base = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (!base) return '';
    return base.length > 1 ? base.replace(/\/+$/, '') : base;
}

export function isNewsletterCaptureRoute(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (!raw) return false;
    return (
        raw.startsWith('/tools/') ||
        raw === '/hub/article' ||
        raw.startsWith('/hub/article/') ||
        raw.startsWith('/hub/poker-near-me') ||
        raw.startsWith('/hub/poker-series') ||
        raw.startsWith('/hub/series/') ||
        raw === '/hub/wire' ||
        raw.startsWith('/hub/wire/') ||
        raw === '/hub/news' ||
        raw.startsWith('/hub/news/') ||
        raw === '/learn' ||
        raw.startsWith('/learn/') ||
        raw === '/rules' ||
        raw.startsWith('/rules/') ||
        raw === '/games' ||
        raw.startsWith('/games/') ||
        raw === '/poker-rooms' ||
        raw.startsWith('/poker-rooms/') ||
        raw === '/freerolls' ||
        raw === '/weekend-tournaments' ||
        raw === '/research' ||
        raw.startsWith('/research/') ||
        raw === '/glossary' ||
        raw.startsWith('/glossary/') ||
        raw.startsWith('/hub/venues/') ||
        raw.startsWith('/hub/tours/') ||
        raw === '/hub/poker-tours' ||
        raw === '/hub/daily-tournaments' ||
        raw === '/hub/events-calendar'
    );
}

export function deriveCaptureSource(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (raw.startsWith('/tools/')) return 'capture:tools';
    if (raw === '/hub/article' || raw.startsWith('/hub/article/')) return 'capture:article';
    if (raw.startsWith('/hub/poker-near-me')) return 'capture:poker-near-me';
    if (raw.startsWith('/hub/poker-series') || raw.startsWith('/hub/series/')) return 'capture:series';
    if (raw === '/hub/wire' || raw.startsWith('/hub/wire/')) return 'capture:wire';
    if (raw === '/hub/news' || raw.startsWith('/hub/news/')) return 'capture:news';
    if (raw === '/learn' || raw.startsWith('/learn/')) return 'capture:learn';
    if (raw === '/rules' || raw.startsWith('/rules/')) return 'capture:rules';
    if (raw === '/games' || raw.startsWith('/games/')) return 'capture:games';
    if (raw === '/poker-rooms' || raw.startsWith('/poker-rooms/')) return 'capture:poker-rooms';
    if (raw === '/freerolls' || raw === '/weekend-tournaments') return 'capture:freerolls';
    if (raw === '/research' || raw.startsWith('/research/')) return 'capture:research';
    if (raw === '/glossary' || raw.startsWith('/glossary/')) return 'capture:glossary';
    if (raw.startsWith('/hub/venues/')) return 'capture:venues';
    if (raw.startsWith('/hub/tours/') || raw === '/hub/poker-tours' || raw === '/hub/daily-tournaments' || raw === '/hub/events-calendar') return 'capture:tours';
    return 'capture:hub';
}

export function deriveCaptureHeadline(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (
        raw.startsWith('/poker-rooms') ||
        raw.startsWith('/hub/venues/') ||
        raw.startsWith('/hub/poker-near-me') ||
        raw === '/freerolls' ||
        raw === '/weekend-tournaments'
    ) {
        return 'Get Live Tournament Schedules And Weekly Solver Spots In Your Inbox';
    }
    if (
        raw.startsWith('/learn') ||
        raw.startsWith('/tools/') ||
        raw.startsWith('/rules') ||
        raw.startsWith('/games')
    ) {
        return 'Get Weekly GTO Solver Spots, Leaks And Calculator Drops';
    }
    return 'Get Curated World Poker News, Solver Spots And Club Rewards';
}

export default function NewsletterCaptureBar({ pathname: pathnameProp, variant = 'floating', alwaysVisible = false }) {
    const router = useRouter();
    const activePath = pathnameProp || router?.asPath || router?.pathname || '';
    const isInline = variant === 'inline';

    const [ready, setReady] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        let alreadySubscribed = false;
        let dismissedSession = false;
        try {
            alreadySubscribed = window.localStorage.getItem(WIRE_SUBSCRIBED_KEY) === '1';
        } catch {
            alreadySubscribed = false;
        }
        try {
            dismissedSession = window.sessionStorage.getItem(WIRE_DISMISSED_KEY) === '1';
        } catch {
            dismissedSession = false;
        }
        setHidden(alreadySubscribed || dismissedSession);
        setReady(true);

        if (!alwaysVisible && !alreadySubscribed) {
            try {
                const token = getAccessToken();
                const sessionChecked = window.sessionStorage.getItem('sp_wire_session_checked_v1') === '1';
                if (token && !sessionChecked) {
                    window.sessionStorage.setItem('sp_wire_session_checked_v1', '1');
                    fetch('/api/news/subscribe?preferences=session', {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then((res) => res.json())
                        .then((body) => {
                            if (body?.success && body?.currentMode && body.currentMode !== 'unsubscribed') {
                                try {
                                    window.localStorage.setItem(WIRE_SUBSCRIBED_KEY, '1');
                                } catch {
                                    /* ignore storage restrictions */
                                }
                                setHidden(true);
                            }
                        })
                        .catch(() => {});
                }
            } catch {
                /* ignore storage or network restrictions */
            }
        }
    }, [activePath, alwaysVisible]);

    const cleanPath = String(activePath || '').split(/[?#]/, 1)[0].trim();
    const routeEligible = isNewsletterCaptureRoute(cleanPath);

    // Article pages mount <NewsletterCaptureBar variant="inline" /> directly at
    // the end of the story body, so the global floating bar yields there to avoid
    // rendering duplicate bars on the same screen.
    const suppressedForInlineArticle =
        !isInline && (cleanPath === '/hub/article' || cleanPath.startsWith('/hub/article/'));

    if (!ready || !routeEligible || suppressedForInlineArticle) {
        return null;
    }

    if (hidden && !subscribed && !alwaysVisible) {
        return null;
    }

    const handleDismiss = () => {
        if (typeof window !== 'undefined') {
            try {
                window.sessionStorage.setItem(WIRE_DISMISSED_KEY, '1');
            } catch {
                /* ignore storage restrictions */
            }
        }
        setHidden(true);
        setSubscribed(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!EMAIL_SHAPE_RE.test(trimmed)) {
            setErrorMsg('Please Enter A Valid Email Address');
            return;
        }

        setSubmitting(true);
        setErrorMsg('');
        try {
            const response = await fetch('/api/news/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: trimmed,
                    source: deriveCaptureSource(cleanPath),
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body?.success) {
                setErrorMsg('Unable To Subscribe Right Now - Please Try Again');
                return;
            }
            if (typeof window !== 'undefined') {
                try {
                    window.localStorage.setItem(WIRE_SUBSCRIBED_KEY, '1');
                } catch {
                    /* ignore storage restrictions */
                }
            }
            setSubscribed(true);
            setEmail('');
        } catch {
            setErrorMsg('Unable To Subscribe Right Now - Please Try Again');
        } finally {
            setSubmitting(false);
        }
    };

    const wrapClass = isInline ? styles.inlineWrap : styles.floatingWrap;
    const cardClass = isInline ? styles.inlineCard : styles.floatingCard;

    return (
        <aside className={wrapClass} aria-label="Smarter.Poker Weekly Wire Subscription">
            <div className={cardClass}>
                {subscribed ? (
                    <div className={styles.confirmedRow} role="status">
                        <div className={styles.confirmedText}>
                            You Are Subscribed - Check Your Inbox For Your Welcome Bonus
                        </div>
                        {!alwaysVisible && (
                            <button
                                type="button"
                                className={styles.dismissBtn}
                                onClick={handleDismiss}
                                aria-label="Close Subscription Confirmation"
                                title="Close Subscription Confirmation"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className={styles.innerRow}>
                            <div className={styles.copyCol}>
                                <div className={styles.eyebrowRow}>
                                    <span className={styles.eyebrow}>Smarter.Poker Weekly Wire</span>
                                    <span className={styles.badge}>25 Free Bonus Chips</span>
                                </div>
                                <p className={styles.headline}>
                                    {deriveCaptureHeadline(cleanPath)}
                                </p>
                                {isInline && (
                                    <p className={styles.subcopy}>
                                        New Subscribers Also Receive Instant Instructions For 25 Free Kings Club Chips, 30-Day VIP &amp; 500 Free Diamonds.
                                    </p>
                                )}
                            </div>
                            <form className={styles.formRow} onSubmit={handleSubmit} noValidate>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(ev) => setEmail(ev.target.value)}
                                    placeholder="Enter Your Email Address"
                                    aria-label="Enter Your Email Address"
                                    className={`${styles.emailInput} no-capitalize`}
                                    autoComplete="email"
                                    disabled={submitting}
                                />
                                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                                    {submitting ? 'Joining...' : 'Get Weekly Wire'}
                                </button>
                                {!isInline && !alwaysVisible && (
                                    <button
                                        type="button"
                                        className={styles.dismissBtn}
                                        onClick={handleDismiss}
                                        aria-label="Dismiss Weekly Wire Bar"
                                        title="Dismiss Weekly Wire Bar"
                                    >
                                        &times;
                                    </button>
                                )}
                            </form>
                        </div>
                        {errorMsg && (
                            <div className={styles.errorText} role="alert">
                                {errorMsg}
                            </div>
                        )}
                    </>
                )}
            </div>
        </aside>
    );
}
