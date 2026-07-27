/**
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * TrainingErrorBoundary — Crash-proof wrapper for training pages
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * 
 * Wraps training page content. On crash, shows a friendly error UI instead
 * of a white screen. Includes a retry button and link back to the hub.
 * 
 * Usage:
 *   import TrainingErrorBoundary from '@/components/training/TrainingErrorBoundary';
 *   
 *   export default function MyTrainingPage() {
 *     return (
 *       <TrainingErrorBoundary pageName="ICM Simulator">
 *         <ActualPageContent />
 *       </TrainingErrorBoundary>
 *     );
 *   }
 */

import React from 'react';
import Link from 'next/link';

class TrainingErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.warn(`[TrainingErrorBoundary] ${this.props.pageName || 'Training Page'} crashed:`, error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            const pageName = this.props.pageName || 'Training Page';
            
            return (
                <div style={{
                    minHeight: '100vh',
                    background: '#0a0a0a',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    padding: 20,
                }}>
                    <div style={{
                        textAlign: 'center',
                        maxWidth: 420,
                        padding: '40px 32px',
                        borderRadius: 16,
                        background: '#1a1a2e',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>

                        <h2 style={{
                            color: '#ffffff',
                            fontSize: 20,
                            fontWeight: 700,
                            margin: '0 0 8px',
                        }}>
                            {pageName} Encountered an Error
                        </h2>

                        <p style={{
                            color: 'rgba(255,255,255,0.5)',
                            fontSize: 14,
                            lineHeight: 1.6,
                            margin: '0 0 24px',
                        }}>
                            Something went wrong. This is usually temporary — try refreshing or come back in a moment.
                        </p>

                        {/* Action buttons */}
                        <div style={{
                            display: 'flex',
                            gap: 12,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                        }}>
                            <button
                                onClick={this.handleRetry}
                                style={{
                                    padding: '12px 28px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                    color: '#ffffff',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                Try Again
                            </button>
                            <Link
                                href="/hub/training"
                                style={{
                                    padding: '12px 28px',
                                    borderRadius: 10,
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'rgba(255,255,255,0.7)',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    transition: 'background 0.2s',
                                }}
                            >
                                Back to Hub
                            </Link>
                        </div>

                        {/* Error details (collapsed) */}
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

export default TrainingErrorBoundary;
