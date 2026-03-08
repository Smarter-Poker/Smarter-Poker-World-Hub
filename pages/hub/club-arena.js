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

    // 2. Slow path: ask Supabase (handles token refresh, also writes back to localStorage)
    try {
        const token = getAccessToken();
        return session?.access_token || null;
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API call failed');
    return data;
};
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import ClubArenaBottomNav from '../../src/components/club-arena/ClubArenaBottomNav';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAccessToken } from '../../src/lib/authUtils';

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PATHS (proxied from club-arena.vercel.app via next.config.js rewrites)
// ═══════════════════════════════════════════════════════════════════════════
const IMAGES = {
    actionBar: '/hub/club-arena/images/icons/action-bar-horizontal.png',
    sharkClub: '/hub/club-arena/images/shark-club-card-v25.jpg',
    tiles: {
        playerStats: '/hub/club-arena/images/tiles/player-stats.jpg',
        leaderboards: '/hub/club-arena/images/tiles/leaderboards.jpg',
        cashier: '/hub/club-arena/images/tiles/cashier.jpg',
        marketplace: '/hub/club-arena/images/tiles/marketplace.jpg',
        handHistories: '/hub/club-arena/images/tiles/hand-histories.jpg',
    },
};

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
                if (userClubs.length > 0) setActiveClub(userClubs[0]);
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
    // BOTTOM TILES - Using baked images from Club Arena
    // ═══════════════════════════════════════════════════════════════════════
    const clubParam = activeClub?.club_id || '';
    const tiles = [
        { id: 'player-stats', image: IMAGES.tiles.playerStats, href: `/hub/club-arena/player-stats?club=${clubParam}` },
        { id: 'leaderboards', image: IMAGES.tiles.leaderboards, href: `/hub/club-arena/leaderboard?club=${clubParam}` },
        { id: 'cashier', image: IMAGES.tiles.cashier, href: `/hub/club-arena/cashier?club=${clubParam}` },
        { id: 'marketplace', image: IMAGES.tiles.marketplace, href: `/hub/club-arena/marketplace?club=${clubParam}` },
        { id: 'hand-histories', image: IMAGES.tiles.handHistories, href: `/hub/club-arena/hand-histories?club=${clubParam}` },
    ];

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
            >

            </SEOHead>

            <div style={S.pageWrapper}>
                {/* Background */}
                <div style={S.bgBase} />
                <div style={S.bgOverlay} />

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                <div className="ca-container" style={S.mainContent}>

                    {/* ═══════════════════════════════════════════════════════════════════
                        ACTION BAR — BAKED IMAGE from Club Arena
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div style={S.actionBarWrapper}>
                        <img
                            src={IMAGES.actionBar}
                            alt="Action Bar"
                            style={S.actionBarImage} loading="lazy" />
                        {/* Clickable zones over the image */}
                        <button
                            onClick={() => user ? setShowCreateClub(true) : alert('Please sign in first')}
                            style={{ ...S.actionZone, left: '0%', width: '33%' }}
                            aria-label="Create A Club"
                        />
                        <button
                            onClick={() => setShowFindPlayer(true)}
                            style={{ ...S.actionZone, left: '33%', width: '34%' }}
                            aria-label="Find A Player"
                        />
                        <button
                            onClick={() => user ? setShowJoinClub(true) : alert('Please sign in first')}
                            style={{ ...S.actionZone, left: '67%', width: '33%' }}
                            aria-label="Join A Club"
                        />
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════
                        SHARK CLUB CARD — BAKED IMAGE from Club Arena
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div
                        style={S.sharkClubWrapper}
                        onClick={() => {
                            // Navigate to Shark Club lobby (club_id 25450 is the featured Shark Club)
                            router.push('/hub/club-arena/lobby?club=25450');
                        }}
                    >
                        <img
                            src={IMAGES.sharkClub}
                            alt="SHARK CLUB"
                            style={S.sharkClubImage} loading="lazy" />
                        {/* Dynamic stats overlay — matches ClubStatsPanel exactly */}
                        <div style={S.statsOverlay}>
                            <div style={{ ...S.statItem, left: '20%', transform: 'translateX(-50%)' }}>
                                <div style={S.statLabel}>TOTAL<br />MEMBERS</div>
                                <div style={S.statValue}>{Math.max(1, sharkClubStats.totalMembers).toLocaleString()}</div>
                            </div>
                            <div style={{ ...S.statItem, left: '50%', transform: 'translateX(-50%)' }}>
                                <div style={S.statLabel}>CLUB LEVEL</div>
                                <div style={S.statValueLarge}>{Math.max(1, sharkClubStats.clubLevel)}</div>
                            </div>
                            <div style={{ ...S.statItem, left: '80%', transform: 'translateX(-50%)' }}>
                                <div style={S.statLabel}>ACTIVE<br />PLAYERS</div>
                                <div style={S.statValue}>{(sharkClubStats.activePlayers || 0).toLocaleString()}</div>
                            </div>
                        </div>
                    </div>

                    {/* ═══════════════════════════════════════════════════════════════════
                        MY UNIONS — Union Owner/Admin Cards
                    ═══════════════════════════════════════════════════════════════════ */}
                    {myUnions.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
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
                        BOTTOM TILES — BAKED IMAGES from Club Arena
                    ═══════════════════════════════════════════════════════════════════ */}
                    <div style={S.tilesGrid}>
                        {tiles.map(tile => (
                            <Link key={tile.id} href={tile.href} style={{ textDecoration: 'none' }}>
                                <div style={S.tileWrapper}>
                                    <img
                                        src={tile.image}
                                        alt=""
                                        style={S.tileImage} loading="lazy" />
                                </div>
                            </Link>
                        ))}
                    </div>

                </div>

                {/* Modals */}
                {showCreateClub && <CreateClubModal user={user} onClose={() => setShowCreateClub(false)} onCreated={handleClubCreated} />}
                {showJoinClub && <JoinClubModal user={user} onClose={() => setShowJoinClub(false)} onJoined={handleClubJoined} initialAgentCode={initialAgentCode} />}
                {showFindPlayer && <FindPlayerModal onClose={() => setShowFindPlayer(false)} />}

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={user}
                    showProfile={true}
                    {...getMenuConfig('club-arena', user, {}, {})}
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

    // ACTION BAR (baked image) - Overlaps into header background
    actionBarWrapper: {
        position: 'relative',
        width: '100%',
        marginTop: '-50px',
        marginBottom: '0',
    },
    actionBarImage: {
        width: '100%',
        height: 'auto',
        display: 'block',
    },
    actionZone: {
        position: 'absolute',
        top: 0,
        height: '100%',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
    },

    // SHARK CLUB CARD (baked image)
    sharkClubWrapper: {
        position: 'relative',
        width: '80%',
        maxWidth: '360px',
        marginTop: '-80px',
        marginBottom: '15px',
        marginLeft: 'auto',
        marginRight: 'auto',
        cursor: 'pointer',
        overflow: 'hidden',
    },
    sharkClubImage: {
        width: '100%',
        height: 'auto',
        display: 'block',
    },
    statsOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
    },
    statItem: {
        position: 'absolute',
        top: '79.5%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
    },
    statValue: {
        fontFamily: "var(--font-inter), 'Roboto', sans-serif",
        fontSize: '24px',
        fontWeight: 700,
        letterSpacing: '1px',
        color: '#ADF9F9',
        textShadow: '0 0 4px rgba(0, 255, 255, 0.8), 0 0 12px rgba(0, 212, 255, 0.9), 0 0 20px rgba(0, 150, 255, 0.7)',
    },
    statValueLarge: {
        fontFamily: "var(--font-inter), 'Roboto', sans-serif",
        fontSize: '56px',
        fontWeight: 700,
        lineHeight: 1,
        marginTop: '8px',
        letterSpacing: '1px',
        color: '#ADF9F9',
        textShadow: '0 0 4px rgba(0, 255, 255, 0.8), 0 0 12px rgba(0, 212, 255, 0.9), 0 0 20px rgba(0, 150, 255, 0.7)',
    },
    statLabel: {
        fontFamily: "var(--font-inter), 'Roboto', sans-serif",
        fontWeight: 600,
        fontSize: '14px',
        letterSpacing: '0.5px',
        color: '#A5EFF0',
        marginBottom: '2px',
        textShadow: '0 0 5px rgba(0, 212, 255, 0.4)',
        textTransform: 'uppercase',
    },

    // BOTTOM TILES - Horizontal scroll slider, fixed 108x162 (World Hub size)
    // Full-width edge-to-edge for off-page sliding
    tilesGrid: {
        display: 'flex',
        gap: '12px',
        padding: '0 16px 100px', // Extra bottom padding for bottom nav
        marginLeft: '-16px',     // Extend to left edge
        marginRight: '-16px',    // Extend to right edge
        paddingLeft: '16px',     // Keep first tile indented
        overflowX: 'auto',
        overflowY: 'visible',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',  // Hide scrollbar for cleaner look
        msOverflowStyle: 'none', // Hide scrollbar IE/Edge
    },
    tileWrapper: {
        flexShrink: 0,
        width: '108px',
        height: '162px',
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'transform 0.2s',
        scrollSnapAlign: 'start',
    },
    tileImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
    },
};
