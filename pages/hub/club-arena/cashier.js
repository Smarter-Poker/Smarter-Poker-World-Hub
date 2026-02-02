/* CLUB ARENA — Cashier | Facebook Dark Theme */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import ClubArenaBottomNav from '../../../src/components/club-arena/ClubArenaBottomNav';

// Facebook Dark Color Scheme
const FB = { primary: '#2374E1', background: '#18191A', cardBg: '#242526', textPrimary: '#E4E6EB', textSecondary: '#B0B3B8', border: '#3E4042', success: '#31A24C', hover: '#3A3B3C' };

export default function Cashier() {
    const router = useRouter();
    const { club: clubIdParam } = router.query;
    const [user, setUser] = useState(null);
    const [club, setClub] = useState(null);
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
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
            if (authUser) {
                setUser(authUser);
                const { data: profile } = await supabase.from('profiles').select('diamonds').eq('id', authUser.id).single();
                if (profile) setBalance(profile.diamonds || 0);
                const { data: txns } = await supabase.from('commander_buyin_transactions').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false }).limit(15);
                setTransactions(txns || []);
            }
            const { data: clubData } = await supabase.from('clubs').select('*').eq('club_id', clubIdParam).single();
            if (clubData) setClub(clubData);
        } catch (e) { console.error('[Cashier] Error:', e); } finally { setIsLoading(false); }
    }

    const S = { page: { minHeight: '100vh', background: FB.background, paddingBottom: '80px', fontFamily: '-apple-system, sans-serif' }, container: { padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }, backBtn: { background: FB.cardBg, border: `1px solid ${FB.border}`, color: FB.primary, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginBottom: '16px', fontSize: '14px', fontWeight: 600 }, pageTitle: { fontSize: '24px', fontWeight: 700, color: FB.textPrimary, marginBottom: '20px' }, loading: { textAlign: 'center', padding: '60px 0', color: FB.textSecondary, fontSize: '15px' }, balanceCard: { padding: '24px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, textAlign: 'center', marginBottom: '20px' }, balanceLabel: { fontSize: '12px', color: FB.textSecondary, letterSpacing: '1px', marginBottom: '8px', fontWeight: 600 }, balanceAmount: { fontSize: '36px', fontWeight: 700, color: FB.primary }, balanceNote: { fontSize: '11px', color: FB.success, marginTop: '8px', fontWeight: 600 }, actionGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }, actionBtn: { padding: '14px', background: FB.primary, border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: 600, color: '#fff', cursor: 'pointer' }, sectionTitle: { fontSize: '14px', fontWeight: 700, color: FB.textSecondary, marginBottom: '12px', textTransform: 'uppercase' }, listItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderRadius: '8px', background: FB.cardBg, border: `1px solid ${FB.border}`, marginBottom: '8px' }, txType: { color: FB.textPrimary, fontSize: '15px', fontWeight: 600 }, txDate: { color: FB.textSecondary, fontSize: '12px', marginTop: '2px' }, txAmount: { fontSize: '15px', fontWeight: 700 }, emptyState: { textAlign: 'center', padding: '40px 20px', background: FB.cardBg, border: `1px solid ${FB.border}`, borderRadius: '8px', color: FB.textSecondary, fontSize: '15px' }, bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: FB.cardBg, borderTop: `1px solid ${FB.border}`, boxShadow: '0 -2px 10px rgba(0,0,0,0.3)' }, bottomNavItems: { display: 'flex', justifyContent: 'space-around', padding: '6px 0' }, bottomNavItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, padding: '8px 4px', textDecoration: 'none', color: FB.textSecondary }, bottomNavIcon: { width: '24px', height: '24px' }, bottomNavLabel: { fontSize: '11px', fontWeight: 600 } };

    return (
        <>
            <Head><title>Cashier | Club Arena</title><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" /></Head>
            <div style={S.page}>
                <UniversalHeader pageDepth={2} />
                <div style={S.container}>
                    <button onClick={() => router.push(`/hub/club-arena/lobby?club=${clubIdParam}`)} style={S.backBtn}>&#8592; Back to Lobby</button>
                    <h1 style={S.pageTitle}>Cashier</h1>
                    {isLoading ? <div style={S.loading}>Loading...</div> : !user ? <div style={S.emptyState}><p>Sign in to access the cashier</p></div> : (
                        <>
                            <div style={S.balanceCard}><div style={S.balanceLabel}>PLAY MONEY BALANCE</div><div style={S.balanceAmount}>{balance.toLocaleString()}</div><div style={S.balanceNote}>NO CASH VALUE</div></div>
                            <div style={S.actionGrid}><button style={S.actionBtn}>Buy-In</button><button style={{ ...S.actionBtn, background: FB.success }}>Cash Out</button></div>
                            <h2 style={S.sectionTitle}>Transaction History</h2>
                            {transactions.length > 0 ? transactions.map((tx, i) => (
                                <div key={tx.id || i} style={S.listItem}>
                                    <div><div style={S.txType}>{tx.type === 'buyin' ? 'Buy-In' : tx.type === 'cashout' ? 'Cash Out' : (tx.type || 'Transaction')}</div><div style={S.txDate}>{tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}</div></div>
                                    <div style={{ ...S.txAmount, color: tx.type === 'cashout' ? FB.success : FB.primary }}>{tx.type === 'cashout' ? '+' : '-'}{Math.abs(tx.amount || 0).toLocaleString()}</div>
                                </div>
                            )) : <div style={S.emptyState}><p>No transactions yet.</p></div>}
                        </>
                    )}
                </div>
                <ClubArenaBottomNav clubId={clubIdParam} activePage="cashier" />
            </div>
        </>
    );
}
