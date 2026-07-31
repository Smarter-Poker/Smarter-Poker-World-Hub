/**
 * TRIVIA SKELETON — Skeuomorphic Loading State
 * Replaces generic spinners with a pulsing, metallic layout
 * that matches the dimensions of the trivia game board.
 */

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import MetalFrame from '../ui/MetalFrame';

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
            className="trivia-skeleton-container"
            data-testid="trivia-skeleton"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="skeleton-sr-label">{label}</span>
            <MetalFrame padding="24px" showBolts={true} showNeonStrips={true}>
                <div className="skeleton-content">
                    {/* Header Area */}
                    <div className="skeleton-header">
                        <motion.div className="shimmer-block circle" {...pulse([0.3, 0.7, 0.3], 1.5)} />
                        <div className="header-text-lines">
                            <motion.div className="shimmer-block line-short" {...pulse([0.3, 0.7, 0.3], 1.5, 0.1)} />
                            <motion.div className="shimmer-block line-long" {...pulse([0.3, 0.7, 0.3], 1.5, 0.2)} />
                        </div>
                    </div>

                    {/* Question Area */}
                    <div className="skeleton-question-box">
                        <motion.div className="shimmer-block question-line" {...pulse([0.2, 0.5, 0.2], 2)} />
                        <motion.div
                            className="shimmer-block question-line" style={{ width: '80%' }}
                            {...pulse([0.2, 0.5, 0.2], 2, 0.1)}
                        />
                        <motion.div
                            className="shimmer-block question-line" style={{ width: '60%' }}
                            {...pulse([0.2, 0.5, 0.2], 2, 0.2)}
                        />
                    </div>

                    {/* Answers Grid Area */}
                    <div className="skeleton-answers-grid">
                        {[0, 1, 2, 3].map((i) => (
                            <motion.div
                                key={i}
                                className="shimmer-block answer-box"
                                {...pulse([0.15, 0.4, 0.15], 1.5, i * 0.15)}
                            />
                        ))}
                    </div>
                </div>
            </MetalFrame>

            <style>{`
                .trivia-skeleton-container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    width: 100%;
                    /* Reserve the real board's footprint so swapping the
                       skeleton for loaded questions doesn't shift the page. */
                    min-height: 520px;
                }
                .skeleton-sr-label {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0 0 0 0);
                    white-space: nowrap;
                    border: 0;
                }
                .skeleton-content {
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .skeleton-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .header-text-lines {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                }
                .skeleton-question-box {
                    padding: 20px 0;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    align-items: center;
                }
                .skeleton-answers-grid {
                    display: grid;
                    gap: 12px;
                }
                .shimmer-block {
                    background: rgba(255, 255, 255, 0.05); /* very subtle base */
                    border-radius: 8px;
                    position: relative;
                    overflow: hidden;
                }
                /* Add a sweeping gradient effect across the blocks.
                   Gated on prefers-reduced-motion: no-preference so the sweep
                   never runs for users who asked the OS to stop animations. */
                @media (prefers-reduced-motion: no-preference) {
                    .shimmer-block::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: -100%;
                        width: 50%;
                        height: 100%;
                        background: linear-gradient(
                            90deg,
                            transparent,
                            rgba(255, 255, 255, 0.08),
                            transparent
                        );
                        animation: shimmerSweep 3s infinite linear;
                    }
                }
                @keyframes shimmerSweep {
                    0% { left: -100%; }
                    100% { left: 200%; }
                }
                .circle {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                }
                .line-short {
                    height: 16px;
                    width: 40%;
                }
                .line-long {
                    height: 12px;
                    width: 70%;
                }
                .question-line {
                    height: 24px;
                    width: 100%;
                }
                .answer-box {
                    height: 64px;
                    width: 100%;
                    border-radius: 12px;
                    border: 2px solid rgba(255, 255, 255, 0.05);
                }
            `}</style>
        </div>
    );
}
