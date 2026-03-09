/**
 * Range Advisor — GTO Wizard-Style Range Selector
 * Phase 27 — Route: /hub/training/range-advisor
 */
import React, { useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { eventBus, EventType, busEmit } from '../../../src/engine/EventBus';


const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Compact GTO RFI ranges keyed by hand notation (e.g. 'AKs', 'AKo', 'AA')
const BTN_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'AKo', 'AQo', 'AJo', 'ATo', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'K7s', 'KQo', 'KJo', 'KTo', 'QJs', 'QTs', 'Q9s', 'QJo', 'QTo', 'JTs', 'J9s', 'J8s', 'JTo', 'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s', '64s', '54s', '53s', '43s']);
const CO_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'AKo', 'AQo', 'AJo', 'ATo', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'KQo', 'KJo', 'QJs', 'QTs', 'Q9s', 'QJo', 'JTs', 'J9s', 'J8s', 'T9s', 'T8s', '98s', '97s', '87s', '86s', '76s', '75s', '65s']);
const HJ_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A5s', 'AKo', 'AQo', 'AJo', 'KQs', 'KJs', 'KTs', 'K9s', 'KQo', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s']);
const MP_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'AKo', 'AQo', 'KQs', 'KJs', 'KTs', 'KQo', 'QJs', 'QTs', 'JTs', 'J9s', 'T9s', '98s', '87s', '76s']);
const UTG_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AQs', 'AJs', 'ATs', 'AKo', 'AQo', 'KQs', 'KJs', 'KQo', 'QJs', 'JTs', 'T9s', '98s', '87s']);
const SB_RFI = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', 'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A5s', 'A4s', 'AKo', 'AQo', 'AJo', 'ATo', 'KQs', 'KJs', 'KTs', 'K9s', 'KQo', 'KJo', 'QJs', 'QTs', 'JTs', 'J9s', 'T9s', 'T8s', '98s', '87s', '76s', '65s']);
const BB_CALL = new Set(['A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s', 'AJo', 'ATo', 'A9o', '66', '55', '44', '33', '22', 'KQs', 'KJs', 'KTs', 'K9s', 'K8s', 'KQo', 'KJo', 'QTs', 'QJs', 'Q9s', 'Q8s', 'QJo', 'JTs', 'J9s', 'J8s', 'J7s', 'T9s', 'T8s', 'T7s', '98s', '97s', '96s', '87s', '86s', '85s', '76s', '75s', '74s', '65s', '64s', '54s', '53s', '43s']);
const BB_RAISE = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', 'AKs', 'AQs', 'AKo', 'AQo', 'A2s', 'A3s', 'A4s', 'A5s']);

const BTN_3BET = new Set(['AA', 'KK', 'QQ', 'JJ', 'TT', 'AKs', 'AQs', 'AKo', 'A5s', 'A4s', 'KQs', 'J9s', 'T9s', '98s', '87s']);
const CO_3BET = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AKo', 'AQo', 'A5s', 'KQs', 'QJs', 'J9s', '98s']);
const SB_3BET = new Set(['AA', 'KK', 'QQ', 'JJ', 'AKs', 'AQs', 'AJs', 'AKo', 'AQo', 'A5s', 'A4s', 'A3s', 'KQs', 'QJs', 'J9s', 'T9s', '98s', '87s']);

function getRaise(position, action) {
    if (action === 'rfi') {
        if (position === 'BTN') return BTN_RFI;
        if (position === 'CO') return CO_RFI;
        if (position === 'HJ') return HJ_RFI;
        if (position === 'MP') return MP_RFI;
        if (position === 'UTG') return UTG_RFI;
        if (position === 'SB') return SB_RFI;
        if (position === 'BB') return BB_RAISE;
    }
    if (action === '3bet') {
        if (position === 'BTN') return BTN_3BET;
        if (position === 'CO') return CO_3BET;
        if (position === 'SB') return SB_3BET;
        return BTN_3BET;
    }
    return new Set(); // call action
}
function getCall(position, action) {
    if (position === 'BB' && action === 'rfi') return BB_CALL;
    if (action === 'call') return position === 'BB' ? BB_CALL : CO_RFI;
    if (action === '3bet') return new Set(['99', '88', '77', 'AJs', 'ATs', 'KJs', 'JTs', 'T9s', '87s']);
    return new Set();
}

function handKey(r1, r2, suited) {
    const i = RANKS.indexOf(r1), j = RANKS.indexOf(r2);
    if (i === j) return r1 + r2;
    return (i < j ? r1 + r2 : r2 + r1) + (suited ? 's' : 'o');
}

const ACTION_COLORS = {
    raise: { bg: 'rgba(34,197,94,0.75)', border: '#22c55e', text: '#fff' },
    call: { bg: 'rgba(59,130,246,0.65)', border: '#3b82f6', text: '#fff' },
    fold: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.07)', text: '#334155' },
};

