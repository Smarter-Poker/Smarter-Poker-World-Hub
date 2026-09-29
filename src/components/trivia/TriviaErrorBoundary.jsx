/**
 * TriviaErrorBoundary - Crash-proof wrapper for trivia game pages
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
import TriviaConsole from './console/TriviaConsole';
import { toTitleCase } from '../../lib/trivia/titleCase';

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

    handleBackToLobby = () => {
        // A full navigation, not a client transition: the React tree under
        // this boundary is the thing that crashed, so load it from scratch.
        if (typeof window !== 'undefined') window.location.assign('/hub/trivia');
    };

    render() {
        if (this.state.hasError) {
            const pageName = this.props.pageName || 'Trivia';
            const canRetry = this.state.retryCount < MAX_RETRIES;
            // The boundary replaces the whole page (HubPageSummary included),
            // so its console title is the page heading unless told otherwise.
            const titleAs = this.props.titleAs || 'h1';
            const backToLobby = {
                label: 'Back To Lobby',
                onClick: this.handleBackToLobby,
            };

            return (
                <div className="trivia-console-standalone trivia-error-boundary" role="alert">
                    <TriviaConsole
                        eyebrow={toTitleCase(String(pageName).replace(/^Trivia\s+-\s+/, '').replace(/\s+-\s+/g, ' '))}
                        title="Hit A Snag"
                        titleAs={titleAs}
                        subtitle={canRetry ? 'Your Progress Is Safe' : 'Your Diamonds And Progress Are Safe'}
                        pill="Error"
                        pillInk="red"
                        secondaryAction={canRetry ? backToLobby : undefined}
                        primaryAction={canRetry
                            ? { label: 'Try Again', onClick: this.handleRetry }
                            : backToLobby}
                    >
                        <p className="trivia-console-copy">
                            {canRetry
                                ? 'Something Went Wrong. Your Progress Up To This Point Is Safe. Try Again Or Return To The Lobby.'
                                : 'This Keeps Failing, So Retrying Will Not Help. Head Back To The Lobby And Pick Another Mode. Your Diamonds And Progress Are Safe.'}
                        </p>

                        {/* Error details in dev mode */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="trivia-error-boundary__details">
                                <summary className="tc-label">Error Details</summary>
                                <pre className="tc-ink--red">{this.state.error.toString()}</pre>
                            </details>
                        )}
                    </TriviaConsole>
                </div>
            );
        }

        return this.props.children;
    }
}

export default TriviaErrorBoundary;
