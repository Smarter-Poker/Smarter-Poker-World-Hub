/**
 * RANGE EXPLORER — Interactive 13×13 Range Grid
 * Tap cells to toggle, load presets, export range strings.
 * Integrates with sandbox villain range field.
 */
import { useState, useCallback, useMemo } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

// Common presets (PokerStove format subsets)
const PRESETS = {
    'UTG Open': 'AA,KK,QQ,JJ,TT,99,AKs,AQs,AJs,ATs,KQs,AKo,AQo',
    'CO Open': 'AA,KK,QQ,JJ,TT,99,88,77,AKs,AQs,AJs,ATs,A9s,A8s,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,AKo,AQo,AJo,KQo',
    'BTN Open': 'AA,KK,QQ,JJ,TT,99,88,77,66,55,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,QJs,QTs,Q9s,JTs,J9s,T9s,T8s,98s,97s,87s,86s,76s,65s,54s,AKo,AQo,AJo,ATo,A9o,KQo,KJo,KTo,QJo,QTo,JTo',
    'BB Defend': 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KJs,KTs,K9s,K8s,K7s,K6s,K5s,QJs,QTs,Q9s,Q8s,Q7s,JTs,J9s,J8s,T9s,T8s,T7s,98s,97s,87s,86s,76s,75s,65s,64s,54s,43s,AKo,AQo,AJo,ATo,A9o,A8o,KQo,KJo,KTo,K9o,QJo,QTo,JTo,J9o,T9o',
    '3-Bet (IP)': 'AA,KK,QQ,JJ,TT,AKs,AQs,AJs,AKo,AQo,A5s,A4s,KQs',
    'Clear All': '',
};

function parseRange(str) {
    const cells = {};
    if (!str) return cells;
    str.split(',').forEach(combo => {
        combo = combo.trim();
        if (combo.length < 2) return;
        const r1 = combo[0], r2 = combo[1];
        const suffix = combo[2] || '';
        const i = RANKS.indexOf(r1), j = RANKS.indexOf(r2);
        if (i < 0 || j < 0) return;
        if (suffix === 's' || (i !== j && !suffix)) {
            // suited = above diagonal (row < col)
            const key = i < j ? `${i},${j}` : `${j},${i}`;
            cells[key] = true;
        }
        if (suffix === 'o' || (i !== j && !suffix)) {
            // offsuit = below diagonal (row > col)
            const key = i > j ? `${i},${j}` : `${j},${i}`;
            cells[key] = true;
        }
        if (i === j) {
            cells[`${i},${j}`] = true;
        }
    });
    return cells;
}

function cellsToRange(cells) {
    const parts = [];
    for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 13; j++) {
            if (!cells[`${i},${j}`]) continue;
            const r1 = RANKS[i], r2 = RANKS[j];
            if (i === j) parts.push(`${r1}${r2}`);
            else if (i < j) parts.push(`${r1}${r2}s`);
            else parts.push(`${r2}${r1}o`);
        }
    }
    return parts.join(',');
}

const M = {
    bg: '#1a1d21', card: '#242526', border: '#3a3b3c',
    cyan: '#4599FF', green: '#00E676', gold: '#F5A623',
    text: '#E4E6EB', sub: '#B0B3B8', dim: 'rgba(255,255,255,0.4)',
};

/**
 * Combo-weighted range share: pairs are 6 combos, suited 4, offsuit 12,
 * out of the 1326 possible starting hands. Counting cells equally
 * (count/169) badly misreports e.g. "all pairs" as 7.7% instead of 5.9%.
 */
function comboWeight(i, j) {
    if (i === j) return 6;      // pocket pair
    if (i < j) return 4;        // suited (above diagonal)
    return 12;                  // offsuit (below diagonal)
}

