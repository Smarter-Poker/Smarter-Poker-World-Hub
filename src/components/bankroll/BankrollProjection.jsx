/**
 * BANKROLL PROJECTION COMPONENT
 * Monte Carlo simulation visualization (user-initiated only)
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function BankrollProjection({ userId, currentBankroll = 0, onClose }) {
    const [isLoading, setIsLoading] = useState(false);
    const [projection, setProjection] = useState(null);
    const [error, setError] = useState(null);
    const [settings, setSettings] = useState({
        sessionsPerWeek: 3,
        projectionDays: 90
    });

    async function runProjection() {
        if (!userId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/bankroll/projection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    currentBankroll,
                    sessionsPerWeek: settings.sessionsPerWeek,
                    projectionDays: settings.projectionDays
                })
            });

            const data = await res.json();

            if (!data.success) {
                setError(data.message || 'Projection failed');
            } else {
                setProjection(data);
            }
        } catch (err) {
            setError('Failed to run projection');
            console.error('[BankrollProjection]', err);
        }

        setIsLoading(false);
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                style={styles.modal}
                onClick={e => e.stopPropagation()}
            >
                <div style={styles.header}>
                    <span style={styles.emoji}></span>
                    <h2 style={styles.title}>Bankroll Projection</h2>
                    <button onClick={onClose} style={styles.closeBtn}>×</button>
                </div>

                {!projection && (
                    <>
                        <div style={styles.description}>
                            Run a Monte Carlo simulation based on your historical performance to project
                            potential outcomes.
                        </div>

                        <div style={styles.form}>
                            <div style={styles.formRow}>
                                <label style={styles.label}>Current Bankroll</label>
                                <div style={styles.inputValue}>
                                    ${currentBankroll.toLocaleString()}
                                </div>
                            </div>

                            <div style={styles.formRow}>
                                <label style={styles.label}>Sessions Per Week</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={settings.sessionsPerWeek}
                                    onChange={e => setSettings({ ...settings, sessionsPerWeek: parseInt(e.target.value) })}
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.formRow}>
                                <label style={styles.label}>Projection Period</label>
                                <div style={styles.periodOptions}>
                                    {[30, 90, 180, 365].map(days => (
                                        <button
                                            key={days}
                                            onClick={() => setSettings({ ...settings, projectionDays: days })}
                                            style={{
                                                ...styles.periodBtn,
                                                ...(settings.projectionDays === days ? styles.periodBtnActive : {})
                                            }}
                                        >
                                            {days} days
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div style={styles.error}>{error}</div>
                        )}

                        <button
                            onClick={runProjection}
                            disabled={isLoading}
                            style={styles.runBtn}
                        >
                            {isLoading ? 'Running 1,000 Simulations...' : 'Run Projection'}
                        </button>
                    </>
                )}

                {projection && (
                    <>
                        <div style={styles.resultsHeader}>
                            <span style={styles.timeframe}>{projection.projection.timeframe}</span>
                            <span style={styles.simCount}>
                                {projection.projection.simulationRuns.toLocaleString()} simulations
                            </span>
                        </div>

                        {/* Percentile Range */}
                        <div style={styles.rangeContainer}>
                            <div style={styles.rangeBar}>
                                <div style={styles.rangeSegment} />
                            </div>
                            <div style={styles.rangeLabels}>
                                <div style={styles.rangeLabel}>
                                    <span style={styles.rangeLabelTitle}>Pessimistic</span>
                                    <span style={{ color: '#ef4444' }}>
                                        ${projection.projection.pessimistic.toLocaleString()}
                                    </span>
                                </div>
                                <div style={styles.rangeLabel}>
                                    <span style={styles.rangeLabelTitle}>Expected</span>
                                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 20 }}>
                                        ${projection.projection.expected.toLocaleString()}
                                    </span>
                                </div>
                                <div style={styles.rangeLabel}>
                                    <span style={styles.rangeLabelTitle}>Best Case</span>
                                    <span style={{ color: '#2374e1' }}>
                                        ${projection.projection.bestCase.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Expected Gain */}
                        <div style={styles.gainBox}>
                            <span style={styles.gainLabel}>Expected Gain</span>
                            <span style={{
                                ...styles.gainValue,
                                color: projection.projection.expectedGain >= 0 ? '#22c55e' : '#ef4444'
                            }}>
                                {projection.projection.expectedGain >= 0 ? '+' : ''}
                                ${projection.projection.expectedGain.toLocaleString()}
                                <span style={styles.gainPercent}>
                                    ({projection.projection.expectedGainPercent}%)
                                </span>
                            </span>
                        </div>

                        {/* Probability Stats */}
                        <div style={styles.probGrid}>
                            <div style={styles.probBox}>
                                <span style={styles.probValue}>{projection.projection.winProbability}%</span>
                                <span style={styles.probLabel}>Chance Of Profit</span>
                            </div>
                            <div style={styles.probBox}>
                                <span style={{ ...styles.probValue, color: '#ef4444' }}>
                                    {projection.projection.ruinProbability}%
                                </span>
                                <span style={styles.probLabel}>Risk Of Ruin</span>
                            </div>
                            <div style={styles.probBox}>
                                <span style={styles.probValue}>
                                    ${projection.projection.avgMaxDrawdown.toLocaleString()}
                                </span>
                                <span style={styles.probLabel}>Avg Max Drawdown</span>
                            </div>
                        </div>

                        {/* Inputs Used */}
                        <div style={styles.inputsUsed}>
                            <span style={styles.inputItem}>
                                Avg Session: ${projection.inputs.avgSessionResult > 0 ? '+' : ''}
                                {projection.inputs.avgSessionResult}
                            </span>
                            <span style={styles.inputItem}>
                                Std Dev: ±${projection.inputs.sessionStdDev}
                            </span>
                            <span style={styles.inputItem}>
                                Based on {projection.inputs.historicalSessions} sessions
                            </span>
                        </div>

                        <button onClick={() => setProjection(null)} style={styles.rerunBtn}>
                            ← Adjust Settings
                        </button>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
    },
    modal: {
        background: 'linear-gradient(135deg, #0a1929, #0d2137)',
        borderRadius: 20,
        border: '1px solid rgba(0, 212, 255, 0.3)',
        padding: 24,
        maxWidth: 440,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    emoji: {
        fontSize: 28,
    },
    title: {
        flex: 1,
        margin: 0,
        fontSize: 20,
        fontWeight: 700,
        color: '#fff',
    },
    closeBtn: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        color: '#666',
        fontSize: 24,
        cursor: 'pointer',
    },
    description: {
        fontSize: 14,
        color: '#888',
        lineHeight: 1.5,
        marginBottom: 20,
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        marginBottom: 20,
    },
    formRow: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    label: {
        fontSize: 14,
        color: '#888',
        textTransform: 'uppercase',
    },
    input: {
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        outline: 'none',
        width: 80,
    },
    inputValue: {
        fontSize: 20,
        fontWeight: 600,
        color: '#2374e1',
    },
    periodOptions: {
        display: 'flex',
        gap: 8,
    },
    periodBtn: {
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#888',
        fontSize: 14,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(0,212,255,0.2)',
        borderColor: '#2374e1',
        color: '#2374e1',
    },
    error: {
        padding: 12,
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 14,
        marginBottom: 16,
    },
    runBtn: {
        width: '100%',
        padding: 16,
        background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontSize: 16,
        fontWeight: 600,
        cursor: 'pointer',
    },
    resultsHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    timeframe: {
        fontSize: 14,
        fontWeight: 600,
        color: '#2374e1',
    },
    simCount: {
        fontSize: 14,
        color: '#666',
    },
    rangeContainer: {
        marginBottom: 20,
    },
    rangeBar: {
        height: 12,
        background: 'linear-gradient(90deg, #ef4444, #fbbf24, #22c55e, #2374e1)',
        borderRadius: 6,
        marginBottom: 12,
    },
    rangeLabels: {
        display: 'flex',
        justifyContent: 'space-between',
    },
    rangeLabel: {
        textAlign: 'center',
    },
    rangeLabelTitle: {
        display: 'block',
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    gainBox: {
        background: 'rgba(0,212,255,0.1)',
        border: '1px solid rgba(0,212,255,0.3)',
        borderRadius: 12,
        padding: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
    gainLabel: {
        display: 'block',
        fontSize: 14,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    gainValue: {
        fontSize: 28,
        fontWeight: 700,
    },
    gainPercent: {
        fontSize: 14,
        opacity: 0.7,
        marginLeft: 8,
    },
    probGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 16,
    },
    probBox: {
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        padding: 12,
        textAlign: 'center',
    },
    probValue: {
        display: 'block',
        fontSize: 18,
        fontWeight: 700,
        color: '#22c55e',
        marginBottom: 4,
    },
    probLabel: {
        fontSize: 14,
        color: '#666',
    },
    inputsUsed: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
        marginBottom: 16,
    },
    inputItem: {
        fontSize: 14,
        color: '#666',
    },
    rerunBtn: {
        width: '100%',
        padding: 12,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#888',
        fontSize: 14,
        cursor: 'pointer',
    },
};
