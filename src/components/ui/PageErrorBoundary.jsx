/**
 * PageErrorBoundary — Global Site-Wide Crash Safeguard
 *
 * Wraps <Component> in _app.js so NO single page crash can kill the entire site.
 * If any page throws during render, this boundary catches it and shows a
 * graceful fallback with navigation options — keeping the provider tree alive.
 *
 * CRITICAL: Must be keyed with `key={router.asPath}` in _app.js so it
 * auto-resets when the user navigates to a different page.
 *
 * Usage in _app.js:
 *   <PageErrorBoundary key={router.asPath}>
 *     <Component {...pageProps} />
 *   </PageErrorBoundary>
 */
import React from 'react';
import * as Sentry from '@sentry/nextjs';

export default class PageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });

        // Log to console for dev visibility
        console.warn(
            '[PageErrorBoundary] 🔥 PAGE CRASH CAUGHT — site is still alive:',
            error,
            errorInfo?.componentStack
        );

        // AUDIT-11 (2026-04-30 per Dan: silent crash → World Hub redirect):
        // Persist the error to sessionStorage so it survives the user
        // tapping "Go to Hub" and returning later. This is the only way to
        // collect ground-truth diagnostic data from Dan's iPhone — Sentry
        // is server-side and not visible to the user, dev-only error
        // display below has been hidden in prod, and toasts disappear
        // before the user can read them on a small screen.
        try {
            if (typeof sessionStorage !== 'undefined') {
                const log = JSON.parse(sessionStorage.getItem('sp-page-crash-log') || '[]');
                log.push({
                    t: new Date().toISOString(),
                    url: typeof window !== 'undefined' ? window.location.href : 'SSR',
                    message: String(error?.message || error).slice(0, 500),
                    stack: String(error?.stack || '').slice(0, 1500),
                    componentStack: String(errorInfo?.componentStack || '').slice(0, 1500),
                });
                sessionStorage.setItem('sp-page-crash-log', JSON.stringify(log.slice(-10)));
            }
        } catch (_) { /* sessionStorage may be unavailable */ }

        // Report to Sentry silently — never let reporting crash the boundary
        try {
            Sentry.captureException(error, {
                extra: {
                    boundaryType: 'PageErrorBoundary',
                    componentStack: errorInfo?.componentStack,
                    url: typeof window !== 'undefined' ? window.location.href : 'SSR',
                    timestamp: new Date().toISOString(),
                },
                tags: {
                    errorBoundary: 'page-level',
                    crashedRoute: typeof window !== 'undefined' ? window.location.pathname : 'SSR',
                },
            });
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        if (typeof window !== 'undefined') {
            window.top.location.href = '/hub';
        }
    };

    render() {
        if (this.state.hasError) {
            // If a custom fallback was provided, use it
            if (this.props.fallback) return this.props.fallback;

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
                    {/* Shield icon indicating crash was contained */}
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        border: '2px solid #ff6b6b44',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 36,
                    }}>
                        🛡️
                    </div>

                    <div>
                        <h2 style={{ color: '#ff6b6b', fontSize: 20, margin: '0 0 8px', fontWeight: 700 }}>
                            This Page Hit a Snag
                        </h2>
                        <p style={{ color: '#8a8d91', fontSize: 14, maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.5 }}>
                            Something went wrong on this page, but the rest of the site is running normally.
                            You can try again or head back to the Hub.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={this.handleRetry}
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
                            Try Again
                        </button>
                        <button
                            onClick={this.handleGoHome}
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
                            Go to Hub
                        </button>
                    </div>

                    {/* AUDIT-11: error details now visible in PRODUCTION too. Dan
                         has been seeing this fallback on his iPhone with no idea
                         what threw — Sentry is server-side and unavailable to him,
                         dev-only made the actual error invisible. Show it directly
                         so the next time it fires he can read/screenshot the cause. */}
                    {this.state.error && (
                        <details open style={{
                            marginTop: 16,
                            maxWidth: 700,
                            width: '100%',
                            textAlign: 'left',
                        }}>
                            <summary style={{
                                color: '#ff6b6b',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 8,
                            }}>
                                Error details (tap to copy)
                            </summary>
                            <pre
                                onClick={() => {
                                    try {
                                        const txt = String(this.state.error) + '\n\n' + (this.state.errorInfo?.componentStack || '');
                                        navigator.clipboard.writeText(txt);
                                    } catch (_) {}
                                }}
                                style={{
                                    padding: 16,
                                    background: '#1a0000',
                                    border: '1px solid #ff000044',
                                    borderRadius: 8,
                                    color: '#ff6b6b',
                                    fontSize: 11,
                                    overflowX: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    cursor: 'copy',
                                }}>
                                {String(this.state.error)}
                                {this.state.errorInfo?.componentStack && (
                                    '\n\nComponent Stack:\n' + this.state.errorInfo.componentStack
                                )}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
