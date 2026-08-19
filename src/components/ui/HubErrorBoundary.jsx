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
import * as Sentry from '@sentry/nextjs';
import { reportClientCrash } from '../../lib/reportClientCrash';

export class HubErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, componentStack: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        const name = this.props.name || 'Unknown';
        const timestamp = new Date().toISOString();

        // Keep the component stack so the details pane can name the child that
        // actually threw — the message alone is rarely enough in a tree this deep.
        this.setState({ componentStack: info?.componentStack || null });

        // Durable report. Sentry's browser SDK never initialises in production
        // (no DSN is baked into the bundle), so the Sentry call below is a
        // no-op and this is the ONLY path that survives the tab closing.
        try {
            reportClientCrash({
                boundary: 'hub',
                section: name,
                error,
                componentStack: info?.componentStack,
            });
        } catch (_) { console.warn('[HubErrorBoundary] crash reporting failed:', _?.message || _); }

        // Fire optional onError callback so parent can react
        try { this.props.onError?.(error, name); } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Report to Sentry silently
        try {
            Sentry.captureException(error, {
                extra: {
                    boundaryName: name,
                    componentStack: info?.componentStack,
                    crashTimestamp: timestamp,
                    url: typeof window !== 'undefined' ? window.location.href : 'SSR',
                },
                tags: {
                    errorBoundary: 'hub-section',
                    sectionName: name,
                },
            });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }

    handleReset() {
        this.setState({ hasError: false, error: null, componentStack: null });
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
                            onClick={() => this.handleReset()}
                            style={{
                                background: '#1877f2',
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

                    {/* Error details — visible in BOTH dev and prod so users (and Dan) can
                        see exactly what threw without needing DevTools. Toggle with the link
                        below if it's too noisy in normal use. */}
                    {this.state.error && (
                        <details style={{ marginTop: 16, maxWidth: 720, width: '100%' }}>
                            <summary style={{
                                color: '#ff6b6b',
                                fontSize: 12,
                                cursor: 'pointer',
                                textAlign: 'center',
                                userSelect: 'none',
                            }}>
                                Show error details
                            </summary>
                            <pre style={{
                                marginTop: 12,
                                padding: 16,
                                background: '#1a0000',
                                border: '1px solid #ff000044',
                                borderRadius: 8,
                                color: '#ff6b6b',
                                fontSize: 11,
                                lineHeight: 1.5,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: 400,
                                overflowY: 'auto',
                                textAlign: 'left',
                            }}>
{String(this.state.error?.name || 'Error')}: {String(this.state.error?.message || this.state.error)}
{'\n\n'}
{String(this.state.error?.stack || '(no stack)')}
{this.state.componentStack ? `\n\nComponent stack:${this.state.componentStack}` : ''}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default HubErrorBoundary;
