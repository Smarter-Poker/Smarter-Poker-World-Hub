/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Players (Club Members List)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

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
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)', paddingBottom: '80px' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={backBtn}>
                        &#8592; Back to Lobby
                    </button>

                    <h1 style={pageTitle}>Club Players</h1>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading...
                        </div>
                    ) : (
                        <>
                            {members.length > 0 ? (
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {members.map((member, i) => (
                                        <div key={member.id || i} style={listItem}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={avatarCircle}>
                                                    {member.profiles?.avatar_url ? (
                                                        <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <span>👤</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                                        {member.profiles?.alias || member.profiles?.username || 'Unknown Player'}
                                                    </div>
                                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>
                                                        {member.role || 'Member'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', color: '#00d4ff' }}>
                                                {member.chip_balance?.toLocaleString() || 0} chips
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={emptyState}>
                                    <p>No players in this club yet.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Bottom Navigation */}
                {club && (
                    <nav style={bottomNav}>
                        <div style={bottomNavItems}>
                            <Link href={`/hub/club-arena/messages?club=${club.club_id}`} style={bottomNavItem}>
                                <svg style={bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm0 15.17L18.83 16H4V4h16v13.17zM7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z" />
                                </svg>
                                <span style={bottomNavLabel}>Messages</span>
                            </Link>
                            <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={{ ...bottomNavItem, color: '#00d4ff' }}>
                                <svg style={bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                                </svg>
                                <span style={bottomNavLabel}>Players</span>
                            </Link>
                            <Link href={`/hub/club-arena/cashier?club=${club.club_id}`} style={bottomNavItem}>
                                <svg style={bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-2 0H3V6h14v8zm-7-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm13 0v11c0 1.1-.9 2-2 2H4v-2h17V7h2z" />
                                </svg>
                                <span style={bottomNavLabel}>Cashier</span>
                            </Link>
                            <Link href={`/hub/club-arena/player-stats?club=${club.club_id}`} style={bottomNavItem}>
                                <svg style={bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                                </svg>
                                <span style={bottomNavLabel}>Data</span>
                            </Link>
                            <Link href={`/hub/club-arena/admin?club=${club.club_id}`} style={bottomNavItem}>
                                <svg style={bottomNavIcon} viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                                </svg>
                                <span style={bottomNavLabel}>Admin</span>
                            </Link>
                        </div>
                    </nav>
                )}
            </div>
        </>
    );
}

const backBtn = {
    background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)',
    color: '#00d4ff', padding: '8px 16px', borderRadius: '8px',
    cursor: 'pointer', marginBottom: '20px', fontFamily: 'Inter, sans-serif', fontSize: '13px',
};

const pageTitle = {
    fontFamily: 'Orbitron, sans-serif', fontSize: '24px', fontWeight: 700,
    color: '#fff', marginBottom: '24px',
};

const listItem = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', borderRadius: '10px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
};

const avatarCircle = {
    width: '40px', height: '40px', borderRadius: '50%',
    background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '18px',
};

const emptyState = {
    textAlign: 'center', padding: '40px 20px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: '14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px',
};

const bottomNav = {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000,
    background: 'linear-gradient(180deg, rgba(15, 25, 40, 0.98) 0%, rgba(8, 15, 25, 0.99) 100%)',
    borderTop: '1px solid rgba(0, 180, 255, 0.2)',
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
};

const bottomNavItems = {
    display: 'flex', alignItems: 'stretch', justifyContent: 'space-around', padding: '8px 0',
};

const bottomNavItem = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '4px', flex: 1, padding: '8px 4px', textDecoration: 'none',
    color: 'rgba(255, 255, 255, 0.5)', transition: 'all 0.2s ease', borderRadius: '8px', margin: '0 4px',
};

const bottomNavIcon = { width: '24px', height: '24px', transition: 'all 0.2s ease' };

const bottomNavLabel = { fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' };
