/**
 * HubErrorBoundary — World Hub Crash Safeguard
 *
 * Wraps any section of the hub so a single bad import/render
 * NEVER takes down the entire World Hub or site.
 *
 * Usage:
 *   <HubErrorBoundary name="WorldHub">
 *     <WorldHub />
 *   </HubErrorBoundary>
 */
import React from 'react';

export class HubErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        const name = this.props.name || 'Unknown';
        console.error(`[HubErrorBoundary] "${name}" crashed —`, error, info?.componentStack);

        // Report to Sentry if available, silently
        try {
            if (typeof window !== 'undefined' && window.Sentry) {
                window.Sentry.captureException(error, {
                    extra: { boundaryName: name, componentStack: info?.componentStack },
                });
            }
        } catch (_) { /* never let reporting crash the boundary */ }
    }

    handleReset() {
        this.setState({ hasError: false, error: null });
    }

    render() {
        if (this.state.hasError) {
            const name = this.props.name || 'Section';
            const fallback = this.props.fallback;

            // If caller provided a custom fallback, use it
            if (fallback) return fallback;

            // Default graceful fallback — matches the Hub dark theme
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#0a0a0f',
                    color: '#e4e6eb',
                    fontFamily: 'Orbitron, "Segoe UI", sans-serif',
                    gap: 24,
                    padding: 32,
                    textAlign: 'center',
                }}>
                    {/* Hub logo placeholder */}
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        border: '2px solid #00d4ff44',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 32,
                    }}>
                        ⚡
                    </div>

                    <div>
                        <h2 style={{ color: '#00d4ff', fontSize: 20, margin: '0 0 8px', fontWeight: 700 }}>
                            {name} Temporarily Unavailable
                        </h2>
                        <p style={{ color: '#8a8d91', fontSize: 14, maxWidth: 380, margin: '0 auto 24px' }}>
                            This section encountered an issue and was isolated to protect the rest of the app.
                            Please try refreshing — everything else is still running normally.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                background: '#1877f2',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 24px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            Refresh Page
                        </button>
                        <button
                            onClick={() => this.handleReset()}
                            style={{
                                background: '#3a3b3c',
                                color: '#e4e6eb',
                                border: 'none',
                                borderRadius: 8,
                                padding: '10px 24px',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            Try Again
                        </button>
                    </div>

                    {/* Dev-only error details */}
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <pre style={{
                            marginTop: 16,
                            padding: 16,
                            background: '#1a0000',
                            border: '1px solid #ff000044',
                            borderRadius: 8,
                            color: '#ff6b6b',
                            fontSize: 11,
                            maxWidth: 600,
                            overflowX: 'auto',
                            textAlign: 'left',
                        }}>
                            {String(this.state.error)}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default HubErrorBoundary;
