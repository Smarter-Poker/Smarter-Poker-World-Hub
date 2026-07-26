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
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePersistedState } from '../../src/hooks/usePersistedState';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { getAuthUser, authedFetch } from '../../src/lib/authUtils';
import { supabase } from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../src/engine/EventBus';
import SkeletonLight from '../../src/components/ui/SkeletonLight';
import BottomNavBar from '../../src/components/ui/BottomNavBar';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — SmarterPoker Dark palette
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
    border: '#3E4042',        // SmarterPoker Dark border color
    borderLight: '#333536',   // Subtle inner border
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
            onClick={() => onNavigate(club.id)}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                background: hovering ? C.elevated : C.surface,
                border: `2px solid ${hovering ? 'rgba(139, 92, 246, 0.4)' : C.border}`,
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
                            Club Arena · {(club.userRole || 'player').charAt(0).toUpperCase() + (club.userRole || 'player').slice(1)}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.borderLight}`, paddingTop: 12 }}>
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
                border: `2px solid ${hovering ? C.highlight : C.border}`,
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
            }}
        >
            {/* Top row: Logo + Name + Type */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    {venue.profile_photo_url ? (
                        <img
                            src={venue.profile_photo_url}
                            alt={venue.name}
                            style={{
                                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                                objectFit: 'cover',
                                border: `1px solid ${C.borderLight}`,
                            }}
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                    ) : null}
                    <div style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        background: `linear-gradient(135deg, ${C.blue}, #1a5cc7)`,
                        display: venue.profile_photo_url ? 'none' : 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, color: '#fff', fontWeight: 700,
                        border: `1px solid ${C.borderLight}`,
                    }}>
                        {venue.name?.[0]?.toUpperCase() || '♠'}
                    </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.borderLight}`, paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: C.textMuted }}>
                    View Details
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
                    {isFollowed ? 'Following' : '+ Follow'}
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
                border: `2px solid ${C.border}`,
                borderRadius: 10,
                padding: 16,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
            }}
        >
            {venue.profile_photo_url ? (
                <img
                    src={venue.profile_photo_url}
                    alt={venue.name}
                    style={{
                        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                        objectFit: 'cover',
                        border: `1px solid ${C.borderLight}`,
                    }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
            ) : null}
            <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.blue}, #1a5cc7)`,
                display: venue.profile_photo_url ? 'none' : 'flex',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                fontSize: 18, color: '#fff', fontWeight: 700,
                border: `1px solid ${C.borderLight}`,
            }}>
                {venue.name?.[0]?.toUpperCase() || '♠'}
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
                {isFollowed ? 'Following' : '+ Follow'}
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
            border: `2px solid ${C.border}`,
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
    useTrainingBus('my-clubs');

    // Auth
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    // Followed clubs data
    const [followedVenues, setFollowedVenues] = useState([]);
    const [arenaClubs, setArenaClubs] = useState([]);
    const [homeGroups, setHomeGroups] = useState([]);
    const [followedIds, setFollowedIds] = useState(new Set());
    const [followedPageKeys, setFollowedPageKeys] = useState(new Set());

    // Live data maps: venueId → count
    const [liveGamesMap, setLiveGamesMap] = useState({});
    const [waitlistMap, setWaitlistMap] = useState({});

    // Social page slug map: venueId → socialPageSlug (for redirect)
    const [socialPageSlugMap, setSocialPageSlugMap] = useState({});

    // Search
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Active tab — persisted
    const [activeTab, setActiveTab] = usePersistedState('sp-filters-my-clubs', 'my-clubs');

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
        const loadData = async (signal) => {
            setLoading(true);

            // Get auth user
            const authUser = getAuthUser();
            if (authUser) setUser(authUser);

            const resolvedUserId = authUser?.id || (() => {
                try {
                    return localStorage.getItem('sp-anon-uid') || '';
                } catch { return ''; }
            })();
            setUserId(resolvedUserId);

            // Get all follows from API
            let venueIds = [];
            const allPageKeys = new Set();
            if (resolvedUserId) {
                try {
                    const res = await fetch(`/api/poker/follow?user_id=${resolvedUserId}`, signal ? { signal } : {});
                    if (!res.ok) throw new Error(`Request failed (${res.status})`);
                    const json = await res.json();
                    if (json.success && json.data) {
                        json.data.forEach(f => {
                            allPageKeys.add(`${f.page_type}:${f.page_id}`);
                            if (f.page_type === 'venue') venueIds.push(f.page_id);
                        });
                    }
                } catch (e) {
                    console.warn('[my-clubs] Failed to load follows:', e);
                }
            }

            // Venue follows are stored in Supabase via /api/poker/follow

            setFollowedIds(new Set(venueIds));
            setFollowedPageKeys(allPageKeys);

            // Fetch venue details individually (API supports ?id=X single lookups)
            if (venueIds.length > 0) {
                {
                    const venues = [];
                    const results = await Promise.allSettled(
                        venueIds.slice(0, 30).map(async (vid) => {
                            const res = await fetch(`/api/poker/venues?id=${vid}`, signal ? { signal } : {});
                            if (!res.ok) throw new Error(`Request failed (${res.status})`);
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
                    // Only show home_game, club, and charity venue types
                    const ALLOWED_TYPES = ['home_game', 'club', 'charity'];
                    setFollowedVenues(venues.filter(v => ALLOWED_TYPES.includes(v.venue_type)));
                }

                // Fetch live game counts for each venue (fire-and-forget)
                const gameMap = {};
                const wlMap = {};
                await Promise.allSettled(venueIds.map(async (vid) => {
                    try {
                        const res = await fetch(`/api/poker/live-games?venue_id=${vid}`, signal ? { signal } : {});
                        if (!res.ok) throw new Error(`Request failed (${res.status})`);
                        const json = await res.json();
                        if (json.success) {
                            const games = json.games || json.data || [];
                            gameMap[vid] = Array.isArray(games) ? games.length : 0;
                        }
                    } catch (e) { console.warn("[my-clubs.js]", e); }
                    try {
                        const res = await fetch(`/api/commander/waitlist/venue/${vid}`, signal ? { signal } : {});
                        if (!res.ok) throw new Error(`Request failed (${res.status})`);
                        const json = await res.json();
                        if (json.success && json.data && json.data.waitlists) {
                            const totalPlayers = json.data.waitlists.reduce((sum, wl) =>
                                sum + (wl.players ? wl.players.length : 0), 0);
                            wlMap[vid] = totalPlayers;
                        }
                    } catch (e) { console.warn("[my-clubs.js]", e); }
                }));
                setLiveGamesMap(gameMap);
                setWaitlistMap(wlMap);

                // Batch-fetch social page slugs for followed venues
                const slugMap = {};
                await Promise.allSettled(venueIds.slice(0, 30).map(async (vid) => {
                    try {
                        const sRes = await fetch(`/api/social/pages?linked_venue_id=${vid}&limit=1`, signal ? { signal } : {});
                        if (!sRes.ok) return;
                        const sJson = await sRes.json();
                        if (sJson.success && sJson.data && sJson.data.length > 0) {
                            slugMap[String(vid)] = sJson.data[0].slug || sJson.data[0].id;
                        }
                    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                }));
                setSocialPageSlugMap(slugMap);
            }



            // Fetch Club Arena memberships + Home Groups (parallel)
            if (authUser?.id) {
                const [arenaResult, hgResult] = await Promise.allSettled([
                    supabase
                        .from('club_members')
                        .select('club_id, role, clubs(*)')
                        .eq('user_id', authUser.id)
                        .eq('status', 'active')
                        .limit(50),
                    supabase
                        .from('home_game_members')
                        .select('role, home_game_groups!inner(id, name, slug, city, state, profile_photo_url, default_game_type, default_stakes)')
                        .eq('user_id', authUser.id)
                        .eq('status', 'active')
                        .limit(50),
                ]);

                if (arenaResult.status === 'fulfilled' && arenaResult.value?.data?.length > 0) {
                    const clubs = arenaResult.value.data
                        .map(m => ({ ...m.clubs, userRole: m.role }))
                        .filter(c => c && c.name);
                    setArenaClubs(clubs);
                }

                if (hgResult.status === 'fulfilled' && hgResult.value?.data?.length > 0) {
                    const groups = hgResult.value.data
                        .map(m => ({ ...m.home_game_groups, userRole: m.role }))
                        .filter(g => g && g.name);
                    setHomeGroups(groups);
                }
            }

            setLoading(false);
        };

        const controller = new AbortController();
        loadData(controller.signal);
        return () => controller.abort();
    }, []);

    // EventBus listener — refresh when follows change from other pages
    useEffect(() => {
        let debounceTimer = null;
        const handler = (payload) => {
            if (payload?.topic === 'social-pages' || payload?.topic === 'friends') {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    // Reload followed venues
                    const authUser = getAuthUser();
                    const uid = authUser?.id;
                    if (uid) {
                        fetch(`/api/poker/follow?user_id=${uid}`).then(r => r.json()).then(json => {
                            if (json.success && json.data) {
                                const vIds = json.data.filter(f => f.page_type === 'venue').map(f => f.page_id);
                                if (vIds.length > 0) {
                                    fetch(`/api/poker/venues?ids=${vIds.join(',')}`).then(r2 => r2.json()).then(vjson => {
                                        if (vjson.success) setFollowedVenues(vjson.data || []);
                                    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                                }
                            }
                        }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
                    }
                }, 2000);
            }
        };
        eventBus.on(EventType.DATA_MUTATED, handler);
        return () => { eventBus.off(EventType.DATA_MUTATED, handler); if (debounceTimer) clearTimeout(debounceTimer); };
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
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/poker/venues?search=${encodeURIComponent(searchQuery)}&limit=20`, { signal: controller.signal });
                if (!res.ok) throw new Error(`Request failed (${res.status})`);
                const json = await res.json();
                if (json.success && json.data) {
                    setSearchResults(Array.isArray(json.data) ? json.data : [json.data]);
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.warn('[MyClubs] Search error:', e);
            }
            setIsSearching(false);
        }, 350);

        return () => { clearTimeout(timer); controller.abort(); };
    }, [searchQuery]);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!userId) return;
    const _ch = supabase
      .channel(`my-clubs:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'club_members', filter: `user_id=eq.${userId}` }, async () => {
        // Reload Club Arena memberships on real-time change
        try {
          const { data: memberships } = await supabase
            .from('club_members')
            .select('club_id, role, clubs(*)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(50);
          if (memberships && memberships.length > 0) {
            const clubs = memberships
              .map(m => ({ ...m.clubs, userRole: m.role }))
              .filter(c => c && c.name);
            setArenaClubs(clubs);
          } else {
            setArenaClubs([]);
          }
        } catch (e) {
          console.warn('[my-clubs] Realtime reload failed:', e);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [userId]);

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

        // Persist to API
        try {
            await authedFetch('/api/poker/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_type: 'venue',
                    page_id: vid,
                    action: newAction,
                    user_id: getUserId(),
                }),
            });
        } catch (e) { console.warn("[my-clubs.js]", e); }
    };



    // Navigate to venue — prefer social page if linked
    const handleNavigate = (venueId) => {
        const slug = socialPageSlugMap[String(venueId)];
        if (slug) {
            router.push(`/hub/social-pages/${slug}`);
        } else {
            router.push(`/hub/venues/${venueId}`);
        }
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
                minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
                background: C.bg,
                color: C.text,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
            }}>
                <UniversalHeader pageDepth={1} />

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
                        border: `2px solid ${C.border}`,
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
                            My Clubs {(followedVenues.length + arenaClubs.length + homeGroups.length) > 0 && `(${followedVenues.length + arenaClubs.length + homeGroups.length})`}
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
                                <SkeletonLight variant="list" rows={5} />
                            ) : (followedVenues.length === 0 && arenaClubs.length === 0) ? (
                                <EmptyState onSearchFocus={focusSearch} />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>


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



                                    {/* ── Club Arena Section ── */}
                                    {arenaClubs.length > 0 && (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                marginTop: followedVenues.length > 0 ? 24 : 0,
                                                paddingTop: followedVenues.length > 0 ? 20 : 0,
                                                borderTop: followedVenues.length > 0 ? `1px solid ${C.elevated}` : 'none',
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
                                                    onNavigate={(clubId) => { router.push(`/hub/club-arena?club=${clubId}`); }}
                                                />
                                            ))}
                                        </>
                                    )}

                                    {/* ── Home Groups Section ── */}
                                    {homeGroups.length > 0 && (
                                        <>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                marginTop: (followedVenues.length > 0 || arenaClubs.length > 0) ? 24 : 0,
                                                paddingTop: (followedVenues.length > 0 || arenaClubs.length > 0) ? 20 : 0,
                                                borderTop: (followedVenues.length > 0 || arenaClubs.length > 0) ? `1px solid ${C.elevated}` : 'none',
                                            }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 8,
                                                    background: 'linear-gradient(135deg, #0d9488, #06b6d4)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 13, color: '#fff', fontWeight: 700,
                                                }}>🏠</div>
                                                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                                                    Home Games
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600, color: '#0d9488',
                                                    padding: '2px 8px', borderRadius: 12,
                                                    background: 'rgba(13,148,136,0.12)',
                                                }}>{homeGroups.length}</span>
                                            </div>
                                            {homeGroups.map(group => {
                                                const isHost = ['host', 'co_host', 'admin'].includes(group.userRole);
                                                return (
                                                    <div
                                                        key={`hg-${group.id}`}
                                                        onClick={() => router.push(
                                                            isHost
                                                                ? `/hub/home-games/${group.slug || group.id}/dashboard`
                                                                : `/hub/home-games/${group.slug || group.id}`
                                                        )}
                                                        style={{
                                                            background: C.surface,
                                                            border: `2px solid ${isHost ? 'rgba(13,148,136,0.35)' : C.border}`,
                                                            borderRadius: 12, padding: 16, cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', gap: 14,
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                        onMouseEnter={e => e.currentTarget.style.background = C.elevated}
                                                        onMouseLeave={e => e.currentTarget.style.background = C.surface}
                                                    >
                                                        {group.profile_photo_url ? (
                                                            <img src={group.profile_photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                                                        ) : (
                                                            <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg,#0d9488,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>🏠</div>
                                                        )}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: 700, fontSize: 15, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</div>
                                                            <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                                                                {[group.city, group.state].filter(Boolean).join(', ')}
                                                                {group.default_game_type && ` · ${group.default_game_type.toUpperCase()}`}
                                                                {group.default_stakes && ` · ${group.default_stakes}`}
                                                            </div>
                                                        </div>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                                                            padding: '3px 8px', borderRadius: 10, flexShrink: 0,
                                                            background: isHost ? 'rgba(13,148,136,0.15)' : 'rgba(6,182,212,0.1)',
                                                            border: `1px solid ${isHost ? 'rgba(13,148,136,0.5)' : 'rgba(6,182,212,0.3)'}`,
                                                            color: isHost ? '#0d9488' : '#06b6d4',
                                                        }}>{isHost ? 'Host' : 'Member'}</span>
                                                    </div>
                                                );
                                            })}
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
                                border: `2px solid ${C.border}`,
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
                                    border: `2px solid ${C.border}`,
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
                                    border: `2px solid ${C.border}`,
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
                  <BottomNavBar />
                </div>
            </div >
        </>
    );
}
