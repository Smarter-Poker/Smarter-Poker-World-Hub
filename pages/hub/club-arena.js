/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Play Money Home Games
   Metal UI with baked assets from club-arena.vercel.app
   Theme: Futuristic Metal — deep ocean tech aesthetic
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import useTrainingBus from '../../src/hooks/useTrainingBus';

const getAuthToken = async () => {
    // 1. Fast path: read from localStorage cache (instant, no network round-trip)
    //    'smarter-poker-auth' is the storageKey configured in supabase.ts
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch (_) { /* localStorage unavailable (incognito, quota) */ }

    // 2. Slow path: ask Supabase helper
    try {
        const token = getAccessToken();
        return token || null;
    } catch (_) {
        return null;
    }
};
const apiCall = async (endpoint, body) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { throw new Error('Server returned invalid response'); }
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import ClubArenaBottomNav from '../../src/components/club-arena/ClubArenaBottomNav';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAccessToken } from '../../src/lib/authUtils';
import { eventBus, EventType, busEmit } from '../../src/engine/EventBus';

// ═══════════════════════════════════════════════════════════════════════════
// QUICK-LINK CARD DEFINITIONS (CSS icons — no external image dependencies)
// ═══════════════════════════════════════════════════════════════════════════
const QUICK_LINKS = [
    {
        id: 'player-stats',
        label: 'Player Stats',
        gradient: 'linear-gradient(135deg, #1a2744 0%, #0f3460 100%)',
        icon: (color = '#00d4ff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>`,
        href: (clubParam) => `/hub/club-arena/player-stats?club=${clubParam}`,
    },
    {
        id: 'leaderboards',
        label: 'Leaderboard',
        gradient: 'linear-gradient(135deg, #1a1a2e 0%, #162447 100%)',
        icon: (color = '#FFD700') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7"/><path d="M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 22V12a1 1 0 00-1-1H7a1 1 0 00-1 1v10"/><path d="M18 22V12a1 1 0 00-1-1h-2a1 1 0 00-1 1v10"/><path d="M12 7v15"/><circle cx="12" cy="4" r="2"/></svg>`,
        href: (clubParam) => `/hub/club-arena/leaderboard?club=${clubParam}`,
    },
    {
        id: 'cashier',
        label: 'Cashier',
        gradient: 'linear-gradient(135deg, #0d2818 0%, #1a4a2e 100%)',
        icon: (color = '#31A24C') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12"/><path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5"/></svg>`,
        href: (clubParam) => `/hub/club-arena/cashier?club=${clubParam}`,
    },
    {
        id: 'marketplace',
        label: 'Marketplace',
        gradient: 'linear-gradient(135deg, #2a1a3e 0%, #4a1a5e 100%)',
        icon: (color = '#9333ea') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>`,
        href: (clubParam) => `/hub/club-arena/marketplace?club=${clubParam}`,
    },
    {
        id: 'hand-histories',
        label: 'Hand Histories',
        gradient: 'linear-gradient(135deg, #1a1a1a 0%, #333333 100%)',
        icon: (color = '#B0B3B8') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="8" height="12" rx="1.5" transform="rotate(-6 6 10)"/><rect x="14" y="4" width="8" height="12" rx="1.5" transform="rotate(6 18 10)"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`,
        href: (clubParam) => `/hub/club-arena/hand-histories?club=${clubParam}`,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CLUB MODAL
// ═══════════════════════════════════════════════════════════════════════════
function CreateClubModal({ onClose, onCreated, user }) {
    const [clubName, setClubName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!clubName.trim()) {
            setError('Please enter a club name');
            return;
        }
        setIsCreating(true);
        setError('');
        try {
            const result = await apiCall('/api/club-arena/create-club', { name: clubName.trim() });
            busEmit.dataMutated('club_created');
            onCreated(result.club);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to create club');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={modalBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#1877F2', margin: 0 }}>
                        Create a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Club Name</label>
                    <input
                        value={clubName}
                        onChange={(e) => setClubName(e.target.value)}
                        placeholder="Enter Club Name..."
                        style={inputStyle}
                    />
                </div>
                {error && <div style={{ color: '#ff4d4d', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
                <button onClick={handleCreate} disabled={isCreating} style={actionBtnPrimary}>
                    {isCreating ? 'Creating...' : 'Create Club'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// JOIN CLUB MODAL
// ═══════════════════════════════════════════════════════════════════════════
function JoinClubModal({ onClose, onJoined, user, initialAgentCode }) {
    const [clubCode, setClubCode] = useState('');
    const [agentPlayerNumber, setAgentPlayerNumber] = useState(initialAgentCode || '');
    const [isJoining, setIsJoining] = useState(false);
    const [error, setError] = useState('');

    const handleJoin = async () => {
        if (!clubCode.trim()) {
            setError('Please enter a club code');
            return;
        }
        setIsJoining(true);
        setError('');
        try {
            const result = await apiCall('/api/club-arena/join-club', {
                clubCode: clubCode.trim(),
                ...(agentPlayerNumber.trim() ? { agentPlayerNumber: agentPlayerNumber.trim() } : {}),
            });
            busEmit.dataMutated('club_joined');
            onJoined(result.club);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to join club');
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={modalBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#1877F2', margin: 0 }}>
                        Join a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Club Code (5 Digits)</label>
                    <input
                        value={clubCode}
                        onChange={(e) => setClubCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="Enter 5-digit Club Code..."
                        style={inputStyle}
                        maxLength={5}
                    />
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Agent Referral Number <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>(optional)</span></label>
                    <input
                        value={agentPlayerNumber}
                        onChange={(e) => setAgentPlayerNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter your agent's player number"
                        style={inputStyle}
                    />
                    <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                        Your agent&apos;s player number assigns you under them in this club. Without it, you&apos;ll join unassigned.
                    </div>
                </div>
                {error && <div style={{ color: '#ff4d4d', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
                <button onClick={handleJoin} disabled={isJoining} style={actionBtnPrimary}>
                    {isJoining ? 'Joining...' : 'Join Club'}
                </button>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIND PLAYER MODAL  
// ═══════════════════════════════════════════════════════════════════════════
function FindPlayerModal({ onClose }) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!search.trim()) return;
        setIsSearching(true);
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url')
                .or(`username.ilike.%${search.trim()}%,display_name.ilike.%${search.trim()}%`)
                .limit(10);
            setResults(data || []);
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div style={modalOverlay}>
            <div style={modalBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '20px', color: '#1877F2', margin: 0 }}>
                        Find a Player
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search By Username..."
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={handleSearch} disabled={isSearching} style={{ ...actionBtnPrimary, padding: '12px 20px' }}>
                        {isSearching ? '...' : 'Search'}
                    </button>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {results.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px' }}>
                            {isSearching ? 'Searching...' : 'No results yet'}
                        </div>
                    ) : (
                        results.map((p) => (
                            <div key={p.id} style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '12px', background: 'rgba(0,212,255,0.05)',
                                borderRadius: '10px', marginBottom: '8px',
                            }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #1877F2, #166FE5)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: '16px', fontWeight: 700,
                                    overflow: 'hidden',
                                }}>
                                    {p.avatar_url ? (
                                        <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    ) : (
                                        (p.display_name || p.username)?.[0]?.toUpperCase() || '?'
                                    )}
                                </div>
                                <span style={{ color: '#fff', fontWeight: 500 }}>{p.display_name || p.username || 'Unknown'}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function ClubArenaPage() {
    const router = useRouter();
    useTrainingBus('club-arena-hub');
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [clubs, setClubs] = useState([]);
    const [activeClub, setActiveClub] = useState(null);

    // Modals
    const [showCreateClub, setShowCreateClub] = useState(false);
    const [showJoinClub, setShowJoinClub] = useState(false);
    const [initialAgentCode, setInitialAgentCode] = useState('');
    const [showFindPlayer, setShowFindPlayer] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Midway Union application
    const [showUnionApply, setShowUnionApply] = useState(false);
    const [unionApplicationStatus, setUnionApplicationStatus] = useState(null); // null | 'pending' | 'approved' | 'rejected'
    const [unionApplyMessage, setUnionApplyMessage] = useState('');
    const [unionApplying, setUnionApplying] = useState(false);
    const [unionApplyResult, setUnionApplyResult] = useState(null);

    // Terms of Service — null=loading, false=not accepted, true=accepted
    const [tosAccepted, setTosAccepted] = useState(null);

    // Auto-open join modal if ?agent= URL param present (agent's player_number)
    useEffect(() => {
        const { agent } = router.query;
        if (agent && !showJoinClub) {
            // agent param is the agent's player_number (numeric)
            const pn = String(agent).replace(/\D/g, '');
            if (pn) {
                setInitialAgentCode(pn);
                setShowJoinClub(true);
            }
        }
    }, [router.query]); // eslint-disable-line

    // Unions the user owns or administers
    const [myUnions, setMyUnions] = useState([]);

    // Live Supabase stats for Shark Club card
    const [sharkClubStats, setSharkClubStats] = useState({ totalMembers: 0, clubLevel: 1, activePlayers: 0 });
    const [sharkJoinSent, setSharkJoinSent] = useState(false);
    const [sharkJoining, setSharkJoining] = useState(false);

    // Is user already a Shark Club member?
    const isSharkMember = clubs.some(c => String(c.club_id) === '25450');

    useEffect(() => {
        loadUserData();
    }, []);
    // Realtime subscription — live updates
    useEffect(() => {
        if (!user?.id) return;
        const _ch = supabase
            .channel(`club-arena-hub:${user?.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clubs', filter: `owner_id=eq.${user.id}` }, () => {
                loadUserData();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_members', filter: `user_id=eq.${user.id}` }, () => {
                loadUserData();
            })
            .subscribe((status) => {
                if (status !== 'SUBSCRIBED') console.warn('[ClubArenaHub] Realtime:', status);
            });
        return () => { supabase.removeChannel(_ch); };
    }, [user?.id]);

    // EventBus — refresh on cross-page mutations (club created, joined, chips changed)
    useEffect(() => {
        const unsub = eventBus.on(EventType.DATA_MUTATED, (e) => {
            const relevant = ['tournament_created', 'chips_minted', 'union_club_added', 'union_club_removed', 'club_created', 'club_joined', 'union_application_submitted'];
            if (relevant.includes(e?.payload?.entity)) loadUserData();
        });
        return () => unsub();
    }, []);

    // Fetch real stats from Supabase for the Shark Club card
    async function fetchSharkClubStats(signal) {
        try {
            const { data: club } = await supabase
                .from('clubs')
                .select('id')
                .eq('club_id', 25450)
                .maybeSingle();
            if (!club) return;

            // Parallel fetch: member count + tables (both depend only on club.id)
            const [memberCountRes, tablesRes] = await Promise.all([
                supabase.from('club_members').select('*', { count: 'exact', head: true }).eq('club_id', club.id).limit(200),
                supabase.from('tables').select('id').eq('club_id', club.id).limit(200),
            ]);

            let activePlayers = 0;
            try {
                const clubTables = tablesRes.data;
                if (clubTables && clubTables.length > 0) {
                    const tableIds = clubTables.map(t => t.id);
                    const { count: seatCount } = await supabase
                        .from('table_seats')
                        .select('*', { count: 'exact', head: true })
                        .in('table_id', tableIds);
                    activePlayers = seatCount || 0;
                }
            } catch (e) {
                // table_seats may not exist yet
            }

            setSharkClubStats({
                totalMembers: memberCountRes.count || 0,
                clubLevel: 1,
                activePlayers,
            });
        } catch (err) {
            console.error('[ClubArena] Failed to fetch Shark Club stats:', err);
        }
    }

    async function loadUserData(signal) {
        try {
            // Fast auth via Supabase session (no localStorage digging)
            const authData = JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}');
            const authUser = authData?.user || null;

            if (authUser) {
                setUser(authUser);
                // Check TOS acceptance (one-time per account)
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('club_arena_tos_accepted_at')
                    .eq('id', authUser.id)
                    .maybeSingle();
                setTosAccepted(!!profile?.club_arena_tos_accepted_at);
                // Parallel load: clubs, unions, AND shark stats all at once
                await Promise.all([
                    loadClubs(authUser.id),
                    loadUnions(authUser.id),
                    fetchSharkClubStats(),
                ]);
            } else {
                // No auth — still load shark stats for visitors
                await fetchSharkClubStats();
            }
        } catch (e) {
            console.error('[ClubArena] Load error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    async function loadClubs(userId) {
        try {
            const { data: memberships } = await supabase
                .from('club_members')
                .select('club_id, role, clubs(*)')
                .eq('user_id', userId)
                .eq('status', 'active')
                .limit(200) // club members

            if (memberships && memberships.length > 0) {
                const userClubs = memberships.map(m => ({
                    ...m.clubs,
                    userRole: m.role,
                })).filter(c => c && c.status === 'active');
                setClubs(userClubs);
                if (userClubs.length > 0) {
                    setActiveClub(userClubs[0]);
                    // Check union application status for owner's first club
                    const ownerClub = userClubs.find(c => c.userRole === 'owner' && !c.union_id);
                    if (ownerClub) {
                        const token = getAccessToken();
                        if (token) {
                            fetch('/api/club-arena/union-application', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ action: 'status', clubId: ownerClub.id }),
                            }).then(r => r.json()).then(d => {
                                setUnionApplicationStatus(d.application?.status || null);
                            }).catch(() => { });
                        }
                    }
                }
            }
        } catch (err) {
            console.error('[ClubArena] Failed to load clubs:', err);
        }
    }

    async function loadUnions(userId) {
        try {
            // Find unions where user is an admin/owner
            const { data: adminRecords } = await supabase
                .from('union_admins')
                .select('union_id, role, unions(id, name, code, owner_id, settings, main_bbj_balance, created_at)')
                .eq('user_id', userId);

            if (adminRecords && adminRecords.length > 0) {
                const unions = adminRecords
                    .filter(r => r.unions)
                    .map(r => ({
                        ...r.unions,
                        adminRole: r.role,
                    }));
                setMyUnions(unions);
            }
        } catch (err) {
            console.error('[ClubArena] Failed to load unions:', err);
        }
    }

    const [tosError, setTosError] = useState(false);

    const handleAcceptTOS = async () => {
        setTosError(false);
        try {
            const token = getAccessToken();
            if (!token) { setTosError(true); return; }
            const res = await fetch('/api/club-arena/accept-tos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            if (!res.ok) { setTosError(true); return; }
            const d = await res.json();
            if (d.success) setTosAccepted(true);
            else setTosError(true);
        } catch (e) {
            console.error('[TOS] Accept failed:', e);
            setTosError(true);
        }
    };

    const handleClubCreated = (club) => {
        const newClub = { ...club, userRole: 'owner' };
        setClubs(prev => [...prev, newClub]);
        setActiveClub(newClub);
    };

    const handleClubJoined = (club) => {
        const joinedClub = { ...club, userRole: 'player' };
        setClubs(prev => [...prev, joinedClub]);
        setActiveClub(joinedClub);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // CAROUSEL STATE — Shark Club is always the featured card at index 0,
    // user clubs flank it on left/right
    // ═══════════════════════════════════════════════════════════════════════
    const clubParam = activeClub?.club_id || '';

    // Build carousel items: Shark Club featured + user clubs
    const carouselItems = (() => {
        const items = [];
        // Shark Club is ALWAYS the featured card (index 0)
        items.push({
            type: 'shark',
            id: 'shark-25450',
            name: 'SHARK CLUB',
            club_id: 25450,
            stats: sharkClubStats,
            isMember: isSharkMember,
        });
        // User clubs flank the Shark Club
        clubs.forEach(club => {
            items.push({
                type: 'user-club',
                id: club.id,
                name: club.name,
                club_id: club.club_id,
                userRole: club.userRole,
                member_count: club.member_count || 0,
                union_id: club.union_id,
            });
        });
        return items;
    })();

    // Carousel scroll state
    const [carouselIndex, setCarouselIndex] = useState(0);
    const carouselRef = { current: null };
    const touchStart = { current: 0 };
    const touchDelta = { current: 0 };
    const isDragging = { current: false };

    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', background: '#020812', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '16px', color: '#1877F2' }}>
                    Loading Club Arena...
                </div>
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title="Club Arena — Private Online Poker Clubs"
                description="Create And Join Private Online Poker Clubs. Real-time Gameplay, Tournaments, Hand Histories, Player Stats, And Club Management."
                canonical="/hub/club-arena"
                jsonLd={{
                    '@type': 'WebApplication',
                    name: 'Club Arena',
                    applicationCategory: 'GameApplication',
                    description: 'Private online poker clubs with real-time cash games, tournaments, hand histories, player stats, and full club management.',
                    operatingSystem: 'Web',
                    url: 'https://smarter.poker/hub/club-arena',
                    provider: {
                        '@type': 'Organization',
                        name: 'Smarter.Poker',
                        url: 'https://smarter.poker',
                    },
                    offers: {
                        '@type': 'Offer',
                        price: '0',
                        priceCurrency: 'USD',
                    },
                    featureList: 'Cash Games, Tournaments, SNG, Hand Histories, Player Stats, Leaderboards, Club Management, Agent System',
                }}
            >

            </SEOHead>

            <div style={S.pageWrapper}>
                {/* Background */}
                <div style={S.bgBase} />
                <div style={S.bgOverlay} />

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                <div className="ca-container" style={S.mainContent}>

                    {/* ═══════════════════════════════════════════════════════════════════
                        FEATURED CLUB CAROUSEL — World Hub Style
                        Shark Club center, user clubs flank left/right
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div
                        style={S.carouselViewport}
                        onTouchStart={(e) => {
                            touchStart.current = e.touches[0].clientX;
                            isDragging.current = true;
                        }}
                        onTouchMove={(e) => {
                            if (!isDragging.current) return;
                            touchDelta.current = e.touches[0].clientX - touchStart.current;
                        }}
                        onTouchEnd={() => {
                            isDragging.current = false;
                            if (Math.abs(touchDelta.current) > 50) {
                                if (touchDelta.current < 0 && carouselIndex < carouselItems.length - 1) {
                                    setCarouselIndex(prev => prev + 1);
                                } else if (touchDelta.current > 0 && carouselIndex > 0) {
                                    setCarouselIndex(prev => prev - 1);
                                }
                            }
                            touchDelta.current = 0;
                        }}
                    >
                        <div style={S.carouselTrack}>
                            {carouselItems.map((item, idx) => {
                                const offset = idx - carouselIndex;
                                const absOffset = Math.abs(offset);
                                const isFeatured = offset === 0;

                                // Scale: center = 1, flanking = 0.72, far = 0.55
                                const scale = isFeatured ? 1 : absOffset === 1 ? 0.72 : 0.55;
                                // X translation: spread cards horizontally
                                const translateX = offset * 180;
                                // Z depth: push non-center cards back (simulated via opacity/blur)
                                const opacity = isFeatured ? 1 : absOffset === 1 ? 0.7 : 0.4;
                                const zIndex = 10 - absOffset;
                                // Hide cards too far from center
                                if (absOffset > 2) return null;

                                // ── SHARK CLUB CARD ──
                                if (item.type === 'shark') {
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                if (!isFeatured) { setCarouselIndex(idx); return; }
                                                if (isSharkMember) router.push('/hub/club-arena/lobby?club=25450');
                                            }}
                                            style={{
                                                ...S.carouselCard,
                                                transform: `translateX(${translateX}px) scale(${scale})`,
                                                opacity,
                                                zIndex,
                                                background: 'linear-gradient(135deg, #0a1628 0%, #0d2847 40%, #0a1e3a 100%)',
                                                border: isFeatured ? '2px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(0, 212, 255, 0.15)',
                                                boxShadow: isFeatured
                                                    ? '0 0 30px rgba(0, 212, 255, 0.2), 0 20px 60px rgba(0, 0, 0, 0.5)'
                                                    : '0 10px 30px rgba(0, 0, 0, 0.4)',
                                            }}
                                        >
                                            {/* Shark icon area */}
                                            <div style={{
                                                width: 80, height: 80, borderRadius: '50%',
                                                background: 'radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                margin: '8px auto 12px',
                                                border: '2px solid rgba(0,212,255,0.2)',
                                            }}>
                                                <img
                                                    src="/avatars/free/shark.png"
                                                    alt=""
                                                    style={{ width: 52, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(0,212,255,0.6))' }}
                                                    loading="lazy"
                                                />
                                            </div>
                                            <div style={S.cardTitle}>SHARK CLUB</div>
                                            <div style={S.cardSubtitle}>Featured Club</div>

                                            {/* Stats row */}
                                            <div style={S.statsRow}>
                                                <div style={S.statBlock}>
                                                    <div style={S.statNum}>{Math.max(1, sharkClubStats.totalMembers)}</div>
                                                    <div style={S.statLbl}>Members</div>
                                                </div>
                                                <div style={S.statDivider} />
                                                <div style={S.statBlock}>
                                                    <div style={S.statNum}>{Math.max(1, sharkClubStats.clubLevel)}</div>
                                                    <div style={S.statLbl}>Level</div>
                                                </div>
                                                <div style={S.statDivider} />
                                                <div style={S.statBlock}>
                                                    <div style={S.statNum}>{sharkClubStats.activePlayers || 0}</div>
                                                    <div style={S.statLbl}>Active</div>
                                                </div>
                                            </div>

                                            {/* Join / Enter button */}
                                            {isFeatured && user && !isSharkMember && (
                                                <button
                                                    disabled={sharkJoining || sharkJoinSent}
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        setSharkJoining(true);
                                                        try {
                                                            await apiCall('/api/club-arena/join-club', { clubCode: '25450' });
                                                            busEmit.dataMutated('club_joined');
                                                            setSharkJoinSent(true);
                                                            setTimeout(() => router.push('/hub/club-arena/lobby?club=25450'), 1200);
                                                            const { data: memberships } = await supabase
                                                                .from('club_members').select('club_id, role, clubs(*)').eq('user_id', user.id).eq('status', 'active');
                                                            if (memberships) {
                                                                const userClubs = memberships.map(m => ({ ...m.clubs, userRole: m.role })).filter(c => c && c.status === 'active');
                                                                setClubs(userClubs);
                                                                if (!activeClub && userClubs.length > 0) setActiveClub(userClubs[0]);
                                                            }
                                                        } catch (err) { alert(err.message || 'Failed to join'); }
                                                        finally { setSharkJoining(false); }
                                                    }}
                                                    style={S.joinBtn}
                                                >
                                                    {sharkJoinSent ? 'Joined!' : sharkJoining ? 'Joining...' : 'Request to Join'}
                                                </button>
                                            )}
                                            {isFeatured && isSharkMember && (
                                                <div style={S.enterLabel}>Tap to Enter</div>
                                            )}
                                        </div>
                                    );
                                }

                                // ── USER CLUB CARD ──
                                const roleColors = { owner: '#FFD700', admin: '#2374E1', agent: '#FF9500', player: '#31A24C' };
                                const roleLabels = { owner: 'Owner', admin: 'Admin', agent: 'Agent', player: 'Player' };
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            if (!isFeatured) { setCarouselIndex(idx); return; }
                                            setActiveClub(clubs.find(c => c.id === item.id) || null);
                                            router.push(`/hub/club-arena/lobby?club=${item.club_id}`);
                                        }}
                                        style={{
                                            ...S.carouselCard,
                                            transform: `translateX(${translateX}px) scale(${scale})`,
                                            opacity,
                                            zIndex,
                                            background: 'linear-gradient(135deg, #1e1e2e 0%, #242436 100%)',
                                            border: isFeatured ? '2px solid #2374E1' : '1px solid #3E4042',
                                            boxShadow: isFeatured
                                                ? '0 0 20px rgba(35,116,225,0.3), 0 20px 60px rgba(0,0,0,0.5)'
                                                : '0 10px 30px rgba(0,0,0,0.4)',
                                        }}
                                    >
                                        {/* Role badge */}
                                        <div style={{
                                            position: 'absolute', top: 12, right: 14,
                                            background: roleColors[item.userRole] || '#65676B',
                                            color: item.userRole === 'owner' ? '#000' : '#fff',
                                            fontSize: 9, fontWeight: 800, padding: '3px 10px',
                                            borderRadius: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                                        }}>
                                            {roleLabels[item.userRole] || 'Member'}
                                        </div>

                                        {/* Club initial */}
                                        <div style={{
                                            width: 64, height: 64, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #2374E1, #1a5bb8)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '16px auto 12px',
                                            fontSize: 28, fontWeight: 800, color: '#fff',
                                            border: '2px solid rgba(255,255,255,0.15)',
                                        }}>
                                            {(item.name || '?')[0].toUpperCase()}
                                        </div>

                                        <div style={S.cardTitle}>{item.name}</div>
                                        <div style={S.cardSubtitle}>ID: {item.club_id}</div>

                                        {/* Stats row */}
                                        <div style={S.statsRow}>
                                            <div style={S.statBlock}>
                                                <div style={S.statNum}>{item.member_count}</div>
                                                <div style={S.statLbl}>Members</div>
                                            </div>
                                            {item.union_id && (
                                                <>
                                                    <div style={S.statDivider} />
                                                    <div style={S.statBlock}>
                                                        <div style={{ ...S.statNum, color: '#2374E1' }}>Yes</div>
                                                        <div style={S.statLbl}>Union</div>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {isFeatured && (
                                            <div style={S.enterLabel}>Tap to Enter</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Carousel dots */}
                        {carouselItems.length > 1 && (
                            <div style={S.carouselDots}>
                                {carouselItems.map((_, i) => (
                                    <div
                                        key={i}
                                        onClick={() => setCarouselIndex(i)}
                                        style={{
                                            width: i === carouselIndex ? 20 : 8,
                                            height: 8,
                                            borderRadius: 4,
                                            background: i === carouselIndex ? '#00d4ff' : 'rgba(255,255,255,0.2)',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                        }}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════
                        ACTION BUTTONS — Create / Find / Join
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div style={S.actionPills}>
                        <button
                            onClick={() => user ? setShowCreateClub(true) : alert('Please sign in first')}
                            style={S.actionPill}
                        >
                            Create Club
                        </button>
                        <button onClick={() => setShowFindPlayer(true)} style={S.actionPill}>
                            Find Player
                        </button>
                        <button
                            onClick={() => user ? setShowJoinClub(true) : alert('Please sign in first')}
                            style={S.actionPill}
                        >
                            Join Club
                        </button>
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════
                        MY UNIONS — Union Owner/Admin Cards
                    ═══════════════════════════════════════════════════════════════════ */}
                    {myUnions.length > 0 && (
                        <div style={{ marginBottom: 16, padding: '0 16px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#B0B3B8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 }}>
                                My Unions
                            </div>
                            {myUnions.map(union => (
                                <div
                                    key={union.id}
                                    onClick={() => router.push(`/hub/club-arena/union-dashboard?union=${union.id}`)}
                                    style={{
                                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                                        borderRadius: 14,
                                        padding: '18px 20px',
                                        marginBottom: 10,
                                        cursor: 'pointer',
                                        border: '1px solid #2374E1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        transition: 'transform 0.15s',
                                    }}
                                >
                                    <div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#E4E6EB', marginBottom: 4 }}>
                                            {union.name}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#B0B3B8' }}>
                                            {union.adminRole === 'union_lead' ? 'Union Lead' : 'Union Admin'}
                                            {union.code ? ` • Code: ${union.code}` : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                        <div style={{ textAlign: 'center' }}>
                                            <div style={{ fontSize: 10, color: '#B0B3B8', marginBottom: 2 }}>BBJ POOL</div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: '#F7C52A' }}>
                                                {(union.main_bbj_balance || 0).toLocaleString()}
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 22, color: '#2374E1' }}>→</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════════════
                        BOTTOM QUICK-LINK CARDS — CSS Gradient + SVG Icons
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div style={S.quickLinksGrid}>
                        {QUICK_LINKS.map(link => (
                            <Link key={link.id} href={link.href(clubParam)} style={{ textDecoration: 'none' }}>
                                <div style={{ ...S.quickLinkCard, background: link.gradient }}>
                                    <div
                                        style={S.quickLinkIcon}
                                        dangerouslySetInnerHTML={{ __html: link.icon() }}
                                    />
                                </div>
                                <div style={S.quickLinkLabel}>{link.label}</div>
                            </Link>
                        ))}
                    </div>

                </div>

                {/* Modals */}
                {showCreateClub && <CreateClubModal user={user} onClose={() => setShowCreateClub(false)} onCreated={handleClubCreated} />}
                {showJoinClub && <JoinClubModal user={user} onClose={() => setShowJoinClub(false)} onJoined={handleClubJoined} initialAgentCode={initialAgentCode} />}

                {/* ═══ TERMS OF SERVICE GATE — shown once per account ═══ */}
                {user && tosAccepted === false && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                        <div style={{ background: '#1c1c1e', borderRadius: 16, maxWidth: 480, width: '100%', maxHeight: '90vh', overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}>
                            <div style={{ padding: '24px 24px 0', textAlign: 'center' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>🃏</div>
                                <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Club Arena Terms of Service</h2>
                                <p style={{ color: '#8e8e93', fontSize: 13, marginBottom: 20 }}>Please read and accept before continuing</p>
                            </div>
                            <div style={{ padding: '0 24px', color: '#b0b0b0', fontSize: 13, lineHeight: 1.7 }}>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>1. Virtual Chips Only</strong> — Club Arena uses virtual chips with no real-money value. Chips cannot be redeemed for cash, cryptocurrency, or any item of value. No gambling takes place on this platform.</p>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>2. Age Requirement</strong> — You must be at least 18 years old (or the legal age in your jurisdiction) to use Club Arena.</p>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>3. Fair Play</strong> — You agree not to use bots, collusion, multi-accounting, or any form of cheating. Violations result in permanent account suspension.</p>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>4. Club Responsibility</strong> — Club owners and agents are responsible for their club's operations. Smarter Poker provides the platform infrastructure only.</p>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>5. Account Security</strong> — You are responsible for maintaining the security of your account credentials. Do not share your login with others.</p>
                                <p style={{ marginBottom: 12 }}><strong style={{ color: '#fff' }}>6. Privacy</strong> — Your gameplay data, hand histories, and statistics are stored securely. We do not sell personal information to third parties.</p>
                                <p style={{ marginBottom: 16 }}><strong style={{ color: '#fff' }}>7. Modifications</strong> — Smarter Poker reserves the right to modify these terms at any time. Continued use of Club Arena constitutes acceptance of updated terms.</p>
                            </div>
                            <div style={{ padding: '16px 24px 24px', textAlign: 'center' }}>
                                <button
                                    onClick={handleAcceptTOS}
                                    style={{
                                        width: '100%', padding: '14px 0', fontSize: 16, fontWeight: 800,
                                        background: 'linear-gradient(135deg, #2374E1, #1a5bb8)',
                                        color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(35,116,225,0.4)',
                                    }}
                                >
                                    I Agree — Enter Club Arena
                                </button>
                                {tosError && (
                                    <p style={{ color: '#FA383E', fontSize: 12, marginTop: 8 }}>
                                        Failed to save acceptance. Please check your connection and try again.
                                    </p>
                                )}
                                <p style={{ color: '#555', fontSize: 11, marginTop: 10 }}>By clicking above, you accept the Club Arena Terms of Service.</p>
                            </div>
                        </div>
                    </div>
                )}
                {showFindPlayer && <FindPlayerModal onClose={() => setShowFindPlayer(false)} />}

                {/* Midway Union Application Modal */}
                {showUnionApply && (() => {
                    const ownerClub = clubs.find(c => c.userRole === 'owner' && !c.union_id);
                    const isPending = unionApplicationStatus === 'pending';
                    return (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
                            onClick={() => setShowUnionApply(false)}>
                            <div style={{ background: '#242526', borderRadius: 16, padding: 28, width: '100%', maxWidth: 440, border: '1px solid #3E4042' }}
                                onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ color: '#E4E6EB', fontSize: 20, fontWeight: 800, margin: 0 }}>[UNION] Apply to Midway Union</h2>
                                    <button onClick={() => setShowUnionApply(false)} style={{ background: 'none', border: 'none', color: '#B0B3B8', fontSize: 22, cursor: 'pointer' }}>×</button>
                                </div>

                                {isPending ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                                        <div style={{ color: '#FFD700', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Application Pending</div>
                                        <div style={{ color: '#B0B3B8', fontSize: 13, lineHeight: 1.5 }}>
                                            Your application for <strong style={{ color: '#E4E6EB' }}>{ownerClub?.name}</strong> is under review by the Midway Union admin team. You&apos;ll be notified when a decision is made.
                                        </div>
                                    </div>
                                ) : unionApplyResult ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>[OK]</div>
                                        <div style={{ color: '#31A24C', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Application Submitted!</div>
                                        <div style={{ color: '#B0B3B8', fontSize: 13, lineHeight: 1.5 }}>{unionApplyResult}</div>
                                        <button onClick={() => { setShowUnionApply(false); setUnionApplyResult(null); }}
                                            style={{ marginTop: 20, background: '#2374E1', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                                            Done
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {!ownerClub ? (
                                            <div style={{ color: '#B0B3B8', fontSize: 14, textAlign: 'center', padding: 20 }}>
                                                You need to own a club that isn&apos;t already in a union to apply.
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ background: '#18191A', borderRadius: 10, padding: 14, marginBottom: 16, border: '1px solid #3E4042' }}>
                                                    <div style={{ fontSize: 12, color: '#B0B3B8', marginBottom: 4 }}>Applying for</div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#E4E6EB' }}>{ownerClub.name}</div>
                                                    <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 2 }}>Code: {ownerClub.club_id} • {ownerClub.member_count || 0} members</div>
                                                </div>
                                                <div style={{ background: '#1a2744', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid #2374E144' }}>
                                                    <div style={{ fontSize: 13, color: '#B0B3B8', lineHeight: 1.6 }}>
                                                        Joining the <strong style={{ color: '#2374E1' }}>Midway Union</strong> connects your club to the union rake-sharing and settlement system. Your club&apos;s commission rate will be set by the union admin.
                                                    </div>
                                                </div>
                                                <label style={{ display: 'block', fontSize: 13, color: '#B0B3B8', marginBottom: 6, fontWeight: 600 }}>
                                                    Message to Union Admin <span style={{ fontWeight: 400 }}>(optional)</span>
                                                </label>
                                                <textarea
                                                    value={unionApplyMessage}
                                                    onChange={e => setUnionApplyMessage(e.target.value)}
                                                    placeholder="Tell us about your club, player count, activity level..."
                                                    maxLength={500}
                                                    rows={3}
                                                    style={{ width: '100%', background: '#18191A', border: '1px solid #3E4042', borderRadius: 8, color: '#E4E6EB', fontSize: 13, padding: 12, outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 20 }}
                                                />
                                                <button
                                                    disabled={unionApplying}
                                                    onClick={async () => {
                                                        setUnionApplying(true);
                                                        try {
                                                            const token = getAccessToken();
                                                            const res = await fetch('/api/club-arena/union-application', {
                                                                method: 'POST',
                                                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                                body: JSON.stringify({ action: 'apply', clubId: ownerClub.id, message: unionApplyMessage }),
                                                            });
                                                            const data = await res.json();
                                                            if (data.success) {
                                                                busEmit.dataMutated('union_application_submitted');
                                                                setUnionApplicationStatus('pending');
                                                                setUnionApplyResult(data.message);
                                                            } else {
                                                                alert(data.error || 'Failed to submit application');
                                                            }
                                                        } catch (e) {
                                                            alert('Network error — please try again');
                                                        } finally {
                                                            setUnionApplying(false);
                                                        }
                                                    }}
                                                    style={{ width: '100%', background: '#2374E1', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 700, cursor: unionApplying ? 'not-allowed' : 'pointer', opacity: unionApplying ? 0.6 : 1 }}>
                                                    {unionApplying ? 'Submitting...' : '[UNION] Submit Application'}
                                                </button>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    {...getMenuConfig('club-arena', user, {
                        isClubOwner: clubs.some(c => c.userRole === 'owner'),
                        clubInUnion: clubs.find(c => c.userRole === 'owner')?.union_id ? true : false,
                        unionApplicationStatus,
                    }, {
                        onApplyToUnion: () => { setMenuOpen(false); setShowUnionApply(true); },
                        onViewApplicationStatus: () => { setMenuOpen(false); setShowUnionApply(true); },
                    })}
                />

                {/* CLUB BOTTOM NAVIGATION BAR */}
                {activeClub && (
                    <ClubArenaBottomNav clubId={activeClub.club_id} activePage="home" userRole={activeClub.userRole} />
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED MODAL STYLES
// ═══════════════════════════════════════════════════════════════════════════
const modalOverlay = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.85)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9998,
    backdropFilter: 'blur(5px)',
};

const modalBox = {
    width: '90%', maxWidth: '400px',
    background: 'linear-gradient(180deg, #0a0a1a 0%, #0d0d24 100%)',
    borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 0 40px rgba(0,0,0,0.5)', padding: '28px',
};

const closeBtn = {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
    fontSize: '28px', cursor: 'pointer', padding: '0 4px',
};

const labelStyle = {
    display: 'block', fontFamily: 'Inter, sans-serif', fontSize: '11px',
    fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '6px',
    letterSpacing: '1px', textTransform: 'uppercase',
};

const inputStyle = {
    width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    color: '#fff', fontSize: '14px', fontFamily: 'Inter, sans-serif',
    outline: 'none', boxSizing: 'border-box',
};

const actionBtnPrimary = {
    padding: '14px 28px', background: '#1877F2',
    border: 'none', borderRadius: '12px', fontFamily: 'Inter, sans-serif',
    fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer',
    width: '100%',
};

// ═══════════════════════════════════════════════════════════════════════════
// PAGE STYLES
// ═══════════════════════════════════════════════════════════════════════════
const S = {
    pageWrapper: {
        position: 'relative', minHeight: '100vh', overflow: 'hidden',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    bgBase: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)',
        zIndex: -3,
    },
    bgOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, rgba(24,119,242,0.03) 0%, transparent 30%, rgba(24,119,242,0.02) 100%)',
        zIndex: -2,
    },
    mainContent: {
        position: 'relative', padding: '0 0 20px', zIndex: 1,
        maxWidth: '480px',
        margin: '0 auto',
    },

    // ── FEATURED CLUB CAROUSEL ──
    carouselViewport: {
        position: 'relative',
        width: '100%',
        height: '380px',
        overflow: 'hidden',
        marginTop: '12px',
        marginBottom: '8px',
        touchAction: 'pan-y',
    },
    carouselTrack: {
        position: 'absolute',
        top: 0,
        left: '50%',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    carouselCard: {
        position: 'absolute',
        width: '240px',
        minHeight: '320px',
        borderRadius: '20px',
        padding: '20px 16px',
        cursor: 'pointer',
        transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease, box-shadow 0.4s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
    },
    carouselDots: {
        display: 'flex',
        justifyContent: 'center',
        gap: '6px',
        marginTop: '-20px',
        position: 'relative',
        zIndex: 20,
    },
    cardTitle: {
        fontSize: '18px',
        fontWeight: 800,
        color: '#E4E6EB',
        letterSpacing: '0.5px',
        marginBottom: '4px',
    },
    cardSubtitle: {
        fontSize: '11px',
        color: '#65676B',
        marginBottom: '14px',
        letterSpacing: '0.5px',
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        marginTop: 'auto',
        paddingTop: '12px',
    },
    statBlock: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    statNum: {
        fontSize: '20px',
        fontWeight: 800,
        color: '#00d4ff',
        textShadow: '0 0 8px rgba(0, 212, 255, 0.4)',
    },
    statLbl: {
        fontSize: '10px',
        color: '#65676B',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginTop: '2px',
    },
    statDivider: {
        width: '1px',
        height: '28px',
        background: 'rgba(255,255,255,0.1)',
    },
    joinBtn: {
        marginTop: '14px',
        background: 'linear-gradient(135deg, #2374E1, #1a5bb8)',
        color: '#fff',
        border: 'none',
        borderRadius: '24px',
        padding: '10px 28px',
        fontSize: '13px',
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(35,116,225,0.4)',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
    },
    enterLabel: {
        marginTop: '10px',
        fontSize: '11px',
        color: 'rgba(0, 212, 255, 0.6)',
        fontWeight: 600,
        letterSpacing: '1px',
        textTransform: 'uppercase',
    },

    // ── ACTION PILL BUTTONS ──
    actionPills: {
        display: 'flex',
        justifyContent: 'center',
        gap: '10px',
        padding: '0 16px 16px',
        flexWrap: 'wrap',
    },
    actionPill: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '24px',
        padding: '10px 20px',
        color: '#B0B3B8',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s',
        fontFamily: 'Inter, -apple-system, sans-serif',
        letterSpacing: '0.3px',
    },

    // ── BOTTOM QUICK-LINK CARDS ──
    quickLinksGrid: {
        display: 'flex',
        gap: '12px',
        padding: '8px 16px 100px',
        overflowX: 'auto',
        overflowY: 'visible',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
    },
    quickLinkCard: {
        flexShrink: 0,
        width: '90px',
        height: '110px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.08)',
        scrollSnapAlign: 'start',
        transition: 'transform 0.2s',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
    },
    quickLinkIcon: {
        width: '36px',
        height: '36px',
    },
    quickLinkLabel: {
        marginTop: '6px',
        fontSize: '10px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '90px',
    },
};
