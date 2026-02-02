/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Leaderboards
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

export default function Leaderboard() {
    const router = useRouter();
    const [tab, setTab] = useState('weekly');
    const [entries, setEntries] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadLeaderboard();
    }, [tab]);

    async function loadLeaderboard() {
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('commander_leaderboard_entries')
                .select('*, profiles(username, full_name, avatar_url)')
                .order('score', { ascending: false })
                .limit(20);
            setEntries(data || []);
        } catch (e) {
            console.error('[Leaderboard] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    const tabs = [
        { id: 'weekly', label: 'WEEKLY' },
        { id: 'monthly', label: 'MONTHLY' },
        { id: 'alltime', label: 'ALL TIME' },
    ];

    const rankBadge = (rank) => {
        if (rank === 1) return { text: '1ST', bg: 'linear-gradient(135deg, #FFD700, #FFC107)' };
        if (rank === 2) return { text: '2ND', bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)' };
        if (rank === 3) return { text: '3RD', bg: 'linear-gradient(135deg, #CD7F32, #B87333)' };
        return { text: `#${rank}`, bg: 'rgba(0,212,255,0.15)' };
    };

    return (
        <>
            <Head>
                <title>Leaderboards | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/club-arena')} style={backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    <h1 style={pageTitle}>Leaderboards</h1>

                    {/* Tab bar */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '4px' }}>
                        {tabs.map(t => (
                            <button key={t.id} onClick={() => setTab(t.id)} style={{
                                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                                background: tab === t.id ? 'linear-gradient(135deg, #00D4FF, #0066FF)' : 'transparent',
                                color: tab === t.id ? '#000' : 'rgba(255,255,255,0.5)',
                                fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontWeight: 700,
                                cursor: 'pointer', letterSpacing: '1px',
                            }}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading leaderboard...
                        </div>
                    ) : entries.length > 0 ? (
                        entries.map((entry, i) => {
                            const badge = rankBadge(i + 1);
                            return (
                                <div key={entry.id || i} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '14px', borderRadius: '12px',
                                    background: i < 3 ? 'rgba(0,212,255,0.06)' : 'rgba(0,0,0,0.2)',
                                    border: `1px solid ${i < 3 ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.05)'}`,
                                    marginBottom: '8px',
                                }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '10px',
                                        background: badge.bg, display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', fontFamily: 'Orbitron, sans-serif',
                                        fontSize: '10px', fontWeight: 700, color: i < 3 ? '#000' : '#00d4ff',
                                        flexShrink: 0,
                                    }}>
                                        {badge.text}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
                                            {entry.profiles?.full_name || entry.profiles?.username || `Player ${i + 1}`}
                                        </div>
                                    </div>
                                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '14px', fontWeight: 700, color: '#00d4ff' }}>
                                        {(entry.score || 0).toLocaleString()}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div style={emptyState}>
                            <p>No leaderboard entries yet. Play games to get on the board.</p>
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

const emptyState = {
    textAlign: 'center', padding: '40px 20px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: '14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px',
};
