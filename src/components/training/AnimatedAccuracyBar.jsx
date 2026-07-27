/**
 * ANIMATED ACCURACY BAR — Gameover accuracy display with counting-up fill
 *
 * Features:
 *   - Smooth bar fill animation from 0 to target %
 *   - Counter text that counts up simultaneously
 *   - Grade-colored bar with glow effect
 *   - Optional personal best comparison
 *
 * Props:
 *   accuracy:     number (0-100) — final accuracy percentage
 *   grade:        string (S/A/B/C/D) — used for color
 *   label:        string — label text (default: "ACCURACY")
 *   personalBest: number|null — if provided, shows PB comparison
 *   duration:     number — animation duration in ms (default: 1200)
 */

import React, { useState, useEffect, useRef } from 'react';

const GRADE_COLORS = {
    S: '#FFD700',
    A: '#22C55E',
    B: '#3B82F6',
    C: '#F59E0B',
    D: '#EF4444',
};

export default function AnimatedAccuracyBar({
    accuracy = 0,
    grade = 'C',
    label = 'ACCURACY',
    personalBest = null,
    duration = 1200,
}) {
    const [displayValue, setDisplayValue] = useState(0);
    const [barWidth, setBarWidth] = useState(0);
    const frameRef = useRef(null);
    const startTimeRef = useRef(null);

    const color = GRADE_COLORS[grade] || '#3B82F6';
    const isNewPB = personalBest !== null && accuracy > personalBest;

    useEffect(() => {
        // Small delay before starting animation for visual impact
        const delay = setTimeout(() => {
            startTimeRef.current = performance.now();

            const animate = (now) => {
                const elapsed = now - startTimeRef.current;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out cubic for smooth deceleration
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentValue = Math.round(eased * accuracy);

                setDisplayValue(currentValue);
                setBarWidth(eased * accuracy);

                if (progress < 1) {
                    frameRef.current = requestAnimationFrame(animate);
                }
            };

            frameRef.current = requestAnimationFrame(animate);
        }, 300);

        return () => {
            clearTimeout(delay);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [accuracy, duration]);

    return (
        <div style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 16,
        }}>
            {/* Header row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 10,
            }}>
                <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.4)',
                    letterSpacing: 1.5,
                }}>
                    {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                        fontSize: 24,
                        fontWeight: 800,
                        color,
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {displayValue}%
                    </span>
                    {personalBest !== null && (
                        <span style={{
                            fontSize: 11,
                            color: isNewPB ? '#FFD700' : 'rgba(255,255,255,0.3)',
                            fontWeight: 600,
                        }}>
                            {isNewPB ? '★ NEW PB!' : `PB: ${personalBest}%`}
                        </span>
                    )}
                </div>
            </div>

            {/* Bar track */}
            <div style={{
                height: 8,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                overflow: 'hidden',
                position: 'relative',
            }}>
                {/* Personal best marker */}
                {personalBest !== null && personalBest > 0 && personalBest < 100 && (
                    <div style={{
                        position: 'absolute',
                        left: `${personalBest}%`,
                        top: 0,
                        bottom: 0,
                        width: 2,
                        background: 'rgba(255,255,255,0.2)',
                        zIndex: 2,
                    }} />
                )}

                {/* Animated fill */}
                <div style={{
                    height: '100%',
                    borderRadius: 4,
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                    boxShadow: barWidth > 50 ? `0 0 12px ${color}40` : 'none',
                    transition: 'none', // We drive this with rAF, not CSS transitions
                }} />
            </div>

            {/* Grade markers */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 6,
                fontSize: 8,
                color: 'rgba(255,255,255,0.2)',
                fontWeight: 600,
            }}>
                <span>0</span>
                <span style={{ color: accuracy >= 50 ? 'rgba(255,255,255,0.3)' : undefined }}>50</span>
                <span style={{ color: accuracy >= 70 ? 'rgba(255,255,255,0.3)' : undefined }}>70</span>
                <span style={{ color: accuracy >= 85 ? 'rgba(255,255,255,0.3)' : undefined }}>85</span>
                <span style={{ color: accuracy >= 95 ? 'rgba(255,255,255,0.3)' : undefined }}>95</span>
                <span>100</span>
            </div>
        </div>
    );
}
