/**
 * STACK DEPTH ADVISOR
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Strategy adjustments based on effective stack depth:
 * - SPR (Stack-to-Pot Ratio) calculations
 * - Commitment thresholds
 * - Preflop and postflop adjustments per depth
 * - Interactive stack slider
 * - Position-specific recommendations
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● STACK DEPTH PROFILES ●●●
const DEPTH_PROFILES = [
  {
    id: 'ultra_short',
    range: [0, 15],
    name: 'Ultra Short',
    label: '< 15 BB',
    color: '#ef4444',
    spr: '< 1',
    preflop: 'Push/fold mode. Shove or fold — no limping, no open-raising small.',
    postflop: 'Rarely see a flop. When you do, you\'re committed with any pair+.',
    keyAdjustments: [
      'Open-shove range widens significantly',
      'No more 3-bet bluffing — 3-bet = all-in',
      'Position matters less — it\'s about fold equity',
      'Stop defending BB wide — reshove or fold',
    ],
    commitThreshold: 'Committed with any piece of the board',
    ranges: { utg: 15, mp: 18, co: 28, btn: 42, sb: 38 },
  },
  {
    id: 'short',
    range: [15, 25],
    name: 'Short Stack',
    label: '15-25 BB',
    color: '#f97316',
    spr: '1-3',
    preflop: 'Open-raise to 2-2.5x. 3-bet shove range is wide. Avoid flatting 3-bets.',
    postflop: 'SPR is low — commit with top pair+ on most boards. Check-raise all-in frequently.',
    keyAdjustments: [
      'Open smaller (2-2.2x) to risk less',
      '3-bet shove instead of small 3-bets',
      'Commit to pots with TPGK+',
      'Avoid multi-street bluffs — one-and-done',
    ],
    commitThreshold: 'Top pair good kicker or better',
    ranges: { utg: 12, mp: 15, co: 24, btn: 38, sb: 32 },
  },
  {
    id: 'medium',
    range: [25, 50],
    name: 'Medium Stack',
    label: '25-50 BB',
    color: '#f59e0b',
    spr: '3-6',
    preflop: 'Standard open-raising (2.5x). Can 3-bet non-all-in. Wider flatting ranges.',
    postflop: 'More room for post-flop play. Can make 2-barrel bluffs. Sets and overpairs are strong commits.',
    keyAdjustments: [
      'Standard opening sizes work well',
      '3-bet to ~7-8x (not all-in)',
      'Can flat 3-bets with suited connectors in position',
      'Two-street value plans are key',
    ],
    commitThreshold: 'Overpair or top pair + strong draw',
    ranges: { utg: 14, mp: 17, co: 26, btn: 40, sb: 34 },
  },
  {
    id: 'deep',
    range: [50, 100],
    name: 'Deep Stack',
    label: '50-100 BB',
    color: '#22c55e',
    spr: '6-12',
    preflop: 'Full GTO opening ranges. 3-bet with balanced range. Speculative hands gain value.',
    postflop: 'Multi-street play. Sets become premium. Draws have great implied odds. Can make sophisticated plays.',
    keyAdjustments: [
      'Speculative hands (suited connectors, small pairs) increase in value',
      'Implied odds are excellent for set-mining',
      'Three-street value plans become standard',
      'Bluffing lines need to be credible through all streets',
    ],
    commitThreshold: 'Two pair+ or strong combo draws',
    ranges: { utg: 16, mp: 19, co: 28, btn: 44, sb: 36 },
  },
  {
    id: 'ultra_deep',
    range: [100, 200],
    name: 'Ultra Deep',
    label: '100-200 BB',
    color: '#3b82f6',
    spr: '12+',
    preflop: 'Position is king. Suited hands and connectors are premium. Small pairs always set-mine.',
    postflop: 'Extremely nuanced. Nut advantage matters most. Be careful with one-pair hands. Sets dominate.',
    keyAdjustments: [
      'Position value is maximized — play tighter OOP',
      'Suited connectors and small pairs are very profitable',
      'One-pair hands lose value — nut hands gain',
      'Pot control with medium-strength hands is critical',
      'Overbet bluffs and value bets become powerful tools',
    ],
    commitThreshold: 'Sets+ or nut flush draws with pair',
    ranges: { utg: 13, mp: 16, co: 25, btn: 42, sb: 33 },
  },
];

function getProfileForBB(bb) {
  return DEPTH_PROFILES.find(p => bb >= p.range[0] && bb < p.range[1]) || DEPTH_PROFILES[DEPTH_PROFILES.length - 1];
}

// ●●● SPR GAUGE ●●●
function SPRGauge({ spr, color }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
      <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Typical SPR</div>
      <div style={{ color, fontSize: 28, fontWeight: 800 }}>{spr}</div>
      <div style={{ height: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, (parseFloat(spr) || 1) / 15 * 100)}%`,
          height: '100%', background: color, opacity: 0.6, borderRadius: 3,
        }} />
      </div>
    </div>
  );
}

// ●●● POSITION RANGE DISPLAY ●●●
function PositionRanges({ ranges, color }) {
  const positions = ['utg', 'mp', 'co', 'btn', 'sb'];
  const labels = { utg: 'UTG', mp: 'MP', co: 'CO', btn: 'BTN', sb: 'SB' };
  const maxRange = Math.max(...Object.values(ranges || {}));
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 8, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Open-Raise Range by Position</div>
      {positions.map(pos => (
        <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ color: '#94a3b8', fontSize: 10, width: 28, fontWeight: 600 }}>{labels[pos]}</span>
          <div style={{ flex: 1, height: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${(ranges[pos] / maxRange) * 100}%`, height: '100%',
              background: color, opacity: 0.5, borderRadius: 3, transition: 'width 0.3s',
            }} />
          </div>
          <span style={{ color, fontSize: 10, fontWeight: 700, width: 32, textAlign: 'right' }}>{ranges[pos]}%</span>
        </div>
      ))}
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function StackDepthAdvisor() {
  const [bbSlider, setBbSlider] = useState(50);
  const [selectedProfile, setSelectedProfile] = useState(null);

  const activeProfile = useMemo(() => {
    if (selectedProfile) return DEPTH_PROFILES.find(p => p.id === selectedProfile) || getProfileForBB(bbSlider);
    return getProfileForBB(bbSlider);
  }, [bbSlider, selectedProfile]);

  try {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>Stack Depth Advisor</h3>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>Adjust your strategy based on effective stack depth</div>
        </div>

        {/* BB Slider */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#64748b', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>Effective Stack</span>
            <span style={{ color: activeProfile.color, fontSize: 16, fontWeight: 800 }}>{bbSlider} BB</span>
          </div>
          <input type="range" min={5} max={200} value={bbSlider}
            onChange={e => { setBbSlider(Number(e.target.value)); setSelectedProfile(null); }}
            style={{ width: '100%', accentColor: activeProfile.color, height: 6, cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ color: '#ef4444', fontSize: 7 }}>5 BB</span>
            <span style={{ color: '#f59e0b', fontSize: 7 }}>50 BB</span>
            <span style={{ color: '#22c55e', fontSize: 7 }}>100 BB</span>
            <span style={{ color: '#3b82f6', fontSize: 7 }}>200 BB</span>
          </div>
        </div>

        {/* Profile selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto' }}>
          {DEPTH_PROFILES.map(p => (
            <button key={p.id} onClick={() => { setSelectedProfile(p.id); setBbSlider(Math.floor((p.range[0] + p.range[1]) / 2)); }} style={{
              padding: '5px 10px', borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeProfile.id === p.id ? `${p.color}15` : 'rgba(0,0,0,0.15)',
              border: activeProfile.id === p.id ? `1px solid ${p.color}40` : '1px solid transparent',
              color: activeProfile.id === p.id ? p.color : '#94a3b8', fontSize: 10, fontWeight: 600,
            }}>
              <div>{p.name}</div>
              <div style={{ color: '#64748b', fontSize: 8, marginTop: 1 }}>{p.label}</div>
            </button>
          ))}
        </div>

        {/* Active profile header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
          <div style={{ color: activeProfile.color, fontSize: 22, fontWeight: 800 }}>{activeProfile.name}</div>
          <span style={{ padding: '3px 8px', borderRadius: 4, background: `${activeProfile.color}15`, color: activeProfile.color, fontSize: 10, fontWeight: 700 }}>
            {activeProfile.label}
          </span>
          <span style={{ padding: '3px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontSize: 10, fontWeight: 600 }}>
            SPR: {activeProfile.spr}
          </span>
        </div>

        {/* SPR + Commit Threshold */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <SPRGauge spr={activeProfile.spr} color={activeProfile.color} />
          <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: 7, fontWeight: 600, textTransform: 'uppercase' }}>Commitment Threshold</div>
            <div style={{ color: activeProfile.color, fontSize: 12, fontWeight: 700, marginTop: 6, lineHeight: 1.4 }}>
              {activeProfile.commitThreshold}
            </div>
          </div>
        </div>

        {/* Preflop & Postflop */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#3b82f6', fontSize: 9, fontWeight: 700, marginBottom: 4 }}>PREFLOP</div>
            <div style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.5 }}>{activeProfile.preflop}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
            <div style={{ color: '#22c55e', fontSize: 9, fontWeight: 700, marginBottom: 4 }}>POSTFLOP</div>
            <div style={{ color: '#cbd5e1', fontSize: 10, lineHeight: 1.5 }}>{activeProfile.postflop}</div>
          </div>
        </div>

        {/* Key Adjustments */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10, marginBottom: 16 }}>
          <div style={{ color: '#f59e0b', fontSize: 9, fontWeight: 700, marginBottom: 6 }}>KEY ADJUSTMENTS</div>
          {activeProfile.keyAdjustments.map((adj, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
              <span style={{ color: activeProfile.color, fontSize: 10, flexShrink: 0, marginTop: 1 }}>•</span>
              <span style={{ color: '#94a3b8', fontSize: 10, lineHeight: 1.4 }}>{adj}</span>
            </div>
          ))}
        </div>

        {/* Position ranges */}
        <div style={{ background: 'rgba(0,0,0,0.1)', borderRadius: 8, padding: 10 }}>
          <PositionRanges ranges={activeProfile.ranges} color={activeProfile.color} />
        </div>
      </div>
    );
  } catch (err) {
    return (
      <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, margin: 0 }}>Stack Depth Advisor</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Component loading... Please refresh if this persists.</p>
      </div>
    );
  }
}
