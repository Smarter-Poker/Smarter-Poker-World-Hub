/**
 * GTO GLOSSARY — Reference Tool
 * ═══════════════════════════════════════════════════════════════════════════
 * Searchable glossary of 50+ GTO/poker terms with definitions.
 *
 * Route: /hub/training/glossary
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType } from '../../../src/engine/EventBus';

const TERMS = [
    { term: '3-Bet', cat: 'Preflop', def: 'A re-raise over an initial raise (the blinds being the first bet, the open being the second).' },
    { term: '4-Bet', cat: 'Preflop', def: 'A re-raise over a 3-bet. Usually committed to the pot at this point.' },
    { term: 'Backdoor Draw', cat: 'Postflop', def: 'A draw needing two more cards to complete (e.g., needing both turn and river to make a flush).' },
    { term: 'Barrel', cat: 'Postflop', def: 'A continuation bet on a subsequent street. Double barrel = flop + turn. Triple barrel = flop + turn + river.' },
    { term: 'Blocker', cat: 'Theory', def: 'A card in your hand that reduces the number of combos of a specific hand in your opponent\'s range.' },
    { term: 'Board Texture', cat: 'Postflop', def: 'The characteristics of community cards — dry (disconnected), wet (draw-heavy), monotone (single suit).' },
    { term: 'C-Bet', cat: 'Postflop', def: 'Continuation bet — a bet by the preflop aggressor on the flop.' },
    { term: 'Cold Call', cat: 'Preflop', def: 'Calling an open raise without having previously put money in the pot (excluding blinds).' },
    { term: 'Combo', cat: 'Math', def: 'A specific card combination. Pocket pairs have 6 combos, suited hands 4, offsuit hands 12.' },
    { term: 'Donk Bet', cat: 'Postflop', def: 'A bet from the OOP player into the preflop aggressor. Rarely correct in GTO play.' },
    { term: 'EV (Expected Value)', cat: 'Math', def: 'The average profit/loss of a decision over infinite repetitions. EV = (Win% × $Won) - (Lose% × $Lost).' },
    { term: 'Equity', cat: 'Math', def: 'Your share of the pot based on the probability of winning the hand at showdown.' },
    { term: 'Exploitative', cat: 'Theory', def: 'A strategy that deviates from GTO to maximize EV against specific opponent tendencies.' },
    { term: 'Fold Equity', cat: 'Theory', def: 'The value gained from the possibility that your opponent will fold to your bet or raise.' },
    { term: 'Frequency', cat: 'Theory', def: 'How often you take a specific action (e.g., c-bet frequency of 65% means you bet 65% of the time).' },
    { term: 'GTO', cat: 'Theory', def: 'Game Theory Optimal — a mathematically unexploitable strategy based on Nash Equilibrium.' },
    { term: 'ICM', cat: 'Math', def: 'Independent Chip Model — converts tournament chip stacks to real-money equity based on prize structure.' },
    { term: 'Implied Odds', cat: 'Math', def: 'Future money you expect to win on later streets if you hit your draw, beyond current pot odds.' },
    { term: 'In Position (IP)', cat: 'Theory', def: 'Acting after your opponent postflop. Significant strategic advantage due to additional information.' },
    { term: 'Isolation Raise', cat: 'Preflop', def: 'A raise designed to play heads-up against a weak player who limped.' },
    { term: 'Linear Range', cat: 'Theory', def: 'A range of hands ordered by strength — top pairs through medium pairs, no pure bluffs. Also called merged.' },
    { term: 'MDF', cat: 'Math', def: 'Minimum Defense Frequency — the minimum % of your range you must continue with to prevent villain from auto-profiting with bluffs.' },
    { term: 'Mixed Strategy', cat: 'Theory', def: 'Taking different actions with the same hand at different frequencies (e.g., bet 60%, check 40%).' },
    { term: 'Nash Equilibrium', cat: 'Theory', def: 'A state where no player can improve their EV by changing strategy unilaterally.' },
    { term: 'Nodelocking', cat: 'Theory', def: 'Fixing one player\'s strategy at a decision point to see how the optimal counter-strategy changes.' },
    { term: 'Nut Advantage', cat: 'Theory', def: 'When one player\'s range contains more of the strongest possible hands on a given board.' },
    { term: 'OOP', cat: 'Theory', def: 'Out of Position — acting first postflop. Disadvantaged due to less information.' },
    { term: 'Overbet', cat: 'Postflop', def: 'A bet larger than the pot. Used when you have a polarized range and nut advantage.' },
    { term: 'Outs', cat: 'Math', def: 'Cards remaining in the deck that will improve your hand to likely win. Flush draw = 9 outs.' },
    { term: 'Polarized Range', cat: 'Theory', def: 'A range divided into very strong hands (value) and weak hands (bluffs), with no medium hands.' },
    { term: 'Pot Odds', cat: 'Math', def: 'The ratio of the current bet to the total pot. Determines the minimum equity needed to call profitably.' },
    { term: 'Probe Bet', cat: 'Postflop', def: 'A bet by the OOP player on a new street after the IP player checked back the previous street.' },
    { term: 'Range', cat: 'Theory', def: 'The complete set of hands a player could have in a given situation based on prior actions.' },
    { term: 'Range Advantage', cat: 'Theory', def: 'When your range is stronger overall than your opponent\'s on a specific board texture.' },
    { term: 'Reverse Implied Odds', cat: 'Math', def: 'Future money you expect to LOSE when you make your hand but opponent has a better hand.' },
    { term: 'RFI', cat: 'Preflop', def: 'Raise First In — the first voluntary open raise when action folds to you.' },
    { term: 'Semi-Bluff', cat: 'Postflop', def: 'A bet with a hand that isn\'t the best currently but has outs to improve (e.g., flush draw).' },
    { term: 'Sizing Tell', cat: 'Theory', def: 'When bet sizing leaks information about hand strength. GTO uses consistent sizings to prevent this.' },
    { term: 'Slow Play', cat: 'Postflop', def: 'Checking or calling with a strong hand to disguise its strength. Risky in multiway pots.' },
    { term: 'SPR', cat: 'Math', def: 'Stack-to-Pot Ratio = Effective Stack / Pot. Low SPR (<3) = committed, High SPR (>10) = deep play.' },
    { term: 'Squeeze', cat: 'Preflop', def: 'A 3-bet after an open raise AND a cold call, putting pressure on both players.' },
    { term: 'Thin Value Bet', cat: 'Postflop', def: 'A bet with a marginally strong hand that expects to be called by slightly worse hands.' },
    { term: 'Tilt', cat: 'Theory', def: 'Emotional state causing suboptimal play due to frustration, overconfidence, or external factors.' },
    { term: 'Trap', cat: 'Postflop', def: 'Check-calling or slow-playing a monster hand to induce bets from opponents.' },
    { term: 'Under-defense', cat: 'Theory', def: 'Folding too often to bets, allowing opponent to profit with any bluff.' },
    { term: 'Value Bet', cat: 'Postflop', def: 'A bet made with the expectation that worse hands will call.' },
    { term: 'Variance', cat: 'Math', def: 'Statistical measure of deviation from expected results. High variance = bigger swings in results.' },
    { term: 'Villain', cat: 'Theory', def: 'Your opponent in a hand (poker slang).' },
    { term: 'VPIP', cat: 'Math', def: 'Voluntarily Put In Pot — % of hands a player enters the pot with a call or raise.' },
    { term: 'Wet Board', cat: 'Postflop', def: 'A board with many draw possibilities (e.g., J♠T♥9♦ — straights, T♥9♥8♥ — flush + straight).' },
];

const CATS = ['All', 'Preflop', 'Postflop', 'Math', 'Theory'];
const CAT_COLORS = { Preflop: '#3b82f6', Postflop: '#22c55e', Math: '#fbbf24', Theory: '#a855f7' };

export default function GlossaryPage() {
    const router = useRouter();
    useTrainingBus('glossary');
    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('All');
    const [expanded, setExpanded] = useState(null);
    const [favorites, setFavorites] = useState(new Set());

    // Load favorites
    useEffect(() => {
        try {
            const saved = localStorage.getItem('glossary-favorites');
            if (saved) setFavorites(new Set(JSON.parse(saved)));
        } catch { }
    }, []);

    // EventBus listener
    useEffect(() => {
        const unsub = eventBus.on(EventType.SESSION_END, (e) => {
            if (e?.source === 'Glossary') return;
        });
        return unsub;
    }, []);

    const toggleFavorite = (term) => {
        const next = new Set(favorites);
        next.has(term) ? next.delete(term) : next.add(term);
        setFavorites(next);
        try { localStorage.setItem('glossary-favorites', JSON.stringify([...next])); } catch { }
    };

    const filtered = TERMS.filter(t => {
        if (catFilter !== 'All' && t.cat !== catFilter) return false;
        if (search && !t.term.toLowerCase().includes(search.toLowerCase()) && !t.def.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <>
            <Head><title>GTO Glossary | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700 }}>GTO Glossary</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{TERMS.length} terms · {favorites.size} saved</div>
                    </div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {/* Search */}
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search terms..."
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, marginBottom: 12, fontFamily: 'Inter, sans-serif' }} />

                    {/* Category */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                        {CATS.map(c => (
                            <motion.button key={c} whileTap={{ scale: 0.95 }} onClick={() => setCatFilter(c)}
                                style={{ flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent', color: catFilter === c ? '#00d4ff' : '#64748b', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                {c}
                            </motion.button>
                        ))}
                    </div>

                    {/* Results count */}
                    <div style={{ fontSize: 10, color: '#475569', marginBottom: 10, paddingLeft: 4 }}>{filtered.length} terms</div>

                    {/* Terms */}
                    {filtered.map((t, i) => (
                        <motion.div key={t.term} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                            onClick={() => setExpanded(expanded === t.term ? null : t.term)}
                            style={{ padding: '12px 14px', borderRadius: 10, marginBottom: 4, background: 'rgba(0,0,0,0.15)', border: `1px solid ${favorites.has(t.term) ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)'}`, cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', flex: 1 }}>{t.term}</span>
                                <span style={{ padding: '1px 6px', borderRadius: 3, background: `${CAT_COLORS[t.cat]}12`, color: CAT_COLORS[t.cat], fontSize: 8, fontWeight: 700 }}>{t.cat}</span>
                                <motion.button whileTap={{ scale: 0.8 }} onClick={(e) => { e.stopPropagation(); toggleFavorite(t.term); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, color: favorites.has(t.term) ? '#fbbf24' : '#334155' }}>
                                    {favorites.has(t.term) ? '★' : '☆'}
                                </motion.button>
                            </div>
                            {expanded === t.term ? (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, marginTop: 6 }}>{t.def}</div>
                                </motion.div>
                            ) : (
                                <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.4, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.def}</div>
                            )}
                        </motion.div>
                    ))}

                    {filtered.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                            <div style={{ fontSize: 14, fontWeight: 600 }}>No matching terms</div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
