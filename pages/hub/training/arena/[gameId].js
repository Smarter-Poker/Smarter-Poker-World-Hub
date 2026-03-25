/**
 * Training Arena Page — GodModeArena Host
 * ====================================================
 * Hosts the GodModeArena component for all 100+ training games.
 * Receives gameId, level, and session from URL query params
 * (set by LevelSelector after user selects a level).
 *
 * Route: /hub/training/arena/[gameId]?level=X&session=Y
 */

import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import { getAuthUser } from '../../../../src/lib/authUtils';
import { getGameById } from '../../../../src/data/TRAINING_LIBRARY';
import ErrorBanner from '../../../../src/components/training/ErrorBanner';
import ConnectionToast from '../../../../src/components/training/ConnectionToast';

const GodModeArena = dynamic(() => import('../../../../src/components/training/GodModeArena'), {
    ssr: false,
    loading: () => (
        <div style={{
            minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontFamily: "'Inter', -apple-system, sans-serif",
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 40, height: 40, border: '3px solid rgba(0,212,255,0.2)',
                    borderTopColor: '#00d4ff', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    margin: '0 auto 16px',
                }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Loading Arena...</div>
            </div>
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    ),
});

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level: queryLevel, session: sessionId } = router.query;
    useTrainingBus('training-arena', { gameId });

    const [userId, setUserId] = useState(null);
    const [ready, setReady] = useState(false);
    const [fetchError, setFetchError] = useState(null);

    // Resolve user ID
    useEffect(() => {
        try {
            const authUser = getAuthUser();
            if (authUser?.id) {
                setUserId(authUser.id);
            } else {
                const stored = localStorage.getItem('sb-user-id');
                setUserId(stored || `anon-${Date.now()}`);
            }
        } catch (e) {
            setUserId(`anon-${Date.now()}`);
        }
        setReady(true);
    }, []);

    // Resolve game name from TRAINING_LIBRARY
    const game = gameId ? getGameById(gameId) : null;
    const gameName = game?.name || 'Training Game';
    const level = parseInt(queryLevel, 10) || 1;

    // Handle arena exit — return to level selector
    const handleExit = useCallback(() => {
        router.push(`/hub/training/play/${gameId}`);
    }, [router, gameId]);

    // Handle session complete
    const handleComplete = useCallback((results) => {
        // GodModeArena handles its own review screen
        // User will use the exit button from within the review
    }, []);

    // Wait for router + user resolution
    if (!router.isReady || !gameId || !ready) {
        return (
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748b',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                Loading...
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} — Level {level} | Smarter.Poker GTO Training</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            </Head>
            <GodModeArena
                userId={userId || `anon-${Date.now()}`}
                gameId={gameId}
                gameName={gameName}
                level={level}
                sessionId={sessionId || `session-${Date.now()}`}
                onComplete={handleComplete}
                onExit={handleExit}
            />
            {fetchError && <ErrorBanner message={fetchError} onRetry={() => setFetchError(null)} />}
            <ConnectionToast />
        </>
    );
}
