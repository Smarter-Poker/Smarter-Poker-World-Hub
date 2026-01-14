/**
 * ♠ SMARTER.POKER HUB — Club Arena (Orb #2)
 * Floating Layout - No Fixed Header/Footer (Like Hub)
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
    const [userStats] = useState({ xp: 2350, diamonds: 126, messages: 3 });

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
            } catch (err) { }
        }
        fetchClubs();
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
                {/* Floating Header Elements */}
                <div style={styles.floatingHeader}>
                    <div style={styles.logoGroup}>
                        <div style={styles.logoIcon}>♠</div>
                        <span style={styles.logoText}>Club Arena</span>
                    </div>
                    <div style={styles.statsGroup}>
                        <div style={styles.xpBadge}>💎 {userStats.xp} XP</div>
                        <div style={styles.diamondBadge}>💜 {userStats.diamonds}</div>
                        <button style={styles.iconBtn}><div style={styles.avatarCircle}></div></button>
                        <button style={styles.iconBtn}>☰</button>
                        <button style={styles.iconBtn}>
                            💬
                            <span style={styles.msgBadge}>{userStats.messages}</span>
                        </button>
                    </div>
                </div>

                {/* Title */}
                <h1 style={styles.title}>Club Arena</h1>

                {/* Carousel - Front and Center */}
                <div style={styles.carouselArea}>
                    <button style={styles.arrowBtn} onClick={prevClub}>‹</button>

                    {/* Left Side Card */}
                    <div style={styles.sideCard}>
                        <span style={styles.sideCardName}>{prevClubData?.name?.split(' ')[0]}</span>
                    </div>

                    {/* Main Card with Poker Table */}
                    <div style={styles.mainCard}>
                        <div style={styles.pokerTableBg}></div>
                        <div style={styles.cardContent}>
                            <h2 style={styles.clubName}>{currentClub?.name}</h2>
                            <div style={styles.statLine}>👥 {currentClub?.online_count} / {currentClub?.member_count} Members Online</div>
                            <div style={styles.statLine}>🎴 {currentClub?.table_count} Live Tables</div>
                            <button style={styles.enterBtn} onClick={enterClub}>Enter</button>
                        </div>
                    </div>

                    {/* Right Side Card */}
                    <div style={styles.sideCard}>
                        <span style={styles.sideCardName}>{nextClubData?.name?.split(' ')[0]}</span>
                        <div style={styles.sideStats}>
                            <div>{nextClubData?.online_count} / {nextClubData?.member_count}</div>
                            <div>🎴 {nextClubData?.table_count}</div>
                        </div>
                    </div>

                    <button style={styles.arrowBtn} onClick={nextClub}>›</button>
                </div>

                {/* Dots */}
                <div style={styles.dots}>
                    {[0, 1, 2].map(i => (
                        <div key={i} style={{ ...styles.dot, background: i === currentIndex % 3 ? '#fff' : 'rgba(255,255,255,0.3)' }} />
                    ))}
                </div>

                {/* Floating Action Panel */}
                <div style={styles.floatingActions}>
                    <ActionBtn icon="👥" label="Join a Club" onClick={() => router.push('/hub/clubs')} />
                    <ActionBtn icon="➕" label="Create a Club" onClick={() => router.push('/hub/clubs/create')} />
                    <ActionBtn icon="👥+" label="Invite Friends" onClick={() => { navigator.clipboard.writeText('https://smarter.poker/hub/club-arena'); alert('Copied!'); }} />
                    <ActionBtn icon="🎰" label="Hand Histories" onClick={() => router.push('/hub/hands')} />
                    <ActionBtn icon="🔍" label="Find Friends" onClick={() => router.push('/hub/friends')} />
                </div>
            </div>
        </>
    );
}

function ActionBtn({ icon, label, onClick }) {
    return (
        <button style={styles.actionBtn} onClick={onClick}>
            <div style={styles.actionIcon}>{icon}</div>
            <span style={styles.actionLabel}>{label}</span>
        </button>
    );
}

