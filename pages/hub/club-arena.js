/**
 * ♠ SMARTER.POKER HUB — Club Arena (Orb #2)
 * Pixel-Perfect PokerBros Clone - Real Database Integration
 */

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';

export default function ClubArenaPage() {
    const router = useRouter();
    const [clubs, setClubs] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userStats, setUserStats] = useState({ xp: 0, diamonds: 0, messages: 0 });
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(null);

    // Fetch user session and stats
    useEffect(() => {
        async function fetchUser() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    setUser(session.user);
                    // Fetch user profile for XP and diamonds
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('total_xp, diamonds')
                        .eq('id', session.user.id)
                        .single();

                    if (profile) {
                        setUserStats({
                            xp: profile.total_xp || 0,
                            diamonds: profile.diamonds || 0,
                            messages: 0 // TODO: Fetch from messages table
                        });
                    }
                }
            } catch (err) {
                console.error('Error fetching user:', err);
            }
        }
        fetchUser();
    }, []);

    // Fetch clubs with real member/table counts
    useEffect(() => {
        async function fetchClubs() {
            try {
                setLoading(true);

                // Fetch clubs with aggregated stats
                const { data: clubsData, error } = await supabase
                    .from('clubs')
                    .select(`
                        id,
                        name,
                        club_id,
                        avatar_url,
                        description,
                        settings
                    `)
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (error) throw error;

                if (clubsData && clubsData.length > 0) {
                    // For each club, get member count and table count
                    const clubsWithStats = await Promise.all(
                        clubsData.map(async (club) => {
                            // Get member count
                            const { count: memberCount } = await supabase
                                .from('club_members')
                                .select('*', { count: 'exact', head: true })
                                .eq('club_id', club.id)
                                .eq('status', 'active');

                            // Get online count (members with is_online = true)
                            const { data: onlineMembers } = await supabase
                                .from('club_members')
                                .select('user_id')
                                .eq('club_id', club.id)
                                .eq('status', 'active');

                            let onlineCount = 0;
                            if (onlineMembers && onlineMembers.length > 0) {
                                const userIds = onlineMembers.map(m => m.user_id);
                                const { count } = await supabase
                                    .from('profiles')
                                    .select('*', { count: 'exact', head: true })
                                    .in('id', userIds)
                                    .eq('is_online', true);
                                onlineCount = count || 0;
                            }

                            // Get running tables count
                            const { count: tableCount } = await supabase
                                .from('game_tables')
                                .select('*', { count: 'exact', head: true })
                                .eq('club_id', club.id)
                                .eq('status', 'running');

                            return {
                                ...club,
                                member_count: memberCount || 0,
                                online_count: onlineCount,
                                table_count: tableCount || 0
                            };
                        })
                    );

                    setClubs(clubsWithStats);
                } else {
                    // No clubs found - show empty state
                    setClubs([]);
                }
            } catch (err) {
                console.error('Error fetching clubs:', err);
                setClubs([]);
            } finally {
                setLoading(false);
            }
        }
        fetchClubs();
    }, []);

    const nextClub = () => setCurrentIndex((prev) => (prev + 1) % Math.max(clubs.length, 1));
    const prevClub = () => setCurrentIndex((prev) => (prev - 1 + Math.max(clubs.length, 1)) % Math.max(clubs.length, 1));
    const enterClub = () => {
        if (clubs[currentIndex]) {
            router.push(`/hub/clubs/${clubs[currentIndex].id}`);
        }
    };

    const currentClub = clubs[currentIndex];
    const prevClubData = clubs.length > 1 ? clubs[(currentIndex - 1 + clubs.length) % clubs.length] : null;
    const nextClubData = clubs.length > 1 ? clubs[(currentIndex + 1) % clubs.length] : null;

    return (
        <>
            <Head>
                <title>Club Arena | Smarter.Poker</title>
                <meta name="description" content="Private poker clubs, better than PokerBros" />
            </Head>

            <div style={styles.container}>
                {/* Floating Header */}
                <div style={styles.floatingHeader}>
                    <div style={styles.logoGroup}>
                        <div style={styles.logoIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                <path d="M12 2C8.5 2 6 5 6 8c0 4 6 10 6 10s6-6 6-10c0-3-2.5-6-6-6zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
                            </svg>
                        </div>
                        <span style={styles.logoText}>Club Arena</span>
                    </div>
                    <div style={styles.statsGroup}>
                        <div style={styles.xpBadge}>
                            <span style={styles.goldDiamond}>💎</span>
                            <span>{userStats.xp.toLocaleString()} XP</span>
                        </div>
                        <div style={styles.diamondBadge}>
                            <span style={styles.purpleHeart}>💜</span>
                            <span>{userStats.diamonds}</span>
                        </div>
                        <button style={styles.iconBtn} onClick={() => router.push('/hub/profile')}>
                            <div style={styles.avatarCircle}></div>
                        </button>
                        <button style={styles.iconBtn}>
                            <span style={styles.menuLines}>☰</span>
                        </button>
                        <button style={styles.iconBtn} onClick={() => router.push('/hub/messages')}>
                            <span style={styles.msgIcon}>💬</span>
                            {userStats.messages > 0 && (
                                <span style={styles.msgBadge}>{userStats.messages}</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Title */}
                <h1 style={styles.title}>Club Arena</h1>

                {/* Carousel */}
                <div style={styles.carouselArea}>
                    <button style={styles.arrowBtn} onClick={prevClub} disabled={clubs.length <= 1}>
                        <span>‹</span>
                    </button>

                    {/* Left Side Card */}
                    {prevClubData && (
                        <div style={styles.sideCardLeft}>
                            <span style={styles.sideCardName}>{prevClubData.name}</span>
                        </div>
                    )}

                    {/* Main Card */}
                    <div style={styles.mainCard}>
                        <div style={styles.pokerTableBg}></div>
                        <div style={styles.cardGradientOverlay}></div>
                        <div style={styles.cardContent}>
                            {loading ? (
                                <div style={styles.loadingText}>Loading clubs...</div>
                            ) : currentClub ? (
                                <>
                                    <h2 style={styles.clubName}>{currentClub.name}</h2>
                                    <div style={styles.statsRow}>
                                        <span style={styles.statIcon}>👥</span>
                                        <span>{currentClub.online_count} / {currentClub.member_count} Members Online</span>
                                    </div>
                                    <div style={styles.statsRow}>
                                        <span style={styles.tableIcon}>🎴</span>
                                        <span>{currentClub.table_count} Live Tables</span>
                                    </div>
                                    <button style={styles.enterBtn} onClick={enterClub}>Enter</button>
                                </>
                            ) : (
                                <>
                                    <h2 style={styles.clubName}>No Clubs Yet</h2>
                                    <div style={styles.statsRow}>Create or join a club to get started!</div>
                                    <button style={styles.enterBtn} onClick={() => router.push('/hub/clubs/create')}>
                                        Create Club
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Side Card */}
                    {nextClubData && (
                        <div style={styles.sideCardRight}>
                            <span style={styles.sideCardName}>{nextClubData.name}</span>
                            <div style={styles.sideStats}>
                                <div>{nextClubData.online_count} / {nextClubData.member_count} M</div>
                                <div>🎴 {nextClubData.table_count} L</div>
                            </div>
                        </div>
                    )}

                    <button style={styles.arrowBtn} onClick={nextClub} disabled={clubs.length <= 1}>
                        <span>›</span>
                    </button>
                </div>

                {/* Navigation Dots */}
                <div style={styles.dotsContainer}>
                    {clubs.slice(0, 5).map((_, i) => (
                        <button
                            key={i}
                            style={{
                                ...styles.dot,
                                background: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.3)'
                            }}
                            onClick={() => setCurrentIndex(i)}
                        />
                    ))}
                </div>

                {/* Floating Action Bar */}
                <div style={styles.actionBar}>
                    <ActionButton
                        icon={<JoinIcon />}
                        label="Join a Club"
                        onClick={() => router.push('/hub/clubs')}
                    />
                    <ActionButton
                        icon={<PlusIcon />}
                        label="Create a Club"
                        onClick={() => router.push('/hub/clubs/create')}
                    />
                    <ActionButton
                        icon={<InviteIcon />}
                        label="Invite Friends"
                        onClick={() => {
                            navigator.clipboard.writeText('https://smarter.poker/hub/club-arena');
                            alert('Invite link copied to clipboard!');
                        }}
                    />
                    <ActionButton
                        icon={<ChipStackIcon />}
                        label="Hand Histories"
                        onClick={() => router.push('/hub/hands')}
                    />
                    <ActionButton
                        icon={<TermsIcon />}
                        label="Terms of Service"
                        onClick={() => router.push('/terms')}
                    />
                </div>
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

function ActionButton({ icon, label, onClick }) {
    return (
        <button style={styles.actionBtn} onClick={onClick}>
            <div style={styles.actionIconCircle}>
                {icon}
            </div>
            <span style={styles.actionLabel}>{label}</span>
        </button>
    );
}

// SVG Icons matching PokerBros exactly
function JoinIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="rgba(180,200,230,0.9)">
            <circle cx="9" cy="7" r="4" />
            <path d="M9 13c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" />
            <circle cx="18" cy="7" r="3" />
            <path d="M18 12c-1.1 0-2.1.2-3 .5 1.8 1 3 2.4 3 3.5v1h6v-1.5c0-1.93-3.13-3.5-6-3.5z" />
        </svg>
    );
}

function PlusIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="rgba(180,200,230,0.9)">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
        </svg>
    );
}

