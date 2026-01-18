/**
 * 🎮 UNIVERSAL TRAINING TABLE
 * 
 * A data-driven training component that accepts ONLY a gameId.
 * Looks up the game mode from GAME_MODES and configures everything automatically:
 * - Table size and layout
 * - Engine type (cash/tournament/SNG)
 * - Strategy profile and scenario generation
 * - Avatar set and visual theme
 * - Reward multipliers
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Director } from './Director';
import { GameGuard } from '../../lib/GameGuard';
import { getGameMode, getAvatarSetPaths, type GameMode } from '../../lib/GameManifest';
import type { GameConfig } from '../../types/poker';

interface UniversalTrainingTableProps {
    gameId: string;
    onComplete?: (correct: boolean, xp: number, diamonds: number) => void;
    onError?: (error: Error) => void;
}

/**
 * 🎯 UniversalTrainingTable Component
 * 
 * Single-prop interface that powers all 50+ training games.
 * Simply pass a gameId and the component handles everything else.
 */
export function UniversalTrainingTable({
    gameId,
    onComplete,
    onError
}: UniversalTrainingTableProps) {
    const [resetKey, setResetKey] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ═══════════════════════════════════════════════════════════════════════
    // GAME MODE LOOKUP
    // ═══════════════════════════════════════════════════════════════════════
    const gameMode = useMemo((): GameMode | null => {
        return getGameMode(gameId);
    }, [gameId]);

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIGURATION DERIVATION
    // ═══════════════════════════════════════════════════════════════════════
    const config = useMemo((): GameConfig | null => {
        if (!gameMode) return null;

        // Calculate ante based on mode settings
        const ante = gameMode.anteEnabled
            ? gameMode.anteSize ? gameMode.anteSize * 100 : 12.5 // Default 12.5% of BB
            : 0;

        return {
            bigBlind: 100, // Standard BB
            ante,
            startStack: gameMode.startingStack * 100, // Convert BB to chips
            tableSize: gameMode.tableSize,
        };
    }, [gameMode]);

    // Avatar paths for the mode
    const avatarPaths = useMemo(() => {
        if (!gameMode) return [];
        return getAvatarSetPaths(gameMode.avatarSet);
    }, [gameMode]);

    // ═══════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!gameMode) {
            const err = new Error(`Unknown game mode: ${gameId}`);
            setError(err.message);
            onError?.(err);
            return;
        }

        // Preload avatar assets for this mode
        const preloadAvatars = async () => {
            setIsLoading(true);
            try {
                await Promise.all(
                    avatarPaths.map(path => {
                        return new Promise<void>((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve();
                            img.onerror = () => resolve(); // Don't fail on missing avatars
                            img.src = path;
                        });
                    })
                );
            } catch (err) {
                console.warn('Avatar preload warning:', err);
            }
            setIsLoading(false);
        };

        preloadAvatars();
    }, [gameId, gameMode, avatarPaths, onError]);

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLERS
    // ═══════════════════════════════════════════════════════════════════════
    const handleGameReset = useCallback(() => {
        console.log(`🛡️ GameGuard: Auto-recovering ${gameId}...`);
        setResetKey(prev => prev + 1);
    }, [gameId]);

    const handleScenarioComplete = useCallback((correct: boolean, xp: number, diamonds: number) => {
        if (!gameMode) return;

        // Apply mode-specific multipliers
        const adjustedXP = Math.round(xp * gameMode.xpMultiplier);
        const adjustedDiamonds = Math.round(diamonds * gameMode.diamondMultiplier);

        onComplete?.(correct, adjustedXP, adjustedDiamonds);
    }, [gameMode, onComplete]);

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    // Error state
    if (error) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a, #1a1a2e)',
                color: '#fff',
                textAlign: 'center',
                padding: '20px'
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Game Not Found</h1>
                <p style={{ color: '#888', marginBottom: '24px' }}>{error}</p>
                <button
                    onClick={() => window.history.back()}
                    style={{
                        padding: '12px 24px',
                        background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                        border: 'none',
                        borderRadius: '8px',
                        color: '#fff',
                        fontWeight: 700,
                        cursor: 'pointer'
                    }}
                >
                    ← Go Back
                </button>
            </div>
        );
    }

    // Loading state
    if (isLoading || !config || !gameMode) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a, #1a1a2e)',
                color: '#fff'
            }}>
                <div
                    style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid rgba(255,255,255,0.1)',
                        borderTopColor: gameMode?.themeColor || '#00d4ff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}
                />
                <style>{`
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                `}</style>
                <p style={{ marginTop: '16px', color: '#888' }}>
                    Loading {gameMode?.name || 'game'}...
                </p>
            </div>
        );
    }

    // Game ready
    return (
        <div style={{
            width: '100%',
            height: '100vh',
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #0a0a1a, #1a1a2e)'
        }}>
            {/* Mode indicator */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                padding: '8px 16px',
                background: `linear-gradient(135deg, ${gameMode.themeColor}22, ${gameMode.themeColor}44)`,
                borderBottom: `1px solid ${gameMode.themeColor}44`,
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                zIndex: 10000,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: gameMode.themeColor
                    }} />
                    {gameMode.name}
                </span>
                <span style={{ color: '#888' }}>
                    {gameMode.category.toUpperCase()} • {gameMode.difficultyLevel.toUpperCase()}
                </span>
            </div>

            <div style={{ paddingTop: '36px', height: '100%' }}>
                <GameGuard onReset={handleGameReset}>
                    <Director
                        key={`${gameId}-${resetKey}`}
                        config={config}
                        onScenarioComplete={handleScenarioComplete}
                    />
                </GameGuard>
            </div>
        </div>
    );
}

export default UniversalTrainingTable;