const styles = {
    container: {
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(180deg, #0a1525 0%, #0c1d35 30%, #0e2240 60%, #091828 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
    },

    // Floating Header
    floatingHeader: {
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 10,
    },
    logoGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    logoIcon: {
        width: '32px',
        height: '32px',
        background: 'linear-gradient(135deg, #b82e2e 0%, #8b2020 100%)',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '18px',
        color: '#fff',
        boxShadow: '0 2px 6px rgba(184, 46, 46, 0.4)',
    },
    logoText: { fontSize: '16px', fontWeight: 600, color: '#fff' },
    statsGroup: { display: 'flex', alignItems: 'center', gap: '8px' },
    xpBadge: {
        padding: '5px 12px',
        background: 'linear-gradient(180deg, rgba(60, 95, 140, 0.8) 0%, rgba(45, 75, 115, 0.9) 100%)',
        border: '1px solid rgba(100, 150, 200, 0.4)',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#fff',
    },
    diamondBadge: {
        padding: '5px 12px',
        background: 'linear-gradient(180deg, rgba(80, 60, 120, 0.8) 0%, rgba(60, 45, 95, 0.9) 100%)',
        border: '1px solid rgba(140, 100, 180, 0.4)',
        borderRadius: '16px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#fff',
    },
    iconBtn: {
        width: '36px',
        height: '36px',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#fff',
        fontSize: '14px',
        position: 'relative',
    },
    avatarCircle: {
        width: '24px',
        height: '24px',
        background: 'linear-gradient(135deg, #667 0%, #445 100%)',
        borderRadius: '50%',
    },
    msgBadge: {
        position: 'absolute',
        top: '-2px',
        right: '-2px',
        minWidth: '16px',
        height: '16px',
        background: '#e53935',
        borderRadius: '8px',
        fontSize: '10px',
        fontWeight: 700,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Title
    title: {
        position: 'absolute',
        top: '70px',
        fontSize: '20px',
        fontWeight: 400,
        color: '#fff',
        margin: 0,
    },

    // Carousel
    carouselArea: {
        display: 'flex',
        alignItems: 'center',
        gap: '0',
    },
    arrowBtn: {
        width: '32px',
        height: '32px',
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '50%',
        color: '#fff',
        fontSize: '22px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 4px',
    },
    sideCard: {
        width: '55px',
        height: '180px',
        background: 'linear-gradient(180deg, rgba(12, 30, 55, 0.9) 0%, rgba(8, 20, 40, 0.95) 100%)',
        border: '1px solid rgba(50, 100, 150, 0.3)',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
    },
    sideCardName: {
        fontSize: '11px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
    },
    sideStats: {
        fontSize: '8px',
        color: 'rgba(255,255,255,0.6)',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        marginTop: 'auto',
    },
    mainCard: {
        position: 'relative',
        width: '340px',
        height: '200px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid rgba(60, 120, 180, 0.5)',
        boxShadow: '0 0 40px rgba(30, 100, 180, 0.4)',
    },
    pokerTableBg: {
        position: 'absolute',
        inset: 0,
        background: `
            url('/cards/club-arena.jpg') center center / cover no-repeat,
            linear-gradient(180deg, rgba(10, 30, 55, 0.85) 0%, rgba(5, 18, 35, 0.9) 100%)
        `,
        filter: 'brightness(0.6)',
    },
    cardContent: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
    },
    clubName: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 8px 0',
        textShadow: '0 2px 6px rgba(0,0,0,0.5)',
    },
    statLine: {
        fontSize: '13px',
        color: 'rgba(255,255,255,0.9)',
    },
    enterBtn: {
        marginTop: '12px',
        padding: '10px 60px',
        background: 'linear-gradient(180deg, #5cb85c 0%, #4cae4c 40%, #449d44 70%, #3a8a3a 100%)',
        border: 'none',
        borderRadius: '22px',
        color: '#fff',
        fontSize: '18px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(76, 175, 80, 0.5)',
    },

    // Dots
    dots: {
        position: 'absolute',
        bottom: '180px',
        display: 'flex',
        gap: '8px',
    },
    dot: {
        width: '22px',
        height: '4px',
        borderRadius: '2px',
    },

    // Floating Actions
    floatingActions: {
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        right: '20px',
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        padding: '24px',
        background: 'linear-gradient(180deg, rgba(18, 38, 65, 0.92) 0%, rgba(12, 28, 50, 0.95) 100%)',
        border: '1px solid rgba(70, 120, 170, 0.25)',
        borderRadius: '24px',
        backdropFilter: 'blur(10px)',
    },
    actionBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
    },
    actionIcon: {
        width: '56px',
        height: '56px',
        background: 'linear-gradient(180deg, rgba(35, 60, 95, 0.9) 0%, rgba(25, 45, 75, 0.95) 100%)',
        border: '2px solid rgba(70, 120, 180, 0.45)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
    },
    actionLabel: {
        fontSize: '10px',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.8)',
        textAlign: 'center',
    },
};
