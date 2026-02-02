/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Club Lobby (Club Detail View)
   Shows club info, tables, tournaments, and club navigation
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';

export default function ClubLobby() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;

    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [tables, setTables] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (clubIdParam) loadClubData();
    }, [clubIdParam]);

    async function loadClubData() {
        setIsLoading(true);
        try {
            // Load user
            let authUser = null;
            if (typeof window !== 'undefined') {
                const explicitAuth = localStorage.getItem('smarter-poker-auth');
                if (explicitAuth) authUser = JSON.parse(explicitAuth)?.user || null;
                if (!authUser) {
                    const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
                    if (sbKeys.length > 0) authUser = JSON.parse(localStorage.getItem(sbKeys[0]) || '{}')?.user || null;
                }
            }
            if (authUser) setUser(authUser);

            // Load club by club_id
            const { data: clubData } = await supabase
                .from('clubs')
                .select('*')
                .eq('club_id', clubIdParam)
                .single();

            if (clubData) {
                setClub(clubData);

                // Load club tables
                const { data: tableData } = await supabase
                    .from('poker_tables')
                    .select('*')
                    .eq('club_id', clubData.id)
                    .eq('status', 'active');
                setTables(tableData || []);
            }
        } catch (e) {
            console.error('[ClubLobby] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <Head>
                <title>{club?.name || 'Club Lobby'} | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={styles.page}>
                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} />

                <div style={styles.container}>
                    <button onClick={() => router.push('/hub/club-arena')} style={styles.backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    {isLoading ? (
                        <div style={styles.loading}>Loading Club...</div>
                    ) : !club ? (
                        <div style={styles.error}>
                            <h2 style={{ color: '#ff4d4d', marginBottom: '16px', fontFamily: 'Orbitron, sans-serif' }}>Club Not Found</h2>
                            <p style={{ color: 'rgba(255,255,255,0.6)' }}>The club with ID {clubIdParam} could not be found.</p>
                            <button onClick={() => router.push('/hub/club-arena')} style={styles.primaryBtn}>
                                Return to Club Arena
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Club Header Card */}
                            <div style={styles.clubCard}>
                                <div style={styles.clubAvatar}>
                                    <span style={styles.clubLogo}>♠</span>
                                </div>
                                <div style={styles.clubInfo}>
                                    <h2 style={styles.clubName}>{club.name}</h2>
                                    <div style={styles.clubMeta}>
                                        <span style={styles.clubId}>ID: {club.club_id}</span>
                                        <span style={styles.memberCount}>👥 {club.member_count || 0}</span>
                                    </div>
                                </div>
                                <div style={styles.clubBalance}>
                                    <div style={styles.balanceRow}>
                                        <span style={styles.chipIcon}>💎</span>
                                        <span style={styles.balanceAmount}>0.00</span>
                                        <button style={styles.addBtn}>+</button>
                                    </div>
                                </div>
                            </div>

                            {/* Club Description */}
                            {club.description && (
                                <div style={styles.descriptionCard}>
                                    <p style={styles.descriptionText}>{club.description}</p>
                                </div>
                            )}

                            {/* Game Type Filters */}
                            <div style={styles.filterTabs}>
                                {['ALL', "Hold'em", 'Omaha', 'Mixed', 'MTT', 'SNG'].map(filter => (
                                    <button key={filter} style={styles.filterTab}>{filter}</button>
                                ))}
                            </div>

                            {/* Tables Section */}
                            <h2 style={styles.sectionTitle}>ACTIVE TABLES</h2>
                            {tables.length > 0 ? (
                                <div style={styles.tableGrid}>
                                    {tables.map(table => (
                                        <div key={table.id} style={styles.tableCard}>
                                            <div style={styles.tableHeader}>
                                                <span style={styles.tableIcon}>🎰</span>
                                                <span style={styles.seatsBadge}>{table.max_players || 9} Max</span>
                                            </div>
                                            <div style={styles.tableBody}>
                                                <h3 style={styles.tableName}>{table.name}</h3>
                                                <div style={styles.tableStakes}>{table.stakes || '1/2'}</div>
                                                <div style={styles.playersCount}>
                                                    {table.current_players || 0}/{table.max_players || 9} players
                                                </div>
                                            </div>
                                            <button style={styles.joinBtn}>JOIN TABLE</button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={styles.emptyState}>
                                    <span style={{ fontSize: '40px', marginBottom: '12px' }}>🃏</span>
                                    <p>No active tables</p>
                                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Check back later or start a new table!</p>
                                </div>
                            )}

                            {/* Quick Actions */}
                            <div style={styles.quickActions}>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/cashier?club=${club.club_id}`)}>
                                    💰 Cashier
                                </button>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/leaderboard?club=${club.club_id}`)}>
                                    🏆 Leaderboard
                                </button>
                                <button style={styles.actionBtn} onClick={() => router.push(`/hub/club-arena/hand-histories?club=${club.club_id}`)}>
                                    📋 Hands
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {/* Bottom Navigation */}
                {club && (
                    <nav style={styles.bottomNav}>
                        <div style={styles.bottomNavItems}>
                            <Link href={`/hub/club-arena/messages?club=${club.club_id}`} style={styles.bottomNavItem}>
                                <svg style={styles.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17zM7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" />
                                </svg>
                                <span style={styles.bottomNavLabel}>Messages</span>
                            </Link>
                            <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={styles.bottomNavItem}>
                                <svg style={styles.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                                </svg>
                                <span style={styles.bottomNavLabel}>Players</span>
                            </Link>
                            <Link href={`/hub/club-arena/cashier?club=${club.club_id}`} style={styles.bottomNavItem}>
                                <svg style={styles.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-2 0H3V6h14v8zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm13 0v11c0 1.1-.9 2-2 2H4v-2h17V7h2z" />
                                </svg>
                                <span style={styles.bottomNavLabel}>Cashier</span>
                            </Link>
                            <Link href={`/hub/club-arena/player-stats?club=${club.club_id}`} style={styles.bottomNavItem}>
                                <svg style={styles.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                                </svg>
                                <span style={styles.bottomNavLabel}>Data</span>
                            </Link>
                            <Link href={`/hub/club-arena/admin?club=${club.club_id}`} style={styles.bottomNavItem}>
                                <svg style={styles.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                                <span style={styles.bottomNavLabel}>Admin</span>
                            </Link>
                        </div>
                    </nav>
                )}

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
            </div>
        </>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)',
        paddingBottom: '80px',
    },
    container: {
        padding: '16px 20px 40px',
        maxWidth: '600px',
        margin: '0 auto',
    },
    backBtn: {
        background: 'rgba(0, 212, 255, 0.1)',
        border: '1px solid rgba(0, 212, 255, 0.3)',
        color: '#00d4ff',
        padding: '8px 16px',
        borderRadius: '8px',
        cursor: 'pointer',
        marginBottom: '20px',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
    },
    loading: {
        textAlign: 'center',
        padding: '60px 0',
        color: '#00d4ff',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
    },
    error: {
        textAlign: 'center',
        padding: '40px 20px',
        background: 'rgba(255, 77, 77, 0.1)',
        border: '1px solid rgba(255, 77, 77, 0.3)',
        borderRadius: '14px',
    },
    primaryBtn: {
        marginTop: '20px',
        padding: '12px 24px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '10px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '13px',
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    clubCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '20px',
        borderRadius: '16px',
        background: 'linear-gradient(135deg, rgba(0,212,255,0.1) 0%, rgba(0,100,200,0.08) 100%)',
        border: '1px solid rgba(0,212,255,0.25)',
        marginBottom: '16px',
    },
    clubAvatar: {
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    clubLogo: {
        fontSize: '28px',
        color: '#000',
    },
    clubInfo: {
        flex: 1,
    },
    clubName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '18px',
        fontWeight: 700,
        color: '#fff',
        margin: 0,
    },
    clubMeta: {
        display: 'flex',
        gap: '12px',
        marginTop: '6px',
        fontSize: '12px',
    },
    clubId: {
        color: 'rgba(255,255,255,0.5)',
    },
    memberCount: {
        color: '#00d4ff',
    },
    clubBalance: {
        textAlign: 'right',
    },
    balanceRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    chipIcon: {
        fontSize: '16px',
    },
    balanceAmount: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 700,
        color: '#fff',
    },
    addBtn: {
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        border: '1px solid #00d4ff',
        background: 'rgba(0,212,255,0.1)',
        color: '#00d4ff',
        fontSize: '14px',
        fontWeight: 700,
        cursor: 'pointer',
    },
    descriptionCard: {
        padding: '14px 16px',
        borderRadius: '10px',
        background: 'rgba(0, 212, 255, 0.04)',
        border: '1px solid rgba(0, 212, 255, 0.1)',
        marginBottom: '20px',
    },
    descriptionText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: '13px',
        lineHeight: '1.5',
        margin: 0,
    },
    filterTabs: {
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        marginBottom: '20px',
        paddingBottom: '8px',
    },
    filterTab: {
        padding: '8px 14px',
        background: 'rgba(0, 212, 255, 0.08)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: '8px',
        color: 'rgba(255,255,255,0.6)',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    sectionTitle: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '12px',
        fontWeight: 600,
        color: '#00d4ff',
        marginBottom: '16px',
        letterSpacing: '2px',
    },
    tableGrid: {
        display: 'grid',
        gap: '12px',
        marginBottom: '24px',
    },
    tableCard: {
        padding: '16px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(0,212,255,0.06) 0%, rgba(0,100,200,0.04) 100%)',
        border: '1px solid rgba(0,212,255,0.2)',
    },
    tableHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
    },
    tableIcon: {
        fontSize: '20px',
    },
    seatsBadge: {
        padding: '4px 8px',
        background: 'rgba(0, 212, 255, 0.2)',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 600,
        color: '#00d4ff',
    },
    tableBody: {
        marginBottom: '12px',
    },
    tableName: {
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '14px',
        fontWeight: 600,
        color: '#fff',
        margin: '0 0 6px 0',
    },
    tableStakes: {
        color: '#00ff66',
        fontSize: '13px',
        fontWeight: 600,
        marginBottom: '4px',
    },
    playersCount: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: '11px',
    },
    joinBtn: {
        width: '100%',
        padding: '10px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: '8px',
        fontFamily: 'Orbitron, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        color: '#000',
        cursor: 'pointer',
    },
    emptyState: {
        textAlign: 'center',
        padding: '40px 20px',
        background: 'rgba(0, 212, 255, 0.04)',
        border: '1px solid rgba(0, 212, 255, 0.1)',
        borderRadius: '14px',
        color: 'rgba(255,255,255,0.5)',
        fontSize: '14px',
        marginBottom: '24px',
    },
    quickActions: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
    },
    actionBtn: {
        padding: '12px 8px',
        background: 'rgba(0, 212, 255, 0.08)',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'center',
    },
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
