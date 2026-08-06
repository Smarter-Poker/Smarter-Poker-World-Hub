/**
 * OPPONENT PROFILER — Player Type Classification & Exploitative Adjustments
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 *
 * GTO Wizard-style opponent modeling tool:
 *   - Classify opponents into archetypes (TAG, LAG, NIT, Fish, Maniac)
 *   - Stat-based HUD display (VPIP, PFR, 3-bet, Agg%, WTSD)
 *   - Exploitative adjustment recommendations
 *   - Range weighting based on player type
 *   - Visual player profile cards
 *
 * Educational tool — teaches how to adapt GTO strategy vs different types.
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo, memo } from 'react';
import { motion } from 'framer-motion';

// ●● Player Archetypes ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const ARCHETYPES = {
    TAG: {
        label: 'TAG',
        fullName: 'Tight-Aggressive',
        icon: '◆',
        color: '#3b82f6',
        stats: { vpip: 22, pfr: 18, threeBet: 8, aggPct: 42, wtsd: 28 },
        description: 'Plays a strong, selected range and bets aggressively with it. The default GTO-style player.',
        adjustments: [
            'Respect their raises — they usually have it',
            'Their check means weakness more often',
            'Can 3-bet light in position since they fold a lot preflop',
            'Float flop bets in position — they give up the turn often',
        ],
    },
    LAG: {
        label: 'LAG',
        fullName: 'Loose-Aggressive',
        icon: '▲',
        color: '#f59e0b',
        stats: { vpip: 30, pfr: 24, threeBet: 12, aggPct: 48, wtsd: 30 },
        description: 'Plays many hands and applies constant pressure. Harder to read — can have anything.',
        adjustments: [
            'Widen your calling range — they bluff more',
            'Trap with strong hands — let them hang themselves',
            'Tighten up your 3-bet bluffs — they call too wide',
            'Check-raise more often as a counter-aggression play',
        ],
    },
    NIT: {
        label: 'NIT',
        fullName: 'Tight-Passive',
        icon: '■',
        color: '#22c55e',
        stats: { vpip: 14, pfr: 10, threeBet: 4, aggPct: 28, wtsd: 22 },
        description: 'Only plays premium hands and avoids confrontation. Very predictable and easy to play against.',
        adjustments: [
            'Steal their blinds relentlessly — they fold too much',
            'When they raise, respect it — they have a monster',
            'Never bluff the river — they only call with strong hands',
            'C-bet 100% of flops — they fold anything below top pair',
        ],
    },
    FISH: {
        label: 'Fish',
        fullName: 'Loose-Passive',
        icon: '▲',
        color: '#ef4444',
        stats: { vpip: 45, pfr: 10, threeBet: 3, aggPct: 22, wtsd: 40 },
        description: 'Calls too much and rarely raises. Stations who see every flop and call down with weak hands.',
        adjustments: [
            'Value bet thinner — they call with much weaker hands',
            'Never bluff — they will call you down',
            'Size up your value bets — they are inelastic to sizing',
            'Isolate them preflop with wider range for position',
        ],
    },
    MANIAC: {
        label: 'Maniac',
        fullName: 'Ultra-Aggressive',
        icon: '▲',
        color: '#a855f7',
        stats: { vpip: 55, pfr: 40, threeBet: 20, aggPct: 60, wtsd: 35 },
        description: 'Raises and re-raises with a huge range. Creates massive pots with weak holdings. Volatile.',
        adjustments: [
            'Tighten way up — let them spew into your premiums',
            'Call down lighter — they have air very often',
            'Avoid 4-bet bluffing — they will 5-bet shove light',
            'Let them control the initiative, then snap off bluffs',
        ],
    },
    GTO: {
        label: 'GTO',
        fullName: 'Balanced/Solver',
        icon: '■',
        color: '#00d4ff',
        stats: { vpip: 25, pfr: 20, threeBet: 9, aggPct: 40, wtsd: 27 },
        description: 'Plays a balanced, unexploitable strategy. Mixed frequencies make them hard to read or exploit.',
        adjustments: [
            'Play your own GTO strategy — no exploitative adjustments work',
            'Focus on execution accuracy rather than reads',
            'Avoid trying to level or outplay — they are balanced',
            'Maximize your own GTO accuracy to minimize their edge',
        ],
    },
};

// ●● Stat Bar ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StatBar = memo(({ label, value, max = 60, color, description }) => (
    <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: '#94a3b8' }} title={description}>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#e2e8f0', fontFamily: "var(--font-orbitron), 'Orbitron', monospace" }}>
                {value}%
            </span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' }}>
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (value / max) * 100)}%` }}
                transition={{ duration: 0.6 }}
                style={{
                    height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg, ${color}66, ${color})`,
                }}
            />
        </div>
    </div>
));

// ●● Player Profile Card ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const ProfileCard = memo(({ archetype, isSelected, onClick }) => {
    const a = ARCHETYPES[archetype];
    if (!a) return null;

    return (
        <motion.div
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            style={{
                padding: 12, borderRadius: 10,
                background: isSelected ? `${a.color}08` : 'rgba(15,23,42,0.3)',
                border: `1.5px solid ${isSelected ? a.color + '33' : 'rgba(100,116,139,0.08)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>{a.icon}</span>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: a.color }}>{a.fullName}</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>{a.label}</div>
                </div>
            </div>

            {/* Stats HUD */}
            <div style={{ marginBottom: 8 }}>
                <StatBar label="VPIP" value={a.stats.vpip} max={60} color={a.color} description="Voluntarily Put $ In Pot" />
                <StatBar label="PFR" value={a.stats.pfr} max={45} color={a.color} description="Preflop Raise %" />
                <StatBar label="3-Bet" value={a.stats.threeBet} max={25} color={a.color} description="3-Bet Frequency" />
                <StatBar label="Agg%" value={a.stats.aggPct} max={65} color={a.color} description="Aggression %" />
                <StatBar label="WTSD" value={a.stats.wtsd} max={45} color={a.color} description="Went to Showdown %" />
            </div>

            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, fontStyle: 'italic' }}>
                {a.description}
            </div>
        </motion.div>
    );
});

