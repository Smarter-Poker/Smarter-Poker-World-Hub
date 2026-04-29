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
    // Disabled globally per user request
    return { refreshing: false, pullIndicator: null };
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
