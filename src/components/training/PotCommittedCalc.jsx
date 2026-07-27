/**
 * PotCommittedCalc — Are You Pot Committed?
 * Calculate commitment threshold based on stack-to-pot ratio
 */
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

export default function PotCommittedCalc() {
  const [stack, setStack] = useState(80);
  const [pot, setPot] = useState(40);
  const [betToCall, setBetToCall] = useState(20);

  const analysis = useMemo(() => {
    const spr = stack / (pot || 1);
    const potAfterCall = pot + betToCall * 2;
    const remainAfterCall = stack - betToCall;
    const sprAfterCall = remainAfterCall / (potAfterCall || 1);
    const potOdds = betToCall / (pot + betToCall);
    const committed = spr <= 2 || (betToCall >= stack * 0.33);
    const breakEvenEq = (potOdds * 100).toFixed(1);

    let verdict, color, emoji;
    if (spr <= 1) { verdict = 'FULLY COMMITTED — Just get it in'; color = '#ef4444'; emoji = '●'; }
    else if (spr <= 2) { verdict = 'POT COMMITTED — Very hard to fold'; color = '#f59e0b'; emoji = '●'; }
    else if (spr <= 4) { verdict = 'SOMEWHAT COMMITTED — Need decent equity'; color = '#3b82f6'; emoji = '●'; }
    else { verdict = 'NOT COMMITTED — Can still fold'; color = '#22c55e'; emoji = '●'; }

    return { spr: spr.toFixed(2), sprAfterCall: sprAfterCall.toFixed(2), potOdds: breakEvenEq, committed, verdict, color, emoji, remainAfterCall };
  }, [stack, pot, betToCall]);

  const InputSlider = ({ label, value, setValue, min, max, unit = 'BB' }) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => setValue(+e.target.value)}
        style={{ width: '100%', accentColor: '#f59e0b' }} />
    </div>
  );

  return (
    <div style={{ padding: 20, color: '#e2e8f0' }}>
      <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Pot Committed Calculator
      </h3>
      <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16 }}>Know when you're priced in and can't fold.</p>

      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <InputSlider label="Your Stack" value={stack} setValue={setStack} min={5} max={200} />
        <InputSlider label="Current Pot" value={pot} setValue={setPot} min={2} max={200} />
        <InputSlider label="Bet to Call" value={betToCall} setValue={setBetToCall} min={1} max={Math.min(stack, 150)} />
      </div>

      {/* Verdict */}
      <motion.div key={analysis.verdict} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: `${analysis.color}15`, border: `1px solid ${analysis.color}40`, borderRadius: 12, padding: 16, textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 28 }}>{analysis.emoji}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: analysis.color, marginBottom: 4 }}>{analysis.verdict}</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>SPR: {analysis.spr} → {analysis.sprAfterCall} after call</div>
      </motion.div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          { label: 'Current SPR', val: analysis.spr, color: '#3b82f6' },
          { label: 'SPR After Call', val: analysis.sprAfterCall, color: '#8b5cf6' },
          { label: 'Break-Even Equity', val: `${analysis.potOdds}%`, color: '#f59e0b' },
          { label: 'Remaining Stack', val: `${analysis.remainAfterCall} BB`, color: '#22c55e' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* SPR Reference */}
      <div style={{ marginTop: 16, background: 'rgba(239,68,68,0.06)', borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>SPR Quick Reference</div>
        {[
          { range: '0-1', note: 'Fully committed. Get it in with any piece.' },
          { range: '1-2', note: 'Pot committed. Top pair+ should never fold.' },
          { range: '2-4', note: 'Semi-committed. Need TPGK or better.' },
          { range: '4-8', note: 'Flexible. Can play fit-or-fold post-flop.' },
          { range: '8+', note: 'Deep. Implied odds matter more than pot odds.' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 3 }}>
            <span style={{ fontWeight: 700, color: '#f59e0b', minWidth: 32 }}>{r.range}</span>
            <span style={{ color: '#94a3b8' }}>{r.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
