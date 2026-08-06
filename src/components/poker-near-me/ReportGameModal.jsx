/**
 * ReportGameModal — Report a live game + optional venue review.
 *
 * Features:
 *   1. Geo-Restriction: User must be ≤0.5 miles from the venue at submit time.
 *   2. Venue Selector: Searchable dropdown (sorted by distance) when no venue is pre-selected.
 *   3. Venue Review: Optional collapsible section — star ratings + category ratings + text.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';

// ─── Haversine distance (miles) ───────────────────────────────────────────────
function haversineMiles(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GEO_RADIUS_MILES = 0.5; // Must be within half a mile to report

const GAME_TYPES = [
    { value: 'nlh', label: "No-Limit Hold'em" },
    { value: 'plo', label: 'Pot-Limit Omaha' },
    { value: 'plo8', label: 'PLO Hi-Lo' },
    { value: 'mixed', label: 'Mixed Games' },
    { value: 'stud', label: 'Seven Card Stud' },
    { value: 'omaha', label: 'Limit Omaha' },
    { value: 'other', label: 'Other' },
];

const COMMON_STAKES = ['1/2', '1/3', '2/5', '5/10', '10/20', '10/25', '25/50', '50/100'];

const GAME_QUALITY = [
    { value: 'soft', label: 'Soft' },
    { value: 'average', label: 'Average' },
    { value: 'tough', label: 'Tough' },
];

// WIRING FIX: these keys must match CATEGORY_KEYS in pages/api/poker/reviews.js
// ('dealers', 'atmosphere', 'food_drinks', 'waitlist_speed', 'game_selection').
// The old keys game_quality / rake / food matched no column, so the API silently
// dropped those three star ratings on every submission — they never reached the
// database, never appeared in category_averages and never rendered back in
// VenueReviews. Mirrors CATEGORIES in VenueReviews.jsx.
const REVIEW_CATEGORIES = [
    { key: 'dealers', label: 'Dealers' },
    { key: 'game_selection', label: 'Game Selection' },
    { key: 'waitlist_speed', label: 'Waitlist Speed' },
    { key: 'food_drinks', label: 'Food & Drinks' },
    { key: 'atmosphere', label: 'Atmosphere' },
];

const INITIAL_GAME_FORM = {
    game_type: 'nlh',
    stakes: '1/2',
    customStakes: '',
    seats_open: 0,
    waitlist_size: 0,
    table_count: 1,
    game_quality: '',
    notes: '',
};

const INITIAL_REVIEW = {
    rating: 0,
    categoryRatings: {},
    reviewText: '',
};

// ─── Star Rating component ────────────────────────────────────────────────────
function StarRow({ rating, size = 22, onChange }) {
    const [hovered, setHovered] = useState(0);
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(star => (
                <svg
                    key={star}
                    width={size} height={size}
                    viewBox="0 0 24 24"
                    fill={(hovered || rating) >= star ? '#ffffff' : 'rgba(255,255,255,0.08)'}
                    stroke={(hovered || rating) >= star ? '#ffffff' : 'rgba(255,255,255,0.2)'}
                    strokeWidth="1.5"
                    style={{ cursor: onChange ? 'pointer' : 'default', transition: 'all 0.12s' }}
                    onClick={() => onChange && onChange(star)}
                    onMouseEnter={() => onChange && setHovered(star)}
                    onMouseLeave={() => onChange && setHovered(0)}
                >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            ))}
        </div>
    );
}

// ─── Geo Lock Screen ──────────────────────────────────────────────────────────
function GeoLockScreen({ venue, userLocation, distanceMiles, onClose, noCoords = false }) {
    const noGps = !userLocation;
    const tooFar = !noGps && !noCoords && Number.isFinite(distanceMiles) && distanceMiles > GEO_RADIUS_MILES;

    return (
        <div style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{
                width: 72, height: 72, borderRadius: '50%', margin: '0 auto 20px',
                background: noGps ? 'rgba(110,231,239,0.08)' : 'rgba(239,68,68,0.08)',
                border: `2px solid ${noGps ? 'rgba(110,231,239,0.25)' : 'rgba(239,68,68,0.25)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {noGps ? (
                    /* GPS off icon */
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.8)" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m-10-10h4m12 0h4" />
                        <line x1="2" y1="2" x2="22" y2="22" stroke="rgba(239,68,68,0.8)" strokeWidth="2.5" />
                    </svg>
                ) : (
                    /* Lock icon */
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.8)" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                )}
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
                {noGps ? 'Location Required' : noCoords ? 'Venue Not Mapped' : 'Geo-Restricted'}
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(200,214,229,0.6)', margin: '0 0 6px', lineHeight: 1.55 }}>
                {noGps
                    ? 'You must share your location to report a live game. This verifies you are actually at the venue.'
                    : noCoords
                        ? `We do not have coordinates on file for ${venue?.name || 'this venue'}, so we cannot verify you are there. Live game reports are geo-verified, so this venue cannot accept reports yet.`
                        : `You must be inside the venue to report a game. You are currently ${distanceMiles < 10 ? distanceMiles.toFixed(1) : Math.round(distanceMiles)} miles away from ${venue?.name || 'this venue'}.`
                }
            </p>
            {tooFar && (
                <p style={{ fontSize: 12, color: 'rgba(200,214,229,0.4)', margin: '0 0 20px' }}>
                    Required: within {GEO_RADIUS_MILES} mile · Your distance: {distanceMiles.toFixed(2)} mi
                </p>
            )}
            <button
                onClick={onClose}
                style={{
                    padding: '10px 24px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                Close
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ReportGameModal({
    venue,           // Pre-selected venue object { id, name, city, state, latitude, longitude }
    isOpen,
    onClose,
    onSubmit,
    user,
    userLocation,    // { lat, lng } from GPS
    allVenues = [],  // All known venues (for dropdown when no venue pre-selected)
}) {
    // ─── Form state ───
    const [gameForm, setGameForm] = useState(INITIAL_GAME_FORM);
    const [reviewForm, setReviewForm] = useState(INITIAL_REVIEW);
    const [showReview, setShowReview] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ─── Venue selector state (when no venue pre-selected) ───
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [venueSearch, setVenueSearch] = useState('');
    const [showVenueDropdown, setShowVenueDropdown] = useState(false);
    const venueInputRef = useRef(null);
    const panelRef = useRef(null);
    // Holds the successful live-game response so a review retry does not
    // re-report the game, and tracks whether onSubmit already fired.
    const reportedGameRef = useRef(null);
    const notifiedRef = useRef(false);

    // Resolve the active venue (prop wins over selection)
    const activeVenue = venue || selectedVenue;

    // ─── Geo distance ───
    // Resolve the coordinate pair once. Venue rows appear here keyed either
    // latitude/longitude or lat/lng depending on the call site.
    const venueCoords = useMemo(() => {
        if (!activeVenue) return null;
        const lat = Number(activeVenue.latitude ?? activeVenue.lat);
        const lng = Number(activeVenue.longitude ?? activeVenue.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
        return { lat, lng };
    }, [activeVenue]);

    const distanceMiles = useMemo(() => {
        if (!userLocation || !venueCoords) return Infinity;
        return haversineMiles(userLocation.lat, userLocation.lng, venueCoords.lat, venueCoords.lng);
    }, [userLocation, venueCoords]);

    // SECURITY: the previous check only inspected `activeVenue.latitude`, so a
    // venue keyed lat/lng — or any row with a null latitude — made the middle
    // term falsy and opened the gate purely because GPS was on, while the
    // "Location Verified" badge printed a distance the check had ignored.
    // A venue with no usable coordinates is now locked, not unlocked.
    const isGeoLocked = !userLocation || !venueCoords || distanceMiles > GEO_RADIUS_MILES;

    // ─── Venue search / filter ───
    const filteredVenues = useMemo(() => {
        const q = venueSearch.trim().toLowerCase();
        const list = allVenues.filter(v => v.latitude && v.longitude);
        // Sort by distance if GPS available, else alphabetical
        const sorted = userLocation
            ? [...list].sort((a, b) => {
                const da = haversineMiles(userLocation.lat, userLocation.lng, a.latitude, a.longitude);
                const db = haversineMiles(userLocation.lat, userLocation.lng, b.latitude, b.longitude);
                return da - db;
              })
            : [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (!q) return sorted.slice(0, 20);
        return sorted.filter(v => (v.name || '').toLowerCase().includes(q)).slice(0, 15);
    }, [allVenues, venueSearch, userLocation]);

    // ─── Reset on open ───
    useEffect(() => {
        if (isOpen) {
            setGameForm(INITIAL_GAME_FORM);
            setReviewForm(INITIAL_REVIEW);
            setShowReview(false);
            setError('');
            setSelectedVenue(null);
            setVenueSearch('');
            setShowVenueDropdown(false);
            reportedGameRef.current = null;
            notifiedRef.current = false;
        }
    }, [isOpen]);

    // Keep the latest onClose in a ref. The call site passes an inline arrow, so
    // depending on it directly would re-run the effect below on every parent
    // render (LiveGamesFeed refreshes on a timer) and yank focus back into the
    // panel while the user is typing in the notes field.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    // ─── Dialog behaviour: Escape to close, body scroll lock, initial focus ───
    useEffect(() => {
        if (!isOpen) return undefined;

        const onKeyDown = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return; }
            if (e.key !== 'Tab') return;
            // Trap Tab inside the panel so focus does not walk into the page behind.
            const root = panelRef.current;
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

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = setTimeout(() => {
            try {
                if (venueInputRef.current) venueInputRef.current.focus();
                else panelRef.current?.focus?.({ preventScroll: true });
            } catch (_) { /* ignore */ }
        }, 40);

        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = prevOverflow;
            clearTimeout(focusTimer);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleGameChange = (field, value) => {
        setGameForm(prev => ({ ...prev, [field]: value }));
        setError('');
    };

    const handleReviewChange = (field, value) => {
        setReviewForm(prev => ({ ...prev, [field]: value }));
    };

    // ─── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!activeVenue?.id) {
            setError('Please select a venue first.');
            return;
        }
        if (isGeoLocked) {
            setError('You must be at the venue to report a live game.');
            return;
        }

        const stakes = gameForm.stakes === 'custom' ? gameForm.customStakes : gameForm.stakes;
        if (!stakes) { setError('Please enter stakes.'); return; }

        setLoading(true);
        setError('');

        try {
            // getAccessToken() returns whatever is sitting in localStorage with no
            // expiry check; a tab left open for an hour sent a stale JWT and got a
            // 401 with no recovery path. getFreshAccessToken decodes exp and
            // refreshes when needed.
            const token = (await getFreshAccessToken()) || '';

            // ── Step 1: Report the live game ──────────────────────────────────
            // Skipped when a previous attempt already reported it and only the
            // review leg failed, so retrying the review cannot double-report.
            let gameData = reportedGameRef.current;
            if (!gameData) {
                const gameRes = await fetch('/api/public/live-games', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        venue_id: activeVenue.id,
                        game_type: gameForm.game_type,
                        stakes,
                        seats_open: parseInt(gameForm.seats_open) || 0,
                        waitlist_size: parseInt(gameForm.waitlist_size) || 0,
                        table_count: parseInt(gameForm.table_count) || 1,
                        game_quality: gameForm.game_quality || null,
                        notes: gameForm.notes || null,
                        // Geo evidence — server does a secondary check with 1 mi tolerance
                        reporter_lat: userLocation?.lat,
                        reporter_lng: userLocation?.lng,
                    }),
                });

                const body = await gameRes.json().catch(() => ({}));
                if (!gameRes.ok) {
                    if (body.error === 'GEO_RESTRICTED') {
                        throw new Error('Location check failed on server. Please ensure you are at the venue.');
                    }
                    throw new Error(body.error || 'Failed to report game');
                }
                gameData = body;
                reportedGameRef.current = body;
            }

            // ── Step 2: Submit venue review (if filled) ───────────────────────
            // The response used to be discarded entirely, so a 401/400/500
            // silently threw the user's review away while the modal reported
            // success and closed.
            let reviewFailed = false;
            if (showReview && reviewForm.rating > 0 && reviewForm.reviewText.trim()) {
                try {
                    const reviewRes = await fetch('/api/poker/reviews', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                            venue_id: activeVenue.id,
                            rating: reviewForm.rating,
                            review_text: reviewForm.reviewText.trim(),
                            reviewer_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous',
                            category_ratings: reviewForm.categoryRatings,
                        }),
                    });
                    if (!reviewRes.ok) {
                        reviewFailed = true;
                        console.warn('[ReportGameModal] Review submission rejected:', reviewRes.status);
                    }
                } catch (reviewErr) {
                    reviewFailed = true;
                    console.warn('[ReportGameModal] Review submission failed (non-fatal):', reviewErr);
                }
            }

            if (!notifiedRef.current) {
                notifiedRef.current = true;
                onSubmit?.(gameData.game);
            }

            if (reviewFailed) {
                // Keep the modal open so the review text the user just wrote is
                // not silently discarded. Retrying only re-sends the review.
                setError('Game reported, but your review could not be saved. Press Submit again to retry the review, or close to keep just the game report.');
                setShowReview(true);
                return;
            }

            onClose();

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Render: Venue Selector ───────────────────────────────────────────────
    const renderVenueSelector = () => (
        <div style={{ marginBottom: 20, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'rgba(110,231,239,0.8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Select Venue *
            </label>
            <div style={{ position: 'relative' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(110,231,239,0.5)" strokeWidth="2"
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <input
                    ref={venueInputRef}
                    type="text"
                    placeholder={selectedVenue ? selectedVenue.name : 'Search venues by name...'}
                    value={venueSearch}
                    onChange={e => { setVenueSearch(e.target.value); setShowVenueDropdown(true); setSelectedVenue(null); }}
                    onFocus={() => setShowVenueDropdown(true)}
                    style={{
                        width: '100%', padding: '10px 12px 10px 36px',
                        background: 'rgba(255,255,255,0.05)',
                        border: selectedVenue ? '1px solid rgba(110,231,239,0.4)' : '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 10, color: selectedVenue ? '#6ee7ef' : '#fff',
                        fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
                        outline: 'none',
                    }}
                />
            </div>

            {showVenueDropdown && filteredVenues.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'rgba(10,15,25,0.98)', backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(110,231,239,0.2)', borderRadius: 12,
                    marginTop: 4, overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                    maxHeight: 240, overflowY: 'auto',
                }}>
                    {filteredVenues.map((v, i) => {
                        const dist = userLocation && v.latitude
                            ? haversineMiles(userLocation.lat, userLocation.lng, v.latitude, v.longitude)
                            : null;
                        return (
                            <button
                                key={v.id || v.bravo_slug || i}
                                type="button"
                                onClick={() => {
                                    setSelectedVenue(v);
                                    setVenueSearch('');
                                    setShowVenueDropdown(false);
                                    setError('');
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    width: '100%', padding: '10px 14px',
                                    background: 'transparent', border: 'none',
                                    borderBottom: i < filteredVenues.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                    color: '#e0e8f0', fontSize: 13, textAlign: 'left',
                                    cursor: 'pointer', fontFamily: 'inherit',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 600, color: '#fff' }}>{v.name}</div>
                                    <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)', marginTop: 1 }}>
                                        {[v.city, v.state].filter(Boolean).join(', ')}
                                    </div>
                                </div>
                                {dist !== null && dist < 9999 && (
                                    <span style={{ fontSize: 11, color: dist <= GEO_RADIUS_MILES ? '#22c55e' : 'rgba(200,214,229,0.35)', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>
                                        {dist < 0.1 ? '<0.1 mi' : `${dist.toFixed(1)} mi`}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Selected venue pill */}
            {selectedVenue && (
                <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(110,231,239,0.06)', border: '1px solid rgba(110,231,239,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#6ee7ef' }}>{selectedVenue.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(200,214,229,0.45)' }}>
                            {[selectedVenue.city, selectedVenue.state].filter(Boolean).join(', ')}
                            {distanceMiles < 9999 && ` · ${distanceMiles.toFixed(2)} mi away`}
                        </div>
                    </div>
                    <button type="button" onClick={() => { setSelectedVenue(null); setVenueSearch(''); }}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>
                        ×
                    </button>
                </div>
            )}
        </div>
    );

    // ─── Render: Venue Info Banner ────────────────────────────────────────────
    const renderVenueBanner = () => (
        <div style={{
            background: 'rgba(110,231,239,0.06)', border: '1px solid rgba(110,231,239,0.15)',
            borderRadius: 10, padding: '12px 14px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
            <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#6ee7ef' }}>{activeVenue.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(200,214,229,0.5)', marginTop: 2 }}>
                    {[activeVenue.city, activeVenue.state].filter(Boolean).join(', ')}
                    {userLocation && distanceMiles < 9999 && (
                        <span style={{ marginLeft: 8, color: distanceMiles <= GEO_RADIUS_MILES ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                            · {distanceMiles.toFixed(2)} mi {distanceMiles <= GEO_RADIUS_MILES ? '✓' : '— Too Far'}
                        </span>
                    )}
                </div>
            </div>
            {/* Geo status dot */}
            <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: !userLocation ? '#6ee7ef' : distanceMiles <= GEO_RADIUS_MILES ? '#22c55e' : '#ef4444',
                boxShadow: `0 0 8px ${!userLocation ? '#6ee7ef' : distanceMiles <= GEO_RADIUS_MILES ? '#22c55e' : '#ef4444'}`,
                animation: 'rgm-pulse 1.8s ease-in-out infinite',
            }} />
        </div>
    );

    // ─── Render: Review Section ───────────────────────────────────────────────
    const renderReviewSection = () => (
        <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <button
                type="button"
                onClick={() => setShowReview(r => !r)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', background: 'none', border: 'none',
                    color: showReview ? '#ffffff' : 'rgba(200,214,229,0.6)',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    padding: '0 0 8px',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Also Leave a Venue Review (Optional)
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: showReview ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {showReview && (
                <div style={{ paddingTop: 4 }}>
                    {/* Overall Rating */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                            Overall Rating *
                        </div>
                        <StarRow rating={reviewForm.rating} size={28} onChange={val => handleReviewChange('rating', val)} />
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                            {reviewForm.rating === 0 ? 'Tap to rate' : ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][reviewForm.rating]}
                        </div>
                    </div>

                    {/* Category Ratings */}
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                            Category Ratings (Optional)
                        </div>
                        {REVIEW_CATEGORIES.map(cat => (
                            <div key={cat.key} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <span style={{ fontSize: 13, color: 'rgba(200,214,229,0.7)', fontWeight: 500 }}>{cat.label}</span>
                                <StarRow
                                    rating={reviewForm.categoryRatings[cat.key] || 0}
                                    size={16}
                                    onChange={val => handleReviewChange('categoryRatings', {
                                        ...reviewForm.categoryRatings, [cat.key]: val,
                                    })}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Review Text */}
                    <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                            Your Review *
                        </div>
                        <textarea
                            value={reviewForm.reviewText}
                            onChange={e => handleReviewChange('reviewText', e.target.value)}
                            placeholder="Tell other players about the atmosphere, dealers, rake, game quality..."
                            rows={3}
                            style={{
                                width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 10, color: '#fff', fontSize: 13, fontFamily: 'inherit',
                                resize: 'vertical', outline: 'none',
                            }}
                        />
                    </div>
                    {showReview && reviewForm.rating === 0 && reviewForm.reviewText.trim() && (
                        <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.7)', marginTop: 4 }}>
                            Please add an overall star rating to submit the review.
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="rgm-title"
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'linear-gradient(160deg, #0e1523 0%, #0a0f1a 100%)',
                    border: '1px solid rgba(110,231,239,0.2)',
                    borderRadius: 18, width: '100%', maxWidth: 500,
                    maxHeight: '92vh', overflow: 'auto', outline: 'none',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(110,231,239,0.06)',
                    animation: 'rgm-slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
                }}
            >
                {/* ── Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '18px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div>
                        <h2 id="rgm-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                            Report Live Game
                        </h2>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(110,231,239,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Geo-Verified · Members Only
                        </p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close report game dialog" style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
                    }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div style={{ padding: '18px 20px 20px' }}>
                    {/* ── Venue Selector (no pre-selected venue) ── */}
                    {!venue && renderVenueSelector()}

                    {/* ── Venue Banner (pre-selected or chosen) ── */}
                    {activeVenue && renderVenueBanner()}

                    {/* ── Geo Lock: show locked state if no GPS or too far ── */}
                    {activeVenue && isGeoLocked ? (
                        <GeoLockScreen
                            venue={activeVenue}
                            userLocation={userLocation}
                            distanceMiles={distanceMiles}
                            noCoords={!!userLocation && !venueCoords}
                            onClose={onClose}
                        />
                    ) : activeVenue ? (
                        /* ── Full Game Report Form ── */
                        <form onSubmit={handleSubmit}>
                            {/* Geo confirmation badge */}
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                marginBottom: 18, padding: '5px 12px',
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                                borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#22c55e',
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', animation: 'rgm-pulse 1.5s infinite' }} />
                                Location Verified · {distanceMiles < 0.1 ? '<0.1' : distanceMiles.toFixed(2)} mi away
                            </div>

                            {/* Game Type */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={labelStyle}>Game Type *</label>
                                <select value={gameForm.game_type} onChange={e => handleGameChange('game_type', e.target.value)} style={selectStyle}>
                                    {GAME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>

                            {/* Stakes */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={labelStyle}>Stakes *</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 8 }}>
                                    {COMMON_STAKES.map(s => (
                                        <button key={s} type="button" onClick={() => handleGameChange('stakes', s)} style={chipStyle(gameForm.stakes === s)}>
                                            {s}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => handleGameChange('stakes', 'custom')} style={chipStyle(gameForm.stakes === 'custom')}>
                                        Custom
                                    </button>
                                </div>
                                {gameForm.stakes === 'custom' && (
                                    <input
                                        type="text" placeholder="e.g., 3/6, 20/40"
                                        value={gameForm.customStakes}
                                        onChange={e => handleGameChange('customStakes', e.target.value)}
                                        style={inputStyle}
                                    />
                                )}
                            </div>

                            {/* Seats & Waitlist */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                                {[
                                    { field: 'seats_open', label: 'Seats Open', min: 0, max: 10 },
                                    { field: 'waitlist_size', label: 'Waitlist', min: 0, max: 99 },
                                    { field: 'table_count', label: 'Tables Running', min: 1, max: 30 },
                                ].map(({ field, label, min, max }) => (
                                    <div key={field}>
                                        <label style={labelStyle}>{label}</label>
                                        <input
                                            type="number" min={min} max={max}
                                            value={gameForm[field]}
                                            onChange={e => handleGameChange(field, e.target.value)}
                                            style={inputStyle}
                                        />
                                    </div>
                                ))}
                            </div>

                            {/* Game Quality */}
                            <div style={{ marginBottom: 16 }}>
                                <label style={labelStyle}>Game Quality (Optional)</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {GAME_QUALITY.map(q => (
                                        <button key={q.value} type="button"
                                            onClick={() => handleGameChange('game_quality', gameForm.game_quality === q.value ? '' : q.value)}
                                            style={{ ...chipStyle(gameForm.game_quality === q.value), flex: 1, padding: '8px 4px' }}>
                                            {q.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div style={{ marginBottom: 14 }}>
                                <label style={labelStyle}>Notes (Optional)</label>
                                <textarea
                                    value={gameForm.notes}
                                    onChange={e => handleGameChange('notes', e.target.value)}
                                    placeholder="Any additional details about the game..."
                                    rows={2}
                                    style={{ ...inputStyle, resize: 'vertical' }}
                                />
                            </div>

                            {/* ── Venue Review Section ── */}
                            {renderReviewSection()}

                            {/* Error */}
                            {error && (
                                <div style={{
                                    marginTop: 14, padding: '10px 14px', borderRadius: 10,
                                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                                    color: '#ef4444', fontSize: 13, fontWeight: 500,
                                }}>{error}</div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button type="button" onClick={onClose} style={{
                                    flex: 1, padding: '12px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                                    color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} style={{
                                    flex: 2, padding: '12px', borderRadius: 10,
                                    background: loading ? 'rgba(110,231,239,0.4)' : 'linear-gradient(135deg, #6ee7ef, #22c55e)',
                                    border: 'none', color: '#000', fontSize: 14, fontWeight: 800,
                                    cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                }}>
                                    {loading ? 'Submitting...' : showReview && reviewForm.rating > 0 && reviewForm.reviewText.trim()
                                        ? 'Submit Game + Review'
                                        : 'Submit Game Report'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        /* ── No venue selected yet ── */
                        <div style={{ textAlign: 'center', padding: '20px 0 8px', color: 'rgba(200,214,229,0.4)', fontSize: 13 }}>
                            Search and select a venue above to begin.
                        </div>
                    )}
                </div>
            </div>

            {/* ── Scoped CSS ── */}
            <style>{`
                @keyframes rgm-slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes rgm-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.45; }
                }
                textarea:focus, input:focus, select:focus { outline: none !important; }
            `}</style>
        </div>
    );
}

// ─── Shared micro-styles ──────────────────────────────────────────────────────
const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase',
    letterSpacing: '0.07em', marginBottom: 7,
};

const inputStyle = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 9, color: '#fff', fontSize: 14, fontFamily: 'inherit',
};

const selectStyle = {
    ...inputStyle,
};

const chipStyle = (active) => ({
    padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
    border: active ? '1px solid rgba(110,231,239,0.5)' : '1px solid rgba(255,255,255,0.12)',
    background: active ? 'rgba(110,231,239,0.15)' : 'rgba(255,255,255,0.04)',
    color: active ? '#6ee7ef' : 'rgba(255,255,255,0.6)',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
});
