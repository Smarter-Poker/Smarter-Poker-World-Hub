/**
 * ImpliedOddsCalculator — Calculate Implied & Reverse Implied Odds
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Calculate how much you need to win on future streets to justify a call.
 * Covers both implied odds and reverse implied odds.
 */
import React, { useState, useMemo } from 'react';

function ImpliedOddsCalculator() {
  const [pot, setPot] = useState(10);
  const [bet, setBet] = useState(7);
  const [outs, setOuts] = useState(9);
  const [stack, setStack] = useState(100);
  const [street, setStreet] = useState('flop');

  const calc = useMemo(() => {
    const cardsLeft = street === 'flop' ? 47 : 46;
    const streetsLeft = street === 'flop' ? 2 : 1;
    const rawEquity = streetsLeft === 2
      ? 1 - ((cardsLeft - outs) / cardsLeft) * ((cardsLeft - 1 - outs) / (cardsLeft - 1))
      : outs / cardsLeft;
    const eqPct = Math.round(rawEquity * 1000) / 10;

    const callAmount = bet;
    const potAfterCall = pot + bet + callAmount;
    const directOdds = callAmount / (potAfterCall);
    const directPct = Math.round(directOdds * 1000) / 10;

    const needToWin = callAmount / rawEquity - potAfterCall;
    const impliedNeeded = Math.max(0, Math.round(needToWin * 10) / 10);

    const canRealize = impliedNeeded <= (stack - callAmount);
    const impliedPotOdds = Math.round((callAmount / (potAfterCall + impliedNeeded)) * 1000) / 10;

    // Reverse implied odds
    const reverseImplied = rawEquity < 0.3 && outs <= 6;

    return { eqPct, directPct, impliedNeeded, canRealize, potAfterCall, callAmount, rawEquity, impliedPotOdds, reverseImplied };
  }, [pot, bet, outs, stack, street]);

  const profitableWithoutImplied = calc.eqPct >= calc.directPct;

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#10b981' }}>Implied Odds Calculator</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {['flop', 'turn'].map(s => (
            <button key={s} onClick={() => setStreet(s)} style={{
              flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: street === s ? '#10b981' : 'rgba(255,255,255,0.06)',
              color: street === s ? '#000' : 'rgba(255,255,255,0.5)',
              fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
            }}>{s} ({s === 'flop' ? '2 cards to come' : '1 card to come'})</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Pot', value: pot, set: setPot, min: 2, max: 100, step: 1, color: '#10b981', display: `${pot} bb` },
            { label: 'Bet Size', value: bet, set: setBet, min: 1, max: 100, step: 1, color: '#ef4444', display: `${bet} bb` },
            { label: 'Outs', value: outs, set: setOuts, min: 1, max: 20, step: 1, color: '#3b82f6', display: `${outs}` },
            { label: 'Eff Stack', value: stack, set: setStack, min: 20, max: 300, step: 5, color: '#f59e0b', display: `${stack} bb` },
          ].map(s => (
            <div key={s.label} style={{ padding: 6, background: 'rgba(255,255,255,0.03)', borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(parseFloat(e.target.value))} style={{ width: '100%', accentColor: s.color }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.display}</div>
            </div>
          ))}
        </div>

        {/* Results */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: 10, background: 'rgba(59,130,246,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Your Equity</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#3b82f6' }}>{calc.eqPct}%</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(239,68,68,0.06)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Price to Call</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>{calc.directPct}%</div>
          </div>
          <div style={{ padding: 10, background: profitableWithoutImplied ? 'rgba(16,185,129,0.08)' : 'rgba(249,115,22,0.08)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Direct Odds</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: profitableWithoutImplied ? '#10b981' : '#f97316' }}>
              {profitableWithoutImplied ? 'Profitable!' : 'Need Implied'}
            </div>
          </div>
        </div>

        {/* Implied odds needed */}
        <div style={{ padding: 14, borderRadius: 10, marginBottom: 16, textAlign: 'center', background: calc.canRealize ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${calc.canRealize ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          {profitableWithoutImplied ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>Direct call is profitable!</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Implied odds are a bonus — you have the direct odds to call.</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Need to win on later streets:</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: calc.canRealize ? '#10b981' : '#ef4444' }}>{calc.impliedNeeded} bb</div>
              <div style={{ fontSize: 11, color: calc.canRealize ? '#10b981' : '#ef4444', marginTop: 4, fontWeight: 600 }}>
                {calc.canRealize ? `Achievable — ${Math.round(calc.impliedNeeded / (stack - calc.callAmount) * 100)}% of remaining stack` : 'NOT achievable — would need more than effective stack!'}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.12)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Implied Odds Tips</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
            {outs >= 12 ? 'Monster draw — call even without great implied odds. You have enough direct equity.' :
             outs >= 8 ? 'Strong draw — need moderate implied odds. Call if you can win ~2x your call on later streets.' :
             outs >= 4 ? 'Moderate draw — need good implied odds. Only call deep-stacked vs likely payoffs.' :
             'Weak draw — need massive implied odds. Usually fold unless very deep and opponents will pay off.'}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Implied Odds Calculator failed to load: {err.message}</div>;
  }
}

export default ImpliedOddsCalculator;
