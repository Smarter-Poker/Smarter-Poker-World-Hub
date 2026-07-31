/**
 * TriviaErrorBoundary — Crash-proof wrapper for trivia game pages
 *
 * Prevents white-screen crashes when components throw during render
 * (e.g. bad question data, null access). Shows friendly error UI with
 * retry and lobby navigation options.
 *
 * Usage:

 *   <TriviaErrorBoundary pageName="Endless Mode">
 *     <ActualPageContent />
 *   </TriviaErrorBoundary>
 */

import React from 'react';
import Link from 'next/link';

/** After this many failed retries the retry button is hidden. */
const MAX_RETRIES = 2;

class TriviaErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, retryCount: 0 };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        const pageName = this.props.pageName || 'Trivia';
        // console.warn alone made every production trivia crash invisible.
        // console.error surfaces in the browser's error channel, and the
        // best-effort beacon lands the stack in the existing client-error
        // endpoint. Both are fire-and-forget: reporting must never be able to
        // throw out of an error boundary and re-crash the page.
        console.error(`[TriviaErrorBoundary] ${pageName} crashed:`, error, errorInfo);
        try {
            if (typeof window !== 'undefined' && typeof fetch === 'function') {
                fetch('/api/auth/log-client-error', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: JSON.stringify({
                        source: 'trivia-error-boundary',
                        page: pageName,
                        path: window.location?.pathname || null,
                        message: error?.message || String(error),
                        stack: (error?.stack || '').slice(0, 4000),
                        componentStack: (errorInfo?.componentStack || '').slice(0, 4000),
                        retryCount: this.state.retryCount,
                        userAgent: navigator?.userAgent || null,
                        at: new Date().toISOString(),
                    }),
                }).catch(() => { });
            }
        } catch (e) {
            console.warn('[TriviaErrorBoundary] error report failed:', e?.message || e);
        }
    }

    handleRetry = () => {
        // Retrying re-renders the SAME children. For a deterministic data
        // error that re-crashes instantly, so the retry count is tracked and
        // the button disappears after MAX_RETRIES rather than offering an
        // infinite loop of the same failure.
        this.setState(prev => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
    };

    render() {
        if (this.state.hasError) {
            const pageName = this.props.pageName || 'Trivia';
            const canRetry = this.state.retryCount < MAX_RETRIES;

            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#0a1628',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    padding: 20,
                }}>
                    <div style={{
                        textAlign: 'center',
                        maxWidth: 420,
                        padding: '40px 32px',
                        borderRadius: 16,
                        background: '#1a1a2e',
                        border: '1px solid rgba(0, 212, 255, 0.15)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(0, 212, 255, 0.05)',
                    }}>
                        {/* Error icon */}
                        <div style={{
                            width: 72, height: 72,
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px',
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>

                        <h2 style={{
                            color: '#ffffff',
                            fontSize: 20,
                            fontWeight: 700,
                            margin: '0 0 8px',
                        }}>
                            {pageName} Hit A Snag
                        </h2>

                        <p style={{
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: 14,
                            lineHeight: 1.6,
                            margin: '0 0 24px',
                        }}>
                            {canRetry
                                ? 'Something went wrong. Your progress up to this point is safe. Try again or return to the lobby.'
                                : 'This keeps failing, so retrying will not help. Head back to the lobby and pick another mode — your diamonds and progress are safe.'}
                        </p>

                        {/* Action buttons */}
                        <div style={{
                            display: 'flex',
                            gap: 12,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                        }}>
                            {canRetry && (
                                <button
                                    onClick={this.handleRetry}
                                    style={{
                                        padding: '12px 28px',
                                        borderRadius: 10,
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
                                        color: '#ffffff',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'opacity 0.2s',
                                        minHeight: 44,
                                    }}
                                >
                                    Try Again
                                </button>
                            )}
                            <Link
                                href="/hub/trivia"
                                style={{
                                    padding: '12px 28px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(0, 212, 255, 0.2)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'rgba(255,255,255,0.7)',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    transition: 'background 0.2s',
                                }}
                            >
                                Back to Lobby
                            </Link>
                        </div>

                        {/* Error details in dev mode */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details style={{
                                marginTop: 20,
                                textAlign: 'left',
                                background: 'rgba(0,0,0,0.3)',
                                borderRadius: 8,
                                padding: '8px 12px',
                            }}>
                                <summary style={{
                                    color: 'rgba(255,255,255,0.4)',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                }}>
                                    Error Details
                                </summary>
                                <pre style={{
                                    color: '#ef4444',
                                    fontSize: 11,
                                    margin: '8px 0 0',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                }}>
                                    {this.state.error.toString()}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default TriviaErrorBoundary;
