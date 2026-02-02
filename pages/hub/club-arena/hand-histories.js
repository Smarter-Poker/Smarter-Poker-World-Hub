/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Hand Histories
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function HandHistories() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [hands, setHands] = useState([]);
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
                const { data } = await supabase
                    .from('commander_hand_history')
                    .select('*')
                    .eq('user_id', authUser.id)
                    .order('created_at', { ascending: false })
                    .limit(30);
                setHands(data || []);
            }
        } catch (e) {
            console.error('[HandHistories] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <Head>
                <title>Hand Histories | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/club-arena')} style={backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    <h1 style={pageTitle}>Hand Histories</h1>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading hand histories...
                        </div>
                    ) : !user ? (
                        <div style={emptyState}>
                            <p>Sign in to view your hand histories</p>
                        </div>
                    ) : hands.length > 0 ? (
                        hands.map((hand, i) => (
                            <div key={hand.id || i} style={handCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '12px', fontWeight: 600, color: '#00d4ff' }}>
                                        Hand #{hand.hand_number || hands.length - i}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                                        {hand.created_at ? new Date(hand.created_at).toLocaleString() : 'N/A'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ color: '#fff', fontSize: '14px' }}>
                                        {hand.game_type || 'NL Hold\'em'}
                                    </div>
                                    <div style={{ color: hand.result > 0 ? '#00ff66' : hand.result < 0 ? '#ff4d4d' : 'rgba(255,255,255,0.5)', fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 700 }}>
                                        {hand.result > 0 ? '+' : ''}{hand.result || 0}
                                    </div>
                                </div>
                                {hand.hole_cards && (
                                    <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '16px', letterSpacing: '4px' }}>
                                        {hand.hole_cards}
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div style={emptyState}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\u{1F0CF}'}</div>
                            <p>No hand histories yet.</p>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
                                Your played hands will be recorded here for review and analysis.
                            </p>
                        </div>
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

const handCard = {
    padding: '16px', borderRadius: '12px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    marginBottom: '10px',
};

const emptyState = {
    textAlign: 'center', padding: '40px 20px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: '14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px',
};
