/**
 * 🏭 CONTENT FACTORY TEST PAGE
 * 
 * Demonstrates the Industrial Content Engine:
 * - 20 Core Game Cartridges
 * - Just-In-Time scenario assembly
 * - Configuration-driven game generation
 */

import { useState, useEffect } from 'react';
import { GameContentFactory, type FactoryScenario } from '../../../src/lib/GameContentFactory';
import { GAMES_LIST, getGameDefinition, type GameDefinition } from '../../../src/lib/MasterGameLibrary';
import { Director } from '../../../src/components/training/Director';
import { GameGuard } from '../../../src/lib/GameGuard';

export default function ContentFactoryTest() {
    const [selectedGameId, setSelectedGameId] = useState<string>('cash_100bb_6max_btn_open');
    const [scenario, setScenario] = useState<FactoryScenario | null>(null);
    const [showInspector, setShowInspector] = useState(true);
    const [resetKey, setResetKey] = useState(0);

    const gameIds = GameContentFactory.getAvailableGames();
    const currentGame = getGameDefinition(selectedGameId);

    // Generate scenario when game changes
    useEffect(() => {
        const newScenario = GameContentFactory.generateLevel(selectedGameId);
        setScenario(newScenario);
        setResetKey(prev => prev + 1);
    }, [selectedGameId]);

    // Group games by category
    const gamesByCategory = gameIds.reduce((acc, id) => {
        const game = getGameDefinition(id);
        if (game) {
            const cat = game.category;
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(game);
        }
        return acc;
    }, {} as Record<string, GameDefinition[]>);

    return (
        <div style={{ display: 'flex', height: '100vh', background: '#0a0a1a' }}>
            {/* Left Panel: Game Selector */}
            <div style={{
                width: '320px',
                background: 'linear-gradient(180deg, #0d0d1a, #1a1a2e)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                overflowY: 'auto',
                color: '#fff'
            }}>
                <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#00d4ff', margin: 0 }}>
                        🏭 Content Factory
                    </h1>
                    <p style={{ fontSize: '12px', color: '#888', margin: '8px 0 0' }}>
                        {GameContentFactory.getGameCount()} Game Cartridges
                    </p>
                </div>

                {/* Categories */}
                {Object.entries(gamesByCategory).map(([category, games]) => (
                    <div key={category} style={{ padding: '12px 16px' }}>
                        <div style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#888',
                            textTransform: 'uppercase',
                            marginBottom: '8px',
                            letterSpacing: '1px'
                        }}>
                            {category.replace('_', ' ')} ({games.length})
                        </div>
                        {games.map(game => (
                            <button
                                key={game.id}
                                onClick={() => setSelectedGameId(game.id)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    marginBottom: '4px',
                                    background: selectedGameId === game.id
                                        ? `linear-gradient(135deg, ${game.visuals?.accentColor || '#00d4ff'}33, ${game.visuals?.accentColor || '#00d4ff'}11)`
                                        : 'rgba(255,255,255,0.03)',
                                    border: selectedGameId === game.id
                                        ? `1px solid ${game.visuals?.accentColor || '#00d4ff'}`
                                        : '1px solid transparent',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                                    {game.name}
                                </div>
                                <div style={{ fontSize: '10px', color: '#888', display: 'flex', gap: '8px' }}>
                                    <span>{game.tableSize}-Max</span>
                                    <span>•</span>
                                    <span>{game.economics.stackDepth}BB</span>
                                    <span>•</span>
                                    <span>L{game.difficulty.level}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                ))}
            </div>

            {/* Center: Game Display */}
            <div style={{ flex: 1, position: 'relative' }}>
                {/* Header */}
                {currentGame && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: showInspector ? '350px' : 0,
                        padding: '12px 16px',
                        background: `linear-gradient(135deg, ${currentGame.visuals?.accentColor || '#00d4ff'}22, transparent)`,
                        borderBottom: `1px solid ${currentGame.visuals?.accentColor || '#00d4ff'}44`,
                        zIndex: 100,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <span style={{
                                color: currentGame.visuals?.accentColor || '#00d4ff',
                                fontWeight: 700,
                                fontSize: '16px'
                            }}>
                                {currentGame.name}
                            </span>
                            <span style={{ color: '#888', marginLeft: '12px', fontSize: '12px' }}>
                                {currentGame.description}
                            </span>
                        </div>
                        <button
                            onClick={() => setShowInspector(!showInspector)}
                            style={{
                                padding: '6px 12px',
                                background: 'rgba(255,255,255,0.1)',
                                border: 'none',
                                borderRadius: '6px',
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            {showInspector ? 'Hide' : 'Show'} Inspector
                        </button>
                    </div>
                )}

                {/* Game Area */}
                {scenario && scenario.config && (
                    <div style={{ paddingTop: '50px', height: '100%', paddingRight: showInspector ? '350px' : 0 }}>
                        <GameGuard onReset={() => setResetKey(prev => prev + 1)}>
                            <Director
                                key={`${selectedGameId}-${resetKey}`}
                                config={scenario.config}
                                onScenarioComplete={(correct, xp, diamonds) => {
                                    console.log('Factory scenario complete:', { correct, xp, diamonds, gameId: selectedGameId });
                                }}
                            />
                        </GameGuard>
                    </div>
                )}
            </div>

            {/* Right Panel: DNA Inspector */}
            {showInspector && scenario && currentGame && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: '350px',
                    background: 'linear-gradient(180deg, #0d0d1a, #1a1a2e)',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    overflowY: 'auto',
                    color: '#fff',
                    padding: '16px'
                }}>
                    <h2 style={{ fontSize: '14px', fontWeight: 700, color: '#00d4ff', marginBottom: '16px' }}>
                        🧬 Game DNA Inspector
                    </h2>

                    {/* Format */}
                    <Section title="FORMAT">
                        <Row label="Category" value={currentGame.category} />
                        <Row label="Table Size" value={`${currentGame.tableSize}-Max`} />
                        <Row label="Ante Type" value={currentGame.structure.anteType} />
                        <Row label="Speed" value={currentGame.structure.blindSpeed} />
                    </Section>

                    {/* Economics */}
                    <Section title="ECONOMICS">
                        <Row label="Stack Depth" value={`${currentGame.economics.stackDepth}BB`} />
                        <Row label="Buy-in" value={currentGame.economics.buyInChips.toLocaleString()} />
                        {currentGame.economics.payouts && (
                            <Row label="Payouts" value={currentGame.economics.payouts.join(' / ')} />
                        )}
                    </Section>

                    {/* Scenario Driver */}
                    <Section title="SCENARIO DRIVER">
                        <Row label="Hero Position" value={currentGame.scenario.heroPosition} />
                        <Row label="Situation" value={currentGame.scenario.situation.replace(/_/g, ' ')} />
                        <Row label="Villain Profile" value={currentGame.scenario.villainProfile} />
                        <Row label="Board Texture" value={currentGame.scenario.boardTexture} />
                    </Section>

                    {/* Factory Output */}
                    <Section title="FACTORY OUTPUT">
                        <Row label="Range Profile" value={scenario.rangeProfile} />
                        <Row label="Use ICM" value={scenario.useICM ? '✓ Yes' : '✗ No'} />
                        <Row label="Push/Fold Mode" value={scenario.isPushFold ? '✓ Active' : '✗ Standard'} />
                        <Row label="Theme Skin" value={scenario.themeSkin} />
                        <Row label="Pre-Sim Actions" value={`${scenario.preSimulatedHistory.length} steps`} />
                    </Section>

                    {/* Difficulty */}
                    <Section title="DIFFICULTY">
                        <Row label="Level" value={`${'★'.repeat(currentGame.difficulty.level)}${'☆'.repeat(5 - currentGame.difficulty.level)}`} />
                        {currentGame.difficulty.timeLimit && (
                            <Row label="Time Limit" value={`${currentGame.difficulty.timeLimit}s`} />
                        )}
                        <Row label="Hints" value={currentGame.difficulty.hintsEnabled ? '✓ Enabled' : '✗ Disabled'} />
                    </Section>

                    {/* Rewards */}
                    <Section title="REWARDS">
                        <Row label="Base XP" value={currentGame.rewards.baseXP.toString()} />
                        <Row label="XP Multiplier" value={`${currentGame.rewards.xpMultiplier}x`} />
                        <Row label="Diamond Multiplier" value={`${currentGame.rewards.diamondMultiplier}x`} />
                    </Section>

                    {/* Tags */}
                    {currentGame.tags && (
                        <Section title="TAGS">
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {currentGame.tags.map(tag => (
                                    <span key={tag} style={{
                                        padding: '2px 8px',
                                        background: 'rgba(0,212,255,0.2)',
                                        borderRadius: '10px',
                                        fontSize: '10px',
                                        color: '#00d4ff'
                                    }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
            )}
        </div>
    );
}

// Helper components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{
                fontSize: '10px',
                fontWeight: 700,
                color: '#888',
                letterSpacing: '1px',
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 0',
            fontSize: '12px'
        }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ color: '#fff', fontWeight: 500 }}>{value}</span>
        </div>
    );
}
