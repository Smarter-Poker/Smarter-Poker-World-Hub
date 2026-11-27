import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAccessToken, getAuthUserId } from '../../lib/authUtils';
import styles from './NewsletterCaptureBar.module.css';

export const WIRE_SUBSCRIBED_KEY = 'sp_wire_subscribed_v1';
export const WIRE_DISMISSED_KEY = 'sp_wire_dismissed_v1';
export const WIRE_SESSION_CHECKED_KEY = 'sp_wire_session_checked_v1';
export const WIRE_SUBSCRIPTION_CHANGED_EVENT = 'sp-wire-subscription-changed';

const SUBSCRIBED_PREFERENCE_MODES = new Set(['all', 'wire_only', 'snooze_30d']);
const UNSUBSCRIBED_PREFERENCE_MODES = new Set(['unsubscribe', 'unsubscribed']);

// Single owner of the cross-surface "this browser is a Weekly Wire subscriber" state. Every
// preference screen calls this after the server confirms a change, so every mounted capture bar
// hides (or returns for an opt-out) immediately and the next session check re-reads the server.
export function applyWireSubscriptionMode(mode) {
    if (typeof window === 'undefined') return;
    const cleanMode = String(mode || '').trim();
    try {
        if (SUBSCRIBED_PREFERENCE_MODES.has(cleanMode)) {
            window.localStorage.setItem(WIRE_SUBSCRIBED_KEY, '1');
        } else if (UNSUBSCRIBED_PREFERENCE_MODES.has(cleanMode)) {
            window.localStorage.removeItem(WIRE_SUBSCRIBED_KEY);
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

// Which signed-in member the session check last read; keyed per member so switching accounts in
// one tab re-checks, and de-duplicates the check while its request is still in flight.
let sessionCheckInFlightFor = '';

const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeCapturePath(rawPath) {
    const base = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (!base) return '';
    return base.length > 1 ? base.replace(/\/+$/, '') : base;
}

export function isNewsletterCaptureRoute(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    if (!raw) return false;
    const norm = normalizeCapturePath(raw);
    if (
        norm === '/hub/magazine/print' ||
        norm.startsWith('/hub/magazine/print/') ||
        norm === '/hub/magazine/table-tent' ||
        norm.startsWith('/hub/magazine/table-tent/') ||
        norm === '/hub/magazine/poker-rooms' ||
        norm.startsWith('/hub/magazine/poker-rooms/') ||
        norm === '/hub/magazine/rss.xml'
    ) {
        return false;
    }
    return (
        raw.startsWith('/tools/') ||
        norm === '/hub/article' ||
        norm.startsWith('/hub/article/') ||
        raw.startsWith('/hub/poker-near-me') ||
        raw.startsWith('/hub/poker-series') ||
        raw.startsWith('/hub/series/') ||
        norm === '/hub/wire' ||
        norm.startsWith('/hub/wire/') ||
        norm === '/hub/magazine' ||
        norm.startsWith('/hub/magazine/') ||
        norm === '/hub/news' ||
        norm.startsWith('/hub/news/') ||
        norm === '/learn' ||
        norm.startsWith('/learn/') ||
        norm === '/rules' ||
        norm.startsWith('/rules/') ||
        norm === '/games' ||
        norm.startsWith('/games/') ||
        norm === '/poker-rooms' ||
        norm.startsWith('/poker-rooms/') ||
        norm === '/freerolls' ||
        norm === '/weekend-tournaments' ||
        norm === '/research' ||
        norm.startsWith('/research/') ||
        norm === '/glossary' ||
        norm.startsWith('/glossary/') ||
        raw.startsWith('/hub/venues/') ||
        raw.startsWith('/hub/tours/') ||
        norm === '/hub/poker-tours' ||
        norm === '/hub/daily-tournaments' ||
        norm === '/hub/events-calendar'
    );
}

export function deriveCaptureSource(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    const norm = normalizeCapturePath(raw);
    if (raw.startsWith('/tools/')) return 'capture:tools';
    if (norm === '/hub/article' || norm.startsWith('/hub/article/')) return 'capture:article';
    if (raw.startsWith('/hub/poker-near-me')) return 'capture:poker-near-me';
    if (raw.startsWith('/hub/poker-series') || raw.startsWith('/hub/series/')) return 'capture:series';
    if (norm === '/hub/magazine' || norm.startsWith('/hub/magazine/')) return 'capture:magazine';
    if (norm === '/hub/wire' || norm.startsWith('/hub/wire/')) return 'capture:wire';
    if (norm === '/hub/news' || norm.startsWith('/hub/news/')) return 'capture:news';
    if (norm === '/learn' || norm.startsWith('/learn/')) return 'capture:learn';
    if (norm === '/rules' || norm.startsWith('/rules/')) return 'capture:rules';
    if (norm === '/games' || norm.startsWith('/games/')) return 'capture:games';
    if (norm === '/poker-rooms' || norm.startsWith('/poker-rooms/')) return 'capture:poker-rooms';
    if (norm === '/freerolls' || norm === '/weekend-tournaments') return 'capture:freerolls';
    if (norm === '/research' || norm.startsWith('/research/')) return 'capture:research';
    if (norm === '/glossary' || norm.startsWith('/glossary/')) return 'capture:glossary';
    if (raw.startsWith('/hub/venues/')) return 'capture:venues';
    if (raw.startsWith('/hub/tours/') || norm === '/hub/poker-tours' || norm === '/hub/daily-tournaments' || norm === '/hub/events-calendar') return 'capture:tours';
    return 'capture:hub';
}

export function deriveCaptureHeadline(rawPath) {
    const raw = String(rawPath || '').split(/[?#]/, 1)[0].trim();
    const norm = normalizeCapturePath(raw);
    if (norm === '/hub/magazine' || norm.startsWith('/hub/magazine/')) {
        return 'Get Smarter.Poker Magazine & Weekly Wire Free';
    }
    if (
        raw.startsWith('/poker-rooms') ||
        raw.startsWith('/hub/venues/') ||
        raw.startsWith('/hub/poker-near-me') ||
        norm === '/freerolls' ||
        norm === '/weekend-tournaments'
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

export default function NewsletterCaptureBar({
    pathname: pathnameProp,
    variant = 'floating',
    alwaysVisible = false,
    source = '',
}) {
    const router = useRouter();
    const activePath = pathnameProp || router?.asPath || router?.pathname || '';
    const isInline = variant === 'inline';

    const [ready, setReady] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [quickSignupOpen, setQuickSignupOpen] = useState(false);
    const [hasScrolled, setHasScrolled] = useState(false);
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [subscribed, setSubscribed] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        let active = true;
        const readHidden = () => {
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
            return { alreadySubscribed, hiddenNow: alreadySubscribed || dismissedSession };
        };

        const { alreadySubscribed, hiddenNow } = readHidden();
        setHidden(hiddenNow);
        setReady(true);

        if (!alwaysVisible && !alreadySubscribed) {
            try {
                const token = getAccessToken();
                const memberKey = token ? String(getAuthUserId() || '') : '';
                const checkedFor = window.sessionStorage.getItem(WIRE_SESSION_CHECKED_KEY) || '';
                if (token && memberKey && checkedFor !== memberKey && sessionCheckInFlightFor !== memberKey) {
                    sessionCheckInFlightFor = memberKey;
                    fetch('/api/news/subscribe?preferences=session', {
                        headers: { Authorization: `Bearer ${token}` },
                    })
                        .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => null) }))
                        .then(({ ok, body }) => {
                            // Only a valid answer for this member is cached; 401/500 or a malformed body retries next route.
                            if (!ok || !body?.success || !body?.currentMode) return;
                            try {
                                window.sessionStorage.setItem(WIRE_SESSION_CHECKED_KEY, memberKey);
                            } catch {
                                /* ignore storage restrictions */
                            }
                            if (body.currentMode !== 'unsubscribed' && active) {
                                try {
                                    window.localStorage.setItem(WIRE_SUBSCRIBED_KEY, '1');
                                } catch {
                                    /* ignore storage restrictions */
                                }
                                setHidden(true);
                            }
                        })
                        .catch(() => {})
                        .finally(() => {
                            if (sessionCheckInFlightFor === memberKey) sessionCheckInFlightFor = '';
                        });
                }
            } catch {
                /* ignore storage or network restrictions */
            }
        }

        const syncFromStorage = () => {
            if (active) setHidden(readHidden().hiddenNow);
        };
        const syncQuickSignup = (ev) => {
            if (active) setQuickSignupOpen(Boolean(ev?.detail?.open));
        };
        const syncScroll = () => {
            if (active && window.scrollY >= 320) {
                setHasScrolled(true);
            }
        };
        syncScroll();
        window.addEventListener(WIRE_SUBSCRIPTION_CHANGED_EVENT, syncFromStorage);
        window.addEventListener('storage', syncFromStorage);
        window.addEventListener('sp:quick-signup-state', syncQuickSignup);
        window.addEventListener('scroll', syncScroll, { passive: true });
        return () => {
            active = false;
            window.removeEventListener(WIRE_SUBSCRIPTION_CHANGED_EVENT, syncFromStorage);
            window.removeEventListener('storage', syncFromStorage);
            window.removeEventListener('sp:quick-signup-state', syncQuickSignup);
            window.removeEventListener('scroll', syncScroll);
        };
    }, [activePath, alwaysVisible]);

    const cleanPath = normalizeCapturePath(activePath);
    const routeEligible = isNewsletterCaptureRoute(activePath);
    const effectiveSource = String(source || '').trim() || deriveCaptureSource(cleanPath);

    // Article, Weekly Wire index, and Magazine newsstand pages mount
    // <NewsletterCaptureBar variant="inline" /> directly in flow, so the global
    // floating bar yields there to avoid rendering duplicate bars on the same screen.
    const suppressedForInlineArticle =
        !isInline &&
        (cleanPath === '/hub/article' ||
            cleanPath.startsWith('/hub/article/') ||
            cleanPath === '/hub/wire' ||
            cleanPath === '/hub/magazine');

    const isCalculatorLander = ['/tools/poker-odds-calculator', '/tools/icm-calculator'].includes(cleanPath);
    if (!ready || !routeEligible || suppressedForInlineArticle || (!isInline && isCalculatorLander)) {
        return null;
    }

    if (hidden && !subscribed && !alwaysVisible) {
        return null;
    }

    if (!isInline && !alwaysVisible && (quickSignupOpen || !hasScrolled)) {
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
                    source: effectiveSource,
                }),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || !body?.success) {
                setErrorMsg('Unable To Subscribe Right Now - Please Try Again');
                return;
            }
            setSubscribed(true);
            applyWireSubscriptionMode('all');
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
