/**
 * ♠ SMARTER.POKER HUB — Club Arena (Orb #2)
 * Pixel-Perfect PokerBros Design
 */

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function ClubArenaPage() {
    const router = useRouter();
    const [clubs, setClubs] = useState([
        { id: '1', name: 'Featured Club', member_count: 68, online_count: 15, table_count: 4 },
        { id: '2', name: 'Diamond Club', member_count: 999, online_count: 206, table_count: 13 },
        { id: '3', name: 'Elite Club', member_count: 245, online_count: 42, table_count: 6 },
    ]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userStats, setUserStats] = useState({ xp: 2350, diamonds: 126, messages: 3 });

    // Fetch clubs
    useEffect(() => {
        async function fetchClubs() {
            try {
                const { data } = await supabase
                    .from('clubs')
                    .select('id, name, member_count, online_count, table_count')
                    .order('member_count', { ascending: false })
                    .limit(10);
                if (data?.length > 0) {
                    setClubs(data.map(c => ({
                        ...c,
                        online_count: c.online_count || Math.floor(c.member_count * 0.22),
                        table_count: c.table_count || Math.floor(Math.random() * 10) + 1
                    })));
                }
            } catch (err) {
                console.error('Error fetching clubs:', err);
            }
        }
        fetchClubs();
    }, []);

    // Fetch user stats
    useEffect(() => {
        async function fetchUserStats() {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('xp, diamonds')
                        .eq('id', user.id)
                        .single();
                    if (profile) {
                        setUserStats(prev => ({
                            ...prev,
                            xp: profile.xp || prev.xp,
                            diamonds: profile.diamonds || prev.diamonds
                        }));
                    }
                }
            } catch (err) { }
        }
        fetchUserStats();
    }, []);

    const nextClub = () => setCurrentIndex((prev) => (prev + 1) % clubs.length);
    const prevClub = () => setCurrentIndex((prev) => (prev - 1 + clubs.length) % clubs.length);
    const enterClub = () => router.push(`/hub/clubs/${clubs[currentIndex]?.id || '1'}`);

    const currentClub = clubs[currentIndex];
    const prevClubData = clubs[(currentIndex - 1 + clubs.length) % clubs.length];
    const nextClubData = clubs[(currentIndex + 1) % clubs.length];

    return (
        <>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="description" content="Private poker clubs, better than PokerBros" />
            </Head>

            <div style={styles.container}>
                {/* Header */}
                <header style={styles.header}>
                    <div style={styles.headerLeft}>
                        <div style={styles.logo}>
                            <div style={styles.logoIcon}>♠</div>
                            <span style={styles.logoText}>Club Arena</span>
                        </div>
                    </div>
                    <div style={styles.headerRight}>
                        <div style={styles.statBadge}>
                            <span>💎</span>
                            <span>{userStats.xp.toLocaleString()} XP</span>
                        </div>
                        <div style={styles.statBadge}>
                            <span>💜</span>
                            <span>{userStats.diamonds}</span>
                        </div>
                        <button style={styles.headerIcon} onClick={() => router.push('/hub/profile')}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                                <circle cx="12" cy="8" r="4" />
                                <path d="M12 14c-6 0-8 3-8 5v1h16v-1c0-2-2-5-8-5z" />
                            </svg>
                        </button>
                        <button style={styles.headerIcon} onClick={() => router.push('/hub/settings')}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                            </svg>
                        </button>
                        <button style={styles.headerIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20 }}>
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                            </svg>
                            {userStats.messages > 0 && <span style={styles.badge}>{userStats.messages}</span>}
                        </button>
                    </div>
                </header>

                {/* Main Content */}
                <main style={styles.main}>
                    <h1 style={styles.title}>Club Arena</h1>

                    {/* Carousel */}
                    <div style={styles.carouselSection}>
                        <button style={styles.arrow} onClick={prevClub}>‹</button>

                        <div style={styles.cardsWrapper}>
                            {/* Left Side Card */}
                            <div style={styles.sideCard}>
                                <span style={styles.sideCardName}>{prevClubData?.name}</span>
                            </div>

                            {/* Main Card */}
                            <div style={styles.mainCard}>
                                <div style={styles.cardBg}></div>
                                <div style={styles.cardContent}>
                                    <h2 style={styles.clubName}>{currentClub?.name || 'Featured Club'}</h2>
                                    <div style={styles.stats}>
                                        <div style={styles.statRow}>
                                            <span>👥</span>
                                            <span>{currentClub?.online_count} / {currentClub?.member_count} Members Online</span>
                                        </div>
                                        <div style={styles.statRow}>
                                            <span>🎴</span>
                                            <span>{currentClub?.table_count} Live Tables</span>
                                        </div>
                                    </div>
                                    <button style={styles.enterButton} onClick={enterClub}>Enter</button>
                                </div>
                            </div>

                            {/* Right Side Card */}
                            <div style={styles.sideCard}>
                                <span style={styles.sideCardName}>{nextClubData?.name}</span>
                                <div style={styles.sideCardStats}>
                                    <div>{nextClubData?.online_count} / {nextClubData?.member_count}</div>
                                    <div>🎴 {nextClubData?.table_count}</div>
                                </div>
                            </div>
                        </div>

                        <button style={styles.arrow} onClick={nextClub}>›</button>
                    </div>

                    {/* Dots */}
                    <div style={styles.dots}>
                        {clubs.slice(0, 3).map((_, i) => (
                            <button
                                key={i}
                                style={{
                                    ...styles.dot,
                                    ...(i === currentIndex % 3 ? styles.dotActive : {})
                                }}
                                onClick={() => setCurrentIndex(i)}
                            />
                        ))}
                    </div>
                </main>

                {/* Action Bar */}
                <footer style={styles.actionBar}>
                    <button style={styles.actionItem} onClick={() => router.push('/hub/clubs')}>
                        <div style={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}>
                                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                            </svg>
                        </div>
                        <span style={styles.actionLabel}>Join a Club</span>
                    </button>

                    <button style={styles.actionItem} onClick={() => router.push('/hub/clubs/create')}>
                        <div style={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}>
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                            </svg>
                        </div>
                        <span style={styles.actionLabel}>Create a Club</span>
                    </button>

                    <button style={styles.actionItem} onClick={() => {
                        navigator.clipboard.writeText('https://smarter.poker/hub/club-arena');
                        alert('Invite link copied!');
                    }}>
                        <div style={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}>
                                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                            </svg>
                        </div>
                        <span style={styles.actionLabel}>Invite Friends</span>
                    </button>

                    <button style={styles.actionItem} onClick={() => router.push('/hub/hands')}>
                        <div style={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}>
                                <ellipse cx="12" cy="6" rx="8" ry="3" />
                                <path d="M4 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6c0 1.66-3.58 3-8 3S4 7.66 4 6z" />
                                <path d="M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4c0 1.66-3.58 3-8 3s-8-1.34-8-3z" />
                                <path d="M4 14v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4c0 1.66-3.58 3-8 3s-8-1.34-8-3z" />
                            </svg>
                        </div>
                        <span style={styles.actionLabel}>Hand Histories</span>
                    </button>

                    <button style={styles.actionItem} onClick={() => window.open('/terms', '_blank')}>
                        <div style={styles.actionIcon}>
                            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 28, height: 28 }}>
                                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                            </svg>
                        </div>
                        <span style={styles.actionLabel}>Terms of Service</span>
                    </button>
                </footer>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES - PokerBros Design
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        minHeight: '100vh',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0b1829 0%, #0e2035 25%, #0f2240 50%, #0b1a30 75%, #091525 100%)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: 'rgba(5, 12, 25, 0.95)',
        borderBottom: '1px solid rgba(60, 100, 150, 0.2)',
        flexShrink: 0,
    },
    headerLeft: { display: 'flex', alignItems: 'center' },
    logo: { display: 'flex', alignItems: 'center', gap: '10px' },
    logoIcon: {
        width: '36px',
        height: '36px',
        background: 'linear-gradient(135deg, #c0392b 0%, #922b21 100%)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        color: '#fff',
        fontWeight: 'bold',
    },
    logoText: { fontSize: '18px', fontWeight: 700, color: '#fff' },
    headerRight: { display: 'flex', alignItems: 'center', gap: '10px' },
    statBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        background: 'linear-gradient(180deg, rgba(50, 85, 130, 0.7) 0%, rgba(35, 65, 100, 0.8) 100%)',
        border: '1px solid rgba(100, 160, 220, 0.35)',
        borderRadius: '18px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#fff',
    },
    headerIcon: {
        width: '38px',
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '50%',
        color: 'rgba(255, 255, 255, 0.9)',
        cursor: 'pointer',
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        minWidth: '18px',
        height: '18px',
        padding: '0 5px',
        background: '#e53935',
        borderRadius: '9px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    main: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '16px',
    },
    title: {
        fontSize: '22px',
        fontWeight: 500,
        color: '#fff',
        textAlign: 'center',
        margin: 0,
        textShadow: '0 2px 10px rgba(0, 0, 0, 0.4)',
    },
    carouselSection: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%',
        maxWidth: '600px',
    },
    arrow: {
        width: '36px',
        height: '36px',
        background: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '50%',
        color: '#fff',
        fontSize: '24px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
    },
    cardsWrapper: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0',
    },
    sideCard: {
        width: '60px',
        height: '200px',
        background: 'linear-gradient(180deg, rgba(15, 35, 65, 0.85) 0%, rgba(8, 22, 45, 0.9) 100%)',
        border: '1px solid rgba(60, 120, 180, 0.25)',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 4px',
    },
    sideCardName: {
        fontSize: '12px',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.9)',
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        transform: 'rotate(180deg)',
    },
    sideCardStats: {
        marginTop: 'auto',
        fontSize: '9px',
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
    },
    mainCard: {
        position: 'relative',
        width: '380px',
        height: '220px',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '2px solid rgba(70, 140, 210, 0.5)',
        boxShadow: '0 0 40px rgba(30, 100, 180, 0.3), 0 0 80px rgba(20, 80, 150, 0.15)',
    },
    cardBg: {
        position: 'absolute',
        inset: 0,
        background: `
            radial-gradient(ellipse 100% 80% at 50% 100%, rgba(0, 60, 100, 0.4) 0%, transparent 60%),
            radial-gradient(circle at 15% 25%, rgba(200, 50, 50, 0.2) 0%, transparent 12%),
            radial-gradient(circle at 85% 20%, rgba(50, 50, 200, 0.2) 0%, transparent 12%),
            radial-gradient(circle at 50% 75%, rgba(50, 150, 50, 0.15) 0%, transparent 18%),
            linear-gradient(180deg, rgba(12, 35, 65, 0.95) 0%, rgba(8, 25, 50, 0.98) 100%)
        `,
    },
    cardContent: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        textAlign: 'center',
    },
    clubName: {
        fontSize: '28px',
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 12px 0',
        textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
    },
    stats: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        marginBottom: '16px',
    },
    statRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.9)',
    },
    enterButton: {
        padding: '12px 70px',
        background: 'linear-gradient(180deg, #5cb85c 0%, #4cae4c 30%, #449d44 70%, #3d8b3d 100%)',
        border: 'none',
        borderRadius: '25px',
        color: '#fff',
        fontSize: '20px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(76, 175, 80, 0.45)',
    },
    dots: {
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
    },
    dot: {
        width: '24px',
        height: '4px',
        borderRadius: '2px',
        background: 'rgba(255, 255, 255, 0.3)',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
    },
    dotActive: {
        background: '#fff',
    },
    actionBar: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '24px',
        padding: '28px 24px 36px',
        background: 'linear-gradient(180deg, rgba(20, 40, 70, 0.92) 0%, rgba(12, 28, 55, 0.95) 100%)',
        border: '1px solid rgba(80, 140, 200, 0.2)',
        borderBottom: 'none',
        borderRadius: '30px 30px 0 0',
        margin: '0 16px',
        flexShrink: 0,
    },
    actionItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
    },
    actionIcon: {
        width: '64px',
        height: '64px',
        background: 'linear-gradient(180deg, rgba(35, 65, 110, 0.85) 0%, rgba(25, 50, 90, 0.9) 100%)',
        border: '2px solid rgba(80, 140, 210, 0.4)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.9)',
    },
    actionLabel: {
        fontSize: '11px',
        fontWeight: 500,
        color: 'rgba(255, 255, 255, 0.85)',
        textAlign: 'center',
    },
};
