/**
 * FrequencyTrainer — GTO Wizard-Style Mixed Strategy Training
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Tracks whether the player is correctly randomizing their actions to
 * match solver frequencies. Shows real-time feedback on mixing accuracy.
 *
 * Key concept: Over many hands, if the solver says "Bet 60% / Check 40%",
 * the player should be betting ~60% of the time. This component tracks
 * aggregate action distributions and grades mixing accuracy.
 *
 * Features:
 *   - Per-action frequency target vs actual comparison
 *   - Color-coded deviation indicators
 *   - Rolling window accuracy (last 10/25/50 hands)
 *   - Entropy score (measures randomness quality)
 *   - GTO Wizard-style frequency dial visualization
 *   - Session frequency grade (A-F)
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo, useState, memo } from 'react';
import { motion } from 'framer-motion';
import { handFieldOf, playerActionOf } from '../../lib/training/handHistoryEntry';

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FREQUENCY ANALYSIS ENGINE
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

/**
 * Analyze frequency adherence across a set of hands.
 * Each hand should have: { gtoFrequencies: { actionId: pct }, userAction: actionId }
 */
function analyzeFrequencyAdherence(hands) {
    if (!hands || hands.length < 3) return null;

    // Group hands by spot signature (similar spots should be grouped)
    // For now, aggregate all mixed-strategy hands together
    const mixedHands = hands.filter(h =>
        h.gtoFrequencies &&
        Object.values(h.gtoFrequencies || {}).filter(f => f > 1 && f < 99).length >= 2 &&
        h.userAction
    );

    if (mixedHands.length < 3) return null;

    // Aggregate: what % of the time did user take each action vs solver target
    const actionCounts = {};
    const actionTargets = {};
    let totalHands = 0;

    mixedHands.forEach(h => {
        totalHands++;
        const action = h.userAction;
        actionCounts[action] = (actionCounts[action] || 0) + 1;

        // Average solver frequencies across hands for each action
        Object.entries(h.gtoFrequencies || {}).forEach(([actId, freq]) => {
            if (!actionTargets[actId]) actionTargets[actId] = { total: 0, count: 0 };
            actionTargets[actId].total += freq;
            actionTargets[actId].count++;
        });
    });

    // Build per-action comparison
    const comparisons = [];
    const allActions = new Set([...Object.keys(actionCounts || {}), ...Object.keys(actionTargets || {})]);

    allActions.forEach(action => {
        const actualCount = actionCounts[action] || 0;
        const actualPct = totalHands > 0 ? (actualCount / totalHands) * 100 : 0;
        const targetPct = actionTargets[action]
            ? actionTargets[action].total / actionTargets[action].count
            : 0;
        const deviation = Math.abs(actualPct - targetPct);
        const deviationDirection = actualPct > targetPct ? 'over' : 'under';

        comparisons.push({
            action,
            actualPct: Math.round(actualPct * 10) / 10,
            targetPct: Math.round(targetPct * 10) / 10,
            deviation: Math.round(deviation * 10) / 10,
            deviationDirection,
            count: actualCount,
        });
    });

    // Sort by target frequency descending
    comparisons.sort((a, b) => b.targetPct - a.targetPct);

    // Calculate overall mixing score (0-100)
    // Perfect mixing = 100, pure play = 0
    const totalDeviation = comparisons.reduce((sum, c) => sum + c.deviation, 0);
    const maxPossibleDeviation = 200; // Worst case: pure play vs 50/50
    const mixingScore = Math.max(0, Math.round(100 - (totalDeviation / maxPossibleDeviation) * 100));

    // Calculate entropy (Shannon entropy of user's action distribution)
    const userDist = comparisons.map(c => c.actualPct / 100).filter(p => p > 0);
    const entropy = userDist.length > 0
        ? -userDist.reduce((sum, p) => sum + p * Math.log2(p), 0)
        : 0;

    // Target entropy
    const targetDist = comparisons.map(c => c.targetPct / 100).filter(p => p > 0);
    const targetEntropy = targetDist.length > 0
        ? -targetDist.reduce((sum, p) => sum + p * Math.log2(p), 0)
        : 0;

    const entropyScore = targetEntropy > 0
        ? Math.round(Math.min(100, (entropy / targetEntropy) * 100))
        : 0;

    // Grade
    const grade =
        mixingScore >= 90 ? 'A+' :
        mixingScore >= 80 ? 'A' :
        mixingScore >= 70 ? 'B+' :
        mixingScore >= 60 ? 'B' :
        mixingScore >= 50 ? 'C+' :
        mixingScore >= 40 ? 'C' :
        mixingScore >= 30 ? 'D' : 'F';

    return {
        comparisons,
        mixingScore,
        entropyScore,
        grade,
        totalHands: mixedHands.length,
        totalDeviation: Math.round(totalDeviation * 10) / 10,
    };
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FREQUENCY DIAL (SVG circular gauge)
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function FrequencyDial({ score, grade, size = 100 }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;

    const gradeColors = {
        'A+': '#22c55e', 'A': '#4ade80', 'B+': '#86efac',
        'B': '#fbbf24', 'C+': '#f97316', 'C': '#ef4444',
        'D': '#dc2626', 'F': '#991b1b',
    };
    const color = gradeColors[grade] || '#64748b';

    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <svg width={size} height={size}>
                {/* Background circle */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="rgba(255,255,255,0.06)"
                    strokeWidth={6}
                />
                {/* Score arc */}
                <motion.circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color}
                    strokeWidth={6} strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
            </svg>
            <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
            }}>
                <div style={{
                    fontSize: size * 0.28, fontWeight: 800, color,
                    fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                }}>
                    {grade}
                </div>
                <div style={{
                    fontSize: size * 0.12, color: '#94a3b8', fontWeight: 600,
                }}>
                    {score}%
                </div>
            </div>
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// FREQUENCY BAR COMPARISON
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function FrequencyComparisonBar({ action, targetPct, actualPct, deviation, deviationDirection }) {
    const isGood = deviation < 8;
    const isMedium = deviation >= 8 && deviation < 15;
    const isBad = deviation >= 15;

    const deviationColor = isGood ? '#22c55e' : isMedium ? '#fbbf24' : '#ef4444';

    // Get display label for action
    const actionLabel = (action || '').length > 15
        ? action.slice(0, 14) + '…'
        : action;

    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 3,
            }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0' }}>
                    {actionLabel}
                </span>
                <span style={{ fontSize: 9, color: deviationColor, fontWeight: 700 }}>
                    {deviation === 0 ? '✓ Perfect' :
                        `${deviationDirection === 'over' ? '+' : '-'}${deviation}%`}
                </span>
            </div>

            {/* Dual bar: target (outline) vs actual (fill) */}
            <div style={{
                position: 'relative', height: 18,
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4, overflow: 'hidden',
            }}>
                {/* Target bar (ghost) */}
                <div style={{
                    position: 'absolute', top: 0, left: 0,
                    width: `${Math.min(100, targetPct)}%`, height: '100%',
                    border: '1px dashed rgba(0,212,255,0.4)',
                    borderRadius: 4,
                    boxSizing: 'border-box',
                }} />

                {/* Actual bar */}
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, actualPct)}%` }}
                    transition={{ duration: 0.5 }}
                    style={{
                        height: '100%', borderRadius: 4,
                        background: isGood
                            ? 'rgba(34, 197, 94, 0.4)'
                            : isMedium
                                ? 'rgba(251, 191, 36, 0.35)'
                                : 'rgba(239, 68, 68, 0.35)',
                    }}
                />

                {/* Labels */}
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0 6px',
                }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#e2e8f0' }}>
                        You: {actualPct}%
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: '#00d4ff', opacity: 0.8 }}>
                        GTO: {targetPct}%
                    </span>
                </div>
            </div>
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// RANDOMIZATION TIPS
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

function MixingTips({ analysis }) {
    if (!analysis) return null;

    const tips = [];

    // Find biggest deviation
    const worst = analysis.comparisons.reduce((max, c) =>
        c.deviation > (max?.deviation || 0) ? c : max, null
    );

    if (worst && worst.deviation > 10) {
        if (worst.deviationDirection === 'over') {
            tips.push({
                text: `You're ${worst.action.toLowerCase()}ing too often (${worst.actualPct}% vs ${worst.targetPct}% GTO). Try to ${worst.action.toLowerCase()} less.`,
                color: '#fbbf24',
            });
        } else {
            tips.push({
                text: `You're ${worst.action.toLowerCase()}ing too rarely (${worst.actualPct}% vs ${worst.targetPct}% GTO). Mix in more ${worst.action.toLowerCase()}s.`,
                color: '#fbbf24',
            });
        }
    }

    if (analysis.entropyScore < 50) {
        tips.push({
            text: 'Your play is too predictable. Try using a mental randomizer (e.g., use the second hand on your watch).',
            color: '#f97316',
        });
    }

    if (analysis.mixingScore >= 80) {
        tips.push({
            text: 'Great mixing! Your frequencies closely match the solver.',
            color: '#22c55e',
        });
    }

    if (tips.length === 0) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {tips.map((tip, i) => (
                <div key={i} style={{
                    fontSize: 9, color: tip.color, lineHeight: 1.4,
                    padding: '4px 8px', borderRadius: 6,
                    background: `${tip.color}10`,
                    border: `1px solid ${tip.color}25`,
                }}>
                    {tip.text}
                </div>
            ))}
        </div>
    );
}

// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
// MAIN COMPONENT
// ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function FrequencyTrainer({ handHistory, compact = false }) {
    const [window, setWindow] = useState('all'); // 'all' | 'last10' | 'last25'

    // Filter hands by window
    const filteredHands = useMemo(() => {
        if (!handHistory) return [];
        // The action the player took is recorded as `action` -- NOT
        // `userAction` and NOT `selectedAnswer`. Neither of those keys has
        // ever existed on a history entry (useGTOTrainer.js writes `action`),
        // so the filter below dropped every hand and this panel rendered its
        // "need at least 3 mixed-strategy hands" empty state after a 50-hand
        // session. See src/lib/training/handHistoryEntry.js.
        const hands = handHistory.map(h => ({
            gtoFrequencies: handFieldOf(h, 'gtoFrequencies'),
            userAction: playerActionOf(h),
        })).filter(h => h.gtoFrequencies && h.userAction);

        if (window === 'last10') return hands.slice(-10);
        if (window === 'last25') return hands.slice(-25);
        return hands;
    }, [handHistory, window]);

    const analysis = useMemo(() =>
        analyzeFrequencyAdherence(filteredHands),
        [filteredHands]
    );

    if (!analysis) {
        return (
            <div style={{
                padding: 16, textAlign: 'center',
                background: 'rgba(255,255,255,0.02)', borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                    Frequency Training
                </div>
                <div style={{ fontSize: 10, color: '#475569' }}>
                    Need at least 3 mixed-strategy hands to analyze frequency adherence.
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,15,30,0.95), rgba(20,20,40,0.95))',
            borderRadius: 14, padding: compact ? 12 : 16,
            border: '1px solid rgba(255,255,255,0.06)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <div>
                    <div style={{
                        fontSize: 12, fontWeight: 800, color: '#e2e8f0',
                        fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                    }}>
                        FREQUENCY ADHERENCE
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>
                        Are you randomizing like the solver?
                    </div>
                </div>

                {/* Window selector */}
                <div style={{ display: 'flex', gap: 2 }}>
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'last25', label: 'Last 25' },
                        { id: 'last10', label: 'Last 10' },
                    ].map(w => (
                        <button
                            key={w.id}
                            onClick={() => setWindow(w.id)}
                            style={{
                                padding: '3px 8px', borderRadius: 4, fontSize: 9,
                                fontWeight: 600, border: 'none', cursor: 'pointer',
                                background: window === w.id ? 'rgba(0,212,255,0.12)' : 'transparent',
                                color: window === w.id ? '#00d4ff' : '#64748b',
                            }}
                        >
                            {w.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Score + Comparisons */}
            <div style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                flexWrap: compact ? 'wrap' : 'nowrap',
            }}>
                {/* Dial */}
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 6, flexShrink: 0,
                }}>
                    <FrequencyDial
                        score={analysis.mixingScore}
                        grade={analysis.grade}
                        size={compact ? 80 : 100}
                    />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#64748b' }}>
                            {analysis.totalHands} mixed hands
                        </div>
                        <div style={{ fontSize: 8, color: '#475569' }}>
                            Entropy: {analysis.entropyScore}%
                        </div>
                    </div>
                </div>

                {/* Action comparison bars */}
                <div style={{ flex: 1, minWidth: 200 }}>
                    {analysis.comparisons
                        .filter(c => c.targetPct > 1 || c.actualPct > 1)
                        .map(c => (
                            <FrequencyComparisonBar
                                key={c.action}
                                action={c.action}
                                targetPct={c.targetPct}
                                actualPct={c.actualPct}
                                deviation={c.deviation}
                                deviationDirection={c.deviationDirection}
                            />
                        ))
                    }
                </div>
            </div>

            {/* Tips */}
            <MixingTips analysis={analysis} />

            {/* Footer */}
            <div style={{
                marginTop: 8, fontSize: 8, color: '#475569', textAlign: 'center',
                paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
                GTO mixing = taking each action at solver-specified frequencies over many hands.
                Dashed line = GTO target. Filled bar = your actual frequency.
            </div>
        </div>
    );
}
