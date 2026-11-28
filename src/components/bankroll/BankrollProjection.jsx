/**
 * BANKROLL PROJECTION COMPONENT
 * Monte Carlo simulation visualization (user-initiated only)
 */

import { GRADIENTS, METAL } from './metalStyles';
import { useState } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { motion } from 'framer-motion';
import { getFreshAccessToken } from '../../lib/authUtils';
import { formatUsd } from '../../lib/bankroll/ledgerReport.mjs';

const usd = (value) => formatUsd(value, { cents: false });
const signedUsd = (value) => (value > 0 ? '+' : '') + usd(value);

export default function BankrollProjection({ userId, currentBankroll = 0, onClose }) {
    const [isLoading, setIsLoading] = useState(false);
    const [projection, setProjection] = useState(null);
    const [error, setError] = useState(null);
    const [settings, setSettings] = useState({
        sessionsPerWeek: 3,
        projectionDays: 90
    });
    // Phone back gesture closes the sheet (mobile phase 0a). Mounted only while
    // open, so isOpen is constant; the hook pops our history entry on unmount
    // (an X-close never leaves a dead "back" behind).
    useModalHistory(true, onClose);
    // Tap outside closes; a drag that merely ends outside does not.
    const scrim = useScrimDismiss(onClose);

    const sessionsValid = Number.isInteger(settings.sessionsPerWeek) && settings.sessionsPerWeek >= 1 && settings.sessionsPerWeek <= 21;

    async function runProjection() {
        if (!userId || !sessionsValid) return;

        setIsLoading(true);
        setError(null);

        try {
            // The route requires the player's token. This call never sent one,
            // so every projection came back 401 and the sheet said
            // "Projection failed" for everybody.
            const token = await getFreshAccessToken();
            if (!token) throw new Error('Please Sign In To Run A Projection');
            const res = await fetch('/api/bankroll/projection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    currentBankroll,
                    sessionsPerWeek: settings.sessionsPerWeek,
                    projectionDays: settings.projectionDays
                })
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 401) setError('Please Sign In To Run A Projection');
            else if (res.status === 403) setError('Bankroll Pro Or VIP Access Is Required');
            else if (!data.success) setError(data.message || data.error || 'Projection Failed. Try Again.');
            else setProjection(data);
        } catch (err) {
            setError(err.message || 'Projection Failed. Try Again.');
            console.warn('[BankrollProjection]', err);
        }

        setIsLoading(false);
    }

    return (
        <motion.div
            className="bankroll-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={styles.overlay}
            {...scrim}
        >
            <motion.div
                className="bankroll-modal"
                role="dialog"
                aria-modal="true"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                style={styles.modal}
                onClick={e => e.stopPropagation()}
            >
                <div className="bankroll-sheet-handle" aria-hidden="true" />
                <div className="bankroll-modal-header" style={styles.header}>
                    <h2 style={styles.title}>Bankroll Projection</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="bankroll-modal-close sp-icon-btn" style={styles.closeBtn}>×</button>
                </div>
                <div className="bankroll-modal-body" style={styles.body}>

                {!projection && (
                    <>
                        <div style={styles.description}>
                            Run A Monte Carlo Simulation Based On Your Historical Performance To Project
                            Potential Outcomes.
                        </div>

                        <div style={styles.form}>
                            <div style={styles.formRow}>
                                <label style={styles.label}>Current Bankroll</label>
                                <div style={styles.inputValue}>
                                    {usd(currentBankroll)}
                                </div>
                            </div>

                            <div style={styles.formRow}>
                                <label style={styles.label}>Sessions Per Week</label>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    aria-label="Sessions Per Week"
                                    aria-invalid={!sessionsValid}
                                    min={1}
                                    max={21}
                                    step={1}
                                    value={Number.isNaN(settings.sessionsPerWeek) ? '' : settings.sessionsPerWeek}
                                    onChange={e => setSettings({ ...settings, sessionsPerWeek: e.target.value === '' ? NaN : Number(e.target.value) })}
                                    style={styles.input}
                                />
                            </div>

                            <div style={styles.formRow}>
                                <label style={styles.label}>Projection Period</label>
                                <div style={styles.periodOptions}>
                                    {[30, 90, 180, 365].map(days => (
                                        <button
                                            key={days}
                                            type="button"
                                            aria-pressed={settings.projectionDays === days}
                                            onClick={() => setSettings({ ...settings, projectionDays: days })}
                                            style={{
                                                ...styles.periodBtn,
                                                ...(settings.projectionDays === days ? styles.periodBtnActive : {})
                                            }}
                                        >
                                            {days} Days
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {!sessionsValid && (
                            <div style={styles.error} role="alert">Enter 1 To 21 Sessions Per Week</div>
                        )}
                        {error && (
                            <div style={styles.error} role="alert">{error}</div>
                        )}

                        <button
                            type="button"
                            onClick={runProjection}
                            disabled={isLoading || !sessionsValid}
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
                                {projection.projection.simulationRuns.toLocaleString()} Simulations
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
                                        {usd(projection.projection.pessimistic)}
                                    </span>
                                </div>
                                <div style={styles.rangeLabel}>
                                    <span style={styles.rangeLabelTitle}>Expected</span>
                                    <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 20 }}>
                                        {usd(projection.projection.expected)}
                                    </span>
                                </div>
                                <div style={styles.rangeLabel}>
                                    <span style={styles.rangeLabelTitle}>Best Case</span>
                                    <span style={{ color: '#92cfff' }}>
                                        {usd(projection.projection.bestCase)}
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
                                {signedUsd(projection.projection.expectedGain)}
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
                                    {projection.projection.ruinProbability == null ? 'N/A' : projection.projection.ruinProbability + '%'}
                                </span>
                                <span style={styles.probLabel}>Risk Of Ruin</span>
                            </div>
                            <div style={styles.probBox}>
                                <span style={styles.probValue}>
                                    {usd(projection.projection.avgMaxDrawdown)}
                                </span>
                                <span style={styles.probLabel}>Avg Max Drawdown</span>
                            </div>
                        </div>

                        {/* Inputs Used */}
                        <div style={styles.inputsUsed}>
                            <span style={styles.inputItem}>
                                Avg Session: {signedUsd(projection.inputs.avgSessionResult)}
                            </span>
                            <span style={styles.inputItem}>
                                Std Dev: ±{usd(projection.inputs.sessionStdDev)}
                            </span>
                            <span style={styles.inputItem}>
                                Based On {projection.inputs.historicalSessions} Sessions · {projection.projection.sessionsSimulated} Simulated
                            </span>
                        </div>

                        <button type="button" onClick={() => setProjection(null)} style={styles.rerunBtn}>
                            Adjust Settings
                        </button>
                    </>
                )}
                </div>
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
        borderRadius: 20,

        padding: '0 24px 24px',
        maxWidth: 440,
        width: '100%',
        maxHeight: '90dvh',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
    },
    body: {
        overflowY: 'auto',
        flex: 1,
        minHeight: 0,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 0 12px',
        marginBottom: 4,
        flexShrink: 0,
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
        width: 44,
        height: 44,
        minWidth: 44,
        minHeight: 44,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        color: '#fff',
        fontSize: 24,
        cursor: 'pointer',
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
    },
    description: {
        fontSize: 14,
        color: '#9fb4c8',
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
        color: '#9fb4c8',
        textTransform: 'uppercase',
    },
    input: {
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.15)',
        border: '2px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 16,
        outline: 'none',
        width: 96,
        minHeight: 44,
        boxSizing: 'border-box',
    },
    inputValue: {
        fontSize: 20,
        fontWeight: 600,
        color: '#92cfff',
    },
    periodOptions: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    periodBtn: {
        padding: '8px 12px',
        minHeight: 44,
        touchAction: 'manipulation',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        color: '#edf6ff',
        fontSize: 14,
        cursor: 'pointer',
    },
    periodBtnActive: {
        background: 'rgba(0,212,255,0.2)',
        borderColor: '#2374e1',
        color: '#92cfff',
    },
    error: {
        padding: 12,
        background: 'rgba(239,68,68,0.1)',
        border: '2px solid rgba(239,68,68,0.3)',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 14,
        marginBottom: 16,
    },
    runBtn: {
        width: '100%',
        padding: 16,
        minHeight: 48,
        touchAction: 'manipulation',
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        color: '#edf6ff',
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
        color: '#92cfff',
    },
    simCount: {
        fontSize: 14,
        color: '#a1b4c7',
    },
    rangeContainer: {
        marginBottom: 20,
    },
    rangeBar: {
        height: 12,
        background: 'linear-gradient(90deg, #ef4444, #94e7ff, #22c55e, #2374e1)',
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
        color: '#a1b4c7',
        marginBottom: 4,
    },
    gainBox: {
        background: 'rgba(0,212,255,0.1)',
        border: '2px solid rgba(0,212,255,0.3)',
        borderRadius: 12,
        padding: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
    gainLabel: {
        display: 'block',
        fontSize: 14,
        color: '#9fb4c8',
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
        background: 'rgba(255,255,255,0.1)',
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
        color: '#a1b4c7',
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
        color: '#a1b4c7',
    },
    rerunBtn: {
        width: '100%',
        padding: 12,
        minHeight: 44,
        touchAction: 'manipulation',
        background: GRADIENTS.cyanAction,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: '#edf6ff',
        fontSize: 14,
        cursor: 'pointer',
    },
};
