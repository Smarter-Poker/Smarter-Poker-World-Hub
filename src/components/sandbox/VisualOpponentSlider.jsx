/**
 * VisualOpponentSlider · Plain-English Tight-To-Loose Opponent Range Picker
 * ===========================================================================
 * Lets everyday players slide "What Hands Does Your Opponent Play?" from 10%
 * (Only Best Hands) to 100% (Any Two Cards) plus 4 one-tap hand-group chips:
 *   - Pocket Pairs
 *   - Big Aces
 *   - Suited Cards
 *   - Face Cards
 *
 * Emits a valid expandRangeToCombos-compatible range string live on every
 * change. Styled in #SMARTERDESIGN metallic chrome.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, LayoutGrid } from 'lucide-react';
import { buildRangeStringFromPercent } from '../../lib/sandbox/handEvaluatorSimple.mjs';
import { T, F, S, R, card, btn, pill, numeric as NUM } from './paTokens';

const HAND_GROUPS = [
  { id: 'pairs', label: 'Pocket Pairs', hint: 'AA To 22' },
  { id: 'aces', label: 'Big Aces', hint: 'All Ace Hands' },
  { id: 'suited', label: 'Suited Cards', hint: 'Same Suit' },
  { id: 'broadway', label: 'Face Cards', hint: 'Tens And Up' },
];

const QUICK_STYLES = [
  { pct: 12, label: 'Only Best' },
  { pct: 20, label: 'Tight' },
  { pct: 35, label: 'Typical' },
  { pct: 60, label: 'Loose' },
  { pct: 100, label: 'Any Two' },
];

function normalizeGroupsSet(activeGroups) {
  const out = new Set();
  if (Array.isArray(activeGroups)) {
    activeGroups.forEach((g) => { if (typeof g === 'string' && g) out.add(g); });
  } else if (activeGroups && typeof activeGroups === 'object') {
    Object.keys(activeGroups).forEach((k) => { if (activeGroups[k]) out.add(k); });
  }
  return out;
}

export default function VisualOpponentSlider({
  valuePercent = 25,
  activeGroups = null,
  onChangeRange = null,
  onOpenGrid = null,
}) {
  const [internalPct, setInternalPct] = useState(() => {
    const n = Number(valuePercent);
    return Number.isFinite(n) ? Math.max(10, Math.min(100, Math.round(n))) : 25;
  });
  const [internalGroups, setInternalGroups] = useState(() => normalizeGroupsSet(activeGroups));

  useEffect(() => {
    const n = Number(valuePercent);
    if (Number.isFinite(n)) {
      setInternalPct(Math.max(10, Math.min(100, Math.round(n))));
    }
  }, [valuePercent]);

  useEffect(() => {
    if (activeGroups != null) {
      setInternalGroups(normalizeGroupsSet(activeGroups));
    }
  }, [activeGroups]);

  const groupList = useMemo(() => [...internalGroups], [internalGroups]);
  const computed = useMemo(
    () => buildRangeStringFromPercent(internalPct, groupList),
    [internalPct, groupList],
  );

  const emitChange = useCallback((nextPct, nextGroupsSet) => {
    const clamped = Math.max(10, Math.min(100, Math.round(nextPct)));
    const nextList = [...nextGroupsSet];
    const next = buildRangeStringFromPercent(clamped, nextList);
    onChangeRange?.(next.rangeString, clamped, nextList);
  }, [onChangeRange]);

  const handleSliderChange = (rawVal) => {
    const nextPct = Math.max(10, Math.min(100, Math.round(Number(rawVal) || 25)));
    setInternalPct(nextPct);
    emitChange(nextPct, internalGroups);
  };

  const handleToggleGroup = (groupId) => {
    const next = new Set(internalGroups);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setInternalGroups(next);
    emitChange(internalPct, next);
  };

  return (
    <section
      aria-label="Opponent Range Slider"
      data-opponent-slider="true"
      style={{
        ...card,
        display: 'flex',
        flexDirection: 'column',
        gap: S.md,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S.sm }}>
          <SlidersHorizontal size={16} color={T.accent} aria-hidden="true" />
          <span style={{ fontSize: F.bodySm, fontWeight: 800, color: T.text }}>
            What Hands Does Your Opponent Play?
          </span>
        </div>
        <span style={{ ...pill('accent'), ...NUM }}>
          {`${computed.styleLabel} · ${computed.percentLabel}`}
        </span>
      </div>

      {/* Tight-To-Loose Slider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={internalPct}
          aria-label="Opponent Range Percentage From Tight To Loose"
          onChange={(e) => handleSliderChange(e.target.value)}
          style={{
            width: '100%',
            height: 36,
            accentColor: '#56D8FF',
            cursor: 'pointer',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            fontSize: F.caption,
            fontWeight: 700,
            color: T.textDim,
          }}
        >
          <span>Only Best Hands (10%)</span>
          <span>Any Two Cards (100%)</span>
        </div>
      </div>

      {/* 5 Quick Style Preset Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
        {QUICK_STYLES.map((preset) => {
          const isNear = Math.abs(internalPct - preset.pct) <= 4;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={isNear}
              onClick={() => handleSliderChange(preset.pct)}
              style={{
                minHeight: 38,
                padding: '4px 4px',
                borderRadius: R.sm,
                border: isNear ? '1px solid #56D8FF' : '1px solid rgba(140, 161, 180, 0.34)',
                background: isNear
                  ? 'linear-gradient(180deg, #1981EC, #0C55C0 45%, #07377E 100%)'
                  : 'linear-gradient(180deg, #1f354c 0%, #0d1d2e 100%)',
                color: isNear ? '#FFFFFF' : '#DCE5EF',
                fontSize: F.caption,
                fontWeight: 800,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>

      {/* 4 One-Tap Hand-Group Chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textDim }}>
          Always Include Hand Groups:
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: S.sm }}>
          {HAND_GROUPS.map((group) => {
            const active = internalGroups.has(group.id);
            return (
              <button
                key={group.id}
                type="button"
                aria-pressed={active}
                data-opponent-group={group.id}
                onClick={() => handleToggleGroup(group.id)}
                style={{
                  minHeight: 44,
                  padding: '6px 10px',
                  borderRadius: R.sm,
                  border: active ? '1.5px solid #4DE0A5' : '1px solid rgba(174, 192, 208, 0.3)',
                  background: active
                    ? 'linear-gradient(180deg, rgba(22, 126, 90, 0.48), rgba(8, 52, 38, 0.86))'
                    : 'rgba(13, 29, 46, 0.84)',
                  color: active ? '#D5FFF0' : T.text,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span style={{ fontSize: F.label, fontWeight: 800, lineHeight: 1.2 }}>
                  {group.label}
                </span>
                <span style={{ fontSize: F.caption, fontWeight: 600, color: active ? '#86EFAC' : T.textDim, lineHeight: 1.2 }}>
                  {group.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Info + Optional 13x13 Grid Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S.sm, flexWrap: 'wrap' }}>
        <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textMuted, ...NUM }}>
          {`${computed.handCount} Hand Types · ${computed.comboCount} Combos`}
        </span>
        {typeof onOpenGrid === 'function' && (
          <button
            type="button"
            onClick={onOpenGrid}
            style={{
              ...btn('secondary'),
              minHeight: 40,
              padding: '4px 12px',
              fontSize: F.caption,
            }}
          >
            <LayoutGrid size={14} aria-hidden="true" />
            <span>Open 13x13 Range Grid</span>
          </button>
        )}
      </div>
    </section>
  );
}