const TIPS = {
    rfi: 'Open range width is position-dependent. Button opens ~48% of hands; UTG only ~15%. Always open for value + mix in suited connectors to stay balanced.',
    '3bet': '3-bet ranges use a polar strategy: strong value hands (AA-JJ, AK) + blocker bluffs (A5s, A4s, J9s). Avoid 3-bet/folding with medium hands.',
    call: 'Flat-call when 3-betting would break your balance or you lack a strong enough hand. Position and stack depth heavily influence when to call vs 3-bet.',
};

const TOP5 = {
    BTN_rfi: [
        { hand: 'AA–JJ', r: 'Premium pairs — always raise for value on BTN.' },
        { hand: 'AKs/AKo', r: 'Dominates calling range. Never limp premium hands.' },
        { hand: 'A5s–A2s', r: 'Nut-flush potential + blocker. GTO bluffing combos.' },
        { hand: 'T9s–87s', r: 'Connected hands exploit BTN\'s position post-flop.' },
        { hand: '65s–43s', r: 'Wide BTN steals exploit tight BB folding frequency.' },
    ],
    CO_rfi: [
        { hand: 'AA–66', r: 'Wide pair range — position makes these highly profitable.' },
        { hand: 'AKo/AQo', r: 'All offsuit premiums still +EV from CO.' },
        { hand: 'All Axs', r: 'Backdoor flush + blocker on every Axs hand.' },
        { hand: 'QJs/T9s', r: 'High-connectivity for post-flop playability.' },
        { hand: '76s/65s', r: 'CO fold equity makes marginal suited opens +EV.' },
    ],
    UTG_rfi: [
        { hand: 'AA–88', r: 'Only premiums — 5 players still to act from UTG.' },
        { hand: 'AKs/AQs/AJs', r: 'Suited aces with post-flop playability.' },
        { hand: 'AKo', r: 'Only offsuit Ax worth opening from UTG.' },
        { hand: 'KQs/KJs/QJs', r: 'Broadway suited — have blocking value.' },
        { hand: 'JTs/T9s', r: 'Suited connectors needed to balance range.' },
    ],
    BB_rfi: [
        { hand: 'AA–TT (3-bet)', r: 'Always 3-bet for value and pot protection.' },
        { hand: 'A2s–A5s (3-bet bluff)', r: 'Blocker to top pair + nut flush potential.' },
        { hand: 'Wide call range', r: 'BB gets best price — defend wide to exploit opens.' },
        { hand: '22–55 (call)', r: 'Set-mining +EV with correct implied odds from BB.' },
        { hand: 'K8s+/Q9s+', r: 'Mid-strength hands worth defending for board coverage.' },
    ],
};
function getTop5(pos, act) {
    return TOP5[`${pos}_${act}`] || TOP5[`BTN_${act}`] || TOP5.BTN_rfi;
}

