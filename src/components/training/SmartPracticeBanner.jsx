/**
 * SMART PRACTICE BANNER — AI-Driven Training Recommendations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Phase 17: Fetches cross-session analytics to recommend what to practice.
 * Shows primary recommendation + expandable alternatives.
 * One-click "Start Smart Practice" launches a targeted training session.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useSmartPractice from '../../hooks/useSmartPractice';

const TYPE_ICONS = {
    weak_position: '◎',
    weak_street: '▣',
    mistake_pattern: '▲',
    spaced_review: '↻',
    level_up: '↑',
    general: '►',
};

const TYPE_COLORS = {
    weak_position: '#f97316',
    weak_street: '#3b82f6',
    mistake_pattern: '#ef4444',
    spaced_review: '#8b5cf6',
    level_up: '#22c55e',
    general: '#64748b',
};

const PRIORITY_LABELS = {
    5: 'CRITICAL',
    4: 'HIGH',
    3: 'MEDIUM',
    2: 'LOW',
    1: '',
};

function RecommendationCard({ rec, isPrimary = false, onStart }) {
    const icon = TYPE_ICONS[rec.type] || '►';
    const color = TYPE_COLORS[rec.type] || '#64748b';
    const priorityLabel = PRIORITY_LABELS[rec.priority] || '';

    return (
        <motion.div
            initial={{ opacity: 0, y: isPrimary ? 10 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                ...styles.recCard,
                ...(isPrimary ? styles.recCardPrimary : styles.recCardAlt),
                borderColor: isPrimary ? `${color}40` : 'rgba(255,255,255,0.04)',
            }}
        >
            <div style={styles.recHeader}>
                <div style={styles.recIconRow}>
                    <span style={{ fontSize: isPrimary ? 18 : 14, color }}>{icon}</span>
                    <div style={styles.recTitleCol}>
                        <div style={{ ...styles.recTitle, fontSize: isPrimary ? 14 : 12, color: isPrimary ? '#f1f5f9' : '#94a3b8' }}>
                            {rec.title}
                        </div>
                        {isPrimary && priorityLabel && (
                            <span style={{
                                ...styles.priorityBadge,
                                background: `${color}20`,
                                color: color,
                                borderColor: `${color}40`,
                            }}>
                                {priorityLabel}
                            </span>
                        )}
                    </div>
                </div>
                {rec.stats && (
                    <div style={styles.recStats}>
                        {rec.stats.accuracy !== undefined && (
                            <span style={{ color: rec.stats.accuracy >= 60 ? '#22c55e' : '#ef4444', fontWeight: 'bold', fontSize: 12 }}>
                                {rec.stats.accuracy}%
                            </span>
                        )}
                        {rec.stats.avgEvLoss !== undefined && (
                            <span style={{ color: '#ef4444', fontSize: 10, fontFamily: "'Orbitron', monospace" }}>
                                -{rec.stats.avgEvLoss.toFixed(2)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div style={{ ...styles.recDesc, fontSize: isPrimary ? 11 : 10 }}>
                {rec.description}
            </div>

            {/* Target chips */}
            {(rec.targetPositions?.length > 0 || rec.targetStreet) && (
                <div style={styles.targetRow}>
                    {rec.targetPositions?.map(p => (
                        <span key={p} style={{ ...styles.targetChip, background: 'rgba(249,115,22,0.15)', color: '#f97316', borderColor: 'rgba(249,115,22,0.3)' }}>
                            {p}
                        </span>
                    ))}
                    {rec.targetStreet && (
                        <span style={{ ...styles.targetChip, background: 'rgba(59,130,246,0.15)', color: '#3b82f6', borderColor: 'rgba(59,130,246,0.3)' }}>
                            {rec.targetStreet}
                        </span>
                    )}
                </div>
            )}

            {isPrimary && (
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onStart?.(rec)}
                    style={{ ...styles.startBtn, borderColor: `${color}50`, color }}
                >
                    Start Smart Practice →
                </motion.button>
            )}
        </motion.div>
    );
}

