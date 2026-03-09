/**
 * GTO NEWS FEED — Strategy Tips & Articles
 * ═══════════════════════════════════════════════════════════════════════════
 * Curated GTO tips and strategy content with category filters.
 *
 * Route: /hub/training/gto-news
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

const ARTICLES = [
    { id: 1, cat: 'Preflop', title: 'Why 2.5x Is the Standard Open Size', body: 'Using a consistent 2.5x open raise prevents opponents from exploiting sizing tells. Larger opens from EP are outdated — they risk more for the same result. A 2.5x open gives you better pot odds on steals and keeps your range disguised.', date: '2026-03-09' },
    { id: 2, cat: 'Postflop', title: 'Small C-Bet Strategy on Dry Boards', body: 'On boards like K♣7♦2♠, betting 33% pot at high frequency is optimal. Your range advantage as the preflop raiser means you can bet often with a small size. Villain must fold many hands that missed, and calling with marginal hands is unprofitable.', date: '2026-03-08' },
    { id: 3, cat: 'Math', title: 'Understanding MDF in Practice', body: 'If villain bets 75% pot, MDF = 1 - (0.75/1.75) = 57%. You must continue with 57% of your range. Folding more lets villain auto-profit with any two cards. Continuing less means you\'re exploitable.', date: '2026-03-07' },
    { id: 4, cat: 'Mental', title: 'The 3-Second Rule for Tilt Prevention', body: 'After a bad beat, pause for 3 seconds before acting on the next hand. This microreset prevents impulsive plays driven by frustration. Professional players use breathing pauses between every decision — not just after losses.', date: '2026-03-06' },
    { id: 5, cat: 'Preflop', title: '3-Betting Polarized vs Linear', body: 'Polarized 3-bet ranges (AA-QQ, AKs + bluffs like A5s-A2s) work best against tight openers. Linear ranges (AA down to JTs, AQo) work better against loose openers where you want to play for value with medium-strong hands.', date: '2026-03-05' },
    { id: 6, cat: 'Postflop', title: 'Turn Overbets: When and Why', body: 'Overbet the turn when the card significantly favors your range. Example: You raised preflop, c-bet a K♠8♦3♥ flop, then an A♣ hits the turn. The Ace heavily favors your range. A 125-150% pot overbet extracts max value and puts pressure on capped ranges.', date: '2026-03-04' },
    { id: 7, cat: 'Math', title: 'Breakeven Bluff Math Made Simple', body: 'For any bluff: Breakeven% = Risk / (Risk + Reward). Pot is $100, you bet $50: Breakeven = 50/150 = 33%. Villain only needs to fold 33% of the time for your bluff to profit. The larger you bet, the more folds you need.', date: '2026-03-03' },
    { id: 8, cat: 'Mental', title: 'Pre-Session Warmup Routines', body: 'Top players spend 5-10 minutes reviewing their weakest spots before each session. Review 3 hands from your last session, do 10 flashcards, or run a quick warmup drill. This primes your brain for pattern recognition and reduces autopilot play.', date: '2026-03-02' },
    { id: 9, cat: 'Postflop', title: 'Check-Raising the Flop as the BB', body: 'The BB should check-raise on flops that favor their range (low connected boards like 7♠6♥5♣). Use a mix of strong hands (sets, two pair) and draws (open-enders, flush draws) to stay balanced.', date: '2026-03-01' },
    { id: 10, cat: 'Preflop', title: 'BTN vs Blinds: The Most Common Spot', body: 'The BTN should open ~45% of hands. SB should 3-bet ~12% and fold the rest (no flatting in many strategies). BB should defend wide — calling ~35% and 3-betting ~10%. This is the most fought-over pot in poker.', date: '2026-02-28' },
    { id: 11, cat: 'Math', title: 'Combo Counting: Your Secret Weapon', body: 'There are 1,326 total starting hand combos. Pocket pairs: 6 combos each. Suited hands: 4 each. Offsuit: 12 each. When villain 4-bets, they might have AA(6)+KK(6)+AKs(4) = 16 combos. Knowing exact combos helps you calculate equity accurately.', date: '2026-02-27' },
    { id: 12, cat: 'Mental', title: 'Bankroll Management for Training', body: 'Set a daily training time limit, not just a hand target. Quality degrades after 45-60 minutes for most players. Two 30-minute focused sessions beat one 90-minute unfocused grind. Track your accuracy by session to find your optimal duration.', date: '2026-02-26' },
    { id: 13, cat: 'Postflop', title: 'River Bluff Selection: Use Blockers', body: 'The best river bluffs block your opponent\'s calling range. Holding A♠ on a spade board blocks nut flushes (they can\'t have the nut flush if you hold the A♠). This means more of villain\'s range is medium-strength hands that can fold.', date: '2026-02-25' },
    { id: 14, cat: 'Preflop', title: 'Defending Your Big Blind Profitably', body: 'The BB gets the best pot odds to call preflop. Against a 2.5x open, you only need 28% equity to call. This means defending with a wide range of suited hands, connectors, and even hands like K4s, Q7s from the BB is often correct.', date: '2026-02-24' },
    { id: 15, cat: 'Math', title: 'SPR Guide: Stack-to-Pot Ratio', body: 'SPR < 3: Commit with top pair+. SPR 3-7: Top pair is a call, not a raise. SPR > 10: Deep stack play — sets and draws become premium, top pair is a thin value hand. Always calculate SPR after the flop to guide your commitment decisions.', date: '2026-02-23' },
];

const CATS = ['All', 'Preflop', 'Postflop', 'Math', 'Mental'];
const CAT_ICONS = { Preflop: '🃏', Postflop: '🎯', Math: '🧮', Mental: '🧠' };
const CAT_COLORS = { Preflop: '#3b82f6', Postflop: '#22c55e', Math: '#fbbf24', Mental: '#a855f7' };

export default function GtoNewsPage() {
    const router = useRouter();
    useTrainingBus('gto-news');
    const [catFilter, setCatFilter] = useState('All');
    const [bookmarks, setBookmarks] = useState(new Set());
    const [expanded, setExpanded] = useState(null);

    useEffect(() => {
        try { const saved = localStorage.getItem('gto-news-bookmarks'); if (saved) setBookmarks(new Set(JSON.parse(saved))); } catch { }
    }, []);

    useEffect(() => {
        const h = () => { };
        window.addEventListener('training:session-complete', h);
        return () => window.removeEventListener('training:session-complete', h);
    }, []);

    const toggleBookmark = (id) => {
        const next = new Set(bookmarks);
        next.has(id) ? next.delete(id) : next.add(id);
        setBookmarks(next);
        try { localStorage.setItem('gto-news-bookmarks', JSON.stringify([...next])); } catch { }
    };

    const filtered = ARTICLES.filter(a => catFilter === 'All' || a.cat === catFilter);

    return (
        <>
            <Head><title>GTO News | Smarter.Poker Training</title></Head>
            <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', color: '#e2e8f0', fontFamily: "'Inter', -apple-system, sans-serif" }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                    <div><div style={{ fontSize: 16, fontWeight: 700 }}>GTO News</div><div style={{ fontSize: 11, color: '#64748b' }}>Strategy tips & insights</div></div>
                </div>
                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                        {CATS.map(c => (
                            <motion.button key={c} whileTap={{ scale: 0.95 }} onClick={() => setCatFilter(c)}
                                style={{ flex: 1, padding: '6px', borderRadius: 6, border: `1px solid ${catFilter === c ? 'rgba(0,212,255,0.2)' : 'transparent'}`, background: catFilter === c ? 'rgba(0,212,255,0.06)' : 'transparent', color: catFilter === c ? '#00d4ff' : '#64748b', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                {c}
                            </motion.button>
                        ))}
                    </div>
                    {filtered.map((a, i) => (
                        <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                            style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                            onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 14 }}>{CAT_ICONS[a.cat]}</span>
                                    <span style={{ padding: '1px 6px', borderRadius: 3, background: `${CAT_COLORS[a.cat]}12`, color: CAT_COLORS[a.cat], fontSize: 8, fontWeight: 700 }}>{a.cat}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span style={{ fontSize: 9, color: '#334155' }}>{a.date}</span>
                                    <motion.button whileTap={{ scale: 0.8 }} onClick={(e) => { e.stopPropagation(); toggleBookmark(a.id); }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0 }}>
                                        {bookmarks.has(a.id) ? '⭐' : '☆'}
                                    </motion.button>
                                </div>
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: expanded === a.id ? 8 : 0 }}>{a.title}</div>
                            {expanded === a.id && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7, paddingTop: 4 }}>
                                    {a.body}
                                </motion.div>
                            )}
                        </motion.div>
                    ))}
                </div>
            </div>
        </>
    );
}
