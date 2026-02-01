/* ═══════════════════════════════════════════════════════════════════════════
   CUSTOM RANGE BUILDER — Create and edit your own poker ranges
   Editable 13x13 grid with comparison to GTO
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState } from 'react';
import { PRESET_RANGES } from './RangeVisualizer';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

interface CustomRangeBuilderProps {
    initialRange?: Record<string, number>;
    onSave?: (range: Record<string, number>) => void;
    onAskJarvis?: (question: string) => void;
    onClose?: () => void;
}

export function CustomRangeBuilder({ initialRange, onSave, onAskJarvis, onClose }: CustomRangeBuilderProps) {
    const [customRange, setCustomRange] = useState<Record<string, number>>(initialRange || {});
    const [compareTo, setCompareTo] = useState<string>('BTN Open');
    const [brushMode, setBrushMode] = useState<'add' | 'remove' | 'mixed'>('add');
    const [brushFrequency, setBrushFrequency] = useState(1);

    // Get hand notation for a cell
    const getHandNotation = (row: number, col: number): { hand: string; type: 'pair' | 'suited' | 'offsuit' } => {
        const rank1 = RANKS[row];
        const rank2 = RANKS[col];

        if (row === col) {
            return { hand: `${rank1}${rank2}`, type: 'pair' };
        } else if (row < col) {
            return { hand: `${rank1}${rank2}s`, type: 'suited' };
        } else {
            return { hand: `${rank2}${rank1}o`, type: 'offsuit' };
        }
    };

    const handleCellClick = (hand: string) => {
        setCustomRange(prev => {
            const current = prev[hand] || 0;

            if (brushMode === 'add') {
                return { ...prev, [hand]: brushFrequency };
            } else if (brushMode === 'remove') {
                const newRange = { ...prev };
                delete newRange[hand];
                return newRange;
            } else {
                // Mixed mode - cycle through frequencies
                const frequencies = [0, 0.25, 0.5, 0.75, 1];
                const currentIdx = frequencies.indexOf(current);
                const nextIdx = (currentIdx + 1) % frequencies.length;
                if (frequencies[nextIdx] === 0) {
                    const newRange = { ...prev };
                    delete newRange[hand];
                    return newRange;
                }
                return { ...prev, [hand]: frequencies[nextIdx] };
            }
        });
    };

    // Count hands in range
    const countHands = () => {
        let total = 0;
        Object.entries(customRange).forEach(([hand, freq]) => {
            const f = freq as number;
            if (hand.length === 2) total += 6 * f;
            else if (hand.endsWith('s')) total += 4 * f;
            else total += 12 * f;
        });
        return Math.round(total);
    };

    const totalCombos = countHands();
    const percentage = ((totalCombos / 1326) * 100).toFixed(1);

    const gtoRange = PRESET_RANGES[compareTo]?.hands || {};

    const clearRange = () => setCustomRange({});

    const loadPreset = () => {
        const preset = PRESET_RANGES[compareTo]?.hands || {};
        setCustomRange({ ...preset });
    };

    const askJarvisToReview = () => {
        const handsInRange = Object.entries(customRange)
            .filter(([_, freq]) => freq as number > 0)
            .map(([hand, freq]) => `${hand}(${Math.round((freq as number) * 100)}%)`)
            .join(', ');

        const question = `Please review my custom poker range:

**Hands in Range:** ${handsInRange || 'Empty range'}
**Total Combos:** ${totalCombos} (${percentage}% of all hands)

Compare this to a standard ${compareTo} range and tell me:
1. What adjustments would you recommend?
2. Am I too tight or too loose?
3. Which hands should I add or remove?`;

        onAskJarvis?.(question);
        onClose?.();
    };

    return (
        <div style={{
            background: 'rgba(20, 10, 40, 0.98)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            maxWidth: '450px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px'
            }}>
                <h4 style={{
                    margin: 0,
                    color: '#FFD700',
                    fontSize: '14px',
                    fontWeight: 600
                }}>
                    ✏️ Custom Range Builder
                </h4>
                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'rgba(255, 215, 0, 0.6)',
                            fontSize: '18px',
                            cursor: 'pointer'
                        }}
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Brush Controls */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                flexWrap: 'wrap',
                alignItems: 'center'
            }}>
                <span style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>Mode:</span>
                {[
                    { id: 'add', label: '➕ Add', color: '#4CAF50' },
                    { id: 'remove', label: '➖ Remove', color: '#f44336' },
                    { id: 'mixed', label: '🔄 Cycle', color: '#FFD700' }
                ].map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => setBrushMode(mode.id as any)}
                        style={{
                            padding: '4px 8px',
                            background: brushMode === mode.id
                                ? `${mode.color}30`
                                : 'rgba(255, 215, 0, 0.05)',
                            border: `1px solid ${brushMode === mode.id ? mode.color : 'rgba(255, 215, 0, 0.2)'}`,
                            borderRadius: '4px',
                            color: brushMode === mode.id ? mode.color : 'rgba(255, 255, 255, 0.6)',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        {mode.label}
                    </button>
                ))}

                {brushMode === 'add' && (
                    <>
                        <span style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)', marginLeft: '8px' }}>
                            Freq:
                        </span>
                        {[0.25, 0.5, 0.75, 1].map(f => (
                            <button
                                key={f}
                                onClick={() => setBrushFrequency(f)}
                                style={{
                                    padding: '4px 6px',
                                    background: brushFrequency === f
                                        ? 'rgba(255, 215, 0, 0.3)'
                                        : 'rgba(255, 215, 0, 0.05)',
                                    border: `1px solid ${brushFrequency === f ? '#FFD700' : 'rgba(255, 215, 0, 0.2)'}`,
                                    borderRadius: '4px',
                                    color: brushFrequency === f ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
                                    fontSize: '9px',
                                    cursor: 'pointer'
                                }}
                            >
                                {Math.round(f * 100)}%
                            </button>
                        ))}
                    </>
                )}
            </div>

            {/* Compare To Select */}
            <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255, 215, 0, 0.7)' }}>Compare to: </span>
                <select
                    value={compareTo}
                    onChange={(e) => setCompareTo(e.target.value)}
                    style={{
                        padding: '4px 8px',
                        background: 'rgba(255, 215, 0, 0.1)',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        borderRadius: '4px',
                        color: '#FFD700',
                        fontSize: '10px',
                        cursor: 'pointer'
                    }}
                >
                    {Object.keys(PRESET_RANGES).map(name => (
                        <option key={name} value={name} style={{ background: '#1a0a2e' }}>
                            {name}
                        </option>
                    ))}
                </select>
            </div>

            {/* Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, 1fr)',
                gap: '1px',
                marginBottom: '12px'
            }}>
                {RANKS.map((_, row) => (
                    RANKS.map((_, col) => {
                        const { hand, type } = getHandNotation(row, col);
                        const customFreq = customRange[hand] || 0;
                        const gtoFreq = gtoRange[hand] || 0;
                        const diff = customFreq - gtoFreq;

                        // Color based on custom range
                        const getColor = (freq: number): string => {
                            if (freq >= 1) return 'rgba(255, 215, 0, 0.9)';
                            if (freq >= 0.7) return 'rgba(255, 215, 0, 0.6)';
                            if (freq >= 0.5) return 'rgba(255, 215, 0, 0.4)';
                            if (freq >= 0.25) return 'rgba(255, 215, 0, 0.2)';
                            if (freq > 0) return 'rgba(255, 215, 0, 0.1)';
                            return 'transparent';
                        };

                        // Show difference indicator
                        let diffIndicator = '';
                        let diffColor = 'transparent';
                        if (customFreq > 0 && gtoFreq > 0) {
                            if (diff > 0.2) { diffIndicator = '▲'; diffColor = '#4CAF50'; }
                            else if (diff < -0.2) { diffIndicator = '▼'; diffColor = '#f44336'; }
                        } else if (customFreq > 0 && gtoFreq === 0) {
                            diffIndicator = '+'; diffColor = '#4CAF50';
                        } else if (customFreq === 0 && gtoFreq > 0) {
                            diffIndicator = '-'; diffColor = '#f44336';
                        }

                        return (
                            <div
                                key={`${row}-${col}`}
                                onClick={() => handleCellClick(hand)}
                                style={{
                                    aspectRatio: '1',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '7px',
                                    fontWeight: customFreq > 0 ? 600 : 400,
                                    color: customFreq > 0 ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                                    background: getColor(customFreq),
                                    border: type === 'suited'
                                        ? '1px solid rgba(100, 200, 255, 0.3)'
                                        : type === 'pair'
                                            ? '1px solid rgba(255, 215, 0, 0.4)'
                                            : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '2px',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'all 0.1s ease'
                                }}
                                title={`${hand}: ${Math.round(customFreq * 100)}% (GTO: ${Math.round(gtoFreq * 100)}%)`}
                            >
                                {hand.replace('s', '').replace('o', '')}
                                {diffIndicator && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '-1px',
                                        right: '0px',
                                        fontSize: '5px',
                                        color: diffColor
                                    }}>
                                        {diffIndicator}
                                    </span>
                                )}
                            </div>
                        );
                    })
                ))}
            </div>

            {/* Stats */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 215, 0, 0.1)',
                borderRadius: '6px',
                fontSize: '11px',
                marginBottom: '12px'
            }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Combos: <strong style={{ color: '#FFD700' }}>{totalCombos}</strong>
                </span>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                    Frequency: <strong style={{ color: '#FFD700' }}>{percentage}%</strong>
                </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                    onClick={clearRange}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: 'rgba(255, 100, 100, 0.2)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '6px',
                        color: '#ff6666',
                        fontSize: '11px',
                        cursor: 'pointer'
                    }}
                >
                    🗑 Clear
                </button>
                <button
                    onClick={loadPreset}
                    style={{
                        flex: 1,
                        padding: '8px',
                        background: 'rgba(100, 200, 255, 0.2)',
                        border: '1px solid rgba(100, 200, 255, 0.3)',
                        borderRadius: '6px',
                        color: '#64C8FF',
                        fontSize: '11px',
                        cursor: 'pointer'
                    }}
                >
                    📋 Load GTO
                </button>
            </div>

            <button
                onClick={askJarvisToReview}
                disabled={Object.keys(customRange).length === 0}
                style={{
                    width: '100%',
                    padding: '12px',
                    background: Object.keys(customRange).length > 0
                        ? 'linear-gradient(135deg, #FFD700, #FFA500)'
                        : 'rgba(255, 215, 0, 0.2)',
                    border: 'none',
                    borderRadius: '8px',
                    color: Object.keys(customRange).length > 0 ? '#000' : 'rgba(255, 255, 255, 0.3)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: Object.keys(customRange).length > 0 ? 'pointer' : 'not-allowed'
                }}
            >
                🎩 Ask Jarvis to Review My Range
            </button>
        </div>
    );
}
