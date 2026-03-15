/**
 * TRIVIA SKELETON — Skeuomorphic Loading State
 * Replaces generic spinners with a pulsing, metallic layout
 * that matches the dimensions of the trivia game board.
 */

import React from 'react';
import { motion } from 'framer-motion';
import MetalFrame from '../ui/MetalFrame';

export default function TriviaSkeleton() {
    return (
        <div className="trivia-skeleton-container" data-testid="trivia-skeleton">
            <MetalFrame padding="24px" showBolts={true} showNeonStrips={true}>
                <div className="skeleton-content">
                    {/* Header Area */}
                    <div className="skeleton-header">
                        <motion.div 
                            className="shimmer-block circle"
                            animate={{ opacity: [0.3, 0.7, 0.3] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <div className="header-text-lines">
                            <motion.div 
                                className="shimmer-block line-short"
                                animate={{ opacity: [0.3, 0.7, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
                            />
                            <motion.div 
                                className="shimmer-block line-long"
                                animate={{ opacity: [0.3, 0.7, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                            />
                        </div>
                    </div>

                    {/* Question Area */}
                    <div className="skeleton-question-box">
                        <motion.div 
                            className="shimmer-block question-line"
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.div 
                            className="shimmer-block question-line" style={{ width: '80%' }}
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
                        />
                         <motion.div 
                            className="shimmer-block question-line" style={{ width: '60%' }}
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                        />
                    </div>

                    {/* Answers Grid Area */}
                    <div className="skeleton-answers-grid">
                        {[0, 1, 2, 3].map((i) => (
                            <motion.div 
                                key={i}
                                className="shimmer-block answer-box"
                                animate={{ opacity: [0.15, 0.4, 0.15] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                            />
                        ))}
                    </div>
                </div>
            </MetalFrame>

            <style jsx>{`
                .trivia-skeleton-container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    width: 100%;
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
                /* Add a sweeping gradient effect across the blocks */
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
