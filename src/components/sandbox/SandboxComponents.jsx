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
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SocialService } from '../../services/SocialService';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import toast from '../../stores/toastStore';
import { claimReward } from '../../lib/claimReward';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const BET_ACTIONS = [
    { id: 'fold', label: 'Fold' }, { id: 'check', label: 'Check' },
    { id: 'call', label: 'Call' }, { id: 'bet_33', label: 'Bet 33%' },
    { id: 'bet_50', label: 'Bet 50%' }, { id: 'bet_66', label: 'Bet 66%' },
    { id: 'bet_75', label: 'Bet 75%' }, { id: 'bet_100', label: 'Bet Pot' },
    { id: 'bet_150', label: 'Bet 150%' }, { id: 'raise', label: 'Raise' },
    { id: 'allin', label: 'All-In' }, { id: 'custom', label: 'Custom...' },
];

// ═══════════════════════════════════════════════════════════════════════════
// FREQUENCY BAR
// ═══════════════════════════════════════════════════════════════════════════
export function FrequencyBar({ action, isOptimal }) {
    return (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#B0B3B8', fontSize: '13px',
                    fontWeight: isOptimal ? '700' : '500', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                    {isOptimal && <span style={{ color: '#22c55e', fontSize: '10px' }}></span>}
                    {action.label}
                </span>
                <span style={{
                    color: isOptimal ? '#22c55e' : '#E4E6EB', fontSize: '13px',
                    fontWeight: '700', fontFamily: "'Orbitron', monospace",
                }}>
                    {action.frequency}%
                </span>
            </div>
            <div style={{ height: '8px', background: '#3A3B3C', borderRadius: '4px', overflow: 'hidden' }}>
                <motion.div
                    initial={{ width: 0 }} animate={{ width: `${action.frequency}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                        height: '100%', borderRadius: '4px',
                        background: isOptimal
                            ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                            : `linear-gradient(90deg, ${action.color || '#2374E1'}, ${action.color || '#2374E1'}88)`,
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
                background: '#3A3B3C', borderRadius: '8px', overflow: 'hidden', padding: '1px',
            }}>
                {RANKS.map((_, row) => RANKS.map((_, col) => {
                    const hk = getHandKey(row, col);
                    const freq = rangeHeatmap.data[hk]?.[actionId] ?? null;
                    return (
                        <div key={`${row}-${col}`}
                            onMouseEnter={() => setHoveredHand(hk)} onMouseLeave={() => setHoveredHand(null)}
                            style={{
                                aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '9px', fontWeight: '600', color: freq > 50 ? '#000' : '#E4E6EB',
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
                    background: '#242526', border: '1px solid #3A3B3C',
                    borderRadius: '8px', padding: '6px 10px', zIndex: 10, whiteSpace: 'nowrap', fontSize: '11px', color: '#E4E6EB',
                }}>
                    <strong>{hoveredHand}</strong>
                    {rangeHeatmap.actions?.slice(0, 4).map(a => (
                        <span key={a.id} style={{ marginLeft: '8px', color: a.id === actionId ? '#22c55e' : '#B0B3B8' }}>
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
                    {texture.isMonotone && <span style={{ fontSize: '10px', color: texture.textColor }}>M</span>}
                    {texture.isConnected && <span style={{ fontSize: '10px', color: texture.textColor }}>C</span>}
                    {texture.isPaired && <span style={{ fontSize: '10px', color: texture.textColor }}>P</span>}
                    {texture.isDry && <span style={{ fontSize: '10px', color: texture.textColor }}>D</span>}
                    {texture.isWet && <span style={{ fontSize: '10px', color: texture.textColor }}>W</span>}
                </div>
            </div>
            <p style={{ color: '#E4E6EB', fontSize: '11px', margin: 0, lineHeight: 1.4 }}>{texture.strategy}</p>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION HISTORY BUILDER
// ═══════════════════════════════════════════════════════════════════════════
export function ActionHistoryBuilder({ actions, onAdd, onRemove, potSize }) {
    const [adding, setAdding] = useState(false);
    const [newAction, setNewAction] = useState({ position: 'BTN', action: 'bet_66' });
    const [customPct, setCustomPct] = useState(75);
    const sty = { padding: '6px 10px', borderRadius: '6px', fontSize: '12px', background: '#3A3B3C', border: '1px solid #4E4F50', color: '#E4E6EB' };

    const handleAdd = () => {
        let label;
        if (newAction.action === 'custom') {
            label = `Bet ${customPct}%`;
        } else {
            label = BET_ACTIONS.find(b => b.id === newAction.action)?.label;
        }
        onAdd({ ...newAction, action: newAction.action === 'custom' ? `bet_${customPct}` : newAction.action, label });
        setAdding(false);
    };

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Action History
                </h4>
                <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', fontFamily: "'Orbitron',monospace", background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                    Pot: {potSize.toFixed(1)} BB
                </span>
            </div>
            {actions.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {actions.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '5px', fontSize: '10px', background: '#3A3B3C', color: '#E4E6EB' }}>
                            <span style={{ fontWeight: '700', color: '#4599FF' }}>{a.position}</span>
                            <span>{a.label}</span>
                            <button onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px' }}>x</button>
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ color: '#65676B', fontSize: '11px', marginBottom: '8px', fontStyle: 'italic' }}>No actions -- build the betting line</div>
            )}
            {adding ? (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={newAction.position} onChange={e => setNewAction({ ...newAction, position: e.target.value })} style={sty}>
                        {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={newAction.action} onChange={e => setNewAction({ ...newAction, action: e.target.value })} style={sty}>
                        {BET_ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    {newAction.action === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 100%', marginTop: '4px' }}>
                            <input type="range" min="10" max="200" step="5" value={customPct}
                                onChange={e => setCustomPct(Number(e.target.value))}
                                style={{ flex: 1, accentColor: '#8b5cf6' }} />
                            <span style={{ color: '#c4b5fd', fontSize: '12px', fontWeight: '700', minWidth: '40px' }}>{customPct}%</span>
                        </div>
                    )}
                    <button onClick={handleAdd}
                        style={{ ...sty, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer', fontWeight: '600' }}>OK</button>
                    <button onClick={() => setAdding(false)} style={{ ...sty, background: 'rgba(239,68,68,0.1)', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>X</button>
                </div>
            ) : (
                <button onClick={() => setAdding(true)} style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', background: '#3A3B3C', border: '1px dashed #4E4F50', color: '#B0B3B8', cursor: 'pointer', width: '100%' }}>
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
        <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Sizing Sensitivity
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sizes.length, 6)}, 1fr)`, gap: '4px' }}>
                {sizes.map((size) => {
                    const match = betActions.find(a => a.label?.includes(size.replace('%', '')));
                    const freq = match?.frequency || 0;
                    return (
                        <div key={size} style={{ textAlign: 'center' }}>
                            <div style={{
                                height: '40px', background: '#242526', borderRadius: '4px',
                                position: 'relative', overflow: 'hidden',
                            }}>
                                <motion.div initial={{ height: 0 }} animate={{ height: `${freq}%` }}
                                    style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: freq > 30 ? '#2374E1' : '#1a5db8', borderRadius: '4px' }} />
                            </div>
                            <div style={{ fontSize: '9px', color: '#B0B3B8', marginTop: '3px' }}>{size}</div>
                            <div style={{ fontSize: '10px', color: '#E4E6EB', fontWeight: '600' }}>{freq}%</div>
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
        <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px', fontWeight: '700' }}>
                Decision Tree
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Root node */}
                <div style={{
                    padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: '700',
                    background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.3)', color: '#4599FF', marginBottom: '8px',
                }}>Hero Decision</div>
                {/* Branches */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {actions.filter(a => a.frequency > 0).map((action, i) => (
                        <div key={action.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '1px', height: '16px', background: action.color || '#2374E1' }} />
                            <div style={{
                                padding: '5px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                                background: `${action.color || '#2374E1'}22`, border: `1px solid ${action.color || '#2374E1'}44`,
                                color: action.color || '#4599FF', textAlign: 'center', minWidth: '50px',
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
                        background: '#242526', border: '1px solid #3A3B3C',
                        borderRadius: '16px', padding: '24px', maxWidth: '380px', width: '90%',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}
                >
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#E4E6EB', marginBottom: '8px', fontFamily: "'Orbitron',sans-serif" }}>
                        {current.title}
                    </div>
                    <p style={{ color: '#B0B3B8', fontSize: '13px', lineHeight: 1.6, margin: '0 0 16px' }}>
                        {current.text}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#65676B', fontSize: '11px' }}>{step + 1} of {TOUR_STEPS.length}</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={onClose} style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '12px',
                                background: 'none', border: '1px solid #3A3B3C', color: '#B0B3B8', cursor: 'pointer',
                            }}>Skip</button>
                            <button onClick={() => step < TOUR_STEPS.length - 1 ? onNext() : onClose()} style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                                background: 'linear-gradient(135deg, #2374E1, #4599FF)', border: 'none', color: '#fff', cursor: 'pointer',
                            }}>{step < TOUR_STEPS.length - 1 ? 'Next →' : 'Get Started'}</button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARE MODAL
// ═══════════════════════════════════════════════════════════════════════
export function ShareAnalysisModal({ isOpen, onClose, results, scenario }) {
    if (!isOpen || !results) return null;

    const shareText = `GTO Analysis: ${results.heroHand || 'Hand'} on ${scenario?.board || 'Board'}\n` +
        `Optimal: ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n` +
        `${results.isMixed ? 'Mixed Strategy' : 'Pure Strategy'}\n` +
        `Source: ${results.source}\n` +
        `Analyze your hands at Smarter.Poker`;

    const [isPosting, setIsPosting] = useState(false);

    const handleNativeShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'GTO Analysis — Smarter.Poker', text: shareText, url: 'https://smarter.poker/hub/personal-assistant/sandbox' });
            } else { handleCopy(); }
        } catch (e) { console.log('Share cancelled'); }
    };
    const handleCopy = () => { navigator.clipboard?.writeText(shareText); toast.success('Copied to clipboard!'); };

    const handleInternalPost = async () => {
        try {
            setIsPosting(true);
            const user = getAuthUser();
            if (!user) {
                toast.error('You must be logged in to post.');
                return;
            }

            const socialService = new SocialService(supabase);
            const displayContent = `I just analyzed a hand in the GTO Sandbox!\n\n` +
                `**Hero:** ${results.heroHand || 'Hand'} on ${scenario?.board || 'Preflop'}\n` +
                `**Optimal line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\n` +
                `*${results.explanation?.substring(0, 150) || 'Check out my full analysis on Smarter.Poker.'}...*`;

            const newPost = await socialService.createPost({
                authorId: user.id,
                content: displayContent,
                contentType: 'text',
                visibility: 'public'
            });

            if (newPost) {
                claimReward('/api/rewards/social-post', { userId: user.id, postId: newPost.id }, 'New Post Published');
                toast.success('Posted to your feed!', 2000);
                setTimeout(onClose, 1500);
            }
        } catch (err) {
            console.error('Feed post error:', err);
            toast.error('Failed to post to feed.');
        } finally {
            setIsPosting(false);
        }
    };

    const channels = [
        { label: isPosting ? '...' : 'Smarter.Poker', onClick: handleInternalPost },
        { label: 'Copy', onClick: handleCopy },
        { label: 'Share', onClick: handleNativeShare },
        { label: 'Twitter', onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`, '_blank') },
        { label: 'Facebook', onClick: () => window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(shareText)}`, '_blank') },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} style={{
                background: '#242526', border: '1px solid #3A3B3C',
                borderRadius: '16px', padding: '24px', maxWidth: '400px', width: '90%',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#E4E6EB' }}>Share Analysis</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#B0B3B8', cursor: 'pointer', fontSize: '18px' }}>×</button>
                </div>
                <div style={{ background: '#3A3B3C', borderRadius: '10px', padding: '12px', marginBottom: '16px', fontSize: '12px', color: '#E4E6EB', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {shareText}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {channels.map((ch, idx) => (
                        <button key={ch.label} onClick={ch.onClick} disabled={isPosting && idx === 0} style={{
                            padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: '600',
                            background: idx === 0 ? 'linear-gradient(135deg, #2374E1, #4599FF)' : '#3A3B3C',
                            border: idx === 0 ? 'none' : '1px solid #4E4F50',
                            color: '#E4E6EB', cursor: isPosting && idx === 0 ? 'wait' : 'pointer',
                            opacity: isPosting && idx === 0 ? 0.7 : 1,
                            gridColumn: idx === 0 ? '1 / -1' : 'auto'
                        }}>{ch.label}</button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STREET TIMELINE — Multi-Street Story Mode
// Shows how GTO strategy evolves across streets
// ═══════════════════════════════════════════════════════════════════════════
export function StreetTimeline({ streetHistory, activeStreet, onSelectStreet }) {
    if (!streetHistory || streetHistory.length === 0) return null;

    const streets = ['Flop', 'Turn', 'River'];
    return (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', background: '#242526', borderRadius: '10px', padding: '6px' }}>
            {streetHistory.map((entry, i) => {
                const isActive = activeStreet === i;
                const streetLabel = streets[i] || `Street ${i + 1}`;
                return (
                    <button key={i} onClick={() => onSelectStreet(i)} style={{
                        flex: 1, padding: '8px 6px', borderRadius: '8px', border: 'none',
                        background: isActive ? 'rgba(35,116,225,0.2)' : 'transparent',
                        cursor: 'pointer', textAlign: 'center',
                        borderBottom: isActive ? '2px solid #2374E1' : '2px solid transparent',
                    }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: isActive ? '#4599FF' : '#65676B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {streetLabel}
                        </div>
                        {entry.results && (
                            <>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#E4E6EB' : '#B0B3B8', marginTop: '2px' }}>
                                    {entry.results.optimalAction?.label || '--'}
                                </div>
                                <div style={{ fontSize: '9px', color: entry.results.ev?.hero >= 0 ? '#4ade80' : '#f87171', marginTop: '1px' }}>
                                    {entry.results.ev?.heroDisplay || ''}
                                </div>
                            </>
                        )}
                    </button>
                );
            })}
            {streetHistory.length < 3 && (
                <div style={{ flex: 1, padding: '8px', borderRadius: '8px', textAlign: 'center', border: '1px dashed #4E4F50' }}>
                    <div style={{ fontSize: '10px', color: '#65676B' }}>{streets[streetHistory.length] || 'Next'}</div>
                    <div style={{ fontSize: '9px', color: '#65676B', marginTop: '2px' }}>Deal to unlock</div>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUITY GAUGE — Circular arc showing hero equity
// ═══════════════════════════════════════════════════════════════════════════
export function EquityGauge({ equity, label }) {
    if (equity == null) return null;

    const pct = Math.max(0, Math.min(100, equity));
    const color = pct >= 60 ? '#22c55e' : pct >= 45 ? '#fbbf24' : '#ef4444';
    const circumference = 2 * Math.PI * 36;
    const offset = circumference - (pct / 100) * circumference;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#242526', borderRadius: '10px', marginBottom: '10px' }}>
            <svg width="48" height="48" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#3A3B3C" strokeWidth="6" />
                <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
                <text x="40" y="44" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="'Orbitron', monospace">
                    {Math.round(pct)}
                </text>
            </svg>
            <div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#E4E6EB' }}>Equity</div>
                <div style={{ fontSize: '10px', color: '#B0B3B8' }}>{label || `${Math.round(pct)}% vs random`}</div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ANALYSIS SKELETON — Loading animation during analysis
// ═══════════════════════════════════════════════════════════════════════════
export function AnalysisSkeleton() {
    const pulseStyle = {
        background: 'linear-gradient(90deg, #242526 25%, #3A3B3C 50%, #242526 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
        borderRadius: '6px',
    };

    return (
        <div style={{ padding: '16px' }}>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            {/* Action bar skeleton */}
            <div style={{ ...pulseStyle, height: '28px', marginBottom: '12px', width: '60%' }} />
            {/* Frequency bars */}
            {[1, 0.7, 0.4, 0.2].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ ...pulseStyle, height: '14px', width: '50px' }} />
                    <div style={{ ...pulseStyle, height: '14px', flex: 1, maxWidth: `${w * 100}%` }} />
                </div>
            ))}
            {/* EV display skeleton */}
            <div style={{ ...pulseStyle, height: '40px', marginTop: '16px', width: '80%' }} />
            {/* Heatmap skeleton */}
            <div style={{ ...pulseStyle, height: '120px', marginTop: '12px' }} />
            <div style={{ textAlign: 'center', color: '#65676B', fontSize: '11px', marginTop: '12px' }}>
                Analyzing hand...
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PREFLOP CHART OVERLAY — Phase 2.1
// Compact 13x13 range grid with position-specific GTO colors
// ═══════════════════════════════════════════════════════════════════════════
export function PreflopChartOverlay({ position, scenario, rangeGrid, rangePercent, onChangeScenario }) {
    if (!rangeGrid) return null;

    const actionColors = { raise: '#22c55e', '3bet': '#ef4444', call: '#3b82f6', fold: 'transparent' };
    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Preflop Range -- {position} ({rangePercent}% of hands)
                </h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {['rfi', '3bet'].map(s => (
                        <button key={s} onClick={() => onChangeScenario(s)} style={{
                            padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: '600',
                            background: scenario === s ? 'rgba(35,116,225,0.2)' : '#3A3B3C',
                            border: scenario === s ? '1px solid rgba(35,116,225,0.3)' : '1px solid #4E4F50',
                            color: scenario === s ? '#4599FF' : '#B0B3B8', cursor: 'pointer',
                        }}>{s === 'rfi' ? 'Open Raise' : '3-Bet'}</button>
                    ))}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '1px', fontSize: '7px' }}>
                {rangeGrid.flat().map((cell, i) => (
                    <div key={i} style={{
                        padding: '2px 1px', textAlign: 'center', borderRadius: '2px',
                        background: cell.inRange ? (actionColors[cell.action] || '#3A3B3C') + '33' : '#242526',
                        border: cell.inRange ? `1px solid ${actionColors[cell.action]}44` : '1px solid transparent',
                        color: cell.inRange ? '#E4E6EB' : '#4E4F50',
                        fontWeight: cell.inRange ? '600' : '400',
                    }}>{cell.hand}</div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '9px' }}>
                <span style={{ color: '#22c55e' }}>Raise</span>
                <span style={{ color: '#ef4444' }}>3-Bet</span>
                <span style={{ color: '#3b82f6' }}>Call</span>
                <span style={{ color: '#4E4F50' }}>Fold</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNOUT CHART — Phase 2.2
// Shows best/worst cards for next street + improve/worsen rates
// ═══════════════════════════════════════════════════════════════════════════
export function RunoutChart({ runoutData }) {
    if (!runoutData || !runoutData.bestCards || runoutData.bestCards.length === 0) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px', fontWeight: '700' }}>
                Runout Simulator
            </h4>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#22c55e', fontFamily: "'Orbitron',monospace" }}>{runoutData.improveRate}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Cards improve</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444', fontFamily: "'Orbitron',monospace" }}>{runoutData.worsenRate}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Cards worsen</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#fbbf24', fontFamily: "'Orbitron',monospace" }}>{runoutData.avgEquity}%</div>
                    <div style={{ fontSize: '9px', color: '#B0B3B8' }}>Avg equity</div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: '600', marginBottom: '4px' }}>Best Cards</div>
                    {runoutData.bestCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '10px' }}>
                            <span style={{ color: '#E4E6EB', fontWeight: '600' }}>{c.card}</span>
                            <span style={{ color: '#22c55e' }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600', marginBottom: '4px' }}>Worst Cards</div>
                    {runoutData.worstCards.map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', fontSize: '10px' }}>
                            <span style={{ color: '#E4E6EB', fontWeight: '600' }}>{c.card}</span>
                            <span style={{ color: '#ef4444' }}>{c.equity}%</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPLOIT TOGGLE — Phase 2.3
// Toggle between GTO and Exploitative recommendations
// ═══════════════════════════════════════════════════════════════════════════
export function ExploitToggle({ mode, onToggle, exploitTip }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <button
                onClick={() => onToggle(mode === 'gto' ? 'exploit' : 'gto')}
                style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: '700',
                    background: mode === 'gto' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                    border: `1px solid ${mode === 'gto' ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    color: mode === 'gto' ? '#4ade80' : '#fde68a',
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
                }}>
                {mode === 'gto' ? 'GTO' : 'Exploit'}
            </button>
            {mode === 'exploit' && exploitTip && (
                <span style={{ fontSize: '10px', color: '#fde68a', fontStyle: 'italic' }}>{exploitTip}</span>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ PANEL — Phase 3.1
// "What Would You Do?" — pick an action before seeing the GTO answer
// ═══════════════════════════════════════════════════════════════════════════
export function QuizPanel({ onGuess, correctAction, revealed, userGuess, score }) {
    const actions = ['Check', 'Call', 'Bet Small', 'Bet Medium', 'Bet Large', 'Raise', 'Fold', 'All-In'];

    if (revealed) {
        const isCorrect = userGuess && correctAction && correctAction.length > 0 && userGuess.toLowerCase().includes(correctAction.toLowerCase().split(' ')[0]);
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                style={{
                    padding: '12px', borderRadius: '12px', marginBottom: '12px',
                    background: isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: isCorrect ? '#4ade80' : '#fca5a5', marginBottom: '4px' }}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                </div>
                <div style={{ fontSize: '11px', color: '#B0B3B8' }}>
                    You chose: <strong style={{ color: '#E4E6EB' }}>{userGuess}</strong> | GTO: <strong style={{ color: '#4599FF' }}>{correctAction}</strong>
                </div>
                {score && (
                    <div style={{ fontSize: '10px', color: '#B0B3B8', marginTop: '4px' }}>
                        Score: {score.correct}/{score.total} ({score.total > 0 ? Math.round(score.correct / score.total * 100) : 0}%) | Streak: {score.streak}
                    </div>
                )}
            </motion.div>
        );
    }

    return (
        <div style={{ padding: '12px', borderRadius: '12px', marginBottom: '12px', background: 'rgba(35,116,225,0.08)', border: '1px solid rgba(35,116,225,0.2)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#4599FF', marginBottom: '8px' }}>What Would You Do?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {actions.map(a => (
                    <button key={a} onClick={() => onGuess(a)} style={{
                        padding: '6px 4px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                        background: '#242526', border: '1px solid #3A3B3C', color: '#E4E6EB',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}>{a}</button>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDY REPLAY CARD — Phase 3.2
// Compact flashcard view of a previous analysis
// ═══════════════════════════════════════════════════════════════════════════
export function StudyReplayCard({ session, index, total, onNext, onPrev }) {
    if (!session) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px', border: '1px solid #3A3B3C' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Study Card {index + 1} of {total}
                </h4>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={onPrev} disabled={index === 0} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', background: '#3A3B3C', border: 'none', color: index === 0 ? '#65676B' : '#E4E6EB', cursor: index === 0 ? 'default' : 'pointer' }}>Prev</button>
                    <button onClick={onNext} disabled={index >= total - 1} style={{ padding: '4px 8px', borderRadius: '5px', fontSize: '11px', background: '#3A3B3C', border: 'none', color: index >= total - 1 ? '#65676B' : '#E4E6EB', cursor: index >= total - 1 ? 'default' : 'pointer' }}>Next</button>
                </div>
            </div>
            <div style={{ fontSize: '11px', color: '#E4E6EB', marginBottom: '4px' }}>
                {session.label || session.hero_position + ' ' + (session.hero_hand || 'Unknown')}
            </div>
            {session.full_analysis && (
                <div style={{ fontSize: '10px', color: '#B0B3B8' }}>
                    Optimal: <strong style={{ color: '#4ade80' }}>{session.full_analysis?.optimalAction?.label || 'N/A'}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCURACY BADGE — Phase 3.4
// Shows quiz accuracy % and streak in the header
// ═══════════════════════════════════════════════════════════════════════════
export function AccuracyBadge({ stats }) {
    if (!stats || stats.total === 0) return null;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 10px', borderRadius: '16px', fontSize: '10px', fontWeight: '700',
            background: stats.accuracy >= 70 ? 'rgba(34,197,94,0.1)' : stats.accuracy >= 50 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${stats.accuracy >= 70 ? 'rgba(34,197,94,0.2)' : stats.accuracy >= 50 ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.2)'}`,
            color: stats.accuracy >= 70 ? '#4ade80' : stats.accuracy >= 50 ? '#fde68a' : '#fca5a5',
        }}>
            <span>{stats.accuracy}% Accuracy</span>
            {stats.streak > 0 && <span style={{ color: '#fbbf24' }}>{stats.streak} Streak</span>}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// WEEKLY SPOT BANNER — Phase 4.3
// Shows the current week's challenge with a "Load This Spot" button
// ═══════════════════════════════════════════════════════════════════════════
export function WeeklySpotBanner({ spot, onLoad }) {
    if (!spot) return null;

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(35,116,225,0.08), rgba(35,116,225,0.04))',
            border: '1px solid rgba(35,116,225,0.2)',
            borderRadius: '12px', padding: '12px', marginBottom: '12px',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <h4 style={{ color: '#4599FF', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    Weekly Spot Challenge
                </h4>
                <button onClick={() => onLoad(spot)} style={{
                    padding: '4px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                    background: 'rgba(35,116,225,0.2)', border: '1px solid rgba(35,116,225,0.3)',
                    color: '#4599FF', cursor: 'pointer',
                }}>Load This Spot</button>
            </div>
            <div style={{ fontSize: '11px', color: '#E4E6EB' }}>
                {spot.description || 'Can you find the GTO play?'}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD CARD — Phase 4.4
// Compact leaderboard for quiz accuracy
// ═══════════════════════════════════════════════════════════════════════════
export function LeaderboardCard({ entries }) {
    if (!entries || entries.length === 0) return null;

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px', border: '1px solid #3A3B3C' }}>
            <h4 style={{ color: '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px', fontWeight: '700' }}>
                Leaderboard
            </h4>
            {entries.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', borderBottom: i < entries.length - 1 ? '1px solid #3A3B3C' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: i < 3 ? '#fbbf24' : '#B0B3B8', fontWeight: '700' }}>#{i + 1}</span>
                        <span style={{ color: '#E4E6EB' }}>{e.name || 'Anonymous'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: e.accuracy >= 70 ? '#4ade80' : '#fde68a', fontWeight: '600' }}>{e.accuracy}%</span>
                        {e.streak > 0 && <span style={{ color: '#fbbf24', fontSize: '10px' }}>{e.streak} Streak</span>}
                    </div>
                </div>
            ))}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════════════
// EQUITY GRAPH — Wave 2 Feature 4
// SVG line chart: tracks hero equity across streets
// ═══════════════════════════════════════════════════════════════════════════
export function EquityGraph({ streetHistory, currentEquity }) {
    const streets = ['Pre', 'Flop', 'Turn', 'River'];
    const points = useMemo(() => {
        const pts = [];
        if (currentEquity != null) pts.push({ street: 'Pre', equity: currentEquity });
        streetHistory?.forEach((entry, i) => {
            if (entry.equity != null) pts.push({ street: streets[i + 1] || 'S' + (i + 1), equity: entry.equity });
        });
        return pts;
    }, [streetHistory, currentEquity]);

    if (points.length < 2) return null;

    const W = 260, H = 80, PAD = 16;
    const xStep = (W - PAD * 2) / (points.length - 1);
    const yScale = (v) => PAD + (H - PAD * 2) * (1 - v / 100);
    const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${PAD + i * xStep},${yScale(p.equity)}`).join(' ');
    const areaD = lineD + ` L${PAD + (points.length - 1) * xStep},${H - PAD} L${PAD},${H - PAD} Z`;
    const lastEquity = points[points.length - 1]?.equity || 50;
    const color = lastEquity >= 50 ? '#22c55e' : '#ef4444';

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Equity Progression
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
                {[25, 50, 75].map(v => (
                    <line key={v} x1={PAD} y1={yScale(v)} x2={W - PAD} y2={yScale(v)} stroke="#3A3B3C" strokeWidth="1" strokeDasharray="3,3" />
                ))}
                <text x={W - PAD + 2} y={yScale(50) + 4} fontSize="8" fill="#65676B">50%</text>
                <defs>
                    <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                <path d={areaD} fill="url(#eqGrad)" />
                <path d={lineD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => (
                    <g key={i}>
                        <circle cx={PAD + i * xStep} cy={yScale(p.equity)} r="3" fill={color} />
                        <text x={PAD + i * xStep} y={H - 2} textAnchor="middle" fontSize="8" fill="#65676B">{p.street}</text>
                        <text x={PAD + i * xStep} y={yScale(p.equity) - 6} textAnchor="middle" fontSize="8" fill={color} fontWeight="700">
                            {Math.round(p.equity)}%
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION LOG MODAL — Wave 2 Feature 5
// ═══════════════════════════════════════════════════════════════════════════
export function SessionLogModal({ isOpen, onClose, sessionLog, onLoadEntry, onClearSession }) {
    if (!isOpen) return null;
    const ACTION_COLORS = { fold: '#ef4444', check: '#94a3b8', call: '#fbbf24', bet: '#22c55e', raise: '#22c55e', allin: '#f97316' };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{
            position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={onClose}>
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()} style={{
                background: '#18191A', borderRadius: '20px 20px 0 0', border: '1px solid #3A3B3C',
                width: '100%', maxWidth: 500, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}>
                <div style={{ padding: '16px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#E4E6EB' }}>
                        Session Log <span style={{ fontSize: '12px', color: '#65676B', fontWeight: '600' }}>({sessionLog?.length || 0} hands)</span>
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {(sessionLog?.length > 0) && (
                            <button onClick={() => { try { navigator.vibrate?.(30); } catch (e) { } onClearSession(); }}
                                style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}>
                                Clear
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                    {!sessionLog?.length ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: '#65676B', fontSize: '13px' }}>
                            No hands yet. Run an analysis to start tracking.
                        </div>
                    ) : [...sessionLog].reverse().map((entry, i) => {
                        const actionKey = (entry.optimalAction || '').toLowerCase().split(' ')[0];
                        const badgeColor = ACTION_COLORS[actionKey] || '#4599FF';
                        return (
                            <button key={entry.id || i} onClick={() => { try { navigator.vibrate?.(10); } catch (e) { } onLoadEntry(entry); onClose(); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', marginBottom: '6px', borderRadius: '10px', background: '#242526', border: '1px solid #3A3B3C', cursor: 'pointer', textAlign: 'left', touchAction: 'manipulation' }}>
                                <div style={{ width: 36, height: 36, borderRadius: '10px', background: `${badgeColor}22`, border: `1px solid ${badgeColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: badgeColor, flexShrink: 0 }}>
                                    {(entry.optimalAction || '??').substring(0, 4)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#E4E6EB' }}>{entry.hand} — {entry.position}</div>
                                    <div style={{ fontSize: '11px', color: '#B0B3B8', marginTop: '2px' }}>{entry.street} · {entry.board || 'Preflop'}{entry.equity != null ? ` · ${Math.round(entry.equity)}% eq` : ''}</div>
                                </div>
                                <div style={{ fontSize: '10px', color: '#65676B', flexShrink: 0 }}>↩</div>
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH ACTION PICKER — Wave 2 Feature 6 (Socratic Coach)
// ═══════════════════════════════════════════════════════════════════════════
export function CoachActionPicker({ isOpen, onPick, onSkip }) {
    if (!isOpen) return null;
    const ACTIONS = [
        { id: 'fold', label: 'Fold', color: '#ef4444' },
        { id: 'check', label: 'Check', color: '#94a3b8' },
        { id: 'call', label: 'Call', color: '#fbbf24' },
        { id: 'bet_33', label: 'Bet 33%', color: '#4ade80' },
        { id: 'bet_66', label: 'Bet 66%', color: '#22c55e' },
        { id: 'bet_100', label: 'Bet Pot', color: '#16a34a' },
        { id: 'raise', label: 'Raise', color: '#3b82f6' },
        { id: 'allin', label: 'All-In', color: '#f97316' },
    ];
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} style={{ background: '#18191A', border: '1px solid rgba(35,116,225,0.3)', borderRadius: '20px', padding: '24px', maxWidth: '360px', width: '100%', boxShadow: '0 0 60px rgba(35,116,225,0.18)' }}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>🧠</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#E4E6EB', fontFamily: "'Orbitron', sans-serif" }}>Coach Mode</div>
                    <div style={{ fontSize: '13px', color: '#B0B3B8', marginTop: '4px' }}>What would you do in this spot?</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                    {ACTIONS.map(a => (
                        <button key={a.id} onClick={() => { try { navigator.vibrate?.(15); } catch (e) { } onPick(a.label); }}
                            style={{ padding: '12px 8px', borderRadius: '12px', fontSize: '13px', fontWeight: '700', background: `${a.color}15`, border: `1px solid ${a.color}40`, color: a.color, cursor: 'pointer', touchAction: 'manipulation' }}>
                            {a.label}
                        </button>
                    ))}
                </div>
                <button onClick={onSkip} style={{ width: '100%', padding: '10px', borderRadius: '10px', fontSize: '12px', background: 'none', border: '1px solid #3A3B3C', color: '#65676B', cursor: 'pointer' }}>
                    Skip — just show the answer
                </button>
            </motion.div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// COACH VERDICT — Shows user pick vs GTO verdict
// ═══════════════════════════════════════════════════════════════════════════
export function CoachVerdict({ userPick, gtoAction, evDelta }) {
    if (!userPick || !gtoAction) return null;
    const isCorrect = userPick.toLowerCase().split(' ')[0] === gtoAction.toLowerCase().split(' ')[0];
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '14px', borderRadius: '12px', marginBottom: '12px', background: isCorrect ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '20px' }}>{isCorrect ? '✅' : '❌'}</span>
                <div style={{ fontSize: '14px', fontWeight: '800', color: isCorrect ? '#4ade80' : '#fca5a5' }}>{isCorrect ? 'Correct!' : 'Not optimal'}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#B0B3B8' }}>
                You: <strong style={{ color: '#E4E6EB' }}>{userPick}</strong>{' '}vs GTO: <strong style={{ color: '#4599FF' }}>{gtoAction}</strong>
                {evDelta != null && <span style={{ marginLeft: 8, color: evDelta >= 0 ? '#4ade80' : '#fca5a5', fontWeight: '700' }}>({evDelta >= 0 ? '+' : ''}{evDelta.toFixed(2)} EV)</span>}
            </div>
        </motion.div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION REPLAY BAR — Wave 2 Feature 8
// Tappable history scrubber with playhead indicator and haptics
// ═══════════════════════════════════════════════════════════════════════════
export function ActionReplayBar({ actions, replayIndex, onReplayTo, onExitReplay }) {
    if (!actions || actions.length === 0) return null;
    const COLORS = { fold: '#ef4444', check: '#94a3b8', call: '#fbbf24', raise: '#22c55e', allin: '#f97316' };
    const getBubbleColor = (action) => COLORS[(action || '').toLowerCase().split('_')[0]] || '#2374E1';

    return (
        <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ color: replayIndex != null ? '#4599FF' : '#B0B3B8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', margin: 0, fontWeight: '700' }}>
                    {replayIndex != null ? '▶ Replay Mode' : 'Action History'}
                </h4>
                {replayIndex != null && (
                    <button onClick={() => { try { navigator.vibrate?.(20); } catch (e) { } onExitReplay(); }}
                        style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}>
                        Exit
                    </button>
                )}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: replayIndex == null ? '#4599FF' : '#3A3B3C', border: '2px solid #2374E1', flexShrink: 0 }} />
                {actions.map((a, i) => {
                    const color = getBubbleColor(a.action);
                    const isActive = replayIndex === i;
                    const isPast = replayIndex != null && i <= replayIndex;
                    return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: 14, height: 2, background: isPast ? color : '#3A3B3C', transition: 'background 0.2s' }} />
                            <button
                                onClick={() => { try { navigator.vibrate?.(isActive ? 30 : 10); } catch (e) { } onReplayTo(isActive ? null : i); }}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: '700', background: isActive ? `${color}30` : isPast ? `${color}15` : '#3A3B3C', border: `1px solid ${isActive ? color : isPast ? color + '55' : '#4E4F50'}`, color: isActive ? color : isPast ? color + 'cc' : '#B0B3B8', cursor: 'pointer', minWidth: 34, boxShadow: isActive ? `0 0 8px ${color}40` : 'none', touchAction: 'manipulation' }}>
                                <span style={{ color: isPast ? '#4599FF' : '#65676B', fontSize: '8px' }}>{a.position}</span>
                                <span>{a.label}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
            {replayIndex != null && (
                <div style={{ marginTop: '8px', fontSize: '10px', color: '#4599FF', textAlign: 'center' }}>
                    Rewound to: <strong>{actions[replayIndex]?.position} {actions[replayIndex]?.label}</strong>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARE HAND MODAL — Wave 2 Feature 7
// Download PNG + Post to Smarter.Poker profile + Native share sheet
// ═══════════════════════════════════════════════════════════════════════════
export function ShareHandModal({ isOpen, onClose, results, scenario, heroHand, board, cardRef }) {
    if (!isOpen || !results) return null;
    const [isPosting, setIsPosting] = useState(false);
    const [capturedUrl, setCapturedUrl] = useState(null);

    const captureCanvas = async () => {
        if (!cardRef?.current) return null;
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(cardRef.current, { backgroundColor: '#18191a', scale: 2, useCORS: true });
            const url = canvas.toDataURL('image/png');
            setCapturedUrl(url);
            return url;
        } catch (e) { return null; }
    };

    const handleDownload = async () => {
        try { navigator.vibrate?.(20); } catch (e) { }
        const url = capturedUrl || await captureCanvas();
        if (!url) return;
        const link = document.createElement('a');
        link.download = `smarter-poker-hand-${Date.now()}.png`;
        link.href = url;
        link.click();
    };

    const handlePostToProfile = async () => {
        try { navigator.vibrate?.(15); } catch (e) { }
        setIsPosting(true);
        try {
            const user = getAuthUser();
            if (!user) { alert('Log in to post'); setIsPosting(false); return; }
            // Fetch session token for auth header
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) { alert('Session expired. Please log in again.'); setIsPosting(false); return; }
            const hand = heroHand?.card1 ? `${heroHand.card1}${heroHand.card2}` : '??';
            const boardStr = board?.flop?.join(' ') || 'Preflop';
            const content = `🃏 Just analyzed a hand in the GTO Sandbox!\n\n**Hand:** ${hand} — ${scenario?.position || 'BTN'}\n**Board:** ${boardStr}\n**GTO Line:** ${results.optimalAction?.label} (${results.optimalAction?.frequency}%)\n\nTry this hand at smarter.poker/hub/personal-assistant/sandbox`;
            const res = await fetch('/api/social/create-post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    user_id: user.id,
                    content,
                    content_type: 'sandbox_hand',
                    metadata: {
                        hand,
                        board: boardStr,
                        position: scenario?.position,
                        optimalAction: results.optimalAction?.label,
                        challengeEnabled: true,
                    },
                }),
            });
            if (res.ok) {
                // Dispatch bus listener event so social feed pages refresh
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('social-post-created', { detail: { type: 'sandbox_hand' } }));
                }
                setTimeout(onClose, 1200);
            } else {
                const errBody = await res.json().catch(() => ({}));
                console.error('[ShareHandModal] Post failed:', res.status, errBody);
            }
        } catch (err) {
            console.error('[ShareHandModal] Post error:', err);
        }
        setIsPosting(false);
    };


    const handleNativeShare = async () => {
        try { navigator.vibrate?.(15); } catch (e) { }
        const shareUrl = `${window.location.origin}/hub/personal-assistant/sandbox`;
        const text = `I analyzed ${heroHand?.card1 || '??'}${heroHand?.card2 || '??'} on the GTO Sandbox — GTO line: ${results.optimalAction?.label}`;
        try {
            if (navigator.share) { await navigator.share({ title: 'GTO Hand Analysis — Smarter.Poker', text, url: shareUrl }); }
            else { navigator.clipboard?.writeText(`${text}\n${shareUrl}`); }
        } catch (e) { }
    };

    const actions = [
        { icon: '📸', label: 'Download Image', sub: 'Save PNG to device', onClick: handleDownload, color: '#4599FF' },
        { icon: '🃏', label: isPosting ? 'Posting...' : 'Post to My Profile', sub: 'Share to your Smarter.Poker feed', onClick: handlePostToProfile, color: '#22c55e', primary: true },
        { icon: '↗️', label: 'Share Link', sub: 'Copy link or open share sheet', onClick: handleNativeShare, color: '#a78bfa' },
    ];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9995, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} onClick={e => e.stopPropagation()} style={{ background: '#18191A', borderRadius: '20px 20px 0 0', border: '1px solid #3A3B3C', width: '100%', maxWidth: 500, padding: '24px', paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#E4E6EB' }}>Share Hand</h3>
                    <button onClick={onClose} style={{ background: '#3A3B3C', border: 'none', color: '#E4E6EB', cursor: 'pointer', fontSize: '18px', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <div style={{ background: '#242526', borderRadius: '12px', padding: '12px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#E4E6EB' }}>
                        {heroHand?.card1 || '??'}{heroHand?.card2 || '??'} — {scenario?.position || 'BTN'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#B0B3B8', marginTop: '4px' }}>
                        GTO: <span style={{ color: '#22c55e', fontWeight: '600' }}>{results.optimalAction?.label}</span> ({results.optimalAction?.frequency}%)
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {actions.map(a => (
                        <button key={a.label} onClick={a.onClick} disabled={isPosting && a.primary}
                            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '14px', cursor: isPosting && a.primary ? 'wait' : 'pointer', background: a.primary ? `${a.color}15` : '#242526', border: `1px solid ${a.primary ? a.color + '30' : '#3A3B3C'}`, opacity: isPosting && a.primary ? 0.7 : 1, touchAction: 'manipulation' }}>
                            <span style={{ fontSize: '24px', minWidth: 32, textAlign: 'center' }}>{a.icon}</span>
                            <div style={{ textAlign: 'left', flex: 1 }}>
                                <div style={{ fontSize: '14px', fontWeight: '700', color: a.primary ? a.color : '#E4E6EB' }}>{a.label}</div>
                                <div style={{ fontSize: '11px', color: '#65676B', marginTop: '2px' }}>{a.sub}</div>
                            </div>
                            <span style={{ color: '#65676B' }}>›</span>
                        </button>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    );
}

// ── Wave 3: VillainReadCard (W3-5) ──────────────────────────────────────────
const ARCHETYPE_EXPLOITS = {
    nit: ['Steal blinds freely vs this player', 'Fold to raises — they only 3-bet premiums', 'Bet big when they call — value bet relentlessly'],
    tag: ['Stay balanced — they notice unbalanced lines', 'Mix your frequencies vs TAG ranges', 'Respect their raises on scary boards'],
    lag: ['Tighten your calling range vs 3-bets', 'Let them barrel into you with top pair+', 'Float light pre-flop only in position'],
    calling_station: ['Bet very thin for value — they call anything', 'Remove bluffs entirely from your range', 'Overbet the river with strong value hands'],
    maniac: ['Let them hang themselves — trap with premiums', 'Call down lighter vs maniac — bluff ratio is high', 'Raise for value when they show aggression'],
    fish: ["Max bet strong hands — they won't notice odds", "Simplify your range — fancy plays won't work", "Don't slow play big hands — they can't fold"],
    gto_neutral: ['Play balanced GTO frequencies', 'Mixed strategies are optimal here', 'No single exploit — adapt post-flop to tendencies'],
};

export function VillainReadCard({ villain }) {
    const [open, setOpen] = useState(true);
    if (!villain?.archetype?.id) return null;
    const archetypeId = villain.archetype.id;
    const tips = ARCHETYPE_EXPLOITS[archetypeId] || ARCHETYPE_EXPLOITS.gto_neutral;
    const color = villain.vpip > 40 ? '#f97316' : villain.vpip > 25 ? '#fbbf24' : '#4ade80';

    return (
        <div style={{ margin: '12px 0', borderRadius: 10, border: '1px solid rgba(167,139,250,0.25)', background: 'rgba(139,92,246,0.06)', overflow: 'hidden' }}>
            <button onClick={() => { setOpen(o => !o); try { navigator.vibrate?.(8); } catch (e) { } }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: 13, fontWeight: 700 }}>
                🃏 Villain Intel — {villain.archetype.name || archetypeId}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#65676B' }}>{open ? '▲' : '▼'}</span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#65676B', fontWeight: 600 }}>VPIP</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color }}>{villain.vpip ?? 'N/A'}%</span>
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 16px', listStyle: 'disc', color: '#B0B3B8', fontSize: 11, lineHeight: 1.6 }}>
                        {tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

// ── Wave 3: ShortcutLegend (W3-6) ──────────────────────────────────────────
export function ShortcutLegend({ isOpen, onClose }) {
    if (!isOpen) return null;
    const shortcuts = [
        ['A', 'Analyze hand'],
        ['R', 'Reset all'],
        ['U', 'Undo last change'],
        ['S', 'Save bookmark'],
        ['C', 'Toggle Coach Mode'],
        ['Esc', 'Close results panel'],
        ['?', 'Toggle this legend'],
    ];
    return (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 80, right: 16, zIndex: 9990, background: '#242526', border: '1px solid #4E4F50', borderRadius: 12, padding: '14px 16px', minWidth: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E4E6EB', textTransform: 'uppercase', letterSpacing: 1 }}>Keyboard Shortcuts</span>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#65676B', cursor: 'pointer', fontSize: 16, padding: 0 }}>✕</button>
            </div>
            {shortcuts.map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#B0B3B8' }}>{label}</span>
                    <kbd style={{ fontSize: 10, fontWeight: 700, color: '#E4E6EB', background: '#3A3B3C', border: '1px solid #4E4F50', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>{key}</kbd>
                </div>
            ))}
        </motion.div>
    );
}
