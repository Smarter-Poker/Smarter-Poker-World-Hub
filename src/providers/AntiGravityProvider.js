/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-GRAVITY PROVIDER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * React Context Provider that wraps the entire app.
 * Handles automatic boot and fail-closed rendering.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { initAntiGravity, getBootState, isSystemHealthy } from '../lib/AntiGravityBoot';
import SystemOffline from '../components/SystemOffline';

// Context
const AntiGravityContext = createContext(null);

/**
 * Provider component - wraps entire app
 */
export function AntiGravityProvider({ children }) {
    const [bootState, setBootState] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function boot() {
            try {
                const state = await initAntiGravity();
                setBootState(state);
            } catch (error) {
                console.error('Anti-Gravity boot failed catastrophically:', error);
                setBootState({
                    initialized: true,
                    antigravityEnabled: false,
                    supabaseConnected: false,
                    errors: [{ stage: 'CATASTROPHIC', error: error.message }],
                    timestamp: new Date().toISOString(),
                });
            } finally {
                setLoading(false);
            }
        }

        boot();
    }, []);

    // Loading state
    if (loading) {
        return (
            <div style={{
                minHeight: '100vh',
                background: '#0a0a12',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#00D4FF',
                fontFamily: 'Inter, sans-serif',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>Initializing Anti-Gravity...</div>
                </div>
            </div>
        );
    }

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
