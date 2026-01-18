/**
 * 🛡️ GAME GUARD - Error Boundary & Recovery System
 * 
 * Wraps the game engine to catch crashes and auto-recover.
 * Never shows a white screen - always recovers gracefully.
 * 
 * Key Features:
 * - Catches React render errors
 * - Silent error logging
 * - Auto-reset to fresh game state
 * - User never knows a crash occurred
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface GameGuardProps {
    children: ReactNode;
    onReset?: () => void;
    fallback?: ReactNode;
}

interface GameGuardState {
    hasError: boolean;
    errorCount: number;
    lastError: Error | null;
}

export class GameGuard extends Component<GameGuardProps, GameGuardState> {
    private resetTimeout: NodeJS.Timeout | null = null;

    constructor(props: GameGuardProps) {
        super(props);
        this.state = {
            hasError: false,
            errorCount: 0,
            lastError: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<GameGuardState> {
        // Update state so next render shows recovery UI
        return { hasError: true, lastError: error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // 📝 Silent logging - don't alert the user
        console.error('🛡️ GameGuard caught error:', error.message);
        console.error('Component stack:', errorInfo.componentStack);

        // Track error count for circuit breaker
        this.setState(prev => ({ errorCount: prev.errorCount + 1 }));

        // 🔄 Auto-recover after brief delay
        this.resetTimeout = setTimeout(() => {
            this.handleRecovery();
        }, 100);
    }

    componentWillUnmount(): void {
        if (this.resetTimeout) {
            clearTimeout(this.resetTimeout);
        }
    }

    handleRecovery = (): void => {
        const { onReset } = this.props;
        const { errorCount } = this.state;

        // Circuit breaker: if we've crashed 5+ times, show fallback instead
        if (errorCount >= 5) {
            console.error('🛡️ Circuit breaker triggered - too many errors');
            return;
        }

        // Call the reset handler if provided
        if (onReset) {
            onReset();
        }

        // Clear error state to attempt re-render
        this.setState({ hasError: false, lastError: null });
    };

    render(): ReactNode {
        const { children, fallback } = this.props;
        const { hasError, errorCount } = this.state;

        // Circuit breaker: show fallback if too many errors
        if (hasError && errorCount >= 5) {
            return fallback || (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100vh',
                    background: '#0a1628',
                    color: '#fff',
                    textAlign: 'center',
                    padding: '20px',
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔧</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>
                        Game Maintenance
                    </div>
                    <div style={{ color: '#888', marginBottom: '24px' }}>
                        We're experiencing technical difficulties.
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '12px 32px',
                            fontSize: '16px',
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        Refresh Page
                    </button>
                </div>
            );
        }

        // Normal render or auto-recovery in progress
        return children;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK GUARD HOOK
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';

interface UseNetworkGuardReturn {
    isOnline: boolean;
    isOfflineMode: boolean;
    connectionQuality: 'good' | 'poor' | 'offline';
}

export function useNetworkGuard(): UseNetworkGuardReturn {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [connectionQuality, setConnectionQuality] = useState<'good' | 'poor' | 'offline'>(
        'good'
    );

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setConnectionQuality('good');
            console.log('🌐 Network: Back online');
        };

        const handleOffline = () => {
            setIsOnline(false);
            setConnectionQuality('offline');
            console.log('📴 Network: Went offline');
        };

        // Add event listeners
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Check connection quality periodically
        const checkConnection = async () => {
            if (!navigator.onLine) {
                setConnectionQuality('offline');
                return;
            }

            try {
                const start = Date.now();
                await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
                const latency = Date.now() - start;

                setConnectionQuality(latency > 1000 ? 'poor' : 'good');
            } catch {
                // Fetch failed but we're technically online
                setConnectionQuality('poor');
            }
        };

        // Initial check
        checkConnection();

        // Check every 30 seconds
        const interval = setInterval(checkConnection, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    return {
        isOnline,
        isOfflineMode: !isOnline,
        connectionQuality,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// OFFLINE BADGE COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
interface OfflineBadgeProps {
    isVisible: boolean;
}

export function OfflineBadge({ isVisible }: OfflineBadgeProps) {
    if (!isVisible) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            background: 'rgba(245, 158, 11, 0.9)',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#000',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}>
            <span>📴</span>
            <span>Offline - Playing Local Mode</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED GUARDIAN WRAPPER
// ═══════════════════════════════════════════════════════════════════════════
interface GuardianWrapperProps {
    children: ReactNode;
    onGameReset?: () => void;
}

export function GuardianWrapper({ children, onGameReset }: GuardianWrapperProps) {
    const network = useNetworkGuard();

    return (
        <GameGuard onReset={onGameReset}>
            <OfflineBadge isVisible={network.isOfflineMode} />
            {children}
        </GameGuard>
    );
}
