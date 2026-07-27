/**
 * DrawOddsCalculator — GTO Wizard-Style Draw Odds & Outs Calculator
 * ═══════════════════════════════════════════════════════════════════════════
 * Calculate odds for flush draws, straight draws, combo draws, and more.
 * Shows outs, equity, and whether calling is profitable vs given sizing.
 */
import React, { useState, useMemo } from 'react';

const DRAW_TYPES = [
  { name: 'Flush Draw', outs: 9, icon: '♠', description: '4 to a flush — 9 outs to complete', example: 'A♠5♠ on K♠7♠2♣' },
  { name: 'Open-Ended Straight', outs: 8, icon: '⇄', description: '4 connected cards — 8 outs', example: '9♣8♣ on 7♦6♠2♥' },
  { name: 'Gutshot Straight', outs: 4, icon: '→', description: 'Inside straight draw — 4 outs', example: 'J♥T♥ on 8♠6♣2♦ (needs 9)' },
  { name: 'Combo Draw (Flush+OESD)', outs: 15, icon: '★', description: 'Flush + straight draw — 15 outs', example: '7♠6♠ on 8♠5♠K♣' },
  { name: 'Combo Draw (Flush+Gutshot)', outs: 12, icon: '◆', description: 'Flush + gutshot — 12 outs', example: 'A♠J♠ on T♠8♠3♣ (needs Q)' },
  { name: 'Overcards (2)', outs: 6, icon: 'A', description: 'Two overcards to the board — 6 outs', example: 'A♥K♣ on 8♠5♦2♣' },
  { name: 'One Overcard', outs: 3, icon: 'K', description: 'Single overcard — 3 outs', example: 'A♥7♣ on K♠8♦4♣ (A only)' },
  { name: 'Set (pocket pair)', outs: 2, icon: '▪', description: 'Pocket pair to set — 2 outs', example: '8♥8♣ on K♠Q♦3♣' },
  { name: 'Runner-Runner Flush', outs: 1.5, icon: '♦♦', description: '~1.5 effective outs (backdoor)', example: 'A♠4♠ on K♣7♠2♦ (need 2 spades)' },
  { name: 'Two Pair → Full House', outs: 4, icon: 'FH', description: 'Two pair improving to full house', example: 'K♠J♣ on K♥J♦8♣' },
];

function DrawOddsCalculator() {
  const [selectedDraw, setSelectedDraw] = useState(0);
  const [customOuts, setCustomOuts] = useState(null);
  const [street, setStreet] = useState('flop');
  const [betPct, setBetPct] = useState(67);

  const outs = customOuts !== null ? customOuts : DRAW_TYPES[selectedDraw].outs;

  const calc = useMemo(() => {
    const cardsLeft = street === 'flop' ? 47 : 46;
    const cardsToSee = street === 'flop' ? 2 : 1;

    let equity;
    if (cardsToSee === 2) {
      const missFlop = (cardsLeft - outs) / cardsLeft;
      const missTurn = (cardsLeft - 1 - outs) / (cardsLeft - 1);
      equity = 1 - (missFlop * missTurn);
    } else {
      equity = outs / cardsLeft;
    }

    const equityPct = Math.round(equity * 1000) / 10;
    const ruleOf = cardsToSee === 2 ? Math.min(outs * 4, 100) : Math.min(outs * 2, 100);

    const betSize = betPct;
    const potOdds = betSize / (100 + betSize + betSize);
    const potOddsPct = Math.round(potOdds * 1000) / 10;
    const profitable = equityPct > potOddsPct;

    const impliedOddsNeeded = profitable ? 0 : Math.round((potOddsPct - equityPct) * 10) / 10;

    const ratio = `${Math.round((100 + betSize) / betSize * 10) / 10}:1`;

    return { equityPct, ruleOf, potOddsPct, profitable, impliedOddsNeeded, ratio };
  }, [outs, street, betPct]);

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#34d399' }}>Draw Odds Calculator</h3>

        {/* Street Toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[{ id: 'flop', label: 'Flop (2 cards to come)' }, { id: 'turn', label: 'Turn (1 card to come)' }].map(s => (
            <button key={s.id} onClick={() => setStreet(s.id)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: street === s.id ? '#34d399' : 'rgba(255,255,255,0.06)',
              color: street === s.id ? '#000' : 'rgba(255,255,255,0.6)', border: 'none', flex: 1,
            }}>{s.label}</button>
          ))}
        </div>

        {/* Draw Type Selection */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {DRAW_TYPES.map((d, i) => (
            <button key={d.name} onClick={() => { setSelectedDraw(i); setCustomOuts(null); }} style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selectedDraw === i && customOuts === null ? '#34d399' : 'rgba(255,255,255,0.06)',
              color: selectedDraw === i && customOuts === null ? '#000' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{d.icon} {d.name}</button>
          ))}
        </div>

        {/* Draw Info */}
        <div style={{ padding: 10, background: 'rgba(52,211,153,0.06)', borderRadius: 8, marginBottom: 16, borderLeft: '3px solid #34d399' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 4 }}>
            {DRAW_TYPES[selectedDraw].name} — {outs} outs
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{DRAW_TYPES[selectedDraw].description}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>Ex: {DRAW_TYPES[selectedDraw].example}</div>
        </div>

        {/* Custom Outs Slider */}
        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Custom Outs (override)</div>
          <input type="range" min={1} max={20} step={0.5} value={outs} onChange={e => setCustomOuts(parseFloat(e.target.value))} style={{ width: '100%', accentColor: '#34d399' }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399', textAlign: 'center' }}>{outs} outs</div>
        </div>

        {/* Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Exact Equity', value: `${calc.equityPct}%`, color: '#34d399' },
            { label: `Rule of ${street === 'flop' ? '4' : '2'}`, value: `~${calc.ruleOf}%`, color: '#a78bfa' },
            { label: 'Pot Odds', value: `${calc.potOddsPct}%`, color: '#3b82f6' },
            { label: 'Odds Ratio', value: calc.ratio, color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Bet Size & Profitability */}
        <div style={{ padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Villain Bet Size (% pot)</div>
          <input type="range" min={10} max={200} step={5} value={betPct} onChange={e => setBetPct(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#34d399' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', textAlign: 'center' }}>{betPct}% pot</div>
        </div>

        <div style={{
          padding: 14, borderRadius: 10, textAlign: 'center',
          background: calc.profitable ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${calc.profitable ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: calc.profitable ? '#10b981' : '#ef4444' }}>
            {calc.profitable ? '✓ PROFITABLE CALL': '✕ UNPROFITABLE (need implied odds)'}
          </div>
          {!calc.profitable && (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Need {calc.impliedOddsNeeded}% extra equity from implied odds
            </div>
          )}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Draw Odds Calculator failed to load: {err.message}</div>;
  }
}

export default DrawOddsCalculator;
