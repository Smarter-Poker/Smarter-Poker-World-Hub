/**
 * CIRCULAR TIMER — SVG ring countdown that wraps around the hand card
 * Used by SpeedDrill and PressureCooker for visual timer pressure.
 *
 * Props:
 *   percent:   0-100 — how much time remains
 *   color:     string — stroke color (changes based on urgency)
 *   size:      number — diameter (default 200)
 *   thickness: number — stroke width (default 6)
 *   isLow:     boolean — trigger pulse animation
 *   children:  React node — content rendered inside the ring
 */

import React from 'react';

export default function CircularTimer({
    percent = 100,
    color = '#00ff88',
    size = 200,
    thickness = 6,
    isLow = false,
    children,
}) {
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - percent / 100);

    return (
        <div style={{
            position: 'relative',
            width: size,
            height: size,
            margin: '0 auto',
            animation: isLow ? 'timerPulse 0.6s ease-in-out infinite' : 'none',
        }}>
            {/* Background ring */}
            <svg
                width={size}
                height={size}
                style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}
            >
                {/* Track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={thickness}
                />
                {/* Progress */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={thickness}
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{
                        transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s ease',
                        filter: isLow ? `drop-shadow(0 0 8px ${color})` : 'none',
                    }}
                />
            </svg>

            {/* Glow ring when low */}
            {isLow && (
                <svg
                    width={size}
                    height={size}
                    style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', opacity: 0.3 }}
                >
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={thickness + 4}
                        strokeDasharray={circumference}
                        strokeDashoffset={dashOffset}
                        strokeLinecap="round"
                        style={{ filter: `blur(4px)` }}
                    />
                </svg>
            )}

            {/* Content inside ring */}
            <div style={{
                position: 'absolute',
                top: thickness,
                left: thickness,
                right: thickness,
                bottom: thickness,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {children}
            </div>

            {/* CSS keyframes injected inline */}
            <style>{`
                @keyframes timerPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.03); }
                }
            `}</style>
        </div>
    );
}
