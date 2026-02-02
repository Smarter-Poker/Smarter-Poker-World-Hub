/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Play Money Home Games
   Metal UI with baked assets from club-arena.vercel.app
   Theme: Futuristic Metal — deep ocean tech aesthetic
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

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
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
                <style>{`
                    @keyframes ca-glow { 0%, 100% { box-shadow: 0 0 20px rgba(0,212,255,0.2); } 50% { box-shadow: 0 0 40px rgba(0,212,255,0.4); } }
                    .ca-container { width: 100%; max-width: 500px; margin: 0 auto; }
                    @media (min-width: 501px) and (max-width: 700px) { .ca-container { zoom: 0.75; } }
                    @media (min-width: 701px) { .ca-container { zoom: 1; max-width: 600px; } }
                `}</style>
            </Head>

            <div style={S.pageWrapper}>
                {/* Background */}
                <div style={S.bgBase} />
                <div style={S.bgOverlay} />

                <UniversalHeader pageDepth={1} />

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
                            // Navigate to first club or show create modal
                            if (activeClub) {
                                router.push(`/hub/club-arena/clubs/${activeClub.id}`);
                            } else {
                                user ? setShowCreateClub(true) : alert('Please sign in first');
                            }
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
        position: 'relative', padding: '8px 12px 40px', zIndex: 1,
    },

    // ACTION BAR (baked image) - 80% width, centered
    actionBarWrapper: {
        position: 'relative',
        width: '85%',
        maxWidth: '420px',
        margin: '0 auto 12px',
    },
    actionBarImage: {
        width: '100%',
        height: 'auto',
        display: 'block',
        borderRadius: '10px',
    },
    actionZone: {
        position: 'absolute',
        top: 0,
        height: '100%',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
    },

    // SHARK CLUB CARD (baked image) - 75% width, centered
    sharkClubWrapper: {
        position: 'relative',
        width: '75%',
        maxWidth: '340px',
        margin: '0 auto 14px',
        cursor: 'pointer',
        borderRadius: '12px',
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

    // BOTTOM TILES (baked images) - uniform fixed size
    tilesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '6px',
        padding: '0 4px',
    },
    tileWrapper: {
        borderRadius: '8px',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        aspectRatio: '1 / 1.3',
    },
    tileImage: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
    },
};
