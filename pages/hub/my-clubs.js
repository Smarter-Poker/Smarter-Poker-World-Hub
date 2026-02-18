/**
 * MY CLUBS — Followed Venues & Clubs Dashboard
 * Quick access to waitlists, live games, and club info for
 * both Club Arena clubs and real-world poker venues.
 *
 * Data sources:
 * - page_followers (Supabase via /api/poker/follow)
 * - poker_venues (Supabase via /api/poker/venues)
 * - Commander waitlist API
 * - localStorage fallback for anonymous users
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { getAuthUser } from '../../src/lib/authUtils';
import { supabase } from '../../src/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — Facebook Dark palette
// ─────────────────────────────────────────────────────────────────────────────
const C = {
    bg: '#18191a',
    surface: '#242526',
    elevated: '#3a3b3c',
    highlight: '#4e4f50',
    text: '#e4e6eb',
    textSec: '#b0b3b8',
    textMuted: '#65676b',
    blue: '#2374e1',
    blueDim: 'rgba(35, 116, 225, 0.12)',
    blueBorder: 'rgba(35, 116, 225, 0.3)',
    green: '#31a24c',
    red: '#f02849',
    cyan: '#00bfff',
};

// ─────────────────────────────────────────────────────────────────────────────
// VENUE TYPE LABELS & COLORS
// ─────────────────────────────────────────────────────────────────────────────
const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity',
};

const VENUE_TYPE_COLORS = {
    casino: { bg: 'rgba(35, 116, 225, 0.15)', border: '#2374e1', text: '#2374e1' },
    card_room: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', text: '#3b82f6' },
    poker_club: { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', text: '#8b5cf6' },
    home_game: { bg: 'rgba(49, 162, 76, 0.15)', border: '#31a24c', text: '#31a24c' },
    charity: { bg: 'rgba(236, 72, 153, 0.15)', border: '#ec4899', text: '#ec4899' },
};

// ─────────────────────────────────────────────────────────────────────────────
// PAGE TYPE COLORS (for tours, series, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_TYPE_STYLES = {
    tour: { bg: 'rgba(0, 191, 255, 0.15)', border: '#00bfff', text: '#00bfff', label: 'Tour', icon: '🌐' },
    series: { bg: 'rgba(245, 158, 11, 0.15)', border: '#f59e0b', text: '#f59e0b', label: 'Series', icon: '📅' },
};

// ─────────────────────────────────────────────────────────────────────────────
// VENUE TYPE BADGE
// ─────────────────────────────────────────────────────────────────────────────
function VenueTypeBadge({ type }) {
    const label = VENUE_TYPE_LABELS[type] || type || 'Venue';
    const colors = VENUE_TYPE_COLORS[type] || { bg: 'rgba(255,255,255,0.08)', border: '#65676b', text: '#b0b3b8' };
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: 16,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
        }}>
            {label}
        </span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLUB ARENA CARD — Club Arena membership card
// ─────────────────────────────────────────────────────────────────────────────
function ClubArenaCard({ club, onNavigate }) {
    const [hovering, setHovering] = useState(false);
    return (
        <div
            onClick={() => onNavigate(club.club_id)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                background: hovering ? C.elevated : C.surface,
                border: `1px solid ${hovering ? 'rgba(139, 92, 246, 0.4)' : C.elevated}`,
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: '#fff', fontWeight: 700,
                    }}>
                        {club.name?.[0]?.toUpperCase() || '♠'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 16, fontWeight: 700, color: C.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {club.name}
                        </div>
                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                            Club Arena · {club.userRole === 'owner' ? 'Owner' : club.userRole === 'admin' ? 'Admin' : 'Member'}
                        </div>
                    </div>
                </div>
                <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 16,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid #8b5cf6',
                    color: '#8b5cf6',
                }}>
                    Club Arena
                </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                    Code: {club.club_id || '—'}
                </div>
                <div style={{
                    padding: '6px 14px', borderRadius: 8,
                    background: 'rgba(139, 92, 246, 0.12)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: '#8b5cf6', fontSize: 12, fontWeight: 600,
                }}>
                    Open Lobby →
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOWED PAGE CARD — Generic card for followed tours & series
// ─────────────────────────────────────────────────────────────────────────────
function FollowedPageCard({ page, onNavigate, onUnfollow }) {
    const [hovering, setHovering] = useState(false);
    const style = PAGE_TYPE_STYLES[page.page_type] || PAGE_TYPE_STYLES.tour;
    const detailUrl = page.page_type === 'tour'
        ? `/hub/tours/${page.page_id}`
        : `/hub/series/${page.page_id}`;

    return (
        <div
            onClick={() => onNavigate(detailUrl)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                background: hovering ? C.elevated : C.surface,
                border: `1px solid ${hovering ? C.highlight : C.elevated}`,
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 16, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {page.name}
                    </div>
                    {page.subtitle && (
                        <div style={{ fontSize: 13, color: C.textSec, marginTop: 3 }}>
                            {page.subtitle}
                        </div>
                    )}
                </div>
                <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 16,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    color: style.text,
                }}>
                    {style.label}
                </span>
            </div>

            {/* Series date range */}
            {page.page_type === 'series' && page.start_date && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{
                        padding: '4px 10px', borderRadius: 8,
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        fontSize: 12, fontWeight: 600, color: '#f59e0b',
                    }}>
                        {new Date(page.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {page.end_date && ` – ${new Date(page.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                    {page.total_events && (
                        <div style={{
                            padding: '4px 10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.04)',
                            border: `1px solid ${C.elevated}`,
                            fontSize: 12, color: C.textSec,
                        }}>
                            {page.total_events} Events
                        </div>
                    )}
                </div>
            )}

            {/* Tour metadata */}
            {page.page_type === 'tour' && page.category && (
                <div style={{ fontSize: 12, color: C.textMuted }}>
                    {page.category}{page.established ? ` · Est. ${page.established}` : ''}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                    {page.page_type === 'series' ? '📅 View Schedule' : '🌐 View Details'}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onUnfollow(page.page_type, page.page_id); }}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: `1px solid ${C.elevated}`,
                        background: C.elevated,
                        color: C.textSec,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                >
                    ✓ Following
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLUB CARD — Individual followed venue/club card
// ─────────────────────────────────────────────────────────────────────────────
function ClubCard({ venue, liveGameCount, waitlistCount, isFollowed, onToggleFollow, onNavigate }) {
    const [hovering, setHovering] = useState(false);

    const locationStr = [venue.city, venue.state].filter(Boolean).join(', ');
    const hasLiveData = liveGameCount > 0 || waitlistCount > 0;

    return (
        <div
            onClick={() => onNavigate(venue.id)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                background: hovering ? C.elevated : C.surface,
                border: `1px solid ${hovering ? C.highlight : C.elevated}`,
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
            }}
        >
            {/* Top row: Name + Type */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 16, fontWeight: 700, color: C.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {venue.name}
                    </div>
                    {locationStr && (
                        <div style={{ fontSize: 13, color: C.textSec, marginTop: 3 }}>
                            {locationStr}
                        </div>
                    )}
                </div>
                <VenueTypeBadge type={venue.venue_type} />
            </div>

            {/* Live data indicators */}
            {hasLiveData && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {liveGameCount > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 8,
                            background: 'rgba(49, 162, 76, 0.12)',
                            border: '1px solid rgba(49, 162, 76, 0.25)',
                        }}>
                            <div style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: C.green,
                                boxShadow: '0 0 6px rgba(49, 162, 76, 0.6)',
                                animation: 'pulse 2s infinite',
                            }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.green }}>
                                {liveGameCount} Live {liveGameCount === 1 ? 'Game' : 'Games'}
                            </span>
                        </div>
                    )}
                    {waitlistCount > 0 && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px', borderRadius: 8,
                            background: C.blueDim,
                            border: `1px solid ${C.blueBorder}`,
                        }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
                                {waitlistCount} On Waitlist
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom row: Follow button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                    {venue.phone || venue.website ? '📍 Tap To View Details' : '📍 View Details'}
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFollow(venue.id); }}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: isFollowed
                            ? `1px solid ${C.elevated}`
                            : `1px solid ${C.blueBorder}`,
                        background: isFollowed
                            ? C.elevated
                            : C.blueDim,
                        color: isFollowed ? C.textSec : C.blue,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                    }}
                >
                    {isFollowed ? '✓ Following' : '+ Follow'}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH RESULT CARD — Compact venue card for search results
// ─────────────────────────────────────────────────────────────────────────────
function SearchResultCard({ venue, isFollowed, onToggleFollow, onNavigate }) {
    return (
        <div
            onClick={() => onNavigate(venue.id)}
            style={{
                background: C.surface,
                border: `1px solid ${C.elevated}`,
                borderRadius: 10,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
        >
            <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.blue}, #1a5cc7)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                fontSize: 18,
            }}>
                {venue.venue_type === 'casino' ? '🏛️' :
                    venue.venue_type === 'home_game' ? '🏠' :
                        venue.venue_type === 'poker_club' ? '♠️' : '🃏'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 15, fontWeight: 600, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {venue.name}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {[venue.city, venue.state].filter(Boolean).join(', ')}
                    {venue.venue_type && ` · ${VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}`}
                </div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onToggleFollow(venue.id); }}
                style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: isFollowed
                        ? `1px solid ${C.elevated}`
                        : `1px solid ${C.blueBorder}`,
                    background: isFollowed
                        ? C.elevated
                        : C.blueDim,
                    color: isFollowed ? C.textSec : C.blue,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flexShrink: 0,
                }}
            >
                {isFollowed ? '✓ Following' : '+ Follow'}
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────
function EmptyState({ onSearchFocus }) {
    return (
        <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: C.surface,
            border: `1px solid ${C.elevated}`,
            borderRadius: 12,
        }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🃏</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                No Clubs Yet
            </div>
            <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 24px' }}>
                Follow your favorite poker venues, casinos, and clubs to get quick access to live games, waitlists, and more.
            </div>
            <button
                onClick={onSearchFocus}
                style={{
                    padding: '12px 28px',
                    borderRadius: 10,
                    border: 'none',
                    background: C.blue,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                Discover Clubs & Venues
            </button>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function MyClubsPage() {
    const router = useRouter();
    const searchInputRef = useRef(null);

    // Auth
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Followed clubs data
    const [followedVenues, setFollowedVenues] = useState([]);
    const [followedTours, setFollowedTours] = useState([]);
    const [followedSeries, setFollowedSeries] = useState([]);
    const [arenaClubs, setArenaClubs] = useState([]);
    const [followedIds, setFollowedIds] = useState(new Set());
    const [followedPageKeys, setFollowedPageKeys] = useState(new Set());

    // Live data maps: venueId → count
    const [liveGamesMap, setLiveGamesMap] = useState({});
    const [waitlistMap, setWaitlistMap] = useState({});

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Active tab
    const [activeTab, setActiveTab] = useState('my-clubs'); // 'my-clubs' | 'discover'

    // ═══════════════════════════════════════════════════════════════════════
    // HELPER — Get user ID (authenticated or anonymous)
    // ═══════════════════════════════════════════════════════════════════════
    const getUserId = useCallback(() => {
        if (user?.id) return user.id;
        try {
            var uid = localStorage.getItem('sp-anon-uid');
            if (!uid) {
                uid = 'anon-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                localStorage.setItem('sp-anon-uid', uid);
            }
            return uid;
        } catch {
            return 'anon-fallback';
        }
    }, [user]);

    // ═══════════════════════════════════════════════════════════════════════
    // LOAD FOLLOWED VENUES
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);

            // Get auth user
            const authUser = getAuthUser();
            if (authUser) setUser(authUser);

            const userId = authUser?.id || (() => {
                try {
                    return localStorage.getItem('sp-anon-uid') || '';
                } catch { return ''; }
            })();

            // Get all follows from API
            let venueIds = [];
            let tourIds = [];
            let seriesIds = [];
            const allPageKeys = new Set();
            if (userId) {
                try {
                    const res = await fetch(`/api/poker/follow?user_id=${userId}`);
                    const json = await res.json();
                    if (json.success && json.data) {
                        json.data.forEach(f => {
                            allPageKeys.add(`${f.page_type}:${f.page_id}`);
                            if (f.page_type === 'venue') venueIds.push(f.page_id);
                            else if (f.page_type === 'tour') tourIds.push(f.page_id);
                            else if (f.page_type === 'series') seriesIds.push(f.page_id);
                        });
                    }
                } catch (e) {
                    console.warn('[MyClubs] Failed to fetch follows from API:', e);
                }
            }

            // Merge with localStorage follows
            try {
                const stored = localStorage.getItem('followed-venues');
                if (stored) {
                    const localIds = JSON.parse(stored);
                    localIds.forEach(id => {
                        if (!venueIds.includes(String(id))) venueIds.push(String(id));
                    });
                }
            } catch { }

            setFollowedIds(new Set(venueIds));
            setFollowedPageKeys(allPageKeys);

            // Fetch venue details individually (API supports ?id=X single lookups)
            if (venueIds.length > 0) {
                {
                    const venues = [];
                    const results = await Promise.allSettled(
                        venueIds.slice(0, 30).map(async (vid) => {
                            const res = await fetch(`/api/poker/venues?id=${vid}`);
                            const json = await res.json();
                            if (json.success && json.data) {
                                return Array.isArray(json.data) ? json.data[0] : json.data;
                            }
                            return null;
                        })
                    );
                    results.forEach(r => {
                        if (r.status === 'fulfilled' && r.value) venues.push(r.value);
                    });
                    setFollowedVenues(venues);
                }

                // Fetch live game counts for each venue (fire-and-forget)
                const gameMap = {};
                const wlMap = {};
                await Promise.allSettled(venueIds.map(async (vid) => {
                    try {
                        const res = await fetch(`/api/poker/live-games?venue_id=${vid}`);
                        const json = await res.json();
                        if (json.success) {
                            const games = json.games || json.data || [];
                            gameMap[vid] = Array.isArray(games) ? games.length : 0;
                        }
                    } catch { }
                    try {
                        const res = await fetch(`/api/commander/waitlist/venue/${vid}`);
                        const json = await res.json();
                        if (json.success && json.data && json.data.waitlists) {
                            const totalPlayers = json.data.waitlists.reduce((sum, wl) =>
                                sum + (wl.players ? wl.players.length : 0), 0);
                            wlMap[vid] = totalPlayers;
                        }
                    } catch { }
                }));
                setLiveGamesMap(gameMap);
                setWaitlistMap(wlMap);
            }

            // Fetch followed tour details
            if (tourIds.length > 0) {
                try {
                    const res = await fetch('/api/poker/pages?category=tours&followed_only=true&user_id=' + userId);
                    const json = await res.json();
                    if (json.success && json.data) {
                        setFollowedTours(json.data.filter(p => p.page_type === 'tour'));
                    }
                } catch (e) {
                    console.warn('[MyClubs] Failed to fetch followed tours:', e);
                }
            }

            // Fetch followed series details
            if (seriesIds.length > 0) {
                try {
                    const res = await fetch('/api/poker/pages?category=series&followed_only=true&user_id=' + userId);
                    const json = await res.json();
                    if (json.success && json.data) {
                        setFollowedSeries(json.data.filter(p => p.page_type === 'series'));
                    }
                } catch (e) {
                    console.warn('[MyClubs] Failed to fetch followed series:', e);
                }
            }

            // Fetch Club Arena memberships (uses Supabase directly)
            if (authUser?.id) {
                try {
                    const { data: memberships } = await supabase
                        .from('club_members')
                        .select('club_id, role, clubs(*)')
                        .eq('user_id', authUser.id)
                        .eq('status', 'active');
                    if (memberships && memberships.length > 0) {
                        const clubs = memberships
                            .map(m => ({ ...m.clubs, userRole: m.role }))
                            .filter(c => c && c.name);
                        setArenaClubs(clubs);
                    }
                } catch (e) {
                    console.warn('[MyClubs] Failed to fetch Club Arena memberships:', e);
                }
            }

            setLoading(false);
        };

        loadData();
    }, []);

    // ═══════════════════════════════════════════════════════════════════════
    // SEARCH — Debounced venue search
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(searchQuery)}&limit=20`);
                const json = await res.json();
                if (json.success && json.data) {
                    setSearchResults(Array.isArray(json.data) ? json.data : [json.data]);
                }
            } catch (e) {
                console.error('[MyClubs] Search error:', e);
            }
            setIsSearching(false);
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // ═══════════════════════════════════════════════════════════════════════
    // FOLLOW / UNFOLLOW HANDLER
    // ═══════════════════════════════════════════════════════════════════════
    const handleToggleFollow = async (venueId) => {
        const vid = String(venueId);
        const isCurrentlyFollowed = followedIds.has(vid);
        const newAction = isCurrentlyFollowed ? 'unfollow' : 'follow';

        // Optimistic update
        setFollowedIds(prev => {
            const next = new Set(prev);
            if (isCurrentlyFollowed) {
                next.delete(vid);
            } else {
                next.add(vid);
            }
            return next;
        });

        if (isCurrentlyFollowed) {
            setFollowedVenues(prev => prev.filter(v => String(v.id) !== vid));
        } else {
            // If following, try to find venue in search results and add it
            const venueFromSearch = searchResults.find(v => String(v.id) === vid);
            if (venueFromSearch) {
                setFollowedVenues(prev => [venueFromSearch, ...prev]);
            }
        }

        // Update localStorage
        try {
            const stored = localStorage.getItem('followed-venues');
            let ids = stored ? JSON.parse(stored) : [];
            if (newAction === 'follow') {
                if (!ids.includes(vid)) ids.push(vid);
            } else {
                ids = ids.filter(x => x !== vid);
            }
            localStorage.setItem('followed-venues', JSON.stringify(ids));
        } catch { }

        // Persist to API
        try {
            await fetch('/api/poker/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_type: 'venue',
                    page_id: vid,
                    action: newAction,
                    user_id: getUserId(),
                }),
            });
        } catch { }
    };

    // Unfollow a tour or series
    const handlePageUnfollow = async (pageType, pageId) => {
        // Optimistic removal
        if (pageType === 'tour') {
            setFollowedTours(prev => prev.filter(t => t.page_id !== pageId));
        } else if (pageType === 'series') {
            setFollowedSeries(prev => prev.filter(s => s.page_id !== pageId));
        }
        setFollowedPageKeys(prev => {
            const next = new Set(prev);
            next.delete(`${pageType}:${pageId}`);
            return next;
        });
        // Persist to API
        try {
            await fetch('/api/poker/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_type: pageType,
                    page_id: String(pageId),
                    action: 'unfollow',
                    user_id: getUserId(),
                }),
            });
        } catch { }
    };

    // Navigate to venue detail
    const handleNavigate = (venueId) => {
        router.push(`/hub/venues/${venueId}`);
    };

    // Focus search input
    const focusSearch = () => {
        setActiveTab('discover');
        setTimeout(() => {
            searchInputRef.current?.focus();
        }, 100);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════
    return (
        <>
            <SEOHead
                title="My Clubs | Smarter.Poker"
                description="Quick access to your favorite poker clubs, casinos, and venues. View live games, waitlists, and more."
                path="/hub/my-clubs"
            />

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            ` }} />

            <div style={{
                minHeight: '100vh',
                background: C.bg,
                color: C.text,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
            }}>
                <UniversalHeader
                    title="My Clubs"
                    backHref="/hub"
                    backLabel="← Hub"
                />

                {/* Main Content Area */}
                <div style={{
                    maxWidth: 720,
                    margin: '0 auto',
                    padding: '24px 16px 80px',
                }}>
                    {/* Tab Bar */}
                    <div style={{
                        display: 'flex',
                        gap: 4,
                        marginBottom: 24,
                        background: C.surface,
                        borderRadius: 12,
                        padding: 4,
                    }}>
                        <button
                            onClick={() => setActiveTab('my-clubs')}
                            style={{
                                flex: 1,
                                padding: '10px 16px',
                                borderRadius: 10,
                                border: 'none',
                                background: activeTab === 'my-clubs' ? C.blue : 'transparent',
                                color: activeTab === 'my-clubs' ? '#fff' : C.textSec,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            My Clubs {(followedVenues.length + followedTours.length + followedSeries.length + arenaClubs.length) > 0 && `(${followedVenues.length + followedTours.length + followedSeries.length + arenaClubs.length})`}
                        </button>
                        <button
                            onClick={() => setActiveTab('discover')}
                            style={{
                                flex: 1,
                                padding: '10px 16px',
                                borderRadius: 10,
                                border: 'none',
                                background: activeTab === 'discover' ? C.blue : 'transparent',
                                color: activeTab === 'discover' ? '#fff' : C.textSec,
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Discover
                        </button>
                    </div>

                    {/* ═══════════ MY CLUBS TAB ═══════════ */}
                    {activeTab === 'my-clubs' && (
                        <>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        border: `3px solid ${C.elevated}`,
                                        borderTopColor: C.blue,
                                        animation: 'spin 0.8s linear infinite',
                                        margin: '0 auto 16px',
                                    }} />
                                    <div style={{ fontSize: 14, color: C.textSec }}>Loading Your Clubs...</div>

                                </div>
                            ) : (followedVenues.length === 0 && followedTours.length === 0 && followedSeries.length === 0 && arenaClubs.length === 0) ? (
                                <EmptyState onSearchFocus={focusSearch} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Quick stats bar */}
                                    <div style={{
                                        display: 'flex', gap: 12, marginBottom: 8,
                                        overflowX: 'auto', paddingBottom: 4,
                                    }}>
                                        <div style={{
                                            padding: '8px 16px', borderRadius: 10,
                                            background: C.surface, border: `1px solid ${C.elevated}`,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            <span style={{ fontSize: 12, color: C.textMuted }}>Following </span>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                                                {followedVenues.length + followedTours.length + followedSeries.length}
                                            </span>
                                        </div>
                                        {Object.values(liveGamesMap).some(v => v > 0) && (
                                            <div style={{
                                                padding: '8px 16px', borderRadius: 10,
                                                background: 'rgba(49, 162, 76, 0.08)',
                                                border: '1px solid rgba(49, 162, 76, 0.2)',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                <span style={{ fontSize: 12, color: C.textMuted }}>Live Games </span>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
                                                    {Object.values(liveGamesMap).reduce((s, v) => s + v, 0)}
                                                </span>
                                            </div>
                                        )}
                                        {Object.values(waitlistMap).some(v => v > 0) && (
                                            <div style={{
                                                padding: '8px 16px', borderRadius: 10,
                                                background: C.blueDim,
                                                border: `1px solid ${C.blueBorder}`,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                <span style={{ fontSize: 12, color: C.textMuted }}>On Waitlists </span>
                                                <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>
                                                    {Object.values(waitlistMap).reduce((s, v) => s + v, 0)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Venue cards — sorted by live activity */}
                                    {[...followedVenues]
                                        .sort((a, b) => {
                                            const aLive = (liveGamesMap[String(a.id)] || 0) + (waitlistMap[String(a.id)] || 0);
                                            const bLive = (liveGamesMap[String(b.id)] || 0) + (waitlistMap[String(b.id)] || 0);
                                            return bLive - aLive;
                                        })
                                        .map(venue => (
                                            <ClubCard
                                                key={venue.id}
                                                venue={venue}
                                                liveGameCount={liveGamesMap[String(venue.id)] || 0}
                                                waitlistCount={waitlistMap[String(venue.id)] || 0}
                                                isFollowed={followedIds.has(String(venue.id))}
                                                onToggleFollow={handleToggleFollow}
                                                onNavigate={handleNavigate}
                                            />
                                        ))}

                                    {/* ── Tours & Series Section ── */}
                                    {(followedTours.length > 0 || followedSeries.length > 0) && (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                marginTop: followedVenues.length > 0 ? 24 : 0,
                                                paddingTop: followedVenues.length > 0 ? 20 : 0,
                                                borderTop: followedVenues.length > 0 ? `1px solid ${C.elevated}` : 'none',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8,
                                                    background: 'linear-gradient(135deg, #00bfff, #f59e0b)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, color: '#fff', fontWeight: 700,
                                                }}>🌐</div>
                                                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                                                    Tours & Series
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, color: '#00bfff',
                                                    padding: '2px 8px', borderRadius: 12,
                                                    background: 'rgba(0, 191, 255, 0.12)',
                                                }}>{followedTours.length + followedSeries.length}</span>
                                            </div>
                                            {followedTours.map(tour => (
                                                <FollowedPageCard
                                                    key={`tour-${tour.page_id}`}
                                                    page={tour}
                                                    onNavigate={(url) => router.push(url)}
                                                    onUnfollow={handlePageUnfollow}
                                                />
                                            ))}
                                            {followedSeries.map(series => (
                                                <FollowedPageCard
                                                    key={`series-${series.page_id}`}
                                                    page={series}
                                                    onNavigate={(url) => router.push(url)}
                                                    onUnfollow={handlePageUnfollow}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {/* ── Club Arena Section ── */}
                                    {arenaClubs.length > 0 && (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                marginTop: (followedVenues.length > 0 || followedTours.length > 0 || followedSeries.length > 0) ? 24 : 0,
                                                paddingTop: (followedVenues.length > 0 || followedTours.length > 0 || followedSeries.length > 0) ? 20 : 0,
                                                borderTop: (followedVenues.length > 0 || followedTours.length > 0 || followedSeries.length > 0) ? `1px solid ${C.elevated}` : 'none',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8,
                                                    background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, color: '#fff', fontWeight: 700,
                                                }}>♠</div>
                                                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                                                    Club Arena
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, color: '#8b5cf6',
                                                    padding: '2px 8px', borderRadius: 12,
                                                    background: 'rgba(139, 92, 246, 0.12)',
                                                }}>{arenaClubs.length}</span>
                                            </div>
                                            {arenaClubs.map(club => (
                                                <ClubArenaCard
                                                    key={`arena-${club.id}`}
                                                    club={club}
                                                    onNavigate={(clubId) => router.push(`/hub/club-arena/lobby?club=${clubId}`)}
                                                />
                                            ))}
                                        </>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* ═══════════ DISCOVER TAB ═══════════ */}
                    {activeTab === 'discover' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Search Input */}
                            <div style={{
                                position: 'relative',
                                background: C.surface,
                                border: `1px solid ${C.elevated}`,
                                borderRadius: 12,
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    position: 'absolute', left: 16, top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: C.textMuted, fontSize: 16,
                                    pointerEvents: 'none',
                                }}>
                                    🔍
                                </div>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search venues, casinos, clubs..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '14px 16px 14px 44px',
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        color: C.text,
                                        fontSize: 15,
                                        fontFamily: 'inherit',
                                    }}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        style={{
                                            position: 'absolute', right: 12, top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: C.elevated, border: 'none',
                                            borderRadius: '50%', width: 24, height: 24,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: C.textSec, fontSize: 12, cursor: 'pointer',
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Search Results */}
                            {isSearching && (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: C.textSec }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%',
                                        border: `3px solid ${C.elevated}`,
                                        borderTopColor: C.blue,
                                        animation: 'spin 0.8s linear infinite',
                                        margin: '0 auto 12px',
                                    }} />
                                    Searching...

                                </div>
                            )}

                            {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '40px 20px',
                                    background: C.surface, borderRadius: 12,
                                    border: `1px solid ${C.elevated}`,
                                }}>
                                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔎</div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                                        No Venues Found
                                    </div>
                                    <div style={{ fontSize: 13, color: C.textSec }}>
                                        Try a different search term or browse by city name
                                    </div>
                                </div>
                            )}

                            {!isSearching && searchResults.length > 0 && (
                                <>
                                    <div style={{ fontSize: 13, color: C.textMuted, paddingLeft: 4 }}>
                                        {searchResults.length} {searchResults.length === 1 ? 'Result' : 'Results'}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {searchResults.map(venue => (
                                            <SearchResultCard
                                                key={venue.id}
                                                venue={venue}
                                                isFollowed={followedIds.has(String(venue.id))}
                                                onToggleFollow={handleToggleFollow}
                                                onNavigate={handleNavigate}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* Discover prompt when no search */}
                            {!searchQuery.trim() && !isSearching && (
                                <div style={{
                                    textAlign: 'center', padding: '48px 20px',
                                    background: C.surface, borderRadius: 12,
                                    border: `1px solid ${C.elevated}`,
                                }}>
                                    <div style={{ fontSize: 48, marginBottom: 16 }}>🌎</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                                        Discover Poker Venues
                                    </div>
                                    <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
                                        Search for casinos, card rooms, poker clubs, and home games near you. Follow them to get quick access to live games and waitlists.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div >
        </>
    );
}
