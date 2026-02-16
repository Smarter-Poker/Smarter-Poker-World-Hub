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
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PATHS (proxied from club-arena.vercel.app via next.config.js rewrites)
// ═══════════════════════════════════════════════════════════════════════════
const IMAGES = {
    actionBar: '/hub/club-arena/images/icons/action-bar-horizontal.png',
    sharkClub: '/hub/club-arena/images/shark-club-card.jpg',
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
            const clubCode = Math.floor(10000 + Math.random() * 90000);
            const { data, error: dbError } = await supabase
                .from('clubs')
                .insert({
                    name: clubName.trim(),
                    owner_id: user.id,
                    club_id: clubCode,
                    status: 'active',
                    created_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (dbError) throw dbError;

            await supabase.from('club_members').insert({
                club_id: data.id,
                user_id: user.id,
                role: 'owner',
                status: 'active',
            });

            onCreated(data);
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
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#00d4ff', margin: 0 }}>
                        Create a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Club Name</label>
                    <input
                        value={clubName}
                        onChange={(e) => setClubName(e.target.value)}
                        placeholder="Enter club name..."
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
function JoinClubModal({ onClose, onJoined, user }) {
    const [clubCode, setClubCode] = useState('');
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
            const { data: club, error: findError } = await supabase
                .from('clubs')
                .select('*')
                .eq('club_id', parseInt(clubCode.trim()))
                .eq('status', 'active')
                .single();

            if (findError || !club) {
                setError('Club not found. Check the code.');
                setIsJoining(false);
                return;
            }

            const { data: existing } = await supabase
                .from('club_members')
                .select('id')
                .eq('club_id', club.id)
                .eq('user_id', user.id)
                .maybeSingle();

            if (existing) {
                setError('You are already a member of this club');
                setIsJoining(false);
                return;
            }

            await supabase.from('club_members').insert({
                club_id: club.id,
                user_id: user.id,
                role: 'member',
                status: 'active',
            });

            onJoined(club);
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
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#00d4ff', margin: 0 }}>
                        Join a Club
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <label style={labelStyle}>Club Code (5 digits)</label>
                    <input
                        value={clubCode}
                        onChange={(e) => setClubCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="Enter 5-digit club code..."
                        style={inputStyle}
                        maxLength={5}
                    />
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
                .select('id, alias, avatar_url')
                .ilike('alias', `%${search.trim()}%`)
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
                    <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '20px', color: '#00d4ff', margin: 0 }}>
                        Find a Player
                    </h2>
                    <button onClick={onClose} style={closeBtn}>×</button>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search by username..."
                        style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={handleSearch} disabled={isSearching} style={{ ...actionBtnPrimary, padding: '12px 20px' }}>
                        {isSearching ? '...' : '🔍'}
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
                                    background: 'linear-gradient(135deg, #0066FF, #00d4ff)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: '16px', fontWeight: 700,
                                    overflow: 'hidden',
                                }}>
                                    {p.avatar_url ? (
                                        <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        p.alias?.[0]?.toUpperCase() || '?'
                                    )}
                                </div>
                                <span style={{ color: '#fff', fontWeight: 500 }}>{p.alias || 'Unknown'}</span>
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
    const [showFindPlayer, setShowFindPlayer] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        loadUserData();
    }, []);

    async function loadUserData() {
        setIsLoading(true);
        try {
            let authUser = null;
            if (typeof window !== 'undefined') {
                try {
                    const explicitAuth = localStorage.getItem('smarter-poker-auth');
                    if (explicitAuth) {
                        const tokenData = JSON.parse(explicitAuth);
                        authUser = tokenData?.user || null;
                    }
                    if (!authUser) {
                        const sbKeys = Object.keys(localStorage).filter(
                            k => k.startsWith('sb-') && k.endsWith('-auth-token')
                        );
                        if (sbKeys.length > 0) {
                            const tokenData = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}');
                            authUser = tokenData?.user || null;
                        }
                    }
                } catch (e) {
                    console.warn('[ClubArena] Error reading localStorage:', e);
                }
            }

            if (authUser) {
                setUser(authUser);
                await loadClubs(authUser.id);
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
                .eq('status', 'active');

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

    const handleClubCreated = (club) => {
        const newClub = { ...club, userRole: 'owner' };
        setClubs(prev => [...prev, newClub]);
        setActiveClub(newClub);
    };

    const handleClubJoined = (club) => {
        const joinedClub = { ...club, userRole: 'member' };
        setClubs(prev => [...prev, joinedClub]);
        setActiveClub(joinedClub);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // BOTTOM TILES - Using baked images from Club Arena
    // ═══════════════════════════════════════════════════════════════════════
    const tiles = [
        { id: 'player-stats', image: IMAGES.tiles.playerStats, href: '/hub/club-arena/player-stats' },
        { id: 'leaderboards', image: IMAGES.tiles.leaderboards, href: '/hub/club-arena/leaderboard' },
        { id: 'cashier', image: IMAGES.tiles.cashier, href: '/hub/club-arena/cashier' },
        { id: 'marketplace', image: IMAGES.tiles.marketplace, href: '/hub/club-arena/marketplace' },
        { id: 'hand-histories', image: IMAGES.tiles.handHistories, href: '/hub/club-arena/hand-histories' },
    ];

    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', background: '#020812', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '16px', color: '#00D4FF' }}>
                    Loading Club Arena...
                </div>
            </div>
        );
    }

    return (
        <>
            <SEOHead
                title="Club Arena — Private Online Poker Clubs"
                description="Create and join private online poker clubs. Real-time gameplay, tournaments, hand histories, player stats, and club management."
                canonical="/hub/club-arena"
            >
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
                            style={S.actionBarImage}
                        />
                        {/* Clickable zones over the image */}
                        <button
                            onClick={() => user ? setShowCreateClub(true) : alert('Please sign in first')}
                            style={{ ...S.actionZone, left: '0%', width: '33%' }}
                            aria-label="Create a Club"
                        />
                        <button
                            onClick={() => setShowFindPlayer(true)}
                            style={{ ...S.actionZone, left: '33%', width: '34%' }}
                            aria-label="Find a Player"
                        />
                        <button
                            onClick={() => user ? setShowJoinClub(true) : alert('Please sign in first')}
                            style={{ ...S.actionZone, left: '67%', width: '33%' }}
                            aria-label="Join a Club"
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
                            style={S.sharkClubImage}
                        />
                        {/* Dynamic stats overlay */}
                        <div style={S.statsOverlay}>
                            <div style={S.statItem}>
                                <div style={S.statValue}>72,850</div>
                                <div style={S.statLabel}>TOTAL MEMBERS</div>
                            </div>
                            <div style={S.statItem}>
                                <div style={S.statValueLarge}>50</div>
                                <div style={S.statLabel}>CLUB LEVEL</div>
                            </div>
                            <div style={S.statItem}>
                                <div style={S.statValue}>18,211</div>
                                <div style={S.statLabel}>ACTIVE PLAYERS</div>
                            </div>
                        </div>
                    </div>

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
                                        style={S.tileImage}
                                    />
                                </div>
                            </Link>
                        ))}
                    </div>

                </div>

                {/* Modals */}
                {showCreateClub && <CreateClubModal user={user} onClose={() => setShowCreateClub(false)} onCreated={handleClubCreated} />}
                {showJoinClub && <JoinClubModal user={user} onClose={() => setShowJoinClub(false)} onJoined={handleClubJoined} />}
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
                    <nav style={S.bottomNav}>
                        <div style={S.bottomNavItems}>
                            <Link href={`/hub/club-arena/messages?club=${activeClub.club_id}`} style={S.bottomNavItem}>
                                <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17zM7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" />
                                </svg>
                                <span style={S.bottomNavLabel}>Messages</span>
                            </Link>
                            <Link href={`/hub/club-arena/players?club=${activeClub.club_id}`} style={S.bottomNavItem}>
                                <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                                </svg>
                                <span style={S.bottomNavLabel}>Players</span>
                            </Link>
                            <Link href={`/hub/club-arena/cashier?club=${activeClub.club_id}`} style={S.bottomNavItem}>
                                <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-2 0H3V6h14v8zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm13 0v11c0 1.1-.9 2-2 2H4v-2h17V7h2z" />
                                </svg>
                                <span style={S.bottomNavLabel}>Cashier</span>
                            </Link>
                            <Link href={`/hub/club-arena/player-stats?club=${activeClub.club_id}`} style={S.bottomNavItem}>
                                <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                                </svg>
                                <span style={S.bottomNavLabel}>Data</span>
                            </Link>
                            <Link href={`/hub/club-arena/admin?club=${activeClub.club_id}`} style={S.bottomNavItem}>
                                <svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                                <span style={S.bottomNavLabel}>Admin</span>
                            </Link>
                        </div>
                    </nav>
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
    background: 'linear-gradient(180deg, #0a1a2e 0%, #050f1e 100%)',
    borderRadius: '20px', border: '1px solid rgba(0,212,255,0.3)',
    boxShadow: '0 0 40px rgba(0,212,255,0.15)', padding: '28px',
};

