/**
 * GTO FLASHCARDS — Spaced Repetition Review
 * ═══════════════════════════════════════════════════════════════════════════
 * Swipeable card deck with GTO concepts. "Got It" / "Review Again"
 * for spaced-repetition scheduling.
 *
 * Route: /hub/training/flashcards
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const CARDS = [
    { id: 1, cat: 'Preflop', q: 'What is the standard open raise size from any position?', a: '2.5x the big blind (2.5BB). Larger sizes from EP are outdated.' },
    { id: 2, cat: 'Preflop', q: 'What does "RFI" stand for?', a: 'Raise First In — you are the first player to voluntarily enter the pot with a raise.' },
    { id: 3, cat: 'Preflop', q: 'Which position has the tightest opening range?', a: 'UTG (Under The Gun). Typically opens ~15% of hands in 6-max.' },
    { id: 4, cat: 'Preflop', q: 'What is a 3-bet?', a: 'A re-raise over an initial raise. The blinds count as the first "bet", the open raise is the second.' },
    { id: 5, cat: 'Math', q: 'What pot odds do you need to call a half-pot bet?', a: '25% equity (risk $0.50 to win $1.50 total = 0.5/2.0 = 25%).' },
    { id: 6, cat: 'Math', q: 'What is MDF (Minimum Defense Frequency)?', a: '1 - (bet size / (pot + bet size)). The minimum frequency you must defend to prevent villain from auto-profiting.' },
    { id: 7, cat: 'Math', q: 'What is the Rule of 2 and 4?', a: 'Multiply outs by 2 on the flop (1 card) or 4 (2 cards) for approximate equity percentage.' },
    { id: 8, cat: 'Postflop', q: 'What is SPR?', a: 'Stack-to-Pot Ratio = Effective Stack / Pot Size. Low SPR (<3) favors commitment, high SPR (>10) favors drawing hands.' },
    { id: 9, cat: 'Postflop', q: 'When should you c-bet at a high frequency?', a: 'On dry, disconnected boards (e.g., K-7-2 rainbow) where the preflop raiser has a range advantage.' },
    { id: 10, cat: 'Postflop', q: 'What does "range advantage" mean?', a: 'When your range of possible hands is stronger than your opponent\'s on a given board texture.' },
    { id: 11, cat: 'Theory', q: 'What is a polarized range?', a: 'A range containing only very strong hands (value) and bluffs, with no medium-strength hands.' },
    { id: 12, cat: 'Theory', q: 'What is a merged (linear) range?', a: 'A range of strong to medium-strength hands betting for value, without pure bluffs.' },
    { id: 13, cat: 'Theory', q: 'What is a balanced strategy?', a: 'A strategy that is unexploitable — opponent cannot gain EV by adjusting their strategy against it.' },
    { id: 14, cat: 'Theory', q: 'What does GTO stand for?', a: 'Game Theory Optimal — a strategy based on Nash Equilibrium that cannot be exploited.' },
    { id: 15, cat: 'Postflop', q: 'What is a blocking bet?', a: 'A small bet designed to prevent your opponent from making a larger bet. Generally -EV in GTO play.' },
    { id: 16, cat: 'Math', q: 'How many combos of unpaired hands are there?', a: '16 total: 4 suited + 12 offsuit.' },
    { id: 17, cat: 'Math', q: 'How many combos of a pocket pair are there?', a: '6 combos (e.g., AA: AsAh, AsAd, AsAc, AhAd, AhAc, AdAc).' },
    { id: 18, cat: 'Preflop', q: 'What is the standard 3-bet size in position?', a: '3x the open raise size. OOP, use 3.5-4x.' },
    { id: 19, cat: 'Postflop', q: 'What are the 3 common bet sizes in GTO?', a: '33% pot (small), 66-75% pot (medium), 100%+ pot (large/overbet).' },
    { id: 20, cat: 'Theory', q: 'What is ICM?', a: 'Independent Chip Model — converts tournament chips to real-money equity based on payout structure.' },
    { id: 21, cat: 'Preflop', q: 'What is a squeeze play?', a: 'A 3-bet made after an open raise AND a cold call, squeezing both players.' },
    { id: 22, cat: 'Postflop', q: 'What is a donk bet?', a: 'A bet from the out-of-position player into the preflop aggressor. Rarely correct in GTO.' },
    { id: 23, cat: 'Theory', q: 'What is a node in a game tree?', a: 'A decision point where a player must choose an action (bet, check, fold, etc.).' },
    { id: 24, cat: 'Math', q: 'What equity does top pair typically have vs a flush draw on the flop?', a: 'Approximately 65% vs 35% (flush draw has ~9 outs = ~35% to complete by river).' },
    { id: 25, cat: 'Postflop', q: 'When should you use an overbet?', a: 'On turns/rivers that heavily favor your range (nut advantage), especially with polarized hands.' },
    { id: 26, cat: 'Theory', q: 'What is nodelocking?', a: 'Fixing an opponent\'s strategy at a specific node to see how the GTO solution changes for the other player.' },
    { id: 27, cat: 'Preflop', q: 'What is the BTN opening range in 6-max?', a: 'Approximately 45-50% of hands — the widest opening range at the table.' },
    { id: 28, cat: 'Math', q: 'What is the breakeven percentage for a pot-sized bluff?', a: '50%. You risk the pot to win the pot: pot / (pot + pot) = 50%.' },
    { id: 29, cat: 'Math', q: 'How do you calculate EV?', a: 'EV = (Win% × $ Won) - (Lose% × $ Lost). Positive EV = profitable long-term.' },
    { id: 30, cat: 'Theory', q: 'What is an exploitative adjustment?', a: 'Deviating from GTO to target a specific opponent\'s mistakes for higher EV.' },
];

const CAT_COLORS = { Preflop: '#3b82f6', Postflop: '#22c55e', Math: '#fbbf24', Theory: '#a855f7' };

export default function FlashcardsPage() {
    const router = useRouter();
    useTrainingBus('flashcards');
    const [deck, setDeck] = useState([]);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [mastered, setMastered] = useState(new Set());
    const [catFilter, setCatFilter] = useState('all');

    useEffect(() => {
        try {
            const saved = localStorage.getItem('flashcard-mastered');
            if (saved) setMastered(new Set(JSON.parse(saved)));
        } catch { }
    }, []);

    useEffect(() => {
        const filtered = catFilter === 'all' ? CARDS : CARDS.filter(c => c.cat === catFilter);
        setDeck(filtered);
        setCurrentIdx(0);
        setFlipped(false);
    }, [catFilter]);

    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, () => { });
        return unsub;
    }, []);

    const current = deck[currentIdx];
    const progress = deck.length > 0 ? Math.round(((currentIdx + 1) / deck.length) * 100) : 0;
    const masteredCount = deck.filter(c => mastered.has(c.id)).length;

    const handleGotIt = () => {
        if (current) {
            const next = new Set(mastered);
            next.add(current.id);
            setMastered(next);
            try { localStorage.setItem('flashcard-mastered', JSON.stringify([...next])); } catch { }
        }
        advance();
    };

    const handleReview = () => advance();

    const advance = () => {
        setFlipped(false);
        if (currentIdx < deck.length - 1) setCurrentIdx(currentIdx + 1);
        else setCurrentIdx(0);
    };

    return (
        <>
            <Head><title>Flashcards | Smarter.Poker GTO Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>GTO Flashcards</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>Spaced repetition review</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b' }}>{masteredCount}/{deck.length} mastered</div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 500, margin: '0 auto' }}>
                    {/* Category Filter */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                        {['all', 'Preflop', 'Postflop', 'Math', 'Theory'].map(c => (
                            <motion.button key={c} whileTap={{ scale: 0.95 }} onClick={() => setCatFilter(c)}
                                style={{ flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent', color: catFilter === c ? '#00d4ff' : '#64748b', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                {c === 'all' ? 'All' : c}
                            </motion.button>
                        ))}
                    </div>

                    {/* Progress */}
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.05)', marginBottom: 20, overflow: 'hidden' }}>
                        <motion.div animate={{ width: `${progress}%` }} style={{ height: '100%', background: 'linear-gradient(90deg, #00d4ff, #a855f7)', borderRadius: 2 }} />
                    </div>

                    {/* Card */}
                    {current && (
                        <AnimatePresence mode="wait">
                            <motion.div key={`${currentIdx}-${flipped}`} initial={{ opacity: 0, rotateY: flipped ? 180 : 0 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                                onClick={() => setFlipped(!flipped)}
                                style={{ minHeight: 220, padding: '28px 24px', borderRadius: 18, cursor: 'pointer', background: flipped ? 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))' : 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(139,92,246,0.04))', border: `1px solid ${flipped ? 'rgba(34,197,94,0.15)' : 'rgba(0,212,255,0.12)'}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 4, background: `${CAT_COLORS[current.cat] || '#64748b'}15`, color: CAT_COLORS[current.cat] || '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{current.cat}</span>
                                    <span style={{ fontSize: 10, color: '#475569' }}>{currentIdx + 1}/{deck.length}</span>
                                </div>
                                {!flipped ? (
                                    <>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.5, marginBottom: 16 }}>{current.q}</div>
                                        <div style={{ fontSize: 11, color: '#475569', textAlign: 'center' }}>Tap to reveal answer</div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>{current.a}</div>
                                )}
                                {mastered.has(current.id) && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 8 }}>✅ Mastered</div>}
                            </motion.div>
                        </AnimatePresence>
                    )}

                    {/* Buttons */}
                    {current && flipped && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <motion.button whileTap={{ scale: 0.96 }} onClick={handleReview}
                                style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                Review Again
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.96 }} onClick={handleGotIt}
                                style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                Got It ✓
                            </motion.button>
                        </div>
                    )}

                    {deck.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>No cards in this category</div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
