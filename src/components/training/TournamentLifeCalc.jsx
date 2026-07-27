/**
 * TournamentLifeCalc — GTO Wizard-Style Tournament Life & Survival Calculator
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate survival odds, expected finish position, ROI projections,
 * and optimal risk-taking based on stack/field/payout structure.
 */
import React, { useState, useMemo } from 'react';

const STRUCTURES = [
  { name: '$10 MTT (1000 entries)', buyIn: 10, entries: 1000, startStack: 5000, currentLevel: 6, blinds: '100/200/25', avgStack: 15000, minCash: 150, topPrize: 1800 },
  { name: '$50 MTT (500 entries)', buyIn: 50, entries: 500, startStack: 10000, currentLevel: 8, blinds: '200/400/50', avgStack: 22000, minCash: 75, topPrize: 5000 },
  { name: '$200 Sunday (2000 entries)', buyIn: 200, entries: 2000, startStack: 20000, currentLevel: 10, blinds: '400/800/100', avgStack: 55000, minCash: 300, topPrize: 60000 },
  { name: '$500 High Roller (200 entries)', buyIn: 500, entries: 200, startStack: 25000, currentLevel: 12, blinds: '800/1600/200', avgStack: 50000, minCash: 40, topPrize: 22000 },
];

function TournamentLifeCalc() {
  const [structIdx, setStructIdx] = useState(0);
  const [heroStack, setHeroStack] = useState(20000);
  const [playersLeft, setPlayersLeft] = useState(150);

  const structure = STRUCTURES[structIdx];

  const stats = useMemo(() => {
    const blindParts = structure.blinds.split('/');
    const bb = parseInt(blindParts[1]);
    const ante = parseInt(blindParts[2]) || 0;
    const bbStack = Math.round(heroStack / bb);
    const avgBB = Math.round(structure.avgStack / bb);
    const chipRatio = heroStack / structure.avgStack;
    const pctField = ((structure.entries - playersLeft + 1) / structure.entries * 100);

    // M-ratio (Harrington)
    const potPerOrbit = bb + (bb / 2) + (ante * 6);
    const mRatio = Math.round(heroStack / potPerOrbit * 10) / 10;

    // Survival estimate (simplified)
    const survivalToMoney = Math.min(chipRatio * 0.7 + 0.15, 0.95);
    const survivalToFT = Math.min(chipRatio * 0.3 + 0.02, 0.5);

    // Expected finish
    const expectedFinish = Math.max(1, Math.round(playersLeft * (1 - chipRatio * 0.6)));

    // ROI projection
    const expectedValue = survivalToMoney * structure.minCash * 2 + survivalToFT * structure.topPrize * 0.1;
    const roi = Math.round(((expectedValue - structure.buyIn) / structure.buyIn) * 100);

    // Zone classification
    let zone, zoneColor;
    if (mRatio > 20) { zone = 'Green Zone'; zoneColor = '#10b981'; }
    else if (mRatio > 10) { zone = 'Yellow Zone'; zoneColor = '#f59e0b'; }
    else if (mRatio > 5) { zone = 'Orange Zone'; zoneColor = '#f97316'; }
    else if (mRatio > 2) { zone = 'Red Zone'; zoneColor = '#ef4444'; }
    else { zone = 'Dead Zone'; zoneColor = '#991b1b'; }

    // Strategy recommendation
    let strategy;
    if (mRatio > 20) strategy = 'Full poker. Play all streets, utilize position. No urgency.';
    else if (mRatio > 10) strategy = 'Tighten slightly. Avoid marginal spots. Look to accumulate.';
    else if (mRatio > 5) strategy = 'Push/fold approaching. Open-shove marginal opens. Look for spots to double.';
    else if (mRatio > 2) strategy = 'Push/fold mode. Shove or fold preflop. No limping, no calling.';
    else strategy = 'Desperate. Shove any two from late position. Any ace, any pair, any two broadway.';

    return { bbStack, avgBB, chipRatio, pctField, mRatio, survivalToMoney, survivalToFT, expectedFinish, expectedValue, roi, zone, zoneColor, strategy, bb };
  }, [heroStack, playersLeft, structure]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#22c55e' }}>Tournament Life Calculator</h3>

        {/* Structure Selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {STRUCTURES.map((s, i) => (
            <button key={i} onClick={() => setStructIdx(i)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: structIdx === i ? '#22c55e' : 'rgba(255,255,255,0.06)',
              color: structIdx === i ? '#000' : 'rgba(255,255,255,0.7)', border: 'none',
            }}>{s.name}</button>
          ))}
        </div>

        {/* Sliders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Hero Stack</div>
            <input type="range" min={1000} max={200000} step={1000} value={heroStack} onChange={e => setHeroStack(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#22c55e' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{heroStack.toLocaleString()} ({stats.bbStack} BB)</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Players Remaining</div>
            <input type="range" min={2} max={structure.entries} step={1} value={playersLeft} onChange={e => setPlayersLeft(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#22c55e' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{playersLeft} / {structure.entries}</div>
          </div>
        </div>

        {/* Zone Banner */}
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 16, textAlign: 'center',
          background: `${stats.zoneColor}15`, border: `1px solid ${stats.zoneColor}40`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: stats.zoneColor }}>{stats.zone}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>M-Ratio: {stats.mRatio} | Blinds: {structure.blinds}</div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'BB Stack', value: stats.bbStack, color: stats.bbStack > 30 ? '#10b981' : stats.bbStack > 15 ? '#f59e0b' : '#ef4444' },
            { label: 'M-Ratio', value: stats.mRatio, color: stats.zoneColor },
            { label: 'Chip Ratio', value: `${(stats.chipRatio * 100).toFixed(0)}%`, color: stats.chipRatio >= 1 ? '#10b981' : '#f59e0b' },
            { label: 'Field Done', value: `${stats.pctField.toFixed(0)}%`, color: '#8b5cf6' },
            { label: 'ITM Prob', value: `${(stats.survivalToMoney * 100).toFixed(0)}%`, color: '#3b82f6' },
            { label: 'FT Prob', value: `${(stats.survivalToFT * 100).toFixed(0)}%`, color: '#ec4899' },
            { label: 'Exp Finish', value: `#${stats.expectedFinish}`, color: '#22c55e' },
            { label: 'Proj ROI', value: `${stats.roi > 0 ? '+' : ''}${stats.roi}%`, color: stats.roi >= 0 ? '#10b981' : '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Strategy */}
        <div style={{ padding: 12, background: 'rgba(34,197,94,0.06)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>Recommended Strategy</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{stats.strategy}</div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Tournament Life Calculator failed to load: {err.message}</div>;
  }
}

export default TournamentLifeCalc;
