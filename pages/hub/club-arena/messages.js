/* CLUB ARENA — Messages | Facebook Dark Theme */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

const FB = { primary: '#2374E1', background: '#18191A', cardBg: '#242526', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042' };

export default function Messages() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [club, setClub] = useState(null);
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

    async function loadData() {
        try {
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);
                const { data: msgData } = await supabase.from('club_messages').select('*, profiles:sender_id(username, alias, avatar_url)').eq('club_id', clubData.id).order('created_at', { ascending: false }).limit(50);
                setMessages(msgData || []);
            }
        } catch (e) { console.error('[Messages] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, msgCard: { display: 'flex', gap: '12px', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px' }, avatar: { width: '40px', height: '40px', borderRadius: '50%', background: FB.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }, senderName: { color: FB.primary, fontSize: '14px', fontWeight: 600 }, msgTime: { color: FB.textSecondary, fontSize: '12px' }, msgText: { color: FB.textPrimary, fontSize: '14px', marginTop: '4px' }, emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    return (
        <>
            <Head><title>Messages | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Club Messages</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : messages.length > 0 ? messages.map((msg, i) => (
                        <div key={msg.id || i} style={S.msgCard}>
                            <div style={S.avatar}>{msg.profiles?.avatar_url ? <img src={msg.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : '👤'}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={S.senderName}>{msg.profiles?.alias || msg.profiles?.username || 'Unknown'}</span><span style={S.msgTime}>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ''}</span></div>
                                <div style={S.msgText}>{msg.content || msg.message || ''}</div>
                            </div>
                        </div>
                    )) : <div style={S.emptyState}><span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>💬</span><p>No messages yet.</p></div>}
                </div>
                <ClubArenaBottomNav clubId={clubIdParam} activePage="messages" />
            </div>
        </>
    );
}
