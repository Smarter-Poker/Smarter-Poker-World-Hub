/**
 * Training Arena Page — God Mode Integration
 * ===========================================
 * Route: /hub/training/arena/[gameId]?level=X
 * 
 * This page wraps the GodModeArena component which provides:
 * - Poker table with cards, avatars, and timer
 * - Questions fetched from /api/god-mode/fetch-hand
 * - Action buttons from solver data
 * - Score tracking and session completion
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { getAuthUser } from '../../../../src/lib/authUtils';

// Dynamic import for GodModeArena to avoid SSR issues
const GodModeArena = dynamic(
    () => import('../../../../src/components/training/GodModeArena'),
    { ssr: false, loading: () => <LoadingScreen /> }
);

// Loading screen component
function LoadingScreen() {
    return (
        <div style={{
            width: '100%',
            height: '100vh',
            background: 'linear-gradient(180deg, #080810 0%, #0d1628 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{
                fontSize: 64,
                marginBottom: 24,
                animation: 'pulse 1.5s infinite',
            }}>🎰</div>
            <p style={{ color: '#94a3b8', fontSize: 16 }}>Loading Training Arena...</p>
            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
            `}</style>
        </div>
    );
}

// Game names mapping (fallback)
const GAME_NAMES = {
    'mtt-001': 'MTT Final Table Training',
    'mtt-002': 'MTT Push/Fold',
    'mtt-003': 'MTT ICM Spots',
    'cash-001': 'Cash Game Fundamentals',
    'cash-002': 'Cash 3-Bet Pots',
    'spins-001': 'Spin & Go 3-Max',
    'mental-001': 'Tilt Control',
    'mental-002': 'Session Management',
};

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level = 1 } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);

    // Get user on mount
    useEffect(() => {
        const authUser = getAuthUser();
        if (authUser?.id) {
            setUserId(authUser.id);
        } else {
            // Generate anonymous user for demo
            const anonId = `anon-${Date.now()}`;
            setUserId(anonId);
        }
        setLoading(false);
    }, []);

    const handleComplete = (results) => {
        console.log('Session complete:', results);
        // Could save results to database here
    };

    const handleExit = () => {
        router.push('/hub/training');
    };

    if (loading || !gameId) {
        return <LoadingScreen />;
    }

    const gameName = GAME_NAMES[gameId] || gameId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
        <>
            <Head>
                <title>{gameName} | Training Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <style>{`
                    html, body {
                        margin: 0;
                        padding: 0;
                        background: #080810;
                        overflow: hidden;
                    }
                `}</style>
            </Head>

            <GodModeArena
                userId={userId}
                gameId={gameId}
                gameName={gameName}
                level={parseInt(level) || 1}
                sessionId={`session-${Date.now()}`}
                onComplete={handleComplete}
                onExit={handleExit}
            />
        </>
    );
}
