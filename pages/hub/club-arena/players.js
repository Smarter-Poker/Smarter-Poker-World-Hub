/* CLUB ARENA — Players | Facebook Dark Theme */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

const FB = { primary: '#2374E1', background: '#18191A', cardBg: '#242526', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042' };

export default function Players() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [club, setClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

    async function loadData() {
        try {
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);
                const { data: memberData } = await supabase.from('club_members').select('*, profiles:user_id(username, alias, avatar_url)').eq('club_id', clubData.id);
                setMembers(memberData || []);
            }
        } catch (e) { console.error('[Players] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, memberCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px' }, avatar: { width: '44px', height: '44px', borderRadius: '50%', background: FB.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#fff' }, memberName: { color: FB.textPrimary, fontSize: '15px', fontWeight: 600 }, memberRole: { color: FB.textSecondary, fontSize: '13px', marginTop: '2px' }, chipBalance: { fontSize: '14px', fontWeight: 600, color: FB.primary }, emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    return (
        <>
            <Head><title>Players | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Club Players</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : members.length > 0 ? members.map((member, i) => (
                        <div key={member.id || i} style={S.memberCard}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={S.avatar}>{member.profiles?.avatar_url ? <img src={member.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : '👤'}</div>
                                <div><div style={S.memberName}>{member.profiles?.alias || member.profiles?.username || 'Unknown Player'}</div><div style={S.memberRole}>{member.role || 'Member'}</div></div>
                            </div>
                            <div style={S.chipBalance}>{member.chip_balance?.toLocaleString() || 0} chips</div>
                        </div>
                    )) : <div style={S.emptyState}><span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>👥</span><p>No players in this club yet.</p></div>}
                </div>
                <ClubArenaBottomNav clubId={clubIdParam} activePage="players" />
            </div>
        </>
    );
}
