/**
 * 🎮 PREMIUM POKER TABLE DEMO PAGE
 * 
 * Shows the new next-gen poker table UI with:
 * - Premium dark theme
 * - Cinematic animations
 * - Glassmorphism effects
 * - Responsive design
 */

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';

// Dynamic import to avoid SSR issues with Framer Motion
const PremiumPokerTable = dynamic(
    () => import('../src/components/poker/PremiumPokerTable'),
    { ssr: false }
);

// Sample player data
const DEMO_PLAYERS = [
    { id: 'hero', name: 'HERO', stack: 45, avatarUrl: '/avatars/table/vip_viking_warrior.png' },
    { id: 'v1', name: 'Villain 1', stack: 32, avatarUrl: '/avatars/table/free_wizard.png' },
    { id: 'v2', name: 'Villain 2', stack: 28, avatarUrl: '/avatars/table/free_ninja.png' },
    { id: 'v3', name: 'Villain 3', stack: 55, avatarUrl: '/avatars/table/free_cowboy.png' },
    { id: 'v4', name: 'Villain 4', stack: 41, avatarUrl: '/avatars/table/vip_pharaoh.png' },
    { id: 'v5', name: 'Villain 5', stack: 38, avatarUrl: '/avatars/table/vip_spartan.png' },
    { id: 'v6', name: 'Villain 6', stack: 62, avatarUrl: '/avatars/table/free_pirate.png' },
    { id: 'v7', name: 'Villain 7', stack: 29, avatarUrl: '/avatars/table/vip_wolf.png' },
    { id: 'v8', name: 'Villain 8', stack: 51, avatarUrl: '/avatars/table/free_samurai.png' },
];

export default function PremiumTableDemo() {
    const [timer, setTimer] = useState(15);
    const [pot, setPot] = useState(8);
    const [communityCards, setCommunityCards] = useState([]);
    const [heroCards] = useState(['Ah', 'Kh']);
    const [activePlayer, setActivePlayer] = useState('hero');
    const [dealerPosition, setDealerPosition] = useState(4);
    const [actionLog, setActionLog] = useState([]);

    // Timer countdown
    useEffect(() => {
        const interval = setInterval(() => {
            setTimer(t => Math.max(0, t - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Log action
    const logAction = (action) => {
        setActionLog(prev => [...prev.slice(-4), { time: new Date().toLocaleTimeString(), action }]);
        console.log(`Action: ${action}`);

        // Simulate progression
        if (action === 'Flop') {
            setCommunityCards(['Ks', 'Qh', '7d']);
        } else if (action === 'Turn') {
            setCommunityCards(['Ks', 'Qh', '7d', '2c']);
        } else if (action === 'River') {
            setCommunityCards(['Ks', 'Qh', '7d', '2c', 'As']);
        }
    };

    const handleFold = () => logAction('FOLD');
    const handleCheck = () => logAction('CHECK');
    const handleCall = () => { logAction('CALL 2.5BB'); setPot(p => p + 2.5); };
    const handleRaise = () => { logAction('RAISE to 8BB'); setPot(p => p + 8); };
    const handleAllIn = () => { logAction('ALL-IN 45BB'); setPot(p => p + 45); };

    return (
        <>
            <Head>
                <title>Premium Poker Table | Smarter.Poker</title>
                <meta name="description" content="Next-gen poker table UI with cinematic animations" />
            </Head>

            <PremiumPokerTable
                players={DEMO_PLAYERS}
                heroCards={heroCards}
                communityCards={communityCards}
                pot={pot}
                activePlayer={activePlayer}
                dealerPosition={dealerPosition}
                timerProgress={timer / 15}
                onFold={handleFold}
                onCheck={handleCheck}
                onCall={handleCall}
                onRaise={handleRaise}
                onAllIn={handleAllIn}
                gameTitle="ICM FUNDAMENTALS"
            />

            {/* Demo Controls Overlay */}
            <div style={{
                position: 'fixed',
                top: 80,
                right: 20,
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: 16,
                color: 'white',
                fontSize: 12,
                zIndex: 1000,
                maxWidth: 200,
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: 12, color: '#00f5ff' }}>
                    🎮 Demo Controls
                </div>

                <button
                    onClick={() => logAction('Flop')}
                    style={{
                        background: '#1e4d2e',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'white',
                        cursor: 'pointer',
                        marginBottom: 8,
                        width: '100%',
                    }}
                >
                    Deal Flop
                </button>

                <button
                    onClick={() => logAction('Turn')}
                    style={{
                        background: '#1e3a5f',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'white',
                        cursor: 'pointer',
                        marginBottom: 8,
                        width: '100%',
                    }}
                >
                    Deal Turn
                </button>

                <button
                    onClick={() => logAction('River')}
                    style={{
                        background: '#4d1e1e',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'white',
                        cursor: 'pointer',
                        marginBottom: 12,
                        width: '100%',
                    }}
                >
                    Deal River
                </button>

                <button
                    onClick={() => setTimer(15)}
                    style={{
                        background: '#333',
                        border: 'none',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'white',
                        cursor: 'pointer',
                        width: '100%',
                    }}
                >
                    Reset Timer
                </button>

                <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Action Log:</div>
                    {actionLog.map((log, i) => (
                        <div key={i} style={{ opacity: 0.7, marginBottom: 4 }}>
                            {log.time}: {log.action}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