const closeBtn = {
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
    fontSize: '28px', cursor: 'pointer', padding: '0 4px',
};

const labelStyle = {
    display: 'block', fontFamily: 'Orbitron, sans-serif', fontSize: '11px',
    fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '6px',
    letterSpacing: '1px', textTransform: 'uppercase',
};

const inputStyle = {
    width: '100%', padding: '12px 16px', background: 'rgba(0,212,255,0.05)',
    border: '1px solid rgba(0,212,255,0.2)', borderRadius: '10px',
    color: '#fff', fontSize: '14px', fontFamily: 'Inter, sans-serif',
    outline: 'none', boxSizing: 'border-box',
};

const actionBtnPrimary = {
    padding: '14px 28px', background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
    border: 'none', borderRadius: '12px', fontFamily: 'Orbitron, sans-serif',
    fontSize: '13px', fontWeight: 700, color: '#000', cursor: 'pointer',
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
        background: 'linear-gradient(180deg, rgba(0,212,255,0.03) 0%, transparent 30%, rgba(0,212,255,0.02) 100%)',
        zIndex: -2,
    },
    mainContent: {
        position: 'relative', padding: '0 0 20px', zIndex: 1,
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

    // SHARK CLUB CARD (baked image) - Tight overlap into action bar
    sharkClubWrapper: {
        position: 'relative',
        width: '100%',
        marginTop: '-120px',
        marginBottom: '15px',
        cursor: 'pointer',
        overflow: 'hidden',
        animation: 'ca-glow 4s ease-in-out infinite',
    },
    sharkClubImage: {
        width: '100%',
        height: 'auto',
        display: 'block',
    },
    statsOverlay: {
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '12px 8px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
    },
    statItem: {
        textAlign: 'center',
        flex: 1,
    },
    statValue: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#00d4ff',
    },
    statValueLarge: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '24px',
        fontWeight: 700,
        color: '#00d4ff',
    },
    statLabel: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '8px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: '1px',
        marginTop: '4px',
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

    // BOTTOM NAVIGATION BAR - PokerBros style
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'linear-gradient(180deg, rgba(15, 25, 40, 0.98) 0%, rgba(8, 15, 25, 0.99) 100%)',
        borderTop: '1px solid rgba(0, 180, 255, 0.2)',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(10px)',
    },
    bottomNavItems: {
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        padding: '8px 0',
    },
    bottomNavItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        flex: 1,
        padding: '8px 4px',
        textDecoration: 'none',
        color: 'rgba(255, 255, 255, 0.5)',
        transition: 'all 0.2s ease',
        borderRadius: '8px',
        margin: '0 4px',
    },
    bottomNavIcon: {
        width: '24px',
        height: '24px',
        transition: 'all 0.2s ease',
    },
    bottomNavLabel: {
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
};
