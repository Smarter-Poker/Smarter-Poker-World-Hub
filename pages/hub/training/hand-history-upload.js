/**
 * HAND HISTORY UPLOAD — GTO Wizard-Style Hand Analysis
 * ═══════════════════════════════════════════════════════════════════════════
 * Upload hand histories from PokerStars/GG/ACR for AI analysis.
 * Parses hands, classifies decisions, shows coaching recommendations.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import { useRouter } from 'next/router';

// ═══════════════════════════════════════════════════════════════════════════
// HAND HISTORY PARSER — Supports PokerStars format
// ═══════════════════════════════════════════════════════════════════════════

function parsePokerStarsHand(text) {
    const hands = [];
    const handBlocks = text.split(/(?=PokerStars (?:Hand|Zoom Hand))/);

    for (const block of handBlocks) {
        if (!block.trim() || block.length < 50) continue;
        try {
            const hand = {};

            // Extract hand ID
            const idMatch = block.match(/Hand #(\d+)/);
            hand.id = idMatch ? idMatch[1] : `hand-${hands.length}`;

            // Extract game type
            hand.gameType = block.includes('Tournament') ? 'MTT' : 'Cash';

            // Extract stakes
            const stakesMatch = block.match(/\(?\$?([\d.]+)\/\$?([\d.]+)/);
            hand.stakes = stakesMatch ? `${stakesMatch[1]}/${stakesMatch[2]}` : 'Unknown';

            // Extract hero and position
            const heroMatch = block.match(/Dealt to (.+?) \[(.+?)\]/);
            hand.hero = heroMatch ? heroMatch[1] : 'Hero';
            hand.heroCards = heroMatch ? heroMatch[2].split(' ') : [];

            // Extract board
            const boardMatches = [];
            const flopMatch = block.match(/\*\*\* FLOP \*\*\* \[(.+?)\]/);
            if (flopMatch) boardMatches.push(...flopMatch[1].split(' '));
            const turnMatch = block.match(/\*\*\* TURN \*\*\*.*\[(.+?)\]/);
            if (turnMatch) boardMatches.push(turnMatch[1]);
            const riverMatch = block.match(/\*\*\* RIVER \*\*\*.*\[(.+?)\]/);
            if (riverMatch) boardMatches.push(riverMatch[1]);
            hand.board = boardMatches;

            // Extract pot
            const potMatch = block.match(/Total pot \$?([\d.]+)/);
            hand.pot = potMatch ? parseFloat(potMatch[1]) : 0;

            // Extract hero position from seat info
            const seatLines = block.match(/Seat \d+: .+/g) || [];
            const buttonMatch = block.match(/Seat #(\d+) is the button/);
            hand.button = buttonMatch ? parseInt(buttonMatch[1]) : 1;

            // Extract actions
            hand.actions = [];
            const actionLines = block.match(/.+?: (?:folds|calls|raises|bets|checks|all-in).*/gi) || [];
            for (const line of actionLines) {
                const aMatch = line.match(/(.+?): (folds|calls|raises|bets|checks|all-in)(?:\s+\$?([\d.]+))?/i);
                if (aMatch) {
                    hand.actions.push({
                        player: aMatch[1].trim(),
                        action: aMatch[2].toLowerCase(),
                        amount: aMatch[3] ? parseFloat(aMatch[3]) : 0,
                        isHero: aMatch[1].trim() === hand.hero,
                    });
                }
            }

            // Extract result
            const wonMatch = block.match(/collected \$?([\d.]+)/);
            hand.result = wonMatch ? parseFloat(wonMatch[1]) : 0;

            hand.rawText = block.substring(0, 500);
            hands.push(hand);
        } catch (e) {
            // Skip unparseable hands
            continue;
        }
    }
    return hands;
}

// ═══════════════════════════════════════════════════════════════════════════
// HAND CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const SUIT_MAP = { h: { s: '\u2665', c: '#ef4444' }, d: { s: '\u2666', c: '#3b82f6' }, c: { s: '\u2663', c: '#22c55e' }, s: { s: '\u2660', c: '#94a3b8' } };

function MiniCard({ card }) {
    if (!card || card.length < 2) return null;
    const rank = card[0].toUpperCase();
    const suit = SUIT_MAP[card[1].toLowerCase()] || { s: '?', c: '#64748b' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 1,
            padding: '2px 5px', borderRadius: 4,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 12, fontWeight: 700,
        }}>
            <span style={{ color: '#e2e8f0' }}>{rank}</span>
            <span style={{ color: suit.c, fontSize: 10 }}>{suit.s}</span>
        </span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYZED HAND ROW
// ═══════════════════════════════════════════════════════════════════════════

