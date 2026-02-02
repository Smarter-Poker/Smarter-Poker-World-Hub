/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Cashier (Play Money Chip Management)
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function Cashier() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

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
                // Fetch chip balance
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('diamonds')
                    .eq('id', authUser.id)
                    .single();
                if (profile) setBalance(profile.diamonds || 0);

                // Fetch recent transactions
                const { data: txns } = await supabase
                    .from('commander_buyin_transactions')
                    .select('*')
                    .eq('user_id', authUser.id)
                    .order('created_at', { ascending: false })
                    .limit(15);
                setTransactions(txns || []);
            }
        } catch (e) {
            console.error('[Cashier] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <Head>
                <title>Cashier | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/club-arena')} style={backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    <h1 style={pageTitle}>Cashier</h1>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading...
                        </div>
                    ) : !user ? (
                        <div style={emptyState}>
                            <p>Sign in to access the cashier</p>
                        </div>
                    ) : (
                        <>
                            {/* Balance card */}
                            <div style={{
                                padding: '30px', borderRadius: '18px',
                                background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(0,100,200,0.06) 100%)',
                                border: '1px solid rgba(0,212,255,0.25)',
                                textAlign: 'center', marginBottom: '24px',
                            }}>
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'Orbitron, sans-serif', letterSpacing: '2px', marginBottom: '8px' }}>
                                    PLAY MONEY BALANCE
                                </div>
                                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '40px', fontWeight: 700, color: '#00d4ff' }}>
                                    {balance.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '11px', color: 'rgba(0,255,102,0.7)', marginTop: '8px', fontFamily: 'Orbitron, sans-serif' }}>
                                    NO CASH VALUE
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '30px' }}>
                                <button style={cashierBtn}>
                                    Buy-In
                                </button>
                                <button style={{ ...cashierBtn, background: 'linear-gradient(135deg, #00ff66, #00cc52)' }}>
                                    Cash Out
                                </button>
                            </div>

                            {/* Transaction history */}
                            <h2 style={sectionTitle}>Transaction History</h2>
                            {transactions.length > 0 ? (
                                transactions.map((tx, i) => (
                                    <div key={tx.id || i} style={listItem}>
                                        <div>
                                            <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                                {tx.type === 'buyin' ? 'Buy-In' : tx.type === 'cashout' ? 'Cash Out' : (tx.type || 'Transaction')}
                                            </div>
                                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '2px' }}>
                                                {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 700,
                                            color: tx.type === 'cashout' ? '#00ff66' : '#00d4ff',
                                        }}>
                                            {tx.type === 'cashout' ? '+' : '-'}{Math.abs(tx.amount || 0).toLocaleString()}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={emptyState}>
                                    <p>No transactions yet.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
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

const sectionTitle = {
    fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 600,
    color: '#00d4ff', marginBottom: '16px', letterSpacing: '2px',
};

const cashierBtn = {
    padding: '14px', background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
    border: 'none', borderRadius: '12px', fontFamily: 'Orbitron, sans-serif',
    fontSize: '13px', fontWeight: 700, color: '#000', cursor: 'pointer',
};

const listItem = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px', borderRadius: '10px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)', marginBottom: '8px',
};

const emptyState = {
    textAlign: 'center', padding: '40px 20px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: '14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px',
};
