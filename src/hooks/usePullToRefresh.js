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

const THRESHOLD = 80;  // px of pull before triggering refresh
const MAX_PULL = 120; // px max overscroll

export function usePullToRefresh({ onRefresh, containerRef, disabled = false }) {
    const [refreshing, setRefreshing] = useState(false);
    const startY = useRef(0);
    const isPulling = useRef(false);
    const isRefreshingRef = useRef(false);
    const spinnerRef = useRef(null);
    const ringRef = useRef(null);

    // Initialize raw DOM element once per page
    useEffect(() => {
        if (typeof document === 'undefined') return;

        let container = document.getElementById('ca-pull-spinner-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ca-pull-spinner-container';
            container.style.cssText = `
                position: fixed;
                top: 60px;
                left: 0;
                right: 0;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 0px;
                overflow: hidden;
                will-change: height, transform;
                pointer-events: none;
            `;

            const ring = document.createElement('div');
            ring.id = 'ca-pull-spinner-ring';
            ring.style.cssText = `
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 3px solid rgba(255,255,255,0.15);
                border-top-color: rgba(255,255,255,0.4);
                transition: border-top-color 0.2s;
                will-change: transform;
            `;
            container.appendChild(ring);
            document.body.appendChild(container);
        }

        spinnerRef.current = container;
        ringRef.current = document.getElementById('ca-pull-spinner-ring');

        return () => {
            // We leave the singleton in the DOM to avoid thrashing,
            // just reset it.
            if (spinnerRef.current) {
                spinnerRef.current.style.height = '0px';
                spinnerRef.current.style.transition = 'none';
            }
            if (ringRef.current) {
                ringRef.current.style.animation = 'none';
                ringRef.current.style.transform = 'none';
            }
        };
    }, []);

    const updateDOM = useCallback((height, rotation, isRefreshingState) => {
        if (!spinnerRef.current || !ringRef.current) return;
        spinnerRef.current.style.height = `${height}px`;
        spinnerRef.current.style.transition = isRefreshingState ? 'height 0.3s' : 'none';

        if (isRefreshingState) {
            ringRef.current.style.animation = 'caSpinRefresh 0.8s linear infinite';
            ringRef.current.style.borderTopColor = '#2374E1';
            ringRef.current.style.transform = 'none';
        } else {
            ringRef.current.style.animation = 'none';
            ringRef.current.style.transform = `rotate(${rotation}deg)`;
            ringRef.current.style.borderTopColor = height >= THRESHOLD ? '#2374E1' : 'rgba(255,255,255,0.4)';
        }
    }, []);

    const handleTouchStart = useCallback((e) => {
        if (disabled || isRefreshingRef.current) return;
        const scrollTop = containerRef?.current?.scrollTop ?? window.scrollY;
        if (scrollTop > 5) return; // Only activate when at the very top
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
    }, [disabled, containerRef]);

    const handleTouchMove = useCallback((e) => {
        if (!isPulling.current || disabled || isRefreshingRef.current) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy < 0) {
            isPulling.current = false;
            updateDOM(0, 0, false);
            return;
        }

        const capped = Math.min(dy * 0.5, MAX_PULL); // Damped resistance
        updateDOM(capped, capped * 3, false);

        if (capped > 20) {
            // Prevent native overscroll chaining on mobile Safari
            if (e.cancelable) e.preventDefault();
        }
    }, [disabled, updateDOM]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling.current) return;
        isPulling.current = false;

        const currentHeight = parseInt(spinnerRef.current?.style.height || '0', 10);

        if (currentHeight >= THRESHOLD && onRefresh && !isRefreshingRef.current) {
            isRefreshingRef.current = true;
            setRefreshing(true);
            updateDOM(40, 0, true); // Lock to 40px spinning

            try {
                await onRefresh();
            } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

            isRefreshingRef.current = false;
            setRefreshing(false);
            updateDOM(0, 0, false); // Hide
        } else {
            // Spring back if threshold not met
            if (spinnerRef.current) {
                spinnerRef.current.style.transition = 'height 0.3s ease-out';
                spinnerRef.current.style.height = '0px';
            }
        }
    }, [onRefresh, updateDOM]);

    // Bind event listeners
    useEffect(() => {
        const target = containerRef?.current || window;
        const optsMove = { passive: false }; // Need false to preventDefault()
        const optsStart = { passive: true };

        target.addEventListener('touchstart', handleTouchStart, optsStart);
        target.addEventListener('touchmove', handleTouchMove, optsMove);
        target.addEventListener('touchend', handleTouchEnd, optsStart);

        return () => {
            target.removeEventListener('touchstart', handleTouchStart);
            target.removeEventListener('touchmove', handleTouchMove);
            target.removeEventListener('touchend', handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd, containerRef]);

    // Cleanup singleton on unmount just to be safe
    useEffect(() => {
        return () => {
            isRefreshingRef.current = false;
            setRefreshing(false);
        };
    }, []);

    // Return refreshing state for components that might want to disable UI
    return { refreshing, pullIndicator: null };
}

// Inject spin keyframe safely
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