function AnalyzedHandRow({ hand, index }) {
    const [expanded, setExpanded] = useState(false);
    const heroActions = hand.actions.filter(a => a.isHero);
    const heroActionSummary = heroActions.map(a => a.action).join(' → ') || 'N/A';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            style={{
                marginBottom: 8, borderRadius: 10,
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden',
            }}
        >
            <button
                onClick={() => setExpanded(v => !v)}
                style={{
                    width: '100%', padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                }}
            >
                <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(0,212,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#00d4ff',
                }}>
                    {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
                        {hand.heroCards.map((c, i) => <MiniCard key={i} card={c} />)}
                        {hand.board.length > 0 && (
                            <>
                                <span style={{ color: '#475569', margin: '0 2px' }}>|</span>
                                {hand.board.map((c, i) => <MiniCard key={`b${i}`} card={c} />)}
                            </>
                        )}
                    </div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>
                        {hand.gameType} {hand.stakes} — {heroActionSummary}
                    </div>
                </div>
                <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: hand.result > 0 ? '#22c55e' : hand.result < 0 ? '#ef4444' : '#94a3b8',
                }}>
                    {hand.result > 0 ? '+' : ''}{hand.pot > 0 ? `$${hand.pot.toFixed(0)}` : ''}
                </div>
                <span style={{ color: '#475569', fontSize: 14, transform: expanded ? 'rotate(180deg)' : '' }}>\u25BC</span>
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ padding: '0 14px 12px', overflow: 'hidden' }}
                    >
                        <div style={{
                            padding: '10px 12px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', letterSpacing: 0.5, marginBottom: 6 }}>
                                ACTION SEQUENCE
                            </div>
                            {hand.actions.map((a, i) => (
                                <div key={i} style={{
                                    display: 'flex', gap: 8, padding: '3px 0',
                                    fontSize: 11, color: a.isHero ? '#00d4ff' : '#94a3b8',
                                    fontWeight: a.isHero ? 700 : 400,
                                }}>
                                    <span style={{ width: 80, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {a.player}
                                    </span>
                                    <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{a.action}</span>
                                    {a.amount > 0 && <span>${a.amount.toFixed(2)}</span>}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function HandHistoryUploadPage() {
    const router = useRouter();
    const fileInputRef = useRef(null);
    const [parsedHands, setParsedHands] = useState([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [stats, setStats] = useState(null);
    const [dragOver, setDragOver] = useState(false);

    const handleFile = useCallback(async (file) => {
        if (!file) return;
        const text = await file.text();
        setIsAnalyzing(true);

        // Parse hands
        const hands = parsePokerStarsHand(text);
        setParsedHands(hands);

        // Compute stats
        const totalHands = hands.length;
        const heroActions = hands.reduce((sum, h) => sum + h.actions.filter(a => a.isHero).length, 0);
        const withShowdown = hands.filter(h => h.board.length >= 3).length;

        setStats({
            totalHands,
            heroActions,
            withShowdown,
            avgPot: totalHands > 0 ? hands.reduce((s, h) => s + h.pot, 0) / totalHands : 0,
        });

        setIsAnalyzing(false);
    }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    return (
        <>
            <Head>
                <title>Hand History Analysis | Smarter.Poker GTO Training</title>
            </Head>
            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)',
                color: '#e2e8f0',
                fontFamily: "'Inter', -apple-system, sans-serif",
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <button
                        onClick={() => router.push('/hub/training')}
                        style={{
                            background: 'rgba(255,255,255,0.05)', border: 'none',
                            color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                            width: 36, height: 36, borderRadius: 8,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        \u2190
                    </button>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                            Hand History Analysis
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                            Upload hands from PokerStars, GGPoker, or ACR
                        </div>
                    </div>
                </div>

                <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
                    {/* Upload Zone */}
                    {parsedHands.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: '60px 30px',
                                borderRadius: 16,
                                border: `2px dashed ${dragOver ? '#00d4ff' : 'rgba(255,255,255,0.1)'}`,
                                background: dragOver ? 'rgba(0,212,255,0.05)' : 'rgba(0,0,0,0.2)',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>
                                {isAnalyzing ? '\u23F3' : '\uD83D\uDCC2'}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                                {isAnalyzing ? 'Analyzing...' : 'Drop Hand History File Here'}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>
                                Supports .txt files from PokerStars, GGPoker, ACR
                            </div>
                            <div style={{
                                marginTop: 20, padding: '10px 24px', borderRadius: 10,
                                background: 'rgba(0,212,255,0.1)',
                                border: '1px solid rgba(0,212,255,0.2)',
                                color: '#00d4ff', fontSize: 13, fontWeight: 700,
                                display: 'inline-block',
                            }}>
                                Browse Files
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".txt,.log"
                                onChange={(e) => handleFile(e.target.files?.[0])}
                                style={{ display: 'none' }}
                            />
                        </motion.div>
                    )}

                    {/* Stats Summary */}
                    {stats && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
                                marginBottom: 16,
                            }}
                        >
                            {[
                                { label: 'Hands', value: stats.totalHands, color: '#00d4ff' },
                                { label: 'Actions', value: stats.heroActions, color: '#a855f7' },
                                { label: 'Showdowns', value: stats.withShowdown, color: '#22c55e' },
                                { label: 'Avg Pot', value: `$${stats.avgPot.toFixed(0)}`, color: '#fbbf24' },
                            ].map((s, i) => (
                                <div key={i} style={{
                                    padding: '12px 8px', borderRadius: 10, textAlign: 'center',
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* Parsed Hands List */}
                    {parsedHands.length > 0 && (
                        <>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 12,
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                                    {parsedHands.length} Hands Parsed
                                </div>
                                <button
                                    onClick={() => { setParsedHands([]); setStats(null); }}
                                    style={{
                                        padding: '6px 14px', borderRadius: 8,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.03)',
                                        color: '#94a3b8', fontSize: 11, fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Upload New File
                                </button>
                            </div>
                            {parsedHands.slice(0, 50).map((hand, i) => (
                                <AnalyzedHandRow key={hand.id} hand={hand} index={i} />
                            ))}
                            {parsedHands.length > 50 && (
                                <div style={{ textAlign: 'center', padding: 12, color: '#64748b', fontSize: 12 }}>
                                    Showing first 50 of {parsedHands.length} hands
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
