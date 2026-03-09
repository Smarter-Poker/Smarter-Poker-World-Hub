/**
 * UNIVERSAL DYNAMIC TABLE — GTO Wizard-Style Poker Trainer
 * ═══════════════════════════════════════════════════════════════════════════
 * A dynamic poker table matching GTO Wizard's professional trainer UI:
 * - Poker-native action buttons (FOLD / CHECK / CALL / RAISE)
 * - 5-tier move classification (Best/Correct/Inaccuracy/Wrong/Blunder)
 * - GTOW Score tracking (-100% to +100%)
 * - Frequency bars showing GTO distribution on feedback
 * - EV loss per decision in BB
 * - Session stats HUD (Score, EV Loss, Mistakes)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RangeGrid from '../RangeGrid';
import {
    MOVE_CLASSIFICATIONS,
    CLASSIFICATION_CONFIG,
    simulateGTOFrequencies,
    classifyMove,
} from '../../../hooks/useGTOWScore';

// ═══════════════════════════════════════════════════════════════════════════
// SVG ICON RENDERER — Maps string icon IDs to professional SVG elements
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationSVGIcon({ icon, size = 18, color = 'currentColor' }) {
    const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (icon) {
        case 'star':
            return <svg {...props} strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
        case 'check':
            return <svg {...props} strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>;
        case 'alert':
            return <svg {...props} strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
        case 'x':
            return <svg {...props} strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
        case 'warning':
            return <svg {...props} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
        default:
            return <span>{icon || '?'}</span>;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// F6: BOARD TEXTURE CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════

function classifyBoardTexture(boardCards) {
    if (!boardCards || boardCards.length === 0) return null;

    // Count suits
    const suitCounts = {};
    const ranks = [];
    const rankValues = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 't': 10, 'j': 11, 'q': 12, 'k': 13, 'a': 14 };

    boardCards.forEach(card => {
        if (!card || card.length < 2) return;
        const suit = card[1].toLowerCase();
        const rank = card[0].toLowerCase();
        suitCounts[suit] = (suitCounts[suit] || 0) + 1;
        ranks.push(rankValues[rank] || 0);
    });

    // Suit texture
    const maxSuit = Math.max(...Object.values(suitCounts));
    let suitTexture = 'RAINBOW';
    if (maxSuit >= 3) suitTexture = 'MONOTONE';
    else if (maxSuit === 2) suitTexture = 'TWO-TONE';

    // Connectivity (wetness)
    ranks.sort((a, b) => a - b);
    let maxGap = 0;
    let connected = 0;
    for (let i = 1; i < ranks.length; i++) {
        const gap = ranks[i] - ranks[i - 1];
        maxGap = Math.max(maxGap, gap);
        if (gap <= 2) connected++;
    }

    // Paired
    const uniqueRanks = new Set(ranks);
    const isPaired = uniqueRanks.size < ranks.length;

    let connectTexture = 'STATIC';
    if (connected >= 2 || (ranks.length >= 3 && maxGap <= 3)) connectTexture = 'DYNAMIC';
    if (isPaired) connectTexture = 'PAIRED';

    return { suitTexture, connectTexture };
}

// ═══════════════════════════════════════════════════════════════════════════
// F8: SOUND EFFECTS ENGINE (Web Audio API — no external files needed)
// ═══════════════════════════════════════════════════════════════════════════

const SoundEngine = {
    _ctx: null,
    getCtx() {
        if (!this._ctx && typeof window !== 'undefined') {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._ctx;
    },
    play(type) {
        try {
            const ctx = this.getCtx();
            if (!ctx) return;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.08;

            const now = ctx.currentTime;
            switch (type) {
                case 'deal': {
                    // Card dealing: short noise burst (shuffling sound)
                    const noise = ctx.createBufferSource();
                    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
                    const noiseData = noiseBuffer.getChannelData(0);
                    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
                    noise.buffer = noiseBuffer;
                    const noiseGain = ctx.createGain();
                    noiseGain.gain.setValueAtTime(0.12, now);
                    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                    noise.connect(noiseGain);
                    noiseGain.connect(ctx.destination);
                    noise.start(now);
                    return; // Early return — skip oscillator
                }
                case 'new_hand': {
                    // New hand: ascending chime
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.setValueAtTime(660, now + 0.05);
                    gain.gain.setValueAtTime(0.04, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now); osc.stop(now + 0.15);
                    break;
                }
                case 'best':
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.setValueAtTime(1108, now + 0.08);
                    osc.frequency.setValueAtTime(1320, now + 0.16);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now); osc.stop(now + 0.4);
                    break;
                case 'correct':
                    osc.frequency.setValueAtTime(660, now);
                    osc.frequency.setValueAtTime(880, now + 0.1);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now); osc.stop(now + 0.25);
                    break;
                case 'wrong':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(330, now);
                    osc.frequency.setValueAtTime(220, now + 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                    osc.start(now); osc.stop(now + 0.3);
                    break;
                case 'blunder':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(440, now);
                    osc.frequency.linearRampToValueAtTime(110, now + 0.4);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    osc.start(now); osc.stop(now + 0.5);
                    break;
                case 'streak':
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.07);
                    osc.frequency.setValueAtTime(784, now + 0.14);
                    osc.frequency.setValueAtTime(1047, now + 0.21);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                    osc.start(now); osc.stop(now + 0.5);
                    break;
                case 'level_up': {
                    // Major chord arpeggio C-E-G-C for milestone celebrations
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.1);
                    osc.frequency.setValueAtTime(784, now + 0.2);
                    osc.frequency.setValueAtTime(1047, now + 0.3);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
                    osc.start(now); osc.stop(now + 0.7);
                    break;
                }
                case 'speed_bonus': {
                    // Quick ascending trill for speed bonus
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.setValueAtTime(1175, now + 0.04);
                    osc.frequency.setValueAtTime(1397, now + 0.08);
                    osc.frequency.setValueAtTime(1760, now + 0.12);
                    gain.gain.setValueAtTime(0.1, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                    osc.start(now); osc.stop(now + 0.25);
                    break;
                }
                case 'card_flip': {
                    // Quick swoosh for card reveal
                    const swoosh = ctx.createBufferSource();
                    const swooshBuf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
                    const swooshData = swooshBuf.getChannelData(0);
                    for (let i = 0; i < swooshData.length; i++) {
                        swooshData[i] = (Math.random() * 2 - 1) * (1 - i / swooshData.length);
                    }
                    swoosh.buffer = swooshBuf;
                    const swooshGain = ctx.createGain();
                    swooshGain.gain.setValueAtTime(0.06, now);
                    swooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                    swoosh.connect(swooshGain);
                    swooshGain.connect(ctx.destination);
                    swoosh.start(now);
                    return;
                }
                case 'session_complete': {
                    // Triumphant fanfare for session end
                    osc.frequency.setValueAtTime(523, now);
                    osc.frequency.setValueAtTime(659, now + 0.15);
                    osc.frequency.setValueAtTime(784, now + 0.3);
                    osc.frequency.setValueAtTime(1047, now + 0.45);
                    gain.gain.setValueAtTime(0.15, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
                    osc.start(now); osc.stop(now + 0.9);
                    break;
                }
                default:
                    osc.frequency.setValueAtTime(440, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                    osc.start(now); osc.stop(now + 0.15);
            }
        } catch (e) { /* Silent fail — audio not critical */ }
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// F1: RANGE MATRIX VIEWER — 13×13 hand grid colored by action frequency
// ═══════════════════════════════════════════════════════════════════════════

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function RangeMatrixViewer({ rawFrequencies, correctAnswer, show }) {
    // Build the 13x13 matrix (always compute — hooks can't be after early return)
    const matrix = useMemo(() => {
        if (!rawFrequencies) return [];
        const grid = [];
        const actionFreqs = rawFrequencies[correctAnswer] || {};

        for (let r = 0; r < 13; r++) {
            const row = [];
            for (let c = 0; c < 13; c++) {
                let hand;
                if (r === c) {
                    hand = RANKS[r] + RANKS[c]; // Pairs: AA, KK, etc.
                } else if (r < c) {
                    hand = RANKS[r] + RANKS[c] + 's'; // Suited: AKs, AQs
                } else {
                    hand = RANKS[c] + RANKS[r] + 'o'; // Offsuit: AKo, AQo
                }

                const freq = actionFreqs[hand] || 0;
                row.push({ hand, freq });
            }
            grid.push(row);
        }
        return grid;
    }, [rawFrequencies, correctAnswer]);

    // Early return AFTER hooks
    if (!show || !rawFrequencies || matrix.length === 0) return null;

    const getColor = (freq) => {
        if (freq >= 0.9) return '#22c55e';
        if (freq >= 0.7) return '#4ade80';
        if (freq >= 0.5) return '#86efac';
        if (freq >= 0.3) return '#fbbf24';
        if (freq >= 0.1) return '#f97316';
        if (freq > 0) return '#ef4444';
        return 'rgba(255,255,255,0.05)';
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.3 }}
            style={{ padding: '8px 4px', overflowX: 'auto' }}
        >
            <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4, textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                RANGE MATRIX — {correctAnswer?.toUpperCase()} FREQUENCY
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1, maxWidth: 300, margin: '0 auto' }}>
                {matrix.flat().map((cell, i) => (
                    <div
                        key={i}
                        title={`${cell.hand}: ${(cell.freq * 100).toFixed(0)}%`}
                        style={{
                            width: '100%',
                            aspectRatio: '1',
                            background: getColor(cell.freq),
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 6,
                            fontWeight: 'bold',
                            color: cell.freq > 0.3 ? '#000' : '#666',
                            cursor: 'default',
                        }}
                    >
                        {cell.hand}
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                {[{ label: '90%+', color: '#22c55e' }, { label: '50%+', color: '#86efac' }, { label: '10%+', color: '#f97316' }, { label: '0%', color: 'rgba(255,255,255,0.1)' }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: '#94a3b8' }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                        {l.label}
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// F11: STREAK TOAST COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function StreakToast({ message, show }) {
    if (!show) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', damping: 15 }}
            style={{
                position: 'fixed',
                top: 60,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'linear-gradient(135deg, #b45309 0%, #f59e0b 50%, #b45309 100%)',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: 30,
                fontSize: 14,
                fontWeight: 'bold',
                zIndex: 1000,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                letterSpacing: 1,
                textAlign: 'center',
            }}
        >
            {message}
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEAT POSITIONS — 9-Max Layout (portrait orientation)
// ═══════════════════════════════════════════════════════════════════════════

const SEAT_CONFIGS = {
    // 9-Max positions — SPREAD WIDE to prevent overlap
    // Seats hug the outer edge of the felt oval
    9: [
        { id: 0, name: 'BTN', x: 50, y: 82 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 24, y: 74 },    // Bottom-left (wider)
        { id: 2, name: 'BB', x: 16, y: 52 },    // Mid-left (wider)
        { id: 3, name: 'UTG', x: 22, y: 30 },   // Upper-mid-left
        { id: 4, name: 'UTG+1', x: 38, y: 18 }, // Top-left (higher)
        { id: 5, name: 'MP', x: 62, y: 18 },    // Top-right (higher)
        { id: 6, name: 'MP+1', x: 78, y: 30 },  // Upper-mid-right (wider)
        { id: 7, name: 'HJ', x: 84, y: 52 },    // Mid-right (wider)
        { id: 8, name: 'CO', x: 76, y: 74 },    // Bottom-right (wider)
    ],
    // 6-Max positions — Wider spread
    6: [
        { id: 0, name: 'BTN', x: 50, y: 80 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 22, y: 58 },    // Mid-left
        { id: 2, name: 'BB', x: 25, y: 30 },    // Upper-left
        { id: 3, name: 'UTG', x: 50, y: 18 },   // Top center
        { id: 4, name: 'HJ', x: 75, y: 30 },    // Upper-right
        { id: 5, name: 'CO', x: 78, y: 58 },    // Mid-right
    ],
    // 3-Max (Spins) — Spread
    3: [
        { id: 0, name: 'BTN', x: 50, y: 78 },   // Hero: Center bottom
        { id: 1, name: 'SB', x: 30, y: 28 },    // Top-left (wider)
        { id: 2, name: 'BB', x: 70, y: 28 },    // Top-right (wider)
    ],
    // Heads-Up
    2: [
        { id: 0, name: 'BTN/SB', x: 50, y: 78 }, // Hero: Center bottom
        { id: 1, name: 'BB', x: 50, y: 22 },     // Villain: Top center
    ],
};

// Position name mapping for display
const POSITION_NAMES = {
    'BTN': 'Button',
    'SB': 'Small-Blind',
    'BB': 'Big-Blind',
    'UTG': 'Under-the-Gun',
    'UTG+1': 'UTG+1',
    'MP': 'Middle Position',
    'MP+1': 'MP+1',
    'HJ': 'Hijack',
    'CO': 'Cutoff',
    'BTN/SB': 'Button/SB',
};

// 3D Illustrated avatar images
const AVATARS = [
    '/avatars/table/free_fox.png',
    '/avatars/table/vip_viking_warrior.png',
    '/avatars/table/free_wizard.png',
    '/avatars/table/free_ninja.png',
    '/avatars/table/vip_wolf.png',
    '/avatars/table/vip_spartan.png',
    '/avatars/table/vip_pharaoh.png',
    '/avatars/table/vip_pirate.png',
    '/avatars/table/free_cowboy.png',
];

// Convert card notation (e.g., 'Ah' for Ace of Hearts) to image path
function getCardPath(card) {
    if (!card || card.length < 2) return '/cards/back.png';

    const rankChar = card[0].toLowerCase();
    const suit = card[1].toLowerCase();

    // Handle tens - card notation uses 'T' but image files use '10'
    const rank = rankChar === 't' ? '10' : rankChar;

    const suitMap = {
        'h': 'hearts',
        'd': 'diamonds',
        'c': 'clubs',
        's': 'spades'
    };

    const suitName = suitMap[suit] || 'hearts';
    return `/cards/${suitName}_${rank}.png`;
}

// Render miniature inline card images for question text
function renderInlineCards(text) {
    if (!text) return text;

    // Pattern to match card notation: Ah, Ks, Td, 2c, etc.
    const cardPattern = /\b([AKQJT2-9])([hdcs])\b/gi;

    const parts = [];
    let lastIndex = 0;
    let match;

    // Create a fresh regex for exec
    const regex = new RegExp(cardPattern);
    while ((match = regex.exec(text)) !== null) {
        // Add text before this match
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        // Add the card image element
        const cardNotation = match[0];
        parts.push({
            type: 'card',
            notation: cardNotation,
            path: getCardPath(cardNotation)
        });

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

// Parse hero position from string to seat index
// Account for different table sizes having different position mappings
function getHeroSeatIndex(heroPosition, playerCount) {
    const normalized = (heroPosition || 'BTN').toUpperCase().trim();

    // Position mappings for different table sizes
    const positionMaps = {
        9: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'UTG+1': 4,
            'MP': 5, 'MIDDLE': 5,
            'MP+1': 6,
            'HJ': 7, 'HIJACK': 7,
            'CO': 8, 'CUTOFF': 8,
        },
        6: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
            'UTG': 3,
            'HJ': 4, 'HIJACK': 4, 'MP': 4, 'MIDDLE': 4,
            'CO': 5, 'CUTOFF': 5,
        },
        3: {
            'BTN': 0, 'BUTTON': 0,
            'SB': 1, 'SMALL BLIND': 1,
            'BB': 2, 'BIG BLIND': 2,
        },
        2: {
            'BTN': 0, 'BUTTON': 0, 'BTN/SB': 0,
            'BB': 1, 'BIG BLIND': 1,
        }
    };

    const map = positionMaps[playerCount] || positionMaps[6];
    return map[normalized] ?? 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTDOWN TIMER — GTO Wizard-style time pressure ring
// ═══════════════════════════════════════════════════════════════════════════

function CountdownTimer({ seconds = 60, questionNumber, showFeedback, active = true, onTimeExpired = null }) {
    const [timeLeft, setTimeLeft] = React.useState(seconds);
    const expiredRef = React.useRef(false);
    const radius = 18;
    const circumference = 2 * Math.PI * radius;

    // Reset timer on new question
    React.useEffect(() => {
        setTimeLeft(seconds);
        expiredRef.current = false;
    }, [questionNumber, seconds]);

    // Countdown tick — fires onTimeExpired when hitting 0
    React.useEffect(() => {
        if (!active || showFeedback || timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // BUG-04 FIX: Fire callback when timer expires
                    if (onTimeExpired && !expiredRef.current) {
                        expiredRef.current = true;
                        setTimeout(() => onTimeExpired(), 0);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [active, showFeedback, timeLeft, onTimeExpired]);

    if (!active || showFeedback) return null;

    const progress = timeLeft / seconds;
    const dashOffset = circumference * (1 - progress);
    const color = timeLeft > 30 ? '#22c55e' : timeLeft > 10 ? '#fbbf24' : '#ef4444';
    const pulseClass = timeLeft <= 5 ? { animation: 'pulse 0.5s infinite' } : {};

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...pulseClass }}
        >
            <svg width={44} height={44} viewBox="0 0 44 44">
                {/* Background ring */}
                <circle cx="22" cy="22" r={radius} fill="none"
                    stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                {/* Progress ring */}
                <circle cx="22" cy="22" r={radius} fill="none"
                    stroke={color} strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 22 22)"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
                {/* Timer text */}
                <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
                    fill={color} fontSize="13" fontWeight="bold"
                    fontFamily="'Orbitron', monospace"
                >
                    {timeLeft}
                </text>
            </svg>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// DETECT ACTION TYPE — Parse option text to determine poker action type
// ═══════════════════════════════════════════════════════════════════════════

function detectActionType(text) {
    const lower = (text || '').toLowerCase().trim();
    if (/fold/i.test(lower)) return 'fold';
    if (/check/i.test(lower)) return 'check';
    if (/call/i.test(lower)) return 'call';
    if (/raise|bet|3[- ]?bet|4[- ]?bet|all[- ]?in|shove|push|jam/i.test(lower)) return 'raise';
    return 'neutral';
}

// GTO Wizard-style color-coded action buttons — matches their exact scheme
// CHECK = green, FOLD = muted blue-grey, CALL = teal, RAISE/BET = red/salmon gradient
const ACTION_COLORS = {
    fold: { bg: '#2a3a2a', border: '#4a6a4a', text: '#8ab88a', accent: '#67a36f' },
    check: { bg: '#2a3a2a', border: '#4a6a4a', text: '#8ab88a', accent: '#67a36f' },
    call: { bg: '#1e3a4a', border: '#3a6a7a', text: '#7ab8d0', accent: '#5aa0b8' },
    raise: { bg: '#4a2a2a', border: '#8a4a4a', text: '#d6a0a0', accent: '#d6504a' },
    neutral: { bg: '#2a2a32', border: '#4a4a55', text: '#94a3b8', accent: '#64748b' },
};

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SKELETON — Shown while question is being fetched
// ═══════════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
    return (
        <div style={loadingStyles.container}>
            <div style={loadingStyles.questionBar}>
                <div style={loadingStyles.pulse} />
            </div>
            <div style={loadingStyles.tableArea}>
                <img
                    src="/images/training/table-vertical-stadium-transparent.png"
                    alt="Loading..."
                    style={loadingStyles.tableImage}
                />
                <div style={loadingStyles.loadingText}>Loading Question...</div>
            </div>
            <div style={loadingStyles.buttonsArea}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={loadingStyles.buttonSkeleton} />
                ))}
            </div>
        </div>
    );
}

const loadingStyles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #0a0a12 0%, #1a1a2e 100%)',
    },
    questionBar: {
        height: 60,
        background: 'rgba(255,255,255,0.05)',
        margin: 16,
        borderRadius: 12,
        overflow: 'hidden',
    },
    pulse: {
        width: '100%',
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
        animation: 'pulse 1.5s infinite',
    },
    tableArea: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    tableImage: {
        opacity: 0.3,
        height: '60%',
        objectFit: 'contain',
    },
    loadingText: {
        position: 'absolute',
        color: '#00d4ff',
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', sans-serif",
        animation: 'pulse 1.5s infinite',
    },
    buttonsArea: {
        display: 'flex',
        gap: 10,
        padding: 16,
    },
    buttonSkeleton: {
        flex: 1,
        height: 56,
        background: 'rgba(255,255,255,0.05)',
        borderRadius: 10,
    },
};

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR COMPONENT — Shows GTO frequency under each action button
// ═══════════════════════════════════════════════════════════════════════════