function InviteIcon() {
    return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="rgba(180,200,230,0.9)">
            <circle cx="9" cy="7" r="4" />
            <path d="M9 13c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" />
            <path d="M19 10h-2v2h-2v2h2v2h2v-2h2v-2h-2z" />
        </svg>
    );
}

function ChipStackIcon() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24">
            {/* Bottom chip */}
            <ellipse cx="12" cy="18" rx="8" ry="3" fill="#1a4a6e" />
            <ellipse cx="12" cy="17" rx="8" ry="3" fill="#2a6a9e" />
            {/* Middle chip */}
            <ellipse cx="12" cy="14" rx="8" ry="3" fill="#1a5a7e" />
            <ellipse cx="12" cy="13" rx="8" ry="3" fill="#3a8abe" />
            {/* Top chip */}
            <ellipse cx="12" cy="10" rx="8" ry="3" fill="#2a7aae" />
            <ellipse cx="12" cy="9" rx="8" ry="3" fill="#4a9ace" />
            {/* Chip details */}
            <ellipse cx="12" cy="9" rx="5" ry="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
        </svg>
    );
}

function TermsIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(180,200,230,0.9)">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 12h8v2H8v-2zm0 4h8v2H8v-2z" />
        </svg>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES - Pixel-Perfect PokerBros Clone
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(180deg, #0a1628 0%, #0c1e38 30%, #0e2445 60%, #091a2c 100%)',
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
        left: '16px',
        right: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 100,
    },
    logoGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    logoIcon: {
        width: '36px',
        height: '36px',
        background: 'linear-gradient(135deg, #c33 0%, #922 100%)',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(200,50,50,0.4)',
    },
    logoText: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#fff',
        letterSpacing: '0.3px',
    },
    statsGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    xpBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        background: 'linear-gradient(180deg, rgba(50,85,130,0.85) 0%, rgba(35,65,105,0.9) 100%)',
        border: '1px solid rgba(90,140,200,0.45)',
        borderRadius: '18px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#fff',
    },
    goldDiamond: { fontSize: '12px' },
    diamondBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        background: 'linear-gradient(180deg, rgba(75,55,115,0.85) 0%, rgba(55,40,90,0.9) 100%)',
        border: '1px solid rgba(130,90,170,0.45)',
        borderRadius: '18px',
        fontSize: '13px',
        fontWeight: 600,
        color: '#fff',
    },
    purpleHeart: { fontSize: '12px' },
    iconBtn: {
        width: '38px',
        height: '38px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
    },
    avatarCircle: {
        width: '26px',
        height: '26px',
        background: 'linear-gradient(135deg, #6a7 0%, #456 100%)',
        borderRadius: '50%',
    },
    menuLines: {
        color: '#fff',
        fontSize: '16px',
    },
    msgIcon: {
        fontSize: '16px',
    },
    msgBadge: {
        position: 'absolute',
        top: '-3px',
        right: '-3px',
        minWidth: '18px',
        height: '18px',
        background: '#e53935',
        borderRadius: '9px',
        fontSize: '11px',
        fontWeight: 700,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 5px',
    },

    // Title
    title: {
        position: 'absolute',
        top: '75px',
        fontSize: '22px',
        fontWeight: 400,
        color: '#fff',
        margin: 0,
        textShadow: '0 2px 10px rgba(0,0,0,0.4)',
    },

    // Carousel
    carouselArea: {
        display: 'flex',
        alignItems: 'center',
        gap: 0,
    },
    arrowBtn: {
        width: '36px',
        height: '36px',
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '50%',
        color: '#fff',
        fontSize: '24px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 6px',
        transition: 'background 0.2s',
    },

    // Side Cards
    sideCardLeft: {
        width: '60px',
        height: '190px',
        background: 'linear-gradient(180deg, rgba(15,35,60,0.92) 0%, rgba(10,25,45,0.95) 100%)',
        border: '1px solid rgba(60,110,160,0.35)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '-8px',
        zIndex: 1,
    },
    sideCardRight: {
        width: '65px',
        height: '190px',
        background: 'linear-gradient(180deg, rgba(15,35,60,0.92) 0%, rgba(10,25,45,0.95) 100%)',
        border: '1px solid rgba(60,110,160,0.35)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: '-8px',
        zIndex: 1,
        padding: '10px',
    },
    sideCardName: {
        fontSize: '11px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        letterSpacing: '1px',
    },
    sideStats: {
        fontSize: '9px',
        color: 'rgba(255,255,255,0.6)',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        marginTop: '8px',
        lineHeight: 1.5,
    },

    // Main Card
    mainCard: {
        position: 'relative',
        width: '360px',
        height: '210px',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '2px solid rgba(70,130,190,0.55)',
        boxShadow: '0 0 50px rgba(40,100,170,0.45), 0 0 100px rgba(30,80,140,0.2)',
        zIndex: 2,
    },
    pokerTableBg: {
        position: 'absolute',
        inset: 0,
        background: `
            radial-gradient(ellipse 80% 60% at 50% 80%, rgba(20,60,100,0.4) 0%, transparent 70%),
            radial-gradient(circle at 20% 30%, rgba(180,60,60,0.15) 0%, transparent 20%),
            radial-gradient(circle at 80% 35%, rgba(60,100,180,0.15) 0%, transparent 20%),
            radial-gradient(circle at 35% 70%, rgba(40,120,80,0.1) 0%, transparent 15%),
            radial-gradient(circle at 65% 65%, rgba(180,160,60,0.1) 0%, transparent 15%),
            linear-gradient(180deg, rgba(12,35,60,0.95) 0%, rgba(8,25,45,0.98) 100%)
        `,
    },
    cardGradientOverlay: {
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(10,30,55,0.3) 0%, rgba(5,20,40,0.5) 100%)',
    },
    cardContent: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: '16px',
    },
    clubName: {
        fontSize: '26px',
        fontWeight: 700,
        color: '#fff',
        margin: '0 0 10px 0',
        textShadow: '0 2px 8px rgba(0,0,0,0.5)',
    },
    statsRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        color: 'rgba(255,255,255,0.9)',
    },
    statIcon: { fontSize: '13px' },
    tableIcon: { fontSize: '13px' },
    enterBtn: {
        marginTop: '14px',
        padding: '12px 70px',
        background: 'linear-gradient(180deg, #5dc45d 0%, #4db84d 30%, #45a845 60%, #3d973d 100%)',
        border: 'none',
        borderRadius: '24px',
        color: '#fff',
        fontSize: '19px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(80,180,80,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
        textShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'transform 0.15s, box-shadow 0.15s',
    },

    // Dots
    dotsContainer: {
        position: 'absolute',
        bottom: '185px',
        display: 'flex',
        gap: '10px',
    },
    dot: {
        width: '24px',
        height: '5px',
        borderRadius: '3px',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.2s',
    },

    // Action Bar
    actionBar: {
        position: 'absolute',
        bottom: '24px',
        left: '24px',
        right: '24px',
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        padding: '26px 20px',
        background: 'linear-gradient(180deg, rgba(20,42,70,0.94) 0%, rgba(14,32,55,0.97) 100%)',
        border: '1px solid rgba(75,125,175,0.3)',
        borderRadius: '28px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -4px 30px rgba(0,0,0,0.3)',
    },
    actionBtn: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        transition: 'transform 0.15s',
    },
    actionIconCircle: {
        width: '60px',
        height: '60px',
        background: 'linear-gradient(180deg, rgba(40,65,100,0.9) 0%, rgba(28,50,80,0.95) 100%)',
        border: '2px solid rgba(80,130,190,0.5)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
    },
    actionLabel: {
        fontSize: '11px',
        fontWeight: 500,
        color: 'rgba(255,255,255,0.85)',
        textAlign: 'center',
        maxWidth: '70px',
    },
};
