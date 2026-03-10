/**
 * ═══════════════════════════════════════════════════════════
 * usePullToRefresh — Club Arena Mobile PWA Hook
 * ═══════════════════════════════════════════════════════════
 * Native-feeling pull-to-refresh using touch events.
 * GPU-accelerated via transform: translateY.
 *
 * Usage:
 *   const { pullIndicator } = usePullToRefresh({
 *     onRefresh: async () => { await loadData(); },
 *     containerRef,          // optional — defaults to window
 *   });
 *
 *   return <div>{pullIndicator}{...content}</div>;
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import React from 'react';

const THRESHOLD = 80;  // px of pull before triggering refresh
const MAX_PULL = 120; // px max overscroll

export function usePullToRefresh({ onRefresh, containerRef, disabled = false }) {
    const [pulling, setPulling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [pullDistance, setPullDistance] = useState(0);
    const startY = useRef(0);
    const isPulling = useRef(false);

    const handleTouchStart = useCallback((e) => {
        if (disabled || refreshing) return;
        const scrollTop = containerRef?.current?.scrollTop ?? window.scrollY;
        if (scrollTop > 5) return; // Only activate at top
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
    }, [disabled, refreshing, containerRef]);

    const handleTouchMove = useCallback((e) => {
        if (!isPulling.current || disabled || refreshing) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy < 0) { isPulling.current = false; return; }
        const capped = Math.min(dy * 0.5, MAX_PULL); // dampened
        setPullDistance(capped);
        setPulling(true);
        if (capped > 20) e.preventDefault(); // prevent native scroll during pull
    }, [disabled, refreshing]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling.current) return;
        isPulling.current = false;
        if (pullDistance >= THRESHOLD && onRefresh) {
            setRefreshing(true);
            setPullDistance(THRESHOLD);
            try {
                await onRefresh();
            } catch (_) { }
            setRefreshing(false);
        }
        setPullDistance(0);
        setPulling(false);
    }, [pullDistance, onRefresh]);

    useEffect(() => {
        const target = containerRef?.current || window;
        const opts = { passive: false };
        target.addEventListener('touchstart', handleTouchStart, { passive: true });
        target.addEventListener('touchmove', handleTouchMove, opts);
        target.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            target.removeEventListener('touchstart', handleTouchStart);
            target.removeEventListener('touchmove', handleTouchMove);
            target.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd, containerRef]);

    const pullIndicator = (pulling || refreshing) ? (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: refreshing ? 40 : pullDistance,
            overflow: 'hidden',
            transition: refreshing ? 'height 0.3s' : 'none',
            willChange: 'transform',
        }}>
            <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.15)',
                borderTopColor: pullDistance >= THRESHOLD || refreshing ? '#2374E1' : 'rgba(255,255,255,0.4)',
                animation: refreshing ? 'caSpinRefresh 0.8s linear infinite' : 'none',
                transform: refreshing ? 'none' : `rotate(${pullDistance * 3}deg)`,
                transition: 'border-top-color 0.2s',
            }} />
        </div>
    ) : null;

    return { pullIndicator, refreshing };
}

// Inject spin keyframe
if (typeof document !== 'undefined') {
    const existing = document.getElementById('ca-pull-refresh-kf');
    if (!existing) {
        const s = document.createElement('style');
        s.id = 'ca-pull-refresh-kf';
        s.textContent = '@keyframes caSpinRefresh { to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
    }
}

export default usePullToRefresh;
