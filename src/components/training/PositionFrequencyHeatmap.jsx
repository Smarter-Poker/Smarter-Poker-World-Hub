/**
 * PositionFrequencyHeatmap — GTO Wizard-Style Position Action Frequency Heatmap
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visual heatmap showing action frequencies across positions and scenarios.
 * Color-coded cells for raise/call/fold/3bet frequencies per position.
 */
import React, { useState, useMemo } from 'react';

const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const ACTIONS = ['Open Raise', 'Fold to Raise', '3-Bet', 'Call Raise', 'Fold to 3-Bet', 'Squeeze'];

const FREQUENCY_DATA = {
  'Cash 6-Max 100bb': {
    'UTG':  { 'Open Raise': 15, 'Fold to Raise': 0,  '3-Bet': 0,  'Call Raise': 0,  'Fold to 3-Bet': 55, 'Squeeze': 0 },
    'MP':   { 'Open Raise': 19, 'Fold to Raise': 0,  '3-Bet': 5,  'Call Raise': 3,  'Fold to 3-Bet': 50, 'Squeeze': 0 },
    'CO':   { 'Open Raise': 27, 'Fold to Raise': 0,  '3-Bet': 8,  'Call Raise': 6,  'Fold to 3-Bet': 45, 'Squeeze': 3 },
    'BTN':  { 'Open Raise': 42, 'Fold to Raise': 0,  '3-Bet': 10, 'Call Raise': 12, 'Fold to 3-Bet': 40, 'Squeeze': 5 },
    'SB':   { 'Open Raise': 36, 'Fold to Raise': 35, '3-Bet': 12, 'Call Raise': 8,  'Fold to 3-Bet': 42, 'Squeeze': 7 },
    'BB':   { 'Open Raise': 0,  'Fold to Raise': 48, '3-Bet': 11, 'Call Raise': 22, 'Fold to 3-Bet': 0,  'Squeeze': 6 },
  },
  'Cash 6-Max 50bb': {
    'UTG':  { 'Open Raise': 14, 'Fold to Raise': 0,  '3-Bet': 0,  'Call Raise': 0,  'Fold to 3-Bet': 60, 'Squeeze': 0 },
    'MP':   { 'Open Raise': 17, 'Fold to Raise': 0,  '3-Bet': 6,  'Call Raise': 2,  'Fold to 3-Bet': 55, 'Squeeze': 0 },
    'CO':   { 'Open Raise': 25, 'Fold to Raise': 0,  '3-Bet': 9,  'Call Raise': 4,  'Fold to 3-Bet': 50, 'Squeeze': 4 },
    'BTN':  { 'Open Raise': 40, 'Fold to Raise': 0,  '3-Bet': 12, 'Call Raise': 8,  'Fold to 3-Bet': 45, 'Squeeze': 6 },
    'SB':   { 'Open Raise': 38, 'Fold to Raise': 38, '3-Bet': 14, 'Call Raise': 5,  'Fold to 3-Bet': 48, 'Squeeze': 8 },
    'BB':   { 'Open Raise': 0,  'Fold to Raise': 52, '3-Bet': 13, 'Call Raise': 18, 'Fold to 3-Bet': 0,  'Squeeze': 7 },
  },
  'MTT 30bb': {
    'UTG':  { 'Open Raise': 13, 'Fold to Raise': 0,  '3-Bet': 0,  'Call Raise': 0,  'Fold to 3-Bet': 65, 'Squeeze': 0 },
    'MP':   { 'Open Raise': 16, 'Fold to Raise': 0,  '3-Bet': 7,  'Call Raise': 1,  'Fold to 3-Bet': 58, 'Squeeze': 0 },
    'CO':   { 'Open Raise': 24, 'Fold to Raise': 0,  '3-Bet': 10, 'Call Raise': 3,  'Fold to 3-Bet': 52, 'Squeeze': 5 },
    'BTN':  { 'Open Raise': 45, 'Fold to Raise': 0,  '3-Bet': 14, 'Call Raise': 5,  'Fold to 3-Bet': 48, 'Squeeze': 7 },
    'SB':   { 'Open Raise': 42, 'Fold to Raise': 40, '3-Bet': 16, 'Call Raise': 3,  'Fold to 3-Bet': 52, 'Squeeze': 9 },
    'BB':   { 'Open Raise': 0,  'Fold to Raise': 55, '3-Bet': 14, 'Call Raise': 14, 'Fold to 3-Bet': 0,  'Squeeze': 8 },
  },
  'MTT 15bb': {
    'UTG':  { 'Open Raise': 12, 'Fold to Raise': 0,  '3-Bet': 0,  'Call Raise': 0,  'Fold to 3-Bet': 72, 'Squeeze': 0 },
    'MP':   { 'Open Raise': 15, 'Fold to Raise': 0,  '3-Bet': 8,  'Call Raise': 0,  'Fold to 3-Bet': 65, 'Squeeze': 0 },
    'CO':   { 'Open Raise': 22, 'Fold to Raise': 0,  '3-Bet': 12, 'Call Raise': 1,  'Fold to 3-Bet': 58, 'Squeeze': 6 },
    'BTN':  { 'Open Raise': 50, 'Fold to Raise': 0,  '3-Bet': 18, 'Call Raise': 2,  'Fold to 3-Bet': 55, 'Squeeze': 8 },
    'SB':   { 'Open Raise': 48, 'Fold to Raise': 44, '3-Bet': 20, 'Call Raise': 1,  'Fold to 3-Bet': 58, 'Squeeze': 10 },
    'BB':   { 'Open Raise': 0,  'Fold to Raise': 58, '3-Bet': 16, 'Call Raise': 10, 'Fold to 3-Bet': 0,  'Squeeze': 9 },
  },
};

