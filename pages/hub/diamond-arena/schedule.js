/**
 * Diamond Arena - Tournament Schedule
 * Displays upcoming tournaments with filtering and registration
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArenaSchedule() {
    const router = useRouter();
    const [tournaments, setTournaments] = useState([]);
    const [filter, setFilter] = useState('all'); // all, today, week, month
    const [gameType, setGameType] = useState('all'); // all, nlh, plo, mixed

    useEffect(() => {
        // TODO: Fetch tournaments from API
        setTournaments([
            {
                id: 1,
                name: 'Daily Diamond Freeroll',
                buyIn: 0,
                prize: 1000,
                startTime: new Date(Date.now() + 3600000).toISOString(),
                gameType: 'nlh',
                registered: 47,
                maxPlayers: 100
            },
            {
                id: 2,
                name: 'Sunday Million',
                buyIn: 100,
                prize: 50000,
                startTime: new Date(Date.now() + 86400000).toISOString(),
                gameType: 'nlh',
                registered: 234,
                maxPlayers: 500
            }
        ]);
    }, []);

    const filteredTournaments = tournaments.filter(t => {
        if (gameType !== 'all' && t.gameType !== gameType) return false;

        const startTime = new Date(t.startTime);
        const now = new Date();

        if (filter === 'today') {
            return startTime.toDateString() === now.toDateString();
        } else if (filter === 'week') {
            const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            return startTime <= weekFromNow;
        } else if (filter === 'month') {
            const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            return startTime <= monthFromNow;
        }

        return true;
    });

    return (
        <>
            <Head>
                <title>Tournament Schedule | Diamond Arena</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        {/* Header */}
                        <div style={{ marginBottom: '40px' }}>

                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                                Tournament Schedule
                            </h1>
                            <p style={{ color: '#9ca3af' }}>
                                Browse and register for upcoming tournaments
                            </p>
                        </div>

                        {/* Filters */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '30px', flexWrap: 'wrap' }}>
                            {['all', 'today', 'week', 'month'].map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    style={{
                                        background: filter === f ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${filter === f ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                                        color: filter === f ? '#fff' : '#9ca3af',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {f}
                                </button>
                            ))}

                            <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />

                            {['all', 'nlh', 'plo', 'mixed'].map(g => (
                                <button
                                    key={g}
                                    onClick={() => setGameType(g)}
                                    style={{
                                        background: gameType === g ? '#10b981' : 'rgba(255,255,255,0.05)',
                                        border: `1px solid ${gameType === g ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                                        color: gameType === g ? '#fff' : '#9ca3af',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        textTransform: 'uppercase'
                                    }}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>

                        {/* Tournament List */}
                        <div style={{ display: 'grid', gap: '16px' }}>
                            {filteredTournaments.map(t => (
                                <div
                                    key={t.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '8px' }}>
                                            {t.name}
                                        </h3>
                                        <div style={{ display: 'flex', gap: '20px', color: '#9ca3af', fontSize: '14px' }}>
                                            <span>Diamonds {t.buyIn === 0 ? 'Freeroll' : `${t.buyIn} Diamonds`}</span>
                                            <span>Trophy {t.prize.toLocaleString()} Prize Pool</span>
                                            <span> {t.registered}/{t.maxPlayers}</span>
                                            <span>🕐 {new Date(t.startTime).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <button
                                        style={{
                                            background: '#10b981',
                                            border: 'none',
                                            color: '#fff',
                                            padding: '12px 24px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        Register
                                    </button>
                                </div>
                            ))}
                        </div>

                        {filteredTournaments.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                                <p style={{ fontSize: '18px' }}>No tournaments found</p>
                                <p style={{ fontSize: '14px', marginTop: '8px' }}>Try adjusting your filters</p>
                            </div>
                        )}
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
