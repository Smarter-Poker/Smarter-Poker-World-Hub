/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SYSTEM OFFLINE SCREEN (FAIL-CLOSED)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Displayed when Anti-Gravity boot fails. Shows exactly what is missing.
 */

import React from 'react';

export default function SystemOffline({ bootState }) {
    const errors = bootState?.errors || [];

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <span style={styles.icon}>🔴</span>
                    <h1 style={styles.title}>System Offline</h1>
                </div>

                {/* Status */}
                <div style={styles.status}>
                    <p style={styles.subtitle}>
                        System initialization failed. The system is in fail-closed mode.
                    </p>
                </div>

                {/* Error Details */}
                <div style={styles.errorSection}>
                    <h2 style={styles.errorTitle}>Missing Configuration</h2>

                    {errors.length > 0 ? (
                        <ul style={styles.errorList}>
                            {errors.map((err, i) => (
                                <li key={i} style={styles.errorItem}>
                                    <span style={styles.errorStage}>[{err.stage}]</span>
                                    <span style={styles.errorMessage}>{err.error}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={styles.errorMessage}>Unknown initialization error</p>
                    )}
                </div>

                {/* Required Env Vars */}
                <div style={styles.envSection}>
                    <h3 style={styles.envTitle}>Required Environment Variables</h3>
                    <code style={styles.envCode}>
                        NEXT_PUBLIC_ANTIGRAVITY_ENABLED=true{'\n'}
                        NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co{'\n'}
                        NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
                    </code>
                </div>

                {/* Timestamp */}
                <div style={styles.footer}>
                    <span style={styles.timestamp}>
                        Boot attempted: {bootState?.timestamp || 'Unknown'}
                    </span>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a12 0%, #1a1a2e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    card: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 0, 0, 0.3)',
        borderRadius: 16,
        padding: 40,
        maxWidth: 600,
        width: '100%',
        backdropFilter: 'blur(10px)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    icon: {
        fontSize: 48,
    },
    title: {
        margin: 0,
        fontSize: 32,
        fontWeight: 700,
        color: '#ff4444',
    },
    status: {
        marginBottom: 32,
    },
    subtitle: {
        margin: 0,
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        lineHeight: 1.6,
    },
    errorSection: {
        background: 'rgba(255, 0, 0, 0.1)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
    },
    errorTitle: {
        margin: '0 0 16px 0',
        fontSize: 18,
        fontWeight: 600,
        color: '#ff6666',
    },
    errorList: {
        margin: 0,
        padding: '0 0 0 20px',
        listStyle: 'none',
    },
    errorItem: {
        display: 'flex',
        gap: 12,
        marginBottom: 8,
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.9)',
    },
    errorStage: {
        color: '#ff8888',
        fontFamily: 'monospace',
        fontWeight: 600,
    },
    errorMessage: {
        color: 'rgba(255, 255, 255, 0.8)',
    },
    envSection: {
        background: 'rgba(0, 212, 255, 0.05)',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
    },
    envTitle: {
        margin: '0 0 12px 0',
        fontSize: 14,
        fontWeight: 600,
        color: '#00D4FF',
    },
    envCode: {
        display: 'block',
        fontFamily: 'monospace',
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)',
        whiteSpace: 'pre',
        lineHeight: 1.8,
    },
    footer: {
        textAlign: 'center',
        paddingTop: 16,
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    timestamp: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.4)',
        fontFamily: 'monospace',
    },
};
