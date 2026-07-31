/**
 * VILLAIN PRESET PICKER (W5-3)
 * ═══════════════════════════════════════════════════════════════════════════
 * Quick-select opponent profiles. Every profile is now sourced from the
 * canonical ARCHETYPE_CONFIG in src/lib/sandbox/VillainArchetypeRanges so the
 * range that gets applied, the VPIP that gets displayed and the archetype the
 * villain simulator uses can never disagree.
 *
 * The sheet stays open after a selection (multi-seat setups need it) and shows
 * a 13x13 preview of the range being applied.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Users, Check, Snowflake, Target, Zap, Fish, Phone, Flame, Scale } from 'lucide-react';
import { T, F, S, R, btn, pill, numeric } from './paTokens';
import { BottomSheet, PAStyles, Segmented } from './paKit';
import {
    ARCHETYPE_CONFIG,
    getArchetypeRangeString,
    getArchetypeVPIP,
} from '../../lib/sandbox/VillainArchetypeRanges';
import { RANKS, parseRange, countCombos } from './RangeExplorer';

const ICONS = {
    Snowflake, Target, Zap, Fish, Phone, Flame, Scale,
};

// Display order — tightest to loosest, GTO baseline last.
const ORDER = ['nit', 'tag', 'lag', 'calling_station', 'fish', 'maniac', 'gto_neutral'];

/** Tiny 13x13 preview so the user sees the shape of what they are applying. */
function RangeMiniMap({ range }) {
    const cells = useMemo(() => parseRange(range || ''), [range]);
    return (
        <div
            aria-hidden="true"
            style={{
                display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: 1,
                width: 104, flexShrink: 0,
            }}
        >
            {RANKS.flatMap((_, i) => RANKS.map((__, j) => {
                const on = !!cells[`${i},${j}`];
                const tone = i === j ? T.success : i < j ? T.accent : T.warn;
                return (
                    <div
                        key={`${i},${j}`}
                        style={{
                            aspectRatio: '1',
                            background: on ? tone : T.surface,
                            opacity: on ? 0.9 : 0.35,
                            borderRadius: 1,
                        }}
                    />
                );
            }))}
        </div>
    );
}

