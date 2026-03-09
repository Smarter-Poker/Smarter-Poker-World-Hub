/**
 * VILLAIN PRESET PICKER (W5-3)
 * Quick-select opponent profiles with pre-configured ranges.
 * Compact dropdown that fills villain range field.
 */
import { useState } from 'react';

const M = {
    card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', red: '#EF5350',
    gold: '#F5A623', text: '#E4E6EB', sub: '#B0B3B8',
    dim: 'rgba(255,255,255,0.4)',
};

const PRESETS = [
    {
        name: 'Nit', vpip: '12%', emoji: '🔒',
        color: '#60a5fa',
        desc: 'Only plays premium hands. Folds everything marginal.',
        range: 'AA,KK,QQ,JJ,TT,AKs,AQs,AKo',
        sizing: 'Large opens, rarely bluffs post-flop',
    },
    {
        name: 'TAG', vpip: '22%', emoji: '🎯',
        color: '#34d399',
        desc: 'Tight-Aggressive. Solid range, aggressive post-flop.',
        range: 'AA,KK,QQ,JJ,TT,99,88,AKs,AQs,AJs,ATs,KQs,KJs,AKo,AQo,AJo,KQo',
        sizing: 'Standard opens, balanced c-bets',
    },
    {
        name: 'LAG', vpip: '30%', emoji: '⚡',
        color: '#fbbf24',
        desc: 'Loose-Aggressive. Wide range, constant pressure.',
        range: 'AA,KK,QQ,JJ,TT,99,88,77,66,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A5s,A4s,KQs,KJs,KTs,K9s,QJs,QTs,JTs,T9s,98s,87s,76s,65s,AKo,AQo,AJo,ATo,KQo,KJo,QJo',
        sizing: 'Mixed sizes, frequent 3-bets',
    },
    {
        name: 'Maniac', vpip: '45%', emoji: '🔥',
        color: '#f87171',
        desc: 'Hyper-aggressive. Plays almost anything, overbets often.',
        range: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,QJs,QTs,Q9s,Q8s,JTs,J9s,T9s,T8s,98s,97s,87s,86s,76s,75s,65s,64s,54s,53s,43s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,KQo,KJo,KTo,K9o,QJo,QTo,JTo,J9o,T9o,98o',
        sizing: 'Overbets, frequent all-ins',
    },
    {
        name: 'Fish', vpip: '55%', emoji: '🐟',
        color: '#a78bfa',
        desc: 'Recreational. Calls wide, chases draws, rarely folds.',
        range: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,Q7s,Q6s,JTs,J9s,J8s,J7s,T9s,T8s,T7s,98s,97s,96s,87s,86s,76s,75s,65s,64s,54s,53s,43s,32s,AKo,AQo,AJo,ATo,A9o,A8o,A7o,A6o,A5o,A4o,KQo,KJo,KTo,K9o,K8o,QJo,QTo,Q9o,JTo,J9o,T9o,98o,87o,76o',
        sizing: 'Limps often, passive post-flop',
    },
];

export default function VillainPresetPicker({ onSelectPreset, onClose }) {
    const [selected, setSelected] = useState(null);

    const handleSelect = (preset) => {
        setSelected(preset.name);
        onSelectPreset?.(preset);
        try { navigator.vibrate?.(10); } catch (e) { }
        // Auto-close after brief delay so user sees the selection
        setTimeout(() => onClose?.(), 300);
    };

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                <div style={s.header}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>👤 Villain Profiles</span>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: M.sub, fontSize: 16, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {PRESETS.map(p => (
                        <button
                            key={p.name}
                            onClick={() => handleSelect(p)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 10,
                                background: selected === p.name ? `${p.color}15` : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${selected === p.name ? p.color + '44' : M.border}`,
                                cursor: 'pointer', textAlign: 'left',
                                outline: 'none', WebkitTapHighlightColor: 'transparent',
                                touchAction: 'manipulation',
                                transition: 'all 0.15s',
                            }}
                        >
                            <span style={{ fontSize: 22 }}>{p.emoji}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: p.color }}>{p.name}</span>
                                    <span style={{ fontSize: 9, color: M.dim, fontFamily: '"Orbitron", monospace' }}>{p.vpip} VPIP</span>
                                </div>
                                <div style={{ fontSize: 9, color: M.sub, lineHeight: 1.3, marginTop: 2 }}>{p.desc}</div>
                                <div style={{ fontSize: 8, color: M.dim, marginTop: 2, fontStyle: 'italic' }}>{p.sizing}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

const s = {
    overlay: {
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 999, padding: 12,
    },
    modal: {
        background: M.card,
        border: `1px solid ${M.border}`,
        borderRadius: 14,
        width: '100%', maxWidth: 400,
        maxHeight: '90vh', overflow: 'auto',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px 6px',
    },
};
