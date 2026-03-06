/**
 * Sandbox Sub-Components
 * - RangeMatrix (13x13 heatmap)
 * - FrequencyBar (animated action bar)
 * - BoardTextureHUD (auto-classify boards)
 * - ActionHistoryBuilder
 * - SizingSensitivity
 * - TreeVisualization
 * - OnboardingTour
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const BET_ACTIONS = [
    { id: 'fold', label: 'Fold' }, { id: 'check', label: 'Check' },
    { id: 'call', label: 'Call' }, { id: 'bet_33', label: 'Bet 33%' },
    { id: 'bet_50', label: 'Bet 50%' }, { id: 'bet_66', label: 'Bet 66%' },
    { id: 'bet_100', label: 'Bet Pot' }, { id: 'raise', label: 'Raise' },
    { id: 'allin', label: 'All-In' },
];

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR
// ═══════════════════════════════════════════════════════════════════════════
export function FrequencyBar({ action, isOptimal }) {
    return (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#94a3b8', fontSize: '13px',
                    fontWeight: isOptimal ? '700' : '500', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                    {isOptimal && <span style={{ color: '#22c55e', fontSize: '10px' }}>★</span>}
                    {action.label}
                </span>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#cbd5e1', fontSize: '13px',
                    fontWeight: '700', fontFamily: "'Orbitron', monospace",
                }}>
                    {action.frequency}%
                </span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }} animate={{ width: `${action.frequency}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: '4px',
                        background: isOptimal
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : `linear-gradient(90deg, ${action.color || '#3b82f6'}, ${action.color || '#3b82f6'}88)`,
                    }}
                />
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RANGE MATRIX (13x13)
// ═══════════════════════════════════════════════════════════════════════════
export function RangeMatrix({ rangeHeatmap, selectedAction }) {
    const [hoveredHand, setHoveredHand] = useState(null);
    if (!rangeHeatmap?.data) return null;
    const actionId = selectedAction || rangeHeatmap.actions?.[0]?.id;

    const getHandKey = (row, col) => {
        if (row === col) return `${RANKS[row]}${RANKS[col]}`;
        if (col > row) return `${RANKS[row]}${RANKS[col]}s`;
        return `${RANKS[col]}${RANKS[row]}o`;
    };
    const getColor = (freq) => {
        if (freq == null) return 'rgba(255,255,255,0.03)';
        if (freq >= 90) return '#22c55e'; if (freq >= 70) return '#4ade80';
        if (freq >= 50) return '#86efac'; if (freq >= 30) return '#fbbf24';
        if (freq >= 15) return '#f97316'; if (freq > 0) return '#ef4444';
        return 'rgba(255,255,255,0.03)';
    };

    return (
        <div style={{ position: 'relative' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '1px',
                background: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', padding: '1px',
            }}>
                {RANKS.map((_, row) => RANKS.map((_, col) => {
                    const hk = getHandKey(row, col);
                    const freq = rangeHeatmap.data[hk]?.[actionId] ?? null;
                    return (
                        <div key={`${row}-${col}`}
                            onMouseEnter={() => setHoveredHand(hk)} onMouseLeave={() => setHoveredHand(null)}
                            style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '9px', fontWeight: '600', color: freq > 50 ? '#000' : '#e2e8f0',
                                background: getColor(freq), cursor: 'pointer', transition: 'all 0.15s',
                                opacity: hoveredHand === hk ? 1 : 0.85,
                                border: hoveredHand === hk ? '1px solid #fff' : '1px solid transparent',
                            }}
                        >{hk}</div>
                    );
                }))}
            </div>
            {hoveredHand && rangeHeatmap.data[hoveredHand] && (
                <div style={{
                    position: 'absolute', bottom: -55, left: '50%', transform: 'translateX(-50%)',
                    background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px', padding: '6px 10px', zIndex: 10, whiteSpace: 'nowrap', fontSize: '11px', color: '#e2e8f0',
                }}>
                    <strong>{hoveredHand}</strong>
                    {rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <span key={a.id} style={{ marginLeft: '8px', color: a.id === actionId ? '#22c55e' : '#94a3b8' }}>
                            {a.label}: {rangeHeatmap.data[hoveredHand][a.id] ?? 0}%
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD TEXTURE HUD
// ═══════════════════════════════════════════════════════════════════════════
export function classifyBoardTexture(board) {
    const flop = board?.flop || [];
    if (flop.length < 3) return null;
    const suits = flop.map(c => c?.[1]);
    const ranks = flop.map(c => {
        const r = c?.[0]; const order = 'AKQJT98765432';
        return order.indexOf(r);
    }).sort((a, b) => a - b);

    const isMonotone = suits[0] === suits[1] && suits[1] === suits[2];
    const isTwoTone = !isMonotone && (suits[0] === suits[1] || suits[1] === suits[2] || suits[0] === suits[2]);
    const isRainbow = !isMonotone && !isTwoTone;
    const isPaired = ranks[0] === ranks[1] || ranks[1] === ranks[2];
    const isTrips = ranks[0] === ranks[1] && ranks[1] === ranks[2];
    const gap = ranks[2] - ranks[0];
    const isConnected = gap <= 4 && !isPaired;
    const isHighBoard = ranks[0] <= 4; // A=0,K=1,Q=2,J=3,T=4
    const isDry = isRainbow && !isConnected && !isPaired && gap >= 6;
    const isWet = (isMonotone || isTwoTone) && isConnected;

    let label, color, textColor, strategy;
    if (isTrips) { label = '3-OF-A-KIND BOARD'; color = 'rgba(236,72,153,0.2)'; textColor = '#f472b6'; strategy = 'Very dry — high c-bet frequency, small sizing'; }
    else if (isMonotone) { label = 'MONOTONE'; color = 'rgba(239,68,68,0.2)'; textColor = '#fca5a5'; strategy = 'Flush-heavy board — reduce c-bet freq, check more with non-flush hands'; }
    else if (isWet) { label = 'WET / CONNECTED'; color = 'rgba(251,191,36,0.2)'; textColor = '#fde68a'; strategy = 'Many draws possible — polarize bet sizing, protect strong hands'; }
    else if (isDry) { label = 'DRY'; color = 'rgba(34,197,94,0.2)'; textColor = '#86efac'; strategy = 'Few draws — high c-bet frequency, use small sizing (25-33%)'; }
    else if (isPaired) { label = 'PAIRED'; color = 'rgba(139,92,246,0.2)'; textColor = '#c4b5fd'; strategy = 'Paired boards favor preflop raiser — c-bet with high frequency'; }
    else if (isHighBoard) { label = 'HIGH CARDS'; color = 'rgba(59,130,246,0.2)'; textColor = '#93c5fd'; strategy = 'Favors the in-position or preflop aggressor range'; }
    else { label = isTwoTone ? 'TWO-TONE' : 'RAINBOW'; color = 'rgba(100,116,139,0.2)'; textColor = '#94a3b8'; strategy = 'Standard texture — play position and range advantage'; }

    return { label, color, textColor, strategy, isMonotone, isTwoTone, isRainbow, isPaired, isConnected, isDry, isWet };
}

export function BoardTextureHUD({ texture }) {
    if (!texture) return null;
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{
                background: texture.color, border: `1px solid ${texture.textColor}33`,
                borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{
                    fontSize: '10px', fontWeight: '800', letterSpacing: '1px',
                    color: texture.textColor, textTransform: 'uppercase',
                }}>{texture.label}</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {texture.isMonotone && <span style={{ fontSize: '10px' }}>🎨</span>}
                    {texture.isConnected && <span style={{ fontSize: '10px' }}>🔗</span>}
                    {texture.isPaired && <span style={{ fontSize: '10px' }}>👯</span>}
                    {texture.isDry && <span style={{ fontSize: '10px' }}>🏜️</span>}
                    {texture.isWet && <span style={{ fontSize: '10px' }}>💧</span>}
                </div>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>{texture.strategy}</p>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HISTORY BUILDER
// ═══════════════════════════════════════════════════════════════════════════
export function ActionHistoryBuilder({ actions, onAdd, onRemove, potSize }) {
    const [adding, setAdding] = useState(false);
    const [newAction, setNewAction] = useState({ position: 'BTN', action: 'bet_66' });
    const sty = { padding: '6px 10px', borderRadius: '6px', fontSize: '12px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' };

    return (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Action History
                </h4>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', fontFamily: "'Orbitron',monospace", background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                    Pot: {potSize.toFixed(1)} BB
                </span>
            </div>
            {actions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {actions.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '5px', fontSize: '10px', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1' }}>
                            <span style={{ fontWeight: '700', color: '#93c5fd' }}>{a.position}</span>
                            <span>{a.label}</span>
                            <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>×</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ color: '#475569', fontSize: '11px', marginBottom: '8px', fontStyle: 'italic' }}>No actions — build the betting line</div>
            )}
            {adding ? (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <select value={newAction.position} onChange={e => setNewAction({ ...newAction, position: e.target.value })} style={sty}>
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={newAction.action} onChange={e => setNewAction({ ...newAction, action: e.target.value })} style={sty}>
                        {BET_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <button onClick={() => { onAdd({ ...newAction, label: BET_ACTIONS.find(b => b.id === newAction.action)?.label }); setAdding(false); }}
                        style={{ ...sty, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer', fontWeight: '600' }}>✓</button>
                    <button onClick={() => setAdding(false)} style={{ ...sty, background: 'rgba(239,68,68,0.1)', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✗</button>
                </div>
            ) : (
                <button onClick={() => setAdding(true)} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)', color: '#94a3b8', cursor: 'pointer', width: '100%' }}>
                    + Add Action
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SIZING SENSITIVITY
// ═══════════════════════════════════════════════════════════════════════════
export function SizingSensitivity({ results }) {
    if (!results?.actions) return null;
    const sizes = ['25%', '33%', '50%', '66%', '75%', 'Pot'];
    const betActions = results.actions.filter(a => a.label?.includes('Bet') || a.label?.includes('bet'));
    if (betActions.length === 0) return null;

    return (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Sizing Sensitivity
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sizes.length, 6)}, 1fr)`, gap: '4px' }}>
                {sizes.map((size) => {
                    const match = betActions.find(a => a.label?.includes(size.replace('%', '')));
                    const freq = match?.frequency || 0;
                    return (
                        <div key={size} style={{ textAlign: 'center' }}>
                            <div style={{
                                height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                <motion.div initial={{ height: 0 }} animate={{ height: `${freq}%` }}
                                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: freq > 30 ? '#3b82f6' : '#1e40af', borderRadius: '4px' }} />
                            </div>
                            <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px' }}>{size}</div>
                            <div style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: '600' }}>{freq}%</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════
export function TreeVisualization({ actions }) {
    if (!actions || actions.length === 0) return null;
    const total = actions.reduce((s, a) => s + (a.frequency || 0), 0) || 100;

    return (
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Decision Tree
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Root node */}
                <div style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd', marginBottom: '8px',
                }}>Hero Decision</div>
                {/* Branches */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {actions.filter(a => a.frequency > 0).map((action, i) => (
                        <div key={action.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '1px', height: '16px', background: action.color || '#3b82f6' }} />
                            <div style={{
                                padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                                background: `${action.color || '#3b82f6'}22`, border: `1px solid ${action.color || '#3b82f6'}44`,
                                color: action.color || '#93c5fd', textAlign: 'center', minWidth: '50px',
                            }}>
                                <div>{action.label}</div>
                                <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '2px' }}>{action.frequency}%</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING TOUR
// ═══════════════════════════════════════════════════════════════════════════
const TOUR_STEPS = [
    { target: 'hero-setup', title: 'Hero Setup', text: 'Select your hole cards, position, and stack size. Click cards directly from the visual deck below.' },
    { target: 'board-builder', title: 'Board Builder', text: 'Add flop, turn, and river cards. Use presets for common textures or click "Random" for exploration.' },
    { target: 'action-history', title: 'Action History', text: 'Build the betting line step by step. The pot calculates dynamically as you add actions.' },
    { target: 'run-analysis', title: 'Run Analysis', text: 'Generates GTO-optimal frequencies from PIO solver data. Results show per-action frequencies and EV.' },
    { target: 'results-panel', title: 'Results Panel', text: 'View frequency bars, EV analysis, and the range heatmap. Green badge = real solver data, purple = AI approximation.' },
];

export function OnboardingTour({ isVisible, onClose, onNext, step = 0 }) {
    if (!isVisible) return null;
    const current = TOUR_STEPS[step];
    if (!current) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                    style={{
                        background: '#1a1a2e', border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '16px', padding: '24px', maxWidth: '380px', width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}
                >
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#e2e8f0', marginBottom: '8px', fontFamily: "'Orbitron',sans-serif" }}>
                        {current.title}
                    </div>
                    <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, margin: '0 0 16px' }}>
                        {current.text}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#64748b', fontSize: '11px' }}>{step + 1} of {TOUR_STEPS.length}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={onClose} style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                                background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer',
                            }}>Skip</button>
                            <button onClick={() => step < TOUR_STEPS.length - 1 ? onNext() : onClose()} style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', color: '#fff', cursor: 'pointer',
                            }}>{step < TOUR_STEPS.length - 1 ? 'Next →' : 'Get Started'}</button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════════════════════
