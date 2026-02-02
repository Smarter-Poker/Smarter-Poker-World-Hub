/* CLUB ARENA — Messages | Facebook Classic */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const FB = { primary: '#1877F2', background: '#f0f2f5', cardBg: '#ffffff', textPrimary: '#1c1e21', textSecondary: '#65676b', border: '#dddfe2' };

export default function Messages() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [messages, setMessages] = useState([]);
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
                const { data: msgData } = await supabase.from('club_messages').select('*, profiles:sender_id(username, alias, avatar_url)').eq('club_id', clubData.id).order('created_at', { ascending: false }).limit(50);
                setMessages(msgData || []);
            }
        } catch (e) { console.error('[Messages] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, msgCard: { display: 'flex', gap: '12px', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '10px' }, avatar: { width: '40px', height: '40px', borderRadius: '50%', background: FB.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }, senderName: { color: FB.primary, fontSize: '14px', fontWeight: 600 }, msgTime: { color: FB.textSecondary, fontSize: '12px' }, msgText: { color: FB.textPrimary, fontSize: '14px', marginTop: '4px' }, emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

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
                {club && <nav style={S.bottomNav}><div style={S.bottomNavItems}>
                    <Link href={`/hub/club-arena/messages?club=${club.club_id}`} style={{ ...S.bottomNavItem, color: FB.primary }}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" /></svg><span style={S.bottomNavLabel}>Messages</span></Link>
                    <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg><span style={S.bottomNavLabel}>Players</span></Link>
                    <Link href={`/hub/club-arena/cashier?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z" /></svg><span style={S.bottomNavLabel}>Cashier</span></Link>
                    <Link href={`/hub/club-arena/player-stats?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg><span style={S.bottomNavLabel}>Data</span></Link>
                    <Link href={`/hub/club-arena/admin?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg><span style={S.bottomNavLabel}>Admin</span></Link>
                </div></nav>}
            </div>
        </>
    );
}
