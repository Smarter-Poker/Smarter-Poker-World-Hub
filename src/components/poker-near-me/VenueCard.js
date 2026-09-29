/**
 * VenueCard - Premium poker venue card for Poker Near Me page
 * v4.0 — Full UI Overhaul:
 * - Official venue logos with intelligent fallback chain
 * - Real-time Open/Closed status with time parsing
 * - Crowd meter visualization (Quiet → Packed)
 * - Waitlist time estimates
 * - Enhanced visual hierarchy
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { triggerHaptic } from '../../hooks/useHaptics';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import toast from '../../stores/toastStore';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import { getVenueLogoUrl, getVenueLogoFallback, getOpenStatus, getCrowdLevel, estimateWaitTime, isStaleData, getZonedNow, resolveVenueTimeZone } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';
import { homeGameUrl } from '../../lib/home-games/urls';
import { cashGameCountLabel, isModeledCashGameData } from '../../lib/poker-near-me/liveCashGameData';
import PokerNearMeConsole, { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';
import { PnmPlateLabel } from './TourCard';
import { acquireScrollLock } from '../../lib/scrollLock';

const formatMoney = (amount) => {
    if (!amount) return '$0';
    const num = typeof amount === 'string' ? Number(amount.replace(/[^0-9.]/g, '')) : amount;
    if (isNaN(num)) return amount; // Fallback to raw string if completely unparseable
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

// Formats "13:00:00" or "1:00 PM" → "1:00 PM"
const formatTime = (t) => {
    if (!t) return null;
    const str = String(t);
    // Already 12h format
    if (/am|pm/i.test(str)) return str.trim();
    // 24h HH:MM[:SS]
    const m = str.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return str;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${min} ${period}`;
};

function safeHref(url) {
    if (!url) return '';
    const cleanUrl = String(url).replace(/[\x00-\x20]/g, '');
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return '#';
    return cleanUrl;
}

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Poker Club',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity',
    series: 'Poker Series',
    tour: 'Poker Tour',
    tour_stop: 'Poker Tour',
    poker_tour: 'Poker Tour',
};

// Venue type -> ink. Every tone is a console ink (poker-near-me-console.css);
// the old per-type rgba palette drew colours outside the schema.
const VENUE_TYPE_TONES = {
    casino: 'silver',
    card_room: 'green',
    poker_club: 'green',
    home_game: 'muted',
    charity: 'blue',
    tour: 'red',
    tour_stop: 'red',
    poker_tour: 'red',
    series: 'blue',
};

// Game family -> ink for the offered-games line.
function getGameTone(gameName) {
    if (!gameName) return 'silver';
    const upper = gameName.toUpperCase();
    if (upper.includes('NLH') || upper.includes('NO LIMIT') || ((upper.includes('HOLDEM') || upper.includes("HOLD'EM")) && !upper.includes('LIMIT'))) return 'silver';
    return 'blue';
}

function getTrustLevel(score) {
    // A score of 0 means "no rating yet" — treat as New, not Low
    if (!score || score <= 0) return { label: 'New', tone: 'muted', pct: 0 };
    const pct = Math.round((score / 5) * 100);
    if (score >= 4.5) return { label: 'Excellent', tone: 'green', pct };
    if (score >= 4.0) return { label: 'Good', tone: 'blue', pct };
    if (score >= 3.0) return { label: 'Moderate', tone: 'silver', pct };
    return { label: 'Low', tone: 'red', pct };
}

// Generate venue initials for logo placeholder
function getVenueInitials(name) {
    if (!name) return '?';
    return name.split(/[\s\-]+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Get the correct detail URL for a venue or social page
function getVenueUrl(venue) {
    // audit 2026-08-14: home games go through the ONE shared URL builder.
    // This function used to skip the club_code tier that its own container
    // (PodHomeGames) used, so the card body and the card's buttons navigated
    // to DIFFERENT pages for the same slug-less group.
    if (venue.venue_type === 'home_game') {
        return homeGameUrl(venue);
    }
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

// Pre-computed charity event display block
function buildCharityEventBlock(venue) {
    if (venue.venue_type !== 'charity') return null;

    if (venue.is_today) {
        const te = venue.today_event || {};
        const timeStr = formatTime(te.start_time);
        const addr = [te.location || venue.city, te.state || venue.state].filter(Boolean).join(', ');
        return (
            <div className="vc3-charity-event vc3-charity-today">
                <div className="vc3-charity-event-label">
                    Event Today
                </div>
                <div className="vc3-charity-date-big">Today</div>
                {addr ? <div className="vc3-charity-addr">{addr}</div> : null}
                {timeStr || (te.buy_in != null && !isNaN(Number(te.buy_in)) && Number(te.buy_in) > 0) ? (
                    <div className="vc3-charity-meta">
                        {timeStr}
                        {te.buy_in != null && !isNaN(Number(te.buy_in)) && Number(te.buy_in) > 0 ? <><span className="vc3-charity-sep">·</span>${te.buy_in} Buy-In</> : null}
                    </div>
                ) : null}
            </div>
        );
    }

    if (venue.next_event) {
        const ne = venue.next_event;
        const daysAway = ne.days_away;
        let nextDate = null;
        if (daysAway != null) {
            const d = new Date();
            d.setDate(d.getDate() + daysAway);
            nextDate = d;
        }
        const dayLabel = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : '';
        const dateLabel = nextDate
            ? nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : null;
        const isTomorrow = daysAway === 1;
        const timeStr = formatTime(ne.start_time);
        const addr = [ne.location || venue.city, ne.state || venue.state].filter(Boolean).join(', ');
        return (
            <div className="vc3-charity-event">
                <div className="vc3-charity-event-label">
                    {isTomorrow ? 'Tomorrow' : 'Next Event'}
                </div>
                <div className="vc3-charity-date-big">
                    {isTomorrow ? 'Tomorrow' : (dateLabel || dayLabel)}
                </div>
                {addr ? <div className="vc3-charity-addr">{addr}</div> : null}
                {/* Prominent date badge under location */}
                {dateLabel && !isTomorrow ? (
                    <div className="vc3-charity-date-badge">
                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                        {dateLabel}
                    </div>
                ) : null}
                {timeStr || (ne.buy_in != null && !isNaN(Number(ne.buy_in)) && Number(ne.buy_in) > 0) ? (
                    <div className="vc3-charity-meta">
                        {timeStr}
                        {ne.buy_in != null && !isNaN(Number(ne.buy_in)) && Number(ne.buy_in) > 0 ? <><span className="vc3-charity-sep">·</span>${ne.buy_in} Buy-In</> : null}
                    </div>
                ) : null}
            </div>
        );
    }

    return null;
}