export function ShareAnalysisModal({ isOpen, onClose, results, scenario }) {
    if (!isOpen || !results) return null;

    const shareText = `🃏 GTO Analysis: ${results.heroHand || 'Hand'} on ${scenario?.board || 'Board'}\n` +
        `✅ Optimal: ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n` +
        `${results.isMixed ? '🔄 Mixed Strategy' : '⚡ Pure Strategy'}\n` +
        `📊 Source: ${results.source}\n` +
        `🎯 Analyze your hands at Smarter.Poker`;

    const handleNativeShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'GTO Analysis — Smarter.Poker', text: shareText, url: 'https://smarter.poker/hub/personal-assistant/sandbox' });
            } else { handleCopy(); }
        } catch (e) { console.log('Share cancelled'); }
    };
    const handleCopy = () => { navigator.clipboard?.writeText(shareText); alert('Copied to clipboard!'); };

    const channels = [
        { label: '📋 Copy', onClick: handleCopy },
        { label: '🔗 Share', onClick: handleNativeShare },
        { label: '🐦 Twitter', onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank') },
        { label: '👤 Facebook', onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareText)}`, '_blank') },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{
                background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#e2e8f0' }}>Share Analysis</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}>×</button>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#cbd5e1', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {shareText}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {channels.map(ch => (
                        <button key={ch.label} onClick={ch.onClick} style={{
                            padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0', cursor: 'pointer',
                        }}>{ch.label}</button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}
