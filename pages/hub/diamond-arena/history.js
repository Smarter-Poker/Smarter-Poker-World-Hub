/**
 * Diamond Arena - Hand History
 * View past hands and sessions
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function DiamondArenaHistory() {
    const router = useRouter();

    const history = [
        { id: 1, date: new Date().toISOString(), gameType: 'Cash NLH', result: '+2,450', hands: 127 },
        { id: 2, date: new Date(Date.now() - 86400000).toISOString(), gameType: 'Tournament', result: '+5,000', hands: 89 },
    ];

    return (
        <>
            <Head>
                <title>Hand History | Diamond Arena</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/diamond-arena')}
                            style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                color: '#3b82f6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Arena
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            📜 Hand History
                        </h1>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {history.map(session => (
                                <div
                                    key={session.id}
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
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                                            {session.gameType}
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {new Date(session.date).toLocaleString()} • {session.hands} hands
                                        </div>
                                    </div>

                                    <div style={{
                                        color: session.result.startsWith('+') ? '#10b981' : '#ef4444',
                                        fontSize: '24px',
                                        fontWeight: 'bold'
                                    }}>
                                        {session.result}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
