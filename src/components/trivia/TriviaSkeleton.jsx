/**
 * TRIVIA SKELETON — Skeuomorphic Loading State
 * Replaces generic spinners with a pulsing, metallic layout
 * that matches the dimensions of the trivia game board.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import MetalFrame from '../ui/MetalFrame';
import styles from './TriviaSkeleton.module.css';

export default function TriviaSkeleton({ label = 'Loading questions' }) {
    // Respect the OS "reduce motion" setting: the three pulse loops plus the
    // CSS shimmer sweep otherwise run unconditionally on a screen the player
    // stares at while waiting (battery + motion-sickness cost for nothing).
    const reduceMotion = useReducedMotion();
    const pulse = (opacityRange, duration, delay = 0) => (
        reduceMotion
            ? { animate: { opacity: opacityRange[1] }, transition: { duration: 0 } }
            : {
                animate: { opacity: opacityRange },
                transition: { duration, repeat: Infinity, ease: 'easeInOut', delay },
            }
    );

    return (
        <div
            className={styles.container}
            data-testid="trivia-skeleton"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className={styles.srLabel}>{label}</span>
            <MetalFrame padding="24px" showBolts={true} showNeonStrips={true}>
                <div className={styles.content}>
                    {/* Header Area */}
                    <div className={styles.header}>
                        <motion.div className={`${styles.shimmerBlock} ${styles.circle}`} {...pulse([0.3, 0.7, 0.3], 1.5)} />
                        <div className={styles.headerTextLines}>
                            <motion.div className={`${styles.shimmerBlock} ${styles.lineShort}`} {...pulse([0.3, 0.7, 0.3], 1.5, 0.1)} />
                            <motion.div className={`${styles.shimmerBlock} ${styles.lineLong}`} {...pulse([0.3, 0.7, 0.3], 1.5, 0.2)} />
                        </div>
                    </div>

                    {/* Question Area */}
                    <div className={styles.questionBox}>
                        <motion.div className={`${styles.shimmerBlock} ${styles.questionLine}`} {...pulse([0.2, 0.5, 0.2], 2)} />
                        <motion.div
                            className={`${styles.shimmerBlock} ${styles.questionLine}`} style={{ width: '80%' }}
                            {...pulse([0.2, 0.5, 0.2], 2, 0.1)}
                        />
                        <motion.div
                            className={`${styles.shimmerBlock} ${styles.questionLine}`} style={{ width: '60%' }}
                            {...pulse([0.2, 0.5, 0.2], 2, 0.2)}
                        />
                    </div>

                    {/* Answers Grid Area */}
                    <div className={styles.answersGrid}>
                        {[0, 1, 2, 3].map((i) => (
                            <motion.div
                                key={i}
                                className={`${styles.shimmerBlock} ${styles.answerBox}`}
                                {...pulse([0.15, 0.4, 0.15], 1.5, i * 0.15)}
                            />
                        ))}
                    </div>
                </div>
            </MetalFrame>
        </div>
    );
}
