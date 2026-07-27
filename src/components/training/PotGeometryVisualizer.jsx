/**
 * PotGeometryVisualizer — Pot Growth Across Streets
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Visualize how pot size grows geometrically across flop/turn/river.
 * Shows how bet sizing compounds and relates to stack commitment.
 */
import React, { useState, useMemo } from 'react';

function PotGeometryVisualizer() {
  const [startPot, setStartPot] = useState(10);
  const [stack, setStack] = useState(100);
  const [flopPct, setFlopPct] = useState(33);
  const [turnPct, setTurnPct] = useState(66);
  const [riverPct, setRiverPct] = useState(100);

  const calc = useMemo(() => {
    const flopBet = startPot * (flopPct / 100);
    const potAfterFlop = startPot + flopBet * 2;

    const turnBet = potAfterFlop * (turnPct / 100);
    const potAfterTurn = potAfterFlop + turnBet * 2;

    const riverBet = potAfterTurn * (riverPct / 100);
    const potAfterRiver = potAfterTurn + riverBet * 2;

    const totalInvested = flopBet + turnBet + riverBet;
    const pctStackUsed = Math.min(100, Math.round((totalInvested / stack) * 100));
    const allIn = totalInvested >= stack;

    // Geometric sizing: what single % gets you all-in by river?
    const remaining = stack;
    // Solve: pot * x + pot*(1+2x)*x + pot*(1+2x)*(1+2x)*x = stack (approx)
    // Simplified: iterate
    let geoX = 0;
    for (let x = 5; x <= 200; x++) {
      const pct = x / 100;
      const fb = startPot * pct;
      const p1 = startPot + fb * 2;
      const tb = p1 * pct;
      const p2 = p1 + tb * 2;
      const rb = p2 * pct;
      const tot = fb + tb + rb;
      if (tot >= remaining) { geoX = x; break; }
    }
    if (geoX === 0) geoX = 200;

    const streets = [
      { name: 'Preflop', pot: startPot, bet: 0, cumInvested: 0 },
      { name: 'Flop', pot: potAfterFlop, bet: flopBet, cumInvested: flopBet },
      { name: 'Turn', pot: potAfterTurn, bet: turnBet, cumInvested: flopBet + turnBet },
      { name: 'River', pot: potAfterRiver, bet: riverBet, cumInvested: totalInvested },
    ];

    return { streets, totalInvested, pctStackUsed, allIn, potAfterRiver, geoX };
  }, [startPot, stack, flopPct, turnPct, riverPct]);

  const maxPot = calc.potAfterRiver || 1;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#8b5cf6' }}>Pot Geometry Visualizer</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Start Pot', value: startPot, set: setStartPot, min: 2, max: 50, step: 1, color: '#8b5cf6', display: `${startPot} bb` },
            { label: 'Eff. Stack', value: stack, set: setStack, min: 20, max: 300, step: 5, color: '#3b82f6', display: `${stack} bb` },
            { label: 'Flop %', value: flopPct, set: setFlopPct, min: 0, max: 150, step: 1, color: '#10b981', display: `${flopPct}%` },
            { label: 'Turn %', value: turnPct, set: setTurnPct, min: 0, max: 150, step: 1, color: '#f59e0b', display: `${turnPct}%` },
            { label: 'River %', value: riverPct, set: setRiverPct, min: 0, max: 200, step: 1, color: '#ef4444', display: `${riverPct}%` },
          ].map(s => (
            <div key={s.label} style={{ padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{s.label}</div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseFloat(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.display}</div>
            </div>
          ))}
        </div>

        {/* Street-by-street visualization */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end', height: 180 }}>
          {calc.streets.map((st, i) => {
            const height = Math.max(8, (st.pot / maxPot) * 160);
            const colors = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];
            return (
              <div key={st.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{Math.round(st.pot * 10) / 10} bb</div>
                <div style={{ width: '100%', height, background: `${colors[i]}33`, borderRadius: 6, border: `1px solid ${colors[i]}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {st.bet > 0 && <div style={{ fontSize: 10, color: colors[i], fontWeight: 700 }}>+{Math.round(st.bet * 10) / 10}</div>}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{st.name}</div>
              </div>
            );
          })}
        </div>

        {/* Stack commitment bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Stack Commitment</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: calc.allIn ? '#ef4444' : '#10b981' }}>
              {Math.round(calc.totalInvested * 10) / 10} / {stack} bb ({calc.pctStackUsed}%)
            </span>
          </div>
          <div style={{ height: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${calc.pctStackUsed}%`, borderRadius: 6, background: calc.allIn ? '#ef4444' : calc.pctStackUsed > 70 ? '#f59e0b' : '#10b981', transition: 'width 0.3s' }} />
          </div>
          {calc.allIn && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4, fontWeight: 700, textAlign: 'center' }}>ALL-IN before river completes!</div>}
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(139,92,246,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Final Pot</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#8b5cf6' }}>{Math.round(calc.potAfterRiver)} bb</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Pot Growth</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{Math.round(calc.potAfterRiver / startPot * 10) / 10}x</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(59,130,246,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Geo Size</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#3b82f6' }}>{calc.geoX}%</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>for all-in by river</div>
          </div>
        </div>

        <div style={{ padding: 10, background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', marginBottom: 4 }}>Pot Geometry Insight</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            {calc.pctStackUsed < 30 ? 'Small sizing — leaves room for multi-street play. Consider larger sizes with strong hands to build pot.' :
             calc.pctStackUsed < 70 ? 'Moderate commitment — good for value hands. Enough behind for river decisions.' :
             calc.allIn ? 'Over-committed — simplify to jam/fold on earlier street. Consider geometric sizing to spread bets evenly.' :
             'Deep commitment — pot is large relative to stack. River decisions will be for significant portions of stack.'}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Pot Geometry failed to load: {err.message}</div>;
  }
}

export default PotGeometryVisualizer;
