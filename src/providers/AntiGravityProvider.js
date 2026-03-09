/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-GRAVITY PROVIDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * React Context Provider that wraps the entire app.
 * Handles automatic boot and fail-closed rendering.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { initAntiGravity, initAntiGravitySync } from '../lib/AntiGravityBoot';
import SystemOffline from '../components/SystemOffline';

// Context
const AntiGravityContext = createContext(null);

/**
 * Provider component - wraps entire app
 */
export function AntiGravityProvider({ children }) {
    const [bootState, setBootState] = useState(() => {
        // Synchronous init — env check + Supabase singleton (instant, no network)
        const syncState = initAntiGravitySync();
        return syncState;
    });
    const [loading, setLoading] = useState(false); // No gate — render immediately

    useEffect(() => {
        // Background async health check — does NOT block rendering
        async function backgroundHealthCheck() {
            try {
                const state = await initAntiGravity();
                setBootState(state);
            } catch (error) {
                console.error('Anti-Gravity background health check failed:', error);
            }
        }
        backgroundHealthCheck();
    }, []);

    // FAIL-CLOSED: If boot failed, show offline screen
    if (bootState && bootState.errors && bootState.errors.length > 0) {
        // Check if we should fail-closed or allow degraded mode
        const criticalErrors = bootState.errors.filter(e =>
            e.stage === 'ENV_VARS' || e.stage === 'CATASTROPHIC'
        );

        if (criticalErrors.length > 0) {
            return <SystemOffline bootState={bootState} />;
        }
    }

    // System healthy - render children
    return (
        <AntiGravityContext.Provider value={bootState}>
            {children}
        </AntiGravityContext.Provider>
    );
}

/**
 * Hook to access Anti-Gravity state
 */
export function useAntiGravity() {
    const context = useContext(AntiGravityContext);
    return context;
}

export default AntiGravityProvider;