function FrequencyBar({ frequency, color, show }) {
    if (!show) return null;
    return (
        <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                marginTop: 4,
                overflow: 'hidden',
                transformOrigin: 'left',
            }}
        >
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${frequency}%` }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
                style={{
                    height: '100%',
                    background: color,
                    borderRadius: 3,
                }}
            />
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSIFICATION FLASH BANNER — GTO Wizard-style instant feedback overlay
// ═══════════════════════════════════════════════════════════════════════════

function ClassificationFlashBanner({ classification, evLoss, show }) {
    if (!show || !classification) return null;

    const config = CLASSIFICATION_CONFIG[classification];
    if (!config) return null;

    return (
        <AnimatePresence>
            <motion.div
                key={classification}
                initial={{ opacity: 0, y: -30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                style={{
                    width: '100%',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    background: config.bgColor || 'rgba(0,0,0,0.3)',
                    borderBottom: `2px solid ${config.borderColor || 'transparent'}`,
                    zIndex: 100,
                }}
            >
                <ClassificationSVGIcon icon={config.icon} size={18} color={config.color} />
                <span style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: config.color,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontFamily: "'Orbitron', monospace",
                }}>
                    {config.label}
                </span>
                {evLoss > 0 && (
                    <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#ef4444',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '2px 8px',
                        borderRadius: 6,
                    }}>
                        -{evLoss.toFixed(2)} EV
                    </span>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EV LOSS TICKER — Running session EV loss counter
// ═══════════════════════════════════════════════════════════════════════════

function EVLossTicker({ totalEVLoss, show }) {
    if (!show) return null;

    const evColor = totalEVLoss <= 0 ? '#22c55e' : totalEVLoss < 5 ? '#fbbf24' : '#ef4444';

    return (
        <motion.div
            key={totalEVLoss}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
                position: 'absolute',
                top: 8,
                right: 12,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'Orbitron', monospace",
                color: evColor,
                background: 'rgba(0,0,0,0.5)',
                padding: '4px 10px',
                borderRadius: 6,
                border: `1px solid ${evColor}33`,
                zIndex: 50,
                letterSpacing: 0.5,
            }}
        >
            EV: -{(totalEVLoss || 0).toFixed(2)} BB
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function UniversalDynamicTable({
    question,
    questionNumber,
    totalQuestions,
    onAnswer,
    showFeedback,
    feedbackResult,
    explanation,
    gameType = 'cash', // 'cash', 'mtt', 'sng', 'spins'
    gameTitle = '',    // Title of the training game
    streak = 0,        // Current streak count (only show if >= 2)
    // GTOW scoring props
    moveClassification = null,     // 'best', 'correct', 'inaccuracy', 'wrong', 'blunder'
    evLoss = 0,                    // EV loss in BB for this decision
    gtoFrequencies = null,         // { a: 60, b: 25, c: 10, d: 5 }
    gtowScore = 100,               // Current session GTOW score
    totalSessionEVLoss = 0,        // Cumulative EV loss
    sessionMistakes = 0,           // Mistake count this session
    // UI-2: Manual advance callback
    onNextHand = null,             // Called when user clicks "Next Hand"
    // Multi-street props
    isMultiStreetActive = false,    // Whether we're mid-hand across streets
    currentStreet = 'flop',         // Current street: 'flop', 'turn', 'river'
    // Quit/Back
    onExit = null,                  // Called when user clicks Quit
    // Enhancement: Adaptive difficulty
    difficultyLevel = 0,            // 0-10 difficulty level for display
}) {
    const [selectedAnswer, setSelectedAnswer] = React.useState(null);
    const [streakToast, setStreakToast] = React.useState(null);
    const [showWhyDrawer, setShowWhyDrawer] = React.useState(false);
    const [showRangeGrid, setShowRangeGrid] = React.useState(false);
    const [streakCelebration, setStreakCelebration] = React.useState(null);
    const [speedBonusToast, setSpeedBonusToast] = React.useState(null);
    const answerStartTime = useRef(Date.now());
    const prevStreakRef = useRef(streak);
    const swipeTouchRef = useRef(null);

    // Phase 3: RNG Mode state
    const [rngMode, setRngMode] = React.useState(false);
    const [rngRoll, setRngRoll] = React.useState(null);

    // Phase 3: Retry Hand state
    const lastQuestionRef = useRef(null);
    const [retryActive, setRetryActive] = React.useState(false);

    // Phase 3: Study Mode (show frequencies before answering)
    const [studyMode, setStudyMode] = React.useState(false);

    // Phase 3: Floating EV popup
    const [evPopup, setEvPopup] = React.useState(null);

    // Phase 3: Store question for retry + trigger EV popup on feedback
    useEffect(() => {
        if (question && !showFeedback) {
            lastQuestionRef.current = question;
            setRetryActive(false);
        }
    }, [question, showFeedback]);

    // Phase 3: RNG roll on feedback
    useEffect(() => {
        if (showFeedback && rngMode && gtoFrequencies) {
            setRngRoll(Math.floor(Math.random() * 100) + 1);
        } else if (!showFeedback) {
            setRngRoll(null);
        }
    }, [showFeedback, rngMode, gtoFrequencies]);

    // Phase 3: EV popup on answer
    useEffect(() => {
        if (showFeedback && moveClassification) {
            const isGood = moveClassification === 'best' || moveClassification === 'correct';
            setEvPopup({
                value: evLoss > 0 ? `-${evLoss.toFixed(1)}` : '+0.0',
                color: isGood ? '#22c55e' : '#ef4444',
            });
            const timer = setTimeout(() => setEvPopup(null), 1500);
            return () => clearTimeout(timer);
        }
    }, [showFeedback, moveClassification, evLoss]);

    // F8: Sound effects on feedback
    useEffect(() => {
        if (!showFeedback || !moveClassification) return;
        const soundMap = {
            best: 'best', correct: 'correct',
            inaccuracy: 'wrong', wrong: 'wrong', blunder: 'blunder'
        };
        SoundEngine.play(soundMap[moveClassification] || 'wrong');
        // Haptic feedback on mobile for wrong/blunder
        if ((moveClassification === 'wrong' || moveClassification === 'blunder') && navigator.vibrate) {
            navigator.vibrate(moveClassification === 'blunder' ? [100, 50, 100] : [80]);
        }
    }, [showFeedback, moveClassification]);



    // F11: Streak milestone celebrations (enhanced)
    useEffect(() => {
        if (streak > prevStreakRef.current && streak >= 3) {
            // Major milestones: 5, 10, 15, 20 — full celebration overlay
            if (streak >= 5 && streak % 5 === 0) {
                const rewards = { 5: 5, 10: 10, 15: 15, 20: 25 };
                const icons = { 5: 'star', 10: 'diamond', 15: 'crown', 20: 'legend' };
                setStreakCelebration({
                    streak,
                    reward: rewards[streak] || 5,
                    icon: icons[streak] || 'star',
                });
                SoundEngine.play('level_up');
                // Auto-dismiss after 2.5s
                setTimeout(() => setStreakCelebration(null), 2500);
            } else if (streak % 3 === 0) {
                // Minor milestones: 3, 6, 9, 12 — toast only
                const messages = {
                    3: '3 in a row!',
                    6: '6 streak! On fire!',
                    9: '9 streak! UNSTOPPABLE!',
                    12: '12 streak! LEGENDARY!',
                };
                const msg = messages[streak] || `${streak} streak!`;
                setStreakToast(msg);
                SoundEngine.play('streak');
                setTimeout(() => setStreakToast(null), 2500);
            }
        }
        prevStreakRef.current = streak;
    }, [streak]);

    // Speed tracking: reset timer on new question
    useEffect(() => {
        answerStartTime.current = Date.now();
        setShowWhyDrawer(false);
        setShowRangeGrid(false);
    }, [questionNumber]);

    // Swipe navigation: swipe left on feedback = Next Hand
    useEffect(() => {
        if (!showFeedback) return;
        const handleTouchStart = (e) => {
            swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        };
        const handleTouchEnd = (e) => {
            if (!swipeTouchRef.current) return;
            const dx = e.changedTouches[0].clientX - swipeTouchRef.current.x;
            const dy = Math.abs(e.changedTouches[0].clientY - swipeTouchRef.current.y);
            // Swipe left with > 60px distance and not vertical
            if (dx < -60 && dy < 100 && onNextHand) {
                onNextHand();
            }
            swipeTouchRef.current = null;
        };
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [showFeedback, onNextHand]);

    // Phase 25: Keyboard Shortcuts (1-4 for actions, Space for next, Esc to exit)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Don't intercept if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            const key = e.key;

            // During feedback: Space/Enter = next hand
            if (showFeedback && (key === ' ' || key === 'Enter')) {
                e.preventDefault();
                if (onNextHand) onNextHand();
                return;
            }

            // During question: 1-4 = select answer
            if (!showFeedback && !selectedAnswer) {
                const keyNum = parseInt(key);
                if (keyNum >= 1 && keyNum <= 4) {
                    e.preventDefault();
                    const opts = question?.options || [];
                    if (opts[keyNum - 1]) {
                        const optId = opts[keyNum - 1].id || opts[keyNum - 1];
                        setSelectedAnswer(optId);
                        if (onAnswer) onAnswer(optId);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showFeedback, selectedAnswer, onNextHand, onAnswer, question]);

    // ════════════════════════════════════════════════════════════════════════
    // DYNAMIC DATA EXTRACTION FROM QUESTION
    // ════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════
    // DYNAMIC DATA EXTRACTION FROM QUESTION
    // ═══════════════════════════════════════════════════════════════════════

    const scenario = question?.scenario || {};

    // Core question data
    const questionText = question?.question || question?.text || 'Loading question...';
    const rawOptions = question?.options || [];
    const correctAnswer = question?.correctAnswer || question?.correct || 'a';

    // BUG-A FIX: Fisher-Yates shuffle options per question to eliminate position bias
    // Uses seeded RNG so same question always shows same order (stable across re-renders)
    const options = useMemo(() => {
        const opts = [...rawOptions];
        if (opts.length <= 1) return opts;
        // Seeded LCG RNG using questionNumber for deterministic per-question shuffle
        let seed = ((questionNumber || 1) * 2654435761) >>> 0;
        const rng = () => { seed = ((seed * 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts;
    }, [rawOptions, questionNumber]);

    // Dynamic table state from question scenario
    const heroPosition = scenario.heroPosition || scenario.position || 'BTN';
    const heroStack = scenario.heroStack || scenario.stackDepth || 100;
    const villainStack = scenario.villainStack || 100;
    const pot = scenario.pot || 0;
    const board = scenario.board || '';
    const villainPosition = scenario.villainPosition || 'BB';
    const villainAction = scenario.action || scenario.villainAction || '';
    const street = scenario.street || '';

    // Parse hero cards - can be "AhKs" or ["Ah", "Ks"] or from scenario
    const rawHeroCards = question?.heroCards || scenario.heroHand || scenario.heroCards || 'AsKs';
    const heroCards = useMemo(() => {
        if (Array.isArray(rawHeroCards)) return rawHeroCards;
        if (typeof rawHeroCards === 'string' && rawHeroCards.length >= 4) {
            return [rawHeroCards.substring(0, 2), rawHeroCards.substring(2, 4)];
        }
        // Handle 3-char abstract notation: "K8s" (suited), "ATo" (offsuit)
        if (typeof rawHeroCards === 'string' && rawHeroCards.length === 3) {
            const r1 = rawHeroCards[0], r2 = rawHeroCards[1], suitFlag = rawHeroCards[2];
            if (suitFlag === 's') return [`${r1}s`, `${r2}s`]; // Both spades for suited
            if (suitFlag === 'o') return [`${r1}h`, `${r2}d`]; // Mixed suits for offsuit
            return [`${r1}h`, `${r2}s`]; // Default
        }
        // Handle 2-char pairs: "AA", "KK"
        if (typeof rawHeroCards === 'string' && rawHeroCards.length === 2) {
            return [`${rawHeroCards[0]}h`, `${rawHeroCards[1]}s`];
        }
        return ['As', 'Ks']; // Fallback
    }, [rawHeroCards]);

    // Parse board cards
    const boardCards = useMemo(() => {
        if (Array.isArray(board)) return board;
        if (typeof board === 'string' && board.length > 0) {
            // Handle "Jh 7s 2d" or "Jh7s2d"
            const cleaned = board.replace(/\s+/g, '');
            const cards = [];
            for (let i = 0; i < cleaned.length; i += 2) {
                if (i + 1 < cleaned.length) {
                    cards.push(cleaned.substring(i, i + 2));
                }
            }
            return cards;
        }
        return [];
    }, [board]);

    // Play card deal sound when board cards appear (new question)
    const prevQuestionNum = useRef(questionNumber);
    useEffect(() => {
        if (questionNumber !== prevQuestionNum.current) {
            prevQuestionNum.current = questionNumber;
            SoundEngine.play('new_hand');
            // Stagger card deal sounds for board cards
            if (boardCards && boardCards.length > 0) {
                boardCards.forEach((_, i) => {
                    setTimeout(() => SoundEngine.play('deal'), 120 * i + 200);
                });
            }
        }
    }, [questionNumber, boardCards]);

    // Determine player count based on game type
    const playerCount = useMemo(() => {
        if (gameType === 'spins' || gameType === 'sng') return 3;
        if (gameType === 'heads-up' || gameType === 'hu') return 2;
        if (gameType === '6max' || gameType === 'cash') return 6;
        return 9; // Default to 9-max for MTT
    }, [gameType]);

    // Get seat configuration
    const seats = SEAT_CONFIGS[playerCount] || SEAT_CONFIGS[9];

    // Find hero seat index based on position
    const heroSeatIndex = getHeroSeatIndex(heroPosition, playerCount);

    // Button is always at seat 0
    const getButtonSeatIndex = 0;

    // Generate STABLE villain stacks — relative to heroStack with ±variance
    const generateVillainStack = useMemo(() => {
        return (seatIndex) => {
            const seed = (questionNumber || 1) * 13 + seatIndex * 7;
            const variance = (seed % 40) - 20; // ±20BB variance around hero stack
            return Math.max(5, Math.round((heroStack || 100) + variance));
        };
    }, [questionNumber, heroStack]);

    // GAP-6: Effective stack (smallest of hero and all active villains)
    const effectiveStack = useMemo(() => {
        const villainStacks = seats
            .filter((_, i) => i !== heroSeatIndex)
            .map((_, i) => {
                const seed = (questionNumber || 1) * 13 + i * 7;
                return 30 + (seed % 120);
            });
        return Math.min(heroStack, ...villainStacks);
    }, [heroStack, seats, heroSeatIndex, questionNumber]);

    // GAP-2: SPR calculation
    const spr = useMemo(() => {
        if (pot <= 0) return null;
        return (effectiveStack / pot).toFixed(1);
    }, [effectiveStack, pot]);

    // GAP-2: Pot odds calculation
    const potOdds = useMemo(() => {
        if (pot <= 0) return null;
        // Find if there's a call option
        const callOpt = options.find(o => /call/i.test(o.text || ''));
        if (!callOpt) return null;
        const callMatch = (callOpt.text || '').match(/(\d+\.?\d*)/);
        if (!callMatch) return null;
        const callSize = parseFloat(callMatch[1]);
        if (callSize <= 0) return null;
        return Math.round((callSize / (pot + callSize)) * 100);
    }, [pot, options]);

    // GAP-1: Parse action history from scenario
    const actionHistory = useMemo(() => {
        const actions = scenario.actionHistory || scenario.actions || scenario.preflop_actions || [];
        if (Array.isArray(actions) && actions.length > 0) return actions;
        // Build from available data
        const built = [];
        if (villainAction) {
            built.push({ position: villainPosition, action: villainAction });
        }
        return built;
    }, [scenario, villainAction, villainPosition]);

    // Compute simulated GTO frequencies for this question (if not passed down)
    const computedFrequencies = useMemo(() => {
        if (gtoFrequencies) return gtoFrequencies;
        return simulateGTOFrequencies(options, correctAnswer, questionNumber);
    }, [gtoFrequencies, options, correctAnswer, questionNumber]);

    // Compute move classification for feedback display
    const computedClassification = useMemo(() => {
        if (moveClassification) return moveClassification;
        if (!showFeedback || !selectedAnswer) return null;
        const result = classifyMove(selectedAnswer, correctAnswer, computedFrequencies);
        return result.classification;
    }, [moveClassification, showFeedback, selectedAnswer, correctAnswer, computedFrequencies]);

    // Get classification config for display
    const classConfig = computedClassification ? CLASSIFICATION_CONFIG[computedClassification] : null;

    // Reset selectedAnswer on new question
    React.useEffect(() => {
        setSelectedAnswer(null);
    }, [questionNumber]);

    const handleAnswer = useCallback((answerId) => {
        if (showFeedback) return;
        setSelectedAnswer(answerId);
        // Speed bonus tracking
        const elapsed = (Date.now() - answerStartTime.current) / 1000;
        onAnswer(answerId, { answerTimeSeconds: elapsed });
    }, [showFeedback, onAnswer]);

    // Speed bonus toast on correct feedback
    useEffect(() => {
        if (!showFeedback || !moveClassification) return;
        if (moveClassification === 'best' || moveClassification === 'correct') {
            const elapsed = (Date.now() - answerStartTime.current) / 1000;
            if (elapsed < 5) {
                setSpeedBonusToast({ label: 'LIGHTNING +5', color: '#fbbf24' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            } else if (elapsed < 10) {
                setSpeedBonusToast({ label: 'SPEED BONUS +2', color: '#22c55e' });
                SoundEngine.play('speed_bonus');
                setTimeout(() => setSpeedBonusToast(null), 2000);
            }
        }
    }, [showFeedback, moveClassification]);

    // F9: Keyboard shortcuts (must be after handleAnswer definition)
    useEffect(() => {
        if (showFeedback || !question) return;
        const opts = question?.options || [];
        const handler = (e) => {
            const key = e.key;
            if (key >= '1' && key <= '4') {
                const idx = parseInt(key) - 1;
                if (idx < opts.length) {
                    const optId = opts[idx].id || String.fromCharCode(97 + idx);
                    handleAnswer(optId);
                }
            }
            const lower = key.toLowerCase();
            if (lower === 'f') {
                const foldOpt = opts.find(o => /fold/i.test(o.text));
                if (foldOpt) handleAnswer(foldOpt.id);
            } else if (lower === 'c') {
                const checkCallOpt = opts.find(o => /check|call/i.test(o.text));
                if (checkCallOpt) handleAnswer(checkCallOpt.id);
            } else if (lower === 'r') {
                const raiseOpt = opts.find(o => /raise|bet|all.in|shove/i.test(o.text));
                if (raiseOpt) handleAnswer(raiseOpt.id);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showFeedback, question, handleAnswer]);

    // UI-2: Space/Enter to advance to next hand during feedback
    useEffect(() => {
        if (!showFeedback || !onNextHand) return;
        const handler = (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onNextHand();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showFeedback, onNextHand]);

    // F6: Board texture classification
    const boardTexture = useMemo(() => classifyBoardTexture(boardCards), [boardCards]);

    // ═══════════════════════════════════════════════════════════════════════
    // ACTION BUTTON STYLES — GTO Wizard-style poker action buttons
    // ═══════════════════════════════════════════════════════════════════════

    const getActionButtonStyle = (option, index) => {
        const optionId = option.id || String.fromCharCode(97 + index);
        const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
        const actionType = detectActionType(text);
        const colors = ACTION_COLORS[actionType] || ACTION_COLORS.neutral;

        const baseStyle = {
            ...styles.actionButton,
            background: colors.bg,
            borderColor: colors.border,
            color: colors.text,
        };

        if (showFeedback) {
            const isCorrect = optionId === correctAnswer || optionId?.toLowerCase() === correctAnswer?.toLowerCase();
            const isSelected = optionId === selectedAnswer || optionId?.toLowerCase() === selectedAnswer?.toLowerCase();
            const freq = computedFrequencies[optionId] || computedFrequencies[optionId?.toLowerCase()] || 0;

            if (isCorrect) {
                // Best action — bright green glow
                return {
                    ...baseStyle,
                    background: '#1a3a2a',
                    borderColor: '#22c55e',
                    color: '#22c55e',
                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.25)',
                };
            }
            if (isSelected && !isCorrect) {
                // Selected wrong — use classification color
                const clsConfig = classConfig || CLASSIFICATION_CONFIG[MOVE_CLASSIFICATIONS.WRONG];
                return {
                    ...baseStyle,
                    background: clsConfig.bgColor,
                    borderColor: clsConfig.borderColor,
                    color: clsConfig.color,
                    boxShadow: `0 0 8px ${clsConfig.borderColor}44`,
                };
            }
            // Unselected options — dim but still colored
            return {
                ...baseStyle,
                opacity: 0.3,
                filter: 'grayscale(0.4)',
            };
        }
        return baseStyle;
    };

    // Determine street label
    const streetLabel = useMemo(() => {
        if (street) return street.toUpperCase();
        if (boardCards.length === 0) return 'PREFLOP';
        if (boardCards.length === 3) return 'FLOP';
        if (boardCards.length === 4) return 'TURN';
        if (boardCards.length === 5) return 'RIVER';
        return '';
    }, [street, boardCards.length]);

    // Build context string (e.g., "BTN vs BB • 3-Bet Pot • Flop")
    const contextString = useMemo(() => {
        const parts = [];
        if (heroPosition) parts.push(heroPosition);
        if (villainPosition && villainPosition !== heroPosition) parts.push(`vs ${villainPosition}`);
        if (villainAction) parts.push(villainAction);
        if (streetLabel) parts.push(streetLabel);
        return parts.join(' • ');
    }, [heroPosition, villainPosition, villainAction, streetLabel]);

    // GTOW Score color
    const scoreColor = gtowScore >= 80 ? '#22c55e' : gtowScore >= 60 ? '#fbbf24' : '#ef4444';

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════

    // Early return for loading state (must happen after all hooks)
    if (!question) {
        return <LoadingSkeleton />;
    }

    return (
        <div style={styles.container}>
            {/* CSS Animation Keyframes */}
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
            `}</style>
            {/* F11: Streak Toast */}
            <AnimatePresence>
                <StreakToast message={streakToast} show={!!streakToast} />
            </AnimatePresence>
            {/* F14: Classification Flash Banner */}
            <ClassificationFlashBanner
                classification={moveClassification}
                evLoss={evLoss}
                show={showFeedback}
            />
            {/* F15: Running EV Loss Ticker */}
            <EVLossTicker
                totalEVLoss={totalSessionEVLoss}
                show={questionNumber > 1}
            />
            {/* TOP BAR — Context + Score (GTO Wizard style) */}
            <div style={styles.topBar}>
                <div style={styles.topBarLeft}>
                    <div style={styles.gameTitle}>{gameTitle || 'GTO Training'}</div>
                    <div style={styles.contextString}>{contextString}</div>
                </div>
                <div style={styles.topBarRight}>
                    {/* Data source badge */}
                    {question?.source && (
                        <div style={{
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 9,
                            fontWeight: 'bold',
                            letterSpacing: 1,
                            background: (question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO')
                                ? 'rgba(0, 212, 255, 0.15)'
                                : 'rgba(139, 92, 246, 0.15)',
                            color: (question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? '#00d4ff' : '#a78bfa',
                            border: `1px solid ${(question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? 'rgba(0,212,255,0.3)' : 'rgba(139,92,246,0.3)'}`,
                        }}>
                            {(question.source === 'PIO_DATABASE' || question.source === 'DETERMINISTIC_SOLVER' || question.source === 'CACHED_SCENARIO') ? 'SOLVER' : 'AI'}
                        </div>
                    )}
                    {/* Multi-Street Indicator Badge */}
                    {isMultiStreetActive && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            style={{
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 9,
                                fontWeight: 'bold',
                                letterSpacing: 1,
                                background: currentStreet === 'river'
                                    ? 'rgba(239, 68, 68, 0.15)'
                                    : currentStreet === 'turn'
                                        ? 'rgba(251, 146, 60, 0.15)'
                                        : 'rgba(34, 197, 94, 0.15)',
                                color: currentStreet === 'river'
                                    ? '#f87171'
                                    : currentStreet === 'turn'
                                        ? '#fb923c'
                                        : '#4ade80',
                                border: `1px solid ${currentStreet === 'river'
                                    ? 'rgba(239,68,68,0.3)'
                                    : currentStreet === 'turn'
                                        ? 'rgba(251,146,60,0.3)'
                                        : 'rgba(34,197,94,0.3)'}`,
                            }}
                        >
                            {currentStreet.toUpperCase()}
                        </motion.div>
                    )}
                    {/* GTOW Score */}
                    <div style={{ ...styles.scoreBadge, borderColor: scoreColor }}>
                        <div style={{ ...styles.scoreValue, color: scoreColor }}>{gtowScore}%</div>
                        <div style={styles.scoreLabel}>SCORE</div>
                    </div>
                    {/* Question Counter */}
                    <div style={styles.questionCounter}>
                        {questionNumber}/{totalQuestions}
                    </div>
                </div>
            </div>

            {/* GAP-5: Progress bar */}
            <div style={styles.progressBarContainer}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${((questionNumber || 1) / (totalQuestions || 25)) * 100}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={styles.progressBarFill}
                />
            </div>

            {/* Phase 3: RNG / Study Mode Toggles */}
            <div style={{ display: 'flex', gap: 6, padding: '0 16px 4px', justifyContent: 'flex-end' }}>
                <button
                    onClick={() => setRngMode(v => !v)}
                    style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${rngMode ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        background: rngMode ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.03)',
                        color: rngMode ? '#a855f7' : '#64748b', cursor: 'pointer',
                        letterSpacing: 0.5, transition: 'all 0.15s ease',
                    }}
                >
                    RNG {rngMode ? 'ON' : 'OFF'}
                </button>
                <button
                    onClick={() => setStudyMode(v => !v)}
                    style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${studyMode ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        background: studyMode ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                        color: studyMode ? '#3b82f6' : '#64748b', cursor: 'pointer',
                        letterSpacing: 0.5, transition: 'all 0.15s ease',
                    }}
                >
                    {studyMode ? 'STUDY' : 'TRAIN'}
                </button>
            </div>

            {/* Phase 3: Session EV Progress Bar */}
            <div style={{
                margin: '0 16px 6px', height: 4, borderRadius: 2,
                background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
                position: 'relative',
            }}>
                <motion.div
                    animate={{ width: `${Math.min(100, Math.max(0, 50 + (totalSessionEVLoss > 0 ? -totalSessionEVLoss * 5 : 0)))}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: 2,
                        background: totalSessionEVLoss > 5
                            ? 'linear-gradient(90deg, #ef4444, #f97316)'
                            : totalSessionEVLoss > 1
                                ? 'linear-gradient(90deg, #fbbf24, #f97316)'
                                : 'linear-gradient(90deg, #22c55e, #4ade80)',
                    }}
                />
                <div style={{
                    position: 'absolute', top: -10, right: 4,
                    fontSize: 8, fontWeight: 700,
                    color: totalSessionEVLoss > 1 ? '#ef4444' : '#22c55e',
                }}>
                    {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)} EV` : '0.0 EV'}
                </div>
            </div>

            {/* GAP-4: Scenario context bar (replaces verbose question text) */}
            <div style={styles.questionBar}>
                <div style={styles.scenarioInfo}>
                    {/* GAP-1: Action history strip */}
                    {actionHistory.length > 0 ? (
                        <div style={styles.actionHistoryStrip}>
                            {actionHistory.map((a, i) => (
                                <span key={i} style={styles.actionHistoryItem}>
                                    <span style={styles.actionHistoryPos}>{a.position || ''}</span>
                                    <span style={styles.actionHistoryAction}>{a.action || ''}</span>
                                    {i < actionHistory.length - 1 && <span style={styles.actionHistorySep}>→</span>}
                                </span>
                            ))}
                        </div>
                    ) : villainAction ? (
                        <div style={styles.actionHistoryStrip}>
                            <span style={styles.actionHistoryItem}>
                                <span style={styles.actionHistoryPos}>{villainPosition}</span>
                                <span style={styles.actionHistoryAction}>{villainAction}</span>
                            </span>
                        </div>
                    ) : (
                        <div style={styles.scenarioLabel}>
                            {streetLabel} — Your action
                        </div>
                    )}
                    {/* GAP-6: Effective stack badge */}
                    <div style={styles.effStackBadge}>
                        Eff: {effectiveStack} BB
                    </div>
                </div>
                {/* Streak Badge */}
                {streak >= 2 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        style={styles.streakBadge}
                    >
                        <span style={{ fontSize: 14 }}></span>
                        <span style={styles.streakText}>{streak}</span>
                    </motion.div>
                )}
            </div>

            {/* TABLE AREA - Center */}
            <div style={styles.tableArea}>

                {/* Phase 3: Floating EV Popup */}
                <AnimatePresence>
                    {evPopup && (
                        <motion.div
                            key="ev-popup"
                            initial={{ opacity: 0, y: 10, scale: 0.8 }}
                            animate={{ opacity: 1, y: -20, scale: 1.2 }}
                            exit={{ opacity: 0, y: -40 }}
                            transition={{ duration: 0.6 }}
                            style={{
                                position: 'absolute',
                                top: '45%', left: '50%',
                                transform: 'translateX(-50%)',
                                zIndex: 100,
                                fontSize: 28, fontWeight: 900,
                                color: evPopup.color,
                                textShadow: `0 0 20px ${evPopup.color}44, 0 2px 8px rgba(0,0,0,0.5)`,
                                pointerEvents: 'none',
                                fontFamily: "'Inter', -apple-system, sans-serif",
                            }}
                        >
                            {evPopup.value} EV
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* CSS Poker Felt Table */}
                <div style={styles.feltOuter}>
                    <div style={styles.feltRail} />
                    <div style={styles.feltSurface} />
                </div>

                {/* DYNAMIC PLAYER SEATS */}
                <div style={styles.seatsContainer}>
                    {seats.map((seat, index) => {
                        const isHero = index === heroSeatIndex;
                        const isButton = index === getButtonSeatIndex;
                        const stackSize = isHero ? heroStack : generateVillainStack(index);

                        return (
                            <motion.div
                                key={seat.id}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                style={{
                                    ...styles.seat,
                                    left: `${seat.x}%`,
                                    top: `${seat.y}%`,
                                }}
                            >
                                {/* Position Circle with abbreviation (GTO Wizard style) */}
                                <div
                                    style={{
                                        ...styles.avatar,
                                        border: isHero ? '3px solid #5ac8c8' : '2px solid #4a4a55',
                                        background: isHero ? '#1a3a3a' : '#2a2a32',
                                        color: isHero ? '#5ac8c8' : '#94a3b8',
                                        boxShadow: isHero ? '0 0 12px rgba(90, 200, 200, 0.4)' : 'none',
                                    }}
                                >
                                    {seat.name}
                                </div>

                                {/* Dealer Button */}
                                {isButton && (
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', delay: 0.3 }}
                                        style={styles.dealerButton}
                                    >
                                        D
                                    </motion.div>
                                )}

                                {/* Badge + Hero Cards */}
                                <div style={isHero ? styles.heroRow : undefined}>
                                    <div style={{
                                        ...styles.badge,
                                        background: isHero ? '#1a3a3a' : '#2a2a32',
                                        borderColor: isHero ? '#5ac8c8' : '#4a4a55',
                                    }}>
                                        <div style={{ ...styles.badgeLabel, color: isHero ? '#5ac8c8' : '#94a3b8' }}>
                                            {isHero ? 'HERO' : seat.name}
                                        </div>
                                        <div style={styles.badgeStack}>{stackSize} bb</div>
                                    </div>

                                    {/* Hero Cards */}
                                    {isHero && (
                                        <div style={styles.heroCardsInline}>
                                            <motion.img
                                                src={getCardPath(heroCards[0])}
                                                alt={heroCards[0]}
                                                initial={{ y: 50, opacity: 0, rotateZ: -30 }}
                                                animate={{ y: 0, opacity: 1, rotateZ: -12 }}
                                                transition={{ delay: 0.1, duration: 0.4, type: 'spring' }}
                                                style={{
                                                    ...styles.card,
                                                    transformOrigin: 'bottom center',
                                                }}
                                            />
                                            <motion.img
                                                src={getCardPath(heroCards[1])}
                                                alt={heroCards[1]}
                                                initial={{ y: 50, opacity: 0, rotateZ: 30 }}
                                                animate={{ y: 0, opacity: 1, rotateZ: 8 }}
                                                transition={{ delay: 0.2, duration: 0.4, type: 'spring' }}
                                                style={{
                                                    ...styles.card,
                                                    marginLeft: -20,
                                                    transformOrigin: 'bottom center',
                                                }}
                                            />
                                        </div>
                                    )}
                                    {/* No card-backs for villains in GTO Wizard style */}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* BOARD CARDS - Center of table (3D card flip animation) */}
                {boardCards.length > 0 && (
                    <div style={styles.boardCards}>
                        {boardCards.map((card, i) => (
                            <motion.div
                                key={`${card}-${i}-${questionNumber}`}
                                initial={{ rotateY: 180, scale: 0.8 }}
                                animate={{ rotateY: 0, scale: 1 }}
                                transition={{
                                    delay: i * 0.15,
                                    duration: 0.5,
                                    type: 'spring',
                                    stiffness: 180,
                                    damping: 16,
                                }}
                                onAnimationComplete={() => {
                                    if (i === 0) SoundEngine.play('card_flip');
                                }}
                                style={{ perspective: 600, transformStyle: 'preserve-3d' }}
                            >
                                <img
                                    src={getCardPath(card)}
                                    alt={card}
                                    style={{
                                        ...styles.boardCard,
                                        backfaceVisibility: 'hidden',
                                    }}
                                />
                            </motion.div>
                        ))}
                        {/* F6: Board Texture Badge */}
                        {boardTexture && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: boardCards.length * 0.12 + 0.2 }}
                                style={{
                                    position: 'absolute',
                                    bottom: -18,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    display: 'flex',
                                    gap: 4,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <span style={{
                                    fontSize: 8,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    fontWeight: 'bold',
                                    letterSpacing: 0.5,
                                    background: boardTexture.connectTexture === 'DYNAMIC'
                                        ? 'rgba(249, 115, 22, 0.2)' : boardTexture.connectTexture === 'PAIRED'
                                            ? 'rgba(168, 85, 247, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                                    color: boardTexture.connectTexture === 'DYNAMIC'
                                        ? '#fb923c' : boardTexture.connectTexture === 'PAIRED'
                                            ? '#c084fc' : '#94a3b8',
                                    border: `1px solid ${boardTexture.connectTexture === 'DYNAMIC'
                                        ? 'rgba(249,115,22,0.3)' : boardTexture.connectTexture === 'PAIRED'
                                            ? 'rgba(168,85,247,0.3)' : 'rgba(100,116,139,0.2)'}`,
                                }}>
                                    {boardTexture.connectTexture}
                                </span>
                                <span style={{
                                    fontSize: 8,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    fontWeight: 'bold',
                                    letterSpacing: 0.5,
                                    background: boardTexture.suitTexture === 'MONOTONE'
                                        ? 'rgba(239, 68, 68, 0.2)' : boardTexture.suitTexture === 'TWO-TONE'
                                            ? 'rgba(59, 130, 246, 0.2)' : 'rgba(100, 116, 139, 0.15)',
                                    color: boardTexture.suitTexture === 'MONOTONE'
                                        ? '#f87171' : boardTexture.suitTexture === 'TWO-TONE'
                                            ? '#60a5fa' : '#94a3b8',
                                    border: `1px solid ${boardTexture.suitTexture === 'MONOTONE'
                                        ? 'rgba(239,68,68,0.3)' : boardTexture.suitTexture === 'TWO-TONE'
                                            ? 'rgba(59,130,246,0.3)' : 'rgba(100,116,139,0.2)'}`,
                                }}>
                                    {boardTexture.suitTexture}
                                </span>
                            </motion.div>
                        )}
                    </div>
                )}

                {/* POT DISPLAY + GAP-2: SPR & Pot Odds */}
                {pot > 0 && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={styles.pot}
                    >
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 }}>
                            {contextString}
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>{pot} bb</span>
                        {/* GAP-2: SPR + Pot Odds overlays */}
                        <div style={styles.potOverlayRow}>
                            {spr && <span style={styles.potOverlayBadge}>SPR: {spr}</span>}
                            {potOdds && <span style={styles.potOverlayBadge}>Odds: {potOdds}%</span>}
                        </div>
                    </motion.div>
                )}

                {/* STREET INDICATOR */}
                <motion.div
                    key={boardCards.length}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.8, y: 0 }}
                    style={styles.streetIndicator}
                >
                    {boardCards.length === 0 && '● PREFLOP'}
                    {boardCards.length === 3 && '● FLOP'}
                    {boardCards.length === 4 && '● TURN'}
                    {boardCards.length === 5 && '● RIVER'}
                </motion.div>
            </div>

            {/* SESSION STATS HUD — Score, EV Loss, Mistakes + Difficulty Bar */}
            <div style={styles.statsHUD}>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>EV Loss</span>
                    <span style={{ ...styles.statsHUDValue, color: totalSessionEVLoss > 0 ? '#ef4444' : '#22c55e' }}>
                        {totalSessionEVLoss > 0 ? `-${totalSessionEVLoss.toFixed(1)}` : '0.0'} BB
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Mistakes</span>
                    <span style={{ ...styles.statsHUDValue, color: sessionMistakes > 0 ? '#fbbf24' : '#22c55e' }}>
                        {sessionMistakes}
                    </span>
                </div>
                <div style={styles.statsHUDItem}>
                    <span style={styles.statsHUDLabel}>Streak</span>
                    <span style={{ ...styles.statsHUDValue, color: streak >= 3 ? '#f97316' : '#94a3b8' }}>
                        {streak >= 2 ? `${streak}` : streak}
                    </span>
                </div>
                {/* Adaptive Difficulty Indicator */}
                {difficultyLevel > 0 && (
                    <div style={styles.statsHUDItem}>
                        <span style={styles.statsHUDLabel}>Difficulty</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <div style={{
                                width: 40, height: 5, borderRadius: 3,
                                background: 'rgba(255,255,255,0.1)',
                                overflow: 'hidden',
                            }}>
                                <motion.div
                                    animate={{ width: `${Math.min(difficultyLevel * 10, 100)}%` }}
                                    transition={{ duration: 0.5, ease: 'easeOut' }}
                                    style={{
                                        height: '100%', borderRadius: 3,
                                        background: difficultyLevel <= 3 ? '#22c55e'
                                            : difficultyLevel <= 6 ? '#fbbf24'
                                                : difficultyLevel <= 8 ? '#f97316' : '#ef4444',
                                    }}
                                />
                            </div>
                            <span style={{
                                fontSize: 9, fontWeight: 700, fontFamily: "'Orbitron', monospace",
                                color: difficultyLevel <= 3 ? '#22c55e'
                                    : difficultyLevel <= 6 ? '#fbbf24'
                                        : difficultyLevel <= 8 ? '#f97316' : '#ef4444',
                            }}>
                                {difficultyLevel}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* STREAK CELEBRATION OVERLAY */}
            <AnimatePresence>
                {streakCelebration && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'absolute', inset: 0, zIndex: 200,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.75)',
                            backdropFilter: 'blur(6px)',
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.3, rotateZ: -20 }}
                            animate={{ scale: 1, rotateZ: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                            style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 36, boxShadow: '0 0 40px rgba(251,191,36,0.5)',
                                marginBottom: 12,
                            }}
                        >
                            <ClassificationSVGIcon icon="star" size={36} color="#fff" />
                        </motion.div>
                        <motion.div
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.15 }}
                            style={{
                                fontFamily: "'Orbitron', sans-serif", fontSize: 22,
                                fontWeight: 900, color: '#fbbf24', letterSpacing: 2,
                                textShadow: '0 2px 8px rgba(251,191,36,0.4)',
                            }}
                        >
                            {streakCelebration.streak} STREAK!
                        </motion.div>
                        <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            style={{
                                fontSize: 14, fontWeight: 700, marginTop: 8,
                                color: '#00d4ff', letterSpacing: 1,
                            }}
                        >
                            +{streakCelebration.reward} Diamonds
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* SPEED BONUS TOAST */}
            <AnimatePresence>
                {speedBonusToast && (
                    <motion.div
                        initial={{ y: -30, opacity: 0, scale: 0.8 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        style={{
                            position: 'absolute', top: 80, left: '50%',
                            transform: 'translateX(-50%)', zIndex: 150,
                            padding: '8px 20px', borderRadius: 10,
                            background: `linear-gradient(135deg, ${speedBonusToast.color}22 0%, ${speedBonusToast.color}11 100%)`,
                            border: `1px solid ${speedBonusToast.color}66`,
                            color: speedBonusToast.color,
                            fontFamily: "'Orbitron', monospace",
                            fontSize: 13, fontWeight: 800, letterSpacing: 1.5,
                            boxShadow: `0 0 20px ${speedBonusToast.color}33`,
                        }}
                    >
                        {speedBonusToast.label}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ACTION BUTTONS — GTO Wizard-style poker action bar (F2: Dynamic sizing + F9: Keyboard hints) */}
            <div style={{ ...styles.actionBar, position: 'relative' }}>
                {/* YOUR ACTION turn indicator */}
                {!showFeedback && (
                    <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        style={{
                            position: 'absolute', top: -20, left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: 10, fontWeight: 800, letterSpacing: 2,
                            color: '#00d4ff', textTransform: 'uppercase',
                            textShadow: '0 0 8px rgba(0,212,255,0.3)',
                            whiteSpace: 'nowrap', zIndex: 5,
                        }}
                    >
                        YOUR ACTION
                    </motion.div>
                )}
                {/* Countdown Timer — 60 seconds, auto-submits worst action on expiry */}
                <CountdownTimer
                    seconds={60}
                    questionNumber={questionNumber}
                    showFeedback={showFeedback}
                    onTimeExpired={() => {
                        // BUG-04 FIX: Auto-submit worst option when timer expires
                        if (!showFeedback && !selectedAnswer && onAnswer) {
                            const opts = question?.options || [];
                            // Find fold option, or use the first option as fallback
                            const foldOpt = opts.find(o => /fold/i.test(o.text || o.label || ''));
                            const worstId = foldOpt ? (foldOpt.id || foldOpt) : (opts[0]?.id || opts[0]);
                            if (worstId) {
                                setSelectedAnswer(worstId);
                                onAnswer(worstId);
                                SoundEngine.play('wrong');
                            }
                        }
                    }}
                />
                {/* Quit/Back Button */}
                {onExit && (
                    <button
                        onClick={onExit}
                        style={{
                            position: 'absolute', top: -40, left: 0,
                            padding: '6px 14px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#94a3b8', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', zIndex: 10,
                        }}
                    >
                        Quit
                    </button>
                )}
                {options.slice(0, 4).map((option, index) => {
                    const optionId = option.id || String.fromCharCode(97 + index);
                    const text = typeof option === 'string' ? option : (option.text || option.label || 'Option');
                    const freq = computedFrequencies[optionId] || computedFrequencies[optionId?.toLowerCase()] || 0;
                    const actionType = detectActionType(text);
                    const shortcutKey = index + 1;

                    return (
                        <div key={optionId} style={styles.actionButtonWrapper}>
                            <motion.button
                                onClick={() => handleAnswer(optionId)}
                                disabled={showFeedback}
                                style={getActionButtonStyle(option, index)}
                                whileHover={!showFeedback ? { scale: 1.04, y: -3 } : {}}
                                whileTap={!showFeedback ? { scale: 0.96 } : {}}
                            >
                                {/* F9: Keyboard shortcut hint */}
                                {!showFeedback && (
                                    <span style={{
                                        position: 'absolute',
                                        top: 3,
                                        left: 6,
                                        fontSize: 8,
                                        color: 'rgba(255,255,255,0.25)',
                                        fontWeight: 'bold',
                                    }}>
                                        {shortcutKey}
                                    </span>
                                )}
                                <span style={styles.actionText}>
                                    {text}
                                    {/* UI-4: Pot-relative bet sizing label */}
                                    {(() => {
                                        if (pot <= 0) return null;
                                        const betMatch = text.match(/(\d+\.?\d*)\s*(bb|BB)/i);
                                        if (!betMatch) return null;
                                        const betSize = parseFloat(betMatch[1]);
                                        const pctOfPot = Math.round((betSize / pot) * 100);
                                        if (pctOfPot > 0 && pctOfPot <= 500) {
                                            return (
                                                <span style={{
                                                    display: 'block',
                                                    fontSize: 9,
                                                    opacity: 0.6,
                                                    marginTop: 1,
                                                    fontWeight: 'normal',
                                                }}>
                                                    {pctOfPot}% Pot
                                                </span>
                                            );
                                        }
                                        return null;
                                    })()}
                                </span>
                                {/* Show frequency label on feedback OR study mode */}
                                {(showFeedback || (studyMode && computedFrequencies)) && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: showFeedback ? 0.3 : 0 }}
                                        style={{
                                            ...styles.freqLabel,
                                            ...(studyMode && !showFeedback ? { opacity: 0.5, fontSize: 9 } : {}),
                                        }}
                                    >
                                        {freq}%
                                    </motion.span>
                                )}
                            </motion.button>
                            {/* Frequency bar under button */}
                            <FrequencyBar
                                frequency={freq}
                                color={ACTION_COLORS[actionType]?.border || '#64748b'}
                                show={showFeedback}
                            />
                        </div>
                    );
                })}
            </div>

            {/* INLINE FEEDBACK — Table stays visible, results shown below action bar */}
            {showFeedback && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                    style={styles.feedbackInline}
                >
                    {/* Classification + EV Row */}
                    <div style={styles.feedbackTopRow}>
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300 }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 16px', borderRadius: 20,
                                background: classConfig?.bgColor || 'rgba(59,130,246,0.15)',
                                border: `1.5px solid ${classConfig?.borderColor || '#3b82f6'}`,
                            }}
                        >
                            <ClassificationSVGIcon icon={classConfig?.icon} size={16} color={classConfig?.color} />
                            <span style={{
                                fontSize: 13, fontWeight: 800, color: classConfig?.color || '#3b82f6',
                                letterSpacing: 0.8, textTransform: 'uppercase',
                                fontFamily: "'Orbitron', monospace",
                            }}>{classConfig?.label || 'Unknown'}</span>
                        </motion.div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>EV:</span>
                            <span style={{
                                fontSize: 14, fontWeight: 800,
                                fontFamily: "'Orbitron', monospace",
                                color: evLoss > 0 ? '#ef4444' : '#22c55e',
                            }}>
                                {evLoss > 0 ? `-${evLoss.toFixed(2)}` : '0.00'} BB
                            </span>
                        </div>
                    </div>

                    {/* Your Pick + Correct Answer Row */}
                    {selectedAnswer && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                            justifyContent: 'center',
                        }}>
                            <span style={{
                                fontSize: 11, fontWeight: 600,
                                color: feedbackResult === 'correct' ? '#22c55e' : '#ef4444',
                            }}>
                                {feedbackResult === 'correct' ? '✓' : '✗'} You: {options.find(o => o.id === selectedAnswer)?.text || selectedAnswer}
                            </span>
                            {selectedAnswer !== correctAnswer && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                                    ✓ Best: {options.find(o => o.id === correctAnswer)?.text || correctAnswer}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Phase 3: RNG Roll Indicator */}
                    {rngMode && rngRoll !== null && computedFrequencies && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '4px 12px', borderRadius: 6,
                            background: 'rgba(168,85,247,0.08)',
                            border: '1px solid rgba(168,85,247,0.2)',
                            fontSize: 11,
                        }}>
                            <span style={{ fontWeight: 900, color: '#a855f7', fontSize: 14 }}>{rngRoll}</span>
                            <span style={{ color: '#a855f7', fontWeight: 700, letterSpacing: 0.5 }}>RNG</span>
                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                                {(() => {
                                    let cumulative = 0;
                                    for (const [actionId, freq] of Object.entries(computedFrequencies)) {
                                        cumulative += freq;
                                        if (rngRoll <= cumulative) {
                                            const opt = options.find(o => o.id === actionId);
                                            return `→ ${opt?.text || actionId}`;
                                        }
                                    }
                                    return `→ ${options[0]?.text || 'Check'}`;
                                })()}
                            </span>
                        </div>
                    )}

                    {/* Per-Action EV Comparison */}
                    {question?.evData?.actionEVs && Object.keys(question.evData.actionEVs).length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            style={{
                                width: '100%', padding: '6px 10px',
                                background: 'rgba(0,0,0,0.3)', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
                                EV by Action
                            </div>
                            {options.slice(0, 4).map(opt => {
                                const optId = opt.id || opt;
                                const ev = question.evData.actionEVs[optId];
                                if (ev === undefined) return null;
                                const maxEV = Math.max(...Object.values(question.evData.actionEVs).filter(v => typeof v === 'number'));
                                const minEV = Math.min(...Object.values(question.evData.actionEVs).filter(v => typeof v === 'number'));
                                const range = maxEV - minEV || 1;
                                const barWidth = Math.max(5, ((ev - minEV) / range) * 100);
                                const isOptimal = optId === correctAnswer;
                                const isSelected = optId === selectedAnswer;
                                const barColor = isOptimal ? '#22c55e' : isSelected ? (classConfig?.color || '#ef4444') : '#475569';

                                return (
                                    <div key={optId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <div style={{ width: 42, fontSize: 9, fontWeight: 600, color: isOptimal ? '#22c55e' : '#94a3b8', textAlign: 'right' }}>
                                            {typeof opt === 'object' ? opt.text : opt}
                                        </div>
                                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${barWidth}%` }}
                                                transition={{ duration: 0.5, delay: 0.2 }}
                                                style={{ height: '100%', background: barColor, borderRadius: 3 }}
                                            />
                                        </div>
                                        <div style={{ width: 44, fontSize: 9, fontWeight: 'bold', textAlign: 'right', fontFamily: "'Orbitron', monospace", color: ev >= 0 ? '#22c55e' : '#ef4444' }}>
                                            {ev >= 0 ? '+' : ''}{ev.toFixed(2)}
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Explanation + Why Drawer */}
                    {(() => {
                        const displayExplanation = explanation || (() => {
                            if (!moveClassification) return null;
                            const correctOpt = options.find(o => o.id === correctAnswer)?.text || correctAnswer;
                            const selectedOpt = selectedAnswer ? (options.find(o => o.id === selectedAnswer)?.text || selectedAnswer) : '';
                            const freq = computedFrequencies[correctAnswer] || 0;
                            if (moveClassification === 'best') return `Great — ${correctOpt} is the highest-frequency play${freq > 0 ? ` at ${freq}%` : ''}.`;
                            if (moveClassification === 'correct') return `Good — your action is part of the GTO mix, though ${correctOpt} is more frequent.`;
                            if (moveClassification === 'inaccuracy') return `${correctOpt} is the solver's primary action${freq > 0 ? ` at ${freq}%` : ''}. ${selectedOpt} costs ${evLoss > 0 ? evLoss.toFixed(1) + ' BB' : 'some'} EV.`;
                            if (moveClassification === 'wrong') return `The solver prefers ${correctOpt}${freq > 0 ? ` (${freq}%)` : ''}. ${selectedOpt} loses ${evLoss > 0 ? evLoss.toFixed(1) + ' BB' : 'significant'} EV.`;
                            return `A blunder — ${correctOpt} is the optimal play. ${selectedOpt} costs ${evLoss > 0 ? evLoss.toFixed(1) + ' BB' : 'heavy'} EV.`;
                        })();
                        if (!displayExplanation) return null;
                        return (
                            <div style={{ width: '100%' }}>
                                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#cbd5e1', textAlign: 'center' }}>
                                    {displayExplanation}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                                    <button
                                        onClick={() => setShowWhyDrawer(!showWhyDrawer)}
                                        style={{
                                            padding: '4px 12px', borderRadius: 6,
                                            background: 'rgba(0, 212, 255, 0.08)',
                                            border: '1px solid rgba(0, 212, 255, 0.25)',
                                            color: '#00d4ff', fontSize: 10, fontWeight: 700,
                                            cursor: 'pointer', letterSpacing: 0.5,
                                        }}
                                    >
                                        {showWhyDrawer ? 'Hide Details' : 'Why?'}
                                    </button>
                                </div>
                                <AnimatePresence>
                                    {showWhyDrawer && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            style={{ overflow: 'hidden' }}
                                        >
                                            <div style={{
                                                marginTop: 6, padding: '8px 10px',
                                                background: 'rgba(0, 212, 255, 0.04)',
                                                borderRadius: 8,
                                                border: '1px solid rgba(0, 212, 255, 0.12)',
                                                fontSize: 10, color: '#cbd5e1', lineHeight: 1.6,
                                            }}>
                                                <div style={{ fontWeight: 700, color: '#00d4ff', marginBottom: 4, fontSize: 9, letterSpacing: 1 }}>
                                                    SOLVER ANALYSIS
                                                </div>
                                                <div style={{ marginBottom: 3 }}>
                                                    <strong style={{ color: '#22c55e' }}>Optimal:</strong>{' '}
                                                    {options.find(o => o.id === correctAnswer)?.text || correctAnswer}
                                                    {computedFrequencies[correctAnswer] > 0 && (
                                                        <span style={{ color: '#94a3b8' }}> at {computedFrequencies[correctAnswer]}%</span>
                                                    )}
                                                </div>
                                                {selectedAnswer && selectedAnswer !== correctAnswer && (
                                                    <div style={{ marginBottom: 3 }}>
                                                        <strong style={{ color: '#ef4444' }}>Your Pick:</strong>{' '}
                                                        {options.find(o => o.id === selectedAnswer)?.text || selectedAnswer}
                                                        {evLoss > 0 && (
                                                            <span style={{ color: '#ef4444' }}> loses {evLoss.toFixed(2)} BB</span>
                                                        )}
                                                    </div>
                                                )}
                                                {boardTexture && (
                                                    <div style={{ marginBottom: 3 }}>
                                                        <strong style={{ color: '#94a3b8' }}>Board:</strong>{' '}
                                                        {boardTexture.suitTexture} + {boardTexture.connectTexture}.
                                                        {heroPosition && ` Hero in ${POSITION_NAMES[heroPosition] || heroPosition}.`}
                                                    </div>
                                                )}
                                                {street && (
                                                    <div style={{ color: '#64748b', fontSize: 9, marginTop: 3 }}>
                                                        {street.charAt(0).toUpperCase() + street.slice(1)} | Pot: {pot} BB | SPR: {spr || 'N/A'}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })()}

                    {/* Range Grid (when raw frequencies available) */}
                    {question?.rawFrequencies && (
                        <div style={{ width: '100%' }}>
                            <div style={{
                                fontSize: 10, color: '#94a3b8', padding: '3px 8px',
                                background: 'rgba(255,255,255,0.03)', borderRadius: 6,
                                textAlign: 'center',
                            }}>
                                <span style={{ fontWeight: 'bold', color: '#64748b' }}>GTO: </span>
                                {options.slice(0, 4).map(o => {
                                    const f = computedFrequencies[o.id] || 0;
                                    if (f <= 0) return null;
                                    return (
                                        <span key={o.id} style={{ marginRight: 6 }}>
                                            {o.text}: <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{f}%</span>
                                        </span>
                                    );
                                })}
                            </div>
                            {question?.rawFrequencies && (() => {
                                const actions = Object.keys(question.rawFrequencies);
                                const gridData = {};
                                const allRanks = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
                                for (let r = 0; r < 13; r++) {
                                    for (let c = 0; c < 13; c++) {
                                        let hand;
                                        if (r === c) hand = allRanks[r] + allRanks[c];
                                        else if (r < c) hand = allRanks[r] + allRanks[c] + 's';
                                        else hand = allRanks[c] + allRanks[r] + 'o';
                                        const handFreqs = {};
                                        let hasAny = false;
                                        actions.forEach(action => {
                                            const freq = question.rawFrequencies[action]?.[hand];
                                            if (freq !== undefined && freq > 0) {
                                                handFreqs[action] = Math.round(freq * 1000) / 10;
                                                hasAny = true;
                                            }
                                        });
                                        gridData[hand] = hasAny ? handFreqs : null;
                                    }
                                }
                                const hCards = question?.heroCards || question?.cards;
                                let heroHand = null;
                                if (hCards && hCards.length >= 2) {
                                    const r1 = hCards[0]?.[0]?.toUpperCase();
                                    const r2 = hCards[1]?.[0]?.toUpperCase();
                                    if (r1 && r2) {
                                        const s1 = hCards[0]?.[1];
                                        const s2 = hCards[1]?.[1];
                                        const ranks = 'AKQJT98765432';
                                        const i1 = ranks.indexOf(r1);
                                        const i2 = ranks.indexOf(r2);
                                        if (i1 >= 0 && i2 >= 0) {
                                            if (r1 === r2) heroHand = r1 + r2;
                                            else if (s1 === s2) heroHand = (i1 < i2 ? r1 + r2 : r2 + r1) + 's';
                                            else heroHand = (i1 < i2 ? r1 + r2 : r2 + r1) + 'o';
                                        }
                                    }
                                }
                                return (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        transition={{ duration: 0.3, delay: 0.3 }}
                                        style={{ marginTop: 6 }}
                                    >
                                        <div style={{
                                            fontSize: 9, fontWeight: 700, color: '#64748b',
                                            letterSpacing: 1.2, textTransform: 'uppercase',
                                            marginBottom: 4, textAlign: 'center',
                                        }}>
                                            Range Matrix {heroHand && <span style={{ color: '#00d4ff' }}>• {heroHand}</span>}
                                        </div>
                                        <RangeGrid
                                            gridData={gridData}
                                            actions={actions}
                                            cellSize={20}
                                            heroHand={heroHand}
                                            compact={true}
                                        />
                                    </motion.div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Next Hand / Continue Hand buttons */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        {onNextHand ? (
                            <>
                                <motion.button
                                    onClick={onNextHand}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    style={{
                                        padding: '10px 24px', borderRadius: 10,
                                        border: isMultiStreetActive
                                            ? '1px solid rgba(251, 146, 60, 0.5)'
                                            : '1px solid rgba(0, 212, 255, 0.4)',
                                        background: isMultiStreetActive
                                            ? 'linear-gradient(180deg, rgba(251, 146, 60, 0.2) 0%, rgba(251, 146, 60, 0.05) 100%)'
                                            : 'linear-gradient(180deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 212, 255, 0.05) 100%)',
                                        color: isMultiStreetActive ? '#fb923c' : '#00d4ff',
                                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                                        letterSpacing: 0.5, fontFamily: "'Inter', -apple-system, sans-serif",
                                    }}
                                >
                                    {isMultiStreetActive ? 'Continue Hand →' : 'Next Hand →'}
                                </motion.button>
                                {!isMultiStreetActive && lastQuestionRef.current && (
                                    <motion.button
                                        onClick={() => {
                                            setRetryActive(true);
                                            setSelectedAnswer(null);
                                            if (onNextHand) onNextHand({ retry: true, retryQuestion: lastQuestionRef.current });
                                        }}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                        whileTap={{ scale: 0.95 }}
                                        style={{
                                            padding: '8px 16px', borderRadius: 8,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: 'rgba(255,255,255,0.03)',
                                            color: '#94a3b8', fontSize: 11, fontWeight: 600,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Retry
                                    </motion.button>
                                )}
                            </>
                        ) : (
                            <motion.div
                                animate={{ opacity: [0.5, 1, 0.5] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                style={{ fontSize: 12, color: '#475569' }}
                            >
                                Next hand in 2s...
                            </motion.div>
                        )}
                    </div>
                </motion.div>
            )}
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
    container: {
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'hidden',
    },

    // ── TOP BAR (replaces old questionBar)
    topBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#1a1a1a',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
    },

    topBarLeft: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    },

    topBarRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    gameTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#e2e8f0',
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },

    contextString: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '500',
    },

    scoreBadge: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 12px',
        borderRadius: 8,
        border: '2px solid #22c55e',
        background: 'rgba(0,0,0,0.3)',
    },

    scoreValue: {
        fontSize: 18,
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
        lineHeight: 1,
    },

    scoreLabel: {
        fontSize: 8,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontWeight: '600',
    },

    questionCounter: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        fontWeight: 'bold',
    },

    // ── QUESTION BAR
    questionBar: {
        padding: '10px 16px',
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },

    questionText: {
        color: '#e2e8f0',
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 1.4,
        flex: 1,
    },

    inlineCard: {
        width: 24,
        height: 34,
        borderRadius: 3,
        verticalAlign: 'middle',
        marginLeft: 3,
        marginRight: 2,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
    },

    streakBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.25), rgba(251, 146, 60, 0.1))',
        padding: '4px 10px',
        borderRadius: 12,
        border: '1px solid rgba(251, 146, 60, 0.4)',
        flexShrink: 0,
    },

    streakText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#fbbf24',
    },

    // ── TABLE AREA
    tableArea: {
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        padding: '20px 20px 10px 20px',
    },

    // ── CSS TABLE — GTO Wizard-style minimalist dark oval outline
    feltOuter: {
        position: 'relative',
        width: '100%',
        maxWidth: 600,
        aspectRatio: '2 / 1.1',
        borderRadius: '50%',
        background: 'transparent',
        margin: '0 auto',
        zIndex: 1,
        overflow: 'visible',
    },
    feltRail: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        border: '2px solid rgba(255, 255, 255, 0.12)',
        pointerEvents: 'none',
        zIndex: 1,
    },
    feltSurface: {
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.02)',
    },

    seatsContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '90%',
        height: '90%',
        zIndex: 2,
        pointerEvents: 'none',
    },

    seat: {
        position: 'absolute',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
    },

    // GTO Wizard-style position circle indicator (no avatar images)
    avatar: {
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#2a2a32',
        border: '2px solid #4a4a55',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 800,
        color: '#94a3b8',
        letterSpacing: 0.5,
        fontFamily: "'Inter', sans-serif",
    },

    dealerButton: {
        position: 'absolute',
        top: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#2a2a32',
        color: '#e2e8f0',
        fontSize: 9,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1.5px solid rgba(255,255,255,0.3)',
        zIndex: 10,
    },

    badge: {
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 'bold',
        color: '#94a3b8',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'center',
        whiteSpace: 'nowrap',
        background: '#2a2a32',
        border: '1px solid #4a4a55',
    },

    badgeLabel: {
        fontSize: 9,
        fontWeight: 700,
    },

    badgeStack: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#e2e8f0',
    },

    heroRow: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
    },

    heroCardsInline: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 3,
    },

    card: {
        width: 56,
        height: 80,
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        border: '2px solid rgba(255,255,255,0.3)',
    },

    boardCards: {
        position: 'absolute',
        top: '38%',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 5,
        zIndex: 3,
    },

    boardCard: {
        width: 60,
        height: 86,
        borderRadius: 6,
        boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
        border: '1px solid rgba(255,255,255,0.15)',
    },

    pot: {
        position: 'absolute',
        top: '24%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#e2e8f0',
        fontSize: 16,
        fontWeight: 800,
        fontFamily: "'Inter', sans-serif",
        zIndex: 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        background: 'transparent',
        padding: 0,
        border: 'none',
    },

    chipIcon: {
        fontSize: 16,
    },

    // GAP-2: SPR + Pot Odds overlays
    potOverlayRow: {
        display: 'flex',
        gap: 6,
        marginTop: 2,
    },

    potOverlayBadge: {
        fontSize: 9,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.06)',
        padding: '1px 6px',
        borderRadius: 4,
        fontWeight: '600',
        letterSpacing: 0.5,
    },

    // GAP-5: Progress bar
    progressBarContainer: {
        height: 3,
        background: 'rgba(255,255,255,0.06)',
        width: '100%',
        flexShrink: 0,
    },

    progressBarFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #00d4ff, #06b6d4)',
        borderRadius: '0 2px 2px 0',
    },

    // GAP-1: Action history strip
    scenarioInfo: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flex: 1,
        gap: 8,
    },

    scenarioLabel: {
        fontSize: 13,
        color: '#94a3b8',
        fontWeight: '500',
    },

    actionHistoryStrip: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexWrap: 'wrap',
    },

    actionHistoryItem: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
    },

    actionHistoryPos: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#00d4ff',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    actionHistoryAction: {
        fontSize: 11,
        color: '#e2e8f0',
        fontWeight: '500',
        textTransform: 'capitalize',
    },

    actionHistorySep: {
        fontSize: 10,
        color: '#64748b',
        margin: '0 2px',
    },

    // GAP-6: Effective stack badge
    effStackBadge: {
        fontSize: 10,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.06)',
        padding: '2px 8px',
        borderRadius: 6,
        fontWeight: '600',
        whiteSpace: 'nowrap',
        flexShrink: 0,
    },

    // GAP-8: Villain card-back images
    villainCardsInline: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },

    villainCard: {
        width: 20,
        height: 28,
        borderRadius: 3,
        opacity: 0.7,
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
    },

    villainActionBubble: {
        position: 'absolute',
        top: '5%',
        right: '8%',
        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
        color: '#fff',
        padding: '5px 12px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 'bold',
        zIndex: 10,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        textAlign: 'center',
        minWidth: 70,
    },

    villainActionHeader: {
        fontSize: 10,
        opacity: 0.85,
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    villainActionText: {
        fontSize: 14,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },

    speechTail: {
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '10px solid #dc2626',
    },

    streetIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#64748b',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 2,
        textTransform: 'uppercase',
        zIndex: 2,
    },

    // ── STATS HUD
    statsHUD: {
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '6px 16px',
        background: 'rgba(0,0,0,0.4)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
    },

    statsHUDItem: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
    },

    statsHUDLabel: {
        fontSize: 9,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '600',
    },

    statsHUDValue: {
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: "'Inter', sans-serif",
    },

    // ── ACTION BAR (GTO Wizard-style flat full-width buttons)
    actionBar: {
        display: 'flex',
        gap: 0,
        padding: '0',
        flexShrink: 0,
    },

    actionButtonWrapper: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },

    actionButton: {
        position: 'relative',
        padding: '16px 6px',
        minHeight: 56,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "'Inter', sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        background: '#2a2a32',
        border: 'none',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 0,
        color: '#e2e8f0',
        cursor: 'pointer',
        transition: 'all 0.12s ease-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        width: '100%',
    },

    actionText: {
        fontSize: 13,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        lineHeight: 1.2,
        textAlign: 'center',
    },

    freqLabel: {
        fontSize: 11,
        opacity: 0.8,
        fontWeight: '600',
    },

    // ── INLINE FEEDBACK (replaces old full-screen overlay)
    feedbackInline: {
        padding: '12px 16px',
        background: 'linear-gradient(180deg, rgba(15,26,46,0.98) 0%, rgba(10,18,32,0.98) 100%)',
        borderTop: '2px solid rgba(0, 212, 255, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        maxHeight: '45vh',
        overflowY: 'auto',
    },

    feedbackTopRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        width: '100%',
        flexWrap: 'wrap',
    },

    classificationBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 24px',
        borderRadius: 24,
        border: '2px solid',
        marginBottom: 16,
        fontSize: 18,
        fontWeight: 'bold',
    },

    classificationIcon: {
        fontSize: 22,
        fontWeight: 'bold',
    },

    classificationLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },

    evLossDisplay: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 14,
        fontSize: 15,
    },

    evLossLabel: {
        color: '#94a3b8',
    },

    evLossValue: {
        color: '#ef4444',
        fontWeight: 'bold',
        fontFamily: "'Orbitron', 'Courier New', monospace",
    },

    feedbackExplanation: {
        fontSize: 12,
        lineHeight: 1.5,
        color: '#cbd5e1',
        textAlign: 'center',
    },
};

export default memo(UniversalDynamicTable);
