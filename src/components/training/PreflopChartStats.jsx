/**
 * PreflopChartStats — Range Statistics Sidebar
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Shows combo counts, RFI%, hand category breakdowns, and mixed-frequency
 * highlights for the currently displayed preflop range. #SMARTERDESIGN: one
 * steel-rimmed panel, white figures, silver labels, ice emphasis..
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React from 'react';
import { motion } from 'framer-motion';
import at from '../../styles/training/analysis-tools.module.css';

export default function PreflopChartStats({ stats, position, scenario, actions = [] }) {
    if (!stats) return null;

    const {
        totalCombos = 0,
        maxCombos = 1326,
        rfiPct = 0,
        pairCombos = 0,
        suitedCombos = 0,
        offsuitCombos = 0,
        pureHands = 0,
        mixedHands = 0,
    } = stats;

    const scenarioLabels = {
        rfi: 'Raise First In',
        vs3bet: 'Vs 3-Bet',
        bb_defense: 'BB Defense',
        push_fold: 'Push / Fold',
    };

    const barData = [
        { label: 'Pairs', value: pairCombos, max: totalCombos || 1 },
        { label: 'Suited', value: suitedCombos, max: totalCombos || 1 },
        { label: 'Offsuit', value: offsuitCombos, max: totalCombos || 1, silver: true },
    ];

    return (
        <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`sd-panel ${at.panel}`}
            aria-label={`${position} ${scenarioLabels[scenario] || 'Range'} Statistics`}
        >
            <h2 className={at.eyebrow}>
                {position} {scenarioLabels[scenario] || 'Range'}
            </h2>

            <div className={at.metric}>
                <strong className={at.bigFigure}>{rfiPct}%</strong>
                <span className={at.small}>{totalCombos} / {maxCombos} Combos</span>
            </div>
            <div className={at.track}>
                <motion.div
                    className={at.fill}
                    initial={{ width: 0 }}
                    animate={{ width: `${rfiPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>

            <hr className={at.rule} />
            <h3 className={at.label}>Hand Categories</h3>
            {barData.map((item) => (
                <div key={item.label}>
                    <div className={at.barHead}>
                        <span>{item.label}</span>
                        <span>{item.value}</span>
                    </div>
                    <div className={at.track}>
                        <motion.div
                            className={`${at.fill} ${item.silver ? at.fillSilver : ''}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.value / item.max * 100) || 0}%` }}
                            transition={{ duration: 0.4, delay: 0.1 }}
                        />
                    </div>
                </div>
            ))}

            <hr className={at.rule} />
            <h3 className={at.label}>Frequency Type</h3>
            <div className={`${at.metrics} ${at.metrics2}`}>
                <div className={`sd-metric ${at.metric}`}>
                    <strong className={at.metricValue} data-tone="ice">{pureHands}</strong>
                    <span className={at.metricLabel}>Pure</span>
                </div>
                <div className={`sd-metric ${at.metric}`}>
                    <strong className={at.metricValue}>{mixedHands}</strong>
                    <span className={at.metricLabel}>Mixed</span>
                </div>
            </div>

            {actions.length > 0 && (
                <>
                    <hr className={at.rule} />
                    <h3 className={at.label}>Actions</h3>
                    {/* The grid's own legend carries the action colours; this list
                        names the actions without repeating (or contradicting) them. */}
                    <div className={at.row}>
                        {actions.map((action) => (
                            <span key={action} className={at.tag}>{action}</span>
                        ))}
                    </div>
                </>
            )}
        </motion.section>
    );
}
