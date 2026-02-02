/* CLUB ARENA — Marketplace | Facebook Classic */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const FB = { primary: '#1877F2', background: '#f0f2f5', cardBg: '#ffffff', textPrimary: '#1c1e21', textSecondary: '#65676b', border: '#dddfe2', success: '#42b72a' };

export default function Marketplace() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [club, setClub] = useState(null);
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => { if (clubIdParam) loadData(); }, [clubIdParam]);

    async function loadData() {
        try {
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) {
                setClub(clubData);
                // Mock marketplace items
                setItems([
                    { id: 1, name: 'Chip Bundle 10K', price: 500, icon: '💎' },
                    { id: 2, name: 'VIP Table Access', price: 1000, icon: '⭐' },
                    { id: 3, name: 'Custom Avatar', price: 250, icon: '🎨' },
                    { id: 4, name: 'Tournament Entry', price: 750, icon: '🏆' },
                ]);
            }
        } catch (e) { console.error('[Marketplace] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, itemGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }, itemCard: { padding: '20px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, textAlign: 'center' }, itemIcon: { fontSize: '36px', marginBottom: '10px' }, itemName: { fontSize: '14px', fontWeight: 600, color: FB.textPrimary, marginBottom: '6px' }, itemPrice: { fontSize: '16px', fontWeight: 700, color: FB.primary }, buyBtn: { marginTop: '12px', padding: '10px', background: FB.primary, border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer', width: '100%' }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    return (
        <>
            <Head><title>Marketplace | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>🛒 Marketplace</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : (
                        <div style={S.itemGrid}>
                            {items.map((item) => (
                                <div key={item.id} style={S.itemCard}>
                                    <div style={S.itemIcon}>{item.icon}</div>
                                    <div style={S.itemName}>{item.name}</div>
                                    <div style={S.itemPrice}>{item.price} 💎</div>
                                    <button style={S.buyBtn}>Buy Now</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {club && <nav style={S.bottomNav}><div style={S.bottomNavItems}>
                    <Link href={`/hub/club-arena/messages?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z" /></svg><span style={S.bottomNavLabel}>Messages</span></Link>
                    <Link href={`/hub/club-arena/players?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" /></svg><span style={S.bottomNavLabel}>Players</span></Link>
                    <Link href={`/hub/club-arena/cashier?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2z" /></svg><span style={S.bottomNavLabel}>Cashier</span></Link>
                    <Link href={`/hub/club-arena/player-stats?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg><span style={S.bottomNavLabel}>Data</span></Link>
                    <Link href={`/hub/club-arena/admin?club=${club.club_id}`} style={S.bottomNavItem}><svg style={S.bottomNavIcon} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61" /></svg><span style={S.bottomNavLabel}>Admin</span></Link>
                </div></nav>}
            </div>
        </>
    );
}
