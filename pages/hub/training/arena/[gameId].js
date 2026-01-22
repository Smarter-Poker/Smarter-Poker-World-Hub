/**
 * Training Arena Page — Game HUD Container
 * =========================================
 * The main gameplay screen with HUD wrapper.
 * Contains health bar, hand counter, engine rendering, and modals.
 * Receives gameId, level, and session from URL params.
 */

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';

// Dynamic import GameArena to avoid SSR issues with framer-motion
const GameArena = dynamic(
    () => import('../../../../src/components/training/GameArena'),
    { ssr: false }
);

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level, session: sessionId } = router.query;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [gameName, setGameName] = useState('Training Session');

    // Parse level as number (default to 1)
    const currentLevel = parseInt(level as string, 10) || 1;

    // Fetch current user and game data
    useEffect(() => {
        const init = async () => {
            try {
                // Get user
                const { supabase } = await import('../../../../src/lib/supabase');
                const { data: { user } } = await supabase.auth.getUser();

                if (!user) {
                    router.push('/login?redirect=/hub/training');
                    return;
                }
                setUserId(user.id);

                // Get game name from library
                if (gameId) {
                    const game = getGameById(gameId);
                    if (game) {
                        setGameName(game.name);
                    }
                }
            } catch (error) {
                console.error('Init error:', error);
            } finally {
                setLoading(false);
            }
        };

        if (gameId) {
            init();
        }
    }, [gameId, router]);

    // Handle level complete (passed)
    const handleLevelComplete = (stats) => {
        console.log('Level complete:', stats);

        // Navigate back to level selector with success
        router.push({
            pathname: `/hub/training/play/${gameId}`,
            query: {
                completed: 'true',
                level: currentLevel,
                score: Math.round(stats.accuracy),
                passed: '1',
                xp: stats.xpEarned,
            },
        });
    };

    // Handle level failed (HP reached 0)
    const handleLevelFailed = () => {
        console.log('Level failed');
        // Stats will be shown in the modal, user chooses retry or exit
    };

    // Handle exit (back to level selector)
    const handleExit = () => {
        router.push(`/hub/training/play/${gameId}`);
    };

    // Show loading state
    if (loading || !gameId || !userId) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a15 0%, #0d1628 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontFamily: 'Inter, -apple-system, sans-serif',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        fontSize: 64,
                        marginBottom: 16,
                        animation: 'pulse 1.5s infinite',
                    }}>
                        🎮
                    </div>
                    <p style={{ fontSize: 18, fontWeight: 600 }}>
                        Loading {gameName}...
                    </p>
                    <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                        Level {currentLevel}
                    </p>
                </div>
                <style jsx>{`
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                    }
                `}</style>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} - Level {currentLevel} | Smarter Poker</title>
                <meta name="description" content={`Playing ${gameName} Level ${currentLevel}`} />
            </Head>

            <GameArena
                userId={userId}
                gameId={gameId}
                gameName={gameName}
                level={currentLevel}
                sessionId={sessionId}
                onExit={handleExit}
                onLevelComplete={handleLevelComplete}
                onLevelFailed={handleLevelFailed}
            />
        </>
    );
}