// ●● Exploitative Adjustment Panel ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const AdjustmentsPanel = memo(({ archetype }) => {
    const a = ARCHETYPES[archetype];
    if (!a) return null;

    return (
        <div style={{
            padding: 12, borderRadius: 8,
            background: `${a.color}06`,
            border: `1px solid ${a.color}15`,
        }}>
            <div style={{
                fontSize: 11, fontWeight: 700, color: a.color, marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
                Exploitative Adjustments vs {a.fullName}
            </div>
            {a.adjustments.map((adj, i) => (
                <div key={i} style={{
                    display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start',
                }}>
                    <div style={{
                        width: 16, height: 16, borderRadius: '50%',
                        background: `${a.color}15`, border: `1px solid ${a.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, fontWeight: 700, color: a.color, flexShrink: 0,
                    }}>
                        {i + 1}
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.5 }}>
                        {adj}
                    </div>
                </div>
            ))}
        </div>
    );
});

// ●● Stat Comparison Table ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

const StatComparisonTable = memo(({ selectedTypes }) => {
    const stats = ['vpip', 'pfr', 'threeBet', 'aggPct', 'wtsd'];
    const labels = { vpip: 'VPIP', pfr: 'PFR', threeBet: '3-Bet', aggPct: 'Agg%', wtsd: 'WTSD' };

    return (
        <div style={{
            padding: 10, borderRadius: 8,
            background: 'rgba(0,0,0,0.15)',
            border: '1px solid rgba(100,116,139,0.08)',
        }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>
                Stat Comparison
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${selectedTypes.length}, 1fr)`, gap: 4 }}>
                {/* Header */}
                <div style={{ fontSize: 8, color: '#475569', fontWeight: 600 }}>Stat</div>
                {selectedTypes.map(t => (
                    <div key={t} style={{
                        fontSize: 8, fontWeight: 700, color: ARCHETYPES[t].color,
                        textAlign: 'center',
                    }}>
                        {ARCHETYPES[t].label}
                    </div>
                ))}
                {/* Rows */}
                {stats.map(s => (
                    <React.Fragment key={s}>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{labels[s]}</div>
                        {selectedTypes.map(t => (
                            <div key={t} style={{
                                fontSize: 11, fontWeight: 700, textAlign: 'center',
                                color: '#e2e8f0', fontFamily: "var(--font-orbitron), 'Orbitron', monospace",
                            }}>
                                {ARCHETYPES[t].stats[s]}%
                            </div>
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
});

// ●● Main Component ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●

export default function OpponentProfiler() {
    const [selectedType, setSelectedType] = useState('TAG');
    const [compareMode, setCompareMode] = useState(false);
    const [compareTypes, setCompareTypes] = useState(['TAG', 'LAG', 'FISH']);

    const toggleCompareType = (type) => {
        setCompareTypes(prev => {
            if (prev.includes(type)) return prev.filter(t => t !== type);
            if (prev.length >= 4) return prev;
            return [...prev, type];
        });
    };

    return (
        <div style={{
            background: 'rgba(15,23,42,0.4)',
            borderRadius: 12,
            border: '1px solid rgba(100,116,139,0.15)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.12)',
                background: 'rgba(0,0,0,0.2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
                    Opponent Profiler
                </div>
                <button
                    onClick={() => setCompareMode(!compareMode)}
                    style={{
                        padding: '3px 10px', fontSize: 10, fontWeight: 600,
                        borderRadius: 4, border: '1px solid',
                        cursor: 'pointer',
                        background: compareMode ? 'rgba(0,212,255,0.1)' : 'transparent',
                        color: compareMode ? '#00d4ff' : '#64748b',
                        borderColor: compareMode ? 'rgba(0,212,255,0.2)' : 'rgba(100,116,139,0.12)',
                    }}
                >
                    {compareMode ? 'Single' : 'Compare'}
                </button>
            </div>

            {/* Type selector */}
            <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(100,116,139,0.08)',
                display: 'flex', gap: 4, flexWrap: 'wrap',
            }}>
                {Object.entries(ARCHETYPES || {}).map(([key, a]) => (
                    <button
                        key={key}
                        onClick={() => compareMode ? toggleCompareType(key) : setSelectedType(key)}
                        style={{
                            padding: '4px 10px', fontSize: 10, fontWeight: 600,
                            borderRadius: 5, border: '1px solid',
                            cursor: 'pointer',
                            background: (compareMode ? compareTypes.includes(key) : selectedType === key)
                                ? `${a.color}15` : 'transparent',
                            color: (compareMode ? compareTypes.includes(key) : selectedType === key)
                                ? a.color : '#64748b',
                            borderColor: (compareMode ? compareTypes.includes(key) : selectedType === key)
                                ? `${a.color}33` : 'rgba(100,116,139,0.1)',
                        }}
                    >
                        {a.icon} {a.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div style={{ padding: 12 }}>
                {compareMode ? (
                    <>
                        <StatComparisonTable selectedTypes={compareTypes} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
                            {compareTypes.map(t => (
                                <ProfileCard key={t} archetype={t} isSelected={true} onClick={() => {}} />
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <ProfileCard archetype={selectedType} isSelected={true} onClick={() => {}} />
                        <div style={{ marginTop: 10 }}>
                            <AdjustmentsPanel archetype={selectedType} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
