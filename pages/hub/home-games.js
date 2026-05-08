/**
 *  HOME GAMES — Find Poker Home Games Near You
 *  Same layout as Poker Near Me but filtered to home games only.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAvatar } from '../../src/contexts/AvatarContext';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getVenueFavorites, addVenueFavorite, removeVenueFavorite } from '../../src/services/pokerNearMeFavorites';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import LocationEnableModal from '../../src/components/ui/LocationEnableModal';

const VenueCard = dynamic(() => import('../../src/components/poker-near-me/VenueCard'), { ssr: false });
const VenueMap = dynamic(() => import('../../src/components/poker-near-me/VenueMap'), { ssr: false });
import { MapErrorBoundary } from '../../src/components/poker-near-me/VenueMap';
import HostHomeGameButton from '../../src/components/poker-near-me/HostHomeGameButton';

const PAGE_SIZE = 12;

// ═══════════════════════════════════════════════════════════════════
// HomeGameCard — inline card component designed specifically for home
// games. Richer than VenueCard (which is tuned for poker rooms): shows
// the social-page cover + avatar, host name, stakes/frequency chips,
// next upcoming game preview with seat count, and member/follower
// counters. All data comes from /api/public/home-games/discover.
// ═══════════════════════════════════════════════════════════════════
function HomeGameCard({ venue, onNavigate, onFavorite, isFavorited }) {
    const stakesLine = [
        venue.default_game_type ? venue.default_game_type.toUpperCase() : '',
        venue.default_stakes || '',
    ].filter(Boolean).join(' ');

    const freqLine = [
        venue.frequency ? venue.frequency.charAt(0).toUpperCase() + venue.frequency.slice(1) : '',
        venue.typical_day || '',
    ].filter(Boolean).join(' · ');

    const nextGameDate = venue.next_game_date
        ? new Date(venue.next_game_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : null;

    const seatsLeft = venue.next_game_seats_left;
    const isFull = seatsLeft === 0;
    const hasSeats = seatsLeft !== null && seatsLeft > 0;

    const handleCardClick = (e) => {
        // Don't navigate when clicking interactive children
        if (e?.target?.closest?.('button, a')) return;
        if (onNavigate) onNavigate();
    };
    const handleKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onNavigate) onNavigate();
        }
    };

    return (
        <div className="hgc-card" role="button" tabIndex={0} onClick={handleCardClick} onKeyDown={handleKey}>
            <div className="hgc-cover">
                {venue.cover_url ? (
                    <img src={venue.cover_url} alt="" className="hgc-cover-img" loading="lazy" />
                ) : (
                    <div className="hgc-cover-fallback" aria-hidden="true" />
                )}
                <div className="hgc-cover-fade" />
                {onFavorite && (
                    <button
                        className={'hgc-fav' + (isFavorited ? ' hgc-fav-on' : '')}
                        onClick={onFavorite}
                        aria-label={isFavorited ? 'Unfavorite' : 'Favorite'}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke="currentColor" strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>
                )}
                {hasSeats && (
                    <div className="hgc-badge hgc-badge-live">
                        {seatsLeft} SEAT{seatsLeft === 1 ? '' : 'S'} LEFT
                    </div>
                )}
                {isFull && (
                    <div className="hgc-badge hgc-badge-full">FULL</div>
                )}
            </div>

            <div className="hgc-body">
                <div className="hgc-head">
                    <div className="hgc-avatar">
                        {venue.avatar_url ? (
                            <img src={venue.avatar_url} alt="" loading="lazy" />
                        ) : (
                            <div className="hgc-avatar-fallback">{(venue.name || 'H').charAt(0)}</div>
                        )}
                    </div>
                    <div className="hgc-title-block">
                        <h3 className="hgc-name" title={venue.name}>{venue.name}</h3>
                        <div className="hgc-host">
                            {venue.host_display_name ? `Hosted by ${venue.host_display_name}` : 'Home Game'}
                        </div>
                        <div className="hgc-location">
                            {venue.city || ''}{venue.state ? `, ${venue.state}` : ''}
                        </div>
                    </div>
                </div>

                {(stakesLine || freqLine) && (
                    <div className="hgc-chips">
                        {stakesLine && <span className="hgc-chip">{stakesLine}</span>}
                        {freqLine && <span className="hgc-chip hgc-chip-muted">{freqLine}</span>}
                    </div>
                )}

                {nextGameDate && (
                    <div className="hgc-next">
                        <span className="hgc-next-label">NEXT</span>
                        <span className="hgc-next-date">{nextGameDate}</span>
                        {venue.next_game_title && (
                            <span className="hgc-next-title">· {venue.next_game_title}</span>
                        )}
                    </div>
                )}

                <div className="hgc-stats">
                    <span><strong>{venue.member_count || 0}</strong> members</span>
                    <span>·</span>
                    <span><strong>{venue.saves_count || 0}</strong> followers</span>
                    {venue.games_hosted > 0 && (
                        <>
                            <span>·</span>
                            <span><strong>{venue.games_hosted}</strong> played</span>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .hgc-card {
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(160deg, rgba(15,23,42,.85) 0%, rgba(8,14,26,.95) 100%);
                    border: 1.5px solid rgba(148,163,184,.15);
                    border-radius: 14px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: border-color .2s ease, transform .15s ease, box-shadow .2s ease;
                    position: relative;
                }
                .hgc-card:hover,
                .hgc-card:focus-visible {
                    border-color: rgba(239,68,68,.5);
                    transform: translateY(-2px);
                    box-shadow: 0 10px 28px rgba(0,0,0,.5), 0 0 20px rgba(239,68,68,.12);
                    outline: none;
                }
                .hgc-cover {
                    position: relative;
                    aspect-ratio: 16 / 9;
                    background: linear-gradient(135deg, #1e293b, #0f172a);
                    overflow: hidden;
                }
                .hgc-cover-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }
                .hgc-cover-fallback {
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #dc2626 0%, #7c2d12 50%, #0f172a 100%);
                }
                .hgc-cover-fade {
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(180deg, rgba(10,15,28,0) 60%, rgba(10,15,28,.5) 100%);
                    pointer-events: none;
                }
                .hgc-fav {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    background: rgba(10,10,21,.65);
                    border: 1px solid rgba(255,255,255,.1);
                    color: rgba(255,255,255,.8);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    transition: background .15s ease;
                }
                .hgc-fav:hover { background: rgba(239,68,68,.4); }
                .hgc-fav-on { color: #ef4444; }
                .hgc-badge {
                    position: absolute;
                    bottom: 10px;
                    left: 10px;
                    padding: 4px 10px;
                    color: #fff;
                    font-size: 10px;
                    font-weight: 900;
                    letter-spacing: 1px;
                    border-radius: 4px;
                }
                .hgc-badge-live { background: rgba(16,185,129,.92); box-shadow: 0 0 12px rgba(16,185,129,.4); }
                .hgc-badge-full { background: rgba(148,163,184,.45); color: rgba(255,255,255,.8); }
                .hgc-body {
                    padding: 14px;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .hgc-head { display: flex; gap: 10px; align-items: flex-start; }
                .hgc-avatar {
                    width: 44px;
                    height: 44px;
                    border-radius: 8px;
                    overflow: hidden;
                    background: #1a1f2e;
                    flex-shrink: 0;
                    border: 1px solid rgba(239,68,68,.25);
                }
                .hgc-avatar img { width: 100%; height: 100%; object-fit: cover; }
                .hgc-avatar-fallback {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    font-weight: 900;
                    color: #ef4444;
                }
                .hgc-title-block { min-width: 0; flex: 1; }
                .hgc-name {
                    font-size: 15px;
                    font-weight: 800;
                    margin: 0 0 2px;
                    color: #fff;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    letter-spacing: -.2px;
                }
                .hgc-host {
                    font-size: 12px;
                    color: rgba(255,255,255,.55);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .hgc-location {
                    font-size: 11px;
                    color: rgba(148,163,184,.55);
                    text-transform: uppercase;
                    letter-spacing: .5px;
                    margin-top: 1px;
                }
                .hgc-chips { display: flex; gap: 6px; flex-wrap: wrap; }
                .hgc-chip {
                    padding: 3px 8px;
                    background: rgba(239,68,68,.12);
                    border: 1px solid rgba(239,68,68,.28);
                    color: #ef4444;
                    font-size: 11px;
                    font-weight: 700;
                    border-radius: 4px;
                    text-transform: uppercase;
                    letter-spacing: .5px;
                }
                .hgc-chip-muted {
                    background: rgba(148,163,184,.08);
                    border-color: rgba(148,163,184,.18);
                    color: rgba(255,255,255,.55);
                }
                .hgc-next {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px;
                    background: rgba(16,185,129,.08);
                    border: 1px solid rgba(16,185,129,.2);
                    border-radius: 6px;
                    font-size: 12px;
                    flex-wrap: wrap;
                }
                .hgc-next-label {
                    font-size: 9px;
                    font-weight: 900;
                    color: #10b981;
                    letter-spacing: 1px;
                    padding: 2px 5px;
                    background: rgba(16,185,129,.15);
                    border-radius: 3px;
                }
                .hgc-next-date {
                    font-weight: 700;
                    color: rgba(255,255,255,.85);
                }
                .hgc-next-title {
                    color: rgba(255,255,255,.5);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .hgc-stats {
                    display: flex;
                    gap: 6px;
                    font-size: 11px;
                    color: rgba(255,255,255,.4);
                    margin-top: auto;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .hgc-stats strong { color: #fff; font-weight: 700; margin-right: 3px; }
            `}</style>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════
// Mock seed data removed. Real home games are now loaded from
// /api/public/home-games/discover which joins commander_home_groups
// with social_pages. See migration unify_home_games_with_social_pages.
// ═══════════════════════════════════════════════════════════════════

export default function HomeGamesPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const bus = useTrainingBus();
    const userId = user?.id;

    // Data states
    const [venues, setVenues] = useState([]);
    const [allHomeGames, setAllHomeGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [userLocation, setUserLocation] = useState(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [gpsLocationLabel, setGpsLocationLabel] = useState(null);
    const [mapFullscreen, setMapFullscreen] = useState(false);
    const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
    const [sortBy, setSortBy] = useState('default');
    const [favorites, setFavorites] = useState({});
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        radius: 'Any',
        gameType: 'all',
        selectedState: 'all',
    });

    // Load home games from the unified public discovery API. This hits
    // /api/public/home-games/discover which joins commander_home_groups
    // with their social_pages (auto-created by the unify migration).
    // Each result carries lat/lng (if set), slug (canonical URL), and
    // the next upcoming session for inline RSVP teasers.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const ac = new AbortController();
        fetch('/api/public/home-games/discover?limit=100', { signal: ac.signal })
            .then(r => r.json())
            .then(json => {
                if (!json?.success) throw new Error(json?.error || 'discover failed');
                const rows = Array.isArray(json.groups) ? json.groups : [];
                // Adapt to the shape VenueCard/VenueMap expect: they look for
                // id, name, city, state, latitude, longitude, venue_type.
                const adapted = rows.map(g => ({
                    id: g.id,
                    slug: g.slug,                       // canonical URL key
                    club_code: g.club_code,             // share fallback
                    invite_code: g.invite_code,         // share fallback
                    name: g.name,
                    description: g.description,
                    city: g.city,
                    state: g.state,
                    // commander_home_groups stores coords on the group row;
                    // they're not exposed publicly by the discover endpoint
                    // yet (privacy). Cards still render without a pin.
                    latitude: g.latitude ?? null,
                    longitude: g.longitude ?? null,
                    venue_type: 'home_game',
                    games_offered: g.default_game_type
                        ? [`${(g.default_game_type || '').toUpperCase()}${g.default_stakes ? ' ' + g.default_stakes : ''}`.trim()]
                        : [],
                    schedule: [g.frequency, g.typical_day].filter(Boolean).join(' · ') || null,
                    max_players: g.max_players || null,
                    host_display_name: g.host?.display_name || null,
                    host_avatar_url: g.host?.avatar_url || null,
                    saves_count: g.follower_count || 0,
                    trust_score: null,
                    // Extra data for card embellishment:
                    member_count: g.member_count || 0,
                    next_game_date: g.next_game_date,
                    next_game_seats_left: g.next_game_seats_left,
                    cover_url: g.cover_url,
                    avatar_url: g.avatar_url,
                }));
                setAllHomeGames(adapted);
                setVenues(adapted);
                setLoading(false);
            })
            .catch((e) => {
                if (e?.name === 'AbortError') return;
                console.warn('[home-games] discover load failed:', e);
                setAllHomeGames([]);
                setVenues([]);
                setLoading(false);
            });
        return () => ac.abort();
    }, []);

    // GPS auto-request
    const gpsAutoRef = useRef(false);
    useEffect(() => {
        if (gpsAutoRef.current) return;
        gpsAutoRef.current = true;
        // Try saved location
        try {
            const saved = localStorage.getItem('sp-user-gps');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.lat && parsed.lng && parsed.time && (Date.now() - parsed.time) < 86400000) {
                    setUserLocation({ lat: parsed.lat, lng: parsed.lng });
                    setGpsLocationLabel(parsed.label || `${parsed.lat.toFixed(3)}, ${parsed.lng.toFixed(3)}`);
                    return;
                }
            }
        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        // Request fresh GPS
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            setTimeout(() => requestGpsLocation(), 600);
        }
    }, []);

    const requestGpsLocation = () => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                setUserLocation(loc);
                setGpsLoading(false);
                // Reverse geocode
                fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`)
                    .then(r => r.json())
                    .then(data => {
                        const city = data?.address?.city || data?.address?.town || data?.address?.village || '';
                        const state = data?.address?.state || '';
                        const stateAbbr = state.length > 2 ? getStateAbbr(state) : state;
                        const label = city && stateAbbr ? `${city}, ${stateAbbr}` : `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`;
                        setGpsLocationLabel(label);
                        try {
                            localStorage.setItem('sp-user-gps', JSON.stringify({ ...loc, time: Date.now(), label }));
                        } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                    })
                    .catch(() => {
                        setGpsLocationLabel(`${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`);
                    });
            },
            (err) => {
                setGpsLoading(false);
                if (err && err.code === 1) {
                    setShowLocationModal(true);
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    };

    // State abbreviation helper
    const getStateAbbr = (stateName) => {
        const states = {
            'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
            'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
            'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
            'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
            'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
            'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
            'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
            'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
            'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
            'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
        };
        return states[stateName] || stateName;
    };

    // Toggle favorite
    const toggleFavorite = async (venueId, e, venueData) => {
        if (e) e.stopPropagation();
        if (!userId) return;
        const key = 'venue-' + venueId;
        const isFav = !!favorites[key];
        if (isFav) {
            setFavorites(prev => { const n = { ...prev }; delete n[key]; return n; });
            try { await removeVenueFavorite(userId, venueId); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        } else {
            setFavorites(prev => ({ ...prev, [key]: Date.now() }));
            try { await addVenueFavorite(userId, venueId, venueData); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
    };

    // Haversine distance
    const haversineMiles = (lat1, lng1, lat2, lng2) => {
        const R = 3958.8;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Sort venues
    const sortedVenues = useMemo(() => {
        let filtered = [...venues];

        // Apply search filter locally
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                (v.name || '').toLowerCase().includes(lower) ||
                (v.city || '').toLowerCase().includes(lower) ||
                (v.state || '').toLowerCase().includes(lower)
            );
        }

        // Apply state filter
        if (filters.selectedState && filters.selectedState !== 'all') {
            filtered = filtered.filter(v => v.state === filters.selectedState);
        }

        // Calculate distance if we have user location
        if (userLocation) {
            filtered = filtered.map(v => ({
                ...v,
                _distance: (v.latitude && v.longitude)
                    ? haversineMiles(userLocation.lat, userLocation.lng, v.latitude, v.longitude)
                    : 99999
            }));

            // Apply radius filter
            if (filters.radius !== 'Any') {
                filtered = filtered.filter(v => v._distance <= Number(filters.radius));
            }
        }

        // Sort
        switch (sortBy) {
            case 'distance':
                filtered.sort((a, b) => (a._distance || 99999) - (b._distance || 99999));
                break;
            case 'name-az':
                filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                break;
            case 'name-za':
                filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
                break;
            case 'trust-desc':
                filtered.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0));
                break;
            default:
                if (userLocation) {
                    filtered.sort((a, b) => (a._distance || 99999) - (b._distance || 99999));
                }
        }

        return filtered;
    }, [venues, searchQuery, filters, sortBy, userLocation]);

    const displayed = sortedVenues.slice(0, displayCount);
    const remaining = sortedVenues.length - displayed.length;

    // Handle search
    const searchDebounceRef = useRef(null);
    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
    };

    const handleSearch = (e) => {
        e.preventDefault();
    };

    // Get unique states from home game venues
    const availableStates = useMemo(() => {
        const states = new Set();
        (allHomeGames.length > 0 ? allHomeGames : venues).forEach(v => {
            if (v.state) states.add(v.state);
        });
        return Array.from(states).sort();
    }, [venues, allHomeGames]);

    return (
        <>
            <SEOHead
                title="Home Games — Find Poker Home Games Near You | Smarter.Poker"
                description="Discover poker home games near you. Find local private games, join the community, and host your own."
                canonical="/hub/home-games"
            />

            <div className="space-bg"><div className="space-overlay" /></div>

            <div className="hg-page">
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} onBackClick={() => {
                    router.back();
                }} />

                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                />

                {/* ═══ PAGE TITLE ═══ */}
                <div className="hg-title-bar">
                    <h1 className="hg-title">HOME GAMES</h1>
                    <p className="hg-subtitle">Private Games • Local Community • Your Table</p>
                </div>

                {/* ═══ SIDEBAR + MAIN LAYOUT ═══ */}
                <div className="hg-layout">

                    {/* ─── LEFT SIDEBAR ─── */}
                    <aside className="hg-sidebar" role="navigation" aria-label="Home Games navigation">
                        {/* GPS LOCATION */}
                        <div className="hg-sidebar-filters">
                            {!userLocation && (
                                <button className={'hg-gps-btn' + (gpsLoading ? ' loading' : '')} onClick={requestGpsLocation} disabled={gpsLoading}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="3" />
                                        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                    </svg>
                                    {gpsLoading ? 'Locating...' : 'Enable GPS'}
                                </button>
                            )}

                            {userLocation && gpsLocationLabel && (
                                <div className="hg-gps-label">
                                    <div className="hg-gps-pulse" />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(74,222,128,0.7)', marginBottom: 2 }}>Your Location</div>
                                        <strong style={{ fontSize: 13 }}>{gpsLocationLabel}</strong>
                                    </div>
                                    <button onClick={() => { setUserLocation(null); setGpsLocationLabel(null); }} className="hg-gps-clear" title="Clear Location">&times;</button>
                                </div>
                            )}

                            {/* SEARCH */}
                            <form className="hg-search-form" onSubmit={handleSearch}>
                                <svg className="hg-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                <input
                                    type="text"
                                    className="hg-search-input"
                                    placeholder="Search Home Games..."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    autoComplete="off"
                                />
                            </form>

                            <div className="hg-section-title">Filters</div>

                            {/* RADIUS */}
                            <div className="hg-filter-group">
                                <label>Radius</label>
                                <select
                                    value={filters.radius}
                                    onChange={e => setFilters({ ...filters, radius: e.target.value === 'Any' ? 'Any' : Number(e.target.value) })}
                                    className="hg-select"
                                >
                                    <option value={25}>25 Mi</option>
                                    <option value={50}>50 Mi</option>
                                    <option value={100}>100 Mi</option>
                                    <option value={200}>200 Mi</option>
                                    <option value={500}>500 Mi</option>
                                    <option value="Any">Any</option>
                                </select>
                            </div>

                            {/* STATE */}
                            <div className="hg-filter-group">
                                <label>State</label>
                                <select
                                    value={filters.selectedState}
                                    onChange={e => setFilters(f => ({ ...f, selectedState: e.target.value }))}
                                    className="hg-select"
                                >
                                    <option value="all">All States</option>
                                    {availableStates.map(st => (
                                        <option key={st} value={st}>{st}</option>
                                    ))}
                                </select>
                            </div>

                            {/* HOST A GAME CTA */}
                            <HostHomeGameButton className="hg-host-btn" />
                        </div>
                    </aside>

                    {/* ─── MAIN CONTENT ─── */}
                    <div className="hg-main">
                        <div className="hg-content">
                            {loading ? (
                                <div className="hg-loading">
                                    <div className="hg-spinner" />
                                    <p>Finding Home Games Near You...</p>
                                </div>
                            ) : (
                                <>
                                    {/* MAP */}
                                    <div className={`hg-map-card${mapFullscreen ? ' hg-map-fullscreen' : ''}`}>
                                        {mapFullscreen && (
                                            <div className="hg-map-collapse" onClick={() => setMapFullscreen(false)}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                                                    <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                                                </svg>
                                                Collapse Map
                                            </div>
                                        )}
                                        <MapErrorBoundary>
                                            <VenueMap
                                                key={mapFullscreen ? 'hg-fullscreen' : 'hg-preview'}
                                                venues={sortedVenues}
                                                userLocation={userLocation}
                                                fullHeight={mapFullscreen}
                                                hideLegend={true}
                                                radiusMiles={filters.radius}
                                                onVenueClick={(venue) => {
                                                    // Unified routing: prefer public slug (canonical URL);
                                                    // fall back to club/invite code share page; last resort
                                                    // is staying put. Never send to /hub/venues anymore —
                                                    // those don't resolve for home games.
                                                    if (venue?.slug) {
                                                        router.push('/hub/home-games/' + venue.slug);
                                                    } else if (venue?.club_code) {
                                                        router.push('/home-game/' + venue.club_code);
                                                    } else if (venue?.invite_code) {
                                                        router.push('/home-game/' + venue.invite_code);
                                                    }
                                                }}
                                            />
                                        </MapErrorBoundary>
                                    </div>

                                    {/* RESULTS BAR */}
                                    <div className="hg-results-bar">
                                        <span className="hg-results-count">{sortedVenues.length} Home Game{sortedVenues.length !== 1 ? 's' : ''} Found</span>

                                        <div className="hg-sort-wrapper">
                                            <label className="hg-sort-label">Sort:</label>
                                            <select
                                                value={sortBy}
                                                onChange={e => setSortBy(e.target.value)}
                                                className="hg-sort-select"
                                            >
                                                <option value="default">{userLocation ? 'Nearest First' : 'Default'}</option>
                                                <option value="distance">Distance (Nearest)</option>
                                                <option value="trust-desc">Trust Score (High → Low)</option>
                                                <option value="name-az">Name (A → Z)</option>
                                                <option value="name-za">Name (Z → A)</option>
                                            </select>
                                        </div>

                                        {!mapFullscreen && (
                                            <button className="hg-expand-map-btn" onClick={() => setMapFullscreen(true)}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                                                    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                                </svg>
                                                Expand Map
                                            </button>
                                        )}
                                    </div>

                                    {/* VENUE CARDS */}
                                    {sortedVenues.length === 0 ? (
                                        <div className="hg-empty">
                                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                                                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                                <polyline points="9 22 9 12 15 12 15 22" />
                                            </svg>
                                            <p>No Home Games Found</p>
                                            <p style={{ fontSize: 13, opacity: 0.5, marginTop: 4 }}>Try Adjusting Your Filters Or Expanding Your Radius</p>
                                            <div style={{ marginTop: 16 }}>
                                                <HostHomeGameButton />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="hg-cards-section">
                                            <div className="hg-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', alignItems: 'stretch' }}>
                                                {displayed.map((venue, i) => (
                                                    <HomeGameCard
                                                        key={venue.id || i}
                                                        venue={venue}
                                                        isFavorited={!!favorites['venue-' + venue.id]}
                                                        onFavorite={(e) => toggleFavorite(venue.id, e, venue)}
                                                        onNavigate={() => {
                                                            // Unified routing: prefer slug, fall back to invite/club code share page
                                                            if (venue?.slug) {
                                                                router.push('/hub/home-games/' + venue.slug);
                                                            } else if (venue?.club_code) {
                                                                router.push('/home-game/' + venue.club_code);
                                                            } else if (venue?.invite_code) {
                                                                router.push('/home-game/' + venue.invite_code);
                                                            }
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            {remaining > 0 && (
                                                <div className="hg-load-more">
                                                    <button className="hg-load-more-btn" onClick={() => setDisplayCount(prev => prev + PAGE_SIZE)}>
                                                        Show More ({remaining} Remaining)
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ═══ RED PIN + YOUR LOCATION — BOTTOM ═══ */}
                <div className="hg-location-footer">
                    <div className="hg-red-pin">
                        <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 26 16 26s16-14 16-26C32 7.164 24.836 0 16 0z" fill="#ef4444"/>
                            <circle cx="16" cy="16" r="7" fill="#fff"/>
                            <circle cx="16" cy="16" r="4" fill="#ef4444"/>
                            {/* Glow effect */}
                            <circle cx="16" cy="16" r="10" fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.4">
                                <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite"/>
                                <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
                            </circle>
                        </svg>
                    </div>
                    <div className="hg-location-text">YOUR LOCATION</div>
                    {gpsLocationLabel && (
                        <div className="hg-location-city">{gpsLocationLabel}</div>
                    )}
                </div>

                {/* ═══ SMART LOCATION ENABLE MODAL ═══ */}
                <LocationEnableModal
                    isOpen={showLocationModal}
                    onClose={() => setShowLocationModal(false)}
                    onRetry={() => { setShowLocationModal(false); requestGpsLocation(); }}
                />

                <style>{`
                    .hg-page {
                        min-height: 100vh;
                        padding-bottom: 70px;
                        display: flex;
                        flex-direction: column;
                        position: relative;
                        color: #fff;
                        font-family: 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                    }

                    /* ═══ PAGE TITLE — WHITE ═══ */
                    .hg-title-bar {
                        text-align: center;
                        padding: clamp(12px, 2vh, 28px) 20px clamp(8px, 1.5vh, 18px);
                        position: relative;
                        flex-shrink: 0;
                    }
                    .hg-title {
                        font-size: clamp(22px, 3.5vw, 36px);
                        font-weight: 900;
                        letter-spacing: clamp(1.5px, 0.3vw, 3px);
                        margin: 0;
                        color: #ffffff;
                        text-shadow: 0 0 30px rgba(255,255,255,0.15), 0 2px 4px rgba(0,0,0,0.5);
                    }
                    .hg-subtitle {
                        margin: clamp(3px, 0.5vh, 6px) 0 0;
                        font-size: clamp(11px, 1.2vw, 14px);
                        color: rgba(148,163,184,0.6);
                        letter-spacing: 1px;
                        font-weight: 500;
                    }

                    /* ═══ LAYOUT ═══ */
                    .hg-layout {
                        display: flex;
                        width: 100%;
                        max-width: 1600px;
                        margin: 0 auto;
                        min-height: calc(100vh - 160px);
                        gap: 0;
                    }

                    /* ═══ SIDEBAR ═══ */
                    .hg-sidebar {
                        width: clamp(130px, 12vw, 175px);
                        min-width: clamp(130px, 12vw, 175px);
                        flex-shrink: 0;
                        background: linear-gradient(180deg, rgba(12,20,35,0.97) 0%, rgba(8,14,26,0.99) 100%);
                        border-right: 2px solid rgba(148,163,184,0.12);
                        padding: 6px 0;
                        position: sticky;
                        top: 64px;
                        height: calc(100vh - 64px);
                        overflow-y: auto;
                        overflow-x: hidden;
                        z-index: 50;
                        box-shadow: 4px 0 24px rgba(0,0,0,0.3);
                        scrollbar-width: thin;
                        scrollbar-color: rgba(239,68,68,0.3) transparent;
                    }
                    .hg-sidebar::-webkit-scrollbar { width: 4px; }
                    .hg-sidebar::-webkit-scrollbar-thumb { background: rgba(239,68,68,0.25); border-radius: 2px; }

                    .hg-sidebar-filters {
                        padding: 8px 8px;
                    }

                    .hg-section-title {
                        font-size: 11px;
                        font-weight: 800;
                        text-transform: uppercase;
                        letter-spacing: 1.5px;
                        color: rgba(148,163,184,0.4);
                        margin-bottom: 10px;
                        margin-top: 6px;
                        padding: 0 4px;
                    }

                    .hg-gps-btn {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        width: 100%;
                        padding: 10px 12px;
                        background: linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(200,50,50,0.08) 100%);
                        border: 1.5px solid rgba(239,68,68,0.35);
                        border-radius: 10px;
                        color: #ef4444;
                        font-size: 13px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.3s;
                        margin-bottom: 10px;
                        letter-spacing: 0.4px;
                        animation: hgGlow 2.5s ease-in-out infinite;
                        box-shadow: 0 0 12px rgba(239,68,68,0.15);
                    }
                    @keyframes hgGlow {
                        0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.25); }
                        50% { box-shadow: 0 0 20px rgba(239,68,68,0.3), 0 0 40px rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.5); }
                    }
                    .hg-gps-btn:hover {
                        background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(200,50,50,0.15) 100%);
                        border-color: rgba(239,68,68,0.5);
                        color: #ff6b6b;
                        transform: translateY(-1px);
                    }

                    .hg-gps-label {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 8px;
                        background: rgba(34,197,94,0.06);
                        border: 1px solid rgba(34,197,94,0.2);
                        border-radius: 8px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.8);
                        margin-bottom: 10px;
                    }
                    .hg-gps-pulse {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: #4ade80;
                        flex-shrink: 0;
                        animation: gpsPulse 2s ease-in-out infinite;
                    }
                    @keyframes gpsPulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
                        50% { box-shadow: 0 0 0 4px rgba(74,222,128,0); }
                    }
                    .hg-gps-clear {
                        margin-left: auto;
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.3);
                        font-size: 18px;
                        cursor: pointer;
                        line-height: 1;
                        padding: 0;
                    }
                    .hg-gps-clear:hover { color: #ef4444; }

                    .hg-search-form {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 10px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 8px;
                        padding: 0 10px;
                        transition: border-color 0.2s;
                    }
                    .hg-search-form:focus-within {
                        border-color: rgba(239,68,68,0.4);
                    }
                    .hg-search-icon {
                        flex-shrink: 0;
                        color: rgba(148,163,184,0.45);
                    }
                    .hg-search-input {
                        flex: 1;
                        padding: 8px 0;
                        background: transparent;
                        border: none;
                        color: #e2e8f0;
                        font-size: 13px;
                        font-family: inherit;
                        outline: none;
                        min-width: 0;
                    }
                    .hg-search-input::placeholder { color: rgba(148,163,184,0.35); }

                    .hg-filter-group {
                        margin-bottom: 10px;
                    }
                    .hg-filter-group label {
                        display: block;
                        font-size: 11px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.5);
                        margin-bottom: 4px;
                        padding: 0 2px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .hg-select {
                        width: 100%;
                        padding: 7px 8px;
                        background: rgba(0,0,0,0.35);
                        border: 1.5px solid rgba(148,163,184,0.15);
                        border-radius: 6px;
                        color: #e2e8f0;
                        font-size: 12px;
                        font-family: inherit;
                        cursor: pointer;
                        appearance: auto;
                    }
                    .hg-select:focus {
                        border-color: rgba(239,68,68,0.4);
                        outline: none;
                    }

                    .hg-host-btn {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        width: 100%;
                        padding: 10px 12px;
                        margin-top: 14px;
                        background: linear-gradient(135deg, #ef4444, #dc2626);
                        border: none;
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        font-weight: 800;
                        letter-spacing: 0.5px;
                        cursor: pointer;
                        transition: all 0.2s;
                        box-shadow: 0 2px 12px rgba(239,68,68,0.25);
                    }
                    .hg-host-btn:hover {
                        transform: translateY(-1px);
                        box-shadow: 0 4px 18px rgba(239,68,68,0.4);
                    }

                    /* ═══ MAIN CONTENT ═══ */
                    .hg-main {
                        flex: 1;
                        min-width: 0;
                        padding: 0 clamp(10px, 1.5vw, 20px) 20px;
                    }
                    .hg-content {
                        padding: 0;
                        max-width: 100%;
                        margin: 0;
                        width: 100%;
                    }

                    /* ═══ MAP ═══ */
                    .hg-map-card {
                        position: relative;
                        border-radius: 14px;
                        overflow: hidden;
                        background: linear-gradient(160deg, rgba(16,24,36,0.95) 0%, rgba(10,16,26,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.16);
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.4);
                        margin-bottom: 2px;
                        height: clamp(320px, 48dvh, 640px);
                        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    .hg-map-card.hg-map-fullscreen {
                        position: fixed;
                        inset: 0;
                        z-index: 99990;
                        border-radius: 0;
                        border: none;
                        margin: 0;
                        min-height: 100vh;
                        height: 100vh;
                    }
                    .hg-map-card.hg-map-fullscreen .leaflet-container,
                    .hg-map-card.hg-map-fullscreen > div:last-child {
                        height: 100vh !important;
                        min-height: 100vh !important;
                        pointer-events: auto;
                    }
                    .hg-map-card:not(.hg-map-fullscreen) .leaflet-container,
                    .hg-map-card:not(.hg-map-fullscreen) > div:last-child {
                        height: 100% !important;
                        min-height: 100% !important;
                        pointer-events: none;
                    }
                    .hg-map-collapse {
                        position: absolute;
                        top: 12px;
                        right: 12px;
                        z-index: 99991;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        background: rgba(10,10,21,0.88);
                        backdrop-filter: blur(8px);
                        border: 1px solid rgba(239,68,68,0.4);
                        border-radius: 8px;
                        color: #ef4444;
                        font-size: 12px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.3s;
                        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                    }
                    .hg-map-collapse:hover {
                        background: rgba(239,68,68,0.15);
                        border-color: rgba(239,68,68,0.6);
                    }

                    /* ═══ RESULTS BAR — Matches Poker Near Me ═══ */
                    .hg-results-bar {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 8px 4px;
                        margin-bottom: 2px;
                        flex-wrap: wrap;
                        gap: 16px;
                    }
                    .hg-results-count {
                        font-size: 15px;
                        color: rgba(255,255,255,0.6);
                        font-weight: 600;
                    }
                    .hg-sort-wrapper {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }
                    .hg-sort-label {
                        font-size: 12px;
                        color: rgba(148,163,184,0.6);
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        white-space: nowrap;
                    }
                    .hg-sort-select {
                        padding: 5px 28px 5px 10px;
                        border-radius: 8px;
                        border: 1px solid rgba(212,168,83,0.25);
                        background: rgba(10,16,28,0.8);
                        color: #d4a853;
                        font-size: 12px;
                        font-weight: 600;
                        font-family: inherit;
                        cursor: pointer;
                        appearance: none;
                        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23d4a853' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                        background-repeat: no-repeat;
                        background-position: right 8px center;
                        transition: all 0.2s;
                    }
                    .hg-sort-select:hover,
                    .hg-sort-select:focus {
                        border-color: rgba(212,168,83,0.5);
                        outline: none;
                        box-shadow: 0 0 8px rgba(212,168,83,0.15);
                    }
                    .hg-expand-map-btn {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        padding: 5px 12px;
                        background: rgba(212,168,83,0.08);
                        border: 1px solid rgba(212,168,83,0.25);
                        border-radius: 8px;
                        color: #d4a853;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                        font-family: inherit;
                        white-space: nowrap;
                    }
                    .hg-expand-map-btn:hover {
                        background: rgba(212,168,83,0.16);
                        border-color: rgba(212,168,83,0.4);
                        box-shadow: 0 0 10px rgba(212,168,83,0.15);
                    }

                    /* ═══ CARD GRID ═══ */
                    .hg-cards-section {
                        margin-top: 2px;
                    }
                    .hg-card-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 16px;
                        align-items: stretch;
                    }

                    /* ═══ PREMIUM VENUE CARD — Vault-V3 Metal Frame (matched to PNM) ═══ */
                    .vc3-card {
                        position: relative;
                        overflow: hidden;
                        background: linear-gradient(160deg, rgba(16,24,36,0.95) 0%, rgba(10,16,26,0.98) 100%);
                        border: 2px solid rgba(148,163,184,0.16);
                        border-radius: 14px;
                        padding: 16px 18px 14px;
                        transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            inset 0 -1px 0 rgba(0,0,0,0.3),
                            inset 0 0 20px rgba(148,163,184,0.04),
                            0 4px 20px rgba(0,0,0,0.45),
                            0 1px 3px rgba(0,0,0,0.2);
                    }
                    .vc3-card::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 1px;
                        background: linear-gradient(90deg, transparent 5%, rgba(148,163,184,0.25) 30%, rgba(148,163,184,0.15) 70%, transparent 95%);
                        pointer-events: none;
                    }
                    .vc3-card:hover {
                        filter: brightness(1.08);
                        background: linear-gradient(160deg, rgba(18,28,42,0.97) 0%, rgba(12,20,32,0.99) 100%);
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.08),
                            inset 0 0 20px rgba(212,168,83,0.03),
                            0 8px 32px rgba(0,0,0,0.55),
                            0 0 0 1px rgba(255,255,255,0.06);
                        transform: translateY(-2px);
                    }
                    .vc3-header {
                        display: flex;
                        align-items: flex-start;
                        justify-content: space-between;
                        gap: 8px;
                        margin-bottom: 8px;
                    }
                    .vc3-type-label {
                        font-size: 12px;
                        font-weight: 500;
                        letter-spacing: 0.2px;
                    }
                    .vc3-right-stack {
                        display: flex;
                        flex-direction: column;
                        align-items: flex-end;
                        gap: 4px;
                        flex-shrink: 0;
                    }
                    .vc3-name {
                        font-size: 16px;
                        font-weight: 800;
                        margin: 0;
                        color: #e8ecf0;
                        line-height: 1.25;
                        letter-spacing: -0.15px;
                    }
                    .vc3-address {
                        display: flex;
                        align-items: flex-start;
                        gap: 5px;
                        font-size: 12.5px;
                        color: rgba(255,255,255,0.48);
                        margin: 0 0 8px;
                        line-height: 1.35;
                    }
                    .vc3-address span {
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .vc3-host {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        margin: 2px 0 4px;
                    }
                    .vc3-host-name { font-size: 12px; color: #58a6ff; font-weight: 600; }
                    .vc3-host-link { font-size: 11px; color: #3fb950; text-decoration: underline; margin-left: 2px; }
                    .vc3-description { font-size: 12px; color: rgba(255,255,255,0.4); margin: 0 0 6px; line-height: 1.4; font-style: italic; }
                    .vc3-badges {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-bottom: 8px;
                    }
                    .vc3-badge {
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.4px;
                        border: 1px solid transparent;
                    }
                    .vc3-data-zone {
                        margin-bottom: 4px;
                    }
                    .vc3-games {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 5px;
                        margin-bottom: 6px;
                    }
                    .vc3-game-chip {
                        padding: 3px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        border: 1px solid;
                        white-space: nowrap;
                    }
                    .vc3-stakes {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                        color: rgba(212,168,83,0.8);
                        font-weight: 600;
                        margin: 0 0 6px;
                    }
                    .vc3-hours {
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        font-size: 12px;
                        color: rgba(255,255,255,0.42);
                        margin: 0 0 6px;
                    }
                    /* Trust score — Illuminated Gauge (metal glow) */
                    .vc3-trust {
                        padding: 8px 0 6px;
                        border-top: 1px solid rgba(148,163,184,0.08);
                        margin-top: 4px;
                    }
                    .vc3-trust-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 5px;
                    }
                    .vc3-trust-label { font-size: 11px; font-weight: 700; }
                    .vc3-trust-val { font-size: 11px; font-weight: 800; }
                    .vc3-trust-track {
                        height: 6px;
                        background: rgba(148,163,184,0.08);
                        border-radius: 3px;
                        overflow: hidden;
                        box-shadow:
                            inset 0 1px 2px rgba(0,0,0,0.4),
                            0 0 0 1px rgba(148,163,184,0.06);
                    }
                    .vc3-trust-fill {
                        height: 100%;
                        border-radius: 3px;
                        transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 0 8px currentColor;
                        position: relative;
                    }
                    .vc3-trust-fill::after {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 2px;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                        border-radius: 3px;
                    }
                    /* Action bar — Metal-framed buttons */
                    .vc3-actions {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 8px;
                        padding-top: 10px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        margin-top: auto;
                    }
                    .vc3-actions-secondary { display: flex; gap: 5px; }
                    .vc3-actions-primary { display: flex !important; gap: 6px; flex: 1; justify-content: flex-end; flex-wrap: nowrap; }
                    .vc3-icon-btn {
                        display: flex; align-items: center; justify-content: center;
                        width: 34px; height: 34px; border-radius: 8px;
                        border: 1.5px solid rgba(148,163,184,0.12);
                        background: linear-gradient(180deg, rgba(25,35,55,0.8) 0%, rgba(15,23,42,0.9) 100%);
                        color: rgba(148,163,184,0.5);
                        text-decoration: none; cursor: pointer;
                        transition: all 0.25s;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.04),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .vc3-icon-btn:hover {
                        background: linear-gradient(180deg, rgba(30,42,65,0.9) 0%, rgba(20,30,48,0.95) 100%);
                        border-color: rgba(148,163,184,0.25);
                        color: #e2e8f0;
                        transform: translateY(-1px);
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            0 4px 8px rgba(0,0,0,0.35);
                    }
                    .vc3-pill {
                        display: inline-flex !important; align-items: center; gap: 5px;
                        padding: 8px 12px; border-radius: 8px;
                        font-size: 11.5px; font-weight: 700;
                        cursor: pointer; border: 1.5px solid transparent;
                        transition: all 0.25s; font-family: inherit;
                        white-space: nowrap; line-height: 1;
                        box-shadow:
                            inset 0 1px 0 rgba(255,255,255,0.06),
                            0 2px 4px rgba(0,0,0,0.25);
                    }
                    .vc3-pill span { font-size: 11px; }
                    .vc3-pill-checkin {
                        background: linear-gradient(180deg, rgba(34,197,94,0.18) 0%, rgba(34,197,94,0.1) 100%);
                        color: #4ade80;
                        border-color: rgba(34,197,94,0.25);
                    }
                    .vc3-pill-checkin:hover {
                        background: linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(34,197,94,0.18) 100%);
                        box-shadow: 0 0 12px rgba(34,197,94,0.15), inset 0 1px 0 rgba(34,197,94,0.2);
                    }
                    .vc3-pill-review {
                        background: linear-gradient(180deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.1) 100%);
                        color: #60a5fa;
                        border-color: rgba(59,130,246,0.25);
                    }
                    .vc3-pill-review:hover {
                        background: linear-gradient(180deg, rgba(59,130,246,0.28) 0%, rgba(59,130,246,0.18) 100%);
                        box-shadow: 0 0 12px rgba(59,130,246,0.15), inset 0 1px 0 rgba(59,130,246,0.2);
                    }
                    .vc3-pill-details {
                        background: linear-gradient(180deg, rgba(212,168,83,0.18) 0%, rgba(212,168,83,0.1) 100%);
                        color: #d4a853;
                        border-color: rgba(212,168,83,0.25);
                    }
                    .vc3-pill-details:hover {
                        background: linear-gradient(180deg, rgba(212,168,83,0.28) 0%, rgba(212,168,83,0.18) 100%);
                        box-shadow: 0 0 12px rgba(212,168,83,0.15), inset 0 1px 0 rgba(212,168,83,0.2);
                    }
                    .vc3-fav {
                        background: none;
                        border: none;
                        padding: 4px;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }
                    .vc3-fav:hover { transform: scale(1.15); }
                    .vc3-fav.active svg { filter: drop-shadow(0 0 6px rgba(239,68,68,0.5)); }
                    .vc3-distance {
                        display: inline-flex;
                        align-items: center;
                        gap: 3px;
                        padding: 3px 8px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 12px;
                        font-size: 10.5px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.6);
                        white-space: nowrap;
                    }
                    .vc3-hours-compact {
                        font-size: 11px;
                        color: rgba(255,255,255,0.4);
                        font-weight: 500;
                        white-space: nowrap;
                    }

                    .hg-load-more {
                        text-align: center;
                        padding: 20px 0;
                    }
                    .hg-load-more-btn {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 28px;
                        background: linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(200,50,50,0.08) 100%);
                        border: 2px solid rgba(239,68,68,0.35);
                        border-radius: 10px;
                        color: #ef4444;
                        font-size: 14px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .hg-load-more-btn:hover {
                        background: linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(200,50,50,0.15) 100%);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 16px rgba(239,68,68,0.2);
                    }

                    /* ═══ EMPTY / LOADING ═══ */
                    .hg-empty {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 60px 20px;
                        color: rgba(148,163,184,0.6);
                        text-align: center;
                        background: linear-gradient(160deg, rgba(15,23,42,0.5) 0%, rgba(8,14,25,0.7) 100%);
                        border: 1.5px solid rgba(148,163,184,0.1);
                        border-radius: 16px;
                        box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.3);
                        margin: 8px 0;
                    }
                    .hg-empty p:first-of-type {
                        font-size: 18px;
                        font-weight: 700;
                        color: rgba(255,255,255,0.6);
                        margin-top: 12px;
                    }
                    .hg-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 80px 20px;
                        color: rgba(148,163,184,0.6);
                    }
                    .hg-spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(239,68,68,0.15);
                        border-top: 3px solid #ef4444;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }

                    /* ═══ RED PIN + YOUR LOCATION FOOTER ═══ */
                    .hg-location-footer {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 24px 20px 36px;
                        position: relative;
                    }
                    .hg-red-pin {
                        position: relative;
                        animation: pinBounce 2s ease-in-out infinite;
                        filter: drop-shadow(0 4px 12px rgba(239,68,68,0.4));
                    }
                    @keyframes pinBounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-6px); }
                    }
                    .hg-location-text {
                        margin-top: 8px;
                        font-size: 13px;
                        font-weight: 800;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        color: #ef4444;
                        text-shadow: 0 0 20px rgba(239,68,68,0.3);
                    }
                    .hg-location-city {
                        margin-top: 4px;
                        font-size: 12px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.5);
                        letter-spacing: 0.5px;
                    }

                    /* ═══ SPACE BG (shared with PNM) ═══ */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.06) 0%, transparent 60%),
                            linear-gradient(180deg, #020408 0%, #0a1628 30%, #0d1b2a 50%, #0a1628 70%, #020408 100%);
                        z-index: -2;
                    }
                    .space-bg::before {
                        content: '';
                        position: absolute;
                        inset: 0;
                        background-image:
                            repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px),
                            repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(148,163,184,0.04) 39px, rgba(148,163,184,0.04) 40px);
                        background-size: 40px 40px;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.05) 0%, transparent 50%),
                            linear-gradient(180deg, rgba(3,7,18,0.4) 0%, transparent 15%, transparent 85%, rgba(3,7,18,0.6) 100%);
                        z-index: -1;
                    }

                    /* ═══ MOBILE RESPONSIVE ═══ */
                    @media (max-width: 768px) {
                        .hg-title-bar {
                            padding: clamp(6px, 1.5vh, 14px) 14px clamp(4px, 1vh, 10px);
                        }
                        .hg-title {
                            font-size: clamp(20px, 5.5vw, 28px);
                            letter-spacing: clamp(1px, 0.4vw, 2px);
                        }
                        .hg-subtitle {
                            font-size: clamp(10px, 2.5vw, 13px);
                        }
                        .hg-layout {
                            flex-direction: column;
                        }
                        .hg-sidebar {
                            width: 100%;
                            min-width: 100%;
                            height: auto;
                            flex-shrink: 0;
                            max-height: none;
                            border-right: none;
                            border-bottom: 2px solid rgba(148,163,184,0.12);
                            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
                            padding: 6px 0 8px;
                            position: sticky;
                            top: 56px;
                            z-index: 100;
                        }
                        .hg-sidebar-filters {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 6px;
                            padding: 6px 10px;
                            align-items: flex-start;
                        }
                        .hg-section-title { width: 100%; margin-bottom: 4px; }
                        .hg-search-form {
                            flex: 1;
                            min-width: 160px;
                            margin-bottom: 0;
                        }
                        .hg-gps-btn { min-width: 110px; flex: 0; margin-bottom: 0; }
                        .hg-gps-label { width: 100%; }
                        .hg-filter-group { margin-bottom: 0; }
                        .hg-select { font-size: 12px; padding: 6px 8px; }
                        .hg-host-btn { margin-top: 4px; min-width: 0; }
                        .hg-main { padding: 0 10px 40px; }
                        .hg-card-grid {
                            grid-template-columns: 1fr !important;
                        }
                        .hg-map-card:not(.hg-map-fullscreen) {
                            height: clamp(140px, 25dvh, 260px);
                            border-radius: 10px;
                        }
                    }
                `}</style>
            </div>
        </>
    );
}
