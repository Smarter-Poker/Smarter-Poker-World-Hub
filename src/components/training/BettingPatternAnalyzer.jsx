/**
 * BettingPatternAnalyzer — Common Villain Betting Pattern Explorer
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Identify and exploit common betting patterns. Learn what different
 * bet sizes and lines typically represent.
 */
import React, { useState } from 'react';

const PATTERNS = [
  {
    name: 'Min-Bet / Small Sizing',
    line: 'Villain bets 25-33% pot',
    icon: '·',
    color: '#f59e0b',
    meaning: 'Often indicates: blocking bet, thin value, or weak hand trying to control pot. Rarely a strong hand — strong hands want to build pot.',
    exploit: 'Raise frequently as a bluff. Villain is showing weakness. If they call your raise, they likely have a medium-strength hand — barrel turn.',
    examples: [
      'River min-bet → Usually blocking with showdown value',
      'Flop 25% c-bet → Wide range, many bluffs',
      'Turn small bet after flop check → Delayed weak c-bet',
    ],
  },
  {
    name: 'Overbet (>Pot)',
    line: 'Villain bets 125-200% pot',
    icon: '▲',
    color: '#ef4444',
    meaning: 'Highly polarized — either the nuts or a bluff. Very few medium-strength hands take this line. Recreational players often overbet with the nuts.',
    exploit: 'Defend with your strongest hands and best bluff-catchers. Fold medium hands. Against recs, lean toward calling less (they overbet value). Against regs, call more (they overbet bluff).',
    examples: [
      'River 150% overbet → Nuts or missed draw bluff',
      'Turn pot overbet → Polarized, wants fold or maximum value',
      'Flop overbet on dry board → Trying to deny equity hard',
    ],
  },
  {
    name: 'Check-Raise',
    line: 'Check → Raise after bet',
    icon: '⌁',
    color: '#8b5cf6',
    meaning: 'Very strong in most player pools. At low stakes, check-raise is almost always value-heavy (sets, two pair, strong draws). GTO players balance with bluffs.',
    exploit: 'Against most players, give credit and fold marginal hands. Only continue with top pair+ or strong draws. Against aggressive regs, call down wider.',
    examples: [
      'Flop check-raise → Sets, two pair, big draws (low stakes = value)',
      'Turn check-raise → Very strong, often sets or better',
      'River check-raise → Almost always the nuts (fold one pair)',
    ],
  },
  {
    name: 'Bet-Check-Bet',
    line: 'Bets flop → Checks turn → Bets river',
    icon: '↻',
    color: '#3b82f6',
    meaning: 'Classic pot control or delayed value line. Checking turn suggests medium strength, then river bet could be thin value or a delayed bluff.',
    exploit: 'If villain bets river small, call wide — likely thin value. If villain bets river big, lean toward folding — likely gave up on turn and now value-betting or bluffing polarized.',
    examples: [
      'C-bet flop → check turn → small river bet = thin value',
      'C-bet flop → check turn → big river bet = polarized',
      'This line caps their range — rarely very strong',
    ],
  },
  {
    name: 'Triple Barrel',
    line: 'Bets all three streets',
    icon: '◆',
    color: '#10b981',
    meaning: 'Very strong or very weak. Triple barrels represent either value hands (overpairs+, sets) or committed bluffs (missed draws). Medium hands check at some point.',
    exploit: 'Pay attention to sizing patterns. If sizing increases each street = likely value. If sizing decreases = possibly running out of steam. Call with strong hands, fold weak.',
    examples: [
      'Big-big-big sizing → Nutted hand wanting maximum value',
      'Small-medium-big → Building pot, then polarizing river',
      'Medium-medium-small → Potentially running bluff, weakening',
    ],
  },
  {
    name: 'Limp-Raise (Preflop)',
    line: 'Limp → Raise after someone opens',
    icon: '◆',
    color: '#ec4899',
    meaning: 'Almost always AA or KK. This is one of the most reliable tells in poker. Recreational players limp-raise with premium pairs to trap.',
    exploit: 'Fold everything except QQ+ and AKs. If you have AA/KK, play for stacks. Dont try to outplay a limp-raiser — they have it.',
    examples: [
      'Limp UTG → 3-bet over raise → AA/KK 95% of time',
      'Limp from any position → big raise = monster trap',
      'Only balanced regs limp-raise with bluffs (rare)',
    ],
  },
];

function BettingPatternAnalyzer() {
  const [selected, setSelected] = useState(0);

  const pattern = PATTERNS[selected];

  try {
    return (
      <div style={{ padding: 20, background: 'rgba(0,0,0,0.3)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, color: '#fbbf24' }}>Betting Pattern Analyzer</h3>

        {/* Pattern Selector */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {PATTERNS.map((p, i) => (
            <button key={p.name} onClick={() => setSelected(i)} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              background: selected === i ? p.color : 'rgba(255,255,255,0.06)',
              color: selected === i ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none',
            }}>{p.icon} {p.name}</button>
          ))}
        </div>

        {/* Pattern Header */}
        <div style={{ padding: 14, background: `${pattern.color}10`, borderRadius: 10, border: `1px solid ${pattern.color}25`, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>{pattern.icon}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: pattern.color }}>{pattern.name}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{pattern.line}</div>
        </div>

        {/* What it means */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12, borderLeft: `4px solid ${pattern.color}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: pattern.color, marginBottom: 4 }}>What It Means</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{pattern.meaning}</div>
        </div>

        {/* How to exploit */}
        <div style={{ padding: 12, background: 'rgba(16,185,129,0.06)', borderRadius: 8, marginBottom: 12, borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>How to Exploit</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{pattern.exploit}</div>
        </div>

        {/* Examples */}
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Common Examples</div>
          {pattern.examples.map((ex, i) => (
            <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', padding: '4px 0', borderBottom: i < pattern.examples.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
              {ex}
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Betting Pattern Analyzer failed to load: {err.message}</div>;
  }
}

export default BettingPatternAnalyzer;