export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate, checkinCount, reviewStats, index = 0 }) {
    // === ALL HOOKS MUST BE UNCONDITIONAL — before any early return ===
    // Animated trust bar + staggered card entrance
    const [mounted, setMounted] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [logoFallbackTried, setLogoFallbackTried] = useState(false);
    const [checkinModal, setCheckinModal] = useState(false);
    const [checkinMsg, setCheckinMsg] = useState('');
    const [checkinBusy, setCheckinBusy] = useState(false);
    const [checkinDone, setCheckinDone] = useState(false);
    const [checkinError, setCheckinError] = useState('');
    const cardRef = useRef(null);

    // STUB REMOVED: this effect used to GET /api/social/pages/follow with a bearer token
    // on mount for every home-game card, and an eventBus subscription kept `isFollowing`
    // in sync — but `isFollowing` was never read in the render and `handleFollowClick`
    // was never referenced from any JSX (the Follow button lives on the Details page,
    // see the comment further down). A list of N home games therefore fired N requests
    // whose result could never be displayed. State, handler, fetch and the orphan
    // .vc3-follow-btn CSS are all gone.

    useEffect(() => {
        const delay = Math.min(index * 40, 400);
        const timer = setTimeout(() => setMounted(true), delay);
        return () => clearTimeout(timer);
    }, [index]);

    // The card and its check-in dialog are painted by the shared console layers
    // (poker-near-me-console-cards.css + PokerNearMeConsole). The generic
    // VC3_CARD_STYLES sheet this effect used to inject into <head> is retired.

    // A11Y: the check-in modal had no dialog role, no Escape handler and no focus
    // management, so keyboard and screen-reader users tabbed straight past it.
    const checkinModalRef = useRef(null);
    const checkinOpenerRef = useRef(null);
    // Read inside the keydown listener, which is bound once per open.
    const checkinBusyRef = useRef(false);
    checkinBusyRef.current = checkinBusy;
    // Mobile phase 3: the back gesture closes the check-in sheet; a drag that
    // merely ends on the scrim does not.
    const closeCheckin = useCallback(() => setCheckinModal(false), []);
    useModalHistory(checkinModal, closeCheckin);
    const checkinScrim = useScrimDismiss(closeCheckin);
    useEffect(() => {
        if (!checkinModal) return undefined;
        if (typeof document === 'undefined') return undefined;
        checkinOpenerRef.current = document.activeElement;
        if (checkinModalRef.current) {
            try { checkinModalRef.current.focus(); } catch { /* focus not supported */ }
        }
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                // A post in flight keeps its outcome on screen: Escape waits for it.
                if (!checkinBusyRef.current) setCheckinModal(false);
                return;
            }
            // A11Y FIX: trap Tab inside the panel. The modal is portalled to document.body
            // and appended after the page content, so without this Tab walked straight out
            // of Cancel/Post into the venue grid behind the backdrop.
            if (e.key !== 'Tab') return;
            const root = checkinModalRef.current;
            if (!root) return;
            const focusables = root.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        // The shared registry lock (src/lib/scrollLock.js) instead of a captured
        // body.style.overflow, so a nested dialog or a route change cannot strand
        // the page unscrollable.
        const releaseScrollLock = acquireScrollLock('VenueCardCheckinDialog');
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            releaseScrollLock();
            const opener = checkinOpenerRef.current;
            if (opener && typeof opener.focus === 'function') {
                try { opener.focus(); } catch { /* element gone */ }
            }
        };
    }, [checkinModal]);
    // While a post is in flight its plates and Close are disabled. A disabled
    // control drops focus to <body>, outside the trap; hold it on the dialog.
    useEffect(() => {
        if (!checkinModal || !checkinBusy || typeof document === 'undefined') return;
        const root = checkinModalRef.current;
        const active = document.activeElement;
        if (root && (!active || active.disabled || !root.contains(active))) {
            try { root.focus(); } catch { /* focus not supported */ }
        }
    }, [checkinModal, checkinBusy]);

    // Memoize wait estimate BEFORE the guard (React hooks must be unconditional)
    const hasLiveData = venue && venue.live_data && venue.live_data.tables_running > 0;
    const hasCashGameSignal = Boolean(venue?.live_data && Array.isArray(venue.live_data.games) && venue.live_data.games.length > 0);
    const modeledCashGames = isModeledCashGameData(venue?.live_data);
    const catalogCashGames = venue?.live_data?.data_mode === 'catalog';
    const unavailableCashGames = venue?.live_data?.live_count_known === false && !catalogCashGames;
    const publishedCashGameLabel = cashGameCountLabel(venue?.live_data);
    // Provenance of the published count, in cashGameCountLabel's own precedence.
    // Only an observed live count earns the green signal; modeled, mixed,
    // catalog-only and unavailable counts print in their own honest inks.
    const cashGameMode = catalogCashGames
        ? 'catalog'
        : unavailableCashGames
            ? 'unavailable'
            : modeledCashGames
                ? 'estimated'
                : venue?.live_data?.data_mode === 'mixed'
                    ? 'mixed'
                    : venue?.live_data?.data_mode === 'live' ? 'live' : 'reported';
    // BUG FIX: the meter renders when `hasLiveData || checkinCount > 0`, but the level was
    // only computed when hasLiveData was true — so a venue with no live table data and N
    // users checked in showed a hardcoded "Empty" / 0% bar, discarding the only signal
    // available. getCrowdLevel already null-guards venue.live_data.
    const crowd = (hasLiveData || checkinCount > 0)
        ? getCrowdLevel(venue, checkinCount)
        : { label: 'Empty', score: 0, color: '#64748b' };
    const staleInfo = hasLiveData && venue.live_data.last_updated ? isStaleData(venue.live_data.last_updated) : { stale: false, age: '' };
    // BUG FIX: the wait estimate used to be fabricated — `minW + (hash(venue.id) % range)`
    // with the bracket chosen only by the crowd label. It ignored live_data.players_waiting
    // entirely, so users saw an authoritative-looking "Est. Wait: 27 Min" that had no
    // relationship to the actual waitlist. Derive it from the real waitlist via
    // estimateWaitTime() (already imported) and render nothing when there is no waitlist.
    const playersWaiting = Number(venue?.live_data?.players_waiting) || 0;
    const tablesRunning = Number(venue?.live_data?.tables_running) || 0;
    const waitEstimate = useMemo(() => {
        if (!hasLiveData || staleInfo.stale) return null;
        if (playersWaiting <= 0) return null;
        const est = estimateWaitTime(playersWaiting, tablesRunning || 1);
        if (!est || !est.minutes) return null;
        return est;
    }, [hasLiveData, staleInfo.stale, playersWaiting, tablesRunning]);

    // Guard — AFTER all hooks
    if (!venue) return null;

    const trust = getTrustLevel(venue.trust_score || 0);
    const detailUrl = getVenueUrl(venue);
    const typeTone = VENUE_TYPE_TONES[venue.venue_type] || 'silver';
    const openStatus = getOpenStatus(venue);
    const logoUrl = getVenueLogoUrl(venue);

    const handleCheckinOpen = (e) => {
        e.stopPropagation();
        if (!requireOnlineNow(toast)) return;
        triggerHaptic('light');
        setCheckinError('');
        const defaultMsg = `Checked in at ${venue.name}${venue.city ? ` in ${venue.city}` : ''}`;
        setCheckinMsg(defaultMsg);
        setCheckinDone(false);
        setCheckinModal(true);
    };

    const handleCheckinSubmit = async () => {
        if (checkinBusy || !checkinMsg.trim()) return;
        if (!requireOnlineNow(toast)) return;
        triggerHaptic('success');
        setCheckinBusy(true);
        setCheckinError('');
        try {
            const token = getAccessToken();
            if (!token) { if (onNavigate) onNavigate('/auth/login'); return; }

            // GAP FIX: this used to POST ONLY to /api/social/create-post, which writes a
            // social post and nothing else. It never touched `venue_checkins` — the table
            // that backs the "{n} Here Today" badge, the crowd meter, /checkins/streak,
            // /checkins/whos-here and SocialLayer's friends feed. Users tapped Check In,
            // saw "Checked in!", and nothing anywhere changed.
            //
            // POST /api/poker/checkins inserts the check-in AND auto-creates the social
            // post itself, so calling it is sufficient — no double post.
            // It requires venue_id to be a positive integer (poker_venues.id is a bigint),
            // so non-venue cards (home games / charity / social pages carry string ids)
            // keep the social-post-only path rather than sending a request that 400s.
            // /api/poker/checkins requires user_name (it is rendered in the check-in feed).
            const authUser = getAuthUser();
            const userDisplayName =
                authUser?.user_metadata?.display_name
                || authUser?.user_metadata?.full_name
                || authUser?.user_metadata?.username
                || (authUser?.email ? String(authUser.email).split('@')[0] : null)
                || 'Player';

            const venueIdInt = parseInt(venue.id, 10);
            const isRealVenueId = !isNaN(venueIdInt) && venueIdInt > 0 && String(venueIdInt) === String(venue.id).trim();

            const res = isRealVenueId
                ? await fetch('/api/poker/checkins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        venue_id: venueIdInt,
                        user_name: userDisplayName,
                        message: checkinMsg.trim(),
                    }),
                })
                : await fetch('/api/social/create-post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        content: checkinMsg.trim(),
                        content_type: 'text',
                        visibility: 'public',
                        metadata: {
                            post_type: 'checkin',
                            venue_id: venue.id,
                            venue_name: venue.name,
                            venue_type: venue.venue_type,
                        },
                    }),
                });

            // Surface the route's own 429 ("already checked in within the last 4 hours")
            // instead of a bare status code.
            if (res.status === 429) {
                let msg = 'You already checked in here within the last 4 hours.';
                try {
                    const body = await res.json();
                    if (body?.error) msg = String(body.error);
                } catch (parseErr) { /* non-JSON error body */ }
                setCheckinError(msg);
                return;
            }
            // BUG FIX: the response was never inspected, so a 401/404/500 still showed
            // "Checked in!" and closed the modal — the check-in was silently dropped.
            if (!res.ok) {
                let msg = `Check-in failed (${res.status})`;
                try {
                    const body = await res.json();
                    if (body?.error) msg = String(body.error);
                } catch (parseErr) { /* non-JSON error body */ }
                setCheckinError(msg);
                return;
            }
            setCheckinDone(true);
            setTimeout(() => setCheckinModal(false), 1500);
        } catch (err) {
            console.warn('Checkin error:', err);
            setCheckinError('Could not reach the server. Please try again.');
        }
        finally { setCheckinBusy(false); }
    };

    return (
        <PokerNearMePanelShell
            surfaceRef={cardRef}
            className="pnm-console-card pnm-console-card--venue"
            bodyClassName="pnm-console-card__body"
            onClick={() => onNavigate && onNavigate(detailUrl)}
            style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(12px)',
                transition: `opacity 0.35s ease ${Math.min(index * 0.04, 0.4)}s, transform 0.35s ease ${Math.min(index * 0.04, 0.4)}s`,
                cursor: 'pointer',
            }}
        >

            {/* === HEADER ZONE === */}
            <div className="vc3-header">
                {/* Left: Logo + Name */}
                <div className="vc3-header-left">
                    {/* Venue Logo — 1.5x size */}
                    <div className="vc3-logo" data-media-state={logoUrl && !logoError ? 'image' : 'fallback'}>
                        {logoUrl && !logoError ? (
                            <img
                                src={logoUrl}
                                alt=""
                                className="vc3-logo-img"
                                onError={(e) => {
                                    if (!logoFallbackTried) {
                                        const fallback = getVenueLogoFallback(venue);
                                        if (fallback) {
                                            setLogoFallbackTried(true);
                                            e.target.src = fallback;
                                            return;
                                        }
                                    }
                                    setLogoError(true);
                                }}
                                loading="lazy"
                            />
                        ) : (
                            <span className="vc3-logo-initials">{getVenueInitials(venue.name)}</span>
                        )}
                    </div>
                    {/* Name + Type — stacked beside logo */}
                    <div className="vc3-identity">
                        <h4 className="vc3-name">{venue.name || 'Unknown Venue'}</h4>
                        {/* City/State row — for charity venues, show EVENT location, not home location */}
                        {(() => {
                            const isCharity = venue.venue_type === 'charity';
                            // Resolve event location for charities
                            let displayCity = venue.city || '';
                            let displayState = venue.state || '';
                            let mapsAddress = [venue.address, venue.city, venue.state].filter(Boolean).join(', ');

                            if (isCharity && venue.is_today && venue.today_event) {
                                const te = venue.today_event;
                                // today_event.location could be "City, State" or just "City"
                                const locParts = (te.location || '').split(',').map(s => s.trim());
                                displayCity = locParts[0] || venue.city || '';
                                displayState = te.state || locParts[1] || venue.state || '';
                                mapsAddress = [te.location, te.state].filter(Boolean).join(', ');
                            } else if (isCharity && !venue.is_today && venue.next_event) {
                                const ne = venue.next_event;
                                const locParts = (ne.location || '').split(',').map(s => s.trim());
                                displayCity = locParts[0] || venue.city || '';
                                displayState = ne.state || locParts[1] || venue.state || '';
                                mapsAddress = [ne.location, ne.state].filter(Boolean).join(', ');
                            }

                            return (
                                <div className="vc3-city-type-row">
                                    <a
                                        href="#"
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openNativeMaps({ address: mapsAddress, mode: 'search' });
                                        }}
                                        className="vc3-city-state"
                                        title="Open In Maps"
                                    >
                                        <PokerNearMeConsoleIcon name="location" className="pnm-console-card__meta-icon" />
                                        <span>{displayCity}{displayCity && displayState ? ', ' : ''}{displayState}</span>
                                    </a>
                                    <span className="vc3-type-label" data-tone={typeTone}>
                                        {VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}
                                    </span>
                                </div>
                            );
                        })()}
                        {/* Bold NEXT EVENT line for charity venues below city/state */}
                        {venue.venue_type === 'charity' && !venue.is_today && venue.next_event && (() => {
                            const ne = venue.next_event;
                            const daysAway = ne.days_away;
                            let dateStr = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : 'Upcoming';
                            if (daysAway === 1) {
                                dateStr = 'Tomorrow';
                            } else if (daysAway != null) {
                                const d = new Date();
                                d.setDate(d.getDate() + daysAway);
                                dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            }
                            return (
                                <div className="vc3-next-event-header">
                                    <span className="vc3-next-event-label">Next Event: {dateStr}</span>
                                </div>
                            );
                        })()}
                        {/* Bold TODAY label for charity venues running today */}
                        {venue.venue_type === 'charity' && venue.is_today && (
                            <div className="vc3-next-event-header vc3-next-event-today">
                                <span className="vc3-next-event-label">Event Today</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Save control: the painted saved-icon holder is the whole button. */}
                <button
                    type="button"
                    className={'vc3-fav' + (isFavorited ? ' active' : '')}
                    onClick={(e) => { e.stopPropagation(); triggerHaptic('light'); onFavorite && onFavorite(e); }}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    aria-label={isFavorited ? `Remove ${venue.name || 'venue'} from saved venues` : `Save ${venue.name || 'venue'}`}
                    aria-pressed={!!isFavorited}
                >
                    <PokerNearMeConsoleIcon name="saved" />
                </button>
            </div>

            {/* Status line: distance, open/closed and posted hours print on the glass
                under the identity, so they can never squeeze the venue name. */}
            <div className="pnm-console-card__status-line">
                {/* Distance */}
                {venue.distance_mi != null && (
                    <span className="vc3-distance">
                        <PokerNearMeConsoleIcon name="directions" className="pnm-console-card__meta-icon" />
                        {typeof venue.distance_mi === 'number' ? venue.distance_mi.toFixed(1) : venue.distance_mi} Mi
                    </span>
                )}
                {/* GAP FIX: getOpenStatus(venue) was computed on every render but its
                    result only ever reached the left column's empty state, so the
                    timezone-aware Open/Closed badge the .vc3-open-pill / .vc3-open-dot /
                    .vc3-hours-next rules were written for never rendered — the card
                    advertised "Real-time Open/Closed status" and showed a raw hours
                    string instead. Rendered here, and suppressed entirely when the
                    status is null or `unknown` (the deliberate NULL-timezone case). */}
                {openStatus && !openStatus.unknown && openStatus.label && (
                    <span className={'vc3-open-pill' + (openStatus.open ? '' : ' closed')}>
                        <span className={'vc3-open-dot' + (openStatus.open ? '' : ' closed')} />
                        {openStatus.label}
                    </span>
                )}
                {openStatus && !openStatus.unknown && openStatus.nextChange && (
                    <span className="vc3-hours-next">{openStatus.nextChange}</span>
                )}
                {/* Hours below */}
                {(() => {
                    const is247 = (venue.hours === '24/7' || venue.hours_weekday === '24/7');
                    const isCharityOrHome = ['charity', 'home_game'].includes(venue.venue_type);
                    const effective247 = is247 && !isCharityOrHome;

                    if (effective247 || !(venue.hours || venue.hours_weekday || venue.hours_weekend)) return null;

                    // BUG FIX: this always printed hours_weekday || hours, so the posted
                    // weekend string was never shown — not even on Saturday or Sunday.
                    // Pick from the same zoned day getOpenStatus resolves; fall back to
                    // the previous order when the venue timezone is unknown.
                    const zonedNow = getZonedNow(resolveVenueTimeZone(venue));
                    const isWeekend = zonedNow ? (zonedNow.dayOfWeek === 0 || zonedNow.dayOfWeek === 6) : false;
                    const hoursText = isWeekend
                        ? (venue.hours_weekend || venue.hours_weekday || venue.hours)
                        : (venue.hours_weekday || venue.hours || venue.hours_weekend);
                    if (!hoursText) return null;

                    return (
                        <span className="vc3-hours-compact">
                            {hoursText}
                        </span>
                    );
                })()}
            </div>

            {/* Address removed from here, now in header */}

            {/* Home Game Host Info — Avatar + Name + Profile Link */}
            {venue.venue_type === 'home_game' && venue.host_display_name && (
                <div className="vc3-host">
                    {venue.host_avatar_url ? (
                        <img src={venue.host_avatar_url} alt="" className="vc3-host-avatar" loading="lazy" />
                    ) : (
                        <div className="vc3-host-avatar vc3-host-avatar-fallback">
                            <PokerNearMeConsoleIcon name="home" className="pnm-console-card__avatar-icon" />
                        </div>
                    )}
                    <div className="vc3-host-info">
                        <span className="vc3-host-name">Hosted By {venue.host_display_name}</span>
                        {venue.host_username && (
                            <a href={'/hub/user/' + encodeURIComponent(venue.host_username)} onClick={e => e.stopPropagation()} className="vc3-host-profile-link">@{venue.host_username}</a>
                        )}
                    </div>
                    {venue.host_social_page_slug && (
                        <a href={venue.social_page_id ? '/club/' + venue.social_page_id : getVenueUrl(venue)} onClick={e => e.stopPropagation()} className="vc3-host-link">View Page</a>
                    )}
                </div>
            )}
            {/* Home Game Schedule */}
            {venue.venue_type === 'home_game' && venue.schedule && (
                <div className="vc3-schedule">
                    <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                    <span>{venue.schedule}</span>
                </div>
            )}
            {/* Home Game — Saves count only (Follow button is on the Details page) */}
            {venue.venue_type === 'home_game' && venue.saves_count > 0 && (
                <div className="vc3-follow-row">
                    <span className="vc3-saves-count">
                        <PokerNearMeConsoleIcon name="saved" className="pnm-console-card__meta-icon" />
                        {venue.saves_count} Saved
                    </span>
                </div>
            )}

            {/* === REVIEW RATING === */}
            {reviewStats && reviewStats.total_reviews > 0 && (
                <button type="button" className="vc3-rating-row pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }}>
                    <span className="vc3-rating-score">{(Number(reviewStats.avg_rating) || 0).toFixed(1)}</span>
                    <span className="vc3-rating-count">{`(${reviewStats.total_reviews} Review${reviewStats.total_reviews !== 1 ? 's' : ''})`}</span>
                </button>
            )}

            {/* === QUICK TAGS (auto-generated intelligence) === */}
            <div className="vc3-badges">
                {venue.is_featured && <span className="pnm-console-card__tag" data-tone="gold">Featured</span>}
                {hasPromo && <span className="pnm-console-card__tag" data-tone="blue">Active Promo</span>}
                {isNewcomer && <span className="pnm-console-card__tag" data-tone="blue">New Addition</span>}
                {venue.max_gtd > 0 && (
                    <span className="pnm-console-card__tag" data-tone="silver">
                        {formatMoney(venue.max_gtd)}+ GTD
                    </span>
                )}

                {/* SCHEMA FIX: `total_tables` is not a poker_venues column (it is `poker_tables`),
                    so this badge could never render. */}
                {(venue.poker_tables ?? venue.total_tables) > 20 && <span className="pnm-console-card__tag">Large Room</span>}
                {checkinCount > 0 && (
                    <button type="button" className="pnm-console-card__text-action vc3-checkin-count" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '#checkins'); }}>
                        {checkinCount} Here Today
                    </button>
                )}
            </div>

            {/* Published cash-game count with its provenance (Live Now / Approx. /
                Live + Estimated / Games Listed, Live Count Unknown) as live text. */}
            {hasCashGameSignal && publishedCashGameLabel && (
                <div className="pnm-console-card__provenance" data-mode={cashGameMode}>
                    {cashGameMode === 'live' && <span className="pnm-console-card__signal" aria-hidden="true" />}
                    <span>{publishedCashGameLabel}</span>
                </div>
            )}

            {/* Best Time To Go data lives on the venue detail page only */}

            {/* === CROWD METER === */}
            {(hasLiveData || checkinCount > 0) && (
                <div className="vc3-crowd-meter">
                    <div className="vc3-crowd-header">
                        <span className="vc3-crowd-label">{modeledCashGames && hasLiveData ? `Estimated: ${crowd.label}` : crowd.label}</span>
                        {waitEstimate && (
                            <span className="vc3-wait-estimate">
                                Est. Wait: {waitEstimate.label}
                            </span>
                        )}
                    </div>
                    <div className="vc3-crowd-track">
                        <div className="vc3-crowd-fill" style={{
                            width: mounted ? `${crowd.score}%` : '0%',
                        }} />
                    </div>
                </div>
            )}

            {/* === DATA ZONE === */}
            <div className="vc3-data-zone">
                {/* --- TWO COLUMN LAYOUT --- */}
                <div className="vc3-columns-grid">
                    {/* LEFT COLUMN: Cash Games */}
                    <div className="vc3-col vc3-col-left">
                        {hasCashGameSignal ? (
                            <>
                                <div className="vc3-col-title">
                                    {/* The published count and its provenance print once, in the
                                        summary line above the data zone. */}
                                    <span>{catalogCashGames ? 'Catalog Cash Games' : modeledCashGames ? 'Estimated Cash Games' : 'Cash Games'}</span>
                                </div>
                                {Array.isArray(venue.live_data.games) && venue.live_data.games.length > 0 ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-games" role="region" aria-label={`Cash games at ${venue.name || 'this venue'}`} tabIndex={0}>
                                        {venue.live_data.games.map((g, idx) => {
                                            const gameName = g?.game || 'Unknown Game';
                                            const buyin = g?.buyin ? ` · ${g.buyin}` : '';
                                            const displayName = `${gameName}${buyin}`;
                                            const rowCountUnknown = g?.observation_kind === 'catalog' || g?.live_count_known === false;
                                            // A catalog-only room already says "Live Count Unknown" once, in
                                            // the summary line; the rows do not repeat it. A mixed room keeps
                                            // the per-row provenance, where rows really differ.
                                            const repeatsSummary = rowCountUnknown && (cashGameMode === 'catalog' || cashGameMode === 'unavailable');
                                            return (
                                                <div key={`live-game-${gameName.replace(/\\s+/g,'-')}-${buyin.replace(/\\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-game-item">
                                                    <span className="vc3-game-name" title={displayName}>{displayName}</span>
                                                    {!repeatsSummary && (
                                                        <span className="vc3-game-tables" data-mode={rowCountUnknown ? 'catalog' : g?.is_simulated ? 'estimated' : 'reported'}>
                                                            {rowCountUnknown
                                                                ? 'Live Count Unknown'
                                                                : <>{g?.is_simulated ? 'Approx. ' : ''}{Number(g?.tables_running) || 0} {Number(g?.tables_running) === 1 ? 'Table' : 'Tables'}</>}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="vc3-live-info-wrapper">
                                        <div className="vc3-live-info">
                                            <div className="vc3-live-stat">
                                                <span className="vc3-live-stat-val">{venue.live_data.tables_running}</span>
                                                <span className="vc3-live-stat-label">Tables</span>
                                            </div>
                                            {venue.live_data.players_waiting > 0 && (
                                                <div className="vc3-live-stat">
                                                    <span className="vc3-live-stat-val">{venue.live_data.players_waiting}</span>
                                                    <span className="vc3-live-stat-label">Wait</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {venue.live_data.last_updated && (
                                    <div className="pnm-console-card__freshness" data-stale={staleInfo.stale ? 'true' : 'false'}>
                                        {catalogCashGames
                                            ? `Catalog Updated ${staleInfo.age || 'Recently'}`
                                            : modeledCashGames
                                                ? `Modeled From Saved Cash-Game Data${staleInfo.age ? ` · ${staleInfo.age}` : ''}`
                                                : (staleInfo.stale ? 'Stale Data' : `Updated ${staleInfo.age}`)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {Array.isArray(venue.stakes_cash) && venue.stakes_cash.length > 0 && !['tour_stop', 'poker_tour', 'tour', 'series'].includes(venue.venue_type) ? (
                                    <>
                                        <div className="vc3-col-title">Stakes Played</div>
                                        <div className="vc3-stakes-list">
                                            {venue.stakes_cash.slice(0, 5).map((stake, idx) => (
                                                <div key={`stake-${String(stake).replace(/\\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-stake-item">
                                                    {stake}
                                                </div>
                                            ))}
                                            {venue.stakes_cash.length > 5 && <div className="vc3-list-item vc3-stake-item">Etc...</div>}
                                        </div>
                                    </>
                                ) : (
                                    <div className="vc3-empty-state">
                                        {(() => {
                                            const os = openStatus;
                                            // Unknown venue timezone (or unparseable hours) means we
                                            // cannot tell whether the room is open. Show no open/closed
                                            // claim at all rather than defaulting to one — a wrong badge
                                            // is worse than no badge.
                                            if (!os || os.unknown) return 'No Live Data';
                                            // A known open/closed state already prints on the status
                                            // line under the name; this column speaks for cash games.
                                            return 'No Cash Games Listed';
                                        })()}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="vc3-col-footer">
                            {/* Game Tags with stakes range — only shown when no live data */}
                            {!hasLiveData && Array.isArray(venue.games_offered) && venue.games_offered.length > 0 && (
                                <div className="vc3-games">
                                    {venue.games_offered.slice(0, 4).map((g, idx) => {
                                        // Find matching stakes for this game type
                                        const gLower = (g || '').toLowerCase();
                                        const matchedStakes = Array.isArray(venue.stakes_cash) ? venue.stakes_cash.filter(s => {
                                            const sLower = (s || '').toLowerCase();
                                            if (gLower.includes('nlh') || gLower.includes('hold')) return sLower.includes('nlh') || sLower.includes('hold') || sLower.includes('nl ');
                                            if (gLower.includes('plo') || gLower.includes('omaha')) return sLower.includes('plo') || sLower.includes('omaha');
                                            return false;
                                        }) : [];
                                        const stakeSuffix = matchedStakes.length > 0 ? ` (${matchedStakes.length})` : '';
                                        return (
                                            <span key={g || idx} className="vc3-game-chip" data-tone={getGameTone(g)}>
                                                {g}{stakeSuffix}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}


                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tournaments — dynamic title */}
                    {(() => {
                        // Determine column title dynamically
                        const charityToday = venue.venue_type === 'charity' && venue.is_today && venue.today_event;
                        const charityUpcoming = venue.venue_type === 'charity' && !venue.is_today && venue.next_event;
                        // WIRING FIX: the list branch of /api/poker/venues returns a FLAT array of
                        // tournament rows, but the single-venue branch (?id=<id>, used by the Saved
                        // tab to hydrate a venue that is not in the loaded list) returns one wrapper
                        // object `[{ source_url, schedules: [...] }]`. Rendering that wrapper as a row
                        // produced a single blank "Tournament / Time TBD" entry and hid the whole
                        // schedule. Unwrap it here so both API shapes render identically.
                        const rawDaily = Array.isArray(venue.daily_tournaments) ? venue.daily_tournaments : [];
                        const dailyTournaments = (rawDaily.length && rawDaily[0] && Array.isArray(rawDaily[0].schedules))
                            ? rawDaily.flatMap(w => (Array.isArray(w?.schedules) ? w.schedules : []))
                            : rawDaily;
                        const hasRegularToday = !!venue.has_tournaments && dailyTournaments.length > 0;
                        // For home games: check if any of the daily_tournaments are today vs upcoming
                        const homeGameTodayGames = venue.venue_type === 'home_game' && hasRegularToday
                            ? dailyTournaments.filter(t => t._is_today)
                            : [];
                        const homeGameUpcomingGames = venue.venue_type === 'home_game' && hasRegularToday
                            ? dailyTournaments.filter(t => !t._is_today)
                            : [];
                        // BUG FIX: the "+N More Today" badge counted the UNFILTERED array while the
                        // list rendered only non-suppressed rows, so it advertised tournaments that
                        // had just been filtered out (and could appear with nothing left to show).
                        const visibleTourneys = dailyTournaments.filter(t => !t?.is_suppressed);
                        
                        let colTitle = 'Today\'s Tournaments';
                        if (venue.venue_type === 'home_game') {
                            if (homeGameTodayGames.length > 0) colTitle = 'Today\'s Tournament';
                            else if (homeGameUpcomingGames.length > 0 || hasRegularToday) colTitle = 'Upcoming Tournaments';
                            else colTitle = 'Upcoming Tournaments';
                        } else if (charityToday || hasRegularToday) {
                            colTitle = 'Today\'s Tournaments';
                        } else if (charityUpcoming || (venue.has_tournaments && !hasRegularToday)) {
                            colTitle = 'Upcoming Tournaments';
                        }

                        return (
                            <div className="vc3-col vc3-col-right">
                                <div className="vc3-col-title">{colTitle}</div>

                                {charityToday ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {/* Show today tournaments: cap at 2, show +N More badge if there are more */}
                                        {(() => {
                                            const allToday = (Array.isArray(venue.today_tournaments) && venue.today_tournaments.length > 1
                                                ? venue.today_tournaments
                                                : [venue.today_event]).filter(evt => evt && !evt.is_suppressed);
                                            const shown = allToday.slice(0, 2);
                                            const extraCount = allToday.length - shown.length;
                                            return (
                                                <>
                                                    {shown.map((evt, tIdx) => (
                                                        <div key={`today-tourney-${evt.id || evt.tournament_name || 'base'}-${tIdx}`} className="vc3-list-item vc3-tourney-item">
                                                            <div className="vc3-tourney-name">{evt.tournament_name || (evt.buy_in != null && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Poker Tournament` : 'Charity Poker Event')}</div>
                                                            <div className="vc3-tourney-details">
                                                                <span className="vc3-tourney-time">{formatTime(evt.start_time) || 'Time TBD'}</span>
                                                                <span className="vc3-tourney-buyin">{evt.buy_in != null && !isNaN(Number(evt.buy_in)) && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Buy-In` : 'Buy-In TBD'}</span>
                                                            </div>
                                                            {evt.starting_stack != null && String(evt.starting_stack) !== '0' && String(evt.starting_stack) !== 'N/A' && (
                                                                <div className="vc3-tourney-stack">{evt.starting_stack} Starting Stack</div>
                                                            )}
                                                            {tIdx === 0 && (
                                                                <div className="vc3-tourney-date">
                                                                    <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                                                                    <span className="pnm-console-card__when" data-tone="green">Today</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {extraCount > 0 && (
                                                        <button type="button" className="vc3-more-badge pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{extraCount} More Today
                                                        </button>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : charityUpcoming ? (
                                    /* Charity with upcoming (not today) event — cap at 2, show +N More badge */
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {(() => {
                                            const allNext = Array.isArray(venue.next_tournaments) && venue.next_tournaments.length > 1
                                                ? venue.next_tournaments
                                                : [venue.next_event];
                                            const shown = allNext.slice(0, 2);
                                            const extraCount = allNext.length - shown.length;
                                            return (
                                                <>
                                                    {shown.map((evt, tIdx) => (
                                                        <div key={`upcoming-tourney-${evt.id || evt.tournament_name || 'base'}-${tIdx}`} className="vc3-list-item vc3-tourney-item vc3-tourney-item-upcoming">
                                                            <div className="vc3-tourney-name">{evt.tournament_name || (evt.buy_in != null && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Poker Tournament` : 'Charity Poker Event')}</div>
                                                            <div className="vc3-tourney-details">
                                                                <span className="vc3-tourney-time">{formatTime(evt.start_time) || 'Time TBD'}</span>
                                                                <span className="vc3-tourney-buyin">{evt.buy_in != null && !isNaN(Number(evt.buy_in)) && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Buy-In` : 'Buy-In TBD'}</span>
                                                            </div>
                                                            {evt.starting_stack != null && String(evt.starting_stack) !== '0' && String(evt.starting_stack) !== 'N/A' && (
                                                                <div className="vc3-tourney-stack">{evt.starting_stack} Starting Stack</div>
                                                            )}
                                                            {/* Date badge only on first item */}
                                                            {tIdx === 0 && (() => {
                                                                const ne = venue.next_event;
                                                                const daysAway = ne.days_away;
                                                                let dateStr = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : 'Upcoming';
                                                                if (daysAway != null) {
                                                                    const d = new Date();
                                                                    d.setDate(d.getDate() + daysAway);
                                                                    dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                                                }
                                                                return (
                                                                    <div className="vc3-tourney-date">
                                                                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                                                                        <span className="pnm-console-card__when" data-tone="blue">Next Event: {dateStr}</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ))}
                                                    {extraCount > 0 && (
                                                        <button type="button" className="vc3-more-badge pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{extraCount} More
                                                        </button>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : hasRegularToday ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {visibleTourneys.slice(0, 3).map((t, idx) => {
                                            const tName = t?.tournament_name || t?.name || 'Tournament';
                                            // Build date label for home game entries with _days_away
                                            let daysBadgeLabel = null;
                                            if (venue.venue_type === 'home_game' && t._days_away != null) {
                                                if (t._is_today) daysBadgeLabel = 'Today';
                                                else if (t._days_away === 1) daysBadgeLabel = 'Tomorrow';
                                                else {
                                                    const d = new Date();
                                                    d.setDate(d.getDate() + t._days_away);
                                                    daysBadgeLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                                }
                                            }
                                            const daysBadgeTone = t._is_today ? 'green' : 'blue';
                                            return (
                                                <div key={`daily-tourney-${t?.id || tName.replace(/\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-tourney-item">
                                                    <div className="vc3-tourney-name" title={tName}>{tName}</div>
                                                    <div className="vc3-tourney-details">
                                                         <span className="vc3-tourney-time-buyin">
                                                             {formatTime(t?.start_time) || 'Time TBD'}
                                                             {t?.buy_in != null && Number(t.buy_in) > 0 ? ` · $${t.buy_in} Buy-In` : ''}
                                                         </span>
                                                         {t?.guaranteed != null && Number(t.guaranteed) > 0 ? <span className="vc3-tourney-gtd">{formatMoney(t.guaranteed)} GTD</span> : null}
                                                     </div>
                                                    {t?.starting_stack != null && String(t.starting_stack) !== '0' && String(t.starting_stack) !== 'N/A' && (
                                                        <div className="vc3-tourney-stack">{t.starting_stack} Starting Stack</div>
                                                    )}
                                                    {t?.blind_levels != null && String(t.blind_levels).trim() && String(t.blind_levels) !== 'N/A' && (
                                                        <div className="vc3-tourney-blinds">{t.blind_levels} Levels</div>
                                                    )}
                                                    {daysBadgeLabel && (
                                                        <div className="vc3-tourney-date">
                                                            <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                                                            <span className="pnm-console-card__when" data-tone={daysBadgeTone}>{daysBadgeLabel}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {visibleTourneys.length > 3 && (
                                            <button type="button" className="vc3-more-badge pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                +{visibleTourneys.length - 3} More Today
                                            </button>
                                        )}
                                    </div>
                                ) : venue.next_tournament_preview ? (
                                    /* No tournaments today — show preview of next scheduled day */
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {(() => {
                                            const ntp = venue.next_tournament_preview;
                                            const daysAway = ntp.days_away;
                                            let dayLabel = ntp.day || 'Upcoming';
                                            if (daysAway === 1) dayLabel = 'Tomorrow';
                                            else if (daysAway != null && daysAway > 1) {
                                                const d = new Date();
                                                d.setDate(d.getDate() + daysAway);
                                                dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                            }
                                            const buyInStr = ntp.buy_in != null && Number(ntp.buy_in) > 0
                                                ? `$${ntp.buy_in} Buy-In`
                                                : 'Buy-In TBD';
                                            const tName = ntp.tournament_name || (ntp.buy_in > 0 ? `$${ntp.buy_in} NLH` : 'Tournament');
                                            return (
                                                <div className="vc3-list-item vc3-tourney-item vc3-tourney-item-upcoming">
                                                    <div className="vc3-tourney-name" title={tName}>{tName}</div>
                                                    <div className="vc3-tourney-details">
                                                        <span className="vc3-tourney-time">{formatTime(ntp.start_time) || 'Time TBD'}</span>
                                                        <span className="vc3-tourney-buyin">{buyInStr}</span>
                                                        {ntp.guaranteed > 0 ? <span className="vc3-tourney-gtd">{formatMoney(ntp.guaranteed)} GTD</span> : null}
                                                    </div>
                                                    <div className="vc3-tourney-date">
                                                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                                                        <span className="pnm-console-card__when" data-tone="blue">Next: {dayLabel}</span>
                                                    </div>
                                                    {ntp.total_that_day > 1 && (
                                                        <button type="button" className="vc3-more-badge pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{ntp.total_that_day - 1} More That Day
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="vc3-empty-state">
                                        {venue.venue_type === 'home_game'
                                            ? 'No Games Scheduled'
                                            : (colTitle === 'Upcoming Tournaments' ? 'See Schedule For Details' : 'No Tournaments Today')}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* === LOCKED FOOTER === */}
            <div className="pnm-console-card__foot-zone">
                {/* === ACTION BAR ===
                    Painted icon holders (website / call / directions), one lit
                    secondary action on the glass, and exactly two painted plates. */}
                <div className="vc3-actions">
                <div className="vc3-actions-secondary">
                    {venue.website && (
                        <a href={venue.website.toLowerCase().startsWith('http') ? safeHref(venue.website) : safeHref('https://' + venue.website)}
                            target="_blank" rel="noopener noreferrer" className="vc3-icon-btn" onClick={e => e.stopPropagation()} title="Website" aria-label={`Open ${venue.name || 'venue'} website`}>
                            <PokerNearMeConsoleIcon name="globe" />
                        </a>
                    )}
                    {venue.phone && (
                        <a href={'tel:' + venue.phone} className="vc3-icon-btn" onClick={e => e.stopPropagation()} title="Call" aria-label={`Call ${venue.name || 'venue'}`}>
                            <PokerNearMeConsoleIcon name="phone" />
                        </a>
                    )}
                    <button type="button" className="vc3-icon-btn" aria-label={`Get directions to ${venue.name || 'venue'}`} onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            openNativeMaps({ address: [venue.address, venue.name, venue.city, venue.state].filter(Boolean).join(' '), lat: parseFloat(venue.latitude), lng: parseFloat(venue.longitude), mode: 'directions' });
                        }} title="Directions">
                        <PokerNearMeConsoleIcon name="directions" />
                    </button>
                </div>

                {/* Message Host button for home games replaces Review */}
                {venue.venue_type === 'home_game' && venue.host_id ? (
                    <button type="button" className="vc3-pill-message pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate('/hub/messenger?to=' + venue.host_id + '&game=' + venue.id + '&gameName=' + encodeURIComponent(venue.name || '')); }} title="Message Host">
                        Message Host
                    </button>
                ) : (
                    venue.has_tournaments ? (
                        <button type="button" className="vc3-pill-schedule pnm-console-card__text-action" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }} title="Tournament Schedule">
                            Tournament Schedule
                        </button>
                    ) : null
                )}

                {/* Primary actions: two plates, steel then blue glass */}
                <div className="vc3-actions-primary">
                    <button type="button" className="pnm-card-plate pnm-card-plate--secondary pnm-console-card__checkin-plate" onClick={handleCheckinOpen} title="Check In">
                        <PnmPlateLabel label="Check In" />
                    </button>
                    <button type="button" className="pnm-card-plate pnm-card-plate--primary pnm-console-card__details-plate" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }} title="Details">
                        <PnmPlateLabel label="Details" />
                    </button>
                </div>
            </div>

            {/* === TRUST SCORE / PLAYER RATING — not shown for tour cards === */}
            {!['tour_stop', 'poker_tour', 'tour', 'series'].includes(venue.venue_type) && (
            <div className="vc3-trust" data-tone={reviewStats && reviewStats.total_reviews > 0 ? (reviewStats.avg_rating >= 4 ? 'green' : reviewStats.avg_rating >= 3 ? 'silver' : 'muted') : trust.tone}>
                {reviewStats && reviewStats.total_reviews > 0 ? (
                    <>
                        <div className="vc3-trust-header">
                            <span className="vc3-trust-label">Player Rating</span>
                            <span className="vc3-trust-val">
                                {(Number(reviewStats.avg_rating) || 0).toFixed(1)}/5 ({reviewStats.total_reviews})
                            </span>
                        </div>
                        <div className="vc3-trust-track">
                            <div className="vc3-trust-fill" style={{
                                width: mounted ? Math.round((Number(reviewStats.avg_rating) / 5) * 100) + '%' : '0%',
                            }} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="vc3-trust-header">
                            <span className="vc3-trust-label">Trust: {trust.label}</span>
                            <span className="vc3-trust-val">{(venue.trust_score && venue.trust_score > 0) ? venue.trust_score + '/5' : '-'}</span>
                        </div>
                        <div className="vc3-trust-track">
                            <div className="vc3-trust-fill" style={{
                                width: mounted ? trust.pct + '%' : '0%',
                            }} />
                        </div>
                    </>
                )}
            </div>
            )}
            </div>

            {/* === CHECK-IN MODAL ===
                BUG FIX: this used to render inside the card, whose root always carries an
                inline `transform`. Any transform other than `none` makes the element a
                containing block for position:fixed descendants, so the old backdrop
                (position: fixed; inset: 0) covered only the CARD — on a grid of venue cards
                the modal appeared as a tiny clipped overlay with the 420px-wide panel
                overflowing it. Portalled to document.body so it escapes the transform. */}
            {checkinModal && typeof document !== 'undefined' && createPortal((
                <div
                    className="pnm-console-dialog-overlay pnm-checkin-dialog-overlay"
                    role="presentation"
                    onPointerDown={checkinScrim.onPointerDown}
                    onClick={(e) => {
                        // React bubbles portal events through the card's own onClick;
                        // a scrim tap closes the dialog and must not also open the venue.
                        e.stopPropagation();
                        if (!checkinBusy) checkinScrim.onClick(e);
                    }}
                    style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
                >
                    <section
                        ref={checkinModalRef}
                        className="pnm-console-dialog-shell pnm-checkin-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="pnm-venue-checkin-title"
                        aria-describedby="pnm-venue-checkin-description"
                        aria-busy={checkinBusy}
                        tabIndex={-1}
                        onClick={e => e.stopPropagation()}
                    >
                        <PokerNearMeConsole
                            as="div"
                            className="pnm-console-dialog"
                            crest="locator"
                            eyebrow="Venue Check-In"
                            title="Check In"
                            titleId="pnm-venue-checkin-title"
                            foot={checkinDone ? 'foot' : 'plates'}
                            plates={checkinDone ? undefined : {
                                secondary: {
                                    label: 'Cancel',
                                    onClick: closeCheckin,
                                    disabled: checkinBusy,
                                    'aria-label': 'Cancel Check-In',
                                },
                                primary: {
                                    // A short verb fits the plate face at full size; the
                                    // accessible name keeps the whole action.
                                    label: checkinBusy ? 'Posting...' : 'Post',
                                    ink: 'white',
                                    onClick: handleCheckinSubmit,
                                    disabled: checkinBusy || !checkinMsg.trim(),
                                    'aria-label': checkinBusy ? 'Posting Check-In' : 'Post Check-In',
                                },
                            }}
                        >
                            <div className="pnm-console-dialog__body">
                                <p id="pnm-venue-checkin-description" className="pnm-console-dialog__copy pnm-checkin-dialog__venue">
                                    Check In At {venue.name || 'This Venue'}
                                </p>
                                {checkinDone ? (
                                    <p className="pnm-console-dialog__copy pnm-checkin-dialog__done" role="status">Checked In</p>
                                ) : (
                                    <div className="pnm-console-dialog__content">
                                        <label className="pnm-console-dialog__field">
                                            <span className="pnm-console-dialog__label">Your Message</span>
                                            <textarea
                                                className="pnm-checkin-dialog__textarea"
                                                value={checkinMsg}
                                                onChange={e => setCheckinMsg(e.target.value)}
                                                rows={3}
                                                maxLength={280}
                                                disabled={checkinBusy}
                                                placeholder="What's Happening At The Table?"
                                            />
                                        </label>
                                        <span className="pnm-checkin-dialog__count" aria-live="polite">{checkinMsg.length}/280</span>
                                        {checkinError && (
                                            <p className="pnm-console-dialog__error" role="alert">{checkinError}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </PokerNearMeConsole>
                        <button
                            type="button"
                            className="pnm-console-dialog__close"
                            onClick={closeCheckin}
                            disabled={checkinBusy}
                            aria-label="Close Check-In Dialog"
                        >
                            Close
                        </button>
                    </section>
                </div>
            ), document.body)}

        </PokerNearMePanelShell>
    );
}
