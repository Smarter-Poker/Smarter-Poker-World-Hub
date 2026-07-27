/**
 * AGGREGATED REPORT VIEWER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * GTO Wizard-style aggregate strategy reports:
 * - Overall strategy frequencies across board textures
 * - Position-based performance breakdown
 * - Action frequency by street (preflop → river)
 * - Spot accuracy heatmap
 * - Biggest leaks summary
 * - Comparison to GTO baseline
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useMemo } from 'react';

// ●●● SAMPLE AGGREGATE DATA ●●●
function generateAggregateData() {
  const positions = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const streets = ['Preflop', 'Flop', 'Turn', 'River'];
  const spotTypes = ['Open Raise', 'C-Bet', 'Facing C-Bet', '3-Bet', 'Check-Raise', 'Barrel', 'River Bet', 'River Call'];
  const textures = ['Dry', 'Wet', 'Monotone', 'Paired', 'Connected', 'Broadway'];

  const positionData = positions.map(pos => {
    const base = pos === 'BTN' ? 78 : pos === 'CO' ? 74 : pos === 'BB' ? 68 : pos === 'SB' ? 64 : 70;
    return {
      position: pos,
      accuracy: Math.round(base + (Math.random() - 0.5) * 12),
      handsPlayed: Math.round(50 + Math.random() * 200),
      evLoss: (Math.random() * 2).toFixed(2),
      bestSpot: spotTypes[Math.floor(Math.random() * spotTypes.length)],
      worstSpot: spotTypes[Math.floor(Math.random() * spotTypes.length)],
    };
  });

  const streetData = streets.map((street, i) => {
    const base = 75 - i * 5;
    return {
      street,
      accuracy: Math.round(base + (Math.random() - 0.5) * 10),
      betFreq: Math.round(30 + Math.random() * 30),
      checkFreq: Math.round(20 + Math.random() * 30),
      raiseFreq: Math.round(5 + Math.random() * 15),
      foldFreq: Math.round(10 + Math.random() * 20),
      avgEVLoss: (Math.random() * 1.5).toFixed(2),
    };
  });

  const spotData = spotTypes.map(spot => ({
    spot,
    accuracy: Math.round(55 + Math.random() * 35),
    frequency: Math.round(5 + Math.random() * 20),
    evLoss: (Math.random() * 2).toFixed(2),
    gtoFreq: Math.round(20 + Math.random() * 40),
    yourFreq: Math.round(15 + Math.random() * 45),
  }));

  const textureData = textures.map(tex => ({
    texture: tex,
    accuracy: Math.round(55 + Math.random() * 35),
    betFreq: Math.round(25 + Math.random() * 40),
    gtobet: Math.round(30 + Math.random() * 35),
  }));

  const leaks = [
    { description: 'Under-bluffing river spots by 15%', severity: 'high', evCost: '1.8 bb/100' },
    { description: 'Over-folding to 3-bets from BTN/CO', severity: 'high', evCost: '1.2 bb/100' },
    { description: 'C-bet sizing too large on dry boards', severity: 'medium', evCost: '0.8 bb/100' },
    { description: 'Missing thin value bets on the river', severity: 'medium', evCost: '0.6 bb/100' },
    { description: 'Check-raising too infrequently OOP', severity: 'low', evCost: '0.3 bb/100' },
  ];

  return { positionData, streetData, spotData, textureData, leaks };
}

// ●●● SVG BAR CHART ●●●
function BarChart({ data, keyField, valueField, color, height = 120 }) {
  const max = Math.max(...data.map(d => d[valueField]), 1);
  const barWidth = Math.floor(280 / data.length) - 4;

  return (
    <svg width="100%" height={height} viewBox={`0 0 300 ${height}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const barH = (d[valueField] / max) * (height - 25);
        const x = i * (barWidth + 4) + 10;
        return (
          <g key={i}>
            <rect x={x} y={height - 20 - barH} width={barWidth} height={barH} rx={3}
              fill={typeof color === 'function' ? color(d) : color} opacity={0.8} />
            <text x={x + barWidth / 2} y={height - 5} textAnchor="middle"
              fill="#64748b" fontSize={8} fontWeight={600}>
              {d[keyField].slice(0, 5)}
            </text>
            <text x={x + barWidth / 2} y={height - 25 - barH} textAnchor="middle"
              fill="#94a3b8" fontSize={8} fontWeight={600}>
              {d[valueField]}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function AggregatedReportViewer() {
  const [tab, setTab] = useState('overview');
  const data = useMemo(() => generateAggregateData(), []);

  const overallAccuracy = useMemo(() => {
    const accs = data.positionData.map(p => p.accuracy);
    return Math.round(accs.reduce((a, b) => a + b, 0) / accs.length);
  }, [data]);

  const totalEVLoss = useMemo(() => {
    return data.positionData.reduce((sum, p) => sum + parseFloat(p.evLoss), 0).toFixed(1);
  }, [data]);

  const sectionStyle = {
    background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12,
  };

  const chipStyle = (active) => ({
    padding: '5px 10px', borderRadius: 5, border: 'none', cursor: 'pointer',
    background: active ? '#3b82f6' : 'rgba(255,255,255,0.06)',
    color: active ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: 600,
    transition: 'all 0.15s',
  });

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Aggregated Strategy Report
        </h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {['overview', 'position', 'streets', 'spots', 'leaks'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={chipStyle(tab === t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ●●● OVERVIEW TAB ●●● */}
      {tab === 'overview' && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'GTO Accuracy', value: `${overallAccuracy}%`, color: overallAccuracy >= 70 ? '#22c55e' : '#f59e0b' },
              { label: 'Total EV Loss', value: `${totalEVLoss} bb`, color: parseFloat(totalEVLoss) < 5 ? '#22c55e' : '#ef4444' },
              { label: 'Hands Analyzed', value: data.positionData.reduce((s, p) => s + p.handsPlayed, 0).toString(), color: '#3b82f6' },
              { label: 'Biggest Leak', value: data.leaks[0]?.evCost || 'None', color: '#ef4444' },
            ].map(card => (
              <div key={card.label} style={{ ...sectionStyle, textAlign: 'center' }}>
                <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{card.label}</div>
                <div style={{ color: card.color, fontSize: 22, fontWeight: 800 }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Position Accuracy Chart */}
          <div style={sectionStyle}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
              Accuracy by Position
            </div>
            <BarChart data={data.positionData} keyField="position" valueField="accuracy"
              color={(d) => d.accuracy >= 75 ? '#22c55e' : d.accuracy >= 65 ? '#f59e0b' : '#ef4444'} />
          </div>

          {/* Board Texture */}
          <div style={sectionStyle}>
            <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
              Accuracy by Board Texture
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.textureData.map(t => (
                <div key={t.texture} style={{
                  padding: '8px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                  textAlign: 'center', flex: '1 1 80px',
                }}>
                  <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{t.texture}</div>
                  <div style={{
                    color: t.accuracy >= 75 ? '#22c55e' : t.accuracy >= 60 ? '#f59e0b' : '#ef4444',
                    fontSize: 18, fontWeight: 800,
                  }}>
                    {t.accuracy}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: 9 }}>
                    Bet: {t.betFreq}% (GTO: {t.gtobet}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ●●● POSITION TAB ●●● */}
      {tab === 'position' && (
        <div>
          {data.positionData.map(p => (
            <div key={p.position} style={{ ...sectionStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: p.accuracy >= 75 ? 'rgba(34,197,94,0.15)' : p.accuracy >= 65 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                color: p.accuracy >= 75 ? '#22c55e' : p.accuracy >= 65 ? '#f59e0b' : '#ef4444',
                fontSize: 16, fontWeight: 800,
              }}>
                {p.accuracy}%
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{p.position}</div>
                <div style={{ display: 'flex', gap: 12, color: '#64748b', fontSize: 11 }}>
                  <span>{p.handsPlayed} hands</span>
                  <span>EV Loss: <span style={{ color: '#f59e0b' }}>{p.evLoss}bb</span></span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#22c55e', fontSize: 10 }}>Best: {p.bestSpot}</div>
                <div style={{ color: '#ef4444', fontSize: 10 }}>Worst: {p.worstSpot}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ●●● STREETS TAB ●●● */}
      {tab === 'streets' && (
        <div>
          {data.streetData.map(s => (
            <div key={s.street} style={{ ...sectionStyle }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{s.street}</div>
                <div style={{
                  color: s.accuracy >= 70 ? '#22c55e' : '#f59e0b', fontSize: 16, fontWeight: 800,
                }}>
                  {s.accuracy}%
                </div>
              </div>
              {/* Action frequency bars */}
              <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ width: `${s.betFreq}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>Bet {s.betFreq}%</span>
                </div>
                <div style={{ width: `${s.checkFreq}%`, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>Chk {s.checkFreq}%</span>
                </div>
                <div style={{ width: `${s.raiseFreq}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>Rse {s.raiseFreq}%</span>
                </div>
                <div style={{ flex: 1, background: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>Fld {s.foldFreq}%</span>
                </div>
              </div>
              <div style={{ color: '#64748b', fontSize: 11 }}>
                Avg EV Loss per hand: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{s.avgEVLoss}bb</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ●●● SPOTS TAB ●●● */}
      {tab === 'spots' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {data.spotData.map(s => (
              <div key={s.spot} style={{ ...sectionStyle }}>
                <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{s.spot}</div>
                <div style={{
                  color: s.accuracy >= 75 ? '#22c55e' : s.accuracy >= 60 ? '#f59e0b' : '#ef4444',
                  fontSize: 24, fontWeight: 800, marginBottom: 4,
                }}>
                  {s.accuracy}%
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 10, marginBottom: 4 }}>
                  <span>Your freq: {s.yourFreq}%</span>
                  <span>GTO freq: {s.gtoFreq}%</span>
                </div>
                {/* Comparison bar */}
                <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                    width: `${s.yourFreq}%`, background: '#3b82f6', opacity: 0.7,
                  }} />
                  <div style={{
                    position: 'absolute', left: `${s.gtoFreq}%`, top: -2, width: 2, height: 10,
                    background: '#f59e0b', borderRadius: 1,
                  }} />
                </div>
                <div style={{ color: '#64748b', fontSize: 9, marginTop: 4 }}>
                  EV Cost: <span style={{ color: '#ef4444' }}>{s.evLoss}bb</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ●●● LEAKS TAB ●●● */}
      {tab === 'leaks' && (
        <div>
          {data.leaks.map((leak, i) => (
            <div key={i} style={{
              ...sectionStyle, display: 'flex', alignItems: 'center', gap: 12,
              border: `1px solid ${leak.severity === 'high' ? 'rgba(239,68,68,0.2)' : leak.severity === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: leak.severity === 'high' ? '#ef4444' : leak.severity === 'medium' ? '#f59e0b' : '#3b82f6',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                  {leak.description}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                    background: leak.severity === 'high' ? 'rgba(239,68,68,0.15)' : leak.severity === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                    color: leak.severity === 'high' ? '#ef4444' : leak.severity === 'medium' ? '#f59e0b' : '#3b82f6',
                    textTransform: 'uppercase',
                  }}>
                    {leak.severity}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ color: '#ef4444', fontSize: 14, fontWeight: 700 }}>{leak.evCost}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
