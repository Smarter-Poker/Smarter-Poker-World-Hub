/**
 * 🧪 DYNAMIC TRAINING ENGINE TEST PAGE
 * 
 * Tests the Universal Training Table with different game modes.
 * Demonstrates how the same component adapts to different configurations.
 */

import { useState } from 'react';
import { UniversalTrainingTable } from '../../../src/components/training/UniversalTrainingTable';
import { GAME_MODES, getAllGameIds, getGameMode } from '../../../src/lib/GameManifest';

export default function DynamicEngineTest() {
    const [selectedGameId, setSelectedGameId] = useState<string>('gto_basics_9max');
    const [results, setResults] = useState<Array<{ correct: boolean; xp: number; diamonds: number }>>([]);

    const gameIds = getAllGameIds();
    const currentMode = getGameMode(selectedGameId);

    const handleComplete = (correct: boolean, xp: number, diamonds: number) => {
        setResults(prev => [...prev.slice(-9), { correct, xp, diamonds }]);
        console.log('Scenario complete:', { correct, xp, diamonds });
    };

    return (
        <div style={{ display: 'flex', height: '100vh' }}>
            {/* Sidebar: Game Mode Selector */}
            <div style={{
                width: '280px',
                background: 'linear-gradient(180deg, #0a0a1a, #1a1a2e)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                padding: '16px',
                overflowY: 'auto',
                color: '#fff'
            }}>
                <h2 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    marginBottom: '16px',
                    color: '#00d4ff'
                }}>
                    🎮 Game Modes ({gameIds.length})
                </h2>

                {/* Group by category */}
                {['fundamentals', 'preflop', 'postflop', 'tournament', 'advanced'].map(category => {
                    const categoryModes = Object.values(GAME_MODES).filter(m => m.category === category);
                    if (categoryModes.length === 0) return null;

                    return (
                        <div key={category} style={{ marginBottom: '16px' }}>
                            <div style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: '#888',
                                textTransform: 'uppercase',
                                marginBottom: '8px'
                            }}>
                                {category}
                            </div>
                            {categoryModes.map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setSelectedGameId(mode.id)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        marginBottom: '4px',
                                        background: selectedGameId === mode.id
                                            ? `linear-gradient(135deg, ${mode.themeColor}44, ${mode.themeColor}22)`
                                            : 'rgba(255,255,255,0.05)',
                                        border: selectedGameId === mode.id
                                            ? `1px solid ${mode.themeColor}`
                                            : '1px solid transparent',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        marginBottom: '4px'
                                    }}>
                                        <span style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: mode.themeColor
                                        }} />
                                        <span style={{ fontWeight: 600, fontSize: '13px' }}>
                                            {mode.name}
                                        </span>
                                    </div>
                                    <div style={{
                                        fontSize: '10px',
                                        color: '#888',
                                        display: 'flex',
                                        gap: '8px'
                                    }}>
                                        <span>{mode.tableSize}-Max</span>
                                        <span>•</span>
                                        <span>{mode.engineType}</span>
                                        <span>•</span>
                                        <span>{mode.startingStack}BB</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    );
                })}

                {/* Results */}
                {results.length > 0 && (
                    <div style={{
                        marginTop: '24px',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px'
                    }}>
                        <div style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#888',
                            textTransform: 'uppercase',
                            marginBottom: '8px'
                        }}>
                            Recent Results
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {results.map((r, i) => (
                                <span
                                    key={i}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        background: r.correct
                                            ? 'rgba(34, 197, 94, 0.3)'
                                            : 'rgba(239, 68, 68, 0.3)',
                                        border: r.correct
                                            ? '2px solid #22c55e'
                                            : '2px solid #ef4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '10px'
                                    }}
                                >
                                    {r.correct ? '✓' : '✗'}
                                </span>
                            ))}
                        </div>
                        <div style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: '#888'
                        }}>
                            Total XP: {results.reduce((sum, r) => sum + r.xp, 0)}
                        </div>
                    </div>
                )}
            </div>

            {/* Main: Training Table */}
            <div style={{ flex: 1 }}>
                <UniversalTrainingTable
                    key={selectedGameId}
                    gameId={selectedGameId}
                    onComplete={handleComplete}
                />
            </div>
        </div>
    );
}
