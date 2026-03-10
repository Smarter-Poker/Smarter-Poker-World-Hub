/**
 * ═══════════════════════════════════════════════════════════
 * SKELETON CARD — Club Arena Shimmer Loading State
 * ═══════════════════════════════════════════════════════════
 * GPU-accelerated shimmer using only transform + opacity.
 * Drop-in replacement for any loading spinner.
 */

import React, { useEffect, useRef } from 'react';

// Inject shimmer keyframe once globally
let _shimmerInjected = false;
function ensureShimmer() {
    if (_shimmerInjected || typeof document === 'undefined') return;
    _shimmerInjected = true;
    const s = document.createElement('style');
    s.textContent = `
    @keyframes caShimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
  `;
    document.head.appendChild(s);
}

const FB = {
    cardBg: '#242526',
    shimmerBase: 'rgba(255,255,255,0.04)',
    shimmerHighlight: 'rgba(255,255,255,0.08)',
};

/**
 * Single shimmer bar
 */
function ShimmerBar({ width = '100%', height = 14, borderRadius = 6, style = {} }) {
    return (
        <div style={{
            width, height, borderRadius,
            background: FB.shimmerBase,
            overflow: 'hidden',
            position: 'relative',
            ...style,
        }}>
            <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: `linear-gradient(90deg, transparent, ${FB.shimmerHighlight}, transparent)`,
                animation: 'caShimmer 1.5s infinite',
                willChange: 'transform',
            }} />
        </div>
    );
}

/**
 * SkeletonCard — Mimics a GameCard loading state
 */
export function SkeletonCard() {
    ensureShimmer();
    return (
        <div style={{
            background: FB.cardBg,
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
        }}>
            {/* Table image placeholder */}
            <ShimmerBar height={100} borderRadius={8} />
            {/* Title */}
            <ShimmerBar width="70%" height={12} />
            {/* Subtitle */}
            <ShimmerBar width="50%" height={10} />
            {/* Footer row */}
            <div style={{ display: 'flex', gap: 8 }}>
                <ShimmerBar width={40} height={18} borderRadius={9} />
                <ShimmerBar width={40} height={18} borderRadius={9} />
                <ShimmerBar width={40} height={18} borderRadius={9} />
            </div>
        </div>
    );
}

/**
 * SkeletonList — Multiple shimmer rows for list-based pages
 */
export function SkeletonList({ count = 5 }) {
    ensureShimmer();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} style={{
                    background: FB.cardBg,
                    borderRadius: 10,
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}>
                    {/* Avatar circle */}
                    <ShimmerBar width={40} height={40} borderRadius={20} />
                    {/* Text lines */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <ShimmerBar width="60%" height={12} />
                        <ShimmerBar width="40%" height={10} />
                    </div>
                    {/* Right badge */}
                    <ShimmerBar width={50} height={20} borderRadius={10} />
                </div>
            ))}
        </div>
    );
}

/**
 * SkeletonGrid — 2-column grid of SkeletonCards for lobby
 */
export function SkeletonGrid({ count = 6 }) {
    ensureShimmer();
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
            padding: '0 12px',
        }}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}

export default SkeletonCard;
