/* CLUB ARENA — Admin | Facebook Dark Theme */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

const FB = { primary: '#2374E1', background: '#18191A', cardBg: '#242526', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042', danger: '#FA383E' };

export default function Admin() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [club, setClub] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

    async function loadData() {
        try {
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) setClub(clubData);
        } catch (e) { console.error('[Admin] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, sectionTitle: { fontSize: '12px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', marginTop: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' }, actionCard: { display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px', cursor: 'pointer' }, iconBox: { width: '44px', height: '44px', borderRadius: '8px', background: FB.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }, actionTitle: { color: FB.textPrimary, fontSize: '15px', fontWeight: 600 }, actionDesc: { color: FB.textSecondary, fontSize: '13px', marginTop: '2px' }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    const adminOptions = [
        { icon: '👥', title: 'Manage Members', desc: 'Add, remove, or update player roles', color: FB.primary },
        { icon: '💰', title: 'Chip Management', desc: 'Issue or adjust player chip balances', color: '#31A24C' },
        { icon: '🎲', title: 'Table Settings', desc: 'Configure stakes, limits, and game types', color: '#F7C52A' },
        { icon: '📊', title: 'Club Reports', desc: 'View club statistics and activity', color: '#F582AE' },
        { icon: '⚙️', title: 'Club Settings', desc: 'Edit club name, avatar, and privacy', color: FB.textSecondary },
        { icon: '🚫', title: 'Danger Zone', desc: 'Delete club or transfer ownership', color: FB.danger },
    ];

    return (
        <>
            <Head><title>Club Admin | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Club Admin</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : (
                        <>
                            <h2 style={S.sectionTitle}>Administration</h2>
                            {adminOptions.map((opt, i) => (
                                <div key={i} style={S.actionCard}>
                                    <div style={{ ...S.iconBox, background: opt.color }}>{opt.icon}</div>
                                    <div><div style={S.actionTitle}>{opt.title}</div><div style={S.actionDesc}>{opt.desc}</div></div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
                <ClubArenaBottomNav clubId={clubIdParam} activePage="admin" />
            </div>
        </>
    );
}
