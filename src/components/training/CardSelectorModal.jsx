/**
 * CardSelectorModal — GTO Wizard-Style Runout Card Picker
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Modal overlay showing a 4×13 card grid (suits × ranks).
 * Dead cards (on board / hero hand) are grayed out and unclickable.
 * Used for navigating to the next street in the Game Tree Explorer.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = [
    { code: 'h', symbol: '♥', color: '#ef4444', name: 'Hearts' },
    { code: 'd', symbol: '♦', color: '#3b82f6', name: 'Diamonds' },
    { code: 'c', symbol: '♣', color: '#22c55e', name: 'Clubs' },
    { code: 's', symbol: '♠', color: '#e2e8f0', name: 'Spades' },
];

export default function CardSelectorModal({ isOpen, onClose, onSelectCard, deadCards = [], title = 'Select a Card' }) {
    // Normalize dead cards to lowercase for comparison
    const deadSet = useMemo(() => {
        return new Set((deadCards || []).map(c => c.toLowerCase()));
    }, [deadCards]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.75)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 9999,
                    }}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className="sp-training-modal-surface"
                        initial={{ scale: 0.85, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(165deg, #0c2031 0%, #040d18 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
                            border: '2px solid transparent',
                            borderRadius: 16,
                            padding: '22px 24px',
                            boxShadow: '0 20px 64px rgba(0,0,0,0.75), inset 0 1px 1px rgba(255,255,255,0.22)',
                            maxWidth: 520,
                            width: '95%',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 18,
                            paddingBottom: 12,
                            borderBottom: '1px solid #688299',
                        }}>
                            <h3 style={{
                                margin: 0, fontSize: 20, fontWeight: 800,
                                color: '#f3f7fb',
                                fontFamily: "var(--font-rajdhani), 'Rajdhani', sans-serif",
                                textShadow: '0 1px 2px #000',
                            }}>
                                {title}
                            </h3>
                            <button
                                type="button"
                                aria-label="Close Card Selector"
                                onClick={onClose}
                                style={{
                                    minWidth: 44, minHeight: 44,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'linear-gradient(180deg, #34434c 0%, #0d1b25 12%, #030a0e 52%, #07151d 86%, #142e3b 100%) padding-box, linear-gradient(135deg, #fbffff 0%, #647988 7%, #e6f7ff 14%, #17222a 25%, #a2b5bf 40%, #ffffff 49%, #4c6470 59%, #101a22 72%, #e6f4fa 88%, #718691 100%) border-box',
                                    border: '2px solid transparent',
                                    borderRadius: 10, padding: '0 10px', color: '#f3f7fb',
                                    cursor: 'pointer', fontSize: 16, fontWeight: 700,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Card Grid: 4 rows (suits) × 13 cols (ranks) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {SUITS.map(suit => (
                                <div key={suit.code} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                    {/* Suit Label */}
                                    <div style={{
                                        width: 22, textAlign: 'center',
                                        color: suit.color, fontSize: 16,
                                    }}>
                                        {suit.symbol}
                                    </div>
                                    {/* Rank Cards */}
                                    {RANKS.map(rank => {
                                        const card = `${rank}${suit.code}`;
                                        const isDead = deadSet.has(card.toLowerCase());

                                        return (
                                            <motion.button
                                                key={card}
                                                whileHover={!isDead ? { scale: 1.15, zIndex: 10 } : {}}
                                                whileTap={!isDead ? { scale: 0.95 } : {}}
                                                onClick={() => !isDead && onSelectCard(card)}
                                                disabled={isDead}
                                                style={{
                                                    width: 32, height: 40,
                                                    display: 'flex', flexDirection: 'column',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    borderRadius: 4,
                                                    border: isDead
                                                        ? '1px solid rgba(255,255,255,0.04)'
                                                        : '1px solid rgba(255,255,255,0.12)',
                                                    background: isDead
                                                        ? 'rgba(255,255,255,0.02)'
                                                        : 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                                                    cursor: isDead ? 'not-allowed' : 'pointer',
                                                    opacity: isDead ? 0.2 : 1,
                                                    transition: 'all 0.15s ease',
                                                    padding: 0,
                                                    lineHeight: 1,
                                                }}
                                            >
                                                <span style={{
                                                    fontSize: 12, fontWeight: 800,
                                                    color: isDead ? '#333' : suit.color,
                                                    fontFamily: "'Inter', sans-serif",
                                                }}>
                                                    {rank === 'T' ? '10' : rank}
                                                </span>
                                                <span style={{
                                                    fontSize: 12,
                                                    color: isDead ? '#333' : suit.color,
                                                }}>
                                                    {suit.symbol}
                                                </span>
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* Info */}
                        <p style={{
                            margin: '16px 0 0', fontSize: 12, color: '#64748b',
                            textAlign: 'center',
                        }}>
                            Click A Card To Navigate To The Next Street • Grayed Cards Are Already In Play
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