export default function SmartPracticeBanner({ gameId, onStartSmartPractice }) {
    const { recommendation, alternatives, analytics, loading, error } = useSmartPractice(gameId);
    const [showAlts, setShowAlts] = useState(false);

    if (loading) {
        return (
            <div style={styles.container}>
                <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={styles.loadingText}
                >
                    Analyzing your training data...
                </motion.div>
            </div>
        );
    }

    if (error || !recommendation) return null;

    const handleStart = (rec) => {
        onStartSmartPractice?.({
            ...rec.config,
            targetPositions: rec.targetPositions,
            targetStreet: rec.targetStreet,
            smartPracticeType: rec.type,
            title: rec.title,
        });
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.sectionTitle}>
                    <span style={{ color: '#00d4ff' }}>◎</span> Smart Practice
                </div>
                {analytics && (
                    <div style={styles.analyticsRow}>
                        <span style={styles.analyticsStat}>{analytics.totalHands} hands</span>
                        <span style={styles.analyticsStat}>{analytics.overallAccuracy}% acc</span>
                    </div>
                )}
            </div>

            {/* Primary recommendation */}
            <RecommendationCard rec={recommendation} isPrimary onStart={handleStart} />

            {/* Alternatives toggle */}
            {alternatives.length > 0 && (
                <>
                    <button
                        onClick={() => setShowAlts(!showAlts)}
                        style={styles.altsToggle}
                    >
                        {showAlts ? 'Hide' : `${alternatives.length} more suggestion${alternatives.length > 1 ? 's' : ''}`}
                        <span style={{ transform: showAlts ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>

                        </span>
                    </button>

                    <AnimatePresence>
                        {showAlts && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}
                            >
                                {alternatives.map((alt, i) => (
                                    <RecommendationCard key={i} rec={alt} onStart={handleStart} />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </>
            )}
        </div>
    );
}

const styles = {
    container: {
        marginBottom: 16,
        padding: '14px',
        background: 'linear-gradient(180deg, rgba(0, 212, 255, 0.06) 0%, rgba(0, 0, 0, 0.15) 100%)',
        borderRadius: 14,
        border: '1px solid rgba(0, 212, 255, 0.12)',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 10,
    },
    sectionTitle: {
        fontSize: 12, fontWeight: 'bold', color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: 1,
        display: 'flex', alignItems: 'center', gap: 6,
    },
    analyticsRow: { display: 'flex', gap: 8 },
    analyticsStat: { fontSize: 10, color: '#475569', fontWeight: 600 },
    loadingText: { color: '#64748b', fontSize: 11, textAlign: 'center', padding: 12 },
    recCard: {
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid',
    },
    recCardPrimary: {
        background: 'rgba(0,0,0,0.2)',
        marginBottom: 8,
    },
    recCardAlt: {
        background: 'rgba(0,0,0,0.1)',
    },
    recHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 4,
    },
    recIconRow: { display: 'flex', alignItems: 'center', gap: 8 },
    recTitleCol: { display: 'flex', alignItems: 'center', gap: 6 },
    recTitle: { fontWeight: 700 },
    priorityBadge: {
        fontSize: 8, fontWeight: 700,
        padding: '1px 5px', borderRadius: 3,
        border: '1px solid', letterSpacing: 0.5,
    },
    recStats: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 },
    recDesc: { color: '#64748b', lineHeight: 1.4, marginBottom: 6 },
    targetRow: { display: 'flex', gap: 4, marginBottom: 8 },
    targetChip: {
        fontSize: 9, fontWeight: 700,
        padding: '2px 8px', borderRadius: 4,
        border: '1px solid', letterSpacing: 0.5,
    },
    startBtn: {
        width: '100%',
        padding: '10px 0',
        borderRadius: 8,
        border: '1px solid',
        background: 'rgba(0, 212, 255, 0.08)',
        fontSize: 12, fontWeight: 700,
        cursor: 'pointer', letterSpacing: 0.5,
        fontFamily: "'Inter', -apple-system, sans-serif",
        transition: 'all 0.15s',
    },
    altsToggle: {
        width: '100%', padding: '6px 0',
        background: 'none', border: 'none',
        color: '#475569', fontSize: 10, fontWeight: 600,
        cursor: 'pointer', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 4,
    },
};
