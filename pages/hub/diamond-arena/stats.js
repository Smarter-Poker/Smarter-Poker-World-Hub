/**
 * Diamond Arena - Player Stats
 * Detailed statistics for the current player
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArenaStats() {
    const router = useRouter();

    const stats = {
        totalGames: 1247,
        cashGames: 847,
        tournaments: 400,
        totalWinnings: 147832,
        winRate: 68,
        avgSessionLength: '2h 34m',
        bestStreak: 12,
        currentStreak: 5
    };

    return (
        <>
            <Head>
                <title>My Stats | Diamond Arena</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/diamond-arena')}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: '20px' }}
                        >
                            <img src="/images/btn-back.png" alt="Back" style={{ height: 32 }} />
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                             My Stats
                        </h1>

                        {/* Stats Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Games</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.totalGames}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Total Winnings</div>
                                <div style={{ color: '#fbbf24', fontSize: '32px', fontWeight: 'bold' }}>Diamonds {stats.totalWinnings.toLocaleString()}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Win Rate</div>
                                <div style={{ color: '#10b981', fontSize: '32px', fontWeight: 'bold' }}>{stats.winRate}%</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Current Streak</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}> {stats.currentStreak}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Cash Games</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.cashGames}</div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '24px' }}>
                                <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '8px' }}>Tournaments</div>
                                <div style={{ color: '#fff', fontSize: '32px', fontWeight: 'bold' }}>{stats.tournaments}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
