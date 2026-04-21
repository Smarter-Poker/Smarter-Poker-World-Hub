/**
 * SOCIAL ERROR BOUNDARY
 * Wraps social media sub-views; on crash, shows friendly fallback UI
 * instead of breaking the entire page.
 */

import React from 'react';

export class SocialErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.warn('[SocialErrorBoundary]', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#65676B',
                    background: '#F0F2F5',
                    borderRadius: 8,
                    margin: 16,
                }}>
                    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>🃏</div>
                    <h3 style={{ margin: '0 0 8px', color: '#1C1E21', fontWeight: 600 }}>
                        Something Went Wrong
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: 15 }}>
                        This section encountered an error. Try refreshing the page.
                    </p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            padding: '8px 24px',
                            background: '#1877F2',
                            color: 'white',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default SocialErrorBoundary;
