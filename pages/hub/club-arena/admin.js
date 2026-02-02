/* CLUB ARENA — Admin | Facebook Classic */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const FB = { primary: '#1877F2', background: '#f0f2f5', cardBg: '#ffffff', textPrimary: '#1c1e21', textSecondary: '#65676b', border: '#dddfe2', success: '#42b72a', error: '#fa3e3e' };

export default function Admin() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

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
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);
                if (authUser) {
                    const { data: membership } = await supabase.from('club_members').select('role').eq('club_id', clubData.id).eq('user_id', authUser.id).single();
                    setIsAdmin(membership?.role === 'owner' || membership?.role === 'admin');
                }
            }
        } catch (e) { console.error('[Admin] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, card: { padding: '20px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '16px' }, cardTitle: { fontSize: '16px', fontWeight: 600, color: FB.textPrimary, marginBottom: '12px' }, btn: { padding: '12px', background: FB.primary, border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 600, color: '#fff', cursor: 'pointer', width: '100%', marginBottom: '10px' }, btnDanger: { background: FB.error }, denied: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px' }, lockIcon: { fontSize: '48px', marginBottom: '16px', display: 'block' }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    return (
        <>
            <Head><title>Club Admin | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Club Admin</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : !isAdmin ? (
                        <div style={S.denied}>
                            <span style={S.lockIcon}>🔒</span>
                            <p style={{ color: FB.textPrimary, fontWeight: 600, marginBottom: '8px' }}>You don't have admin access to this club.</p>
                            <p style={{ color: FB.textSecondary, fontSize: '14px' }}>Contact the club owner for access.</p>
                        </div>
                    ) : (
                        <>
                            <div style={S.card}><div style={S.cardTitle}>Club Settings</div><button style={S.btn}>Edit Club Info</button><button style={S.btn}>Manage Roles</button><button style={S.btn}>Club Rules</button></div>
                            <div style={S.card}><div style={S.cardTitle}>Table Management</div><button style={S.btn}>Create Table</button><button style={S.btn}>Edit Stakes</button></div>
                            <div style={S.card}><div style={S.cardTitle}>Member Management</div><button style={S.btn}>Invite Players</button><button style={S.btn}>Ban List</button></div>
                            <div style={S.card}><div style={S.cardTitle}>Danger Zone</div><button style={{ ...S.btn, ...S.btnDanger }}>Delete Club</button></div>
                        </>
                    )}
                </div>
                {club && <nav style={S.bottomNav}><div style={S.bottomNavItems}>
                    <Link href={`/hub/club-arena/messages?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" /></svg><span style={S.bottomNavLabel}>Messages</span></Link>
                    <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg><span style={S.bottomNavLabel}>Players</span></Link>
                    <Link href={`/hub/club-arena/cashier?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z" /></svg><span style={S.bottomNavLabel}>Cashier</span></Link>
                    <Link href={`/hub/club-arena/player-stats?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg><span style={S.bottomNavLabel}>Data</span></Link>
                    <Link href={`/hub/club-arena/admin?club=${club.club_id}`} style={{ ...S.bottomNavItem, color: FB.primary }}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg><span style={S.bottomNavLabel}>Admin</span></Link>
                </div></nav>}
            </div>
        </>
    );
}