const SCENARIOS = Object.keys(FREQUENCY_DATA || {});

function getHeatColor(value, maxVal) {
  if (value === 0) return 'rgba(255,255,255,0.03)';
  const ratio = Math.min(value / (maxVal || 1), 1);
  if (ratio < 0.25) return `rgba(59, 130, 246, ${0.15 + ratio * 1.4})`;
  if (ratio < 0.5) return `rgba(16, 185, 129, ${0.2 + ratio * 1.2})`;
  if (ratio < 0.75) return `rgba(245, 158, 11, ${0.3 + ratio * 0.8})`;
  return `rgba(239, 68, 68, ${0.4 + ratio * 0.6})`;
}

function HeatCell({ value, maxVal, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: getHeatColor(value, maxVal),
        padding: '8px 4px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: value > 0 ? 600 : 400,
        color: value > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
        cursor: 'pointer',
        border: selected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.06)',
        borderRadius: 4,
        transition: 'all 0.15s ease',
        minWidth: 48,
      }}
    >
      {value > 0 ? `${value}%` : '—'}
    </div>
  );
}

function PositionFrequencyHeatmap() {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [selectedCell, setSelectedCell] = useState(null);
  const [showDelta, setShowDelta] = useState(false);
  const [compareScenario, setCompareScenario] = useState(SCENARIOS[2]);

  const data = FREQUENCY_DATA[scenario];
  const compareData = FREQUENCY_DATA[compareScenario];

  const maxVal = useMemo(() => {
    let max = 0;
    POSITIONS.forEach(pos => {
      ACTIONS.forEach(act => {
        const v = data[pos]?.[act] || 0;
        if (v > max) max = v;
      });
    });
    return max;
  }, [data]);

  const positionSummary = useMemo(() => {
    if (!selectedCell) return null;
    const { pos } = selectedCell;
    const posData = data[pos];
    if (!posData) return null;
    const total = Object.values(posData || {}).reduce((s, v) => s + v, 0);
    const topAction = Object.entries(posData || {}).sort((a, b) => b[1] - a[1])[0];
    return { pos, total, topAction: topAction[0], topFreq: topAction[1] };
  }, [selectedCell, data]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#f59e0b' }}>Position Frequency Heatmap</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDelta}
              onChange={e => setShowDelta(e.target.checked)}
              style={{ accentColor: '#f59e0b' }}
            />
            Compare Mode
          </label>
        </div>

        {/* Scenario Selectors */}
        <div style={{ display: 'flex', gap: 8, marginBottom: showDelta ? 8 : 16, flexWrap: 'wrap' }}>
          {SCENARIOS.map(s => (
            <button
              key={s}
              onClick={() => setScenario(s)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: scenario === s ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                color: scenario === s ? '#000' : 'rgba(255,255,255,0.7)',
                border: 'none',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {showDelta && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>vs</span>
            {SCENARIOS.filter(s => s !== scenario).map(s => (
              <button
                key={s}
                onClick={() => setCompareScenario(s)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: compareScenario === s ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                  color: compareScenario === s ? '#fff' : 'rgba(255,255,255,0.7)',
                  border: 'none',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Heatmap Grid */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${POSITIONS.length}, 1fr)`, gap: 2 }}>
            {/* Header row */}
            <div style={{ padding: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Action \ Position</div>
            {POSITIONS.map(pos => (
              <div key={pos} style={{ padding: 8, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{pos}</div>
            ))}

            {/* Data rows */}
            {ACTIONS.map(action => (
              <React.Fragment key={action}>
                <div style={{ padding: '8px 8px 8px 4px', fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500, display: 'flex', alignItems: 'center' }}>
                  {action}
                </div>
                {POSITIONS.map(pos => {
                  const val = data[pos]?.[action] || 0;
                  const cmpVal = compareData[pos]?.[action] || 0;
                  const delta = val - cmpVal;
                  const isSelected = selectedCell?.pos === pos && selectedCell?.action === action;

                  if (showDelta) {
                    return (
                      <div
                        key={pos}
                        onClick={() => setSelectedCell({ pos, action })}
                        style={{
                          padding: '6px 4px',
                          textAlign: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: delta > 0 ? `rgba(16,185,129,${Math.min(Math.abs(delta) / 20, 0.6)})` :
                                     delta < 0 ? `rgba(239,68,68,${Math.min(Math.abs(delta) / 20, 0.6)})` :
                                     'rgba(255,255,255,0.03)',
                          color: delta !== 0 ? '#fff' : 'rgba(255,255,255,0.3)',
                          border: isSelected ? '2px solid #f59e0b' : '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 4,
                        }}
                      >
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '0'}
                      </div>
                    );
                  }

                  return (
                    <HeatCell
                      key={pos}
                      value={val}
                      maxVal={maxVal}
                      selected={isSelected}
                      onClick={() => setSelectedCell({ pos, action })}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Low (0-12%)', color: 'rgba(59,130,246,0.5)' },
            { label: 'Medium (13-25%)', color: 'rgba(16,185,129,0.5)' },
            { label: 'High (26-40%)', color: 'rgba(245,158,11,0.6)' },
            { label: 'Very High (40%+)', color: 'rgba(239,68,68,0.7)' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Selected Cell Detail */}
        {positionSummary && (
          <div style={{ marginTop: 16, padding: 14, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 6 }}>{positionSummary.pos} Summary</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
              Primary action: <span style={{ color: '#10b981', fontWeight: 600 }}>{positionSummary.topAction}</span> at {positionSummary.topFreq}% frequency.
              {' '}Combined action frequency across all lines: {positionSummary.total}%.
              {selectedCell?.action && (
                <span> Currently viewing: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{selectedCell.action}</span> = {data[selectedCell.pos]?.[selectedCell.action] || 0}%
                  {showDelta && ` (delta: ${(data[selectedCell.pos]?.[selectedCell.action] || 0) - (compareData[selectedCell.pos]?.[selectedCell.action] || 0)})`}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Position Frequency Heatmap failed to load: {err.message}</div>;
  }
}

export default PositionFrequencyHeatmap;
