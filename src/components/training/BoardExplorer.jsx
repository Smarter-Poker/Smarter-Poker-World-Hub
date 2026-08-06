/**
 * BOARD EXPLORER — Strategy Changes Across Different Board Textures
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style board explorer showing how solver strategy changes
 * for the same hand across different board textures:
 *   - Pick a hand → see strategy on 12 different board textures
 *   - Color-coded frequency comparison grid
 *   - Board texture classification with dynamic generation
 *   - Per-texture c-bet/check frequency bars
 *   - Highlights where your hand plays very differently
 *
 * Uses PostflopStrategyEngine + BoardTextureEngine + solver data matrices.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import { getPostflopStrategy, getCbetStrategy } from '../../engines/PostflopStrategyEngine';
import { analyzeBoard } from '../../engines/BoardTextureEngine';
import { classifyMadeHand, classifyDraws } from '../../engines/HandStrengthEngine';
import {
    lookupCbetStrategy,
    lookupCheckRaiseStrategy,
    BOARD_TEXTURES,
} from '../../config/postflopSolverData';

// ●● Sample Boards for Each Texture ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const TEXTURE_BOARDS = [
    { texture: 'Dry High', board: ['As', 'Kd', '7c'], category: 'dry' },
    { texture: 'Dry Low', board: ['8s', '4d', '2c'], category: 'dry' },
    { texture: 'Monotone High', board: ['Ks', 'Ts', '7s'], category: 'wet' },
    { texture: 'Monotone Low', board: ['8s', '5s', '3s'], category: 'wet' },
    { texture: 'Two-Tone High', board: ['Kh', 'Jh', '4c'], category: 'medium' },
    { texture: 'Two-Tone Low', board: ['9h', '6h', '2c'], category: 'medium' },
    { texture: 'Paired High', board: ['Ks', 'Kd', '4c'], category: 'dry' },
    { texture: 'Paired Low', board: ['7s', '7d', '3c'], category: 'dry' },
    { texture: 'Connected', board: ['Ts', '9d', '8c'], category: 'wet' },
    { texture: 'Broadway Dry', board: ['As', 'Qd', 'Jc'], category: 'dry' },
    { texture: 'Low Connected', board: ['6s', '5d', '4c'], category: 'wet' },
    { texture: 'Mixed', board: ['Jh', '8d', '3c'], category: 'medium' },
];

const SuitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' };
const SuitColor = { h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e2e8f0' };

// ●● Quick Hand Presets ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const HAND_PRESETS = [
    { hand: ['Ah', 'Kd'], label: 'AKo' },
    { hand: ['Qs', 'Qd'], label: 'QQ' },
    { hand: ['Th', 'Td'], label: 'TT' },
    { hand: ['As', 'Js'], label: 'AJs' },
    { hand: ['Kh', 'Qh'], label: 'KQs' },
    { hand: ['Jd', 'Ts'], label: 'JTo' },
    { hand: ['9h', '8h'], label: '98s' },
    { hand: ['7s', '6s'], label: '76s' },
    { hand: ['Ah', '5h'], label: 'A5s' },
    { hand: ['5d', '4d'], label: '54s' },
];

// ●● Mini Card Display ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const MiniCard = memo(({ card }) => {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = card[1].toLowerCase();
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 11, fontWeight: 700,
            color: SuitColor[suit] || '#e2e8f0',
        }}>
            {rank}<span style={{ fontSize: 9 }}>{SuitSymbol[suit]}</span>
        </span>
    );
});

// ●● Board Texture Row ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const TextureRow = memo(({ texture, board, heroCards, position, isSelected, onClick }) => {
    // Get strategy for this board
    const analysis = useMemo(() => {
        try {
            // Check for card conflicts
            const allCards = [...board, ...heroCards].map(c => c.toLowerCase());
            const unique = new Set(allCards);
            if (unique.size < allCards.length) return null; // Card conflict

            const made = classifyMadeHand(heroCards, board);
            const draws = classifyDraws(heroCards, board);

            const strategy = getPostflopStrategy({
                holeCards: heroCards,
                board,
                potSize: 6,
                effectiveStack: 100,
                street: 'flop',
                position,
                isPFR: true,
            });

            const betFreq = strategy?.frequencies?.bet || 0;
            const checkFreq = strategy?.frequencies?.check || 1 - betFreq;

            return {
                made,
                draws,
                betFreq,
                checkFreq,
                action: strategy?.action || 'check',
                sizing: strategy?.sizing,
            };
        } catch {
            return null;
        }
    }, [board, heroCards, position]);

    if (!analysis) {
        return (
            <div style={{
                padding: '6px 10px', borderRadius: 6,
                background: 'rgba(30,41,59,0.3)',
                border: '1px solid rgba(100,116,139,0.05)',
                opacity: 0.3, fontSize: 10, color: '#475569',
            }}>
                {texture} — card conflict
            </div>
        );
    }

    const betColor = analysis.betFreq >= 0.7 ? '#22c55e' : analysis.betFreq >= 0.4 ? '#f59e0b' : '#ef4444';

    return (
        <motion.div
            onClick={onClick}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            style={{
                padding: '8px 10px', borderRadius: 6,
                background: isSelected ? 'rgba(0,212,255,0.06)' : 'rgba(15,23,42,0.3)',
                border: `1px solid ${isSelected ? 'rgba(0,212,255,0.15)' : 'rgba(100,116,139,0.06)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>{texture}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                        {board.map((c, i) => <MiniCard key={i} card={c} />)}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#818cf8', fontStyle: 'italic' }}>
                        {analysis.made.description || analysis.made.rank || ''}
                    </span>
                    {analysis.draws?.outs > 0 && (
                        <span style={{ fontSize: 9, color: '#64748b' }}>
                            +{analysis.draws.outs}outs
                        </span>
                    )}
                </div>
            </div>

            {/* Bet/Check frequency bar */}
            <div style={{ display: 'flex', gap: 2, height: 12, borderRadius: 3, overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${analysis.betFreq * 100}%` }}
                    style={{
                        height: '100%',
                        background: `linear-gradient(90deg, ${betColor}88, ${betColor})`,
                        borderRadius: '3px 0 0 3px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    {analysis.betFreq >= 0.15 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>
                            Bet {(analysis.betFreq * 100).toFixed(0)}%
                        </span>
                    )}
                </motion.div>
                <div style={{
                    flex: 1,
                    background: 'rgba(100,116,139,0.15)',
                    borderRadius: '0 3px 3px 0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    {analysis.checkFreq >= 0.15 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8' }}>
                            Check {(analysis.checkFreq * 100).toFixed(0)}%
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function BoardExplorer() {
    const [heroCards, setHeroCards] = useState(['Ah', 'Kd']);
    const [position, setPosition] = useState('IP');
    const [selectedTexture, setSelectedTexture] = useState(null);
    const [handInput, setHandInput] = useState('');

    // Parse hand input (e.g., "AhKd" or "Ah Kd")
    const parseHandInput = (input) => {
        const cleaned = input.replace(/\s+/g, '');
        if (cleaned.length >= 4) {
            setHeroCards([cleaned.substring(0, 2), cleaned.substring(2, 4)]);
        }
    };

    // Aggregate stats
    const stats = useMemo(() => {
        let totalBet = 0, totalCheck = 0, count = 0;
        TEXTURE_BOARDS.forEach(tb => {
            try {
                const allCards = [...tb.board, ...heroCards].map(c => c.toLowerCase());
                if (new Set(allCards).size < allCards.length) return;

                const strategy = getPostflopStrategy({
                    holeCards: heroCards,
                    board: tb.board,
                    potSize: 6,
                    effectiveStack: 100,
                    street: 'flop',
                    position,
                    isPFR: true,
                });
                totalBet += strategy?.frequencies?.bet || 0;
                totalCheck += strategy?.frequencies?.check || (1 - (strategy?.frequencies?.bet || 0));
                count++;
            } catch (e) { console.warn('[App] Handled exception:', e); }
        });
        if (count === 0) return { avgBet: 0, avgCheck: 0 };
        return { avgBet: totalBet / count, avgCheck: totalCheck / count };
    }, [heroCards, position]);

    const selectedDetail = selectedTexture !== null ? TEXTURE_BOARDS[selectedTexture] : null;

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                        Board Explorer
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {['IP', 'OOP'].map(p => (
                            <button
                                key={p}
                                onClick={() => setPosition(p)}
                                style={{
                                    padding: '3px 10px', fontSize: 10, fontWeight: 600,
                                    borderRadius: 4, border: '1px solid', cursor: 'pointer',
                                    background: position === p ? 'rgba(0,212,255,0.1)' : 'transparent',
                                    color: position === p ? '#00d4ff' : '#64748b',
                                    borderColor: position === p ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                                }}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Hand selector */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                        {heroCards.map((c, i) => (
                            <div key={i} style={{
                                width: 32, height: 44, borderRadius: 4,
                                background: 'linear-gradient(180deg, #f8fafc, #e2e8f0)',
                                border: '1px solid rgba(0,0,0,0.12)',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 'bold',
                                color: SuitColor[c[1]?.toLowerCase()] || '#1e293b',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                            }}>
                                <span>{c[0]}</span>
                                <span style={{ fontSize: 9 }}>{SuitSymbol[c[1]?.toLowerCase()] || ''}</span>
                            </div>
                        ))}
                    </div>
                    <input
                        type="text"
                        value={handInput}
                        onChange={e => { setHandInput(e.target.value); parseHandInput(e.target.value); }}
                        placeholder="AhKd"
                        style={{
                            width: 60, padding: '4px 6px', fontSize: 11,
                            background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(100,116,139,0.2)',
                            borderRadius: 4, color: '#e2e8f0', outline: 'none',
                            fontFamily: "'Fira Code', monospace",
                        }}
                    />
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {HAND_PRESETS.map(p => (
                            <button
                                key={p.label}
                                onClick={() => { setHeroCards(p.hand); setHandInput(p.hand.join('')); }}
                                style={{
                                    padding: '2px 6px', fontSize: 9, fontWeight: 600,
                                    borderRadius: 3, border: '1px solid rgba(100,116,139,0.1)',
                                    cursor: 'pointer',
                                    background: heroCards.join('') === p.hand.join('') ? 'rgba(0,212,255,0.1)' : 'rgba(0,0,0,0.15)',
                                    color: heroCards.join('') === p.hand.join('') ? '#00d4ff' : '#94a3b8',
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Aggregate stats */}
            <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.08)',
                display: 'flex', gap: 16,
            }}>
                <div style={{ fontSize: 10 }}>
                    <span style={{ color: '#64748b' }}>Avg Bet Freq: </span>
                    <span style={{
                        color: stats.avgBet >= 0.6 ? '#22c55e' : stats.avgBet >= 0.35 ? '#f59e0b' : '#ef4444',
                        fontWeight: 700, fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}>
                        {(stats.avgBet * 100).toFixed(0)}%
                    </span>
                </div>
                <div style={{ fontSize: 10 }}>
                    <span style={{ color: '#64748b' }}>Avg Check Freq: </span>
                    <span style={{ color: '#94a3b8', fontWeight: 700, fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                        {(stats.avgCheck * 100).toFixed(0)}%
                    </span>
                </div>
                <div style={{ fontSize: 10 }}>
                    <span style={{ color: '#64748b' }}>Textures: </span>
                    <span style={{ color: '#818cf8', fontWeight: 700 }}>{TEXTURE_BOARDS.length}</span>
                </div>
            </div>

            {/* Board texture list */}
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {TEXTURE_BOARDS.map((tb, i) => (
                    <TextureRow
                        key={i}
                        texture={tb.texture}
                        board={tb.board}
                        heroCards={heroCards}
                        position={position}
                        isSelected={selectedTexture === i}
                        onClick={() => setSelectedTexture(selectedTexture === i ? null : i)}
                    />
                ))}
            </div>
        </div>
    );
}