function RangeGrid({ raise, call, onHover, hoveredHand }) {
    const cells = useMemo(() => {
        const out = [];
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[i], r2 = RANKS[j];
                const isPair = i === j, isSuited = j < i;
                const key = handKey(r1, r2, !isPair && isSuited);
                const act = isPair ? (raise.has(key) ? 'raise' : call.has(key) ? 'call' : 'fold')
                    : (raise.has(key) ? 'raise' : call.has(key) ? 'call' : 'fold');
                out.push({ key, act, label: isPair ? r1 + r2 : r1 + r2 + (isSuited ? 's' : 'o'), short: r1 + (r1 === r2 ? r2 : r2 + (isSuited ? 's' : 'o')) });
            }
        }
        return out;
    }, [raise, call]);

    return (
        <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 24px)', gap: 1, userSelect: 'none' }}>
                {cells.map(({ key, act, label }) => {
                    const c = ACTION_COLORS[act];
                    const hov = hoveredHand === key;
                    return (
                        <motion.div key={key} whileHover={{ scale: 1.18, zIndex: 10 }}
                            onMouseEnter={() => onHover(key, act, label)}
                            onMouseLeave={() => onHover(null, null, null)}
                            title={label}
                            style={{ width: 24, height: 24, background: hov ? '#fff' : c.bg, border: `1px solid ${hov ? '#fff' : c.border}`, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                            <span style={{ fontSize: 6.5, fontWeight: 700, color: hov ? '#000' : c.text, lineHeight: 1, fontFamily: "'Inter',sans-serif" }}>
                                {label.replace(/[so]$/, '')}
                            </span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

const POSITIONS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const SITUATIONS = [
    { id: 'rfi', label: 'Open Raise (RFI)', icon: '🚀' },
    { id: '3bet', label: '3-Bet Range', icon: '⚡' },
    { id: 'call', label: 'Call / Defend', icon: '📞' },
];

export default function RangeAdvisor() {
    const router = useRouter();
    useTrainingBus('range-advisor');
    const [position, setPosition] = useState('BTN');
    const [action, setAction] = useState('rfi');
    const [hovered, setHovered] = useState({ key: null, act: null, label: null });
    const [studyCount, setStudyCount] = useState(0);

    const raise = useMemo(() => getRaise(position, action), [position, action]);
    const call = useMemo(() => getCall(position, action), [position, action]);
    const top5 = useMemo(() => getTop5(position, action), [position, action]);

    const handlePosition = useCallback((pos) => {
        setPosition(pos);
        const n = studyCount + 1;
        setStudyCount(n);
        eventBus.emit('training:session-complete', { game_id: 'range-advisor', accuracy: 100, hands_played: n, correct_answers: n, total_questions: n });
    }, [studyCount]);

    const handleHover = useCallback((key, act, label) => setHovered({ key, act, label }), []);

    const raiseCount = raise.size, callCount = call.size;

    return (<>
        <Head>
            <title>Range Advisor | Smarter.Poker GTO Training</title>
            <meta name="description" content="GTO Wizard-style range advisor. See solver-recommended opening and 3-bet ranges by position." />
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Orbitron:wght@700;900&display=swap" rel="stylesheet" />
        </Head>
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a0f1e 0%,#0d1629 60%,#0a0f1e 100%)', color: '#e2e8f0', fontFamily: "'Inter',sans-serif" }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <button onClick={() => router.push('/hub/training')} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>← Training</button>
                    <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#22c55e,#00d4ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: "'Orbitron',monospace" }}>Range Advisor</h1>
                    <span style={{ fontSize: 10, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: 12, fontWeight: 700, border: '1px solid rgba(34,197,94,0.25)', fontFamily: "'Orbitron',monospace" }}>PHASE 27</span>
                </div>
            </div>

            <div style={{ padding: '16px 24px', maxWidth: 900, margin: '0 auto' }}>
                {/* Controls */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <div style={{ flex: '1 1 220px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: "'Orbitron',monospace" }}>Position</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {POSITIONS.map(pos => (
                                <button key={pos} onClick={() => handlePosition(pos)} style={{ padding: '6px 11px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: 'pointer', border: 'none', background: position === pos ? 'linear-gradient(135deg,#22c55e,#00d4ff)' : 'rgba(255,255,255,0.06)', color: position === pos ? '#000' : '#94a3b8', fontFamily: "'Orbitron',monospace" }}>{pos}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: '1 1 280px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: "'Orbitron',monospace" }}>Situation</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {SITUATIONS.map(s => (
                                <button key={s.id} onClick={() => setAction(s.id)} style={{ padding: '6px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: action === s.id ? 'linear-gradient(135deg,#22c55e,#00d4ff)' : 'rgba(255,255,255,0.06)', color: action === s.id ? '#000' : '#94a3b8' }}>{s.icon} {s.label}</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                    {[{ label: 'Raise / Open', value: raiseCount, color: '#22c55e' }, { label: 'Call / Defend', value: callCount, color: '#3b82f6' }, { label: 'Total Hands', value: raiseCount + callCount, color: '#00d4ff' }].map(s => (
                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'Orbitron',monospace" }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Grid + Sidebar */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: 14, alignItems: 'start' }}>
                    {/* Grid */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 12px' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, fontFamily: "'Orbitron',monospace" }}>
                            169-Hand Grid — {position} {SITUATIONS.find(s => s.id === action)?.label}
                        </div>
                        <RangeGrid raise={raise} call={call} onHover={handleHover} hoveredHand={hovered.key} />
                        {/* Legend */}
                        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                            {Object.entries(ACTION_COLORS).map(([act, c]) => (
                                <div key={act} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c.bg, border: `1px solid ${c.border}` }} />
                                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'capitalize' }}>{act}</span>
                                </div>
                            ))}
                        </div>
                        {/* Hover tooltip */}
                        <AnimatePresence>
                            {hovered.key && (
                                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    style={{ marginTop: 10, padding: '8px 14px', background: ACTION_COLORS[hovered.act]?.bg || ACTION_COLORS.fold.bg, border: `1px solid ${ACTION_COLORS[hovered.act]?.border || '#333'}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 16, fontWeight: 900, fontFamily: "'Orbitron',monospace", color: '#fff' }}>{hovered.label}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textTransform: 'uppercase' }}>→ {hovered.act}</span>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Sidebar */}
                    <div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, fontFamily: "'Orbitron',monospace" }}>Top 5 Key Hands</div>
                            {top5.map((item, i) => (
                                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', marginBottom: 3, fontFamily: "'Orbitron',monospace" }}>{item.hand}</div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>{item.r}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: "'Orbitron',monospace" }}>GTO Principle</div>
                            <p style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>{TIPS[action]}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </>);
}
