/* CLUB ARENA — Player Stats | Facebook Dark Theme */
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

const FB = { primary: '#2374E1', background: '#18191A', cardBg: '#242526', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042', success: '#31A24C' };

export default function PlayerStats() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [club, setClub] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

    async function loadData() {
        try {
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) setClub(clubData);
        } catch (e) { console.error('[PlayerStats] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }, statCard: { padding: '20px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, textAlign: 'center' }, statValue: { fontSize: '28px', fontWeight: 700, color: FB.primary }, statLabel: { fontSize: '12px', color: FB.textSecondary, marginTop: '6px', fontWeight: 600, textTransform: 'uppercase' }, sectionTitle: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' }, listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' }, itemLabel: { color: FB.textPrimary, fontSize: '15px', fontWeight: 500 }, itemValue: { color: FB.textSecondary, fontSize: '14px' }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    const stats = [
        { value: '0', label: 'Hands Played' },
        { value: '0', label: 'Win Rate' },
        { value: '0', label: 'Best Hand' },
        { value: '0', label: 'Tournaments' },
    ];

    return (
        <>
            <Head><title>Player Stats | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Player Stats</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : (
                        <>
                            <div style={S.statGrid}>
                                {stats.map((stat, i) => <div key={i} style={S.statCard}><div style={S.statValue}>{stat.value}</div><div style={S.statLabel}>{stat.label}</div></div>)}
                            </div>
                            <h2 style={S.sectionTitle}>Recent Activity</h2>
                            <div style={S.listItem}><span style={S.itemLabel}>No activity yet</span><span style={S.itemValue}>—</span></div>
                        </>
                    )}
                </div>
                <ClubArenaBottomNav clubId={clubIdParam} activePage="data" />
            </div>
        </>
    );
}
