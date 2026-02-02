/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Players (Club Members List)
   Facebook Classic Color Scheme
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

// Facebook Classic Color Scheme
const FB = {
    primary: '#1877F2',
    primaryLight: '#E7F3FF',
    background: '#f0f2f5',
    cardBg: '#ffffff',
    textPrimary: '#1c1e21',
    textSecondary: '#65676b',
    border: '#dddfe2',
    borderLight: '#e4e6eb',
    success: '#42b72a',
};

export default function Players() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (clubIdParam) loadData();
    }, [clubIdParam]);

    async function loadData() {
        try {
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

                // Load club members
                const { data: memberData } = await supabase
                    .from('club_members')
                    .select('*, profiles:user_id(username, alias, avatar_url)')
                    .eq('club_id', clubData.id);
                setMembers(memberData || []);
            }
        } catch (e) {
            console.error('[Players] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <Head>
                <title>Players | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            <div style={styles.page}>
                <UniversalHeader pageDepth={2} />

                <div style={styles.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={styles.backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={styles.pageTitle}>Club Players</h1>

                    {isLoading ? (
                        <div style={styles.loading}>Loading...</div>
                    ) : (
                        <>
                            {members.length > 0 ? (
                                <div style={styles.memberList}>
                                    {members.map((member, i) => (
                                        <div key={member.id || i} style={styles.memberCard}>
                                            <div style={styles.memberInfo}>
                                                <div style={styles.avatar}>
                                                    {member.profiles?.avatar_url ? (
                                                        <img src={member.profiles.avatar_url} alt="" style={styles.avatarImg} />
                                                    ) : (
                                                        <span>👤</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={styles.memberName}>
                                                        {member.profiles?.alias || member.profiles?.username || 'Unknown Player'}
                                                    </div>
                                                    <div style={styles.memberRole}>{member.role || 'Member'}</div>
                                                </div>
                                            </div>
                                            <div style={styles.chipBalance}>
                                                {member.chip_balance?.toLocaleString() || 0} chips
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={styles.emptyState}>
                                    <span style={{ fontSize: '40px', marginBottom: '12px', display: 'block' }}>👥</span>
                                    <p>No players in this club yet.</p>
                                </div>
                            )}
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
                            <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={{ ...styles.bottomNavItem, color: FB.primary }}>
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
            </div>
        </>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: FB.background,
        paddingBottom: '80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    },
    container: {
        padding: '16px 20px 40px',
        maxWidth: '600px',
        margin: '0 auto',
    },
    backBtn: {
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        color: FB.primary,
        padding: '8px 16px',
        borderRadius: '6px',
        cursor: 'pointer',
        marginBottom: '16px',
        fontSize: '14px',
        fontWeight: 600,
    },
    pageTitle: {
        fontSize: '24px',
        fontWeight: 700,
        color: FB.textPrimary,
        marginBottom: '20px',
    },
    loading: {
        textAlign: 'center',
        padding: '60px 0',
        color: FB.textSecondary,
        fontSize: '15px',
    },
    memberList: {
        display: 'grid',
        gap: '10px',
    },
    memberCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 16px',
        borderRadius: '8px',
        background: FB.cardBg,
        border: `1px solid ${FB.borderLight}`,
    },
    memberInfo: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    avatar: {
        width: '44px',
        height: '44px',
        borderRadius: '50%',
        background: FB.primary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        color: '#fff',
    },
    avatarImg: {
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        objectFit: 'cover',
    },
    memberName: {
        color: FB.textPrimary,
        fontSize: '15px',
        fontWeight: 600,
    },
    memberRole: {
        color: FB.textSecondary,
        fontSize: '13px',
        marginTop: '2px',
    },
    chipBalance: {
        fontSize: '14px',
        fontWeight: 600,
        color: FB.primary,
    },
    emptyState: {
        textAlign: 'center',
        padding: '40px 20px',
        background: FB.cardBg,
        border: `1px solid ${FB.border}`,
        borderRadius: '8px',
        color: FB.textSecondary,
        fontSize: '15px',
    },
    bottomNav: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: FB.cardBg,
        borderTop: `1px solid ${FB.border}`,
        boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.1)',
    },
    bottomNavItems: {
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        padding: '6px 0',
    },
    bottomNavItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2px',
        flex: 1,
        padding: '8px 4px',
        textDecoration: 'none',
        color: FB.textSecondary,
        transition: 'all 0.2s ease',
    },
    bottomNavIcon: {
        width: '24px',
        height: '24px',
    },
    bottomNavLabel: {
        fontSize: '11px',
        fontWeight: 600,
    },
};