export default function VillainPresetPicker({
    onSelectPreset,
    onClose,
    /** Optional — enables the seat selector for multi-villain setups. */
    villains = [],
    initialVillainIdx = 0,
}) {
    const seats = Array.isArray(villains) ? villains : [];
    const [villainIdx, setVillainIdx] = useState(() => (
        seats.length > 0 ? Math.min(Math.max(0, initialVillainIdx), seats.length - 1) : 0
    ));
    const [appliedTo, setAppliedTo] = useState({}); // { [archetypeId]: seatLabel }
    const [expanded, setExpanded] = useState(null);

    const seat = seats[villainIdx] || null;
    const seatPosition = seat?.position || 'BB';
    const seatLabel = seat?.position || (seats.length > 1 ? `Seat ${villainIdx + 1}` : 'the villain');

    const presets = useMemo(() => ORDER
        .filter(id => ARCHETYPE_CONFIG[id])
        .map(id => {
            const cfg = ARCHETYPE_CONFIG[id];
            let range = '';
            let vpip = null;
            try {
                range = getArchetypeRangeString(id, seatPosition, 'open') || '';
                vpip = getArchetypeVPIP(id, seatPosition);
            } catch (e) {
                console.warn('[VillainPresetPicker] archetype lookup failed:', e?.message || e);
            }
            return {
                id,
                name: cfg.name,
                icon: cfg.icon,
                colour: cfg.color || T.accent,
                desc: cfg.description || '',
                tip: cfg.postflopTip || '',
                range,
                vpip,
            };
        }), [seatPosition]);

    const handleSelect = useCallback((preset) => {
        if (!preset?.range) return;
        // The page reads `preset.range`; `archetype` is shipped alongside so the
        // villain read card and the simulator adopt the profile, not just the
        // range. Extra keys are ignored by older handlers.
        onSelectPreset?.({
            ...preset,
            archetype: { id: preset.id, name: preset.name, color: preset.colour },
        }, villainIdx);
        setAppliedTo(prev => ({ ...prev, [preset.id]: seatLabel }));
        try { navigator.vibrate?.(10); } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
    }, [onSelectPreset, villainIdx, seatLabel]);

    return (
        <BottomSheet
            open
            onClose={onClose}
            title="Villain profiles"
            titleIcon={<Users size={18} strokeWidth={2} color={T.accent} />}
            subtitle={`Ranges shown for ${seatPosition}`}
            ariaLabel="Villain profile picker"
            footer={(
                <button type="button" className="pa-btn" onClick={onClose} style={{ ...btn('primary'), flex: 1 }}>
                    Done
                </button>
            )}
        >
            <PAStyles />

            {seats.length > 1 && (
                <div style={{ marginBottom: S.lg }}>
                    <Segmented
                        label="Apply to seat"
                        idPrefix="vp-seat"
                        value={villainIdx}
                        onChange={(idx) => { setVillainIdx(idx); setAppliedTo({}); }}
                        options={seats.map((v, i) => ({ value: i, label: v?.position || `Seat ${i + 1}` }))}
                    />
                </div>
            )}

            {presets.length === 0 ? (
                <div style={{ fontSize: F.bodySm, color: T.textMuted, lineHeight: 1.45 }}>
                    Opponent profiles are unavailable right now. Set a range by hand in the Range Explorer instead.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S.md }}>
                    {presets.map(p => {
                        const Icon = ICONS[p.icon] || Users;
                        const applied = appliedTo[p.id];
                        const open = expanded === p.id;
                        const combos = countCombos(parseRange(p.range));
                        return (
                            <div
                                key={p.id}
                                style={{
                                    background: T.surface2, border: `1px solid ${applied ? `${p.colour}66` : T.border}`,
                                    borderRadius: R.md, padding: S.md, boxSizing: 'border-box', width: '100%',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.md }}>
                                    <div style={{
                                        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                        background: `${p.colour}26`, color: p.colour,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Icon size={18} strokeWidth={2} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: F.h3, fontWeight: 800, color: p.colour }}>{p.name}</span>
                                            {p.vpip != null && (
                                                <span style={{ ...pill('neutral'), ...numeric }}>{p.vpip}% VPIP</span>
                                            )}
                                            {applied && (
                                                <span style={pill('success')}>
                                                    <Check size={12} strokeWidth={3} /> Applied to {applied}
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: F.bodySm, color: T.textMuted, margin: `${S.xs}px 0 0`, lineHeight: 1.45 }}>
                                            {p.desc}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: S.sm, marginTop: S.md, flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        onClick={() => handleSelect(p)}
                                        style={{
                                            ...btn('secondary'), flex: '1 1 140px', fontSize: F.label,
                                            background: `${p.colour}1F`, color: p.colour, borderColor: `${p.colour}55`,
                                        }}
                                    >
                                        Apply to {seatLabel}
                                    </button>
                                    <button
                                        type="button"
                                        className="pa-btn"
                                        aria-expanded={open}
                                        onClick={() => setExpanded(open ? null : p.id)}
                                        style={{ ...btn('ghost'), fontSize: F.label, padding: '0 12px', color: T.accent }}
                                    >
                                        {open ? 'Hide range' : 'Preview range'}
                                    </button>
                                </div>

                                {open && (
                                    <div style={{ display: 'flex', gap: S.md, alignItems: 'center', marginTop: S.md, flexWrap: 'wrap' }}>
                                        <RangeMiniMap range={p.range} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: F.caption, color: T.textMuted, ...numeric }}>
                                                {combos} combos ({((combos / 1326) * 100).toFixed(1)}%)
                                            </div>
                                            {p.tip && (
                                                <div style={{ fontSize: F.caption, color: T.textDim, marginTop: S.xs, lineHeight: 1.45 }}>
                                                    {p.tip}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </BottomSheet>
    );
}
