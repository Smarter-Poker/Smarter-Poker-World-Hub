/**
 * 🎯 MULTI-TABLE PRACTICE — Train on 2-4 Tables Simultaneously
 * ═══════════════════════════════════════════════════════════════════════════
 * Render multiple independent GodModeArena instances in a grid layout.
 * Combined stats across all tables. GTO Wizard-style multi-tabling.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';

// Dynamic import to avoid SSR issues with the Arena
const GodModeArena = dynamic(
    () => import('../../../src/components/training/GodModeArena'),
    { ssr: false, loading: () => <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading table...</div> }
);

// ═══════════════════════════════════════════════════════════════════════════
// GAME PRESETS FOR MULTI-TABLE
// ═══════════════════════════════════════════════════════════════════════════

const MULTI_TABLE_GAMES = [
    { id: 'cash-002', name: '3-Bet Pots' },
    { id: 'cash-003', name: 'Continuation Betting' },
    { id: 'cash-004', name: 'Check-Raise Defense' },
    { id: 'cash-005', name: 'Blind Defense' },
    { id: 'mtt-001', name: 'ICM Preflop' },
    { id: 'mtt-002', name: 'Short Stack Play' },
    { id: 'mtt-003', name: 'Bubble Play' },
    { id: 'cash-006', name: 'River Decisions' },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function MultiTablePage() {
    const router = useRouter();
    useTrainingBus('multi-table');
    const [tableCount, setTableCount] = useState(2);
    const [isStarted, setIsStarted] = useState(false);
    const [selectedGames, setSelectedGames] = useState(['cash-002', 'cash-003', 'cash-004', 'cash-005']);
    const [combinedStats, setCombinedStats] = useState({
        totalHands: 0, totalCorrect: 0, totalEVLoss: 0, tablesCompleted: 0,
    });
    const [isAutoAdvance, setIsAutoAdvance] = useState(false);

    // Listen for session-complete events from each table
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, (detail) => {
            setCompletedTables(prev => new Set([...prev, detail?.gameId]));
            setCombinedStats(prev => ({
                totalHands: prev.totalHands + (detail?.totalQuestions || detail?.handsPlayed || 0),
                totalCorrect: prev.totalCorrect + (detail?.correctCount || 0),
                totalEVLoss: prev.totalEVLoss + (detail?.totalEVLoss || 0),
                tablesCompleted: prev.tablesCompleted + 1,
            }));
        });
        return unsub;
    }, []);

    // Auto-save combined session when all tables complete
    useEffect(() => {
        if (completedTables.size >= tableCount && isStarted) {
            const saveMultiSession = async () => {
                try {
                    const user = getAuthUser();
                    if (!user?.session?.access_token) return;

                    const accuracy = combinedStats.totalHands > 0
                        ? Math.round((combinedStats.totalCorrect / combinedStats.totalHands) * 100)
                        : 0;

                    await fetch('/api/training/save-session', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getAccessToken()}`,
                        },
                        body: JSON.stringify({
                            gameId: 'multi-table',
                            gameName: `Multi-Table (${tableCount} tables)`,
                            gtowScore: accuracy,
                            totalEVLoss: combinedStats.totalEVLoss,
                            handsPlayed: combinedStats.totalHands,
                            mistakeCount: combinedStats.totalHands - combinedStats.totalCorrect,
                            accuracy,
                            correctCount: combinedStats.totalCorrect,
                            bestStreak: 0,
                            levelPassed: accuracy >= 60,
                            level: tableCount,
                            handHistory: [],
                        }),
                    });
                    console.log('[MultiTable] Combined session saved ✅');

                    eventBus.emit(EventType.SESSION_END, {
                        gameId: 'multi-table',
                        handsPlayed: combinedStats.totalHands,
                        accuracy,
                    }, 'MultiTable');
                } catch (err) {
                    console.error('[MultiTable] Save error:', err);
                }
            };
            saveMultiSession();
        }
    }, [completedTables.size, tableCount, isStarted, combinedStats]);

    const gridCols = tableCount <= 2 ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)';
    const gridRows = tableCount <= 2 ? '1fr' : 'repeat(2, 1fr)';

    return (
        <>
            <Head>
                <title>Multi-Table Practice | Smarter.Poker Training</title>
                <meta name="description" content="Practice GTO decisions across 2-4 tables simultaneously. Build speed and accuracy under pressure." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a12 0%, #0f0f1e 50%, #1a1a2e 100%)',
                color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {!isStarted ? (
                    /* Setup Screen */
                    <div style={{ padding: '60px 20px', maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                        <h1 style={{
                            fontSize: 24, fontWeight: 800, margin: '0 0 8px',
                            background: 'linear-gradient(135deg, #00d4ff, #a855f7)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            fontFamily: "'Orbitron', monospace",
                        }}>Multi-Table Practice</h1>
                        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 32 }}>
                            Train on multiple tables simultaneously to build speed and accuracy under pressure.
                        </p>

                        {/* Table Count Selector */}
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                                NUMBER OF TABLES
                            </div>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                {[2, 3, 4].map(n => (
                                    <motion.button
                                        key={n}
                                        onClick={() => setTableCount(n)}
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        style={{
                                            width: 64, height: 64, borderRadius: 12, border: 'none', cursor: 'pointer',
                                            fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                                            background: tableCount === n ? 'linear-gradient(135deg, #00d4ff, #a855f7)' : 'rgba(255,255,255,0.04)',
                                            color: tableCount === n ? '#fff' : '#64748b',
                                            border: tableCount === n ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                        }}
                                    >{n}</motion.button>
                                ))}
                            </div>
                        </div>

                        {/* Auto-Advance Toggle */}
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                                BLITZ MODE
                            </div>
                            <div
                                onClick={() => setIsAutoAdvance(!isAutoAdvance)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px',
                                    borderRadius: 12, cursor: 'pointer',
                                    background: isAutoAdvance ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isAutoAdvance ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                }}
                            >
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: isAutoAdvance ? '#22c55e' : '#e2e8f0' }}>Auto-Advance Hands</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Automatically deal next hand after answering</div>
                                </div>
                                <div style={{ fontSize: 18 }}>{isAutoAdvance ? '⚡' : '🔄'}</div>
                            </div>
                        </div>

                        {/* Game Selection Grid */}
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                                DRILLS (SELECT {tableCount})
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                                {MULTI_TABLE_GAMES.map(g => {
                                    const isSelected = selectedGames.indexOf(g.id) < tableCount && selectedGames.includes(g.id);
                                    return (
                                        <button
                                            key={g.id}
                                            onClick={() => {
                                                setSelectedGames(prev => {
                                                    if (prev.includes(g.id)) return prev.filter(x => x !== g.id);
                                                    if (prev.length >= tableCount) return [...prev.slice(1), g.id];
                                                    return [...prev, g.id];
                                                });
                                            }}
                                            style={{
                                                padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                                fontSize: 11, fontWeight: 600, textAlign: 'left',
                                                background: isSelected ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.03)',
                                                color: isSelected ? '#00d4ff' : '#94a3b8',
                                                border: `1px solid ${isSelected ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                            }}
                                        >{g.name}</button>
                                    );
                                })}
                            </div>
                        </div>

                        <motion.button
                            onClick={() => setIsStarted(true)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{
                                padding: '14px 40px', borderRadius: 12, border: 'none', cursor: 'pointer',
                                fontSize: 15, fontWeight: 800, fontFamily: "'Orbitron', monospace",
                                background: 'linear-gradient(135deg, #00d4ff, #a855f7)', color: '#fff',
                                boxShadow: '0 4px 20px rgba(0,212,255,0.3)',
                            }}
                        >START {tableCount} TABLES</motion.button>

                        <button
                            onClick={() => router.push('/hub/training')}
                            style={{
                                display: 'block', margin: '16px auto 0', padding: '8px 20px',
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#64748b', fontSize: 12, cursor: 'pointer',
                            }}
                        >← Back to Training</button>
                    </div>
                ) : (
                    /* Playing Screen — Multi Table Grid */
                    <>
                        {/* Top Stats Bar */}
                        <div style={{
                            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16,
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(0,0,0,0.3)',
                        }}>
                            <button
                                onClick={() => { setIsStarted(false); setCompletedTables(new Set()); setCombinedStats({ totalHands: 0, totalCorrect: 0, totalEVLoss: 0, tablesCompleted: 0 }); }}
                                style={{
                                    background: 'rgba(255,255,255,0.06)', border: 'none',
                                    borderRadius: 6, padding: '4px 10px', color: '#94a3b8',
                                    cursor: 'pointer', fontSize: 11, fontWeight: 600,
                                }}
                            >← Exit</button>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#00d4ff', fontFamily: "'Orbitron', monospace" }}>
                                {tableCount}-TABLE MODE
                            </span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 10 }}>
                                <span style={{ color: '#22c55e' }}>Hands: {combinedStats.totalHands}</span>
                                <span style={{ color: '#fbbf24' }}>Correct: {combinedStats.totalCorrect}</span>
                                <span style={{ color: '#ef4444' }}>EV Loss: {combinedStats.totalEVLoss.toFixed(1)}bb</span>
                                <span style={{ color: '#a855f7' }}>Done: {completedTables.size}/{tableCount}</span>
                            </div>
                        </div>

                        {/* Table Grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: gridCols,
                            gridTemplateRows: gridRows,
                            height: 'calc(100vh - 45px)',
                            gap: 2,
                        }}>
                            {selectedGames.slice(0, tableCount).map((gameId, i) => (
                                <div key={gameId} style={{
                                    overflow: 'hidden',
                                    borderRadius: 0,
                                    border: completedTables.has(gameId)
                                        ? '2px solid rgba(34,197,94,0.3)'
                                        : '1px solid rgba(255,255,255,0.04)',
                                    position: 'relative',
                                }}>
                                    {/* Table Number Badge */}
                                    <div style={{
                                        position: 'absolute', top: 8, left: 8, zIndex: 10,
                                        width: 24, height: 24, borderRadius: '50%',
                                        background: 'rgba(0,212,255,0.2)', border: '1px solid rgba(0,212,255,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, fontWeight: 800, color: '#00d4ff',
                                        fontFamily: "'Orbitron', monospace",
                                    }}>{i + 1}</div>

                                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'top left', width: '117.6%', height: '117.6%' }}>
                                        <GodModeArena
                                            gameId={gameId}
                                            gameName={MULTI_TABLE_GAMES.find(g => g.id === gameId)?.name || gameId}
                                            level={1}
                                            autoAdvance={isAutoAdvance}
                                            onComplete={() => { }}
                                            onExit={() => setCompletedTables(prev => new Set([...prev, gameId]))}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
