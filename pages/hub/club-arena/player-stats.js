/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Player Stats
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function PlayerStats() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [stats, setStats] = useState(null);
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
                    .from('commander_player_sessions')
                    .select('*')
                    .eq('user_id', authUser.id)
                    .order('created_at', { ascending: false })
                    .limit(20);
                setStats(data || []);
            }
        } catch (e) {
            console.error('[PlayerStats] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    const statCards = [
        { label: 'Sessions Played', value: stats?.length || 0, color: '#00d4ff' },
        { label: 'Total Hours', value: '0', color: '#00ff66' },
        { label: 'Biggest Win', value: '0', color: '#fbbf24' },
        { label: 'Win Rate', value: '0%', color: '#00d4ff' },
    ];

    return (
        <>
            <Head>
                <title>Player Stats | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/club-arena')} style={backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    <h1 style={pageTitle}>Player Stats</h1>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading stats...
                        </div>
                    ) : !user ? (
                        <div style={emptyState}>
                            <p>Sign in to view your player stats</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                                {statCards.map(s => (
                                    <div key={s.label} style={statCard}>
                                        <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            <h2 style={sectionTitle}>Recent Sessions</h2>
                            {stats && stats.length > 0 ? (
                                stats.map((session, i) => (
                                    <div key={session.id || i} style={listItem}>
                                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                            Session #{stats.length - i}
                                        </div>
                                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>
                                            {session.created_at ? new Date(session.created_at).toLocaleDateString() : 'N/A'}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={emptyState}>
                                    <p>No sessions recorded yet. Join a game to start tracking stats.</p>
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

const statCard = {
    padding: '20px', background: 'rgba(0, 212, 255, 0.05)',
    border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '14px',
    textAlign: 'center',
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
