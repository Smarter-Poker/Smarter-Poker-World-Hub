/**
 * Training Arena Page — Game Session
 * ===================================
 * The actual gameplay screen where users play 20 hands per session.
 * Receives gameId, level, and session from URL params.
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { getGameById, getGameBySlug } from '../../../../src/data/TRAINING_LIBRARY';

// Dynamic import GameSession to avoid SSR issues with framer-motion
const GameSession = dynamic(
    () => import('../../../../src/components/training/GameSession'),
    { ssr: false }
);

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level, session } = router.query;

    const [userId, setUserId] = useState(null);
    const [game, setGame] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch user and game data
    useEffect(() => {
        if (!gameId) return;

        const init = async () => {
            try {
                // Get user ID
                const storedUser = localStorage.getItem('sb-user-id');
                if (storedUser) {
                    setUserId(storedUser);
                } else {
                    const anonId = `anon-${Date.now()}`;
                    localStorage.setItem('sb-user-id', anonId);
                    setUserId(anonId);
                }

                // Get game info (try by ID first, then by slug)
                const gameData = getGameById(gameId) || getGameBySlug(gameId);
                if (gameData) {
                    setGame(gameData);
                } else {
                    setError('Game not found');
                }
            } catch (e) {
                console.error('Error initializing arena:', e);
                setError('Failed to load game');
            }
            setLoading(false);
        };

        init();
    }, [gameId]);

    // Handle session completion
    const handleSessionComplete = (stats) => {
        console.log('Session complete:', stats);
        // Navigate back to level selector with updated progress
        router.push(`/hub/training/play/${gameId}?completed=true`);
    };

    // Handle exit
    const handleExit = () => {
        router.push(`/hub/training/play/${gameId}`);
    };

    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <p>Entering Training Arena...</p>
                </div>
            </div>
        );
    }

    if (error || !game) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <p>{error || 'Game not found'}</p>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            marginTop: 16,
                            padding: '12px 24px',
                            background: 'linear-gradient(135deg, #00d4ff, #0088cc)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#fff',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Back to Training Hub
                    </button>
                </div>
            </div>
        );
    }

    const levelNum = parseInt(level) || 1;
    const sessionId = session || `session-${Date.now()}`;

    return (
        <>
            <Head>
                <title>{game.title} — Level {levelNum} | Smarter.Poker</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <GameSession
                userId={userId}
                gameId={gameId}
                gameName={game.title}
                level={levelNum}
                sessionId={sessionId}
                engineType={game.engine_type || game.engineType || 'PIO'}
                onComplete={handleSessionComplete}
                onExit={handleExit}
            />
        </>
    );
}
