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
import React, { useState, useEffect, useCallback } from 'react';
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
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    ),
});

// ═══ DEBUG ERROR BOUNDARY — captures exact crash message ═══
class ArenaErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.warn('[ArenaErrorBoundary] Crash:', error?.message, error?.stack);
    }
    render() {
        if (this.state.hasError) {
            const err = this.state.error;
            return (
                <div style={{
                    minHeight: '100vh',
                    background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontFamily: "'Inter', sans-serif", padding: 24,
                }}>
                    <div style={{ maxWidth: 600, textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                        <h2 style={{ color: '#ef4444', fontSize: 22, marginBottom: 12 }}>Arena Crash Detected</h2>
                        <div style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 8, padding: 16, textAlign: 'left', fontSize: 13,
                            fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                            maxHeight: 300, overflow: 'auto', marginBottom: 16,
                        }}>
                            <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 8 }}>
                                {err?.message || 'Unknown error'}
                            </div>
                            <div style={{ color: '#64748b', fontSize: 11 }}>
                                {err?.stack?.substring(0, 800) || 'No stack trace'}
                            </div>
                            {this.state.errorInfo?.componentStack && (
                                <div style={{ color: '#475569', fontSize: 11, marginTop: 8 }}>
                                    {this.state.errorInfo.componentStack.substring(0, 500)}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#00d4ff', color: '#000', border: 'none',
                                padding: '10px 24px', borderRadius: 20, fontSize: 14,
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            Reload Arena
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function TrainingArenaPage() {
    const router = useRouter();
    const { gameId, level: queryLevel, session: sessionId } = router.query;
    useTrainingBus('training-arena', { gameId });

    const [userId, setUserId] = useState(null);
    const [ready, setReady] = useState(false);
    const [fetchError, setFetchError] = useState(null);

    // Resolve user ID.
    // 2026-07-19 AUDIT FIX: previously minted `anon-<ts>` ids for logged-out
    // visitors, but useGTOTrainer's question APIs all require a Bearer token
    // (401 otherwise) — anonymous arenas could never load a single question.
    // Redirect to login and return here afterwards (login.js honors ?redirect=).
    useEffect(() => {
        if (!router.isReady) return;
        try {
            const authUser = getAuthUser();
            if (authUser?.id) {
                setUserId(authUser.id);
                setReady(true);
                return;
            }
        } catch (e) {
            // fall through to redirect
        }
        router.replace(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
    }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                <style>{`@keyframes arena-spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 44, height: 44, border: '3px solid rgba(0,212,255,0.15)', borderTopColor: '#00d4ff', borderRadius: '50%', animation: 'arena-spin 0.8s linear infinite', margin: '0 auto 14px' }} />
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#00d4ff', letterSpacing: 1 }}>Loading Arena...</div>
                    <div style={{ fontSize: 12, color: '#334155', marginTop: 6 }}>Preparing your training session</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>{gameName} — Level {level} | Smarter.Poker GTO Training</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            </Head>
            <ArenaErrorBoundary>
                <GodModeArena
                    userId={userId || `anon-${Date.now()}`}
                    gameId={gameId}
                    gameName={gameName}
                    level={level}
                    sessionId={sessionId || `session-${Date.now()}`}
                    onComplete={handleComplete}
                    onExit={handleExit}
                />
            </ArenaErrorBoundary>
            {fetchError && <ErrorBanner message={fetchError} onRetry={() => setFetchError(null)} />}
            <ConnectionToast />
        </>
    );
}
