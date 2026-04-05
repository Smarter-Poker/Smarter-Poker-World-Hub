/**
 * POSITION WEAKNESS HEATMAP — Lightweight gameover widget for Preflop Charts games
 * Extracts position from mistake data and renders a visual 6-seat table heat map.
 *
 * Props:
 *   mistakes: Array<{ position: string, ... }> — position field contains scenario title like "UTG Open (100BB)"
 *   totalAnswers: number — total questions answered
 */

import React, { useMemo } from 'react';

// Extract clean position from scenario title like "UTG Open (100BB)" or "BB vs SB 3-bet"
function extractPosition(title) {
    if (!title || typeof title !== 'string') return null;
    const upper = title.toUpperCase();
    // Check for explicit position prefixes
    const positions = ['UTG+1', 'UTG', 'MP', 'HJ', 'LJ', 'CO', 'BTN', 'SB', 'BB', 'EP'];
    for (const pos of positions) {
        if (upper.startsWith(pos + ' ') || upper.startsWith(pos + '+') || upper.includes(' ' + pos + ' ') || upper === pos) {
            return pos === 'EP' ? 'UTG' : pos === 'LJ' ? 'HJ' : pos === 'UTG+1' ? 'UTG' : pos;
        }
    }
    return null;
}

const SEAT_POSITIONS = [
    { key: 'BTN', label: 'BTN', angle: 0 },
    { key: 'SB', label: 'SB', angle: 60 },
    { key: 'BB', label: 'BB', angle: 120 },
    { key: 'UTG', label: 'UTG', angle: 180 },
    { key: 'MP', label: 'MP', angle: 240 },
    { key: 'HJ', label: 'HJ', angle: 300 },
    { key: 'CO', label: 'CO', angle: 340 },
];

function getHeatColor(ratio) {
    if (ratio === 0) return 'rgba(255,255,255,0.06)';
    if (ratio < 0.25) return 'rgba(59,130,246,0.35)'; // blue — light mistakes
    if (ratio < 0.5) return 'rgba(245,158,11,0.45)'; // amber — moderate
    if (ratio < 0.75) return 'rgba(239,68,68,0.55)'; // red — heavy
    return 'rgba(239,68,68,0.8)'; // dark red — critical
}

function getBorderColor(ratio) {
    if (ratio === 0) return 'rgba(255,255,255,0.1)';
    if (ratio < 0.25) return 'rgba(59,130,246,0.5)';
    if (ratio < 0.5) return 'rgba(245,158,11,0.6)';
    if (ratio < 0.75) return 'rgba(239,68,68,0.6)';
    return 'rgba(239,68,68,0.9)';
}

export default function PositionWeaknessHeatmap({ mistakes, totalAnswers }) {
    const positionData = useMemo(() => {
        if (!mistakes || mistakes.length === 0) return null;

        const counts = {};
        mistakes.forEach(m => {
            // Try extracting from position field, spot field, or title field
            const raw = m.position || m.spot || m.title || '';
            const pos = extractPosition(raw);
            if (pos) {
                counts[pos] = (counts[pos] || 0) + 1;
            }
        });

        if (Object.keys(counts).length === 0) return null;

        const maxCount = Math.max(...Object.values(counts), 1);
        return SEAT_POSITIONS.map(seat => ({
            ...seat,
            count: counts[seat.key] || 0,
            ratio: (counts[seat.key] || 0) / maxCount,
        }));
    }, [mistakes]);

    if (!positionData) return null;

    // Check if any position has mistakes
    const hasMistakes = positionData.some(s => s.count > 0);
    if (!hasMistakes) return null;

    const radius = 65;
    const centerX = 90;
    const centerY = 78;

    return (
        <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '14px 12px 10px',
            marginBottom: 16,
        }}>
            <div style={{
                fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
                letterSpacing: 1.5, textAlign: 'center', marginBottom: 8,
            }}>
                {'\uD83D\uDD25'} POSITION WEAKNESS MAP
            </div>

            <div style={{ position: 'relative', width: 180, height: 160, margin: '0 auto' }}>
                {/* Center table oval */}
                <div style={{
                    position: 'absolute',
                    left: centerX - 35, top: centerY - 18,
                    width: 70, height: 36,
                    background: 'rgba(0,100,0,0.25)',
                    border: '2px solid rgba(0,150,0,0.3)',
                    borderRadius: '50%',
                }} />

                {/* Seat circles */}
                {positionData.map(seat => {
                    const rad = (seat.angle - 90) * (Math.PI / 180);
                    const x = centerX + radius * Math.cos(rad) - 18;
                    const y = centerY + radius * Math.sin(rad) - 18;

                    return (
                        <div
                            key={seat.key}
                            style={{
                                position: 'absolute',
                                left: x, top: y,
                                width: 36, height: 36,
                                borderRadius: '50%',
                                background: getHeatColor(seat.ratio),
                                border: `2px solid ${getBorderColor(seat.ratio)}`,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.3s ease',
                            }}
                        >
                            <div style={{
                                fontSize: 9, fontWeight: 700,
                                color: seat.count > 0 ? '#fff' : 'rgba(255,255,255,0.35)',
                                lineHeight: 1,
                            }}>
                                {seat.label}
                            </div>
                            {seat.count > 0 && (
                                <div style={{
                                    fontSize: 8, fontWeight: 600,
                                    color: 'rgba(255,255,255,0.7)',
                                    lineHeight: 1,
                                    marginTop: 1,
                                }}>
                                    {seat.count}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex', justifyContent: 'center', gap: 12, marginTop: 4,
                fontSize: 9, color: 'rgba(255,255,255,0.35)',
            }}>
                <span>{'\uD83D\uDFE2'} Clean</span>
                <span>{'\uD83D\uDFE1'} Weak</span>
                <span>{'\uD83D\uDD34'} Leaking</span>
            </div>
        </div>
    );
}