export default function RangeExplorer({ onSelectRange, onClose, initialRange = '' }) {
    const [cells, setCells] = useState(() => parseRange(initialRange));
    const count = useMemo(() => Object.keys(cells || {}).filter(k => cells[k]).length, [cells]);
    const combos = useMemo(() => Object.keys(cells || {}).reduce((sum, key) => {
        if (!cells[key]) return sum;
        const [i, j] = key.split(',').map(Number);
        if (!Number.isFinite(i) || !Number.isFinite(j)) return sum;
        return sum + comboWeight(i, j);
    }, 0), [cells]);
    const pct = ((combos / 1326) * 100).toFixed(1);

    const toggle = useCallback((i, j) => {
        setCells(prev => ({ ...prev, [`${i},${j}`]: !prev[`${i},${j}`] }));
        try { navigator.vibrate?.(5); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, []);

    const loadPreset = (name) => {
        const str = PRESETS[name];
        setCells(str ? parseRange(str) : {});
        try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    };

    const handleApply = () => {
        const rangeStr = cellsToRange(cells);
        onSelectRange?.(rangeStr);
        onClose?.();
    };

    return (
        <div style={s.overlay} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={s.header}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: M.text }}>{'🎯 Range Explorer'}</span>
                    <span style={{ fontSize: 10, color: M.sub }}>{count}/169 cells · {combos} combos ({pct}%)</span>
                    <button onClick={onClose} style={s.closeBtn}>✕</button>
                </div>

                {/* Preset Buttons */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '0 8px 8px', justifyContent: 'center' }}>
                    {Object.keys(PRESETS || {}).map(name => (
                        <button key={name} onClick={() => loadPreset(name)} style={{
                            padding: '4px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700,
                            background: name === 'Clear All' ? 'rgba(239,68,68,0.12)' : 'rgba(35,116,225,0.12)',
                            border: `1px solid ${name === 'Clear All' ? 'rgba(239,68,68,0.3)' : 'rgba(35,116,225,0.3)'}`,
                            color: name === 'Clear All' ? '#fca5a5' : M.cyan,
                            cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
                        }}>{name}</button>
                    ))}
                </div>

                {/* 13×13 Grid */}
                <div style={s.grid}>
                    {RANKS.map((r1, i) =>
                        RANKS.map((r2, j) => {
                            const isPair = i === j;
                            const isSuited = i < j;
                            const active = !!cells[`${i},${j}`];
                            const label = isPair ? `${r1}${r2}` : isSuited ? `${r1}${r2}s` : `${r2}${r1}o`;
                            return (
                                <button
                                    key={`${i},${j}`}
                                    onClick={() => toggle(i, j)}
                                    style={{
                                        ...s.cell,
                                        background: active
                                            ? isPair ? 'rgba(0,230,118,0.35)' : isSuited ? 'rgba(69,153,255,0.35)' : 'rgba(245,166,35,0.35)'
                                            : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${active
                                            ? isPair ? M.green + '66' : isSuited ? M.cyan + '66' : M.gold + '66'
                                            : M.border}`,
                                        color: active ? '#fff' : M.dim,
                                        fontWeight: active ? 800 : 500,
                                    }}
                                >
                                    {label}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '6px 0', fontSize: 8, color: M.sub }}>
                    <span>{'🟢 Pair'}</span>
                    <span>{'🔵 Suited'}</span>
                    <span>{'🟠 Offsuit'}</span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8, padding: '0 8px 10px' }}>
                    <button onClick={handleApply} style={s.applyBtn}>
                        Apply as Villain Range
                    </button>
                    <button onClick={() => {
                        const str = cellsToRange(cells);
                        if (typeof navigator?.clipboard?.writeText === 'function') {
                            navigator.clipboard.writeText(str);
                            try { navigator.vibrate?.(15); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
                        }
                    }} style={s.copyBtn}>
                        Copy
                    </button>
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
        zIndex: 999, padding: 8,
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
        padding: '10px 12px 6px', gap: 8,
    },
    closeBtn: {
        background: 'none', border: 'none',
        color: M.sub, fontSize: 16, cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(13, 1fr)',
        gap: 1, padding: '0 4px',
    },
    cell: {
        aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 6, borderRadius: 2, cursor: 'pointer',
        outline: 'none', WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation', padding: 0,
        transition: 'background 0.15s',
    },
    applyBtn: {
        flex: 1, padding: '10px 0', borderRadius: 8,
        background: 'rgba(35,116,225,0.15)', border: '1px solid rgba(35,116,225,0.4)',
        color: M.cyan, fontSize: 12, fontWeight: 700,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
    copyBtn: {
        padding: '10px 16px', borderRadius: 8,
        background: 'rgba(255,255,255,0.05)', border: `1px solid ${M.border}`,
        color: M.sub, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', outline: 'none', WebkitTapHighlightColor: 'transparent',
    },
};
